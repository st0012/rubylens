# frozen_string_literal: true

require_relative "test_helper"

class ModelNamespaceAllocationTest < Minitest::Test
  def test_allocates_explicit_budget_with_minimums_linear_weights_and_deterministic_remainders
    quotas = RubyLens::Model::NamespaceAllocation.new(
      sizes: [1, 4, 9], keys: %w[c b a], budget: 6,
    ).quotas

    assert_equal([1, 1, 4], quotas)
    assert_equal(6, quotas.sum)
  end

  def test_post_minimum_detail_tracks_source_population_linearly
    quotas = RubyLens::Model::NamespaceAllocation.new(
      sizes: [10, 90], keys: %w[small large], budget: 20,
    ).quotas

    assert_equal([2, 18], quotas)
  end

  def test_preserves_sum_bounds_and_nonempty_representatives_when_budget_permits
    sizes = [0, 2, 5, 11]
    quotas = RubyLens::Model::NamespaceAllocation.new(sizes:, keys: %w[d c b a], budget: 9).quotas

    assert_equal(9, quotas.sum)
    quotas.each_with_index { |quota, index| assert_operator(quota, :<=, sizes[index]) }
    assert_equal(0, quotas[0])
    assert(quotas.drop(1).all?(&:positive?))
  end

  def test_selects_represented_groups_deterministically_when_budget_is_smaller_than_group_count
    quotas = RubyLens::Model::NamespaceAllocation.new(
      sizes: [2, 2, 2], keys: %w[c a b], budget: 2,
    ).quotas

    assert_equal([0, 1, 1], quotas)
  end

  def test_uses_lexical_keys_for_equal_largest_remainders_independent_of_input_order
    keys = %w[zeta alpha beta]
    quotas = RubyLens::Model::NamespaceAllocation.new(sizes: [4, 4, 4], keys:, budget: 5).quotas
    reordered_keys = keys.reverse
    reordered = RubyLens::Model::NamespaceAllocation.new(
      sizes: [4, 4, 4], keys: reordered_keys, budget: 5,
    ).quotas

    assert_equal({ "alpha" => 2, "beta" => 2, "zeta" => 1 }, keys.zip(quotas).to_h)
    assert_equal(keys.zip(quotas).to_h, reordered_keys.zip(reordered).to_h)
  end

  def test_preserves_fractional_shares_before_deterministic_remainder_ties
    keys = %w[a b]
    quotas = RubyLens::Model::NamespaceAllocation.new(
      sizes: [5, 6], keys:, budget: 5,
    ).quotas
    reordered_keys = keys.reverse
    reordered = RubyLens::Model::NamespaceAllocation.new(
      sizes: [6, 5], keys: reordered_keys, budget: 5,
    ).quotas

    assert_equal([2, 3], quotas)
    assert_equal(keys.zip(quotas).to_h, reordered_keys.zip(reordered).to_h)
  end

  def test_enforces_skewed_minimums_without_overallocating_the_budget
    quotas = RubyLens::Model::NamespaceAllocation.new(
      sizes: [2, 8, 90], keys: %w[tiny small large], minimums: [2, 2, 1], budget: 10,
    ).quotas

    assert_equal([2, 2, 6], quotas)
    assert_equal(10, quotas.sum)
  end

  def test_lower_bound_reclamation_uses_the_reverse_lexical_tie_break
    quotas = RubyLens::Model::NamespaceAllocation.new(
      sizes: [20, 30, 50], keys: %w[fixed zeta alpha], minimums: [5, 1, 1], budget: 20,
    ).quotas

    assert_equal([5, 5, 10], quotas)
  end

  def test_bounds_lower_bound_reclamation_for_many_skewed_regions
    region_count = 5_000
    sizes = Array.new(region_count, 1)
    sizes[-1] = 1_000_000
    quotas = RubyLens::Model::NamespaceAllocation.new(
      sizes:, keys: region_count.times.map { |index| index.to_s },
      minimums: Array.new(region_count, 1), budget: region_count,
    ).quotas

    assert_equal(Array.new(region_count, 1), quotas)
  end

  def test_preserves_group_and_category_minimums_before_weighted_detail
    quotas = RubyLens::Model::NamespaceAllocation.new(
      sizes: [10, 10], keys: %w[beta alpha], minimums: [2, 2], budget: 4,
    ).quotas
    constrained = RubyLens::Model::NamespaceAllocation.new(
      sizes: [10, 10], keys: %w[beta alpha], minimums: [2, 2], budget: 3,
    ).quotas

    assert_equal([2, 2], quotas)
    assert_equal([1, 2], constrained)
  end
end
