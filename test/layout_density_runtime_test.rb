# frozen_string_literal: true

require_relative "test_helper"

class LayoutDensityRuntimeTest < Minitest::Test
  RUNTIME_PATH = File.expand_path("../assets/runtime/report.js", __dir__)
  RUNTIME = File.read(RUNTIME_PATH)

  def test_cpu_projection_and_webgl_share_the_adaptive_camera
    assert_includes(RUNTIME, "float depth = u_cameraDistance - z2;")
    assert_includes(RUNTIME, "float perspective = u_cameraFocalLength / depth * u_zoom;")
    assert_includes(RUNTIME, "gl.uniform1f(pointUniforms.cameraDistance, cameraDistance);")
    assert_includes(RUNTIME, "gl.uniform1f(pointUniforms.cameraFocalLength, cameraFocalLength);")
    assert_includes(RUNTIME, "const depth = cameraDistance - z2;")
    assert_includes(RUNTIME, "const perspective = cameraFocalLength / depth * zoom;")
    assert_includes(RUNTIME, "function contextualSelectionCameraTarget(point, preferredZoom = point.hub ? 4 : point.category === \"dependencies\" ? 5 : 7) {")
    assert_includes(RUNTIME, "const coreFitZoom = Math.min(sceneRight, sceneBottom) * .28 * cameraDistance / (layoutScale.coreOuterRadius * cameraFocalLength);")
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

    %w[createShowcaseRenderer project render applyShowcaseCamera renderShowcase].each do |name|
      function = runtime_function(name)
      refute_includes(function, "model.namespaces")
      refute_includes(function, "layoutMetricsForCoreCount")
    end
  end

  private

  def runtime_function(name)
    source = RUNTIME.match(/^    function #{Regexp.escape(name)}\b.*?^    \}\n/m).to_s
    raise "#{name} function not found" if source.empty?

    source
  end
end
