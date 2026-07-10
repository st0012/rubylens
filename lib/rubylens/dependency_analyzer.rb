# frozen_string_literal: true

require "bundler"
require "bundler/lockfile_parser"
require "pathname"
require "set"

module RubyLens
  class DependencyAnalyzer
    ROLE_PRECEDENCE = %w[direct_runtime direct_development bundle_only transitive].freeze
    RUNTIME_USE = {
      "status" => "unproven",
      "reason" => "Graph#index_workspace eagerly indexes locked packages; presence in the graph is not evidence that application runtime code requires the package.",
    }.freeze

    def initialize(target_root:, target_lockfile:, raw_ledger:, exact_origins:)
      @target_root = File.realpath(target_root)
      @target_lockfile = target_lockfile && File.expand_path(target_lockfile)
      @raw_ledger = raw_ledger
      @exact_origins = exact_origins
      @issues = []
    end

    def run
      unless @target_lockfile && File.file?(@target_lockfile)
        return {
          "status" => "unavailable",
          "issues" => ["target-only lockfile was not supplied or does not exist"],
          "runtime_use" => RUNTIME_USE,
        }
      end

      parser = Bundler::LockfileParser.new(File.read(@target_lockfile))
      root = root_dependency_metadata
      direct = direct_dependency_metadata(root)
      target_records = @raw_ledger.fetch("records").select { |record| record["scope"] == "target_dependency" }
      tooling_records = @raw_ledger.fetch("records").select { |record| record["scope"] == "tooling" }
      packages = package_records(parser, target_records, root, direct)
      tooling_packages = grouped_ledger_records(tooling_records).map do |(name, version), records|
        package_from_ledger(name, version, records, role: "tooling", location_scope: "tooling")
      end
      dependencies = packages.reject { |package| package["self_package"] }
      external = dependencies.select { |package| package["location_scope"] == "external_rubygems" }
      observed_external = external.select { |package| package.dig("rubydex_observation", "documents").to_i.positive? }
      require_roots = require_root_coverage(target_records + tooling_records)
      locked_names = packages.map { |package| package.fetch("name") }.to_set
      declared_names = (
        root.fetch("runtime_names") + root.fetch("development_names") +
        direct.fetch("dependencies").map { |dependency| dependency.fetch("name") }
      ).uniq.to_set
      declared_not_locked = (declared_names - locked_names).to_a.sort

      {
        "status" => @issues.empty? ? "complete" : "partial",
        "issues" => @issues,
        "methodology" => {
          "package_identity" => "name and version; platform variants remain nested under one package",
          "role_precedence" => ROLE_PRECEDENCE,
          "direct_runtime" => "runtime dependencies declared by root gemspecs",
          "direct_development" => "development dependencies declared by root gemspecs",
          "bundle_only" => "direct Gemfile/lock dependency not declared by a root gemspec",
          "transitive" => "locked target package not directly declared",
          "observation" => "exact external gem origin document counts from the full RubyDex snapshot",
          "relative_require_path_field" => "has_relative_require_path_string does not prove that the directory exists or contains indexable files",
        },
        "runtime_use" => RUNTIME_USE,
        "summary" => {
          "target_spec_records" => target_records.length,
          "target_unique_packages_including_self" => packages.length,
          "dependency_unique_packages_excluding_self" => dependencies.length,
          "tooling_spec_records" => tooling_records.length,
          "tooling_unique_packages" => tooling_packages.length,
          "by_primary_role" => tally(dependencies) { |package| package.fetch("primary_role") },
          "by_location_scope" => tally(dependencies) { |package| package.fetch("location_scope") },
          "external_rubygems_packages" => external.length,
          "external_packages_with_rubydex_documents" => observed_external.length,
          "external_packages_without_rubydex_documents" => external.length - observed_external.length,
        },
        "direct_evaluation" => direct.merge(
          "declared_but_not_locked_for_selected_platforms" => declared_not_locked,
        ),
        "require_root_coverage" => require_roots,
        "packages" => dependencies,
        "self_packages" => packages.select { |package| package["self_package"] },
        "tooling_packages" => tooling_packages,
        "external_packages_without_documents" => external.reject do |package|
          package.dig("rubydex_observation", "documents").to_i.positive?
        end,
      }
    rescue StandardError => error
      {
        "status" => "unavailable",
        "issues" => ["#{error.class}: #{sanitize(error.message)}"],
        "runtime_use" => RUNTIME_USE,
      }
    end

    private

    def root_dependency_metadata
      gemspec_paths = Dir.glob(File.join(@target_root, "*.gemspec")).sort
      specifications = gemspec_paths.filter_map do |path|
        Dir.chdir(@target_root) { Gem::Specification.load(path) }
      rescue StandardError => error
        @issues << "failed to evaluate #{File.basename(path)}: #{sanitize(error.message)}"
        nil
      end
      {
        "gemspecs" => gemspec_paths.map { |path| File.basename(path) },
        "self_names" => specifications.map(&:name).uniq.sort,
        "runtime_names" => specifications.flat_map(&:runtime_dependencies).map(&:name).uniq.sort,
        "development_names" => specifications.flat_map(&:development_dependencies).map(&:name).uniq.sort,
      }
    end

    def direct_dependency_metadata(root)
      gemfile = File.join(@target_root, "Gemfile")
      evaluated = []
      evaluation_error = nil
      if File.file?(gemfile)
        begin
          dsl = Dir.chdir(@target_root) { Bundler::Dsl.evaluate(gemfile, nil, {}) }
          evaluated = dsl.dependencies.map do |dependency|
            {
              "name" => dependency.name,
              "groups" => dependency.groups.map(&:to_s).sort,
              "platforms" => dependency.platforms.map(&:to_s).sort,
              "autorequire" => Array(dependency.autorequire).map(&:to_s),
            }
          end
        rescue StandardError => error
          evaluation_error = "#{error.class}: #{sanitize(error.message)}"
          @issues << "Gemfile evaluation failed: #{evaluation_error}"
        end
      else
        @issues << "target has no Gemfile"
      end

      {
        "gemfile" => File.file?(gemfile) ? "Gemfile" : nil,
        "gemspecs" => root.fetch("gemspecs"),
        "evaluation_error" => evaluation_error,
        "dependencies" => evaluated.sort_by { |dependency| dependency.fetch("name") },
      }
    end

    def package_records(parser, target_records, root, direct)
      specifications = parser.specs.group_by { |specification| [specification.name, specification.version.to_s] }
      ledger = grouped_ledger_records(target_records)
      direct_names = direct.fetch("dependencies").map { |dependency| dependency.fetch("name") }.to_set
      direct_names.merge(parser.dependencies.keys) if direct_names.empty?
      runtime = root.fetch("runtime_names").to_set
      development = root.fetch("development_names").to_set
      self_names = root.fetch("self_names").to_set

      (specifications.keys | ledger.keys).sort.map do |name, version|
        specs = specifications.fetch([name, version], [])
        records = ledger.fetch([name, version], [])
        roles = []
        roles << "direct_runtime" if runtime.include?(name)
        roles << "direct_development" if development.include?(name)
        roles << "bundle_only" if direct_names.include?(name) && roles.empty? && !self_names.include?(name)
        roles << "transitive" if roles.empty? && !self_names.include?(name)
        primary_role = roles.min_by { |role| ROLE_PRECEDENCE.index(role) || ROLE_PRECEDENCE.length }
        location_scope = location_scope(specs)
        package_from_ledger(
          name,
          version,
          records,
          role: primary_role,
          roles: roles,
          location_scope: location_scope,
          platforms: specs.map { |specification| specification.platform.to_s },
          self_package: self_names.include?(name),
          direct_metadata: direct.fetch("dependencies").select { |dependency| dependency["name"] == name },
        )
      end
    end

    def package_from_ledger(name, version, records, role:, location_scope:, roles: [role], platforms: [], self_package: false, direct_metadata: [])
      origin = @exact_origins.fetch("gem:#{name}@#{version}", nil)
      tooling_origin = @exact_origins.fetch("tooling_gem:#{name}@#{version}", nil)
      observation = origin || tooling_origin || { "documents" => 0, "definitions" => 0, "declarations" => 0 }
      {
        "name" => name,
        "version" => version,
        "platforms" => (platforms + records.map { |record| record.fetch("locked_platform") }).uniq.sort,
        "spec_record_count" => records.length,
        "primary_role" => role,
        "roles" => roles.compact,
        "location_scope" => location_scope,
        "self_package" => self_package,
        "ledger_statuses" => records.map { |record| record.fetch("status") }.uniq.sort,
        "source_types" => records.map { |record| record.fetch("source_type") }.uniq.sort,
        "has_relative_require_path_string" => records.any? { |record| record["has_indexable_require_path"] },
        "direct_declarations" => direct_metadata,
        "rubydex_observation" => {
          "documents" => observation.fetch("documents", 0),
          "definitions" => observation.fetch("definitions", 0),
          "declarations" => observation.fetch("declarations", 0),
          "observed" => observation.fetch("documents", 0).positive?,
        },
        "runtime_use" => RUNTIME_USE,
      }
    end

    def grouped_ledger_records(records)
      records.group_by { |record| [record.fetch("name"), record.fetch("locked_version")] }
    end

    def location_scope(specifications)
      return "unknown" if specifications.empty?

      scopes = specifications.map do |specification|
        source = specification.source
        if defined?(Bundler::Source::Git) && source.is_a?(Bundler::Source::Git)
          next "external_git"
        end
        next "external_rubygems" unless source.is_a?(Bundler::Source::Path)

        configured_path = source.respond_to?(:options) && (source.options["path"] || source.options[:path])
        next "local_path" unless configured_path

        expanded = File.expand_path(configured_path, File.dirname(@target_lockfile))
        Paths.inside?(expanded, @target_root) ? "workspace" : "local_path"
      end.uniq
      scopes.length == 1 ? scopes.first : "mixed"
    rescue StandardError
      "unknown"
    end

    def require_root_coverage(records)
      expected_packages = records.select { |record| record.fetch("relative_require_paths").any? }
        .map { |record| "#{record.fetch("name")}@#{record.fetch("installed_version_used_by_rubydex")}" }
        .reject { |package| package.end_with?("@") }.uniq.to_set
      materialized_packages = Set.new
      roots = records.flat_map do |record|
        version = record.fetch("installed_version_used_by_rubydex")
        next [] unless version

        specification = Gem::Specification.find_all_by_name(record.fetch("name"))
          .find { |candidate| candidate.version.to_s == version }
        next [] unless specification
        materialized_packages << "#{record.fetch("name")}@#{version}"

        record.fetch("relative_require_paths").map do |relative_path|
          absolute = File.join(specification.full_gem_path, relative_path)
          exists = File.directory?(absolute)
          {
            "package" => "#{record.fetch("name")}@#{version}",
            "scope" => record.fetch("scope"),
            "path" => safe_require_root(specification, relative_path),
            "exists" => exists,
            "contains_indexable_file" => exists && Dir.glob(File.join(absolute, "**", "*.{rb,rake,rbs,ru}"), File::FNM_DOTMATCH).any?,
          }
        end
      rescue StandardError => error
        @issues << "require root audit failed for #{record["name"]}: #{sanitize(error.message)}"
        []
      end.uniq { |root| [root["package"], root["scope"], root["path"]] }
      missing = roots.reject { |root| root.fetch("exists") }
      empty = roots.select { |root| root.fetch("exists") && !root.fetch("contains_indexable_file") }
      unmaterialized = (expected_packages - materialized_packages).to_a.sort
      @issues << "#{missing.length} declared relative require root(s) do not exist" if missing.any?
      @issues << "require root audit unavailable for: #{unmaterialized.join(", ")}" if unmaterialized.any?
      {
        "audit_environment" => "Must run inside the exact target overlay bundle so locked gem specifications can be materialized.",
        "checked_unique_roots" => roots.length,
        "existing_unique_roots" => roots.length - missing.length,
        "missing_unique_roots" => missing.length,
        "existing_roots_without_indexable_files" => empty.length,
        "unmaterialized_packages" => unmaterialized,
        "missing" => missing,
        "without_indexable_files" => empty,
      }
    end

    def safe_require_root(specification, relative_path)
      if Paths.inside?(specification.full_gem_path, @target_root)
        workspace_relative = Pathname(specification.full_gem_path).relative_path_from(Pathname(@target_root)).to_s
        File.join("<workspace>", workspace_relative == "." ? "" : workspace_relative, relative_path)
      else
        File.join("gem:#{specification.name}@#{specification.version}", relative_path)
      end
    end

    def tally(records)
      records.each_with_object(Hash.new(0)) { |record, counts| counts[yield(record)] += 1 }
        .sort_by { |key, count| [-count, key.to_s] }.to_h
    end

    def sanitize(message)
      message.to_s.gsub(@target_root, "<workspace>")
        .gsub(Dir.home, "~")
        .gsub(%r{(?<![\w:])/(?:[^/\s:]+/)*[^/\s:]+}, "<absolute-path>")
    end
  end
end
