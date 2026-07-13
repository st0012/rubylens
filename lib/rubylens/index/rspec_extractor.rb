# frozen_string_literal: true

require "set"
require "uri"

module RubyLens
  module Index
    class RSpecExtractor
      GROUP_METHODS = Set.new(%w[describe context]).freeze
      EXAMPLE_METHODS = Set.new(%w[it specify]).freeze
      SPEC_SEGMENTS = Set.new(%w[spec specs]).freeze
      PROXY_NAME_PREFIX = "RSpec example group #"

      Group = Data.define(:name, :component)
      Result = Data.define(:groups, :method_count)

      def call(graph:, manifest:)
        groups = []
        method_count = 0

        spec_files(manifest).each do |path, relative|
          document = graph.document(file_uri(path))
          next unless document

          group_references, example_count = references(document.method_references)
          method_count += example_count
          component = component_for(relative)
          group_references.each do |_line, _column, _name|
            groups << Group.new(
              format("%s%06d", PROXY_NAME_PREFIX, groups.length + 1),
              component,
            )
          end
        rescue URI::Error
          next
        end

        Result.new(groups.freeze, method_count)
      end

      private

      def spec_files(manifest)
        manifest.tracked_workspace_files.filter_map do |path|
          relative = manifest.relative_workspace_path(path)
          next unless relative&.end_with?(".rb")
          next unless relative.split(File::SEPARATOR).any? { |segment| SPEC_SEGMENTS.include?(segment) }

          [path, relative]
        end.sort_by(&:last)
      end

      def references(method_references)
        groups = []
        example_count = 0
        method_references.each do |reference|
          name = reference.name
          if GROUP_METHODS.include?(name)
            location = reference.location
            groups << [location.start_line, location.start_column, name]
          elsif EXAMPLE_METHODS.include?(name)
            example_count += 1
          end
        end
        [groups.sort, example_count]
      end

      def file_uri(path)
        normalized = path.to_s.tr("\\", "/")
        normalized = "/#{normalized}" if normalized.match?(/\A[A-Za-z]:\//)
        escaped = URI::RFC2396_PARSER.escape(normalized)
        URI::Generic.build(scheme: "file", path: escaped).to_s
      end

      def component_for(relative)
        segments = relative.split(File::SEPARATOR)
        first = segments.first || "root"
        if %w[lib app test tests spec specs].include?(first)
          "#{first}/#{segments[1] || "root"}"
        else
          first
        end
      end
    end
  end
end
