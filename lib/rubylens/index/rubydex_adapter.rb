# frozen_string_literal: true

require "rubydex"
require "set"
require "uri"

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
        graph = @graph_factory.call(manifest.root)
        index_errors = Array(graph.index_all(manifest.files))
        graph.resolve
        integrity_failures = Array(graph.check_integrity)
        declarations = graph.declarations.to_a
        workspace = workspace_namespaces(declarations, manifest)
        reference_data = workspace_reference_data(graph, declarations, manifest, workspace.fetch(:ordinal_by_name))

        {
          "schema" => "rubylens.snapshot.v3",
          "project_name" => project_name(manifest),
          "components" => workspace.fetch(:component_counts),
          "namespace_names" => workspace.fetch(:records).map { |declaration, _definitions| declaration.name },
          "namespaces" => build_workspace_rows(workspace, reference_data.fetch(:inbound), manifest),
          "reference_routes" => reference_data.fetch(:routes),
          "reference_route_counts" => reference_data.fetch(:counts),
          "category_stats" => workspace_constructs(declarations, manifest),
          "packages" => build_package_rows(declarations, manifest),
          "warning_counts" => {
            "manifest" => manifest.warnings.length,
            "index" => index_errors.length,
            "integrity" => integrity_failures.length,
          },
        }
      ensure
        @location_path_cache = nil
        @workspace_location_cache = nil
      end

      private

      def workspace_namespaces(declarations, manifest)
        records = declarations.filter_map do |declaration|
          next unless namespace?(declaration)

          definitions = declaration.definitions.select do |definition|
            canonical_namespace_definition?(declaration, definition) && workspace_location?(definition.location, manifest)
          end
          next if definitions.empty?

          [declaration, definitions]
        end
        ordinal_by_name = records.each_with_index.to_h { |(declaration, _definitions), index| [declaration.name, index] }
        components = records.map { |_declaration, definitions| component_for(definitions, manifest) }
        component_ids = components.uniq.sort.each_with_index.to_h

        {
          records: records,
          ordinal_by_name: ordinal_by_name,
          component_ids: component_ids,
          components: components,
          component_counts: components.tally.sort_by { |name, _count| component_ids.fetch(name) }.map(&:last),
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

      def build_package_rows(declarations, manifest)
        declaration_rows = Array.new(manifest.packages.length) { [] }
        ruby_counts = Array.new(manifest.packages.length) { Array.new(4, 0) }
        declarations.each do |declaration|
          package_index, definitions = dominant_package_definitions(declaration, manifest)
          next unless package_index

          sites = definitions.map { |definition| site_key(definition.location) }.uniq.length
          declaration_rows.fetch(package_index) << [
            namespace_kind(declaration),
            namespace?(declaration) ? [declaration.ancestors.count - 1, 0].max : 0,
            sites,
            [sites - 1, 0].max,
            namespace?(declaration) ? [declaration.descendants.count - 1, 0].max : 0,
            safe_length(declaration, :references),
            namespace?(declaration) ? safe_length(declaration, :members) : 0,
          ]
          construct_index = ruby_construct_index(declaration)
          ruby_counts.fetch(package_index)[construct_index] += 1 if construct_index
        end

        manifest.packages.each_with_index.map do |package, index|
          {
            "name" => package.name,
            "role" => package.role == "direct" ? 0 : 1,
            "location" => package.location == "workspace" ? 0 : 1,
            "ruby_counts" => ruby_counts.fetch(index),
            "declarations" => declaration_rows.fetch(index),
          }
        end
      end

      def workspace_reference_data(graph, declarations, manifest, ordinal_by_name)
        source_ranges = workspace_source_ranges(declarations, manifest, ordinal_by_name)
        inbound = Hash.new(0)
        route_counts = Hash.new(0)
        occurrences_by_uri = Hash.new { |hash, uri| hash[uri] = Set.new }
        counts = Hash.new(0)
        target_cache = {}

        graph.constant_references.each do |reference|
          next unless reference.respond_to?(:declaration)

          location = reference.location
          next unless workspace_location?(location, manifest)

          target_declaration = reference.declaration
          uri = location.uri
          span = location_span(location)

          counts["resolved_workspace"] += 1
          target_name = target_declaration.name
          inbound_ordinal = ordinal_by_name[target_name]
          inbound[inbound_ordinal] += 1 if inbound_ordinal

          source_ordinal = source_namespace_ordinal(uri, span, source_ranges)
          unless source_ordinal
            counts["unmapped_source"] += 1
            next
          end

          target_key = [target_declaration.class.name, target_name]
          target = target_cache.fetch(target_key) do
            target_cache[target_key] = route_target(target_declaration, manifest, ordinal_by_name)
          end
          unless target
            counts["unmapped_target"] += 1
            next
          end

          target_kind, target_ordinal = target
          occurrence = [source_ordinal, target_kind, target_ordinal, *span]
          unless occurrences_by_uri[uri].add?(occurrence)
            counts["deduplicated"] += 1
            next
          end

          if target_kind.zero? && source_ordinal == target_ordinal
            counts["self"] += 1
            next
          end

          route_counts[[source_ordinal, target_kind, target_ordinal]] += 1
        rescue StandardError
          next
        end

        routes = route_counts.sort_by { |(source, kind, target), _count| [source, kind, target] }
          .map { |(source, kind, target), count| [source, kind, target, count] }
        counts["routed_occurrences"] = route_counts.values.sum
        counts["routes"] = routes.length

        { inbound:, routes:, counts: counts.sort.to_h }
      end

      def workspace_source_ranges(declarations, manifest, ordinal_by_name)
        ranges = Hash.new { |hash, uri| hash[uri] = [] }
        declarations.each do |declaration|
          declaration.definitions.each do |definition|
            location = definition.location
            next unless workspace_location?(location, manifest)

            source = definition.declaration || definition.lexical_owner&.declaration || declaration
            ordinal = workspace_namespace_ordinal(source, ordinal_by_name)
            ranges[location.uri] << [*location_span(location), ordinal] if ordinal
          rescue StandardError
            next
          end
        end
        ranges
      end

      def source_namespace_ordinal(uri, span, source_ranges)
        start_line, start_column, end_line, end_column = span
        best_ordinal = nil
        best_start_line = nil
        best_start_column = nil
        best_end_line = nil
        best_end_column = nil
        source_ranges.fetch(uri, []).each do |range_start_line, range_start_column, range_end_line, range_end_column, ordinal|
          next if range_start_line > start_line ||
            (range_start_line == start_line && range_start_column > start_column)
          next if range_end_line < end_line ||
            (range_end_line == end_line && range_end_column < end_column)

          better = best_start_line.nil? ||
            range_start_line > best_start_line ||
            (range_start_line == best_start_line && range_start_column > best_start_column) ||
            (range_start_line == best_start_line && range_start_column == best_start_column && range_end_line < best_end_line) ||
            (range_start_line == best_start_line && range_start_column == best_start_column && range_end_line == best_end_line && range_end_column < best_end_column)
          next unless better

          best_start_line = range_start_line
          best_start_column = range_start_column
          best_end_line = range_end_line
          best_end_column = range_end_column
          best_ordinal = ordinal
        end
        best_ordinal
      end

      def route_target(declaration, manifest, ordinal_by_name)
        normalized = normalize_singleton_class(declaration)
        workspace_ordinal = workspace_namespace_ordinal(normalized, ordinal_by_name)
        return [0, workspace_ordinal] if workspace_ordinal

        package_index, = dominant_package_definitions(declaration, manifest)
        package_index, = dominant_package_definitions(normalized, manifest) unless package_index || normalized.equal?(declaration)
        package_index ? [1, package_index] : nil
      end

      def workspace_namespace_ordinal(declaration, ordinal_by_name)
        current = normalize_singleton_class(declaration)
        seen = Set.new
        while current
          identity = [current.class.name, current.name]
          break unless seen.add?(identity)

          return ordinal_by_name[current.name] if namespace?(current) && ordinal_by_name.key?(current.name)

          current = normalize_singleton_class(current.owner)
        end
        nil
      rescue StandardError
        nil
      end

      def normalize_singleton_class(declaration)
        declaration.is_a?(Rubydex::SingletonClass) ? declaration.attached_class : declaration
      rescue StandardError
        declaration
      end

      def dominant_package_definitions(declaration, manifest)
        grouped = declaration.definitions.group_by do |definition|
          manifest.package_index_for(location_path(definition.location))
        rescue StandardError
          nil
        end
        grouped.reject { |index, _records| index.nil? }
          .max_by { |index, records| [records.length, -index] }
      rescue StandardError
        nil
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

      def workspace_constructs(declarations, manifest)
        stats = { "core" => Array.new(4, 0), "tests" => Array.new(4, 0) }
        declarations.each do |declaration|
          construct_index = ruby_construct_index(declaration)
          next unless construct_index

          definitions = declaration.definitions.select do |definition|
            workspace_location?(definition.location, manifest)
          end
          next if definitions.empty?

          category = scope_for(definitions, manifest) == 1 ? "tests" : "core"
          stats.fetch(category)[construct_index] += 1
        rescue StandardError
          next
        end
        stats
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

      def site_key(location)
        [location_path(location), *location_span(location)]
      end

      def location_span(location)
        [location.start_line, location.start_column, location.end_line, location.end_column]
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
