# frozen_string_literal: true

require "set"
require_relative "source_path"

module RubyLens
  module Index
    class RSpecExtractor
      GROUP_METHODS = Set.new(%w[describe context]).freeze
      EXAMPLE_METHODS = Set.new(%w[it specify]).freeze
      SPEC_SEGMENTS = Set.new(%w[spec specs]).freeze
      PROXY_NAME_PREFIX = "RSpec example group #"

      Group = Data.define(:name, :component)
      Result = Data.define(:groups, :method_count)

      def call(graph:, manifest:, package_document_paths: Set.new)
        groups = []
        method_count = 0

        spec_documents(graph, manifest, package_document_paths).each do |document, relative|
          group_count, example_count = reference_counts(document.method_references)
          method_count += example_count
          component = SourcePath.component_for(relative)
          group_count.times do
            groups << Group.new(
              format("%s%06d", PROXY_NAME_PREFIX, groups.length + 1),
              component,
            )
          end
        end

        Result.new(groups.freeze, method_count)
      end

      private

      def spec_documents(graph, manifest, package_document_paths)
        graph.documents.filter_map do |document|
          path = SourcePath.from_file_uri(document.uri)
          next unless path && manifest.workspace_path?(path)
          next if package_document_paths.include?(path)

          relative = manifest.relative_workspace_path(path)
          next unless relative&.end_with?(".rb")
          next unless relative.split(File::SEPARATOR).any? { |segment| SPEC_SEGMENTS.include?(segment) }

          [document, relative]
        end.sort_by { |_document, relative| relative }
      end

      # Proxy groups are numbered by document order and never expose spec text or
      # positions, so only the per-document reference tallies matter.
      def reference_counts(method_references)
        group_count = 0
        example_count = 0
        method_references.each do |reference|
          name = reference.name
          if GROUP_METHODS.include?(name)
            group_count += 1
          elsif EXAMPLE_METHODS.include?(name)
            example_count += 1
          end
        end
        [group_count, example_count]
      end
    end
  end
end
