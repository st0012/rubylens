# frozen_string_literal: true

require "json"
require_relative "test_helper"

class ExplorerRuntimeTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)
  SHELL = File.read(File.join(ROOT, "assets/shells/report.html"))
  STYLES = File.read(File.join(ROOT, "assets/styles/report.css"))
  RUNTIME = File.read(File.join(ROOT, "assets/runtime/report.js"))

  def test_galaxy_summary_sits_with_the_title
    assert_match(%r{<h1>Ruby project</h1>\s*<p class="galaxy-summary" id="galaxy-summary"></p>}, SHELL)
    assert_includes(STYLES, ".galaxy-summary")
  end

  def test_partial_index_status_is_an_accessible_bounded_disclosure
    assert_includes(SHELL, '<details class="warning-disclosure" id="status" hidden>')
    assert_includes(SHELL, '<summary id="warning-summary"></summary>')
    assert_includes(RUNTIME, "function populateWarningDisclosure()")
    assert_includes(RUNTIME, "const WARNING_ROW_LIMIT = 24")
    assert_includes(RUNTIME, "const shownWarnings = uniqueWarnings.slice(0, WARNING_ROW_LIMIT)")
    assert_includes(RUNTIME, 'warning && typeof warning.name === "string"')
    assert_includes(RUNTIME, 'const key = `${warning.name}\\u0000${warning.reason}`')
    assert_includes(RUNTIME, 'appendWarningGroup(container, "Code analysis", counts.index')
    assert_includes(RUNTIME, 'appendWarningGroup(container, "Integrity checks", counts.integrity')
    assert_includes(STYLES, "max-height: min(360px, calc(100vh - 180px))")
    assert_includes(STYLES, "max-height: clamp(48px, calc(54vh - 220px), 240px)")
    assert_includes(STYLES, '.warning-disclosure > summary::after { content: ""; flex: 0 0 8px; width: 8px; height: 5px;')
    assert_includes(STYLES, "clip-path: polygon(0 0, 50% 70%, 100% 0, 100% 30%, 50% 100%, 0 30%)")
    assert_includes(STYLES, "details.warning-disclosure[open] > summary::after { transform: rotate(180deg); }")
    assert_includes(STYLES, "overflow-wrap: anywhere")
    refute_includes(RUNTIME, "innerHTML")
  end

  def test_explorer_initial_and_reset_camera_use_200_percent_without_changing_drift
    assert_includes(SHELL, 'id="reset-view" aria-label="Reset to default view" aria-keyshortcuts="0" title="Reset view (0)">Reset</button>')
    assert_includes(SHELL, '<output class="zoom-level" id="zoom-level" aria-label="Zoom level">200%</output>')
    assert_includes(RUNTIME, "const DEFAULT_CAMERA = Object.freeze({ yaw: -.36, pitch: .34, zoom: 2, panX: 0, panY: 0 })")
    assert_match(/populateWarningDisclosure\(\).*?applyCameraTarget\(DEFAULT_CAMERA\).*?createExplorer\(\).*?resize\(\)/m, RUNTIME)
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
  end

  def test_explorer_drift_is_time_based_gap_capped_and_not_suppressed_by_interaction
    assert_includes(RUNTIME, "const DRIFT_RADIANS_PER_SECOND = .04125")
    assert_includes(RUNTIME, "const MAX_DRIFT_DELTA_MS = 50")
    assert_includes(RUNTIME, "function advanceExplorerDrift(timestamp)")
    assert_includes(RUNTIME, "clamp(timestamp - lastDriftTimestamp, 0, MAX_DRIFT_DELTA_MS)")
    assert_includes(RUNTIME, "const driftDelta = screenRotationYawSign(pitch) * DRIFT_RADIANS_PER_SECOND * elapsed / 1000")
    assert_includes(RUNTIME, "cameraFlight.finalTarget.yaw += driftDelta")
    assert_includes(RUNTIME, "if (cameraFlight || driftAdvanced) requestRender()")
    assert_includes(RUNTIME, "lastDriftTimestamp = null")
    assert_includes(RUNTIME, "yaw += dx * .006")

    drift = runtime_function("advanceExplorerDrift")
    %w[dragging pointers gesture selectedPoint pendingHover].each do |interaction_state|
      refute_includes(drift, interaction_state, "advanceExplorerDrift must not be gated by #{interaction_state}")
    end
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
    assert_match(/window\.addEventListener\("keydown", event => \{\s+if \(event\.defaultPrevented\) return;\s+if \(!helpOverlay\.hidden\) \{.*?\}\s+if \(!explorerRenderer\) return;\s+if \(toggleDriftWithSpace\(event\)\) return;/m, RUNTIME)
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
    assert_includes(RUNTIME, "const targetPitch = pitch >= 0 ? TOP_DOWN_PITCH : -TOP_DOWN_PITCH")
    assert_includes(RUNTIME, "pitch: targetPitch")
    assert_includes(RUNTIME, "pitch: pitch >= 0 ? TOP_DOWN_PITCH : -TOP_DOWN_PITCH")
    assert_includes(RUNTIME, "function navigateToSelection(point")
    assert_includes(RUNTIME, "flyCamera(contextualSelectionCameraTarget(point), { followDrift: true })")
    assert_includes(runtime_function("focusPoint"), "navigateToSelection(point, { button })")
    assert_includes(runtime_function("focusDependencyPackage"), "navigateToSelection(hub, { button, expandDependency: true })")
    assert_includes(runtime_function("focusDependencySystem"), "navigateToSelection(hub, { button, expandDependency: true })")
    assert_includes(RUNTIME, "else if (point) navigateToSelection(point)")
    assert_includes(runtime_function("focusCategory"), "contextualCategoryCameraTarget(category)")
  end

  def test_dependency_double_click_survives_the_first_tap_selection_flight
    assert_includes(RUNTIME, "let doubleClickTarget = null")
    assert_includes(RUNTIME, 'doubleClickTarget = { point, x: event.clientX, y: event.clientY, at: event.timeStamp }')
    assert_includes(RUNTIME, "const rememberedTapIsFresh = doubleClickTarget &&")
    assert_includes(RUNTIME, "event.timeStamp - doubleClickTarget.at <= 1000 &&")
    assert_includes(RUNTIME, "if (!rememberedTapIsFresh) doubleClickTarget = { point")
    assert_includes(RUNTIME, "const remembered = doubleClickTarget")
    assert_includes(RUNTIME, "Math.hypot(event.clientX - remembered.x, event.clientY - remembered.y) <= 12")
    assert_includes(RUNTIME, "const target = rememberedPoint || dependencyPackageAt(event.clientX, event.clientY, exact)")
  end

  def test_double_click_on_a_ruby_star_defers_to_its_selection_flight
    dblclick = RUNTIME.match(/canvas\.addEventListener\("dblclick", event => \{(?<body>.*?)^    \}\);/m)[:body]
    assert_includes(dblclick, "const exact = hitTest(event.clientX, event.clientY)")
    assert_includes(dblclick, 'if (target?.category === "dependencies") {')
    assert_match(/if \(target\) \{\s+navigateToSelection\(target\);\s+return;\s+\}/m, dblclick)
    assert_includes(dblclick, "if (exact) return;")
    assert_includes(dblclick, "zoomBetween(event.shiftKey ? zoom / 2 : zoom * 2, event.clientX, event.clientY)")
    assert_operator(dblclick.index("if (exact) return;"), :<, dblclick.index("cancelCameraFlight()"))
    assert_operator(dblclick.index("const target = rememberedPoint ||"), :<, dblclick.index("if (target?.category"))
  end

  def test_view_shortcuts_work_regardless_of_focus_with_editable_guards
    assert_includes(RUNTIME, "function handleViewShortcut(event)")
    handler = runtime_function("handleViewShortcut")
    assert_includes(handler, "if (event.metaKey || event.ctrlKey || event.altKey) return false")
    assert_includes(handler, "if (isEditableTarget(event.target)) return false")
    assert_includes(handler, 'else if (event.key === "/") focusSearch()')
    assert_includes(handler, 'else if (event.key === "?") { if (!event.repeat) toggleHelp(); }')
    assert_includes(handler, 'if (event.key === "Enter" && event.target !== canvas && event.target !== document.body) return false')
    assert_includes(RUNTIME, "else if (!handleViewShortcut(event)) moveViewWithArrow(event)")
    refute_includes(RUNTIME, 'canvas.addEventListener("keydown"')
    assert_includes(runtime_function("moveViewWithArrow"), "isPanelOrDialogTarget(event.target)")
    assert_includes(runtime_function("isPanelOrDialogTarget"), 'target.closest(".panel, .help-overlay")')
    assert_includes(runtime_function("focusSearch"), 'if (panel.classList.contains("is-collapsed")) setPanelCollapsed(false)')
    assert_includes(SHELL, 'id="zoom-out" aria-label="Zoom out" aria-keyshortcuts="-" title="Zoom out (−)"')
    assert_includes(SHELL, 'id="zoom-in" aria-label="Zoom in" aria-keyshortcuts="+" title="Zoom in (+)"')
  end

  def test_escape_exits_spatial_focus_and_returns_to_the_default_view
    exit_body = runtime_function("exitExplorationFocus")
    assert_includes(exit_body, "expandedSystemIndex !== null || expandedPackageIndex !== null || focusedCategory !== null || selectionLocked")
    assert_includes(exit_body, "clearExplorationFocus()")
    assert_includes(exit_body, "if (hadSpatialFocus) flyCamera(DEFAULT_CAMERA, { followDrift: true })")
    assert_includes(RUNTIME, 'if (event.key === "Escape") exitExplorationFocus()')
    refute_includes(runtime_function("clearExplorationFocus"), "flyCamera")
  end

  def test_shortcuts_overlay_is_a_gated_modal_dialog
    assert_includes(SHELL, '<div class="help-overlay" id="shortcuts-help" role="dialog" aria-modal="true" aria-label="Shortcuts and controls" hidden>')
    assert_includes(SHELL, 'id="help-open" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" aria-haspopup="dialog" title="Keyboard shortcuts (?)">?</button>')
    assert_includes(SHELL, '<button type="button" id="help-close" aria-label="Close shortcuts">Close</button>')
    assert_match(/if \(!helpOverlay\.hidden\) \{\s+if \(event\.key === "Escape" \|\| \(event\.key === "\?" && !event\.repeat\)\) \{ event\.preventDefault\(\); closeHelp\(\); \}\s+else if \(event\.key === "Tab"\) \{ event\.preventDefault\(\); helpClose\.focus\(\); \}\s+return;/m, RUNTIME)
    assert_includes(runtime_function("openHelp"), "helpReturnFocus = document.activeElement")
    assert_includes(runtime_function("closeHelp"), 'canvas.focus({ preventScroll: true })')
    assert_includes(RUNTIME, 'helpOverlay.addEventListener("click", event => { if (event.target === helpOverlay) closeHelp(); })')
    assert_includes(STYLES, ".help-overlay[hidden] { display: none; }")
  end

  def test_search_supports_enter_activation_and_roving_arrow_focus
    assert_includes(RUNTIME, 'if (event.key === "Enter" && event.target === searchInput)')
    assert_match(/function flushPendingSearch\(\) \{\s+if \(!searchTimer\) return;\s+window\.clearTimeout\(searchTimer\);\s+runSearch\(\);\s+\}/m, RUNTIME)
    assert_includes(RUNTIME, "if (searchMatches.length) activateSearchResult(interactivePoints[searchMatches[0]])")
    assert_includes(RUNTIME, "if (event.target === searchInput) flushPendingSearch()")
    assert_includes(RUNTIME, 'if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return')
    assert_includes(RUNTIME, "const focusables = [...searchResults.querySelectorAll(\".search-result\")]")
    assert_includes(RUNTIME, "else if (index === 0) searchInput.focus()")
  end

  def test_star_hover_and_hub_tooltips_advertise_their_interactions
    hover = runtime_function("queueHover")
    assert_includes(hover, 'canvas.classList.toggle("is-star", Boolean(point))')
    assert_includes(hover, "if (!selectionLocked && point !== selectedPoint) selectPoint(point)")
    assert_includes(STYLES, "canvas.is-star:not(.is-pan):not(.is-dragging-pan):not(:active) { cursor: pointer; }")
    assert_includes(RUNTIME, '" · Double-click or F to expand"')
    assert_includes(RUNTIME, 'motion.title = `${label} (Space)`')
  end

  def test_hint_stays_clear_of_the_expanded_panel
    assert_includes(STYLES, ".panel:not(.is-collapsed) ~ .hint { right: 380px; }")
    assert_includes(SHELL, '<div class="hint">Drag to orbit · scroll to zoom · press ? for all shortcuts</div>')
  end

  def test_expanded_dependency_system_retains_detailed_galaxy_context
    assert_includes(RUNTIME, "const contextVisibility = { selection: .75, category: .16, package: .75 }")
    renderer = runtime_function("createExplorerRenderer")
    assert_includes(renderer, "const categoryEmphasisVector = () =>")
    assert_includes(renderer, "return [contextVisibility.package, contextVisibility.package, contextVisibility.package]")
  end

  def test_explorer_exposure_does_not_change_showcase_rendering
    explorer_renderer = runtime_function("createExplorerRenderer")
    assert_includes(explorer_renderer, "uniform float u_exposure")
    assert_includes(explorer_renderer, "a_alpha * emphasis) * u_exposure")
    assert_includes(explorer_renderer, "gl.uniform1f(pointUniforms.exposure, explorerExposureForZoom(zoom))")

    refute_includes(RUNTIME.match(/function createShowcaseRenderer\(\) \{(?<body>.*?)^    \}/m)[:body], "explorerExposureForZoom")
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

  def test_frame_loops_never_recompute_dependency_layout_or_morphology
    refute_includes(runtime_function("render"), "systemMembers")
    refute_includes(runtime_function("project"), ".find(")
    %w[render renderShowcase].each do |render_name|
      render = runtime_function(render_name)
      %w[decodeMorphology decodePackageMorphology dependencyCloudOffset dependencyPosition].each do |name|
        refute_includes(render, name, "#{name} must remain outside #{render_name}")
      end
    end
  end

  def test_focused_dependency_shader_keeps_its_alpha_floors
    explorer_renderer = runtime_function("createExplorerRenderer")
    assert_includes(explorer_renderer, "focusedDependencyPoint && a_maxSize > 4.0")
    assert_includes(explorer_renderer, "max(focusedDependencyHub ? 0.34 : 0.289, a_alpha)")
  end

  def test_explorer_requires_webgl2_across_every_unavailable_path
    renderer = runtime_function("createExplorerRenderer")
    assert_includes(renderer, 'document.documentElement.dataset.explorerUnavailableReason = "webgl2-unavailable"')
    assert_includes(renderer, 'document.documentElement.dataset.explorerUnavailableReason = "webgl2-point-size-range"')
    assert_includes(RUNTIME, 'document.documentElement.dataset.explorerUnavailableReason = "webgl2-initialization-error"')

    context_loss = renderer.match(
      /liveCanvas\.addEventListener\("webglcontextlost".*?\n      \}\);/m,
    ).to_s
    assert_includes(context_loss, 'markExplorerUnavailable("webgl2-context-lost")')

    unavailable = runtime_function("markExplorerUnavailable")
    assert_includes(unavailable, 'document.documentElement.dataset.explorerRenderer = "unavailable"')
    assert_includes(unavailable, 'document.documentElement.dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations)')
    assert_includes(unavailable, 'document.documentElement.dataset.plottedScenePoints = "0"')
    assert_includes(unavailable, 'canvas.setAttribute("aria-label", "Interactive artwork unavailable because WebGL2 is required.")')
    assert_includes(unavailable, "pointers.clear()")
    assert_includes(unavailable, "if (!helpOverlay.hidden) closeHelp()")
    assert_includes(unavailable, 'document.getElementById("warning-summary").focus({ preventScroll: true })')
    disabled_controls = runtime_function("disableExplorerControls")
    assert_includes(disabled_controls, 'document.querySelectorAll("#controls input")')
    assert_includes(disabled_controls, 'document.querySelector(".toolbar").hidden = true')
    assert_includes(STYLES, "button:disabled { opacity: .45; cursor: not-allowed; }")
    assert_includes(STYLES, ".explorer-search[hidden] { display: none; }")
    assert_includes(STYLES, ".toolbar[hidden] { display: none; }")

    render = runtime_function("render")
    assert_operator(render.index("if (!explorerRenderer) return"), :<, render.index("advanceExplorerDrift(timestamp)"))
    assert_includes(runtime_function("hitTest"), "return explorerRenderer ? hitTestProjected(x, y) : null")
    assert_includes(runtime_function("dependencyPackageAt"), "if (!explorerRenderer) return null")

    assert_includes(RUNTIME, 'document.documentElement.dataset.showcaseRenderer = "unavailable"')
    assert_operator(RUNTIME.index("const dependencyRubyCounts"), :<, RUNTIME.index("model.dependencyStars = []"))
  end

  def test_unavailable_renderer_and_embedded_sampling_use_the_standard_warning_disclosure
    disclosure = runtime_function("populateWarningDisclosure")

    assert_includes(disclosure, "dependencySamplingState(")
    assert_includes(disclosure, 'document.documentElement.dataset.explorerRenderer === "unavailable"')
    assert_includes(disclosure, 'statusSummaries.push("WebGL2 required")')
    assert_includes(disclosure, 'details.open = true')
    assert_includes(disclosure, '"Interactive rendering"')
    assert_includes(disclosure, '"Unavailable"')
    assert_includes(disclosure, "sampling.summary")
    assert_includes(disclosure, "sampling.note")
    assert_includes(disclosure, 'appendWarningGroup(container, "Code analysis", counts.index')
    assert_includes(disclosure, 'appendWarningGroup(container, "Integrity checks", counts.integrity')
  end

  private

  def runtime_function(name)
    source = RUNTIME.match(/^    function #{Regexp.escape(name)}\b.*?^    \}\n/m).to_s
    raise "#{name} function not found" if source.empty?

    source
  end
end
