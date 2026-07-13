# frozen_string_literal: true

require_relative "../rails_framework"

module RubyLens
  module Model
    class RailsFrameworkReference
      FRAMEWORK_GEMS = RailsFramework::GEMS
      FULL_FAMILY = "full_family"
      INSTALLED_FOOTPRINT = "installed_footprint"

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
        comparable = %w[ready ready_footprint].include?(status)
        {
          "kind" => "rails",
          "version" => @locked.version,
          "scope" => @locked.scope,
          "members" => expected_members,
          "available_members" => available_members,
          "coverage" => [available_members.length, expected_members.length],
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
          next unless expected_members.include?(package.name)
          next unless package.version == @locked.version
          next if package.files.empty?

          indexes[package.name] ||= index
        end
      end

      def comparison_status(available_members, index_complete, integrity_complete)
        return "unsupported_family_shape" unless [FULL_FAMILY, INSTALLED_FOOTPRINT].include?(@locked.scope)
        if @locked.scope == FULL_FAMILY
          return "unsupported_family_shape" unless FRAMEWORK_GEMS.all? { |name| @locked.members.include?(name) }
          return "rails_package_missing" unless rails_package_index
        end
        return @locked.scope == INSTALLED_FOOTPRINT ? "partial_footprint" : "partial_family" unless available_members == expected_members
        return "coverage_incomplete" unless index_complete && integrity_complete

        @locked.scope == INSTALLED_FOOTPRINT ? "ready_footprint" : "ready"
      end

      def expected_members
        @expected_members ||= if @locked.scope == FULL_FAMILY
          FRAMEWORK_GEMS
        else
          FRAMEWORK_GEMS.select { |name| @locked.members.include?(name) }.freeze
        end
      end

      def rails_package_index
        return unless @locked.scope == FULL_FAMILY

        @manifest.packages.index { |package| package.name == "rails" && package.version == @locked.version }
      end
    end
  end
end
