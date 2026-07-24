# frozen_string_literal: true

require "rubydex"
require "set"
require_relative "constant_reference_collector"
require_relative "declaration_collector"
require_relative "location_index"
require_relative "rspec_extractor"

module RubyLens
  module Index
    # Drives one Rubydex indexing run over the manifest and assembles the
    # snapshot payload from what the collectors return.
    #
    # The snapshot is the privacy boundary: every namespace and dependency star
    # leaves here as a row of integers, and the only strings that survive are
    # namespace names, package names, and the project name.
    class RubydexAdapter
      SCHEMA = "rubylens.snapshot.v9"
      RSPEC_ROW = [0, 1, *Array.new(11, 0)].freeze

      def initialize(manifest)
        @manifest = manifest
        @locations = LocationIndex.new(manifest)
      end

      def index
        graph = Rubydex::Graph.new(workspace_path: @manifest.root.to_s)
        index_errors = graph.index_all(@manifest.files)
        # Documents resolve before `resolve` so package attribution sees exactly
        # the documents Rubydex accepted, not the paths the manifest offered.
        documents_with_paths = @locations.resolve_documents(graph)
        graph.resolve
        integrity_failures = graph.check_integrity

        collected = DeclarationCollector.new(manifest: @manifest, locations: @locations).call(graph.declarations)
        rspec = RSpecExtractor.new(
          graph: graph,
          manifest: @manifest,
          package_document_paths: @locations.package_document_paths,
          documents_with_paths: documents_with_paths,
        ).call

        namespaces = collected.namespaces
        namespace_names = namespaces.map(&:name) + rspec.groups
        references = ConstantReferenceCollector.new(locations: @locations).call(
          graph: graph,
          namespaces: namespaces,
          definition_ranges: collected.definition_ranges,
          ordinal_by_name: ordinal_by_name(namespaces),
          dependency_ordinal_by_name: collected.dependency_ordinal_by_name,
          namespace_count: namespace_names.length,
        )

        category_stats = collected.category_stats
        category_stats.fetch("tests")[0] += rspec.groups.length
        category_stats.fetch("tests")[2] += rspec.method_count

        {
          "schema" => SCHEMA,
          "project_name" => project_name,
          "namespace_names" => namespace_names,
          "namespaces" => namespace_rows(namespaces, references.inbound_counts, rspec.groups.length),
          "constant_reference_links" => references.links,
          "category_stats" => category_stats,
          "dependency_signal_maxima" => collected.dependency_signal_maxima,
          "packages" => package_rows(collected.dependency_packages),
          "dependency_systems" => dependency_system_rows,
          "dependency_warnings" => @manifest.respond_to?(:dependency_warnings) ? @manifest.dependency_warnings : [],
          "warning_counts" => {
            "manifest" => @manifest.warnings.length,
            "index" => index_errors.length,
            "integrity" => integrity_failures.length,
          },
        }
      end

      private

      def ordinal_by_name(namespaces)
        ordinals = {}
        namespaces.each_with_index { |namespace, index| ordinals[namespace.name] = index }
        ordinals
      end

      def namespace_rows(namespaces, inbound_counts, rspec_group_count)
        drawn_names = ordinal_by_name(namespaces)
        rows = namespaces.each_with_index.map do |namespace, index|
          declaration = namespace.declaration
          sites = namespace.definition_sites
          # A namespace only earns a row through a class or module definition,
          # so its own construct is exactly this kind.
          kind = declaration.is_a?(Rubydex::Class) ? DeclarationCollector::CLASS : DeclarationCollector::MODULE
          descendants = declaration.descendants.count do |descendant|
            name = descendant.name
            name != namespace.name && drawn_names.key?(name)
          end
          members, ruby_counts, instance_variables = member_statistics(
            declaration,
            kind: kind,
            # Instance variables read as state on a class; test classes carry
            # fixture state that would misrepresent them next to core classes.
            count_instance_variables: kind == DeclarationCollector::CLASS && namespace.scope != LocationIndex::TEST,
          )
          [
            kind,
            namespace.scope,
            [declaration.ancestors.count - 1, 0].max,
            sites,
            [sites - 1, 0].max,
            descendants,
            inbound_counts.fetch(index, 0),
            members,
            *ruby_counts,
            instance_variables,
          ]
        end
        rows.concat(Array.new(rspec_group_count) { RSPEC_ROW.dup })
      end

      # One sweep over a namespace's direct and singleton members yields the
      # workspace member count, the method and constant construct counts, and
      # the instance-variable count together, since each of the three otherwise
      # re-reads every member's definitions.
      def member_statistics(declaration, kind:, count_instance_variables:)
        members = 0
        instance_variables = 0
        ruby_counts = Array.new(4, 0)
        ruby_counts[kind] += 1

        seen = Set.new
        groups = [[declaration.members, true]]
        singleton = declaration.singleton_class
        groups << [singleton.members, false] if singleton
        groups.each do |group, direct|
          group.each do |member|
            next unless seen.add?(member.name)
            next unless member.definitions.any? { |definition| @locations.workspace?(definition.location) }

            members += 1
            construct = case member
            when Rubydex::Method then DeclarationCollector::METHOD
            when Rubydex::Constant, Rubydex::ConstantAlias then DeclarationCollector::CONSTANT
            end
            ruby_counts[construct] += 1 if construct
            instance_variables += 1 if direct && count_instance_variables && member.is_a?(Rubydex::InstanceVariable)
          end
        end
        [members, ruby_counts, instance_variables]
      rescue StandardError
        [members, ruby_counts, instance_variables]
      end

      def package_rows(aggregates)
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

      def dependency_system_rows
        return [] unless @manifest.respond_to?(:dependency_systems)

        @manifest.dependency_systems.map do |system|
          {
            "id" => system.id,
            "package_indexes" => system.package_indexes,
            "label_package_index" => system.label_package_index,
          }
        end
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
