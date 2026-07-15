# frozen_string_literal: true

require "pathname"
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
          group_references, example_count = references(document.method_references)
          method_count += example_count
          component = component_for(relative)
          group_references.each do
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

          path = Pathname(path).realpath.to_s
          next unless manifest.workspace_path?(path)
          next if package_document_paths.include?(path)

          relative = manifest.relative_workspace_path(path)
          next unless relative&.end_with?(".rb")
          next unless relative.split(File::SEPARATOR).any? { |segment| SPEC_SEGMENTS.include?(segment) }

          [document, relative]
        rescue Errno::EACCES, Errno::ENOENT, Errno::ELOOP
          nil
        end.sort_by { |_document, relative| relative }
      end

      def references(method_references)
        relevant = method_references.filter_map do |reference|
          name = reference.name
          next unless GROUP_METHODS.include?(name) || EXAMPLE_METHODS.include?(name)

          location = reference.location
          [*location.comparable_values, name]
        end.sort
        [
          relevant.select { |reference| GROUP_METHODS.include?(reference.last) },
          relevant.count { |reference| EXAMPLE_METHODS.include?(reference.last) },
        ]
      end

      def component_for(relative)
        SourcePath.component_for(relative)
      end
    end
  end
end
