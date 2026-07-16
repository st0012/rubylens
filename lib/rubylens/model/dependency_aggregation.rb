# frozen_string_literal: true

module RubyLens
  module Model
    class DependencyAggregation
      SIGNAL_COLUMNS = (1..6).freeze

      def initialize(package_count:)
        raise ArgumentError, "package_count must be nonnegative" if package_count.negative?

        @counts = Array.new(package_count, 0)
        @ruby_counts = Array.new(package_count) { Array.new(4, 0) }
        @signal_maxima = Array.new(6, 0)
        @rows = Array.new(package_count) { [] }
      end

      def add(package_index:, row:, construct_index:)
        @counts[package_index] += 1
        @ruby_counts[package_index][construct_index] += 1 if construct_index
        SIGNAL_COLUMNS.each_with_index do |column, index|
          @signal_maxima[index] = [@signal_maxima[index], row[column]].max
        end
        @rows[package_index] << row.dup.freeze
      end

      def packages
        @counts.each_index.map do |index|
          {
            declaration_count: @counts[index],
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
