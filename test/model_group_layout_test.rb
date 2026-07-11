# frozen_string_literal: true

require_relative "test_helper"

class ModelGroupLayoutTest < Minitest::Test
  def test_anchors_are_seed_stable_bounded_and_nonoverlapping
    seeds = [30, 10, 20, 40]
    counts = [100, 25, 64, 9]
    anchors = RubyLens::Model::GroupLayout.new(seeds:, namespace_counts: counts).anchors
    reordered = RubyLens::Model::GroupLayout.new(
      seeds: seeds.reverse, namespace_counts: counts.reverse,
    ).anchors
    by_seed = seeds.each_with_index.to_h { |seed, index| [seed, anchors[index]] }
    reordered_by_seed = seeds.reverse.each_with_index.to_h { |seed, index| [seed, reordered[index]] }

    assert_equal(by_seed, reordered_by_seed)
    assert(anchors.flatten.all? { |coordinate| coordinate.is_a?(Integer) })
    anchors.combination(2).each do |left, right|
      assert_operator(Math.sqrt(left.zip(right).sum { |a, b| (a - b)**2 }), :>, 20)
    end
  end
end
