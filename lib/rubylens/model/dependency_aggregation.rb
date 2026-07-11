# frozen_string_literal: true

module RubyLens
  module Model
    class DependencyAggregation
      DEFAULT_ROW_LIMIT = 18_000
      SIGNAL_COLUMNS = (1..6).freeze

      def initialize(package_count:, row_limit: DEFAULT_ROW_LIMIT, seed: 0x51A7_E11A)
        raise ArgumentError, "package_count must be nonnegative" if package_count.negative?
        raise ArgumentError, "row_limit must be nonnegative" if row_limit.negative?

        @row_limit = row_limit
        @random = Random.new(seed)
        @ordinal = 0
        @seen_nonrepresentative = 0
        @counts = Array.new(package_count, 0)
        @ruby_counts = Array.new(package_count) { Array.new(4, 0) }
        @signal_maxima = Array.new(6, 0)
        @representatives = Array.new(package_count)
        @represented_packages = []
        @representative_count = 0
        @nonempty_package_count = 0
        @reservoir = []
      end

      def add(package_index:, row:, construct_index:)
        @counts[package_index] += 1
        @ruby_counts[package_index][construct_index] += 1 if construct_index
        SIGNAL_COLUMNS.each_with_index do |column, index|
          @signal_maxima[index] = [@signal_maxima[index], row[column]].max
        end

        entry = [package_index, @ordinal, row.dup.freeze]
        @ordinal += 1
        if @counts[package_index] == 1
          add_first_package_entry(package_index, entry)
        elsif @representatives[package_index] && @random.rand(@counts[package_index]).zero?
          displaced = @representatives[package_index]
          @representatives[package_index] = entry
          add_to_reservoir(displaced)
        else
          add_to_reservoir(entry)
        end
      end

      def packages
        sampled_rows = Array.new(@counts.length) { [] }
        (@representatives.compact + @reservoir).sort_by { |_package_index, ordinal, _row| ordinal }
          .each { |package_index, _ordinal, row| sampled_rows[package_index] << row }
        @counts.each_index.map do |index|
          {
            declaration_count: @counts[index],
            ruby_counts: @ruby_counts[index].dup.freeze,
            declarations: sampled_rows[index].freeze,
          }.freeze
        end.freeze
      end

      def signal_maxima
        @signal_maxima.dup.freeze
      end

      private

      def add_first_package_entry(package_index, entry)
        @nonempty_package_count += 1
        if @representative_count < @row_limit
          @representatives[package_index] = entry
          @represented_packages << package_index
          @representative_count += 1
          trim_reservoir
        elsif @row_limit.positive? && @random.rand(@nonempty_package_count) < @row_limit
          slot = @random.rand(@represented_packages.length)
          displaced_package = @represented_packages[slot]
          add_to_reservoir(@representatives[displaced_package])
          @representatives[displaced_package] = nil
          @representatives[package_index] = entry
          @represented_packages[slot] = package_index
        else
          add_to_reservoir(entry)
        end
      end

      def add_to_reservoir(entry)
        capacity = reservoir_capacity
        replacement = @random.rand(@seen_nonrepresentative + 1)
        if @reservoir.length < capacity
          @reservoir << entry
        elsif replacement < capacity
          @reservoir[replacement] = entry
        end
        @seen_nonrepresentative += 1
      end

      def trim_reservoir
        @reservoir.delete_at(@random.rand(@reservoir.length)) while @reservoir.length > reservoir_capacity
      end

      def reservoir_capacity
        @row_limit - @representative_count
      end
    end
  end
end
