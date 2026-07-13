# frozen_string_literal: true

module RubyLens
  module Model
    class NamespaceAllocation
      def initialize(sizes:, keys:, budget:, minimums: nil)
        raise ArgumentError, "sizes and keys must have the same length" unless sizes.length == keys.length
        raise ArgumentError, "budget must be nonnegative" if budget.negative?
        raise ArgumentError, "sizes must be nonnegative" if sizes.any?(&:negative?)

        @sizes = sizes
        @keys = keys.map(&:to_s)
        @minimums = minimums || sizes.map { |size| size.positive? ? 1 : 0 }
        raise ArgumentError, "sizes and minimums must have the same length" unless sizes.length == @minimums.length
        if @minimums.each_with_index.any? { |minimum, index| minimum.negative? || minimum > sizes[index] }
          raise ArgumentError, "minimums must fit within sizes"
        end
        @budget = [budget, sizes.sum].min
      end

      def quotas
        quotas = Array.new(@sizes.length, 0)
        nonempty = @sizes.each_index.select { |index| @sizes[index].positive? }
        return quotas.freeze if @budget.zero?

        if @budget < @minimums.sum
          remaining = @budget
          1.upto(@minimums.max || 0) do |level|
            eligible = nonempty.select { |index| @minimums[index] >= level }
              .sort_by { |index| [@keys[index], index] }
            eligible.first(remaining).each { |index| quotas[index] += 1 }
            remaining -= [remaining, eligible.length].min
            return quotas.freeze if remaining.zero?
          end
        end

        total_weight = nonempty.sum { |index| @sizes[index] }
        shares = nonempty.to_h do |index|
          [index, Rational(@budget * @sizes[index], total_weight)]
        end
        nonempty.each { |index| quotas[index] = shares.fetch(index).floor }
        remaining = @budget - quotas.sum
        ranked = nonempty.select { |index| quotas[index] < @sizes[index] }
          .sort_by { |index| [-(shares.fetch(index) % 1), @keys[index], index] }
        ranked.first(remaining).each { |index| quotas[index] += 1 }

        # Preserve full-population Hamilton shares, then pay for lower bounds
        # from the most overrepresented quotas.
        excess = 0
        nonempty.each do |index|
          next unless quotas[index] < @minimums[index]

          excess += @minimums[index] - quotas[index]
          quotas[index] = @minimums[index]
        end
        if excess.positive?
          # Removable seats cannot exceed the bounded namespace budget.
          removals = []
          nonempty.each do |index|
            (quotas[index] - @minimums[index]).times do |offset|
              removals << [quotas[index] - offset - shares.fetch(index), index]
            end
          end
          removals.sort! do |left, right|
            comparison = right[0] <=> left[0]
            comparison = @keys[right[1]] <=> @keys[left[1]] if comparison.zero?
            comparison = right[1] <=> left[1] if comparison.zero?
            comparison
          end
          removals.first(excess).each { |_deviation, index| quotas[index] -= 1 }
        end
        quotas.freeze
      end
    end
  end
end
