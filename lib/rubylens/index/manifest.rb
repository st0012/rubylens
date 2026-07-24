# frozen_string_literal: true

require "bundler"
require "bundler/lockfile_parser"
require "pathname"
require "set"
require_relative "../dependency_warning"
require_relative "git_package_source"

module RubyLens
  module Index
    class Manifest
      Package = Data.define(:name, :version, :role, :location, :root, :files)
      DependencySystem = Data.define(:id, :package_indexes, :label_package_index)

      GIT_SKIP_REASONS = DependencyWarning::REASONS

      attr_reader :root, :files, :workspace_files, :packages, :dependency_systems, :warnings, :dependency_warnings

      def self.build(root:, lockfile: nil)
        new(root: root, lockfile: lockfile).tap(&:build)
      end

      def initialize(root:, lockfile: nil)
        @root = Pathname(root).expand_path.realpath
        @lockfile = Pathname(lockfile || @root.join("Gemfile.lock")).expand_path
        @git_package_source = GitPackageSource.new(lockfile: @lockfile)
        @warnings = []
        @dependency_warnings = []
        @packages = []
        @dependency_systems = []
        @package_roots = []
        @package_index_by_file = {}
        @package_index_cache = {}
        @relative_workspace_path_cache = {}
        @workspace_path_cache = {}
      end

      def build
        @workspace_files = GitRepository.new(@root).selected_files.freeze
        @workspace_file_set = @workspace_files.to_set
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
        @package_index_by_file.fetch(path) do
          @package_index_cache.fetch(path) do
            @package_index_cache[path] = uncached_package_index_for(path)
          end
        end
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        nil
      end

      def workspace_path?(path)
        path = path.to_s
        @workspace_path_cache.fetch(path) do
          @workspace_path_cache[path] = Paths.inside?(path, @root)
        end
      end

      def relative_workspace_path(path)
        path = path.to_s
        @relative_workspace_path_cache.fetch(path) do
          @relative_workspace_path_cache[path] = uncached_relative_workspace_path(path)
        end
      end

      private

      # Workspace files are enumerated as realpaths, so known files relativize with
      # string arithmetic; unknown paths still resolve symlinks and must land inside
      # the workspace to count as workspace-relative.
      def uncached_relative_workspace_path(path)
        return path.delete_prefix("#{@root}#{File::SEPARATOR}") if @workspace_file_set&.include?(path)

        resolved = Pathname(path).realpath
        return unless Paths.inside?(resolved, @root)

        resolved.relative_path_from(@root).to_s
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP, ArgumentError
        nil
      end

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
        locked_specs = parser.specs.uniq { |specification| [specification.name, specification.version.to_s] }
          .reject { |locked| excluded_names.include?(locked.name) }
        built = locked_specs.filter_map do |locked|
          source = locked.source
          package = package_for(locked, direct_names)
          [package, source] if package
        end
        @packages = built.map(&:first)
        build_dependency_systems(built)
      rescue Bundler::LockfileError, Errno::EACCES => error
        @warnings << "Gemfile.lock could not be read: #{error.class}."
      end

      def package_for(locked, direct_names)
        source = source_type(locked)
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
        resolution = @git_package_source.resolve(locked)
        return skip_git_dependency(locked, resolution) if resolution.is_a?(Symbol)

        Package.new(
          name: locked.name,
          version: locked.version.to_s,
          role: role,
          location: "external",
          root: resolution.root,
          files: resolution.files,
        )
      end

      def skip_git_dependency(locked, reason_code)
        reason = GIT_SKIP_REASONS.fetch(reason_code)
        @warnings << "Skipped #{locked.name} #{locked.version}: #{reason}."
        @dependency_warnings << { "name" => locked.name, "reason" => reason }.freeze
        nil
      end

      def build_dependency_systems(built)
        packages_by_source = identity_hash
        built.each_with_index do |(_package, source), index|
          packages_by_source[source] << index if source_type_for(source) == "git"
        end
        groups = packages_by_source.values.select { |indexes| indexes.length > 1 }
          .sort_by { |indexes| dependency_system_signature(indexes) }
        @dependency_systems = groups.each_with_index.map do |indexes, id|
          package_indexes = indexes.sort_by { |index| package_sort_key(index) }.freeze
          direct_indexes = package_indexes.select { |index| @packages.fetch(index).role == "direct" }
          label_candidates = direct_indexes.empty? ? package_indexes : direct_indexes
          label_index = direct_indexes.one? ? direct_indexes.first : label_candidates.min_by { |index| package_sort_key(index) }
          DependencySystem.new(id:, package_indexes:, label_package_index: label_index)
        end.freeze
      end

      def dependency_system_signature(indexes)
        indexes.map { |index| package_sort_key(index).first(2) }.sort
      end

      def package_sort_key(index)
        package = @packages.fetch(index)
        [package.name, package.version, index]
      end

      def source_type(locked)
        source_type_for(locked.source)
      end

      def source_type_for(source)
        source.class.name.split("::").last.downcase
      end

      def identity_hash
        {}.compare_by_identity.tap { |hash| hash.default_proc = ->(records, source) { records[source] = [] } }
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

      # Walks an already-canonical directory (the caller resolved and containment-checked
      # it) without re-resolving every entry: descending only non-symlink directories
      # keeps each joined path canonical, so regular files join the list with a cheap
      # prefix containment check and only symlinked entries pay for a realpath. Symlinked
      # directories are never descended, matching Find.find's lstat-based traversal.
      def enumerate(path, root)
        return [path.to_s] if path.file? && indexable?(path) && Paths.inside?(path.realpath, root)
        return [] unless path.directory?
        return [] if path.symlink?

        files = []
        root_prefix = "#{root}#{File::SEPARATOR}"
        pending = [path.to_s]
        while (directory = pending.pop)
          entries = begin
            Dir.children(directory)
          rescue Errno::ENOENT, Errno::EACCES, Errno::ENOTDIR, Errno::ELOOP, Errno::ENAMETOOLONG, Errno::EINVAL
            next
          end
          entries.each do |entry|
            candidate = File.join(directory, entry)
            stat = begin
              File.lstat(candidate)
            rescue Errno::ENOENT, Errno::EACCES, Errno::ENOTDIR, Errno::ELOOP, Errno::ENAMETOOLONG, Errno::EINVAL
              next
            end
            if stat.symlink?
              next if File.directory?(candidate)
              next unless INDEXABLE_EXTENSIONS.include?(File.extname(entry))

              begin
                resolved = File.realpath(candidate)
                files << resolved if Paths.inside?(resolved, root)
              rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP
                next
              end
            elsif stat.directory?
              pending << candidate
            elsif INDEXABLE_EXTENSIONS.include?(File.extname(entry))
              files << candidate if candidate.start_with?(root_prefix)
            end
          end
        end
        files
      end

      def indexable?(path)
        INDEXABLE_EXTENSIONS.include?(path.extname)
      end
    end
  end
end
