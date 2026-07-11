# frozen_string_literal: true

module RubyLens
  module Index
    class Boundaries
      Group = Data.define(:id, :label, :rule_order, :paths)

      attr_reader :groups, :ungrouped, :source

      def self.build(root:, workspace_files:, configuration:)
        new(root:, workspace_files:, configuration:).build
      end

      def initialize(root:, workspace_files:, configuration:)
        @root = Pathname(root)
        @workspace_paths = workspace_files.map do |path|
          Pathname(path).relative_path_from(@root).each_filename.to_a.join("/")
        end.freeze
        @configuration = configuration
      end

      def build
        @source = @configuration.source
        @groups = @configuration.rules.flat_map do |rule|
          rule.each ? expanded_groups(rule) : explicit_group(rule)
        end
        validate_generated_ids
        @groups.freeze
        @ungrouped = @configuration.ungrouped
        freeze
      end

      def configured?
        @configuration.configured?
      end

      private

      def explicit_group(rule)
        [Group.new(id: rule.id, label: rule.label, rule_order: rule.order, paths: rule.paths)]
      end

      def expanded_groups(rule)
        prefix = rule.each.delete_suffix("*")
        basenames = @workspace_paths.filter_map do |path|
          next unless path.start_with?(prefix)

          remainder = path.delete_prefix(prefix)
          basename, descendant = remainder.split("/", 2)
          next unless descendant

          basename unless basename.nil? || basename.empty?
        end.uniq.sort
        basenames.map do |basename|
          id = "#{rule.id_prefix}-#{normalize_id(basename)}"
          label = rule.label.gsub("%{basename}", basename)
          Group.new(id:, label:, rule_order: rule.order, paths: ["#{prefix}#{basename}/**"].freeze)
        end
      end

      def normalize_id(value)
        normalized = value.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-\z/, "")
        raise Error, "boundary directory cannot produce a stable group id: #{value}" if normalized.empty?

        normalized
      end

      def validate_generated_ids
        duplicate = @groups.map(&:id).tally.find { |_id, count| count > 1 }&.first
        raise Error, "duplicate or colliding boundary group id: #{duplicate}" if duplicate
      end
    end
  end
end
