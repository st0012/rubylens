# frozen_string_literal: true

require_relative "../test_helper"

class DependencyAggregationTest < Minitest::Test
  def test_rejects_negative_package_count
    assert_raises(ArgumentError) { RubyLens::Model::DependencyAggregation.new(package_count: -1) }
  end

  def test_retains_every_row_and_exact_aggregate_in_per_package_input_order
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 2)
    rows = [
      [0, [0, 1, 2, 3, 4, 5, 6], 0],
      [1, [1, 2, 3, 4, 5, 6, 7], 1],
      [0, [2, 3, 4, 5, 6, 7, 8], 2],
    ]
    add_rows(aggregation, rows)

    packages = aggregation.packages
    assert_equal([2, 1], packages.map { |package| package.fetch(:declarations).length })
    assert_equal([rows[0][1], rows[2][1]], packages[0].fetch(:declarations))
    assert_equal([rows[1][1]], packages[1].fetch(:declarations))
    assert_equal([1, 0, 1, 0], packages[0].fetch(:ruby_counts))
    assert_equal([0, 1, 0, 0], packages[1].fetch(:ruby_counts))
    assert_equal([3, 4, 5, 6, 7, 8], aggregation.signal_maxima)

    rows[0][1][1] = 99
    assert_equal([0, 1, 2, 3, 4, 5, 6], packages[0].fetch(:declarations).first)
    assert_predicate(packages, :frozen?)
    assert(packages.all?(&:frozen?))
    assert(packages.all? { |package| package.fetch(:ruby_counts).frozen? })
    assert(packages.all? { |package| package.fetch(:declarations).frozen? })
    assert(packages.flat_map { |package| package.fetch(:declarations) }.all?(&:frozen?))
  end

  def test_returns_snapshot_copies_and_preserves_empty_packages
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 3)
    first = aggregation.packages

    assert_equal([0, 0, 0], first.map { |package| package.fetch(:declarations).length })
    assert(first.all? { |package| package.fetch(:declarations).empty? })
    assert(first.all? { |package| package.fetch(:ruby_counts) == [0, 0, 0, 0] })

    aggregation.add(
      package_index: 2,
      row: [0, 4, 3, 2, 1, 0, 5],
      construct_index: nil,
    )

    assert_equal([0, 0, 0], first.map { |package| package.fetch(:declarations).length })
    assert_equal([0, 0, 1], aggregation.packages.map { |package| package.fetch(:declarations).length })
    assert_equal([4, 3, 2, 1, 0, 5], aggregation.signal_maxima)
    assert_predicate(aggregation.signal_maxima, :frozen?)
    refute_same(aggregation.signal_maxima, aggregation.signal_maxima)
  end

  private

  def add_rows(aggregation, rows)
    rows.each do |package_index, row, construct_index|
      aggregation.add(package_index:, row:, construct_index:)
    end
  end
end
