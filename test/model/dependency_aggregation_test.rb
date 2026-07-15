# frozen_string_literal: true

require_relative "../test_helper"

class DependencyAggregationTest < Minitest::Test
  def test_rejects_negative_cardinality_limits
    assert_raises(ArgumentError) { RubyLens::Model::DependencyAggregation.new(package_count: -1) }
    assert_raises(ArgumentError) { RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: -1) }
  end

  def test_retains_all_rows_below_the_limit_independent_of_input_order
    rows = [
      [0, [0, 1, 2, 3, 4, 5, 6], 0, "Alpha"],
      [1, [1, 2, 3, 4, 5, 6, 7], 1, "Beta"],
      [0, [2, 3, 4, 5, 6, 7, 8], 2, "Gamma"],
    ]
    first = build_aggregation(rows, package_count: 2, row_limit: 4)
    second = build_aggregation(rows.reverse, package_count: 2, row_limit: 4)

    packages = first.packages
    assert_equal(packages, second.packages)
    assert_equal([2, 1], packages.map { |package| package.fetch(:declaration_count) })
    assert_equal(rows.filter_map { |package_index, row,| row if package_index.zero? }.sort,
      packages[0].fetch(:declarations).sort)
    assert_equal([rows[1][1]], packages[1].fetch(:declarations))
    assert_equal([3, 4, 5, 6, 7, 8], first.signal_maxima)
    assert_equal(first.signal_maxima, second.signal_maxima)
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
        aggregation.add(
          package_index: 0,
          row: [0, index, 1, 0, 0, 0, 0],
          construct_index: 0,
          sample_key: "Declaration#{index}",
        )
      end
      aggregation.packages[0].fetch(:declarations)
    end

    assert_equal(streams[0], streams[1])
    refute_equal([[0, 0, 1, 0, 0, 0, 0]], streams[0])
  end

  def test_handles_zero_limit_and_more_packages_than_rows
    zero = RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: 0)
    zero.add(package_index: 0, row: [0, 1, 1, 0, 0, 0, 0], construct_index: 0, sample_key: "Zero")
    assert_empty(zero.packages[0].fetch(:declarations))
    assert_equal(1, zero.packages[0].fetch(:declaration_count))

    bounded = RubyLens::Model::DependencyAggregation.new(package_count: 3, row_limit: 2, seed: 12)
    3.times do |package_index|
      bounded.add(
        package_index:,
        row: [package_index, 1, 1, 0, 0, 0, 0],
        construct_index: package_index,
        sample_key: "Package#{package_index}",
      )
    end
    assert_equal(2, bounded.packages.sum { |package| package.fetch(:declarations).length })
    assert_equal(3, bounded.packages.sum { |package| package.fetch(:declaration_count) })
  end

  def test_returns_immutable_copies_of_internal_arrays
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: 1)
    row = [0, 1, 2, 3, 4, 5, 6]
    aggregation.add(package_index: 0, row:, construct_index: 0, sample_key: "private/Secret::Name")
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
    refute_includes(JSON.generate(aggregation.packages), "private/Secret::Name")
  end

  def test_tail_packages_receive_seeded_fair_representation_when_packages_exceed_the_budget
    first = RubyLens::Model::DependencyAggregation.new(package_count: 3, row_limit: 2, seed: 0)
    second = RubyLens::Model::DependencyAggregation.new(package_count: 3, row_limit: 2, seed: 0)
    rows = 3.times.map do |package_index|
      [package_index, [package_index, 1, 1, 0, 0, 0, 0], package_index, "Package#{package_index}"]
    end
    add_rows(first, rows)
    add_rows(second, rows.reverse)

    assert_equal(first.packages, second.packages)
    assert_equal(2, first.packages.count { |package| package.fetch(:declarations).any? })
    assert(first.packages.drop(1).any? { |package| package.fetch(:declarations).any? })
  end

  def test_retains_exactly_the_limit_without_sampling
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 1, row_limit: 3, seed: 12)
    rows = 3.times.map { |index| [0, index, 1, 0, 0, 0, 0] }
    rows.each_with_index do |row, index|
      aggregation.add(package_index: 0, row:, construct_index: 0, sample_key: "Declaration#{index}")
    end

    assert_equal(rows.sort, aggregation.packages[0].fetch(:declarations).sort)
  end

  def test_above_limit_sampling_is_independent_of_input_order
    rows = 120.times.map do |index|
      package_index = index % 3
      [
        package_index,
        [index % 3, index, 1 + (index % 4), index % 4, index / 2, index / 3, index / 4],
        index % 4,
        "Namespace::Declaration#{index}",
      ]
    end
    first = build_aggregation(rows, package_count: 3, row_limit: 17)
    second = build_aggregation(rows.rotate(43).reverse, package_count: 3, row_limit: 17)

    assert_equal(first.packages, second.packages)
    assert_equal(first.signal_maxima, second.signal_maxima)
    assert_equal(17, first.packages.sum { |package| package.fetch(:declarations).length })
    assert_equal(120, first.packages.sum { |package| package.fetch(:declaration_count) })
    assert(first.packages.all? { |package| package.fetch(:declarations).any? })
  end

  private

  def build_large_aggregation
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count: 2, row_limit: 10, seed: 12)
    100.times do |index|
      package_index = index < 60 ? 0 : 1
      aggregation.add(
        package_index:,
        row: [index % 3, index, 1, 0, index / 2, index / 3, index / 4],
        construct_index: index % 4,
        sample_key: "Declaration#{index}",
      )
    end
    aggregation
  end

  def build_aggregation(rows, package_count:, row_limit:)
    aggregation = RubyLens::Model::DependencyAggregation.new(package_count:, row_limit:, seed: 12)
    add_rows(aggregation, rows)
    aggregation
  end

  def add_rows(aggregation, rows)
    rows.each do |package_index, row, construct_index, sample_key|
      aggregation.add(package_index:, row:, construct_index:, sample_key:)
    end
  end
end
