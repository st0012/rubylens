# frozen_string_literal: true

require "rubydex"
require "set"
require_relative "../model/dependency_aggregation"
require_relative "rspec_extractor"
require_relative "source_path"

module RubyLens
  module Index
    class RubydexAdapter
      TEST_SEGMENTS = %w[test tests spec specs feature features].freeze

      # Everything the collectors need from one declaration's definitions, gathered in a
      # single pass so each definition's location crosses the Rubydex boundary once.
      DefinitionSummary = Data.define(
        :workspace_count,
        :workspace_relatives,
        :canonical_relatives,
        :canonical_site_keys,
        :package_site_keys,
      )

      def initialize(manifest)
        @manifest = manifest
        @source_path_cache = {}
        @workspace_location_cache = {}
        @indexed_package_document_paths = Set.new
      end

      def index
        graph = Rubydex::Graph.new(workspace_path: @manifest.root.to_s)
        index_errors = graph.index_all(@manifest.files)
        @indexed_package_document_paths = indexed_package_document_paths(graph)
        graph.resolve
        integrity_failures = graph.check_integrity
        collected = collect_declarations(graph.declarations)
        rspec = RSpecExtractor.new(
          graph: graph,
          manifest: @manifest,
          package_document_paths: @indexed_package_document_paths,
        ).call
        workspace = workspace_namespaces(collected.fetch(:workspace_records), rspec.groups)
        inbound_references = inbound_workspace_references(graph, workspace.fetch(:ordinal_by_name))
        category_stats = collected.fetch(:category_stats)
        category_stats.fetch("tests")[0] += rspec.groups.length
        category_stats.fetch("tests")[2] += rspec.method_count

        {
          "schema" => "rubylens.snapshot.v6",
          "project_name" => project_name,
          "components" => workspace.fetch(:component_counts),
          "namespace_names" => workspace.fetch(:namespace_names),
          "namespaces" => build_workspace_rows(workspace, inbound_references),
          "category_stats" => category_stats,
          "dependency_signal_maxima" => collected.fetch(:dependency_aggregation).signal_maxima,
          "packages" => build_package_rows(collected.fetch(:dependency_aggregation)),
          "dependency_systems" => build_dependency_system_rows,
          "dependency_warnings" => @manifest.respond_to?(:dependency_warnings) ? @manifest.dependency_warnings : [],
          "warning_counts" => {
            "manifest" => @manifest.warnings.length,
            "index" => index_errors.length,
            "integrity" => integrity_failures.length,
          },
        }
      end

      private

      def collect_declarations(declarations)
        records = []
        category_stats = { "core" => Array.new(4, 0), "tests" => Array.new(4, 0) }
        aggregation = Model::DependencyAggregation.new(package_count: @manifest.packages.length)

        declarations.each do |declaration|
          next unless model_eligible_declaration?(declaration)

          summary = summarize_definitions(declaration)
          unless summary.canonical_site_keys.empty?
            records << [
              declaration,
              summary.canonical_site_keys.uniq.length,
              scope_from(summary.canonical_relatives),
              component_from(summary.canonical_relatives),
            ]
          end
          collect_category_stat(category_stats, declaration, summary)
          collect_dependency_declaration(aggregation, declaration, summary)
        end

        { workspace_records: records, category_stats:, dependency_aggregation: aggregation }
      end

      def summarize_definitions(declaration)
        namespace = namespace?(declaration)
        workspace_count = 0
        workspace_relatives = []
        canonical_relatives = []
        canonical_site_keys = []
        package_site_keys = {}

        declaration.definitions.each do |definition|
          location = definition.location
          if workspace_location?(location)
            workspace_count += 1
            relative = @manifest.relative_workspace_path(source_path(location.uri))
            workspace_relatives << relative if relative
            if namespace && canonical_namespace_definition?(declaration, definition)
              canonical_site_keys << site_key(location)
              canonical_relatives << relative if relative
            end
          end
          package_index = package_index_for_location(location)
          (package_site_keys[package_index] ||= []) << site_key(location) if package_index
        end

        DefinitionSummary.new(
          workspace_count:,
          workspace_relatives:,
          canonical_relatives:,
          canonical_site_keys:,
          package_site_keys:,
        )
      end

      def workspace_namespaces(records, rspec_groups)
        ordinal_by_name = records.each_with_index.to_h { |(declaration, *), index| [declaration.name, index] }
        components = records.map { |_declaration, _sites, _scope, component| component }
        all_components = components + rspec_groups.map(&:component)
        component_ids = all_components.uniq.sort.each_with_index.to_h

        {
          records: records,
          rspec_groups: rspec_groups,
          namespace_names: records.map { |declaration, *| declaration.name } + rspec_groups.map(&:name),
          ordinal_by_name: ordinal_by_name,
          component_ids: component_ids,
          components: components,
          component_counts: all_components.tally.sort_by { |name, _count| component_ids.fetch(name) }.map(&:last),
        }
      end

      def build_workspace_rows(workspace, inbound_references)
        rows = workspace.fetch(:records).each_with_index.map do |(declaration, sites, scope, component), index|
          descendants = declaration.descendants.count do |descendant|
            descendant.name != declaration.name && workspace.fetch(:ordinal_by_name).key?(descendant.name)
          end
          member_count, ruby_counts, instance_variable_count = member_statistics(
            declaration,
            count_instance_variables: declaration.is_a?(Rubydex::Class) && scope != 1,
          )
          [
            workspace.fetch(:component_ids).fetch(component),
            declaration.is_a?(Rubydex::Class) ? 0 : 1,
            scope,
            [declaration.ancestors.count - 1, 0].max,
            sites,
            [sites - 1, 0].max,
            descendants,
            inbound_references.fetch(index, 0),
            member_count,
            *ruby_counts,
            instance_variable_count,
          ]
        end
        rows.concat(workspace.fetch(:rspec_groups).map { |group| build_rspec_row(group, workspace) })
      end

      def build_rspec_row(group, workspace)
        [
          workspace.fetch(:component_ids).fetch(group.component),
          0,
          1,
          *Array.new(11, 0),
        ]
      end

      def build_package_rows(aggregation)
        aggregates = aggregation.packages
        @manifest.packages.each_with_index.map do |package, index|
          aggregate = aggregates.fetch(index)
          {
            "name" => package.name,
            "role" => package.role == "direct" ? 0 : 1,
            "location" => package.location == "workspace" ? 0 : 1,
            "declaration_count" => aggregate.fetch(:declaration_count),
            "ruby_counts" => aggregate.fetch(:ruby_counts),
            "declarations" => aggregate.fetch(:declarations),
          }
        end
      end

      def build_dependency_system_rows
        return [] unless @manifest.respond_to?(:dependency_systems)

        @manifest.dependency_systems.map do |system|
          {
            "id" => system.id,
            "package_indexes" => system.package_indexes,
            "label_package_index" => system.label_package_index,
          }
        end
      end

      def collect_dependency_declaration(aggregation, declaration, summary)
        package_index, site_keys = summary.package_site_keys.max_by do |index, keys|
          [keys.length, -index]
        end
        return unless package_index

        sites = site_keys.uniq.length
        row = [
          namespace_kind(declaration),
          namespace?(declaration) ? [declaration.ancestors.count - 1, 0].max : 0,
          sites,
          [sites - 1, 0].max,
          namespace?(declaration) ? [declaration.descendants.count - 1, 0].max : 0,
          safe_length(declaration, :references),
          namespace?(declaration) ? safe_length(declaration, :members) : 0,
        ]
        aggregation.add(
          package_index:,
          row:,
          construct_index: ruby_construct_index(declaration),
        )
      end

      def inbound_workspace_references(graph, ordinal_by_name)
        graph.constant_references.each_with_object(Hash.new(0)) do |reference, counts|
          next unless reference.is_a?(Rubydex::ResolvedConstantReference)

          ordinal = ordinal_by_name[reference.declaration.name]
          next unless ordinal

          counts[ordinal] += 1 if workspace_location?(reference.location)
        rescue StandardError
          next
        end
      end

      def package_index_for_location(location)
        path = source_path(location.uri)
        return nil unless path
        return nil unless @indexed_package_document_paths.include?(path)

        @manifest.package_index_for(path)
      end

      def indexed_package_document_paths(graph)
        audited = @manifest.packages.flat_map(&:files).to_set
        graph.documents.each_with_object(Set.new) do |document, paths|
          path = source_path(document.uri)
          paths << path if path && audited.include?(path)
        end
      end

      # One sweep over a namespace's direct and singleton members yields the
      # workspace member count, the method/constant construct counts, and the
      # instance-variable count that previously took three walks each re-reading
      # every member's definitions.
      def member_statistics(declaration, count_instance_variables:)
        member_count = 0
        instance_variable_count = 0
        ruby_counts = Array.new(4, 0)
        own_construct = ruby_construct_index(declaration)
        ruby_counts[own_construct] += 1 if own_construct == 0 || own_construct == 1

        seen_names = Set.new
        walk = lambda do |members, direct|
          members.each do |member|
            next unless seen_names.add?(member.name)
            next unless member.definitions.any? { |definition| workspace_location?(definition.location) }

            member_count += 1
            construct_index = ruby_construct_index(member)
            ruby_counts[construct_index] += 1 if construct_index && construct_index >= 2
            if direct && count_instance_variables && member.is_a?(Rubydex::InstanceVariable)
              instance_variable_count += 1
            end
          end
        end
        walk.call(declaration.members, true)
        walk.call(declaration.singleton_class.members, false) if declaration.singleton_class
        [member_count, ruby_counts, instance_variable_count]
      rescue StandardError
        [member_count, ruby_counts, instance_variable_count]
      end

      def collect_category_stat(stats, declaration, summary)
        construct_index = ruby_construct_index(declaration)
        return unless construct_index
        return if summary.workspace_count.zero?

        category = scope_from(summary.workspace_relatives) == 1 ? "tests" : "core"
        stats.fetch(category)[construct_index] += 1
      end

      def workspace_location?(location)
        uri = location.uri
        return @workspace_location_cache[uri] if @workspace_location_cache.key?(uri)

        path = source_path(uri)
        @workspace_location_cache[uri] = path ? @manifest.workspace_path?(path) : false
      rescue StandardError
        false
      end

      def component_from(relatives)
        candidates = relatives.map { |relative| SourcePath.component_for(relative) }
        candidates.tally.max_by { |name, count| [count, name] }&.first || "root"
      end

      def scope_from(relatives)
        scopes = relatives.map do |relative|
          relative.split(File::SEPARATOR).any? { |segment| TEST_SEGMENTS.include?(segment) } ? 1 : 0
        end.uniq
        scopes.length > 1 ? 2 : scopes.first || 0
      end

      def site_key(location)
        location.comparable_values
      end

      def namespace?(declaration)
        declaration.is_a?(Rubydex::Namespace)
      end

      def model_eligible_declaration?(declaration)
        name = declaration.name
        return false if name.nil? || name.empty? || name.include?("<anonymous>")
        return false if declaration.is_a?(Rubydex::Todo)
        return true unless declaration.is_a?(Rubydex::SingletonClass)

        !declaration.attached_class.is_a?(Rubydex::SingletonClass) &&
          !declaration.attached_class.is_a?(Rubydex::Todo)
      end

      def canonical_namespace_definition?(declaration, definition)
        (declaration.is_a?(Rubydex::Class) && definition.is_a?(Rubydex::ClassDefinition)) ||
          (declaration.is_a?(Rubydex::Module) && definition.is_a?(Rubydex::ModuleDefinition))
      end

      def namespace_kind(declaration)
        case declaration
        when Rubydex::Class then 0
        when Rubydex::Module then 1
        else 2
        end
      end

      def ruby_construct_index(declaration)
        case declaration
        when Rubydex::SingletonClass then nil
        when Rubydex::Class then 0
        when Rubydex::Module then 1
        when Rubydex::Method then 2
        when Rubydex::Constant, Rubydex::ConstantAlias then 3
        end
      end

      def source_path(uri_string)
        return @source_path_cache[uri_string] if @source_path_cache.key?(uri_string)

        @source_path_cache[uri_string] = SourcePath.from_file_uri(uri_string)
      end

      def safe_length(object, method)
        records = object.public_send(method)
        size = records.size
        size.nil? ? safe_count(records) : size
      rescue StandardError
        safe_count(records)
      end

      def safe_count(records)
        records ? records.count : 0
      rescue StandardError
        0
      end

      def project_name
        basename = @manifest.root.basename.to_s
        return "IRB" if basename.casecmp("irb").zero?
        return "RDoc" if basename.casecmp("rdoc").zero?

        basename.split(/[-_]+/).map(&:capitalize).join(" ")
      end
    end
  end
end
