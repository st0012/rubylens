# frozen_string_literal: true

require_relative "test_helper"

class ModelGroupLayoutTest < Minitest::Test
  def test_association_anchors_are_seed_stable_centered_noncentral_and_nonoverlapping
    seeds = [30, 10, 20, 40]
    counts = [100, 25, 64, 9]
    layout = RubyLens::Model::GroupLayout.new(seeds:, core_namespace_counts: counts)
    anchors = layout.anchors
    reordered = RubyLens::Model::GroupLayout.new(
      seeds: seeds.reverse, core_namespace_counts: counts.reverse,
    ).anchors
    by_seed = seeds.each_with_index.to_h { |seed, index| [seed, anchors[index]] }
    reordered_by_seed = seeds.reverse.each_with_index.to_h { |seed, index| [seed, reordered[index]] }

    assert_equal(by_seed, reordered_by_seed)
    assert(anchors.flatten.all? { |coordinate| coordinate.is_a?(Integer) })
    assert_equal([0, 0, 0], 3.times.map { |axis| anchors.sum { |anchor| anchor[axis] } })
    refute_includes(anchors, [0, 0, 0])
    anchors.each_index.to_a.combination(2).each do |left_index, right_index|
      distance = Math.sqrt(anchors[left_index].zip(anchors[right_index]).sum { |a, b| (a - b)**2 })
      minimum = layout.radii[left_index] + layout.radii[right_index]
      assert_operator(distance, :>, minimum)
    end
  end

  def test_system_radius_uses_only_exact_core_namespaces_with_legibility_clamps
    layout = RubyLens::Model::GroupLayout.new(
      seeds: [1, 2, 3, 4], core_namespace_counts: [0, 1, 100, 100_000],
    )

    assert_equal([4.0, 4.05, 9.0, 16.0], layout.radii)
  end

  def test_single_system_keeps_the_barycenter_empty
    anchor = RubyLens::Model::GroupLayout.new(seeds: [1], core_namespace_counts: [10]).anchors.first

    refute_equal([0, 0, 0], anchor)
  end

  def test_atlas_is_explicit_and_reserves_the_central_cell
    anchors = RubyLens::Model::GroupLayout.new(
      seeds: (1..27).to_a, core_namespace_counts: Array.new(27, 10), mode: :atlas,
    ).anchors

    assert_equal(27, anchors.uniq.length)
    refute_includes(anchors, [0, 0, 0])
  end

  def test_synthetic_thousand_system_association_stays_centered_noncentral_and_nonoverlapping
    seeds = 1_000.times.map { |index| index * 2_654_435_761 % (2**32) }
    counts = 1_000.times.map { |index| 1 + index % 400 }
    layout = RubyLens::Model::GroupLayout.new(seeds:, core_namespace_counts: counts)
    anchors = layout.anchors

    assert_equal(1_000, anchors.uniq.length)
    assert_equal([0, 0, 0], 3.times.map { |axis| anchors.sum { |anchor| anchor[axis] } })
    refute_includes(anchors, [0, 0, 0])
    minimum_margin = anchors.each_index.to_a.combination(2).map do |left_index, right_index|
      distance = Math.sqrt(anchors[left_index].zip(anchors[right_index]).sum { |a, b| (a - b)**2 })
      minimum = layout.radii[left_index] + layout.radii[right_index]
      distance - minimum
    end.min
    assert_operator(minimum_margin, :>, RubyLens::Model::GroupLayout::ASSOCIATION_GAP / 2)
  end

  def test_empty_groups_do_not_change_active_system_layout
    active = RubyLens::Model::GroupLayout.new(
      seeds: [11, 22], core_namespace_counts: [5, 8], total_namespace_counts: [5, 8],
    )
    with_empty = RubyLens::Model::GroupLayout.new(
      seeds: [11, 999, 22], core_namespace_counts: [5, 0, 8], total_namespace_counts: [5, 0, 8],
    )

    assert_equal([active.anchors[0], [0, 0, 0], active.anchors[1]], with_empty.anchors)
    assert_equal([active.radii[0], 0.0, active.radii[1]], with_empty.radii)
  end

  def test_tests_only_group_remains_a_legible_system
    layout = RubyLens::Model::GroupLayout.new(
      seeds: [17], core_namespace_counts: [0], total_namespace_counts: [4],
    )

    assert_equal(RubyLens::Model::GroupLayout::MIN_RADIUS, layout.radii.first)
    refute_equal([0, 0, 0], layout.anchors.first)
  end
end
