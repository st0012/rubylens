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
      CONSTANT_REFERENCE_LINK_LIMIT = 1_024
      CONSTANT_REFERENCE_ATTRIBUTION_LIMIT = CONSTANT_REFERENCE_LINK_LIMIT * 2

      ReferenceSummary = Data.define(:inbound_counts, :links)

      def initialize(manifest)
        @manifest = manifest
        @source_path_cache = {}
        @workspace_location_cache = {}
        @definition_scope_by_uri = {}
        @package_index_by_uri = {}
        @indexed_package_document_paths = Set.new
      end

      def index
        graph = Rubydex::Graph.new(workspace_path: @manifest.root.to_s)
        index_errors = graph.index_all(@manifest.files)
        @indexed_package_document_paths, documents_with_paths = resolve_documents(graph)
        graph.resolve
        integrity_failures = graph.check_integrity
        collected = collect_declarations(graph.declarations)
        rspec = RSpecExtractor.new(
          graph: graph,
          manifest: @manifest,
          package_document_paths: @indexed_package_document_paths,
          documents_with_paths: documents_with_paths,
        ).call
        workspace = workspace_namespaces(
          collected.fetch(:workspace_records),
          rspec.groups,
          collected.fetch(:workspace_definition_ranges),
        )
        reference_summary = workspace_reference_summary(
          graph,
          workspace,
          collected.fetch(:dependency_ordinal_by_name),
        )
        category_stats = collected.fetch(:category_stats)
        category_stats.fetch("tests")[0] += rspec.groups.length
        category_stats.fetch("tests")[2] += rspec.method_count

        {
          "schema" => "rubylens.snapshot.v9",
          "project_name" => project_name,
          "namespace_names" => workspace.fetch(:namespace_names),
          "namespaces" => build_workspace_rows(workspace, reference_summary.inbound_counts),
          "constant_reference_links" => reference_summary.links,
          "category_stats" => category_stats,
          "dependency_signal_maxima" => collected.fetch(:dependency_signal_maxima),
          "packages" => build_package_rows(collected.fetch(:dependency_packages)),
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
        workspace_definition_ranges = Hash.new { |hash, uri| hash[uri] = [] }
        dependency_positions = {}

        declarations.each do |declaration|
          name = declaration.name
          next unless model_eligible_declaration?(declaration, name)

          is_namespace = declaration.is_a?(Rubydex::Namespace)
          construct_index = ruby_construct_index(declaration)
          workspace_count, tests_only, canonical_site_keys, canonical_scope, package_site_keys =
            summarize_definitions(declaration, is_namespace)

          if canonical_site_keys
            canonical_site_keys = canonical_site_keys.uniq if canonical_site_keys.length > 1
            ordinal = records.length
            canonical_site_keys.each do |uri, start_line, start_column, end_line, end_column|
              workspace_definition_ranges[uri] << [start_line, start_column, end_line, end_column, ordinal]
            end
            records << [declaration, canonical_site_keys.length, canonical_scope, name]
          end
          if construct_index && workspace_count.positive?
            category_stats.fetch(tests_only ? "tests" : "core")[construct_index] += 1
          end
          collect_dependency_declaration(
            aggregation,
            dependency_positions,
            declaration,
            name,
            is_namespace,
            construct_index,
            package_site_keys,
          )
        end

        dependency_packages = aggregation.packages
        dependency_offsets = []
        offset = 0
        dependency_packages.each do |package|
          dependency_offsets << offset
          offset += package.fetch(:declarations).length
        end
        dependency_ordinal_by_name = dependency_positions.transform_values! do |position|
          package_index, local_index = position
          dependency_offsets.fetch(package_index) + local_index
        end

        {
          workspace_records: records,
          workspace_definition_ranges:,
          category_stats:,
          dependency_packages:,
          dependency_signal_maxima: aggregation.signal_maxima,
          dependency_ordinal_by_name: dependency_ordinal_by_name.freeze,
        }
      end

      # One pass over a declaration's definitions gathers everything the
      # collectors need, so each definition's location and its per-URI
      # workspace/scope/package answers cross the Rubydex boundary once.
      # Canonical site keys and package site keys stay nil until a definition
      # actually contributes to them, since most declarations produce neither.
      def summarize_definitions(declaration, is_namespace)
        workspace_count = 0
        tests_seen = false
        core_seen = false
        canonical_tests_seen = false
        canonical_core_seen = false
        canonical_site_keys = nil
        package_site_keys = nil

        declaration.definitions.each do |definition|
          location = definition.location
          site_key = nil
          if workspace_location?(location)
            workspace_count += 1
            scope = definition_scope(location.uri)
            if scope == 1
              tests_seen = true
            elsif scope
              core_seen = true
            end
            if is_namespace && canonical_namespace_definition?(declaration, definition)
              (canonical_site_keys ||= []) << (site_key = location.comparable_values)
              if scope == 1
                canonical_tests_seen = true
              elsif scope
                canonical_core_seen = true
              end
            end
          end
          package_index = package_index_for_location(location)
          if package_index
            ((package_site_keys ||= {})[package_index] ||= []) << (site_key || location.comparable_values)
          end
        end

        canonical_scope = canonical_tests_seen ? (canonical_core_seen ? 2 : 1) : 0
        [workspace_count, tests_seen && !core_seen, canonical_site_keys, canonical_scope, package_site_keys]
      end

      def workspace_namespaces(records, rspec_groups, definition_ranges = {})
        namespace_names = []
        ordinal_by_name = {}
        records.each_with_index do |record, index|
          name = record.fetch(3)
          namespace_names << name
          ordinal_by_name[name] = index
        end
        {
          records: records,
          definition_ranges: definition_ranges,
          rspec_groups: rspec_groups,
          namespace_names: namespace_names + rspec_groups,
          ordinal_by_name: ordinal_by_name,
        }
      end

      def build_workspace_rows(workspace, inbound_references)
        ordinal_by_name = workspace.fetch(:ordinal_by_name)
        rows = workspace.fetch(:records).each_with_index.map do |record, index|
          declaration, sites, scope, name = record
          descendants = declaration.descendants.count do |descendant|
            descendant_name = descendant.name
            descendant_name != name && ordinal_by_name.key?(descendant_name)
          end
          member_count, ruby_counts, instance_variable_count = member_statistics(
            declaration,
            count_instance_variables: declaration.is_a?(Rubydex::Class) && scope != 1,
          )
          [
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
        rows.concat(workspace.fetch(:rspec_groups).map { build_rspec_row })
      end

      def build_rspec_row
        [0, 1, *Array.new(11, 0)]
      end

      def build_package_rows(aggregates)
        @manifest.packages.each_with_index.map do |package, index|
          aggregate = aggregates.fetch(index)
          {
            "name" => package.name,
            "role" => package.role == "direct" ? 0 : 1,
            "location" => package.location == "workspace" ? 0 : 1,
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

      def collect_dependency_declaration(aggregation, positions, declaration, name, is_namespace, construct_index, package_site_keys)
        return unless package_site_keys

        package_index = nil
        site_keys = nil
        package_site_keys.each do |index, keys|
          if site_keys.nil? || keys.length > site_keys.length ||
              (keys.length == site_keys.length && index < package_index)
            package_index = index
            site_keys = keys
          end
        end

        sites = site_keys.length > 1 ? site_keys.uniq.length : site_keys.length
        reference_count = safe_length(declaration, :references)
        row = [
          namespace_kind(declaration),
          is_namespace ? [declaration.ancestors.count - 1, 0].max : 0,
          sites,
          [sites - 1, 0].max,
          is_namespace ? [declaration.descendants.count - 1, 0].max : 0,
          reference_count,
          is_namespace ? safe_length(declaration, :members) : 0,
        ].freeze
        local_index = aggregation.add(
          package_index:,
          row:,
          construct_index:,
        )
        if reference_count.positive? && constant_reference_target?(declaration, is_namespace)
          positions[name] = [package_index, local_index]
        end
      end

      def workspace_reference_summary(graph, workspace, dependency_ordinal_by_name = {})
        ordinal_by_name = workspace.fetch(:ordinal_by_name)
        namespace_count = workspace.fetch(:namespace_names, ordinal_by_name).length
        workspace_ranges = workspace.fetch(:definition_ranges, {})
        inbound_counts = Hash.new(0)
        links = []
        retained_links = Set.new
        attribution_count = 0

        graph.constant_references.each do |reference|
          next unless reference.is_a?(Rubydex::ResolvedConstantReference)

          referenced_name = resolved_constant_reference_name(reference)
          next unless referenced_name
          referenced_ordinal = ordinal_by_name[referenced_name]
          travel_available = links.length < CONSTANT_REFERENCE_LINK_LIMIT &&
            attribution_count < CONSTANT_REFERENCE_ATTRIBUTION_LIMIT
          dependency_ordinal = dependency_ordinal_by_name[referenced_name] if travel_available && !referenced_ordinal
          next unless referenced_ordinal || dependency_ordinal

          location = begin
            reference.location
          rescue StandardError
            next
          end
          next unless workspace_location?(location)

          inbound_counts[referenced_ordinal] += 1 if referenced_ordinal
          next unless travel_available

          attribution_count += 1

          referenced_endpoint = referenced_ordinal || namespace_count + dependency_ordinal

          location_values = begin
            location.comparable_values
          rescue StandardError
            next
          end
          referring_ordinal = enclosing_definition_ordinal(location_values, workspace_ranges)
          next unless referring_ordinal
          next if referenced_endpoint == referring_ordinal

          link = [referring_ordinal, referenced_endpoint]
          next unless retained_links.add?(link)

          links << link
        end

        ReferenceSummary.new(inbound_counts.freeze, links.freeze)
      end

      def resolved_constant_reference_name(reference)
        reference.declaration.name
      rescue StandardError
        nil
      end

      def enclosing_definition_ordinal(location_values, ranges_by_uri)
        uri, start_line, start_column, end_line, end_column = location_values
        best = nil
        ambiguous = false
        ranges_by_uri.fetch(uri, []).each do |range|
          range_start_line, range_start_column, range_end_line, range_end_column, ordinal = range
          next if position_compare(range_start_line, range_start_column, start_line, start_column).positive?
          next if position_compare(range_end_line, range_end_column, end_line, end_column).negative?

          start_comparison = best ? position_compare(range_start_line, range_start_column, best[0], best[1]) : 1
          end_comparison = best && start_comparison.zero? ? position_compare(range_end_line, range_end_column, best[2], best[3]) : 0
          if start_comparison.positive? || (start_comparison.zero? && end_comparison.negative?)
            best = range
            ambiguous = false
          elsif start_comparison.zero? && end_comparison.zero? && ordinal != best[4]
            ambiguous = true
          end
        end

        ambiguous ? nil : best&.fetch(4)
      end

      def position_compare(left_line, left_column, right_line, right_column)
        line_comparison = left_line <=> right_line
        line_comparison.zero? ? left_column <=> right_column : line_comparison
      end

      def package_index_for_location(location)
        uri = location.uri
        @package_index_by_uri.fetch(uri) do
          path = source_path(uri)
          @package_index_by_uri[uri] =
            if path && @indexed_package_document_paths.include?(path)
              @manifest.package_index_for(path)
            end
        end
      end

      # One sweep over the indexed documents resolves each URI once, yielding
      # both the package-audit set and the [document, path] pairs the RSpec
      # extractor reuses without re-enumerating documents or re-parsing URIs.
      def resolve_documents(graph)
        audited = @manifest.packages.flat_map(&:files).to_set
        package_paths = Set.new
        documents_with_paths = []
        graph.documents.each do |document|
          path = source_path(document.uri)
          next unless path

          documents_with_paths << [document, path]
          package_paths << path if audited.include?(path)
        end
        [package_paths, documents_with_paths]
      end

      # One sweep over a namespace's direct and singleton members yields the
      # workspace member count, the method/constant construct counts, and the
      # instance-variable count that previously took three walks each re-reading
      # every member's definitions. Membership comes from each member's own
      # definition locations; the per-URI caches keep that scan cheap.
      def member_statistics(declaration, count_instance_variables:)
        member_count = 0
        instance_variable_count = 0
        ruby_counts = Array.new(4, 0)
        own_construct = ruby_construct_index(declaration)
        ruby_counts[own_construct] += 1 if own_construct == 0 || own_construct == 1

        seen_names = Set.new
        member_groups = [[declaration.members, true]]
        singleton = declaration.singleton_class
        member_groups << [singleton.members, false] if singleton
        member_groups.each do |members, direct|
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
        [member_count, ruby_counts, instance_variable_count]
      rescue StandardError
        [member_count, ruby_counts, instance_variable_count]
      end

      def workspace_location?(location)
        uri = location.uri
        @workspace_location_cache.fetch(uri) do
          path = source_path(uri)
          @workspace_location_cache[uri] = path ? @manifest.workspace_path?(path) : false
        end
      rescue StandardError
        false
      end

      # 1 for a test-tree file, 0 for any other workspace file, nil when the
      # URI has no workspace-relative path to classify.
      def definition_scope(uri)
        @definition_scope_by_uri.fetch(uri) do
          relative = @manifest.relative_workspace_path(source_path(uri))
          @definition_scope_by_uri[uri] =
            if relative
              relative.split(File::SEPARATOR).any? { |segment| TEST_SEGMENTS.include?(segment) } ? 1 : 0
            end
        end
      end

      def constant_reference_target?(declaration, is_namespace)
        is_namespace ||
          declaration.is_a?(Rubydex::Constant) ||
          declaration.is_a?(Rubydex::ConstantAlias)
      end

      def model_eligible_declaration?(declaration, name = declaration.name)
        return false if name.nil? || name.empty? || name.include?("<anonymous>")
        return false if declaration.is_a?(Rubydex::Todo)
        return true unless declaration.is_a?(Rubydex::SingletonClass)

        attached = declaration.attached_class
        !attached.is_a?(Rubydex::SingletonClass) && !attached.is_a?(Rubydex::Todo)
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
        @source_path_cache.fetch(uri_string) do
          @source_path_cache[uri_string] = SourcePath.from_file_uri(uri_string)
        end
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
