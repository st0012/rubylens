# frozen_string_literal: true

require "digest"
require "rubydex"
require "pathname"
require "uri"
require_relative "../model/dependency_aggregation"
require_relative "../model/rails_framework_reference"

module RubyLens
  module Index
    class RubydexAdapter
      TEST_SEGMENTS = %w[test tests spec specs feature features].freeze

      def initialize(graph_factory: nil)
        @graph_factory = graph_factory || ->(root) { Rubydex::Graph.new(workspace_path: root.to_s) }
      end

      def index(manifest)
        @location_path_cache = {}
        @workspace_location_cache = {}
        @boundary_group_cache = {}
        graph = @graph_factory.call(manifest.root)
        index_errors = Array(graph.index_all(manifest.files))
        graph.resolve
        integrity_failures = Array(graph.check_integrity)
        collected = collect_declarations(graph.declarations, manifest)
        workspace = workspace_namespaces(collected.fetch(:workspace_records), manifest)
        inbound_references = inbound_workspace_references(graph, manifest, workspace.fetch(:ordinal_by_name))

        snapshot = {
          "schema" => "rubylens.snapshot.v5",
          "project_name" => project_name(manifest),
          "components" => workspace.fetch(:component_counts),
          "namespace_names" => workspace.fetch(:records).map { |declaration, _definitions| declaration.name },
          "namespaces" => build_workspace_rows(workspace, inbound_references, manifest),
          "category_stats" => collected.fetch(:category_stats),
          "dependency_signal_maxima" => collected.fetch(:dependency_aggregation).signal_maxima,
          "packages" => build_package_rows(collected.fetch(:dependency_aggregation), manifest),
          "framework_reference" => collected.fetch(:rails_reference).build(
            index_complete: index_errors.empty?, integrity_complete: integrity_failures.empty?
          ),
          "warning_counts" => {
            "manifest" => manifest.warnings.length,
            "index" => index_errors.length,
            "integrity" => integrity_failures.length,
          },
        }
        if configured_boundaries?(manifest)
          snapshot["schema"] = "rubylens.snapshot.v6"
          snapshot["groups"] = build_group_rows(workspace, collected.fetch(:group_ruby_counts), manifest)
          validate_group_totals!(snapshot.fetch("groups"), collected.fetch(:category_stats))
        end
        snapshot
      ensure
        @location_path_cache = nil
        @workspace_location_cache = nil
        @boundary_group_cache = nil
      end

      private

      def collect_declarations(declarations, manifest)
        records = []
        category_stats = { "core" => Array.new(4, 0), "tests" => Array.new(4, 0) }
        aggregation = Model::DependencyAggregation.new(package_count: manifest.packages.length)
        group_ruby_counts = if configured_boundaries?(manifest)
          Array.new(manifest.boundaries.groups.length) { { "core" => Array.new(4, 0), "tests" => Array.new(4, 0) } }
        end
        rails_reference = Model::RailsFrameworkReference.new(manifest)

        declarations.each do |declaration|
          if namespace?(declaration)
            definitions = declaration.definitions.select do |definition|
              canonical_namespace_definition?(declaration, definition) && workspace_location?(definition.location, manifest)
            end
            records << [declaration, definitions] unless definitions.empty?
          end
          collect_category_stat(category_stats, declaration, manifest, group_ruby_counts)
          collect_dependency_declaration(aggregation, declaration, manifest)
          collect_rails_namespace(rails_reference, declaration, manifest)
        end

        { workspace_records: records, category_stats:, dependency_aggregation: aggregation, group_ruby_counts:, rails_reference: }
      end

      def collect_rails_namespace(reference, declaration, manifest)
        return unless reference.detected? && namespace?(declaration)

        eligible = declaration.definitions.any? do |definition|
          next false unless canonical_namespace_definition?(declaration, definition)

          package_index = package_index_for_location(definition.location, manifest)
          reference.family_package_index?(package_index) && dependency_core_location?(definition.location, package_index, manifest)
        end
        reference.add_namespace(namespace_kind(declaration)) if eligible
      end

      def dependency_core_location?(location, package_index, manifest)
        package = manifest.packages.fetch(package_index)
        relative = Pathname(location_path(location)).realpath.relative_path_from(package.root)
        relative.each_filename.none? { |segment| TEST_SEGMENTS.include?(segment) }
      rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP, ArgumentError
        false
      end

      def workspace_namespaces(records, manifest)
        ordinal_by_name = records.each_with_index.to_h { |(declaration, _definitions), index| [declaration.name, index] }
        if configured_boundaries?(manifest)
          components = records.map { |_declaration, definitions| owner_group_for(definitions, manifest).id }
          component_ids = manifest.boundaries.groups.each_with_index.to_h { |group, index| [group.id, index] }
          component_counts = Array.new(component_ids.length, 0)
          components.each { |id| component_counts[component_ids.fetch(id)] += 1 }
          cross_group = records.map do |_declaration, definitions|
            definition_groups(definitions, manifest).uniq.length > 1
          end
        else
          components = records.map { |_declaration, definitions| component_for(definitions, manifest) }
          component_ids = components.uniq.sort.each_with_index.to_h
          component_counts = components.tally.sort_by { |name, _count| component_ids.fetch(name) }.map(&:last)
          cross_group = nil
        end

        {
          records: records,
          ordinal_by_name: ordinal_by_name,
          component_ids: component_ids,
          components: components,
          component_counts: component_counts,
          cross_group: cross_group,
        }
      end

      def build_workspace_rows(workspace, inbound_references, manifest)
        workspace.fetch(:records).each_with_index.map do |(declaration, definitions), index|
          sites = definitions.map { |definition| site_key(definition.location) }.uniq.length
          scope = scope_for(definitions, manifest)
          descendants = declaration.descendants.count do |descendant|
            descendant.name != declaration.name && workspace.fetch(:ordinal_by_name).key?(descendant.name)
          end
          [
            workspace.fetch(:component_ids).fetch(workspace.fetch(:components)[index]),
            declaration.is_a?(Rubydex::Class) ? 0 : 1,
            scope,
            [declaration.ancestors.count - 1, 0].max,
            sites,
            [sites - 1, 0].max,
            descendants,
            inbound_references.fetch(index, 0),
            workspace_member_count(declaration, manifest),
            *namespace_ruby_counts(declaration, manifest),
            namespace_instance_variable_count(declaration, manifest, scope),
          ]
        end
      end

      def build_package_rows(aggregation, manifest)
        aggregates = aggregation.packages
        manifest.packages.each_with_index.map do |package, index|
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

      def build_group_rows(workspace, ruby_counts, manifest)
        namespace_counts = Array.new(manifest.boundaries.groups.length) { Array.new(3, 0) }
        cross_group_counts = Array.new(manifest.boundaries.groups.length, 0)
        workspace.fetch(:records).each_with_index do |(_declaration, definitions), index|
          group_index = workspace.fetch(:component_ids).fetch(workspace.fetch(:components).fetch(index))
          namespace_counts.fetch(group_index)[scope_for(definitions, manifest)] += 1
          cross_group_counts[group_index] += 1 if workspace.fetch(:cross_group).fetch(index)
        end

        manifest.boundaries.groups.each_with_index.map do |group, index|
          {
            "id" => group.id,
            "name" => group.label,
            "anchor_seed" => group_anchor_seed(group.id),
            "namespace_counts" => namespace_counts.fetch(index),
            "ruby_counts" => ruby_counts.fetch(index),
            "cross_group_namespaces" => cross_group_counts.fetch(index),
          }
        end
      end

      def group_anchor_seed(id)
        Digest::SHA256.digest("rubylens.group\0#{id}").unpack1("N")
      end

      def validate_group_totals!(groups, category_stats)
        %w[core tests].each do |category|
          totals = groups.each_with_object(Array.new(4, 0)) do |group, sums|
            group.fetch("ruby_counts").fetch(category).each_with_index { |count, index| sums[index] += count }
          end
          next if totals == category_stats.fetch(category)

          raise Error, "group #{category} aggregates do not reconcile with category totals"
        end
      end

      def collect_dependency_declaration(aggregation, declaration, manifest)
        package_index, definitions = dominant_package_definitions(declaration, manifest)
        return unless package_index

        sites = definitions.map { |definition| site_key(definition.location) }.uniq.length
        row = [
          namespace_kind(declaration),
          namespace?(declaration) ? [declaration.ancestors.count - 1, 0].max : 0,
          sites,
          [sites - 1, 0].max,
          namespace?(declaration) ? [declaration.descendants.count - 1, 0].max : 0,
          safe_length(declaration, :references),
          namespace?(declaration) ? safe_length(declaration, :members) : 0,
        ]
        aggregation.add(package_index:, row:, construct_index: ruby_construct_index(declaration))
      end

      def inbound_workspace_references(graph, manifest, ordinal_by_name)
        graph.constant_references.each_with_object(Hash.new(0)) do |reference, counts|
          next unless reference.respond_to?(:declaration)

          next unless workspace_location?(reference.location, manifest)

          target = reference.declaration
          ordinal = ordinal_by_name[target.name]
          counts[ordinal] += 1 if ordinal
        rescue StandardError
          next
        end
      end

      def dominant_package_definitions(declaration, manifest)
        grouped = declaration.definitions.group_by do |definition|
          package_index_for_location(definition.location, manifest)
        end
        grouped.reject { |index, _records| index.nil? }
          .max_by { |index, records| [records.length, -index] }
      end

      def package_index_for_location(location, manifest)
        uri_string = location.uri
        return nil unless URI.parse(uri_string).scheme == "file"

        manifest.package_index_for(location_path(location, uri_string))
      end

      def workspace_member_count(declaration, manifest)
        members = declaration.members.to_a
        members.concat(declaration.singleton_class.members.to_a) if declaration.singleton_class
        members.uniq(&:name).count do |member|
          member.definitions.any? { |definition| workspace_location?(definition.location, manifest) }
        end
      rescue StandardError
        0
      end

      def namespace_ruby_counts(declaration, manifest)
        counts = Array.new(4, 0)
        own_construct = ruby_construct_index(declaration)
        counts[own_construct] += 1 if own_construct == 0 || own_construct == 1

        members = declaration.members.to_a
        members.concat(declaration.singleton_class.members.to_a) if declaration.singleton_class
        members.uniq(&:name).each do |member|
          construct_index = ruby_construct_index(member)
          next unless construct_index && construct_index >= 2
          next unless member.definitions.any? { |definition| workspace_location?(definition.location, manifest) }

          counts[construct_index] += 1
        end
        counts
      rescue StandardError
        counts || Array.new(4, 0)
      end

      def namespace_instance_variable_count(declaration, manifest, scope)
        return 0 unless declaration.is_a?(Rubydex::Class) && scope != 1

        declaration.members.to_a.uniq(&:name).count do |member|
          member.is_a?(Rubydex::InstanceVariable) &&
            member.definitions.any? { |definition| workspace_location?(definition.location, manifest) }
        end
      rescue StandardError
        0
      end

      def collect_category_stat(stats, declaration, manifest, group_ruby_counts = nil)
        construct_index = ruby_construct_index(declaration)
        return unless construct_index

        definitions = declaration.definitions.select do |definition|
          workspace_location?(definition.location, manifest)
        end
        return if definitions.empty?

        category = scope_for(definitions, manifest) == 1 ? "tests" : "core"
        stats.fetch(category)[construct_index] += 1
        if group_ruby_counts
          group = owner_group_for(definitions, manifest)
          group_index = manifest.boundaries.group_index(group)
          group_ruby_counts.fetch(group_index).fetch(category)[construct_index] += 1
        end
      rescue Error
        raise
      rescue StandardError
        raise if group_ruby_counts

        nil
      end

      def workspace_location?(location, manifest)
        uri = location.uri
        @workspace_location_cache ||= {}
        return @workspace_location_cache[uri] if @workspace_location_cache.key?(uri)

        @workspace_location_cache[uri] = manifest.workspace_path?(location_path(location, uri))
      rescue StandardError
        false
      end

      def component_for(definitions, manifest)
        candidates = definitions.filter_map do |definition|
          relative = manifest.relative_workspace_path(location_path(definition.location))
          next unless relative

          segments = relative.split(File::SEPARATOR)
          first = segments.first || "root"
          if %w[lib app test tests spec specs].include?(first)
            "#{first}/#{segments[1] || "root"}"
          else
            first
          end
        end
        candidates.tally.max_by { |name, count| [count, name] }&.first || "root"
      end

      def scope_for(definitions, manifest)
        scopes = definitions.filter_map do |definition|
          relative = manifest.relative_workspace_path(location_path(definition.location))
          next unless relative

          relative.split(File::SEPARATOR).any? { |segment| TEST_SEGMENTS.include?(segment) } ? 1 : 0
        end.uniq
        scopes.length > 1 ? 2 : scopes.first || 0
      end

      def owner_group_for(definitions, manifest)
        grouped = definitions.each_with_object(Hash.new { |hash, group| hash[group] = [] }) do |definition, groups|
          groups[group_for_definition(definition, manifest)] << definition
        end
        grouped.min_by do |group, group_definitions|
          unique_definitions = group_definitions.uniq { |definition| site_key(definition.location) }
          core_sites = unique_definitions.count { |definition| !test_definition?(definition, manifest) }
          [-core_sites, -unique_definitions.length, group.rule_order, group.id]
        end&.first || raise(Error, "workspace declaration has no boundary owner")
      end

      def definition_groups(definitions, manifest)
        definitions.map { |definition| group_for_definition(definition, manifest) }
      end

      def group_for_definition(definition, manifest)
        relative = manifest.relative_workspace_path(location_path(definition.location))
        raise Error, "workspace definition has no relative path" unless relative

        @boundary_group_cache ||= {}
        @boundary_group_cache[relative] ||= manifest.boundaries.group_for(relative)
      end

      def test_definition?(definition, manifest)
        relative = manifest.relative_workspace_path(location_path(definition.location))
        relative && relative.split(File::SEPARATOR).any? { |segment| TEST_SEGMENTS.include?(segment) }
      end

      def configured_boundaries?(manifest)
        manifest.respond_to?(:boundaries) && manifest.boundaries.configured?
      end

      def site_key(location)
        [location_path(location), location.start_line, location.start_column, location.end_line, location.end_column]
      end

      def namespace?(declaration)
        declaration.is_a?(Rubydex::Namespace)
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

      def location_path(location, uri_string = nil)
        uri_string ||= location.uri
        @location_path_cache ||= {}
        return @location_path_cache[uri_string] if @location_path_cache.key?(uri_string)

        uri = URI.parse(uri_string)
        raise Error, "Rubydex returned a non-file location" unless uri.scheme == "file"

        @location_path_cache[uri_string] = URI::RFC2396_PARSER.unescape(uri.path)
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

      def project_name(manifest)
        basename = manifest.root.basename.to_s
        return "IRB" if basename.casecmp("irb").zero?
        return "RDoc" if basename.casecmp("rdoc").zero?

        basename.split(/[-_]+/).map(&:capitalize).join(" ")
      end
    end
  end
end
