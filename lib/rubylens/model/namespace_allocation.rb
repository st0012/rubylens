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
        remaining = @budget
        1.upto(@minimums.max || 0) do |level|
          eligible = nonempty.select { |index| @minimums[index] >= level }
            .sort_by { |index| [@keys[index], index] }
          eligible.first(remaining).each { |index| quotas[index] += 1 }
          remaining -= [remaining, eligible.length].min
          return quotas.freeze if remaining.zero?
        end

        while remaining.positive?
          eligible = nonempty.select { |index| quotas[index] < @sizes[index] }
          break if eligible.empty?

          weights = eligible.to_h { |index| [index, @sizes[index]] }
          total_weight = weights.values.sum
          shares = eligible.to_h { |index| [index, remaining * weights.fetch(index) / total_weight] }
          allocated = 0
          eligible.each do |index|
            addition = [shares.fetch(index).floor, @sizes[index] - quotas[index]].min
            quotas[index] += addition
            allocated += addition
          end
          remaining -= allocated
          break if remaining.zero?

          ranked = eligible.select { |index| quotas[index] < @sizes[index] }
            .sort_by { |index| [-(shares.fetch(index) % 1), @keys[index], index] }
          break if ranked.empty?

          ranked.first(remaining).each { |index| quotas[index] += 1 }
          remaining -= [remaining, ranked.length].min
        end
        quotas.freeze
      end
    end
  end
end
