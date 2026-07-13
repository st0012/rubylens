# frozen_string_literal: true

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

  def test_home_uses_the_existing_flight_and_exact_default_camera
    assert_includes(SHELL, 'id="view" aria-label="Return to default view" aria-keyshortcuts="0">Home</button>')
    assert_includes(RUNTIME, "const DEFAULT_CAMERA = Object.freeze({ yaw: -.36, pitch: .34, zoom: 1, panX: 0, panY: 0 })")
    assert_includes(RUNTIME, "function goHome()")
    assert_match(/function goHome\(\).*?clearCategoryFocus\(\).*?clearExpandedPackage\(\).*?selectPoint\(null\).*?setNavigationMode\("orbit"\).*?setCategoryVisible\(category, true\).*?flyCamera\(DEFAULT_CAMERA\)/m, RUNTIME)
    assert_includes(RUNTIME, "finalTarget,")
    assert_includes(RUNTIME, "applyCameraTarget(finalTarget)")
    assert_includes(RUNTIME, 'else if (event.key === "0") goHome()')
    assert_includes(RUNTIME, 'document.getElementById("view").addEventListener("click", goHome)')
    home_body = RUNTIME.match(/function goHome\(\) \{(?<body>.*?)^    \}/m)[:body]
    refute_includes(home_body, "setDrifting")
  end

  def test_explorer_drift_is_time_based_faster_and_gap_capped
    assert_includes(RUNTIME, "const DRIFT_RADIANS_PER_SECOND = .04125")
    assert_includes(RUNTIME, "const MAX_DRIFT_DELTA_MS = 50")
    assert_includes(RUNTIME, "clamp(timestamp - lastDriftTimestamp, 0, MAX_DRIFT_DELTA_MS)")
    assert_includes(RUNTIME, "yaw += DRIFT_RADIANS_PER_SECOND * elapsed / 1000")
    assert_includes(RUNTIME, "lastDriftTimestamp = null")
    refute_includes(RUNTIME, "yaw += .00055")
  end

  def test_expanded_dependency_system_retains_detailed_galaxy_context
    assert_includes(RUNTIME, "const contextVisibility = { selection: .75, category: .16, package: .75 }")
    assert_includes(RUNTIME, "const detailedPoint = emphasis >= .1")
    refute_includes(RUNTIME, "expandedPackageIndex !== null ? focusedPackagePoint : emphasis >= .1")
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
    assert_includes(RUNTIME, "if (point.hub) focusDependencyPackage(point.packageIndex)")
    assert_includes(RUNTIME, "else focusPoint(point)")
    assert_includes(RUNTIME, 'event.stopPropagation()')
    assert_includes(RUNTIME, 'clearSearch({ focus: true })')
    assert_operator(RUNTIME.index("function initializeSearch()"), :>, RUNTIME.index("function ensureSearchIndex()"))
    refute_match(/function render\(timestamp\).*?ensureSearchIndex/m, RUNTIME)
  end
end
