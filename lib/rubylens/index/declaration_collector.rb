# frozen_string_literal: true

require "rubydex"
require_relative "../model/dependency_aggregation"

module RubyLens
  module Index
    # Streams Rubydex's declarations once and splits them into the three
    # populations the snapshot needs: workspace namespaces that become scene
    # points, Ruby construct tallies per category, and dependency declaration
    # rows aggregated per package.
    #
    # It is a single pass because Rubydex materializes a new wrapper for every
    # accessor call, so revisiting the stream costs as much as producing it.
    class DeclarationCollector
      # Shapes shared with the other collectors. A site key is a definition's
      # location flattened for comparison and grouping; a definition range is a
      # namespace's span within one file, tagged with the namespace's ordinal.
      #
      # @rbs!
      #   type site_key = [String, Integer, Integer, Integer, Integer]
      #   type definition_range = [Integer, Integer, Integer, Integer, Integer]
      #   type dependency_package = { ruby_counts: Array[Integer], declarations: Array[Array[Integer]] }

      # A workspace namespace that earned a scene point, with the canonical
      # definition sites that decide where its constant references land.
      Namespace = Data.define(
        :declaration, #: Rubydex::Namespace
        :name, #: String
        :definition_sites, #: Integer
        :scope, #: Integer
      )

      Result = Data.define(
        :namespaces, #: Array[Namespace]
        :definition_ranges, #: Hash[String, Array[definition_range]]
        :category_stats, #: Hash[String, Array[Integer]]
        :dependency_packages, #: Array[dependency_package]
        :dependency_signal_maxima, #: Array[Integer]
        :dependency_ordinal_by_name, #: Hash[String, Integer]
      )

      CLASS = 0
      MODULE = 1
      METHOD = 2
      CONSTANT = 3
      OTHER_KIND = 2
      MIXED_SCOPE = 2

      #: (manifest: untyped, locations: LocationIndex) -> void
      def initialize(manifest:, locations:)
        @manifest = manifest
        @locations = locations
      end

      #: (Enumerable[Rubydex::Declaration]) -> Result
      def call(declarations)
        namespaces = []
        category_stats = { "core" => Array.new(4, 0), "tests" => Array.new(4, 0) }
        aggregation = Model::DependencyAggregation.new(package_count: @manifest.packages.length)
        definition_ranges = Hash.new { |ranges, uri| ranges[uri] = [] }
        dependency_positions = {}

        declarations.each do |declaration|
          name = declaration.name
          next unless eligible?(declaration, name)

          namespace = declaration.is_a?(Rubydex::Namespace)
          construct = construct_index(declaration)
          # Destructured immediately rather than wrapped: this runs once per
          # declaration in the largest loop RubyLens has, and the names below
          # are the only place these five values are ever read.
          workspace_count, tests_only, site_keys, canonical_scope, package_site_keys =
            summarize(declaration, namespace)

          if site_keys
            site_keys = site_keys.uniq if site_keys.length > 1
            ordinal = namespaces.length
            site_keys.each do |uri, start_line, start_column, end_line, end_column|
              definition_ranges[uri] << [start_line, start_column, end_line, end_column, ordinal]
            end
            namespaces << Namespace.new(
              declaration: declaration,
              name: name,
              definition_sites: site_keys.length,
              scope: canonical_scope,
            )
          end
          if construct && workspace_count.positive?
            category_stats.fetch(tests_only ? "tests" : "core")[construct] += 1
          end
          if package_site_keys
            collect_dependency(
              aggregation, dependency_positions, declaration, name, namespace, construct, package_site_keys
            )
          end
        end

        Result.new(
          namespaces: namespaces,
          definition_ranges: definition_ranges,
          category_stats: category_stats,
          dependency_packages: aggregation.packages,
          dependency_signal_maxima: aggregation.signal_maxima,
          dependency_ordinal_by_name: global_dependency_ordinals(aggregation.packages, dependency_positions),
        )
      end

      # Rubydex reports synthetic declarations RubyLens never draws: anonymous
      # namespaces, Todo placeholders standing in for unresolved constants, and
      # singleton classes attached to either.
      #
      #: (Rubydex::Declaration, ?String?) -> bool
      def eligible?(declaration, name = declaration.name)
        return false if name.nil? || name.empty? || name.include?("<anonymous>")
        return false if declaration.is_a?(Rubydex::Todo)
        return true unless declaration.is_a?(Rubydex::SingletonClass)

        attached = declaration.attached_class
        !attached.is_a?(Rubydex::SingletonClass) && !attached.is_a?(Rubydex::Todo)
      end

      #: (Rubydex::Declaration) -> Integer?
      def construct_index(declaration)
        case declaration
        when Rubydex::SingletonClass then nil
        when Rubydex::Class then CLASS
        when Rubydex::Module then MODULE
        when Rubydex::Method then METHOD
        when Rubydex::Constant, Rubydex::ConstantAlias then CONSTANT
        end
      end

      private

      # One pass over a declaration's definitions, so each definition's URI and
      # its per-URI workspace, scope, and package answers are read once. The URI
      # comes from the definition's document, which is cheaper than a Location,
      # so a Location is materialized only for the definitions that contribute a
      # site key. Returns [workspace_count, tests_only, canonical_site_keys,
      # canonical_scope, package_site_keys]; the site-key collections stay nil
      # until a definition contributes one, since most declarations contribute
      # neither a canonical namespace site nor a package site.
      #
      #: (Rubydex::Declaration, bool) -> [Integer, bool, Array[site_key]?, Integer, Hash[Integer, Array[site_key]]?]
      def summarize(declaration, namespace)
        workspace_count = 0
        tests_seen = false
        core_seen = false
        canonical_tests_seen = false
        canonical_core_seen = false
        canonical_site_keys = nil
        package_site_keys = nil

        declaration.definitions.each do |definition|
          uri = definition.document.uri
          site_key = nil
          if @locations.workspace?(uri)
            workspace_count += 1
            scope = @locations.scope_for(uri)
            if scope == LocationIndex::TEST
              tests_seen = true
            elsif scope
              core_seen = true
            end
            if namespace && canonical_definition?(declaration, definition)
              (canonical_site_keys ||= []) << (site_key = definition.location.comparable_values)
              if scope == LocationIndex::TEST
                canonical_tests_seen = true
              elsif scope
                canonical_core_seen = true
              end
            end
          end
          package_index = @locations.package_index_for(uri)
          if package_index
            ((package_site_keys ||= {})[package_index] ||= []) << (site_key || definition.location.comparable_values)
          end
        end

        [
          workspace_count,
          tests_seen && !core_seen,
          canonical_site_keys,
          canonical_scope(canonical_tests_seen, canonical_core_seen),
          package_site_keys,
        ]
      end

      #: (bool, bool) -> Integer
      def canonical_scope(tests_seen, core_seen)
        return LocationIndex::CORE unless tests_seen

        core_seen ? MIXED_SCOPE : LocationIndex::TEST
      end

      # A declaration reopened across packages is attributed to the one holding
      # the most of its definitions, ties going to the earliest package.
      #
      #: (Model::DependencyAggregation, Hash[String, [Integer, Integer]], Rubydex::Declaration, String, bool, Integer?, Hash[Integer, Array[site_key]]) -> void
      def collect_dependency(aggregation, positions, declaration, name, namespace, construct, package_site_keys)
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
        references = length_of(declaration, :references)
        row = [
          namespace_kind(declaration),
          namespace ? [declaration.ancestors.count - 1, 0].max : 0,
          sites,
          [sites - 1, 0].max,
          namespace ? [declaration.descendants.count - 1, 0].max : 0,
          references,
          namespace ? length_of(declaration, :members) : 0,
        ].freeze
        local_index = aggregation.add(package_index: package_index, row: row, construct_index: construct)
        if references.positive? && constant_reference_target?(declaration, namespace)
          positions[name] = [package_index, local_index]
        end
      end

      # Dependency stars are addressed by a single ordinal spanning every
      # package, so per-package positions are rebased onto that flat sequence.
      #
      #: (Array[dependency_package], Hash[String, [Integer, Integer]]) -> Hash[String, Integer]
      def global_dependency_ordinals(packages, positions)
        offsets = []
        offset = 0
        packages.each do |package|
          offsets << offset
          offset += package.fetch(:declarations).length
        end
        positions.transform_values! do |package_index, local_index|
          offsets.fetch(package_index) + local_index
        end
        positions.freeze
      end

      #: (Rubydex::Declaration) -> Integer
      def namespace_kind(declaration)
        case declaration
        when Rubydex::Class then CLASS
        when Rubydex::Module then MODULE
        else OTHER_KIND
        end
      end

      #: (Rubydex::Declaration, bool) -> bool
      def constant_reference_target?(declaration, namespace)
        namespace ||
          declaration.is_a?(Rubydex::Constant) ||
          declaration.is_a?(Rubydex::ConstantAlias)
      end

      #: (Rubydex::Declaration, Rubydex::Definition) -> bool
      def canonical_definition?(declaration, definition)
        (declaration.is_a?(Rubydex::Class) && definition.is_a?(Rubydex::ClassDefinition)) ||
          (declaration.is_a?(Rubydex::Module) && definition.is_a?(Rubydex::ModuleDefinition))
      end

      # Rubydex collections expose size on some shapes and only count on others,
      # and this pre-1.0 interface can raise from either. A dependency star that
      # cannot report a signal is still a real declaration, so an unreadable
      # count degrades to zero rather than losing the row.
      #
      #: (untyped, Symbol) -> Integer
      def length_of(object, name)
        records = object.public_send(name)
        size = records.size
        size.nil? ? count_of(records) : size
      rescue StandardError
        count_of(records)
      end

      #: (untyped) -> Integer
      def count_of(records)
        records ? records.count : 0
      rescue StandardError
        0
      end
    end
  end
end
