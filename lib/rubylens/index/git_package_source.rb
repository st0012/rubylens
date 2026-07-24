# frozen_string_literal: true

require "bundler"
require "pathname"
require "set"

module RubyLens
  module Index
    # Resolves a git-sourced lockfile entry into the exact files RubyLens may index.
    #
    # Git checkouts carry more authority than RubyGems packages: the gemspec is
    # code from the checkout that names its own require paths, and the tree may
    # hold symlinks pointing anywhere on disk. Every path here is therefore
    # resolved and re-checked against the canonical package root before it
    # becomes indexable, and any breach ends the package rather than narrowing
    # it, so a partially trusted tree can never contribute files.
    class GitPackageSource
      UnsafeRequirePath = Class.new(StandardError)
      UnsafePackageFile = Class.new(StandardError)

      # Logical roots come from the gemspec and may be symlinked; the canonical
      # root is the resolved directory every indexable file must sit inside.
      PackagePaths = Data.define(
        :logical_root, #: Pathname
        :canonical_root, #: Pathname
        :logical_canonical_root, #: Pathname
      )
      Resolution = Data.define(
        :root, #: Pathname
        :files, #: Array[String]
      )

      # Nix stores gems in immutable, content-addressed store objects, so a
      # checkout symlinked into one is trustworthy even though it resolves
      # outside the bundle directory.
      class NixStoreProvider
        STORE_ROOT = Pathname("/nix/store").freeze
        STORE_OBJECT_PATTERN = /\A[0123456789abcdfghijklmnpqrsvwxyz]{32}-.+\z/

        #: (Pathname | String) -> bool
        def trusted?(path)
          path = Pathname(path).expand_path
          return false unless Paths.inside?(path, STORE_ROOT)

          first_component = path.relative_path_from(STORE_ROOT).each_filename.first
          return false unless first_component

          STORE_OBJECT_PATTERN.match?(first_component)
        end
      end

      #: (lockfile: Pathname) -> void
      def initialize(lockfile:)
        @lockfile = lockfile
        @nix_store_provider = NixStoreProvider.new
        @specification_indexes = {}.compare_by_identity
      end

      # Returns a Resolution, or a Symbol naming why the package was skipped.
      # Callers own how a skip is reported, so every reason surfaces through the
      # same warning vocabulary as the other package sources.
      #
      #: (Bundler::LazySpecification) -> (Resolution | Symbol)
      def resolve(locked)
        source = locked.source
        return :local_only_required if source.allow_git_ops?

        checkout = checkout_path(source)
        return :checkout_unavailable unless checkout.directory?

        index = (@specification_indexes[source] ||= specification_index(source, checkout))
        specification = index.search(locked).first
        return :specification_unavailable unless specification

        paths = package_paths(specification, checkout)
        return :unsafe_specification_root unless paths

        Resolution.new(
          root: paths.canonical_root,
          files: indexable_files(paths, specification.require_paths).freeze,
        )
      rescue UnsafeRequirePath
        :unsafe_require_paths
      rescue UnsafePackageFile
        :unsafe_package_files
      rescue Bundler::BundlerError, Gem::Exception
        :specification_unreadable
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        :checkout_unavailable
      end

      private

      #: (Bundler::Source::Git) -> Pathname
      def checkout_path(source)
        bundle_root = @lockfile.dirname
        app_config = ENV["BUNDLE_APP_CONFIG"]
        app_config_path = if app_config
          Pathname(app_config).expand_path(bundle_root)
        else
          bundle_root.join(".bundle")
        end
        bundle_path = Pathname(Bundler::Settings.new(app_config_path).path.path).expand_path(bundle_root)
        bundle_path.join("bundler/gems", source.extension_dir_name)
      end

      #: (Bundler::Source::Git, Pathname) -> Bundler::Index
      def specification_index(source, checkout)
        source.__send__(:set_install_path!, checkout)
        source.specs
      end

      #: (Gem::Specification, Pathname) -> PackagePaths?
      def package_paths(specification, checkout)
        logical_root = Pathname(specification.full_gem_path).expand_path
        logical_gemspec = Pathname(specification.loaded_from).expand_path
        return unless Paths.inside?(logical_root, checkout)
        return unless logical_gemspec.dirname == logical_root
        return unless logical_gemspec.file? && logical_root.directory?

        canonical_checkout = checkout.realpath
        resolved_gemspec_root = logical_gemspec.realpath.dirname
        logical_canonical_root = logical_root.realpath
        return unless resolved_gemspec_root.directory?

        normal_checkout = !checkout.symlink? &&
          Paths.inside?(resolved_gemspec_root, canonical_checkout) &&
          Paths.inside?(logical_canonical_root, canonical_checkout)
        return unless normal_checkout || @nix_store_provider.trusted?(resolved_gemspec_root)

        PackagePaths.new(
          logical_root: logical_root,
          canonical_root: normal_checkout ? logical_canonical_root : resolved_gemspec_root,
          logical_canonical_root: logical_canonical_root,
        )
      rescue TypeError, ArgumentError
        nil
      end

      #: (PackagePaths, Array[String]) -> Array[String]
      def indexable_files(paths, require_paths)
        logical_require_paths = require_paths.map do |relative_path|
          raise UnsafeRequirePath unless relative_path.is_a?(String)

          relative = Pathname(relative_path)
          raise UnsafeRequirePath if relative.absolute? || relative.each_filename.include?("..")

          candidate = paths.logical_root.join(relative).cleanpath
          raise UnsafeRequirePath unless Paths.inside?(candidate, paths.logical_root)

          candidate
        rescue ArgumentError, EncodingError
          raise UnsafeRequirePath
        end

        files = []
        visited_directories = Set.new
        logical_require_paths.each do |path|
          next unless path.exist? || path.symlink?

          traverse(path, paths, files, visited_directories, Set.new)
        end
        files.uniq.sort
      end

      # Descends one require path. `active_directories` carries the current
      # branch so a symlink cycle raises instead of recursing forever, while
      # `visited_directories` spans the whole walk so a diamond of symlinks is
      # merely skipped.
      #
      #: (Pathname, PackagePaths, Array[String], Set[Pathname], Set[Pathname]) -> void
      def traverse(path, paths, files, visited_directories, active_directories)
        resolved = path.realpath
        if resolved.file?
          raise UnsafePackageFile unless Paths.inside?(resolved, paths.canonical_root)

          files << resolved.to_s if INDEXABLE_EXTENSIONS.include?(path.extname)
          return
        end
        return unless resolved.directory?

        unless Paths.inside?(resolved, paths.logical_canonical_root) || Paths.inside?(resolved, paths.canonical_root)
          raise UnsafePackageFile
        end
        raise UnsafePackageFile if active_directories.include?(resolved)
        return if visited_directories.include?(resolved)

        active_directories.add(resolved)
        begin
          path.children.sort_by(&:to_s).each do |child|
            traverse(child, paths, files, visited_directories, active_directories)
          end
          visited_directories.add(resolved)
        ensure
          active_directories.delete(resolved)
        end
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        raise UnsafePackageFile
      end
    end
  end
end
