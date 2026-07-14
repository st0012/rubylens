# frozen_string_literal: true

require "json"
require "open3"
require_relative "test_helper"

class ExplorerRuntimeTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)
  SHELL = File.read(File.join(ROOT, "assets/shells/report.html"))
  STYLES = File.read(File.join(ROOT, "assets/styles/report.css"))
  RUNTIME = File.read(File.join(ROOT, "assets/runtime/report.js"))

  def test_partial_index_status_is_an_accessible_bounded_disclosure
    assert_includes(SHELL, '<details class="warning-disclosure" id="status" hidden>')
    assert_includes(SHELL, '<summary id="warning-summary"></summary>')
    assert_includes(RUNTIME, "function populateWarningDisclosure()")
    assert_includes(RUNTIME, "const WARNING_ROW_LIMIT = 24")
    assert_includes(RUNTIME, 'warning && typeof warning.name === "string"')
    assert_includes(RUNTIME, 'const key = `${warning.name}\\u0000${warning.reason}`')
    assert_includes(RUNTIME, 'appendWarningGroup(container, "Ruby index", counts.index')
    assert_includes(RUNTIME, 'appendWarningGroup(container, "Integrity checks", counts.integrity')
    assert_includes(STYLES, "max-height: min(360px, calc(100vh - 180px))")
    assert_includes(STYLES, "max-height: clamp(48px, calc(54vh - 220px), 240px)")
    assert_includes(STYLES, '.warning-disclosure > summary::after { content: ""; flex: 0 0 8px; width: 8px; height: 5px;')
    assert_includes(STYLES, "clip-path: polygon(0 0, 50% 70%, 100% 0, 100% 30%, 50% 100%, 0 30%)")
    assert_includes(STYLES, "details.warning-disclosure[open] > summary::after { transform: rotate(180deg); }")
    assert_includes(STYLES, "overflow-wrap: anywhere")
    refute_includes(RUNTIME, "appendDependencyWarnings")
    refute_includes(RUNTIME, "innerHTML")
  end

  def test_reset_uses_the_existing_flight_and_exact_default_camera_without_changing_drift
    assert_includes(SHELL, 'id="reset-view" aria-label="Reset to default view" aria-keyshortcuts="0">Reset</button>')
    assert_includes(RUNTIME, "const DEFAULT_CAMERA = Object.freeze({ yaw: -.36, pitch: .34, zoom: 1, panX: 0, panY: 0 })")
    assert_includes(RUNTIME, "function resetView()")
    assert_match(/function resetView\(\).*?clearCategoryFocus\(\).*?clearExpandedPackage\(\).*?selectPoint\(null\).*?setNavigationMode\("orbit"\).*?setCategoryVisible\(category, true\).*?flyCamera\(DEFAULT_CAMERA\)/m, RUNTIME)
    assert_includes(RUNTIME, "finalTarget,")
    assert_includes(RUNTIME, "applyCameraTarget(finalTarget)")
    assert_includes(RUNTIME, 'else if (event.key === "0") resetView()')
    assert_includes(RUNTIME, 'document.getElementById("reset-view").addEventListener("click", resetView)')
    reset_body = runtime_function("resetView")
    refute_includes(reset_body, "setDrifting")
    refute_includes(reset_body, "driftRequested")

    toolbar = SHELL.match(/<div class="toolbar">(?<body>.*?)<\/div>/m)[:body]
    expected_order = ['id="motion"', 'id="reset-view"', 'id="pan-mode"', 'id="zoom-out"', 'id="zoom-level"', 'id="zoom-in"']
    assert_equal(expected_order, expected_order.sort_by { |marker| toolbar.index(marker) })
    refute_includes(SHELL, ">Home</button>")
  end

  def test_explorer_drift_is_time_based_gap_capped_and_not_suppressed_by_interaction
    assert_includes(RUNTIME, "const DRIFT_RADIANS_PER_SECOND = .04125")
    assert_includes(RUNTIME, "const MAX_DRIFT_DELTA_MS = 50")
    assert_includes(RUNTIME, "function advanceExplorerDrift(timestamp)")
    assert_includes(RUNTIME, "clamp(timestamp - lastDriftTimestamp, 0, MAX_DRIFT_DELTA_MS)")
    assert_includes(RUNTIME, "const driftDelta = DRIFT_RADIANS_PER_SECOND * elapsed / 1000")
    assert_includes(RUNTIME, "cameraFlight.finalTarget.yaw += driftDelta")
    assert_includes(RUNTIME, "if (cameraFlight || driftAdvanced) requestRender()")
    assert_includes(RUNTIME, "lastDriftTimestamp = null")
    refute_includes(RUNTIME, "yaw += .00055")
    refute_match(/drifting && !dragging/, RUNTIME)
    refute_match(/drifting && .*selectedPoint/, RUNTIME)

    %w[focusCategory focusPoint focusDependencyPackage focusDependencySystem navigateToSelection resetView].each do |name|
      refute_includes(runtime_function(name), "setDrifting", "#{name} must preserve explicit drift state")
    end
    refute_includes(RUNTIME, "setDrifting(false)")
    refute_includes(runtime_function("setDrifting"), "cancelCameraFlight")
  end

  def test_space_is_the_only_keyboard_drift_toggle_and_respects_native_controls
    assert_includes(SHELL, 'id="motion" aria-label="Pause drift" aria-keyshortcuts="Space" aria-pressed="false"')
    assert_includes(RUNTIME, "function toggleDriftWithSpace(event)")
    assert_includes(RUNTIME, '(event.key !== " " && event.code !== "Space") || event.repeat')
    assert_includes(RUNTIME, "event.metaKey || event.ctrlKey || event.altKey || event.shiftKey")
    assert_includes(RUNTIME, 'target.closest("input, textarea, select, button, summary, a[href], [contenteditable], [role=\'button\']")')
    assert_includes(RUNTIME, "if (reducedMotionQuery.matches || isNativeSpaceTarget(event.target)) return false")
    assert_match(/function toggleDriftWithSpace\(event\).*?event\.preventDefault\(\).*?setDrifting\(!driftRequested\)/m, RUNTIME)
    assert_match(/window\.addEventListener\("keydown", event => \{\s+if \(toggleDriftWithSpace\(event\)\) return;/m, RUNTIME)
    assert_includes(RUNTIME, 'motion.setAttribute("aria-label", label)')
    assert_includes(RUNTIME, 'motion.setAttribute("aria-pressed", String(!drifting))')
    assert_includes(RUNTIME, 'motion.textContent = "Drift off"')
  end

  def test_every_point_selection_reuses_contextual_two_subject_navigation
    assert_includes(RUNTIME, "function contextualSelectionCameraTarget(point")
    assert_includes(RUNTIME, "const CONTEXT_TARGET_X = .32")
    assert_includes(RUNTIME, "const CONTEXT_CORE_X = .68")
    assert_includes(RUNTIME, "Math.PI - Math.atan2(z, x)")
    assert_includes(RUNTIME, "const desiredSeparation = sceneRight * (CONTEXT_CORE_X - CONTEXT_TARGET_X)")
    assert_includes(RUNTIME, "const coreFitZoom = Math.min(sceneRight, sceneBottom) * .28")
    assert_includes(RUNTIME, "panX: sceneRight * .5 + actualSeparation * .5 - sceneCenterX")
    assert_includes(RUNTIME, "pitch: TOP_DOWN_PITCH")
    assert_includes(RUNTIME, "function navigateToSelection(point")
    assert_includes(RUNTIME, "flyCamera(contextualSelectionCameraTarget(point), { followDrift: true })")
    assert_includes(runtime_function("focusPoint"), "navigateToSelection(point, { button })")
    assert_includes(runtime_function("focusDependencyPackage"), "navigateToSelection(hub, { button, expandDependency: true })")
    assert_includes(runtime_function("focusDependencySystem"), "navigateToSelection(hub, { button, expandDependency: true })")
    assert_includes(RUNTIME, "else if (point) navigateToSelection(point)")
    assert_includes(runtime_function("focusCategory"), "contextualCategoryCameraTarget(category)")
  end

  def test_dependency_double_click_survives_the_first_tap_selection_flight
    assert_includes(RUNTIME, "let dependencyDoubleClickTarget = null")
    assert_includes(RUNTIME, 'dependencyDoubleClickTarget = { point, x: event.clientX, y: event.clientY, at: event.timeStamp }')
    assert_includes(RUNTIME, "event.timeStamp - dependencyDoubleClickTarget.at > 1000")
    assert_includes(RUNTIME, "const remembered = dependencyDoubleClickTarget")
    assert_includes(RUNTIME, "Math.hypot(event.clientX - remembered.x, event.clientY - remembered.y) <= 12")
    assert_includes(RUNTIME, "const dependency = dependencyPackageAt(event.clientX, event.clientY) || rememberedDependency")
  end

  def test_expanded_dependency_system_retains_detailed_galaxy_context
    assert_includes(RUNTIME, "const contextVisibility = { selection: .75, category: .16, package: .75 }")
    assert_includes(RUNTIME, "const detailedPoint = emphasis >= .1")
    refute_includes(RUNTIME, "expandedPackageIndex !== null ? focusedPackagePoint : emphasis >= .1")
  end

  def test_explorer_exposure_uses_a_restrained_baseline_and_remains_legible_deep_zoom
    assert_includes(RUNTIME, "function explorerExposureForZoom(zoomLevel)")
    assert_includes(RUNTIME, "const easedStops = zoomStops * zoomStops / (zoomStops + 1)")
    assert_includes(RUNTIME, "return .76 + .06 * Math.exp(-.35 * easedStops)")

    exposures = explorer_exposures(0.35, 1, 2.5, 2.58, 2.81, 3.08, 4.65, 7, 19.64, 40, 1e12)
    assert_in_delta(0.82, exposures[0], 0.000_001)
    assert_in_delta(0.82, exposures[1], 0.000_001)
    assert_in_delta(0.806, exposures[2], 0.001)
    assert_in_delta(0.806, exposures[3], 0.001)
    assert_in_delta(0.804, exposures[4], 0.001)
    assert_in_delta(0.802, exposures[5], 0.001)
    assert_in_delta(0.795, exposures[6], 0.001)
    assert_in_delta(0.789, exposures[7], 0.001)
    assert_in_delta(0.778, exposures[8], 0.001)
    assert_in_delta(0.773, exposures[9], 0.001)
    assert_in_delta(0.76, exposures[10], 0.000_001)
    assert_operator(exposures[3] - exposures[5], :<, 0.01)
    assert(exposures.all? { |exposure| exposure > 0.759 })
    assert(exposures.drop(1).each_cons(2).all? { |left, right| left > right })
  end

  def test_explorer_exposure_does_not_change_showcase_rendering
    explorer_render = RUNTIME.match(/function render\(timestamp\) \{(?<body>.*?)^    \}/m)[:body]
    assert_includes(explorer_render, "const exposure = explorerExposureForZoom(zoom)")
    assert_includes(explorer_render, ") * exposure")

    showcase_fallback = RUNTIME.match(/function renderShowcaseFallback\(\) \{(?<body>.*?)^    \}/m)[:body]
    refute_includes(showcase_fallback, "explorerExposureForZoom")
    refute_includes(RUNTIME.match(/function createShowcaseRenderer\(\) \{(?<body>.*?)^    \}/m)[:body], "explorerExposureForZoom")
  end

  def test_explorer_deep_zoom_lod_is_continuous_without_transition_thresholds
    assert_includes(RUNTIME, "function explorerDeepZoomLodForZoom(zoomLevel)")
    assert_includes(RUNTIME, "return 1 - 1 / Math.sqrt(Math.max(1, zoomLevel))")
    refute_includes(RUNTIME, "const start = Math.log2(1.8)")
    refute_includes(RUNTIME, "const start = Math.log2(5)")

    lods = runtime_function_values("explorerDeepZoomLodForZoom", 0.35, 1, 1.5, 2.58, 2.81, 3.08, 3.41, 5, 8, 40)
    assert_in_delta(0, lods[0], 0.000_001)
    assert_in_delta(0, lods[1], 0.000_001)
    assert_in_delta(0.184, lods[2], 0.001)
    assert_in_delta(0.377, lods[3], 0.001)
    assert_in_delta(0.403, lods[4], 0.001)
    assert_in_delta(0.430, lods[5], 0.001)
    assert_in_delta(0.458, lods[6], 0.001)
    assert_in_delta(0.553, lods[7], 0.001)
    assert_in_delta(0.646, lods[8], 0.001)
    assert_in_delta(0.842, lods[9], 0.001)
    assert(lods.each_cons(2).all? { |left, right| left <= right })
    assert_operator(lods[5] - lods[3], :<, 0.06)

    sampled_zooms = (0..80).map { |index| 8**(index / 80.0) }
    sampled_lods = runtime_function_values("explorerDeepZoomLodForZoom", *sampled_zooms)
    assert_operator(sampled_lods.each_cons(2).map { |left, right| right - left }.max, :<, 0.02)
  end

  def test_explorer_bloom_attenuation_is_a_gradual_derivative_of_zoom_lod
    assert_includes(RUNTIME, "const bloomLod = deepZoomLod * deepZoomLod * deepZoomLod")
    assert_includes(RUNTIME, "const bloomRecovery = bloomLod * bloomLod * deepZoomLod * deepZoomLod")
    refute_includes(RUNTIME, "function explorerBloomLodForZoom")

    lods = runtime_function_values("explorerDeepZoomLodForZoom", 1, 2.58, 3.08, 3.41, 5, 7, 8)
    bloom_lods = lods.map { |lod| lod**3 }
    assert_in_delta(0, bloom_lods[0], 0.000_001)
    assert_in_delta(0.054, bloom_lods[1], 0.001)
    assert_in_delta(0.080, bloom_lods[2], 0.001)
    assert_in_delta(0.096, bloom_lods[3], 0.001)
    assert_in_delta(0.169, bloom_lods[4], 0.001)
    assert_in_delta(0.241, bloom_lods[5], 0.001)
    assert_in_delta(0.270, bloom_lods[6], 0.001)
    assert_operator(bloom_lods[2] - bloom_lods[1], :<, 0.03)

    recovery_lods = lods.map { |lod| lod**8 }
    assert_in_delta(0, recovery_lods[0], 0.000_001)
    assert_in_delta(0.0004, recovery_lods[1], 0.0001)
    assert_in_delta(0.0012, recovery_lods[2], 0.0001)
    assert_in_delta(0.0087, recovery_lods[4], 0.0001)
    assert_in_delta(0.0305, recovery_lods[6], 0.0001)

    inspection_lods = runtime_function_values("explorerDeepZoomLodForZoom", 24, 40)
    inspection_recoveries = inspection_lods.map { |lod| lod**8 }
    inspection_details = [Math.log2(24) / 5, 1]
    inspection_glow_scales = inspection_lods.each_with_index.map do |lod, index|
      [1.4, 3.4 - inspection_details[index] * 1.3 - lod * 1.2 + inspection_recoveries[index] * 3].max
    end
    assert_operator(inspection_recoveries.last, :>, inspection_recoveries.first)
    assert_operator(inspection_glow_scales.last, :>, inspection_glow_scales.first)

    sampled_zooms = (0..80).map { |index| 8**(index / 80.0) }
    sampled_lods = runtime_function_values("explorerDeepZoomLodForZoom", *sampled_zooms).map { |lod| lod**3 }
    assert_operator(sampled_lods.each_cons(2).map { |left, right| right - left }.max, :<, 0.02)
  end

  def test_explorer_namespace_body_compensation_is_smooth_and_preserves_default
    assert_includes(RUNTIME, "function explorerNamespaceBodyBoost(deepZoomLod)")
    assert_includes(RUNTIME, "const lateLod = deepZoomLod * deepZoomLod")
    assert_includes(RUNTIME, "return 1 + lateLod * lateLod * 2.4")

    zoom_lods = runtime_function_values("explorerDeepZoomLodForZoom", 1, 2.58, 3.08, 19.64, 40)
    boosts = runtime_function_values("explorerNamespaceBodyBoost", *zoom_lods)
    assert_in_delta(1, boosts[0], 0.000_001)
    assert_in_delta(1.049, boosts[1], 0.001)
    assert_in_delta(1.082, boosts[2], 0.001)
    assert_in_delta(1.863, boosts[3], 0.001)
    assert_in_delta(2.206, boosts[4], 0.001)
    assert(boosts.each_cons(2).all? { |left, right| left < right })
  end

  def test_explorer_deep_zoom_lod_matches_webgl_and_canvas_without_touching_showcase
    explorer_webgl = RUNTIME.match(/function createExplorerRenderer\(\) \{(?<body>.*?)^    \}/m)[:body]
    explorer_canvas = RUNTIME.match(/function render\(timestamp\) \{(?<body>.*?)^    \}/m)[:body]
    [explorer_webgl, explorer_canvas].each do |renderer|
      assert_includes(renderer, "explorerDeepZoomLodForZoom(zoom)")
      assert_includes(renderer, "const bloomLod = deepZoomLod * deepZoomLod * deepZoomLod")
      assert_includes(renderer, "bloomRecovery")
      assert_includes(renderer, "namespaceSizeLimit")
      assert_includes(renderer, "namespaceGlowSizeLimit")
      assert_includes(renderer, "namespaceGlowScale")
      assert_includes(renderer, "namespaceHotCoreScale")
    end
    assert_includes(explorer_webgl, "bool namespacePoint = category != 2")
    assert_includes(explorer_webgl, "namespacePoint && !selected")
    assert_includes(explorer_webgl, "float signal = (a_alpha - 0.14) / 0.105")
    assert_includes(explorer_webgl, "float importance = clamp((signal - 0.2) / 0.8, 0.0, 1.0)")
    assert_includes(explorer_webgl, "float namespaceSizeLimit = 3.2 - u_deepZoomLod * 1.5")
    assert_includes(explorer_webgl, "float namespaceHotCoreScale = namespacePoint && !selected ? 1.0 - u_deepZoomLod * 0.35 : 1.0")
    assert_includes(explorer_webgl, "float namespaceGlowScale = max(1.4, 3.4 - u_deepDetail * 1.3 - u_deepZoomLod * 1.2 + u_bloomRecovery * 3.0)")
    assert_includes(explorer_webgl, "float lateLod = u_deepZoomLod * u_deepZoomLod")
    assert_includes(explorer_webgl, "float namespaceBodyBoost = namespacePoint && !selected ? 1.0 + lateLod * lateLod * 2.4 : 1.0")
    assert_includes(explorer_webgl, "u_deepZoomLod")
    assert_includes(explorer_webgl, "u_bloomLod")
    assert_includes(explorer_webgl, "u_bloomRecovery")
    assert_includes(explorer_webgl, "gl.uniform1f(pointUniforms.deepZoomLod, deepZoomLod)")
    assert_includes(explorer_webgl, "gl.uniform1f(pointUniforms.bloomLod, bloomLod)")
    assert_includes(explorer_webgl, "gl.uniform1f(pointUniforms.bloomRecovery, bloomRecovery)")
    assert_includes(explorer_webgl, "alpha = min(0.9, visibleAlpha * 1.25)")
    assert_includes(explorer_canvas, 'const namespacePoint = point.category !== "dependencies"')
    assert_includes(explorer_canvas, "const namespaceSizeLimit = 3.2 - deepZoomLod * 1.5")
    assert_includes(explorer_canvas, "const namespaceHotCoreScale = 1 - deepZoomLod * .35")
    assert_includes(explorer_canvas, "const namespaceGlowScale = Math.max(1.4, 3.4 - deepDetail * 1.3 - deepZoomLod * 1.2 + bloomRecovery * 3)")
    assert_includes(explorer_canvas, "const namespaceBodyBoost = explorerNamespaceBodyBoost(deepZoomLod)")
    assert_includes(explorer_canvas, "const bodyBoost = namespacePoint && point !== selectedPoint ? namespaceBodyBoost : 1")
    assert_includes(explorer_canvas, "explorerNamespaceBloomRetention(signal, bloomLod, bloomRecovery, point === selectedPoint)")
    assert_includes(explorer_canvas, "context.globalAlpha = Math.min(.9, visibleAlpha * 1.25)")

    retentions = namespace_bloom_retentions(
      [0.3, 1, 1, false],
      [0.6, 1, 1, false],
      [1.0, 1, 1, false],
      [0.3, 1, 1, true],
      [0.3, 0, 0, false],
    )
    assert_in_delta(0.6125, retentions[0], 0.000_001)
    assert_in_delta(0.95, retentions[1], 0.000_001)
    assert_in_delta(1.4, retentions[2], 0.000_001)
    assert_in_delta(1, retentions[3], 0.000_001)
    assert_in_delta(1, retentions[4], 0.000_001)

    showcase_fallback = RUNTIME.match(/function renderShowcaseFallback\(\) \{(?<body>.*?)^    \}/m)[:body]
    showcase_webgl = RUNTIME.match(/function createShowcaseRenderer\(\) \{(?<body>.*?)^    \}/m)[:body]
    [showcase_fallback, showcase_webgl].each do |renderer|
      refute_includes(renderer, "explorerDeepZoomLodForZoom")
      refute_includes(renderer, "explorerNamespaceBloomRetention")
      refute_includes(renderer, "u_deepZoomLod")
      refute_includes(renderer, "u_bloomLod")
    end
  end

  def test_search_is_lazy_bounded_progressive_and_reuses_navigation
    assert_includes(SHELL, '<input type="search" id="explorer-search"')
    assert_includes(SHELL, 'role="region" aria-label="Search results"')
    assert_includes(RUNTIME, "const SEARCH_DEBOUNCE_MS = 120")
    assert_includes(RUNTIME, "const SEARCH_RESULT_LIMIT = 24")
    assert_includes(RUNTIME, "const SEARCH_BATCH_SIZE = 8")
    assert_includes(RUNTIME, "searchIndex ||= interactivePoints.map(point => point.name.toLowerCase())")
    assert_includes(RUNTIME, "buckets.flat().slice(0, SEARCH_RESULT_LIMIT)")
    assert_includes(RUNTIME, "searchMatches.slice(0, searchVisibleCount)")
    assert_includes(RUNTIME, "searchVisibleCount + SEARCH_BATCH_SIZE")
    assert_includes(RUNTIME, "renderSearchResults(firstNewResult)")
    assert_includes(RUNTIME, 'querySelectorAll(".search-result")[focusIndex]?.focus()')
    assert_includes(RUNTIME, "if (point.systemHub && !point.packageHub) focusDependencySystem(point.systemIndex)")
    assert_includes(RUNTIME, "else if (point.packageHub) focusDependencyPackage(point.packageIndex)")
    assert_includes(RUNTIME, "else focusPoint(point)")
    assert_includes(RUNTIME, 'event.stopPropagation()')
    assert_includes(RUNTIME, 'clearSearch({ focus: true })')
    assert_operator(RUNTIME.index("function initializeSearch()"), :>, RUNTIME.index("function ensureSearchIndex()"))
    refute_match(/function render\(timestamp\).*?ensureSearchIndex/m, RUNTIME)
  end

  def test_git_source_system_layout_is_deterministic_linear_and_keeps_member_hubs
    model = {
      "packages" => [
        [101, 0, 1, 0, 0, 0, 0, 0, 0],
        [202, 1, 1, 3, 1, 0, 2, 0, 0],
        [303, 1, 1, 2, 0, 1, 1, 0, -1],
      ],
      "dependencySystems" => [[404, 0]],
    }
    first = dependency_layout(model)
    second = dependency_layout(model)

    assert_equal(first, second)
    assert_equal([[0, 1]], first.fetch("systemMembers"))
    assert_equal(3, first.fetch("systemAggregates").first.fetch("declarationCount"))
    assert_equal(1, first.fetch("systemAggregates").first.fetch("directCount"))
    assert_equal(1.6, first.fetch("packageAnchors").first[3])
    refute_equal(first.fetch("packageAnchors")[0].first(3), first.fetch("packageAnchors")[1].first(3))
    assert_equal(-1, first.fetch("packageAnchors")[2][5])
    assert_includes(RUNTIME, "const systemMembers = Array.from({ length: dependencySystems.length }, () => [])")
    assert_includes(RUNTIME, "const systemAggregates = systemMembers.map(packageIndexes =>")
    assert_includes(RUNTIME, "systemAnchors.forEach((anchor, index) =>")
    assert_includes(RUNTIME, "packageAnchors.forEach((anchor, index) =>")
    assert_includes(RUNTIME, "hub: true, systemHub: true")
    assert_includes(RUNTIME, "hub: true, packageHub: true")
    refute_includes(runtime_function("render"), "systemMembers")
    refute_includes(runtime_function("project"), ".find(")
  end

  private

  def explorer_exposures(*zooms)
    runtime_function_values("explorerExposureForZoom", *zooms)
  end

  def runtime_function_values(function_name, *values)
    function = RUNTIME.match(/^    function #{Regexp.escape(function_name)}\b.*?^    \}\n/m).to_s
    raise "#{function_name} function not found" if function.empty?

    script = <<~JAVASCRIPT
      const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
      #{function}
      const values = #{JSON.generate(values)};
      process.stdout.write(JSON.stringify(values.map(value => #{function_name}(value))));
    JAVASCRIPT
    output, error, status = Open3.capture3("node", "-e", script)
    raise "Node failed: #{error}" unless status.success?

    JSON.parse(output)
  end

  def namespace_bloom_retentions(*arguments)
    function = RUNTIME.match(/^    function explorerNamespaceBloomRetention\b.*?^    \}\n/m).to_s
    raise "explorerNamespaceBloomRetention function not found" if function.empty?

    script = <<~JAVASCRIPT
      const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
      #{function}
      const arguments = #{JSON.generate(arguments)};
      process.stdout.write(JSON.stringify(arguments.map(values => explorerNamespaceBloomRetention(...values))));
    JAVASCRIPT
    output, error, status = Open3.capture3("node", "-e", script)
    raise "Node failed: #{error}" unless status.success?

    JSON.parse(output)
  end

  def dependency_layout(model)
    helpers = RUNTIME.match(/^    const hash = .*?^    const clamp = .*?;$/m).to_s
    source = RUNTIME.match(/^    const dependencySystems = .*?(?=^    function dependencyPosition)/m).to_s
    raise "dependency layout source not found" if source.empty?

    script = <<~JAVASCRIPT
      const model = #{JSON.generate(model)};
      const layoutScale = { dependencyInnerRadius: 70, tests: 1 };
      #{helpers}
      #{source}
      process.stdout.write(JSON.stringify({ systemMembers, systemAggregates, systemAnchors, packageAnchors }));
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
