# frozen_string_literal: true

module RubyLens
  module Model
    class GroupLayout
      RADIUS_BASE = 3.5
      RADIUS_SCALE = 0.55
      MIN_RADIUS = 4.0
      MAX_RADIUS = 16.0
      ASSOCIATION_GAP = 6.0
      GOLDEN_ANGLE = Math::PI * (3 - Math.sqrt(5))
      OVERLAP_PASSES = 6

      attr_reader :radii

      def initialize(seeds:, core_namespace_counts:, total_namespace_counts: nil, mode: :association)
        unless seeds.length == core_namespace_counts.length
          raise ArgumentError, "seeds and core_namespace_counts must have the same length"
        end
        total_namespace_counts ||= Array.new(seeds.length, 1)
        unless seeds.length == total_namespace_counts.length
          raise ArgumentError, "seeds and total_namespace_counts must have the same length"
        end
        raise ArgumentError, "core_namespace_counts must be nonnegative" if core_namespace_counts.any?(&:negative?)
        raise ArgumentError, "total_namespace_counts must be nonnegative" if total_namespace_counts.any?(&:negative?)
        raise ArgumentError, "layout mode must be association or atlas" unless %i[association atlas].include?(mode.to_sym)

        @seeds = seeds
        @core_namespace_counts = core_namespace_counts
        @active_indices = total_namespace_counts.each_index.select { |index| total_namespace_counts[index].positive? }
        @mode = mode.to_sym
        @radii = core_namespace_counts.each_index.map do |index|
          @active_indices.include?(index) ? self.class.system_radius(core_namespace_counts[index]) : 0.0
        end.freeze
      end

      def anchors
        return [].freeze if @seeds.empty?
        return Array.new(@seeds.length) { [0, 0, 0].freeze }.freeze if @active_indices.empty?

        @mode == :atlas ? atlas_anchors : association_anchors
      end

      def self.system_radius(core_namespace_count)
        unclamped = RADIUS_BASE + Math.sqrt(core_namespace_count) * RADIUS_SCALE
        [[unclamped, MIN_RADIUS].max, MAX_RADIUS].min
      end

      private

      def association_anchors
        if @active_indices.length == 1
          index = @active_indices.first
          distance = [18.0, @radii[index] + ASSOCIATION_GAP].max
          return placeholders.tap { |anchors| anchors[index] = [distance.round, 0, 0].freeze }.freeze
        end

        association_radius = [
          18.0,
          (2 * active_radii.max + ASSOCIATION_GAP) * Math.sqrt(@active_indices.length) / 1.8,
        ].max
        rotation = (active_seeds.min % 3600) * Math::PI / 1800
        positions = Array.new(@seeds.length)
        order = @active_indices.sort_by { |index| [@seeds[index], index] }
        order.each_with_index do |index, rank|
          vertical = 1 - 2 * (rank + 0.5) / @active_indices.length
          horizontal = Math.sqrt([1 - vertical**2, 0].max)
          angle = rotation + rank * GOLDEN_ANGLE
          radial_scale = 0.58 + seed_unit(@seeds[index]) * 0.42
          radius = association_radius * radial_scale
          positions[index] = [
            (Math.cos(angle) * horizontal + vertical * 0.12) * radius,
            vertical * radius * 0.72,
            Math.sin(angle) * horizontal * radius * 0.9,
          ]
        end
        resolve_overlaps(positions, order)
        centered_integer_positions(positions, order)
      end

      def resolve_overlaps(positions, order)
        OVERLAP_PASSES.times do
          changed = false
          order.combination(2) do |left_index, right_index|
            left = positions[left_index]
            right = positions[right_index]
            delta = 3.times.map { |axis| right[axis] - left[axis] }
            distance = Math.sqrt(delta.sum { |value| value**2 })
            minimum = @radii[left_index] + @radii[right_index] + ASSOCIATION_GAP
            next if distance >= minimum

            direction = if distance < 1e-9
              angle = seed_unit(@seeds[left_index] ^ @seeds[right_index]) * Math::PI * 2
              [Math.cos(angle), 0.5, Math.sin(angle)]
            else
              delta.map { |value| value / distance }
            end
            push = (minimum - distance) / 2 + 0.01
            3.times do |axis|
              left[axis] -= direction[axis] * push
              right[axis] += direction[axis] * push
            end
            changed = true
          end
          break unless changed

          recenter_positions(positions, order)
        end
      end

      def recenter_positions(positions, order)
        means = 3.times.map { |axis| order.sum { |index| positions[index][axis] } / order.length }
        order.each do |index|
          3.times { |axis| positions[index][axis] -= means[axis] }
        end
      end

      def centered_integer_positions(positions, order)
        means = 3.times.map { |axis| order.sum { |index| positions[index][axis] } / order.length }
        centered = placeholders
        order.each do |index|
          centered[index] = 3.times.map { |axis| (positions[index][axis] - means[axis]).round }
        end
        3.times do |axis|
          residual = centered.sum { |position| position[axis] }
          direction = residual.positive? ? -1 : 1
          residual.abs.times { |offset| centered[order[offset % order.length]][axis] += direction }
        end
        centered.map(&:freeze).freeze
      end

      def seed_unit(seed)
        value = seed & 0xffff_ffff
        value = ((value ^ (value >> 16)) * 0x21f0aaad) & 0xffff_ffff
        value = ((value ^ (value >> 15)) * 0x735a2d97) & 0xffff_ffff
        (value ^ (value >> 15)).fdiv(2**32)
      end

      def atlas_anchors
        side = Math.sqrt(@active_indices.length + 1).ceil
        side += 1 if side.even?
        side += 2 while side**2 - 1 < @active_indices.length
        spacing = (2 * active_radii.max + ASSOCIATION_GAP).ceil
        center_slot = (side**2) / 2
        available = (0...(side**2)).reject { |slot| slot == center_slot }
        slots = Array.new(@seeds.length)
        @active_indices.sort_by { |index| [@seeds[index], index] }.each_with_index do |index, rank|
          slots[index] = available.fetch(rank)
        end
        center = (side - 1) / 2.0
        anchors = placeholders
        @active_indices.each do |index|
          slot = slots[index]
          x = slot % side
          y = slot / side
          anchors[index] = [
            ((x - center) * spacing).round,
            ((y - center) * spacing).round,
            0,
          ].freeze
        end
        anchors.freeze
      end

      def active_radii
        @active_indices.map { |index| @radii[index] }
      end

      def active_seeds
        @active_indices.map { |index| @seeds[index] }
      end

      def placeholders
        Array.new(@seeds.length) { [0, 0, 0].freeze }
      end
    end
  end
end
