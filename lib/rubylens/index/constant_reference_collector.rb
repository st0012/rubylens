# frozen_string_literal: true

require "rubydex"
require "set"

module RubyLens
  module Index
    # Turns Rubydex's resolved constant references into two different things:
    # the complete inbound reference count for every workspace namespace, and a
    # bounded sample of directed links the renderer animates as travel.
    #
    # The two have deliberately different contracts. Counts are exact. Links
    # stop at the limits below and are never ranked, so they are a visual
    # sample and must not be read as a complete relationship or call graph.
    class ConstantReferenceCollector
      LINK_LIMIT = 1_024
      ATTRIBUTION_LIMIT = LINK_LIMIT * 2

      # `inbound_counts` is keyed by namespace ordinal, absent meaning zero;
      # each link is [referring namespace ordinal, referenced endpoint ordinal].
      Summary = Data.define(
        :inbound_counts, #: Hash[Integer, Integer]
        :links, #: Array[[Integer, Integer]]
      )

      #: (locations: LocationIndex) -> void
      def initialize(locations:)
        @locations = locations
      end

      # `namespaces` are the collector's workspace namespaces in ordinal order;
      # `ordinal_by_name` and `dependency_ordinal_by_name` address link
      # endpoints, with dependency ordinals offset past the namespace block.
      #
      #: (graph: Rubydex::Graph, namespaces: Array[DeclarationCollector::Namespace], definition_ranges: Hash[String, Array[DeclarationCollector::definition_range]], ordinal_by_name: Hash[String, Integer], dependency_ordinal_by_name: Hash[String, Integer], namespace_count: Integer) -> Summary
      def call(graph:, namespaces:, definition_ranges:, ordinal_by_name:, dependency_ordinal_by_name:, namespace_count:)
        Summary.new(
          inbound_counts: inbound_counts(namespaces),
          links: links(graph, definition_ranges, ordinal_by_name, dependency_ordinal_by_name, namespace_count),
        )
      end

      private

      # Asking each namespace for its own references is bounded by the
      # namespaces actually drawn, unlike scanning the global reference stream.
      #
      #: (Array[DeclarationCollector::Namespace]) -> Hash[Integer, Integer]
      def inbound_counts(namespaces)
        counts = Hash.new(0)
        namespaces.each_with_index do |namespace, index|
          namespace.declaration.references.each do |reference|
            uri = begin
              reference.document.uri
            rescue StandardError
              next
            end
            counts[index] += 1 if @locations.workspace?(uri)
          end
        end
        counts.freeze
      end

      #: (Rubydex::Graph, Hash[String, Array[DeclarationCollector::definition_range]], Hash[String, Integer], Hash[String, Integer], Integer) -> Array[[Integer, Integer]]
      def links(graph, definition_ranges, ordinal_by_name, dependency_ordinal_by_name, namespace_count)
        links = []
        retained = Set.new
        attributions = 0

        graph.constant_references.each do |reference|
          break if links.length >= LINK_LIMIT || attributions >= ATTRIBUTION_LIMIT
          next unless reference.is_a?(Rubydex::ResolvedConstantReference)

          name = referenced_name(reference)
          next unless name

          namespace_ordinal = ordinal_by_name[name]
          dependency_ordinal = dependency_ordinal_by_name[name] unless namespace_ordinal
          next unless namespace_ordinal || dependency_ordinal

          uri = begin
            reference.document.uri
          rescue StandardError
            next
          end
          next unless @locations.workspace?(uri)

          attributions += 1
          endpoint = namespace_ordinal || namespace_count + dependency_ordinal

          values = begin
            reference.location.comparable_values
          rescue StandardError
            next
          end
          origin = enclosing_namespace_ordinal(values, definition_ranges)
          next unless origin
          next if endpoint == origin

          link = [origin, endpoint]
          next unless retained.add?(link)

          links << link
        end

        links.freeze
      end

      #: (Rubydex::ResolvedConstantReference) -> String?
      def referenced_name(reference)
        reference.declaration.name
      rescue StandardError
        nil
      end

      # A reference belongs to the innermost namespace definition containing it.
      # Two definitions sharing the exact same span cannot be told apart, so the
      # reference is dropped rather than attributed to an arbitrary one.
      #
      #: (DeclarationCollector::site_key, Hash[String, Array[DeclarationCollector::definition_range]]) -> Integer?
      def enclosing_namespace_ordinal(location_values, ranges_by_uri)
        uri, start_line, start_column, end_line, end_column = location_values
        best = nil
        ambiguous = false
        ranges_by_uri.fetch(uri, []).each do |range|
          range_start_line, range_start_column, range_end_line, range_end_column, ordinal = range
          next if compare(range_start_line, range_start_column, start_line, start_column).positive?
          next if compare(range_end_line, range_end_column, end_line, end_column).negative?

          start_comparison = best ? compare(range_start_line, range_start_column, best[0], best[1]) : 1
          end_comparison = best && start_comparison.zero? ? compare(range_end_line, range_end_column, best[2], best[3]) : 0
          if start_comparison.positive? || (start_comparison.zero? && end_comparison.negative?)
            best = range
            ambiguous = false
          elsif start_comparison.zero? && end_comparison.zero? && ordinal != best[4]
            ambiguous = true
          end
        end

        ambiguous ? nil : best&.fetch(4)
      end

      #: (Integer, Integer, Integer, Integer) -> Integer
      def compare(left_line, left_column, right_line, right_column)
        line_comparison = left_line <=> right_line
        line_comparison.zero? ? left_column <=> right_column : line_comparison
      end
    end
  end
end
