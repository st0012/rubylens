# frozen_string_literal: true

module RubyLens
  module Model
    class WorkspaceLayout
      POPULATION_KNEE = 50_000.0
      MIN_RADIUS = 4.0
      KNEE_RADIUS = 42.0
      SMALL_EXPONENT = 0.32
      MID_EXPONENT = 0.35
      LARGE_EXPONENT = 0.58
      LARGE_THRESHOLD = 8.0
      FULL_TURN = Math::PI * 2

      attr_reader :radius

      def initialize(seeds:, namespace_counts:, radius_population:)
        unless seeds.length == namespace_counts.length
          raise ArgumentError, "seeds and namespace_counts must have the same length"
        end
        raise ArgumentError, "namespace_counts must be nonnegative" if namespace_counts.any?(&:negative?)

        @seeds = seeds
        @namespace_counts = namespace_counts
        @radius = self.class.radius(radius_population)
      end

      def self.radius(namespace_count)
        raise ArgumentError, "namespace_count must be nonnegative" if namespace_count.negative?
        return 0.0 if namespace_count.zero?

        population = namespace_count.fdiv(POPULATION_KNEE)
        if population <= 1
          MIN_RADIUS + (KNEE_RADIUS - MIN_RADIUS) * population**SMALL_EXPONENT
        elsif population <= LARGE_THRESHOLD
          KNEE_RADIUS * population**MID_EXPONENT
        else
          KNEE_RADIUS * LARGE_THRESHOLD**MID_EXPONENT *
            (population / LARGE_THRESHOLD)**LARGE_EXPONENT
        end
      end

      def bounds
        geometry.fetch(:bounds)
      end

      def centroids
        geometry.fetch(:centroids)
      end

      private

      def geometry
        @geometry ||= begin
          total = @namespace_counts.sum
          active = @namespace_counts.each_index.select { |index| @namespace_counts[index].positive? }
          bounds = Array.new(@seeds.length) { [0.0, 0.0, 0.0, 0.0].freeze }
          centroids = Array.new(@seeds.length) { [0.0, 0.0, 0.0].freeze }
          unless active.empty? || total.zero? || @radius.zero?
            order = active.sort_by { |index| [@seeds[index], index] }
            rotation = seed_unit(order.sum { |index| @seeds[index] }) * FULL_TURN
            cursor = rotation
            order.each do |index|
              span = FULL_TURN * @namespace_counts[index].fdiv(total)
              start_angle = cursor
              end_angle = cursor + span
              center_angle = start_angle + span / 2
              centroid_radius = @radius * (0.34 + seed_unit(@seeds[index]) * 0.34)
              bounds[index] = [start_angle, end_angle, 0.0, @radius].freeze
              centroids[index] = [
                Math.cos(center_angle) * centroid_radius,
                0.0,
                Math.sin(center_angle) * centroid_radius,
              ].freeze
              cursor = end_angle
            end
          end
          { bounds: bounds.freeze, centroids: centroids.freeze }.freeze
        end
      end

      def seed_unit(seed)
        value = seed & 0xffff_ffff
        value = ((value ^ (value >> 16)) * 0x21f0aaad) & 0xffff_ffff
        value = ((value ^ (value >> 15)) * 0x735a2d97) & 0xffff_ffff
        (value ^ (value >> 15)).fdiv(2**32)
      end
    end
  end
end
