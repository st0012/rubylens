import { describe, expect, it } from "vitest";
import { orderedIndex, RUNTIME_SOURCE, runtimeFunction } from "./helpers/runtime_source.mjs";

describe("explorer runtime contract", () => {
  it("partial index status is an accessible bounded disclosure", () => {
    expect(RUNTIME_SOURCE).toContain("function populateWarningDisclosure()");
    expect(RUNTIME_SOURCE).toContain("const WARNING_ROW_LIMIT = 24");
    expect(RUNTIME_SOURCE).toContain("const shownWarnings = uniqueWarnings.slice(0, WARNING_ROW_LIMIT)");
    expect(RUNTIME_SOURCE).toContain('warning && typeof warning.name === "string"');
    expect(RUNTIME_SOURCE).toContain('const key = `${warning.name}\\u0000${warning.reason}`');
    expect(RUNTIME_SOURCE).toContain('appendWarningGroup(container, "Code analysis", counts.index');
    expect(RUNTIME_SOURCE).toContain('appendWarningGroup(container, "Integrity checks", counts.integrity');
    expect(RUNTIME_SOURCE).not.toContain("innerHTML");
  });

  it("explorer initial and reset camera use 200 percent without changing drift", () => {
    expect(RUNTIME_SOURCE).toContain("const DEFAULT_CAMERA = Object.freeze({ yaw: -.36, pitch: .34, zoom: 2, panX: 0, panY: 0 })");
    expect(RUNTIME_SOURCE).toMatch(/populateWarningDisclosure\(\).*?applyCameraTarget\(DEFAULT_CAMERA\).*?createExplorer\(\).*?resize\(\)/s);
    expect(RUNTIME_SOURCE).toContain("function resetView()");
    expect(RUNTIME_SOURCE).toMatch(
      /function resetView\(\).*?clearCategoryFocus\(\).*?clearExpandedPackage\(\).*?selectPoint\(null\).*?setNavigationMode\("orbit"\).*?setCategoryVisible\(category, true\).*?flyCamera\(DEFAULT_CAMERA\)/s,
    );
    expect(RUNTIME_SOURCE).toContain("finalTarget,");
    expect(RUNTIME_SOURCE).toContain("applyCameraTarget(finalTarget)");
    expect(RUNTIME_SOURCE).toContain('else if (event.key === "0") resetView()');
    expect(RUNTIME_SOURCE).toContain('document.getElementById("reset-view").addEventListener("click", resetView)');
    const resetBody = runtimeFunction("resetView");
    expect(resetBody).not.toContain("setDrifting");
    expect(resetBody).not.toContain("driftRequested");
  });

  it("explorer drift is time based gap capped and not suppressed by interaction", () => {
    expect(RUNTIME_SOURCE).toContain("const DRIFT_RADIANS_PER_SECOND = .04125");
    expect(RUNTIME_SOURCE).toContain("const MAX_DRIFT_DELTA_MS = 50");
    expect(RUNTIME_SOURCE).toContain("function advanceExplorerDrift(timestamp)");
    expect(RUNTIME_SOURCE).toContain("clamp(timestamp - lastDriftTimestamp, 0, MAX_DRIFT_DELTA_MS)");
    expect(RUNTIME_SOURCE).toContain("const driftDelta = screenRotationYawSign(pitch) * DRIFT_RADIANS_PER_SECOND * elapsed / 1000");
    expect(RUNTIME_SOURCE).toContain("cameraFlight.finalTarget.yaw += driftDelta");
    expect(RUNTIME_SOURCE).toContain("function advanceDependencySpin(timestamp)");
    expect(RUNTIME_SOURCE).toContain("dependencySpinElapsed = (dependencySpinElapsed + elapsed) % SHOWCASE_PRESET.durationMs");
    expect(RUNTIME_SOURCE).toContain("if (cameraFlight || driftAdvanced || spinAdvanced) requestRender()");
    expect(RUNTIME_SOURCE).toContain("lastDriftTimestamp = null");
    expect(RUNTIME_SOURCE).toContain("yaw += dx * .006");

    const drift = runtimeFunction("advanceExplorerDrift");
    for (const interactionState of ["dragging", "pointers", "gesture", "selectedPoint", "pendingHover"]) {
      expect(drift, `advanceExplorerDrift must not be gated by ${interactionState}`).not.toContain(interactionState);
    }
    for (const name of ["focusCategory", "focusPoint", "focusDependencyPackage", "focusDependencySystem", "navigateToSelection", "resetView"]) {
      expect(runtimeFunction(name), `${name} must preserve explicit drift state`).not.toContain("setDrifting");
    }
    expect(RUNTIME_SOURCE).not.toContain("setDrifting(false)");
    expect(runtimeFunction("setDrifting")).not.toContain("cancelCameraFlight");
  });

  it("space is the only keyboard drift toggle and respects native controls", () => {
    expect(RUNTIME_SOURCE).toContain("function toggleDriftWithSpace(event)");
    expect(RUNTIME_SOURCE).toContain('(event.key !== " " && event.code !== "Space") || event.repeat');
    expect(RUNTIME_SOURCE).toContain("event.metaKey || event.ctrlKey || event.altKey || event.shiftKey");
    expect(RUNTIME_SOURCE).toContain('target.closest("input, textarea, select, button, summary, a[href], [contenteditable], [role=\'button\']")');
    expect(RUNTIME_SOURCE).toContain("if (reducedMotionQuery.matches || isNativeSpaceTarget(event.target)) return false");
    expect(RUNTIME_SOURCE).toMatch(/function toggleDriftWithSpace\(event\).*?event\.preventDefault\(\).*?setDrifting\(!driftRequested\)/s);
    expect(RUNTIME_SOURCE).toMatch(
      /window\.addEventListener\("keydown", event => \{\s+if \(event\.defaultPrevented\) return;\s+if \(!helpOverlay\.hidden\) \{.*?\}\s+if \(!explorerRenderer\) return;\s+if \(toggleDriftWithSpace\(event\)\) return;/s,
    );
    expect(RUNTIME_SOURCE).toContain('motion.setAttribute("aria-label", label)');
    expect(RUNTIME_SOURCE).toContain('motion.setAttribute("aria-pressed", String(!drifting))');
    expect(RUNTIME_SOURCE).toContain('motion.textContent = "Drift off"');
  });

  it("every point selection reuses contextual two subject navigation", () => {
    expect(RUNTIME_SOURCE).toContain("function contextualSelectionCameraTarget(point");
    expect(RUNTIME_SOURCE).toContain("const CONTEXT_TARGET_X = .32");
    expect(RUNTIME_SOURCE).toContain("const CONTEXT_CORE_X = .68");
    expect(RUNTIME_SOURCE).toContain("Math.PI - Math.atan2(z, x)");
    expect(RUNTIME_SOURCE).toContain("const desiredSeparation = sceneRight * (CONTEXT_CORE_X - CONTEXT_TARGET_X)");
    expect(RUNTIME_SOURCE).toContain("const coreFitZoom = Math.min(sceneRight, sceneBottom) * .28");
    expect(RUNTIME_SOURCE).toContain("panX: sceneRight * .5 + actualSeparation * .5 - sceneCenterX");
    expect(RUNTIME_SOURCE).toContain("const targetPitch = pitch >= 0 ? TOP_DOWN_PITCH : -TOP_DOWN_PITCH");
    expect(RUNTIME_SOURCE).toContain("pitch: targetPitch");
    expect(RUNTIME_SOURCE).toContain("pitch: pitch >= 0 ? TOP_DOWN_PITCH : -TOP_DOWN_PITCH");
    expect(RUNTIME_SOURCE).toContain("function navigateToSelection(point");
    expect(RUNTIME_SOURCE).toContain("flyCamera(contextualSelectionCameraTarget(point), { followDrift: true })");
    expect(runtimeFunction("focusPoint")).toContain("navigateToSelection(point, { button })");
    expect(runtimeFunction("focusDependencyPackage")).toContain("navigateToSelection(hub, { button, expandDependency: true })");
    expect(runtimeFunction("focusDependencySystem")).toContain("navigateToSelection(hub, { button, expandDependency: true })");
    expect(RUNTIME_SOURCE).toContain("else if (point) navigateToSelection(point)");
    expect(runtimeFunction("focusCategory")).toContain("contextualCategoryCameraTarget(category)");
  });

  it("dependency double click survives the first tap selection flight", () => {
    expect(RUNTIME_SOURCE).toContain("let doubleClickTarget = null");
    expect(RUNTIME_SOURCE).toContain("doubleClickTarget = { point, x: event.clientX, y: event.clientY, at: event.timeStamp }");
    expect(RUNTIME_SOURCE).toContain("const rememberedTapIsFresh = doubleClickTarget &&");
    expect(RUNTIME_SOURCE).toContain("event.timeStamp - doubleClickTarget.at <= 1000 &&");
    expect(RUNTIME_SOURCE).toContain("if (!rememberedTapIsFresh) doubleClickTarget = { point");
    expect(RUNTIME_SOURCE).toContain("const remembered = doubleClickTarget");
    expect(RUNTIME_SOURCE).toContain("Math.hypot(event.clientX - remembered.x, event.clientY - remembered.y) <= 12");
    expect(RUNTIME_SOURCE).toContain("const target = rememberedPoint || dependencyPackageAt(event.clientX, event.clientY, exact)");
  });

  it("double click on a ruby star defers to its selection flight", () => {
    const dblclick = RUNTIME_SOURCE.match(/canvas\.addEventListener\("dblclick", event => \{(?<body>.*?)^    \}\);/sm).groups.body;
    expect(dblclick).toContain("const exact = hitTest(event.clientX, event.clientY)");
    expect(dblclick).toContain('if (target?.category === "dependencies") {');
    expect(dblclick).toMatch(/if \(target\) \{\s+navigateToSelection\(target\);\s+return;\s+\}/s);
    expect(dblclick).toContain("if (exact) return;");
    expect(dblclick).toContain("zoomBetween(event.shiftKey ? zoom / 2 : zoom * 2, event.clientX, event.clientY)");
    expect(orderedIndex(dblclick, "if (exact) return;")).toBeLessThan(orderedIndex(dblclick, "cancelCameraFlight()"));
    expect(orderedIndex(dblclick, "const target = rememberedPoint ||")).toBeLessThan(orderedIndex(dblclick, "if (target?.category"));
  });

  it("view shortcuts work regardless of focus with editable guards", () => {
    expect(RUNTIME_SOURCE).toContain("function handleViewShortcut(event)");
    const handler = runtimeFunction("handleViewShortcut");
    expect(handler).toContain("if (event.metaKey || event.ctrlKey || event.altKey) return false");
    expect(handler).toContain('const uiHidden = document.body.classList.contains("is-ui-hidden")');
    expect(handler).toContain("if (isEditableTarget(event.target)) return false");
    expect(handler).toContain('else if (event.key === "/") { if (uiHidden) setUiHidden(false); focusSearch(); }');
    expect(handler).toContain('else if (event.key === "?" && !uiHidden) { if (!event.repeat) toggleHelp(); }');
    expect(handler).toContain('if (event.key === "Enter" && event.target !== canvas && event.target !== document.body) return false');
    expect(RUNTIME_SOURCE).toContain("else if (!handleViewShortcut(event)) moveViewWithArrow(event)");
    expect(RUNTIME_SOURCE).not.toContain('canvas.addEventListener("keydown"');
    expect(runtimeFunction("moveViewWithArrow")).toContain("isPanelOrDialogTarget(event.target)");
    expect(runtimeFunction("isPanelOrDialogTarget")).toContain('target.closest(".panel, .help-overlay")');
    expect(runtimeFunction("focusSearch")).toContain('if (panel.classList.contains("is-collapsed")) setPanelCollapsed(false)');
  });

  it("escape exits spatial focus and returns to the default view", () => {
    const exitBody = runtimeFunction("exitExplorationFocus");
    expect(exitBody).toContain("expandedSystemIndex !== null || expandedPackageIndex !== null || focusedCategory !== null || selectionLocked");
    expect(exitBody).toContain("clearExplorationFocus()");
    expect(exitBody).toContain("if (hadSpatialFocus) flyCamera(DEFAULT_CAMERA, { followDrift: true })");
    expect(RUNTIME_SOURCE).toContain('if (event.key === "Escape") exitExplorationFocus()');
    expect(runtimeFunction("clearExplorationFocus")).not.toContain("flyCamera");
  });

  it("shortcuts overlay is a gated modal dialog", () => {
    expect(RUNTIME_SOURCE).toMatch(
      /if \(!helpOverlay\.hidden\) \{\s+if \(event\.key === "Escape" \|\| \(event\.key === "\?" && !event\.repeat\)\) \{ event\.preventDefault\(\); closeHelp\(\); \}\s+else if \(event\.key === "Tab"\) \{ event\.preventDefault\(\); helpClose\.focus\(\); \}\s+return;/s,
    );
    expect(runtimeFunction("openHelp")).toContain("helpReturnFocus = document.activeElement");
    expect(runtimeFunction("closeHelp")).toContain('canvas.focus({ preventScroll: true })');
    expect(RUNTIME_SOURCE).toContain('helpOverlay.addEventListener("click", event => { if (event.target === helpOverlay) closeHelp(); })');
  });

  it("search supports enter activation and roving arrow focus", () => {
    expect(RUNTIME_SOURCE).toContain('if (event.key === "Enter" && event.target === searchInput)');
    expect(RUNTIME_SOURCE).toMatch(/function flushPendingSearch\(\) \{\s+if \(!searchTimer\) return;\s+window\.clearTimeout\(searchTimer\);\s+runSearch\(\);\s+\}/s);
    expect(RUNTIME_SOURCE).toContain("if (searchMatches.length) activateSearchResult(interactivePoints[searchMatches[0]])");
    expect(RUNTIME_SOURCE).toContain("if (event.target === searchInput) flushPendingSearch()");
    expect(RUNTIME_SOURCE).toContain('if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return');
    expect(RUNTIME_SOURCE).toContain('const focusables = [...searchResults.querySelectorAll(".search-result")]');
    expect(RUNTIME_SOURCE).toContain("else if (index === 0) searchInput.focus()");
  });

  it("star hover and hub tooltips advertise their interactions", () => {
    const hover = runtimeFunction("queueHover");
    expect(hover).toContain('document.body.classList.contains("is-ui-hidden")');
    expect(hover).toContain('canvas.classList.toggle("is-star", Boolean(point))');
    expect(hover).toContain("if (!selectionLocked && point !== selectedPoint) selectPoint(point)");
    expect(runtimeFunction("positionTooltip")).toContain('document.body.classList.contains("is-ui-hidden")');
    expect(RUNTIME_SOURCE).toContain('" · Double-click or F to expand"');
    expect(RUNTIME_SOURCE).toContain('motion.title = `${label} (Space)`');
  });

  it("expanded dependency system retains detailed galaxy context", () => {
    expect(RUNTIME_SOURCE).toContain("const contextVisibility = { selection: .75, category: .16, package: .75 }");
    const renderer = runtimeFunction("createExplorerRenderer");
    expect(renderer).toContain("const categoryEmphasisVector = () =>");
    expect(renderer).toContain("return [contextVisibility.package, contextVisibility.package, contextVisibility.package]");
  });

  it("explorer exposure does not change showcase rendering", () => {
    const explorerRenderer = runtimeFunction("createExplorerRenderer");
    expect(explorerRenderer).toContain("uniform float u_exposure");
    expect(explorerRenderer).toContain("float categoryExposure = category == 2");
    expect(explorerRenderer).toContain("min(u_exposure, float(${explorerExposureForZoom(DEFAULT_CAMERA.zoom * ZOOM_STEP)}))");
    expect(explorerRenderer).toContain("a_alpha * emphasis) * categoryExposure");
    expect(explorerRenderer).toContain("mix(categoryExposure, 1.35, u_deepDetail)");
    expect(explorerRenderer).toContain("hazePoint || category == 2 || size <= 1.35 || !detailed");
    expect(explorerRenderer).toContain("gl.uniform1f(pointUniforms.exposure, explorerExposureForZoom(zoom))");

    const showcaseRendererBody = RUNTIME_SOURCE.match(/function createShowcaseRenderer\(\) \{(?<body>.*?)^    \}/sm).groups.body;
    expect(showcaseRendererBody).not.toContain("explorerExposureForZoom");
  });

  it("search is lazy bounded progressive and reuses navigation", () => {
    expect(RUNTIME_SOURCE).toContain("const SEARCH_DEBOUNCE_MS = 120");
    expect(RUNTIME_SOURCE).toContain("const SEARCH_RESULT_LIMIT = 24");
    expect(RUNTIME_SOURCE).toContain("const SEARCH_BATCH_SIZE = 8");
    expect(RUNTIME_SOURCE).toContain("searchIndex ||= interactivePoints.map(point => point.name.toLowerCase())");
    expect(RUNTIME_SOURCE).toContain("buckets.flat().slice(0, SEARCH_RESULT_LIMIT)");
    expect(RUNTIME_SOURCE).toContain("searchMatches.slice(0, searchVisibleCount)");
    expect(RUNTIME_SOURCE).toContain("searchVisibleCount + SEARCH_BATCH_SIZE");
    expect(RUNTIME_SOURCE).toContain("renderSearchResults(firstNewResult)");
    expect(RUNTIME_SOURCE).toContain('querySelectorAll(".search-result")[focusIndex]?.focus()');
    expect(RUNTIME_SOURCE).toContain("if (point.systemHub && !point.packageHub) focusDependencySystem(point.systemIndex)");
    expect(RUNTIME_SOURCE).toContain("else if (point.packageHub) focusDependencyPackage(point.packageIndex)");
    expect(RUNTIME_SOURCE).toContain("else focusPoint(point)");
    expect(RUNTIME_SOURCE).toContain("event.stopPropagation()");
    expect(RUNTIME_SOURCE).toContain("clearSearch({ focus: true })");
    expect(orderedIndex(RUNTIME_SOURCE, "function initializeSearch()")).toBeGreaterThan(orderedIndex(RUNTIME_SOURCE, "function ensureSearchIndex()"));
    expect(RUNTIME_SOURCE).not.toMatch(/function render\(timestamp\).*?ensureSearchIndex/s);
  });

  it("frame loops never recompute dependency layout or morphology", () => {
    expect(runtimeFunction("render")).not.toContain("systemMembers");
    expect(runtimeFunction("project")).not.toContain(".find(");
    for (const renderName of ["render", "renderShowcase"]) {
      const render = runtimeFunction(renderName);
      for (const name of ["decodeMorphology", "decodePackageMorphology", "dependencyCloudOffset", "dependencyPosition"]) {
        expect(render, `${name} must remain outside ${renderName}`).not.toContain(name);
      }
    }
  });

  it("focused dependency shader keeps its alpha floors", () => {
    const explorerRenderer = runtimeFunction("createExplorerRenderer");
    expect(explorerRenderer).toContain("focusedDependencyPoint && a_maxSize > 4.0");
    expect(explorerRenderer).toContain("max(focusedDependencyHub ? 0.34 : 0.289, a_alpha)");
    expect(explorerRenderer).toContain("(focusedDependencyPoint ? focusedAlpha : a_alpha * emphasis) * categoryExposure");
  });

  it("explorer requires webgl2 across every unavailable path", () => {
    const renderer = runtimeFunction("createExplorerRenderer");
    expect(renderer).toContain('document.documentElement.dataset.explorerUnavailableReason = "webgl2-unavailable"');
    expect(renderer).toContain('document.documentElement.dataset.explorerUnavailableReason = "webgl2-point-size-range"');
    expect(RUNTIME_SOURCE).toContain('document.documentElement.dataset.explorerUnavailableReason = "webgl2-initialization-error"');

    const contextLoss = renderer.match(/liveCanvas\.addEventListener\("webglcontextlost".*?\n      \}\);/s)[0];
    expect(contextLoss).toContain('markExplorerUnavailable("webgl2-context-lost")');

    const unavailable = runtimeFunction("markExplorerUnavailable");
    expect(unavailable).toContain('document.documentElement.dataset.explorerRenderer = "unavailable"');
    expect(unavailable).toContain("document.documentElement.dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations)");
    expect(unavailable).toContain('document.documentElement.dataset.plottedScenePoints = "0"');
    expect(unavailable).toContain('canvas.setAttribute("aria-label", "Interactive artwork unavailable because WebGL2 is required.")');
    expect(unavailable).toContain("pointers.clear()");
    expect(unavailable).toContain("if (!helpOverlay.hidden) closeHelp()");
    expect(unavailable).toContain('document.getElementById("warning-summary").focus({ preventScroll: true })');
    const disabledControls = runtimeFunction("disableExplorerControls");
    expect(disabledControls).toContain('document.querySelectorAll("#controls input")');
    expect(disabledControls).toContain('document.querySelector(".toolbar").hidden = true');

    const render = runtimeFunction("render");
    expect(orderedIndex(render, "if (!explorerRenderer) return")).toBeLessThan(orderedIndex(render, "advanceExplorerDrift(timestamp)"));
    expect(runtimeFunction("hitTest")).toContain("return explorerRenderer ? hitTestProjected(x, y) : null");
    expect(runtimeFunction("dependencyPackageAt")).toContain("if (!explorerRenderer) return null");

    expect(RUNTIME_SOURCE).toContain('document.documentElement.dataset.showcaseRenderer = "unavailable"');
    expect(orderedIndex(RUNTIME_SOURCE, "const dependencyRubyCounts")).toBeLessThan(orderedIndex(RUNTIME_SOURCE, "model.dependencyStars = []"));
  });

  it("unavailable renderer uses the standard warning disclosure", () => {
    const disclosure = runtimeFunction("populateWarningDisclosure");

    expect(disclosure).toContain('document.documentElement.dataset.explorerRenderer === "unavailable"');
    expect(disclosure).toContain('statusSummaries.push("WebGL2 required")');
    expect(disclosure).toContain("details.open = true");
    expect(disclosure).toContain('"Interactive rendering"');
    expect(disclosure).toContain('"Unavailable"');
    expect(disclosure).toContain('appendWarningGroup(container, "Code analysis", counts.index');
    expect(disclosure).toContain('appendWarningGroup(container, "Integrity checks", counts.integrity');
  });
  it("keeps panel and tooltip Ruby metric contracts", () => {
    // Restored from the retired Ruby writer assertions: the panel breakdown
    // and tooltip metrics are runtime feature contracts, not splice checks.
    expect(RUNTIME_SOURCE).toContain('const rubyMetricLabels = ["Classes", "Modules", "Methods", "Constants"]');
    expect(RUNTIME_SOURCE).toContain("function createRubyBreakdown");
    expect(RUNTIME_SOURCE).toContain("const testRubyMetricIndexes = [0, 2]");
    expect(RUNTIME_SOURCE).toContain("function addCoreTooltipMetrics");
    expect(RUNTIME_SOURCE).toContain('addTooltipMetric("Ancestors", point.values[0])');
    expect(RUNTIME_SOURCE).toContain('addTooltipMetric("Descendants", point.values[3])');
    expect(RUNTIME_SOURCE).toContain('addTooltipMetric("References", point.values[4])');
    expect(RUNTIME_SOURCE).toContain('addTooltipMetric("Instance variables", point.instanceVariableCount)');
    expect(RUNTIME_SOURCE).toContain('if (point.category === "core") addCoreTooltipMetrics(point)');
    expect(RUNTIME_SOURCE).toContain("Most methods");
    expect(RUNTIME_SOURCE).toContain("Most constants");
    expect(RUNTIME_SOURCE).toContain("Fly to a landmark");
    expect(RUNTIME_SOURCE).toContain("Expanded gem cloud");
    expect(RUNTIME_SOURCE).toContain("arrow keys to move the view");
    expect(RUNTIME_SOURCE).toContain("Shift-drag or Pan mode to move");
  });
  it("keeps camera flight mechanics under contract", () => {
    // Restored from the retired Ruby writer assertions: focus flights cancel
    // pending hover, honor reduced motion, wrap yaw by shortest angle,
    // interpolate zoom logarithmically, and complete at tight thresholds.
    expect(RUNTIME_SOURCE).toContain("function flyCamera");
    expect(RUNTIME_SOURCE).toContain("function updateCameraFlight");
    expect(RUNTIME_SOURCE).toContain("function cancelCameraFlight");
    expect(RUNTIME_SOURCE).toContain("function cancelPendingHover");
    expect(RUNTIME_SOURCE).toContain("function completeCameraFlight");
    expect(RUNTIME_SOURCE).toContain("Math.atan2(Math.sin(target.yaw - yaw), Math.cos(target.yaw - yaw))");
    expect(RUNTIME_SOURCE).toContain("Math.exp(Math.log(start.zoom)");
    expect(RUNTIME_SOURCE).toContain("angularDistance < .001 && zoomStops < .01 && panDistance < .5");
    expect(runtimeFunction("flyCamera")).toContain("reducedMotionQuery.matches");
  });

  it("keeps arrow-key pan semantics and editable guards under contract", () => {
    const moveView = runtimeFunction("moveViewWithArrow");
    expect(RUNTIME_SOURCE).toContain('target.matches("textarea, select")');
    expect(RUNTIME_SOURCE).toContain('!["checkbox", "radio", "button", "submit", "reset"].includes(target.type)');
    expect(moveView).toContain('if (event.key === "ArrowLeft") panBy(distance, 0)');
    expect(moveView).toContain('else if (event.key === "ArrowRight") panBy(-distance, 0)');
    expect(moveView).toContain('else if (event.key === "ArrowUp") panBy(0, distance)');
    expect(moveView).toContain('else if (event.key === "ArrowDown") panBy(0, -distance)');
  });
  it("keeps every remaining runtime contract from the retired writer wall", () => {
    // The full recovery of the retired Ruby report-writer assertions whose
    // subject is runtime content: interaction guards, hover fallback, tooltip
    // layout retry, shader emphasis gates, focus wiring, trivia-name
    // exclusion, schema column decoding, and navigation clamps. Generated by
    // diffing the retired wall against this suite so nothing was dropped.
    expect(RUNTIME_SOURCE).toContain("instanceVariableCount: row[13] || 0");
    expect(RUNTIME_SOURCE).toContain("if (point.kind === \"Class\") addTooltipMetric(\"Instance variables\", point.instanceVariableCount)");
    expect(RUNTIME_SOURCE).toContain("Focus ${meta.title}");
    expect(RUNTIME_SOURCE).toContain("new Set([\"Object\", \"Kernel\", \"BasicObject\"])");
    expect(RUNTIME_SOURCE).toContain("function zoomBetween");
    expect(RUNTIME_SOURCE).toContain("function focusDependencyPackage");
    expect(RUNTIME_SOURCE).toContain("function focusDependencySystem");
    expect(RUNTIME_SOURCE).toContain("cameraFlight = null");
    expect(RUNTIME_SOURCE).toContain("function render(timestamp)");
    expect(RUNTIME_SOURCE).toContain("if (reducedMotionQuery.matches)");
    expect(RUNTIME_SOURCE).toContain('if (document.body.classList.contains("is-ui-hidden") || cameraFlight || dragging || pointers.size > 0) return');
    expect(RUNTIME_SOURCE).toContain("const TOP_DOWN_PITCH = Math.PI / 2");
    expect(RUNTIME_SOURCE).toContain('if (document.body.classList.contains("is-ui-hidden") || cameraFlight || !point?.screen)');
    expect(RUNTIME_SOURCE).toContain("canvas.setAttribute(\"aria-busy\", \"true\")");
    expect(RUNTIME_SOURCE).toContain("Double-click a dependency system or gem cloud, press Enter");
    expect(RUNTIME_SOURCE).toContain("press Enter or F on its selected marker");
    expect(RUNTIME_SOURCE).toContain("const interactivePoints = []");
    expect(RUNTIME_SOURCE).toContain("if (interactive && interactiveMode) interactivePoints.push(point)");
    expect(RUNTIME_SOURCE).toContain("const RSPEC_PROXY_PREFIX = \"RSpec example group #\"");
    expect(RUNTIME_SOURCE).toContain("const interactive = interactiveMode && !name.startsWith(RSPEC_PROXY_PREFIX)");
    expect(RUNTIME_SOURCE).toContain("if (interactiveMode) Object.assign(point");
    expect(RUNTIME_SOURCE).toContain("function hoverTargetAt");
    expect(RUNTIME_SOURCE).toContain("function dependencyPackageAt(x, y, exact = hitTest(x, y))");
    expect(RUNTIME_SOURCE).toContain("return exact || dependencyPackageAt(x, y, exact)");
    expect(RUNTIME_SOURCE).toContain("bounds.width === 0 || bounds.height === 0");
    expect(RUNTIME_SOURCE).toContain("focusedDependencyPoint || selected ? 1.0 : u_categoryEmphasis[category]");
    expect(RUNTIME_SOURCE).toContain("if (selectionLocked && selectedPoint) return [contextVisibility.selection");
    expect(RUNTIME_SOURCE).toContain("[\"core\", \"tests\", \"dependencies\"].map(category => (category === focusedCategory ? 1 : contextVisibility.category))");
    expect(RUNTIME_SOURCE).toContain("bool detailed = emphasis >= 0.1");
    expect(RUNTIME_SOURCE).toContain("function moveViewWithArrow");
    expect(RUNTIME_SOURCE).toContain("pitch = clamp(pitch + dy * .004, -TOP_DOWN_PITCH, TOP_DOWN_PITCH)");
    expect(RUNTIME_SOURCE).toContain("window.addEventListener(\"keydown\", event => {");
    expect(RUNTIME_SOURCE).toContain("\"durationMs\": 60000");
    expect(RUNTIME_SOURCE).toContain("function applyShowcaseCamera(progress)");
    expect(RUNTIME_SOURCE).toContain("function renderShowcase(timestamp)");
    expect(RUNTIME_SOURCE).toContain("if (interactiveMode) {");
    expect(RUNTIME_SOURCE).toContain("if (exact) return exact.hub ? exact : null");
  });
  it("keeps the shared runtime offline", () => {
    // No URL may reach a generated artifact through the runtime: reports and
    // showcases embed it verbatim and promise fully offline rendering.
    expect(RUNTIME_SOURCE).not.toMatch(/https?:\/\//);
  });
});
