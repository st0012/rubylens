# frozen_string_literal: true

require "pathname"
require "yaml"

module RubyLens
  class Configuration
    Rule = Data.define(:id, :label, :paths, :each, :id_prefix, :order)
    Ungrouped = Data.define(:mode, :label)

    TOP_LEVEL_KEYS = %w[version boundaries].freeze
    BOUNDARY_KEYS = %w[groups ungrouped].freeze
    EXPLICIT_GROUP_KEYS = %w[id label paths].freeze
    EXPANDED_GROUP_KEYS = %w[each id_prefix label].freeze
    UNGROUPED_KEYS = %w[mode label].freeze
    ID_PATTERN = /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/
    LABEL_PATTERN = /%\{basename\}/

    attr_reader :rules, :ungrouped, :source

    def self.disabled
      new(rules: [], ungrouped: nil, source: :disabled)
    end

    def self.resolve(root:, path: nil, disabled: false)
      raise Error, "--config and --no-config cannot be used together" if path && disabled
      return self.disabled if disabled

      if path
        config_path = Pathname(path).expand_path
        raise Error, "configuration file not found: #{path}" unless config_path.file?

        return load(config_path, source: :explicit)
      end

      discovered = Pathname(root).expand_path.join(".rubylens.yml")
      return load(discovered, source: :discovered) if discovered.file?

      new(rules: [], ungrouped: nil, source: :absent)
    end

    def self.load(path, source:)
      contents = path.read
      validate_yaml_stream(contents)
      document = YAML.safe_load(contents, permitted_classes: [], permitted_symbols: [], aliases: false)
      raise Error, "configuration must be a mapping" unless document.is_a?(Hash)

      validate_keys(document, TOP_LEVEL_KEYS, "configuration")
      raise Error, "unsupported configuration version: #{document["version"].inspect}" unless document["version"] == 1

      boundaries = document.fetch("boundaries") { raise Error, "configuration is missing boundaries" }
      raise Error, "boundaries must be a mapping" unless boundaries.is_a?(Hash)

      validate_keys(boundaries, BOUNDARY_KEYS, "boundaries")
      groups = boundaries.fetch("groups") { raise Error, "boundaries is missing groups" }
      raise Error, "boundaries.groups must be an array" unless groups.is_a?(Array)

      rules = groups.each_with_index.map { |group, index| parse_rule(group, index) }
      validate_explicit_ids(rules)
      ungrouped = parse_ungrouped(boundaries.fetch("ungrouped", { "mode" => "group", "label" => "Other" }))
      new(rules:, ungrouped:, source:)
    rescue Psych::Exception => error
      raise Error, "configuration YAML is unsafe or invalid: #{error.message}"
    rescue Errno::ENOENT, Errno::EACCES => error
      raise Error, "configuration could not be read: #{error.message}"
    end

    def initialize(rules:, ungrouped:, source:)
      @rules = rules.freeze
      @ungrouped = ungrouped
      @source = source
      freeze
    end

    def configured?
      source == :explicit || source == :discovered
    end

    class << self
      private

      def parse_rule(group, index)
        raise Error, "boundaries.groups[#{index}] must be a mapping" unless group.is_a?(Hash)

        if group.key?("paths")
          validate_keys(group, EXPLICIT_GROUP_KEYS, "boundaries.groups[#{index}]")
          require_keys(group, EXPLICIT_GROUP_KEYS, "boundaries.groups[#{index}]")
          paths = group.fetch("paths")
          raise Error, "boundaries.groups[#{index}].paths must be a nonempty array" unless paths.is_a?(Array) && !paths.empty?

          paths.each { |glob| validate_glob(glob, expanded: false) }
          validate_id(group.fetch("id"), "boundaries.groups[#{index}].id")
          validate_label(group.fetch("label"), "boundaries.groups[#{index}].label", template: false)
          Rule.new(id: group.fetch("id"), label: group.fetch("label"), paths: paths.freeze,
            each: nil, id_prefix: nil, order: index)
        elsif group.key?("each")
          validate_keys(group, EXPANDED_GROUP_KEYS, "boundaries.groups[#{index}]")
          require_keys(group, EXPANDED_GROUP_KEYS, "boundaries.groups[#{index}]")
          validate_glob(group.fetch("each"), expanded: true)
          validate_id(group.fetch("id_prefix"), "boundaries.groups[#{index}].id_prefix")
          validate_label(group.fetch("label"), "boundaries.groups[#{index}].label", template: true)
          Rule.new(id: nil, label: group.fetch("label"), paths: nil, each: group.fetch("each"),
            id_prefix: group.fetch("id_prefix"), order: index)
        else
          raise Error, "boundaries.groups[#{index}] must contain paths or each"
        end
      end

      def validate_yaml_stream(contents)
        stream = Psych.parse_stream(contents)
        root = stream.children.first&.children&.first
        empty_scalar = root.is_a?(Psych::Nodes::Scalar) && root.value.empty?
        unless stream.children.length == 1 && root && !empty_scalar
          raise Error, "configuration must contain exactly one nonempty YAML document"
        end

        pending = stream.children.dup
        until pending.empty?
          node = pending.pop
          pending.concat(Array(node.children)) if node.respond_to?(:children)
          next unless node.is_a?(Psych::Nodes::Mapping)

          keys = node.children.each_slice(2).filter_map do |key, _value|
            key.value if key.is_a?(Psych::Nodes::Scalar)
          end
          duplicate = keys.tally.find { |_key, count| count > 1 }&.first
          raise Error, "duplicate configuration key: #{duplicate}" if duplicate
        end
      end

      def parse_ungrouped(value)
        raise Error, "boundaries.ungrouped must be a mapping" unless value.is_a?(Hash)

        validate_keys(value, UNGROUPED_KEYS, "boundaries.ungrouped")
        require_keys(value, ["mode"], "boundaries.ungrouped")
        mode = value.fetch("mode")
        raise Error, "boundaries.ungrouped.mode must be group or error" unless %w[group error].include?(mode)
        label = value.fetch("label", "Other")
        raise Error, "boundaries.ungrouped.label is only valid with group mode" if mode == "error" && value.key?("label")

        validate_label(label, "boundaries.ungrouped.label", template: false)
        Ungrouped.new(mode:, label:)
      end

      def validate_keys(value, allowed, context)
        non_string = value.keys.reject { |key| key.is_a?(String) }
        raise Error, "#{context} keys must be strings" unless non_string.empty?

        unknown = value.keys - allowed
        raise Error, "unknown #{context} key: #{unknown.first}" unless unknown.empty?
      end

      def require_keys(value, required, context)
        missing = required - value.keys
        raise Error, "#{context} is missing #{missing.first}" unless missing.empty?
      end

      def validate_id(value, context)
        raise Error, "#{context} must be a lowercase dash-separated identifier" unless value.is_a?(String) && ID_PATTERN.match?(value)
      end

      def validate_label(value, context, template:)
        raise Error, "#{context} must be a nonempty string" unless value.is_a?(String) && !value.empty?
        return unless value.include?("%{")

        valid = template && value.scan(/%\{[^}]*\}/).all? { |token| token == "%{basename}" } &&
          !value.gsub(LABEL_PATTERN, "").include?("%{")
        raise Error, "#{context} only supports the %{basename} template" unless valid
      end

      def validate_glob(value, expanded:)
        raise Error, "boundary glob must be a string" unless value.is_a?(String)
        raise Error, "boundary glob must use normalized relative paths" if value.empty? || value.start_with?("/") || value.include?("\\")

        segments = value.split("/", -1)
        if segments.any? { |segment| segment.empty? || segment == "." || segment == ".." }
          raise Error, "boundary glob contains an escaping or empty path segment"
        end
        if segments.any? { |segment| segment.match?(/[?\[\]{}]/) || (segment.include?("*") && !%w[* **].include?(segment)) }
          raise Error, "boundary glob uses an unsupported form: #{value}"
        end
        if segments.count { |segment| segment == "**" } > 1 || (segments.include?("**") && segments.last != "**")
          raise Error, "boundary glob only supports ** as the final segment"
        end
        if expanded && (segments.count("*") != 1 || segments.last != "*" || segments.include?("**"))
          raise Error, "each must end in exactly one * segment"
        end
      end

      def validate_explicit_ids(rules)
        duplicate = rules.filter_map(&:id).tally.find { |_id, count| count > 1 }&.first
        raise Error, "duplicate boundary group id: #{duplicate}" if duplicate
      end
    end
  end
end
