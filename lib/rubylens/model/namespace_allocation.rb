# frozen_string_literal: true

module RubyLens
  module Model
    class NamespaceAllocation
      def initialize(sizes:, keys:, budget:)
        raise ArgumentError, "sizes and keys must have the same length" unless sizes.length == keys.length
        raise ArgumentError, "budget must be nonnegative" if budget.negative?
        raise ArgumentError, "sizes must be nonnegative" if sizes.any?(&:negative?)

        @sizes = sizes
        @keys = keys.map(&:to_s)
        @budget = [budget, sizes.sum].min
      end

      def quotas
        quotas = Array.new(@sizes.length, 0)
        nonempty = @sizes.each_index.select { |index| @sizes[index].positive? }
        if @budget < nonempty.length
          nonempty.sort_by { |index| [@keys[index], index] }.first(@budget).each { |index| quotas[index] = 1 }
          return quotas.freeze
        end

        nonempty.each { |index| quotas[index] = 1 }
        remaining = @budget - nonempty.length
        while remaining.positive?
          eligible = nonempty.select { |index| quotas[index] < @sizes[index] }
          break if eligible.empty?

          weights = eligible.to_h { |index| [index, Math.sqrt(@sizes[index])] }
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
