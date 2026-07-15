# frozen_string_literal: true

require "json"
require "open3"
require_relative "test_helper"

class MorphologyRuntimeTest < Minitest::Test
  RUNTIME = File.read(File.expand_path("../assets/runtime/report.js", __dir__))

  def test_absent_and_classifier_default_preserve_legacy_positions_exactly
    absent = runtime_stats(nil)
    fallback = runtime_stats({ "family" => 2, "knobs" => [0, 240, 3, 105, 380, 0, 0, 0, 0] })

    [absent, fallback].each do |stats|
      assert_equal(true, stats.dig("morphology", "legacy"))
      assert_equal(true, stats.fetch("legacyCoreExact"))
      assert_equal(true, stats.fetch("legacyTestsExact"))
      assert_equal(42, stats.dig("layout", "coreOuterRadius"))
      assert_equal(62, stats.dig("layout", "testOuterRadius"))
    end
  end

  def test_art_object_and_showcase_row_decode_to_the_same_geometry
    knobs = [0, 220, 4, 80, 520, 480, 0, 0, 1_234_567]
    object = runtime_stats({ "family" => 3, "knobs" => knobs })
    row = runtime_stats([3, *knobs])

    assert_equal(object, row)
    assert_equal(4, object.dig("morphology", "armCount"))
    assert_equal(false, object.dig("morphology", "legacy"))
  end

  def test_every_family_is_deterministic_finite_and_inside_its_declared_extent
    morphologies = [
      [0, 600, 0, 0, 0, 0, 0, 0, 0, 11],
      [1, 0, 380, 0, 0, 0, 0, 0, 0, 22],
      [2, 0, 240, 6, 70, 520, 0, 0, 0, 33],
      [3, 0, 220, 4, 80, 520, 480, 0, 0, 44],
      [4, 0, 0, 0, 0, 0, 0, 4, 650, 55],
    ]

    morphologies.each do |row|
      stats = runtime_stats(row)
      assert_equal(true, stats.fetch("finite"), "Family #{row.first}")
      assert_equal(true, stats.fetch("deterministic"), "Family #{row.first}")
      assert_operator(stats.fetch("maxCoreRadius"), :<=, stats.dig("layout", "coreOuterRadius") + 1e-9)
      assert_operator(stats.fetch("maxTestRadius"), :<=, stats.dig("layout", "testOuterRadius") + 1e-9)
      assert_in_delta(8, stats.dig("layout", "dependencyInnerRadius") - stats.dig("layout", "testOuterRadius"), 1e-12)
    end
  end

  def test_ellipticity_flattens_only_the_vertical_axis
    round = runtime_stats([0, 0, 0, 0, 0, 0, 0, 0, 0, 77])
    flat = runtime_stats([0, 700, 0, 0, 0, 0, 0, 0, 0, 77])

    assert_in_delta(round.fetch("meanHorizontal"), flat.fetch("meanHorizontal"), 1e-12)
    assert_operator(flat.fetch("meanVertical"), :<, round.fetch("meanVertical") * 0.31)
  end

  def test_spiral_core_arm_participation_and_arm_bounds_are_load_time_values
    spiral = runtime_stats([2, 0, 200, 99, 70, 500, 0, 0, 0, 88])
    barred = runtime_stats([3, 0, 200, 99, 70, 500, 500, 0, 0, 99])

    assert_equal(6, spiral.dig("morphology", "armCount"))
    assert_equal(4, barred.dig("morphology", "armCount"))
    assert_in_delta(0.5, spiral.fetch("coreArmShare"), 0.025)
    assert_in_delta(0.5, barred.fetch("coreArmShare"), 0.025)
    assert_equal(1, RUNTIME.scan("const morphology = decodeMorphology(model.morphology);").length)
    assert_equal(1, RUNTIME.scan("const irregularClumpCenters =").length)
  end

  def test_irregular_recipe_precomputes_the_requested_bounded_clumps
    stats = runtime_stats([4, 0, 0, 0, 0, 0, 0, 5, 750, 123])

    assert_equal(5, stats.fetch("clumpCenters"))
    assert_equal(4, stats.dig("morphology", "family"))
  end

  def test_all_family_labels_share_the_actual_rendered_star_count
    labels = RUNTIME.match(/^    const MORPHOLOGY_FAMILY_LABELS = Object\.freeze\((?<labels>\[.*\])\);$/)[:labels]

    assert_equal(
      ["Elliptical galaxy", "Lenticular galaxy", "Spiral galaxy", "Barred spiral galaxy", "Irregular galaxy"],
      JSON.parse(labels),
    )
    assert_includes(RUNTIME, "const renderedStarCount = renderPoints.length;")
    assert_includes(
      RUNTIME,
      '`${MORPHOLOGY_FAMILY_LABELS[morphology.family]} - ${renderedStarCount.toLocaleString("en-US")} ${renderedStarCount === 1 ? "star" : "stars"}`',
    )
  end

  private

  def runtime_stats(raw_morphology)
    source = runtime_geometry_source
    script = <<~JAVASCRIPT
      const model = { morphology: #{JSON.generate(raw_morphology)}, namespaces: Array.from({length: 3000}, (_, index) => [index, 0, 0, index % 4 === 0 ? 1 : 0]) };
      const CORE_SCALE_BASELINE = 3000;
      #{source}
      function legacyCore(seed) {
        const bulge = unit(seed, 2) < .24;
        const radial = bulge ? 17 * Math.pow(unit(seed, 3), 1.75) : Math.min(42, -10 * Math.log(Math.max(1e-5, 1 - unit(seed, 3))));
        const theta = unit(seed, 4) * Math.PI * 2 + radial * .04;
        const vertical = normal(seed, 5) * (bulge ? 5.8 : 1.4 + radial * .025);
        const scale = bulge ? layoutScale.bulge : layoutScale.disk;
        return [Math.cos(theta) * radial * scale, vertical * scale, Math.sin(theta) * radial * scale];
      }
      function legacyTests(seed) {
        const radial = 17 + Math.min(45, -14 * Math.log(Math.max(1e-5, 1 - unit(seed, 7))));
        const arm = Math.floor(unit(seed, 8) * 3);
        const inArm = unit(seed, 9) < .38;
        const theta = inArm ? arm * (Math.PI * 2 / 3) + radial * .105 + normal(seed, 10) * .22 : unit(seed, 10) * Math.PI * 2;
        const vertical = normal(seed, 11) * (1.4 + radial * .035);
        return [Math.cos(theta) * radial * layoutScale.tests, vertical * layoutScale.tests, Math.sin(theta) * radial * layoutScale.tests];
      }
      const seeds = Array.from({length: 4096}, (_, index) => index + 1);
      const core = seeds.map(corePosition);
      const tests = seeds.map(testPosition);
      const all = core.concat(tests);
      const radius = point => Math.hypot(point[0], point[2]);
      const equalPoint = (left, right) => left.every((value, index) => Object.is(value, right[index]));
      const discSeeds = seeds.filter(seed => unit(seed, 2) >= morphology.bulgeShare);
      const armSeeds = discSeeds.filter(seed => coreDiscUsesArm(seed, false));
      process.stdout.write(JSON.stringify({
        morphology,
        layout: layoutScale,
        clumpCenters: irregularClumpCenters.length,
        finite: all.every(point => point.every(Number.isFinite)),
        deterministic: seeds.every(seed => equalPoint(corePosition(seed), corePosition(seed)) && equalPoint(testPosition(seed), testPosition(seed))),
        legacyCoreExact: morphology.legacy ? seeds.every(seed => equalPoint(corePosition(seed), legacyCore(seed))) : null,
        legacyTestsExact: morphology.legacy ? seeds.every(seed => equalPoint(testPosition(seed), legacyTests(seed))) : null,
        maxCoreRadius: Math.max(...core.map(radius)),
        maxTestRadius: Math.max(...tests.map(radius)),
        meanHorizontal: core.reduce((sum, point) => sum + Math.hypot(point[0], point[2]), 0) / core.length,
        meanVertical: core.reduce((sum, point) => sum + Math.abs(point[1]), 0) / core.length,
        coreArmShare: discSeeds.length ? armSeeds.length / discSeeds.length : 0,
      }));
    JAVASCRIPT
    output, error, status = Open3.capture3("node", "-e", script)
    raise "Node failed: #{error}" unless status.success?

    JSON.parse(output)
  end

  def runtime_geometry_source
    family = RUNTIME.match(/^    const MORPHOLOGY_FAMILY = .*;$/).to_s.strip
    legacy = RUNTIME.match(/^    const LEGACY_MORPHOLOGY = Object\.freeze\(\{.*?^    \}\);$/m).to_s.strip
    primitives = RUNTIME.match(/^    const hash = .*?^    const spiralMorphology = morphology\.family === MORPHOLOGY_FAMILY\.spiral \|\| morphology\.family === MORPHOLOGY_FAMILY\.barredSpiral;$/m).to_s
    layout = runtime_function("layoutMetricsForCoreCount")
    positions = RUNTIME.match(/^    const coreCount = .*?^    \}\n\n    const dependencySystems =/m).to_s.sub(/\n\n    const dependencySystems =\z/, "")
    raise "morphology runtime source not found" if [family, legacy, primitives, layout, positions].any?(&:empty?)

    [family, legacy, primitives, layout, positions].join("\n")
  end

  def runtime_function(name)
    source = RUNTIME.match(/^    function #{Regexp.escape(name)}\b.*?^    \}\n/m).to_s
    raise "#{name} function not found" if source.empty?

    source
  end
end
