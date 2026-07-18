# frozen_string_literal: true

require_relative "test_helper"

class MorphologyClassifierTest < Minitest::Test
  def test_reaches_all_five_families
    assert_equal(4, classify(snapshot(core: 29)).fetch("family"))
    assert_equal(0, classify(snapshot(core: 100)).fetch("family"))
    assert_equal(1, classify(snapshot(core: 100, dependencies: 400)).fetch("family"))
    assert_equal(2, classify(snapshot(core: 100, modules: 50, tests: 50, dependencies: 100, roots: 10)).fetch("family"))
    assert_equal(3, classify(snapshot(core: 100, modules: 50, tests: 50, dependencies: 100, roots: 1)).fetch("family"))
  end

  def test_uses_the_tiny_and_structure_band_edges
    assert_equal("Irr", classify(snapshot(core: 29)).fetch("designation"))
    assert_equal("E0", classify(snapshot(core: 30)).fetch("designation"))
    assert_equal(0, classify(snapshot(core: 100, modules: 59)).fetch("family"))
    assert_equal(1, classify(snapshot(core: 100, modules: 60)).fetch("family"))
    assert_equal(2, classify(snapshot(core: 100, modules: 100, roots: 100)).fetch("family"))
  end

  def test_uses_the_bar_concentration_edge
    below = snapshot(core: 100, modules: 100, root_counts: [49, 49, 2])
    at_edge = snapshot(core: 100, modules: 100, root_counts: [50, 50])

    assert_equal(2, classify(below).fetch("family"))
    assert_equal(3, classify(at_edge).fetch("family"))
  end

  def test_emits_valid_integer_knobs_and_designations
    snapshots = [
      snapshot(core: 100),
      snapshot(core: 100, dependencies: 400),
      snapshot(core: 100, modules: 100, roots: 100),
      snapshot(core: 100, modules: 100, roots: 1),
      snapshot(core: 12, modules: 4, tests: 4),
    ]

    snapshots.each do |input|
      result = classify(input)
      assert_match(/\A(E[0-7]|S0|S[abc]|SB[abc]|Irr)\z/, result.fetch("designation"))
      assert_equal(9, result.fetch("knobs").length)
      assert(result.fetch("knobs").all?(Integer))
      assert_operator(result.fetch("knobs").last, :>=, 0)
      assert_operator(result.fetch("knobs").last, :<=, 0xffff_ffff)
    end
  end

  def test_clamps_family_specific_arm_counts
    spiral = classify(snapshot(core: 100, modules: 100, tests: 900, dependencies: 10_000, roots: 100))
    barred = classify(snapshot(core: 100, modules: 100, tests: 900, dependencies: 10_000, roots: 1))

    assert_includes(2..6, spiral.fetch("knobs")[2])
    assert_includes(2..4, barred.fetch("knobs")[2])
    assert_equal(0, spiral.fetch("knobs")[5])
    assert_operator(barred.fetch("knobs")[5], :>, 0)
  end

  def test_locks_spiral_stage_designations_and_knobs
    cases = [
      [0, 100, "Sa", [0, 360, 2, 180, 450, 0, 0, 0, 1_250_263_674]],
      [0, 1, "SBa", [0, 360, 2, 180, 450, 280, 0, 0, 1_250_263_674]],
      [30, 100, "Sb", [0, 295, 3, 146, 483, 0, 0, 0, 1_250_263_674]],
      [30, 1, "SBb", [0, 295, 3, 146, 483, 345, 0, 0, 1_250_263_674]],
      [100, 100, "Sc", [0, 219, 5, 106, 521, 0, 0, 0, 1_250_263_674]],
      [100, 1, "SBc", [0, 219, 3, 106, 521, 421, 0, 0, 1_250_263_674]],
    ]

    cases.each do |tests, roots, designation, knobs|
      result = classify(snapshot(core: 100, modules: 100, tests:, roots:))

      assert_equal(designation, result.fetch("designation"))
      assert_equal(knobs, result.fetch("knobs"))
    end
  end

  def test_project_name_changes_only_the_orientation_seed
    first = classify(snapshot(core: 100, modules: 100, roots: 100, project_name: "Alpha"))
    second = classify(snapshot(core: 100, modules: 100, roots: 100, project_name: "Beta"))

    assert_equal(first.fetch("family"), second.fetch("family"))
    assert_equal(first.fetch("designation"), second.fetch("designation"))
    assert_equal(first.fetch("knobs").first(8), second.fetch("knobs").first(8))
    refute_equal(first.fetch("knobs").last, second.fetch("knobs").last)
    assert_equal(first, classify(snapshot(core: 100, modules: 100, roots: 100, project_name: "Alpha")))
  end

  def test_package_aggregates_reach_every_family_through_the_shared_classifier
    cases = [
      [29, [10, 5, 20, 5], 4, "Irr", [0, 0, 0, 0, 0, 0, 5, 627, 1234]],
      [100, [1, 0, 100, 0], 0, "E0", [0, 0, 0, 0, 0, 0, 0, 0, 1234]],
      [100, [0, 0, 40, 10], 1, "S0", [0, 347, 0, 0, 0, 0, 0, 0, 1234]],
      [100, [0, 0, 20, 20], 2, "Sc", [0, 234, 4, 114, 513, 0, 0, 0, 1234]],
      [100, [0, 0, 0, 10], 3, "SBc", [0, 140, 4, 65, 560, 500, 0, 0, 1234]],
    ]

    cases.each do |size, counts, family, designation, knobs|
      result = classify_package(size:, counts:, phase_seed: 1234)

      assert_equal(family, result.fetch("family"))
      assert_equal(designation, result.fetch("designation"))
      assert_equal(knobs, result.fetch("knobs"))
    end
  end

  def test_package_seed_changes_only_orientation_and_metadata_does_not_change_the_decision
    package = {
      "name" => "first-name",
      "role" => 0,
      "location" => 1,
      "declaration_count" => 100,
      "ruby_counts" => [0, 0, 20, 20],
    }
    first = RubyLens::MorphologyClassifier.new(package:, phase_seed: 1234).call
    second = RubyLens::MorphologyClassifier.new(
      package: package.merge("name" => "other", "role" => 1, "location" => 0),
      phase_seed: 5678,
    ).call

    assert_equal(first.fetch("family"), second.fetch("family"))
    assert_equal(first.fetch("designation"), second.fetch("designation"))
    assert_equal(first.fetch("knobs").first(8), second.fetch("knobs").first(8))
    refute_equal(first.fetch("knobs").last, second.fetch("knobs").last)
  end

  def test_package_module_smoothing_prevents_a_nonadjacent_one_count_jump
    before = classify_package(size: 30, counts: [0, 0, 30, 0], phase_seed: 1234)
    after = classify_package(size: 30, counts: [0, 1, 30, 0], phase_seed: 1234)

    assert_equal(0, before.fetch("family"))
    assert_equal(1, after.fetch("family"))
  end

  def test_package_without_recognized_constructs_uses_an_independent_seeded_fallback
    result = classify_package(size: 100, counts: [0, 0, 0, 0], phase_seed: 1234)

    assert_equal(2, result.fetch("family"))
    assert_equal("Sb", result.fetch("designation"))
    assert_equal([0, 240, 3, 105, 380, 0, 0, 0, 1234], result.fetch("knobs"))
  end

  def test_malformed_package_input_uses_a_numeric_default_seed
    result = RubyLens::MorphologyClassifier.new(package: {}, phase_seed: "private seed").call

    assert_equal(2, result.fetch("family"))
    assert_equal([0, 240, 3, 105, 380, 0, 0, 0, 0], result.fetch("knobs"))
  end

  def test_rejects_ambiguous_project_and_package_inputs
    error = assert_raises(ArgumentError) do
      RubyLens::MorphologyClassifier.new(snapshot(core: 30), package: {})
    end

    assert_equal("provide a snapshot or package, not both", error.message)
  end

  def test_mixed_core_and_test_namespaces_count_as_non_test_core
    input = snapshot(core: 30)
    input.fetch("namespaces").first[2] = 2

    result = classify(input)

    assert_equal(0, result.fetch("family"))
    refute_equal(0, result.fetch("knobs").last)
  end

  def test_small_perturbations_are_stable_away_from_edges
    before = classify(snapshot(core: 100, modules: 50, tests: 50, dependencies: 100, roots: 10))
    after = classify(snapshot(core: 101, modules: 50, tests: 50, dependencies: 100, roots: 10))

    assert_equal(before.fetch("family"), after.fetch("family"))
  end

  def test_malformed_or_empty_inputs_use_the_current_default
    malformed = snapshot(core: 30)
    malformed.fetch("namespaces").first[1] = "module"

    [{}, snapshot(core: 0), malformed].each do |input|
      result = classify(input)
      assert_equal(2, result.fetch("family"))
      assert_equal("Sb", result.fetch("designation"))
      assert_equal([0, 240, 3, 105, 380, 0, 0, 0, 0], result.fetch("knobs"))
    end
  end

  def test_readme_discloses_the_derived_morphology_signal
    readme = File.read(File.expand_path("../README.md", __dir__))

    assert_includes(readme, "central Core/Test galaxy and each dependency package independently")
    assert_includes(readme, "never inherits the project's, host's, or dependency system's decision")
    assert_includes(readme, "a package's rendered shape can make the rough makeup of that gem easier to see")
    assert_includes(readme, "docs/specs/2026-07-14-galaxy-morphology-design.md")
  end

  private

  def classify(input)
    RubyLens::MorphologyClassifier.new(input).call
  end

  def classify_package(size:, counts:, phase_seed:)
    package = { "declaration_count" => size, "ruby_counts" => counts }
    RubyLens::MorphologyClassifier.new(package:, phase_seed:).call
  end

  def snapshot(core:, modules: 0, tests: 0, dependencies: 0, roots: nil, root_counts: nil, project_name: "Synthetic")
    unless root_counts
      root_total = roots || core
      if root_total.zero?
        root_counts = []
      else
        base, remainder = core.divmod(root_total)
        root_counts = Array.new(root_total) { |index| base + (index < remainder ? 1 : 0) }
      end
    end
    core_names = root_counts.each_with_index.flat_map do |count, root|
      Array.new(count) { |index| "Root#{root}::Node#{index}" }
    end.first(core)
    core_rows = Array.new(core) do |index|
      [0, index < modules ? 1 : 0, 0, *Array.new(11, 0)]
    end
    test_rows = Array.new(tests) { [0, 0, 1, *Array.new(11, 0)] }
    package = {
      "name" => "synthetic-gem",
      "role" => 1,
      "location" => 1,
      "declaration_count" => dependencies,
      "ruby_counts" => [0, 0, dependencies, 0],
      "declarations" => [],
    }
    {
      "project_name" => project_name,
      "namespace_names" => core_names + Array.new(tests) { |index| "TestRoot::Test#{index}" },
      "namespaces" => core_rows + test_rows,
      "packages" => dependencies.zero? ? [] : [package],
    }
  end
end
