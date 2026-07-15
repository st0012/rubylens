# frozen_string_literal: true

require "digest"

module RubyLens
  module Model
    class DependencyAggregation
      DEFAULT_ROW_LIMIT = 18_000
      SIGNAL_COLUMNS = (1..6).freeze

      def initialize(package_count:, row_limit: DEFAULT_ROW_LIMIT, seed: 0x51A7_E11A)
        raise ArgumentError, "package_count must be nonnegative" if package_count.negative?
        raise ArgumentError, "row_limit must be nonnegative" if row_limit&.negative?

        @row_limit = row_limit
        @seed = seed
        @counts = Array.new(package_count, 0)
        @ruby_counts = Array.new(package_count) { Array.new(4, 0) }
        @signal_maxima = Array.new(6, 0)
        if @row_limit.nil?
          @all_rows = Array.new(package_count) { [] }
          return
        end

        @representatives = Array.new(package_count)
        @nonempty_package_count = 0
        @sample = []
      end

      def add(package_index:, row:, construct_index:, sample_key:)
        @counts[package_index] += 1
        @ruby_counts[package_index][construct_index] += 1 if construct_index
        SIGNAL_COLUMNS.each_with_index do |column, index|
          @signal_maxima[index] = [@signal_maxima[index], row[column]].max
        end

        retained_row = row.dup.freeze
        if @row_limit.nil?
          @all_rows[package_index] << retained_row
          return
        end

        entry = [sample_rank(package_index, sample_key), package_index, retained_row]
        representative = @representatives[package_index]
        @nonempty_package_count += 1 unless representative
        @representatives[package_index] = entry if !representative || compare_entries(entry, representative).negative?
        push_bounded(@sample, entry, @row_limit)
      end

      def packages
        if @row_limit.nil?
          sampled_rows = @all_rows
        else
          sampled_rows = Array.new(@counts.length) { [] }
          selected = selected_representatives
          selected_ids = selected.each_with_object({}) { |entry, ids| ids[entry.object_id] = true }
          remaining = @row_limit - selected.length
          if remaining.positive?
            selected.concat(@sample.reject { |entry| selected_ids.key?(entry.object_id) }
              .sort { |left, right| compare_entries(left, right) }
              .first(remaining))
          end
          selected.sort { |left, right| compare_entries(left, right) }
            .each { |_rank, package_index, row| sampled_rows[package_index] << row }
        end
        @counts.each_index.map do |index|
          {
            declaration_count: @counts[index],
            ruby_counts: @ruby_counts[index].dup.freeze,
            declarations: sampled_rows[index].dup.freeze,
          }.freeze
        end.freeze
      end

      def signal_maxima
        @signal_maxima.dup.freeze
      end

      private

      def selected_representatives
        return [] if @row_limit.zero?
        return @representatives.compact if @nonempty_package_count <= @row_limit

        packages = []
        @representatives.each_with_index do |representative, package_index|
          next unless representative

          push_bounded(packages, [package_rank(package_index), package_index, representative], @row_limit)
        end
        packages.map(&:last)
      end

      def sample_rank(package_index, sample_key)
        Digest::SHA256.digest("rubylens-dependency-row-v1\0#{@seed}\0#{package_index}\0".b + sample_key.to_s.b)
      end

      def package_rank(package_index)
        Digest::SHA256.digest("rubylens-dependency-package-v1\0#{@seed}\0#{package_index}".b)
      end

      def compare_entries(left, right)
        (left[0] <=> right[0]).nonzero? || (left[1] <=> right[1]).nonzero? || (left[2] <=> right[2])
      end

      def push_bounded(heap, entry, limit)
        return if limit.zero?

        if heap.length < limit
          heap << entry
          sift_up(heap, heap.length - 1)
        elsif compare_entries(entry, heap[0]).negative?
          heap[0] = entry
          sift_down(heap, 0)
        end
      end

      def sift_up(heap, index)
        while index.positive?
          parent = (index - 1) / 2
          break unless compare_entries(heap[index], heap[parent]).positive?

          heap[index], heap[parent] = heap[parent], heap[index]
          index = parent
        end
      end

      def sift_down(heap, index)
        loop do
          left = (index * 2) + 1
          break if left >= heap.length

          right = left + 1
          child = right < heap.length && compare_entries(heap[right], heap[left]).positive? ? right : left
          break unless compare_entries(heap[child], heap[index]).positive?

          heap[index], heap[child] = heap[child], heap[index]
          index = child
        end
      end
    end
  end
end
