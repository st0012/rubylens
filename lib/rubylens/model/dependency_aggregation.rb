# frozen_string_literal: true

module RubyLens
  module Model
    class DependencyAggregation
      SIGNAL_COLUMNS = (1..6).freeze

      def initialize(package_count:)
        raise ArgumentError, "package_count must be nonnegative" if package_count.negative?

        @ruby_counts = Array.new(package_count) { Array.new(4, 0) }
        @signal_maxima = Array.new(6, 0)
        @rows = Array.new(package_count) { [] }
      end

      def add(package_index:, row:, construct_index:)
        local_index = @rows[package_index].length
        @ruby_counts[package_index][construct_index] += 1 if construct_index
        maxima = @signal_maxima
        column = SIGNAL_COLUMNS.begin
        while column <= SIGNAL_COLUMNS.end
          value = row[column]
          index = column - 1
          maxima[index] = value if value > maxima[index]
          column += 1
        end
        @rows[package_index] << (row.frozen? ? row : row.dup.freeze)
        local_index
      end

      def packages
        @rows.each_index.map do |index|
          {
            ruby_counts: @ruby_counts[index].dup.freeze,
            declarations: @rows[index].dup.freeze,
          }.freeze
        end.freeze
      end

      def signal_maxima
        @signal_maxima.dup.freeze
      end
    end
  end
end
