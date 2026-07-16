# frozen_string_literal: true

require "open3"
require_relative "test_helper"

class LayoutDensityRuntimeTest < Minitest::Test
  RUNTIME_PATH = File.expand_path("../assets/runtime/report.js", __dir__)
  RUNTIME = File.read(RUNTIME_PATH)
  BASELINE_METRICS = {
    "disk" => 1,
    "bulge" => 1,
    "tests" => 1,
    "cameraScale" => 1,
    "cameraDistance" => 270,
    "cameraFocalLength" => 440,
    "coreOuterRadius" => 42,
    "testOuterRadius" => 62,
    "dependencyInnerRadius" => 70,
  }.freeze

  def test_core_counts_at_or_below_the_knee_preserve_the_original_layout
    [0, 1, 2_999, 3_000].each do |core_count|
      assert_equal(BASELINE_METRICS, layout_metrics(core_count), "Core count: #{core_count}")
    end

    assert_includes(RUNTIME, "function layoutMetricsForCoreCount(coreCount, activeMorphology) {")
  end

  def test_outer_system_expansion_is_monotonic_and_concave
    metrics = [3_000, 6_000, 9_000, 12_000].map { |count| layout_metrics(count) }
    disk_scales = metrics.map { |item| item.fetch("disk") }
    increments = disk_scales.each_cons(2).map { |left, right| right - left }

    disk_scales.each_cons(2) { |left, right| assert_operator(left, :<, right) }
    increments.each_cons(2) { |left, right| assert_operator(left, :>, right) }
    metrics.each { |item| assert_equal(item.fetch("disk"), item.fetch("tests")) }
  end

  def test_bulge_and_camera_preserve_a_strong_central_concentration
    metrics = [6_000, 12_000, 100_000].map { |count| layout_metrics(count) }
    concentration = metrics.map { |item| item.fetch("bulge") / item.fetch("disk") }

    metrics.each do |item|
      assert_operator(item.fetch("bulge"), :<, item.fetch("cameraScale"))
      assert_operator(item.fetch("cameraScale"), :<, item.fetch("disk"))
    end
    concentration.each_cons(2) { |left, right| assert_operator(left, :>, right) }
    assert_includes(RUNTIME, "const bulge = unit(seed, 2) < .24;")
    assert_includes(RUNTIME, "const scale = bulge ? layoutScale.bulge : layoutScale.disk;")
  end

  def test_moderately_large_layout_preserves_the_prototype_geometry
    metrics = layout_metrics(7_121)

    assert_in_delta(1.4754988623, metrics.fetch("disk"), 1e-10)
    assert_in_delta(1.3533088000, metrics.fetch("bulge"), 1e-10)
    assert_in_delta(1.4754988623, metrics.fetch("tests"), 1e-10)
    assert_in_delta(368.5656589, metrics.fetch("cameraDistance"), 1e-7)
    assert_in_delta(91.4809295, metrics.fetch("testOuterRadius"), 1e-7)
    assert_in_delta(99.4809295, metrics.fetch("dependencyInnerRadius"), 1e-7)
  end

  def test_a_very_large_repository_keeps_one_non_linearly_scaled_system
    metrics = layout_metrics(100_000)

    assert_in_delta(4.8450184520, metrics.fetch("disk"), 1e-10)
    assert_in_delta(3.4119885167, metrics.fetch("bulge"), 1e-10)
    assert_in_delta(metrics.fetch("disk"), metrics.fetch("tests"), 1e-12)
    assert_operator(metrics.fetch("cameraScale"), :<, metrics.fetch("disk"))
    assert_in_delta(8, metrics.fetch("dependencyInnerRadius") - metrics.fetch("testOuterRadius"), 1e-12)
  end

  def test_canvas_and_webgl_share_the_adaptive_camera
    assert_includes(RUNTIME, "float depth = u_cameraDistance - z2;")
    assert_includes(RUNTIME, "float perspective = u_cameraFocalLength / depth * u_zoom;")
    assert_includes(RUNTIME, "gl.uniform1f(pointUniforms.cameraDistance, cameraDistance);")
    assert_includes(RUNTIME, "gl.uniform1f(pointUniforms.cameraFocalLength, cameraFocalLength);")
    assert_includes(RUNTIME, "const depth = cameraDistance - z2;")
    assert_includes(RUNTIME, "const perspective = cameraFocalLength / depth * zoom;")
    assert_includes(RUNTIME, "function contextualSelectionCameraTarget(point, preferredZoom = point.hub ? 4 : point.category === \"dependencies\" ? 5 : 7) {")
    assert_includes(RUNTIME, "const coreFitZoom = Math.min(sceneRight, sceneBottom) * .28 * cameraDistance / (layoutScale.coreOuterRadius * cameraFocalLength);")
  end

  def test_dependency_anchor_boundary_stays_eight_units_outside_the_test_boundary
    [0, 3_000, 7_121, 100_000].each do |core_count|
      metrics = layout_metrics(core_count)
      assert_in_delta(8, metrics.fetch("dependencyInnerRadius") - metrics.fetch("testOuterRadius"), 1e-12)
    end
    assert_includes(
      RUNTIME,
      "radius = layoutScale.dependencyInnerRadius + 72 * Math.sqrt(layoutScale.tests) * Math.pow(unit(seed, 14), .72)",
    )
    assert_includes(RUNTIME, "dependencyInnerRadius: testExtent * tests + 8")
  end

  def test_adaptive_layout_work_is_confined_to_load_time_setup
    assert_equal(2, RUNTIME.scan("layoutMetricsForCoreCount(").length)
    assert_equal(1, RUNTIME.scan("model.namespaces.reduce").length)
    assert_operator(RUNTIME.index("model.namespaces.reduce"), :<, RUNTIME.index("function corePosition"))
    assert_operator(
      RUNTIME.index("const layoutScale = layoutMetricsForCoreCount(coreCount, morphology);"),
      :<,
      RUNTIME.index("function buildPoints"),
    )

    %w[createShowcaseRenderer project renderShowcaseFallback render applyShowcaseCamera renderShowcase].each do |name|
      function = runtime_function(name)
      refute_includes(function, "model.namespaces")
      refute_includes(function, "layoutMetricsForCoreCount")
    end
  end

  private

  def layout_metrics(core_count)
    constants = RUNTIME.match(/^    const CORE_SCALE_BASELINE = .*;$/).to_s.strip
    function = runtime_function("layoutMetricsForCoreCount")
    raise "layout metric constant not found" if constants.empty?

    script = <<~JAVASCRIPT
      #{constants}
      #{function}
      process.stdout.write(JSON.stringify(layoutMetricsForCoreCount(#{core_count}, { legacy: true, family: 2, clumpSpread: 0 })));
    JAVASCRIPT
    output, error, status = Open3.capture3("node", "-e", script)
    raise "Node failed: #{error}" unless status.success?

    JSON.parse(output)
  end

  def runtime_function(name)
    source = RUNTIME.match(/^    function #{Regexp.escape(name)}\b.*?^    \}\n/m).to_s
    raise "#{name} function not found" if source.empty?

    source
  end
end
