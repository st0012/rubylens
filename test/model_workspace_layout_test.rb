# frozen_string_literal: true

require_relative "test_helper"

class ModelWorkspaceLayoutTest < Minitest::Test
  Layout = RubyLens::Model::WorkspaceLayout

  def test_radius_is_zero_only_for_an_empty_workspace_and_monotone_afterward
    populations = [0, 1, 100, 10_000, 50_000, 100_000, 400_000, 1_000_000]
    radii = populations.map { |count| Layout.radius(count) }

    assert_equal(0.0, radii.first)
    radii.each_cons(2) { |left, right| assert_operator(right, :>, left) }
  end

  def test_piecewise_radius_is_continuous_at_both_knees
    knee = Layout::POPULATION_KNEE.to_i
    large_knee = (knee * Layout::LARGE_THRESHOLD).to_i

    assert_in_delta(Layout::KNEE_RADIUS, Layout.radius(knee), 1e-10)
    assert_in_delta(
      Layout::KNEE_RADIUS * Layout::LARGE_THRESHOLD**Layout::MID_EXPONENT,
      Layout.radius(large_knee),
      1e-10,
    )
    assert_in_delta(Layout.radius(knee), Layout.radius(knee + 1), 0.001)
    assert_in_delta(Layout.radius(large_knee), Layout.radius(large_knee + 1), 0.001)
  end

  def test_radius_is_invariant_to_region_count_and_partition
    one = Layout.new(seeds: [1], namespace_counts: [100_000], radius_population: 80_000)
    many = Layout.new(
      seeds: (1..40).to_a,
      namespace_counts: Array.new(40, 2_500),
      radius_population: 80_000,
    )

    assert_equal(one.radius, many.radius)
  end

  def test_regions_partition_one_common_disk_and_keep_centroids_in_its_plane
    layout = Layout.new(seeds: [30, 10, 20], namespace_counts: [50, 30, 20], radius_population: 100)
    active_bounds = layout.bounds.reject { |row| row.all?(&:zero?) }.sort_by(&:first)

    assert_in_delta(Math::PI * 2, active_bounds.sum { |start_angle, end_angle,| end_angle - start_angle }, 1e-10)
    assert(layout.centroids.all? { |_x, y, _z| y.zero? })
    assert(layout.centroids.all? { |x, _y, z| Math.hypot(x, z) < layout.radius })
  end

  def test_empty_regions_keep_their_ordinal_without_changing_the_host_radius
    active = Layout.new(seeds: [11, 22], namespace_counts: [5, 8], radius_population: 9)
    with_empty = Layout.new(seeds: [11, 999, 22], namespace_counts: [5, 0, 8], radius_population: 9)

    assert_equal(active.radius, with_empty.radius)
    assert_equal([0.0, 0.0, 0.0, 0.0], with_empty.bounds[1])
    assert_equal([0.0, 0.0, 0.0], with_empty.centroids[1])
  end
end
