# frozen_string_literal: true

module RubyLens
  module Model
    class GroupLayout
      def initialize(seeds:, namespace_counts:)
        raise ArgumentError, "seeds and namespace_counts must have the same length" unless seeds.length == namespace_counts.length

        @seeds = seeds
        @namespace_counts = namespace_counts
      end

      def anchors
        return [].freeze if @seeds.empty?

        side = ((@seeds.length * 2)**(1.0 / 3)).ceil
        side += 1 while side**3 < @seeds.length
        capacity = side**3
        spacing = 2 * system_radius(@namespace_counts.max || 0) + 12
        occupied = {}
        slots = Array.new(@seeds.length)
        @seeds.each_index.sort_by { |index| [@seeds[index], index] }.each do |index|
          slot = @seeds[index] % capacity
          slot = (slot + 1) % capacity while occupied.key?(slot)
          occupied[slot] = true
          slots[index] = slot
        end
        center = (side - 1) / 2.0
        slots.map do |slot|
          x = slot % side
          y = (slot / side) % side
          z = slot / (side * side)
          [
            ((x - center) * spacing).round,
            ((y - center) * spacing).round,
            ((z - center) * spacing).round,
          ].freeze
        end.freeze
      end

      def self.system_radius(namespace_count)
        6 + Math.sqrt(namespace_count) * 0.35
      end

      private

      def system_radius(namespace_count)
        self.class.system_radius(namespace_count)
      end
    end
  end
end
