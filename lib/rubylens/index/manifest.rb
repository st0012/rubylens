# frozen_string_literal: true

require "bundler"
require "bundler/lockfile_parser"
require "find"
require "pathname"
require "set"
require_relative "../dependency_warning"

module RubyLens
  module Index
    class Manifest
      Package = Data.define(:name, :version, :role, :location, :root, :files)
      GIT_SKIP_REASONS = DependencyWarning::REASONS

      attr_reader :root, :files, :workspace_files, :packages, :warnings, :dependency_warnings

      def self.build(root:, lockfile: nil)
        new(root: root, lockfile: lockfile).tap(&:build)
      end

      def initialize(root:, lockfile: nil)
        @root = Pathname(root).expand_path.realpath
        @lockfile = Pathname(lockfile || @root.join("Gemfile.lock")).expand_path
        @warnings = []
        @dependency_warnings = []
        @packages = []
        @package_roots = []
        @package_index_by_file = {}
        @package_index_cache = {}
        @relative_workspace_path_cache = {}
        @git_spec_indexes = {}.compare_by_identity
      end

      def build
        @workspace_files = GitRepository.new(@root).selected_files.freeze
        build_packages
        @package_roots = @packages.each_with_index.map { |package, index| [package.root, index] }
          .sort_by do |package_root, index|
            package = @packages.fetch(index)
            [-package_root.to_s.length, package.name, package.version, index]
          end
        build_package_index
        @files = (@workspace_files + @packages.flat_map(&:files)).uniq.freeze
        @dependency_warnings.sort_by! { |warning| [warning.fetch("name"), warning.fetch("reason")] }
        @dependency_warnings.freeze
        self
      end

      def package_index_for(path)
        path = path.to_s
        return @package_index_by_file[path] if @package_index_by_file.key?(path)
        return @package_index_cache[path] if @package_index_cache.key?(path)

        @package_index_cache[path] = uncached_package_index_for(path)
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        nil
      end

      def workspace_path?(path)
        Paths.inside?(path, @root)
      end

      def relative_workspace_path(path)
        path = path.to_s
        return @relative_workspace_path_cache[path] if @relative_workspace_path_cache.key?(path)

        @relative_workspace_path_cache[path] = Pathname(path).realpath.relative_path_from(@root).to_s
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP, ArgumentError
        nil
      end

      private

      def build_package_index
        package_index_by_file = {}
        @package_roots.each do |_package_root, index|
          @packages.fetch(index).files.each do |path|
            path = path.to_s
            package_index_by_file[path] = index unless package_index_by_file.key?(path)
          end
        end
        @workspace_files.each do |path|
          path = path.to_s
          package_index_by_file[path] = nil unless package_index_by_file.key?(path)
        end
        @package_index_by_file = package_index_by_file.freeze
      end

      def uncached_package_index_for(path)
        resolved = Pathname(path).expand_path
        resolved = resolved.realpath if resolved.exist?
        resolved_path = resolved.to_s
        return @package_index_by_file[resolved_path] if @package_index_by_file.key?(resolved_path)

        entry = @package_roots.find { |package_root, _index| Paths.inside?(resolved, package_root) }
        entry&.last
      end

      def build_packages
        unless @lockfile.file?
          @warnings << "No Gemfile.lock found; dependency systems were omitted."
          return
        end

        parser = Bundler::LockfileParser.new(@lockfile.read)
        direct_names = parser.dependencies.keys.to_set
        excluded_names = tool_only_dependency_names(parser, direct_names)
        parser.specs.uniq { |specification| [specification.name, specification.version.to_s] }.each do |locked|
          next if excluded_names.include?(locked.name)

          package = package_for(locked, direct_names)
          @packages << package if package
        end
      rescue Bundler::LockfileError, Errno::EACCES => error
        @warnings << "Gemfile.lock could not be read: #{error.class}."
      end

      def package_for(locked, direct_names)
        source = locked.source.class.name.split("::").last.downcase
        role = direct_names.include?(locked.name) ? "direct" : "transitive"
        if source == "path"
          return local_package(locked)
        end
        if source == "git"
          return git_package(locked, role)
        end
        unless source == "rubygems"
          @warnings << "Skipped #{locked.name} #{locked.version}: #{source} dependencies are not indexed yet."
          return nil
        end

        specification = installed_specification(locked)
        unless specification
          @warnings << "Skipped #{locked.name} #{locked.version}: exact installed gem not found."
          return nil
        end

        root = Pathname(specification.full_gem_path).realpath
        files = indexable_files(root, specification.require_paths)
        Package.new(
          name: locked.name,
          version: locked.version.to_s,
          role: role,
          location: "external",
          root: root,
          files: files.freeze,
        )
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
        @warnings << "Skipped #{locked.name} #{locked.version}: #{error.class}."
        nil
      end

      def git_package(locked, role)
        source = locked.source
        return skip_git_dependency(locked, :local_only_required) if source.allow_git_ops?

        checkout = git_checkout_path(source)
        return skip_git_dependency(locked, :checkout_unavailable) unless checkout.directory?

        checkout = checkout.realpath
        specification = (@git_spec_indexes[source] ||= git_specifications(source, checkout)).search(locked).first
        return skip_git_dependency(locked, :specification_unavailable) unless specification

        root = Pathname(specification.full_gem_path).realpath
        return skip_git_dependency(locked, :unsafe_specification_root) unless Paths.inside?(root, checkout)

        files = indexable_files(root, specification.require_paths)
        return skip_git_dependency(locked, :no_indexable_files) if files.empty?

        Package.new(
          name: locked.name,
          version: locked.version.to_s,
          role: role,
          location: "external",
          root: root,
          files: files.freeze,
        )
      rescue Bundler::BundlerError, Gem::Exception
        skip_git_dependency(locked, :specification_unreadable)
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        skip_git_dependency(locked, :checkout_unavailable)
      end

      def git_checkout_path(source)
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

      def git_specifications(source, checkout)
        source.__send__(:set_install_path!, checkout)
        source.specs
      end

      def skip_git_dependency(locked, reason_code)
        reason = GIT_SKIP_REASONS.fetch(reason_code)
        @warnings << "Skipped #{locked.name} #{locked.version}: #{reason}."
        @dependency_warnings << { "name" => locked.name, "reason" => reason }.freeze
        nil
      end

      def local_package(locked)
        source_path = locked.source.respond_to?(:path) ? locked.source.path : nil
        unless source_path
          @warnings << "Skipped #{locked.name} #{locked.version}: local source path is unavailable."
          return nil
        end

        root = Pathname(source_path.to_s)
        root = @lockfile.dirname.join(root) unless root.absolute?
        root = root.realpath
        unless Paths.inside?(root, @root)
          @warnings << "Skipped #{locked.name} #{locked.version}: local dependency is outside the project."
        end
        nil
      end

      def tool_only_dependency_names(parser, direct_names)
        return Set.new unless direct_names.include?("rubylens")

        dependencies = parser.specs.each_with_object(Hash.new { |hash, name| hash[name] = Set.new }) do |specification, graph|
          specification.dependencies.each { |dependency| graph[specification.name] << dependency.name }
        end
        tool_reach = dependency_reach("rubylens", dependencies)
        project_reach = (direct_names - ["rubylens"]).each_with_object(Set.new) do |root, names|
          names.merge(dependency_reach(root, dependencies))
        end
        tool_reach - project_reach
      end

      def dependency_reach(root, dependencies)
        visited = Set.new
        pending = [root]
        until pending.empty?
          name = pending.pop
          next unless visited.add?(name)

          pending.concat(dependencies.fetch(name, []).to_a)
        end
        visited
      end

      def installed_specification(locked)
        candidates = Gem::Specification.find_all_by_name(locked.name, "= #{locked.version}")
        platform = locked.platform.to_s
        candidates.find { |candidate| candidate.platform.to_s == platform } ||
          candidates.find { |candidate| candidate.platform.to_s == Gem::Platform.local.to_s } ||
          candidates.find { |candidate| candidate.platform.to_s == "ruby" } ||
          candidates.first
      end

      def indexable_files(root, require_paths)
        require_paths.filter_map do |relative_path|
          next if File.absolute_path?(relative_path)

          candidate = root.join(relative_path)
          next unless candidate.exist?

          resolved = candidate.realpath
          next unless Paths.inside?(resolved, root)

          resolved
        rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
          nil
        end.flat_map { |path| enumerate(path, root) }.uniq.sort
      end

      def enumerate(path, root)
        return [path.to_s] if path.file? && indexable?(path) && Paths.inside?(path.realpath, root)
        return [] unless path.directory?

        files = []
        Find.find(path) do |candidate|
          candidate = Pathname(candidate)
          next if candidate.directory?
          next unless indexable?(candidate)

          resolved = candidate.realpath
          files << resolved.to_s if Paths.inside?(resolved, root)
        rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
          next
        end
        files
      end

      def indexable?(path)
        GitRepository::INDEXABLE_EXTENSIONS.include?(path.extname)
      end
    end
  end
end
