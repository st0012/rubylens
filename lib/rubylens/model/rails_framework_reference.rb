# frozen_string_literal: true

module RubyLens
  module Model
    class RailsFrameworkReference
      FRAMEWORK_GEMS = %w[
        actioncable
        actionmailbox
        actionmailer
        actionpack
        actiontext
        actionview
        activejob
        activemodel
        activerecord
        activestorage
        activesupport
        railties
      ].freeze

      attr_reader :family_package_indexes

      def initialize(manifest)
        @manifest = manifest
        @locked = manifest.rails_reference if manifest.respond_to?(:rails_reference)
        @classes = 0
        @modules = 0
        @family_package_indexes = aligned_family_package_indexes.freeze
      end

      def detected?
        !@locked.nil?
      end

      def family_package_index?(index)
        @family_package_indexes.value?(index)
      end

      def add_namespace(kind)
        case kind
        when 0 then @classes += 1
        when 1 then @modules += 1
        else raise ArgumentError, "Rails framework namespaces must be classes or modules"
        end
      end

      def build(index_complete:, integrity_complete:)
        return unless detected?

        available_members = FRAMEWORK_GEMS.select { |name| @family_package_indexes.key?(name) }
        status = comparison_status(available_members, index_complete, integrity_complete)
        comparable = status == "ready"
        {
          "kind" => "rails",
          "version" => @locked.version,
          "members" => FRAMEWORK_GEMS,
          "available_members" => available_members,
          "coverage" => [available_members.length, FRAMEWORK_GEMS.length],
          "status" => status,
          "comparable" => comparable,
          "ruby_counts" => comparable ? [@classes, @modules] : [],
          "package_index" => rails_package_index,
        }
      end

      private

      def aligned_family_package_indexes
        return {} unless detected?

        @manifest.packages.each_with_index.each_with_object({}) do |(package, index), indexes|
          next unless FRAMEWORK_GEMS.include?(package.name)
          next unless package.version == @locked.version
          next if package.files.empty?

          indexes[package.name] ||= index
        end
      end

      def comparison_status(available_members, index_complete, integrity_complete)
        return "unsupported_family_shape" unless FRAMEWORK_GEMS.all? { |name| @locked.direct_dependencies.include?(name) }
        return "rails_package_missing" unless rails_package_index
        return "partial_family" unless available_members == FRAMEWORK_GEMS
        return "coverage_incomplete" unless index_complete && integrity_complete

        "ready"
      end

      def rails_package_index
        @manifest.packages.index { |package| package.name == "rails" && package.version == @locked.version }
      end
    end
  end
end
