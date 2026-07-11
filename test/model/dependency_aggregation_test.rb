# frozen_string_literal: true

require_relative "../test_helper"

class DependencyAggregationTest < Minitest::Test
  def test_rejects_negative_cardinality_limits
    assert_raises(ArgumentError) { RubyLens::Model::DependencyAggregation.new(package_count: -1) }
    assert_raises(ArgumentError) { RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: -1) }
  end

  def test_retains_all_rows_below_the_limit_in_input_order
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 2, row_limit: 4, seed: 12)
    rows = [
      [0, [0, 1, 2, 3, 4, 5, 6], 0],
      [1, [1, 2, 3, 4, 5, 6, 7], 1],
      [0, [2, 3, 4, 5, 6, 7, 8], 2],
    ]
    rows.each do |package_index, row, construct_index|
      aggregation.add(package_index:, row:, construct_index:)
    end

    packages = aggregation.packages
    assert_equal([2, 1], packages.map { |package| package.fetch(:declaration_count) })
    assert_equal([rows[0][1], rows[2][1]], packages[0].fetch(:declarations))
    assert_equal([rows[1][1]], packages[1].fetch(:declarations))
    assert_equal([3, 4, 5, 6, 7, 8], aggregation.signal_maxima)
  end

  def test_bounds_rows_while_preserving_totals_construct_counts_and_package_representatives
    first = build_large_aggregation
    second = build_large_aggregation

    assert_equal(first.packages, second.packages)
    assert_equal([60, 40], first.packages.map { |package| package.fetch(:declaration_count) })
    assert_equal(10, first.packages.sum { |package| package.fetch(:declarations).length })
    assert(first.packages.all? { |package| package.fetch(:declarations).any? })
    assert_equal([25, 25, 25, 25], first.packages.map { |package| package.fetch(:ruby_counts) }.transpose.map(&:sum))
  end

  def test_package_representative_can_be_replaced_deterministically
    streams = 2.times.map do
      aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: 1, seed: 12)
      100.times do |index|
        aggregation.add(package_index: 0, row: [0, index, 1, 0, 0, 0, 0], construct_index: 0)
      end
      aggregation.packages[0].fetch(:declarations)
    end

    assert_equal(streams[0], streams[1])
    refute_equal([[0, 0, 1, 0, 0, 0, 0]], streams[0])
  end

  def test_handles_zero_limit_and_more_packages_than_rows
    zero = RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: 0)
    zero.add(package_index: 0, row: [0, 1, 1, 0, 0, 0, 0], construct_index: 0)
    assert_empty(zero.packages[0].fetch(:declarations))
    assert_equal(1, zero.packages[0].fetch(:declaration_count))

    bounded = RubyLens::Model::DependencyAggregation.new(package_count: 3, row_limit: 2, seed: 12)
    3.times do |package_index|
      bounded.add(package_index:, row: [package_index, 1, 1, 0, 0, 0, 0], construct_index: package_index)
    end
    assert_equal(2, bounded.packages.sum { |package| package.fetch(:declarations).length })
    assert_equal(3, bounded.packages.sum { |package| package.fetch(:declaration_count) })
  end

  def test_returns_immutable_copies_of_internal_arrays
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: 1)
    row = [0, 1, 2, 3, 4, 5, 6]
    aggregation.add(package_index: 0, row:, construct_index: 0)
    package = aggregation.packages.fetch(0)

    row[1] = 99
    assert_equal([0, 1, 2, 3, 4, 5, 6], package.fetch(:declarations).fetch(0))
    assert_predicate(package.fetch(:ruby_counts), :frozen?)
    assert_predicate(package.fetch(:declarations), :frozen?)
    assert_predicate(package.fetch(:declarations).fetch(0), :frozen?)
    assert_predicate(package, :frozen?)
    assert_predicate(aggregation.packages, :frozen?)
    assert_predicate(aggregation.signal_maxima, :frozen?)
    refute_same(aggregation.signal_maxima, aggregation.signal_maxima)
  end

  def test_tail_packages_receive_seeded_fair_representation_when_packages_exceed_the_budget
    first = RubyLens::Model::DependencyAggregation.new(package_count: 3, row_limit: 2, seed: 0)
    second = RubyLens::Model::DependencyAggregation.new(package_count: 3, row_limit: 2, seed: 0)
    [first, second].each do |aggregation|
      3.times do |package_index|
        aggregation.add(package_index:, row: [package_index, 1, 1, 0, 0, 0, 0], construct_index: package_index)
      end
    end

    assert_equal(first.packages, second.packages)
    assert_empty(first.packages.fetch(1).fetch(:declarations))
    refute_empty(first.packages.fetch(2).fetch(:declarations))
  end

  def test_retains_exactly_the_limit_without_sampling
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: 3, seed: 12)
    rows = 3.times.map { |index| [0, index, 1, 0, 0, 0, 0] }
    rows.each { |row| aggregation.add(package_index: 0, row:, construct_index: 0) }

    assert_equal(rows, aggregation.packages[0].fetch(:declarations))
  end

  private

  def build_large_aggregation
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 2, row_limit: 10, seed: 12)
    100.times do |index|
      package_index = index < 60 ? 0 : 1
      aggregation.add(package_index:, row: [index % 3, index, 1, 0, index / 2, index / 3, index / 4], construct_index: index % 4)
    end
    aggregation
  end
end
