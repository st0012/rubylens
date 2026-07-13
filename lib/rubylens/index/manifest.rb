# frozen_string_literal: true

require "bundler"
require "bundler/lockfile_parser"
require "find"
require "pathname"
require "set"
require_relative "../configuration"
require_relative "../rails_framework"
require_relative "boundaries"

module RubyLens
  module Index
    class Manifest
      Package = Data.define(:name, :version, :role, :location, :root, :files)
      RailsReference = Data.define(:version, :members, :scope)

      attr_reader :root, :files, :workspace_files, :tracked_workspace_files, :packages, :rails_reference, :warnings, :boundaries

      def self.build(root:, lockfile: nil, configuration: Configuration.resolve(root: root))
        new(root: root, lockfile: lockfile, configuration: configuration).tap(&:build)
      end

      def initialize(root:, lockfile: nil, configuration: Configuration.resolve(root: root))
        @root = Pathname(root).expand_path.realpath
        @lockfile = Pathname(lockfile || @root.join("Gemfile.lock")).expand_path
        @warnings = []
        @configuration = configuration
        @packages = []
        @package_roots = []
        @package_index_by_file = {}
        @package_index_cache = {}
        @relative_workspace_path_cache = {}
      end

      def build
        repository = GitRepository.new(@root)
        @workspace_files = repository.selected_files.freeze
        @tracked_workspace_files = repository.tracked_files.freeze
        @boundaries = Boundaries.build(root: @root, workspace_files: @tracked_workspace_files, configuration: @configuration)
        build_packages
        @package_roots = @packages.each_with_index.map { |package, index| [package.root, index] }
          .sort_by { |package_root, _index| -package_root.to_s.length }
        build_package_index
        @files = (@workspace_files + @packages.flat_map(&:files)).uniq.freeze
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
        build_rails_reference(parser)
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

      def build_rails_reference(parser)
        locked = parser.specs.find { |specification| specification.name == "rails" }
        if locked
          @rails_reference = RailsReference.new(
            version: locked.version.to_s,
            members: locked.dependencies.map(&:name).uniq.sort.freeze,
            scope: "full_family",
          )
          return
        end

        framework_specs = parser.specs.select { |specification| RailsFramework::GEMS.include?(specification.name) }
        railties = framework_specs.find { |specification| specification.name == "railties" }
        return unless railties

        version = railties.version.to_s
        return if framework_specs.any? { |specification| specification.version.to_s != version }

        members = RailsFramework::GEMS.select do |name|
          framework_specs.any? { |specification| specification.name == name }
        end
        return unless RailsFramework::FOOTPRINT_ANCHORS.all? { |name| members.include?(name) }

        @rails_reference = RailsReference.new(version:, members: members.freeze, scope: "installed_footprint")
      end

      def package_for(locked, direct_names)
        source = locked.source.class.name.split("::").last.downcase
        role = direct_names.include?(locked.name) ? "direct" : "transitive"
        if source == "path"
          return local_package(locked)
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
