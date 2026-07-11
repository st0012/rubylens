    "use strict";
    const model = JSON.parse(atob("{{MODEL_BASE64}}"));
    const captureMode = new URLSearchParams(window.location.search).get("capture") === "1";
    if (captureMode) document.body.classList.add("is-capture");
    let canvas = document.getElementById("cosmos");
    const forceCanvasRenderer = new URLSearchParams(window.location.search).get("renderer") === "canvas";
    const rendererSelection = window.RubyLensPointRenderer.create(canvas, { forceCanvas: forceCanvasRenderer });
    let pointRenderer = rendererSelection.renderer || null;
    let context = null;
    if (!pointRenderer) {
      context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        const replacement = canvas.cloneNode(false);
        canvas.replaceWith(replacement);
        canvas = replacement;
        context = canvas.getContext("2d", { alpha: false });
      }
    }
    const panel = document.getElementById("panel");
    const panelBody = document.getElementById("panel-body");
    const panelToggle = document.getElementById("panel-toggle");
    const tooltip = document.getElementById("tooltip");
    const tooltipCategory = document.getElementById("tooltip-category");
    const tooltipName = document.getElementById("tooltip-name");
    const tooltipContext = document.getElementById("tooltip-context");
    const tooltipMetrics = document.getElementById("tooltip-metrics");
    const fields = ["ancestorDepth", "definitionSites", "reopenings", "descendants", "references", "members"];
    const rubyMetricLabels = ["Classes", "Modules", "Methods", "Constants"];
    const signalWeights = {
      core: { ancestorDepth: .28, definitionSites: .2, reopenings: .18, descendants: .72, references: .82, members: .7 },
      tests: { ancestorDepth: .18, definitionSites: .25, reopenings: .18, descendants: .42, references: .85, members: .55 },
      dependencies: { ancestorDepth: .12, definitionSites: .35, reopenings: .2, descendants: .32, references: .48, members: .4 },
    };
    let width = 0, height = 0, dpr = 1, sceneRight = 0, sceneBottom = 0, sceneCenterX = 0, sceneCenterY = 0, yaw = -.36, pitch = .34, zoom = 1, panX = 0, panY = 0, dragging = false, gesture = null, pinchState = null, animationFrame = 0, hoverFrame = 0, pendingHover = null, selectedPoint = null, selectionLocked = false, focusedCategory = null, expandedPackageIndex = null, activeFactButton = null, navigationMode = "orbit", cameraFlight = null;
    const MIN_ZOOM = .35, MAX_ZOOM = 40, ZOOM_STEP = 1.7, DEPENDENCY_EXPANSION = 2.35, CAPTURE_POINT_LIMIT = 50_000;
    const CAPTURE_CAMERA = Object.freeze({ turns: 1, referenceWidth: 720, referenceHeight: 405, centerX: .52, centerY: .60, startYaw: -.36, pitch: .40, pitchSway: .09, zoom: 1.05, zoomBreath: .035 });
    const TOP_DOWN_PITCH = Math.PI / 2;
    const contextVisibility = { selection: .75, category: .16, package: .75 };
    const pointers = new Map();
    const visibleCategories = { core: true, tests: true, dependencies: true };
    const visibilityInputs = {};
    const focusButtons = {};
    const excludedTriviaNames = new Set(["Object", "Kernel", "BasicObject"]);
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let drifting = !captureMode && !reducedMotionQuery.matches;
    const colours = { core: [244, 82, 132], tests: [87, 204, 255], dependencies: [255, 184, 77] };

    const hash = (seed, channel = 0) => {
      let value = (seed ^ (channel * 0x9e3779b9)) >>> 0;
      value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
      value = Math.imul(value ^ value >>> 15, 0x735a2d97);
      return (value ^ value >>> 15) >>> 0;
    };
    const unit = (seed, channel) => hash(seed, channel) / 4294967296;
    const normal = (seed, channel) => Math.sqrt(-2 * Math.log(Math.max(unit(seed, channel), 1e-7))) * Math.cos(6.283185 * unit(seed, channel + 1));
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    function normalizedSignals(values) {
      return fields.map((field, index) => Math.log1p(values[index] || 0) / Math.log1p(model.domains[field] || 1));
    }

    function weightedSignal(normalized, category) {
      return fields.reduce((total, field, index) => total + signalWeights[category][field] * normalized[index], .12);
    }

    function corePosition(seed) {
      const bulge = unit(seed, 2) < .24;
      const radial = bulge ? 17 * Math.pow(unit(seed, 3), 1.75) : Math.min(42, -10 * Math.log(Math.max(1e-5, 1 - unit(seed, 3))));
      const theta = unit(seed, 4) * Math.PI * 2 + radial * .04;
      const vertical = normal(seed, 5) * (bulge ? 5.8 : 1.4 + radial * .025);
      return [Math.cos(theta) * radial, vertical, Math.sin(theta) * radial];
    }

    function testPosition(seed) {
      const radial = 17 + Math.min(45, -14 * Math.log(Math.max(1e-5, 1 - unit(seed, 7))));
      const arm = Math.floor(unit(seed, 8) * 3);
      const inArm = unit(seed, 9) < .38;
      const theta = inArm
        ? arm * (Math.PI * 2 / 3) + radial * .105 + normal(seed, 10) * .22
        : unit(seed, 10) * Math.PI * 2;
      const vertical = normal(seed, 11) * (1.4 + radial * .035);
      return [Math.cos(theta) * radial, vertical, Math.sin(theta) * radial];
    }

    const packageAnchors = model.packages.map((row, index) => {
      const seed = row[0], radius = 70 + 72 * Math.pow(unit(seed, 14), .72);
      const theta = unit(seed, 15) * Math.PI * 2;
      const vertical = normal(seed, 16) * 24;
      return [Math.cos(theta) * radius, vertical, Math.sin(theta) * radius, 1.6 + Math.min(9, Math.sqrt(row[3]) * .055), index];
    });

    function dependencyPosition(seed, packageIndex) {
      const anchor = packageAnchors[packageIndex] || [0, 0, 0, 2];
      const radius = Math.min(anchor[3], -anchor[3] * .34 * Math.log(Math.max(1e-5, 1 - unit(seed, 18))));
      const theta = unit(seed, 19) * Math.PI * 2;
      const lift = normal(seed, 20) * anchor[3] * .17;
      const tilt = (unit(model.packages[packageIndex]?.[0] || seed, 21) - .5) * .75;
      return [
        anchor[0] + Math.cos(theta) * radius,
        anchor[1] + lift + Math.sin(theta) * radius * tilt,
        anchor[2] + Math.sin(theta) * radius * Math.cos(tilt),
      ];
    }

    function buildPoints() {
      const points = [];
      const interactivePoints = [];
      const dependencyHubs = [];
      const addPoint = (point, interactive = true) => {
        points.push(point);
        if (interactive && !captureMode) interactivePoints.push(point);
        if (point.hub) dependencyHubs.push(point);
      };
      model.namespaces.forEach((row, index) => {
        const category = row[3] === 1 ? "tests" : "core";
        const values = row.slice(4, 10);
        const rubyCounts = row.slice(10, 14);
        const point = { category, seed: row[0], position: category === "tests" ? testPosition(row[0]) : corePosition(row[0]), signal: weightedSignal(normalizedSignals(values), category), base: category === "core" ? .82 : .68 };
        if (!captureMode) Object.assign(point, { name: model.namespaceNames[index], kind: row[2] === 0 ? "Class" : "Module", rubyCounts, instanceVariableCount: row[14] || 0, values });
        addPoint(point);
      });
      model.dependencyStars.forEach(row => {
        const values = row.slice(2, 8);
        addPoint({ category: "dependencies", packageIndex: row[1], seed: row[0], position: dependencyPosition(row[0], row[1]), signal: weightedSignal(normalizedSignals(values), "dependencies"), base: .45 }, false);
      });
      packageAnchors.forEach((anchor, index) => {
        const packageRow = model.packages[index];
        const rubyCounts = packageRow.slice(4, 8);
        const visualValues = [0, packageRow[3], 0, 0, 0, 0];
        const point = { category: "dependencies", packageIndex: index, seed: packageRow[0], position: anchor.slice(0, 3), signal: weightedSignal(normalizedSignals(visualValues), "dependencies"), base: 1.8, hub: true };
        if (!captureMode) Object.assign(point, { name: model.packageNames[index], packageRole: packageRow[1] === 0 ? "Direct dependency" : "Transitive dependency", packageLocation: packageRow[2] === 0 ? "Workspace package" : "External gem", rubyCounts });
        addPoint(point);
      });
      return { points, interactivePoints, dependencyHubs };
    }
    const { points, interactivePoints, dependencyHubs } = buildPoints();
    function capturePointSample() {
      if (!captureMode || points.length <= CAPTURE_POINT_LIMIT) return points;
      const hubs = points.filter(point => point.hub);
      const available = Math.max(0, CAPTURE_POINT_LIMIT - hubs.length);
      const candidates = points.filter(point => !point.hub).map(point => [hash(point.seed, 73), point.seed, point]);
      candidates.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      return candidates.slice(0, available).map(candidate => candidate[2]).concat(hubs);
    }
    const renderPoints = capturePointSample();
    if (pointRenderer) pointRenderer.sync(renderPoints);
    const rendererMetrics = { cpuProjectedPoints: 0, cpuProjectionMilliseconds: 0, frameMilliseconds: 0 };
    const totals = model.totals;
    const renderedDependencyStars = model.totals.renderedDependencyStars;
    const directGemCount = model.packages.filter(row => row[1] === 0).length;
    const transitiveGemCount = totals.packages - directGemCount;
    const allRubyMetricIndexes = [0, 1, 2, 3];
    const testRubyMetricIndexes = [0, 2];
    const dependencyRubyCounts = model.packages.reduce(
      (counts, row) => counts.map((count, index) => count + Number(row[index + 4] || 0)),
      [0, 0, 0, 0],
    );
    const categoryMeta = {
      core: { title: "Core code", rubyCounts: model.categoryStats.core, metricIndexes: allRubyMetricIndexes, focusZoom: 2.8 },
      tests: { title: "Tests", rubyCounts: model.categoryStats.tests, metricIndexes: testRubyMetricIndexes, focusZoom: 1.35 },
      dependencies: { title: "Gems", summary: `${totals.packages.toLocaleString()} dependency gems`, rubyCounts: dependencyRubyCounts, metricIndexes: allRubyMetricIndexes, note: `${directGemCount.toLocaleString()} direct · ${transitiveGemCount.toLocaleString()} transitive`, focusZoom: .72 },
    };
    if (captureMode) {
      model.namespaceNames = [];
      model.namespaces = [];
      model.packageNames = [];
      model.packages = [];
      model.dependencyStars = [];
    }

    function applyCameraTarget(target) {
      yaw = target.yaw;
      pitch = target.pitch;
      zoom = clamp(target.zoom, MIN_ZOOM, MAX_ZOOM);
      panX = target.panX;
      panY = target.panY;
    }

    function cameraTargetForPoint(point, targetZoom = point.hub ? 4 : point.category === "dependencies" ? 5 : 7) {
      const [x, y, z] = point.position;
      return {
        yaw: Math.atan2(x, z),
        pitch: clamp(Math.atan2(y, Math.hypot(x, z)), -.95, .95),
        zoom: targetZoom,
        panX: 0,
        panY: 0,
      };
    }

    function topDownCameraTargetForPoint(point, targetZoom = point.hub ? 4 : point.category === "dependencies" ? 5 : 7) {
      const targetYaw = yaw;
      const [x, y, z] = point.position;
      const cy = Math.cos(targetYaw), sy = Math.sin(targetYaw);
      const cp = Math.cos(TOP_DOWN_PITCH), sp = Math.sin(TOP_DOWN_PITCH);
      const x1 = x * cy - z * sy;
      const z1 = x * sy + z * cy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const perspective = 440 / (270 - z2) * targetZoom;
      return {
        yaw: targetYaw,
        pitch: TOP_DOWN_PITCH,
        zoom: targetZoom,
        panX: -x1 * perspective,
        panY: -y2 * perspective,
      };
    }

    function cancelCameraFlight() {
      if (!cameraFlight) return false;
      cameraFlight = null;
      canvas.removeAttribute("aria-busy");
      requestRender();
      return true;
    }

    function completeCameraFlight() {
      if (!cameraFlight) return false;
      const target = cameraFlight.target;
      cameraFlight = null;
      applyCameraTarget(target);
      canvas.removeAttribute("aria-busy");
      requestRender();
      return true;
    }

    function smootherstep(progress) {
      return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
    }

    function flyCamera(target) {
      cancelCameraFlight();
      cancelPendingHover();
      const yawDelta = Math.atan2(Math.sin(target.yaw - yaw), Math.cos(target.yaw - yaw));
      const resolvedTarget = { ...target, yaw: yaw + yawDelta };
      tooltip.hidden = true;
      if (reducedMotionQuery.matches) {
        applyCameraTarget(resolvedTarget);
        canvas.removeAttribute("aria-busy");
        requestRender();
        return;
      }

      const angularDistance = Math.hypot(yawDelta, resolvedTarget.pitch - pitch);
      const zoomStops = Math.abs(Math.log2(resolvedTarget.zoom / zoom));
      const panDistance = Math.hypot(resolvedTarget.panX - panX, resolvedTarget.panY - panY);
      if (angularDistance < .001 && zoomStops < .01 && panDistance < .5) {
        applyCameraTarget(resolvedTarget);
        canvas.removeAttribute("aria-busy");
        requestRender();
        return;
      }
      const minimumZoom = Math.min(zoom, resolvedTarget.zoom);
      const cruiseZoom = Math.min(2.5, minimumZoom);
      cameraFlight = {
        start: { yaw, pitch, zoom, panX, panY },
        target: resolvedTarget,
        startTime: null,
        duration: clamp(440 + angularDistance * 60 + zoomStops * 20, 440, 540),
        pullback: angularDistance > .35 && minimumZoom > cruiseZoom
          ? Math.log(minimumZoom / cruiseZoom) * .72
          : 0,
      };
      canvas.setAttribute("aria-busy", "true");
      requestRender();
    }

    function updateCameraFlight(timestamp) {
      if (!cameraFlight) return;
      if (cameraFlight.startTime === null) cameraFlight.startTime = timestamp;
      const progress = clamp((timestamp - cameraFlight.startTime) / cameraFlight.duration, 0, 1);
      const eased = smootherstep(progress);
      const { start, target } = cameraFlight;
      yaw = start.yaw + (target.yaw - start.yaw) * eased;
      pitch = start.pitch + (target.pitch - start.pitch) * eased;
      panX = start.panX + (target.panX - start.panX) * eased;
      panY = start.panY + (target.panY - start.panY) * eased;
      const pullback = Math.sin(Math.PI * progress) ** 2 * cameraFlight.pullback;
      zoom = Math.exp(Math.log(start.zoom) + (Math.log(target.zoom) - Math.log(start.zoom)) * eased - pullback);
      if (progress >= 1) {
        cameraFlight = null;
        applyCameraTarget(target);
        canvas.removeAttribute("aria-busy");
      }
    }

    function addTooltipMetric(label, value) {
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = Number(value).toLocaleString();
      tooltipMetrics.append(term, detail);
    }

    function addRubyMetrics(rubyCounts, metricIndexes) {
      metricIndexes.forEach(index => addTooltipMetric(rubyMetricLabels[index], rubyCounts[index] || 0));
    }

    function addCoreTooltipMetrics(point) {
      addTooltipMetric("Ancestors", point.values[0]);
      addTooltipMetric("Descendants", point.values[3]);
      if (point.kind === "Class") addTooltipMetric("Instance variables", point.instanceVariableCount);
      addTooltipMetric("Methods", point.rubyCounts[2]);
      addTooltipMetric("References", point.values[4]);
    }

    function updateTooltipContent(point) {
      tooltipMetrics.textContent = "";
      tooltipCategory.textContent = point.hub ? "Gem" : point.category === "tests" ? "Tests" : "Core code";
      tooltipName.textContent = point.name || "Unnamed Ruby item";
      if (point.hub) {
        const expanded = expandedPackageIndex === point.packageIndex ? " · Expanded gem cloud · Escape to exit" : "";
        tooltipContext.textContent = `${point.packageRole} · ${point.packageLocation}${expanded}`;
        addRubyMetrics(point.rubyCounts, allRubyMetricIndexes);
        return;
      }
      tooltipContext.textContent = point.kind;
      if (point.category === "core") addCoreTooltipMetrics(point);
      else addRubyMetrics(point.rubyCounts, testRubyMetricIndexes);
    }

    function positionTooltip(point) {
      if (cameraFlight || !point?.screen) { tooltip.hidden = true; return; }
      tooltip.hidden = false;
      const bounds = tooltip.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        requestAnimationFrame(() => { if (selectedPoint === point) positionTooltip(point); });
        return;
      }
      const preferredX = point.screen[0] + 16;
      const leftOfPoint = point.screen[0] - bounds.width - 16;
      const fitsRight = preferredX + bounds.width <= sceneRight - 12;
      const fitsLeft = leftOfPoint >= 12;
      if (fitsRight || fitsLeft) {
        tooltip.style.left = `${fitsRight ? preferredX : leftOfPoint}px`;
        tooltip.style.top = `${clamp(point.screen[1] - bounds.height / 2, 12, sceneBottom - bounds.height - 12)}px`;
      } else {
        tooltip.style.left = `${clamp((sceneRight - bounds.width) / 2, 12, sceneRight - bounds.width - 12)}px`;
        const below = point.screen[1] + 20;
        tooltip.style.top = `${below + bounds.height <= sceneBottom - 12 ? below : Math.max(12, point.screen[1] - bounds.height - 20)}px`;
      }
    }

    function selectPoint(point, locked = false) {
      if (locked && selectionLocked && selectedPoint === point) point = null;
      selectedPoint = point;
      selectionLocked = Boolean(point) && locked;
      if (point) updateTooltipContent(point);
      else tooltip.hidden = true;
      requestRender();
    }

    function hitTest(x, y) {
      let nearest = null;
      let nearestDistance = Infinity;
      for (const point of interactivePoints) {
        if (!point.screen) continue;
        if (focusedCategory && point.category !== focusedCategory) continue;
        if (expandedPackageIndex !== null && (point.category !== "dependencies" || point.packageIndex !== expandedPackageIndex)) continue;
        const dx = point.screen[0] - x;
        const dy = point.screen[1] - y;
        const distance = Math.hypot(dx, dy);
        const radius = Math.max(8, point.screen[2] + 4);
        if (distance <= radius && distance < nearestDistance) {
          nearest = point;
          nearestDistance = distance;
        }
      }
      return nearest;
    }

    function dependencyPackageAt(x, y, exact = hitTest(x, y)) {
      if (exact) return exact.hub ? exact : null;

      let nearestHub = null;
      let nearestRatio = Infinity;
      for (const point of dependencyHubs) {
        if (!point.screen || !point.cloudScreenRadius) continue;
        if (expandedPackageIndex !== null && point.packageIndex !== expandedPackageIndex) continue;
        const distance = Math.hypot(point.screen[0] - x, point.screen[1] - y);
        const ratio = distance / point.cloudScreenRadius;
        if (ratio <= 1 && ratio < nearestRatio) {
          nearestHub = point;
          nearestRatio = ratio;
        }
      }
      return nearestHub;
    }

    function hoverTargetAt(x, y) {
      const exact = hitTest(x, y);
      return exact || dependencyPackageAt(x, y, exact);
    }

    function queueHover(x, y) {
      if (cameraFlight || selectionLocked || dragging || pointers.size > 0) return;
      pendingHover = [x, y];
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (!pendingHover) return;
        const point = hoverTargetAt(pendingHover[0], pendingHover[1]);
        pendingHover = null;
        if (point !== selectedPoint) selectPoint(point);
      });
    }

    function cancelPendingHover() {
      pendingHover = null;
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
    }

    function setPanelCollapsed(collapsed) {
      if (collapsed && panelBody.contains(document.activeElement)) panelToggle.focus();
      panel.classList.toggle("is-collapsed", collapsed);
      panelBody.hidden = collapsed;
      panelToggle.setAttribute("aria-expanded", String(!collapsed));
      panelToggle.textContent = collapsed ? "Show" : "Hide";
      updateSceneViewport();
      requestRender();
    }

    function maxPoint(candidates, valueFor) {
      let best = null;
      let bestValue = -Infinity;
      for (const point of candidates) {
        const value = Number(valueFor(point)) || 0;
        if (value > bestValue || (value === bestValue && point.name.localeCompare(best?.name || "") < 0)) {
          best = point;
          bestValue = value;
        }
      }
      return best ? { point: best, value: bestValue } : null;
    }

    function factsFor(category) {
      if (category === "dependencies") {
        const gemMetricFact = (title, index) => {
          const result = maxPoint(dependencyHubs, point => point.rubyCounts[index]);
          return result && result.value > 0 && { title, ...result };
        };
        return [
          gemMetricFact("Most classes", 0),
          gemMetricFact("Most modules", 1),
          gemMetricFact("Most methods", 2),
          gemMetricFact("Most constants", 3),
        ].filter(Boolean);
      }
      const namespacePoints = interactivePoints.filter(point => point.category === category && !point.hub && !excludedTriviaNames.has(point.name));
      const metricFact = (title, index) => {
        const result = maxPoint(namespacePoints, point => point.rubyCounts[index]);
        return result && result.value > 0 && { title, ...result };
      };
      return category === "tests"
        ? [metricFact("Most methods", 2)].filter(Boolean)
        : [metricFact("Most methods", 2), metricFact("Most constants", 3)].filter(Boolean);
    }

    function createRubyBreakdown(title, rubyCounts, metricIndexes) {
      const breakdown = document.createElement("dl");
      breakdown.className = "ruby-breakdown";
      breakdown.setAttribute("aria-label", `${title} breakdown`);
      for (const index of metricIndexes) {
        const metric = document.createElement("div");
        const term = document.createElement("dt");
        const detail = document.createElement("dd");
        term.textContent = rubyMetricLabels[index];
        detail.textContent = Number(rubyCounts[index] || 0).toLocaleString();
        metric.append(term, detail);
        breakdown.append(metric);
      }
      return breakdown;
    }

    function clearActiveFact() {
      if (activeFactButton) activeFactButton.setAttribute("aria-pressed", "false");
      activeFactButton = null;
    }

    function clearCategoryFocus() {
      if (focusedCategory && focusButtons[focusedCategory]) {
        focusButtons[focusedCategory].setAttribute("aria-pressed", "false");
        focusButtons[focusedCategory].textContent = "Focus";
      }
      focusedCategory = null;
    }

    function clearExpandedPackage() {
      expandedPackageIndex = null;
    }

    function clearExplorationFocus() {
      cancelCameraFlight();
      clearActiveFact();
      clearCategoryFocus();
      clearExpandedPackage();
      selectPoint(null);
    }

    function setCategoryVisible(category, visible) {
      visibleCategories[category] = visible;
      if (visibilityInputs[category]) visibilityInputs[category].checked = visible;
      if (!visible && (selectedPoint?.category === category || focusedCategory === category)) clearExplorationFocus();
      requestRender();
    }

    function focusCategory(category) {
      if (focusedCategory === category) {
        clearExplorationFocus();
        return;
      }
      setCategoryVisible(category, true);
      clearActiveFact();
      clearExpandedPackage();
      selectPoint(null);
      clearCategoryFocus();
      focusedCategory = category;
      focusButtons[category].setAttribute("aria-pressed", "true");
      focusButtons[category].textContent = "Focused";
      setDrifting(false);
      flyCamera({ yaw: -.36, pitch: .34, zoom: categoryMeta[category].focusZoom, panX: 0, panY: 0 });
    }

    function focusPoint(point, button) {
      if (activeFactButton === button) {
        clearExplorationFocus();
        return;
      }
      if (point.hub) {
        focusDependencyPackage(point.packageIndex, button);
        return;
      }
      setCategoryVisible(point.category, true);
      clearActiveFact();
      clearExpandedPackage();
      activeFactButton = button;
      activeFactButton.setAttribute("aria-pressed", "true");
      clearCategoryFocus();
      setDrifting(false);
      selectedPoint = null;
      selectionLocked = false;
      selectPoint(point, true);
      flyCamera(topDownCameraTargetForPoint(point));
    }

    function focusDependencyPackage(packageIndex, button = null) {
      const hub = dependencyHubs.find(point => point.packageIndex === packageIndex);
      if (!hub) return false;

      setCategoryVisible("dependencies", true);
      clearActiveFact();
      if (button) {
        activeFactButton = button;
        activeFactButton.setAttribute("aria-pressed", "true");
      }
      clearCategoryFocus();
      expandedPackageIndex = packageIndex;
      setDrifting(false);
      selectedPoint = null;
      selectionLocked = false;
      selectPoint(hub, true);
      flyCamera(button ? topDownCameraTargetForPoint(hub, 4) : cameraTargetForPoint(hub, 4));
      return true;
    }

    function createExplorer() {
      const container = document.getElementById("controls");
      container.textContent = "";
      for (const category of ["core", "tests", "dependencies"]) {
        const meta = categoryMeta[category];
        const details = document.createElement("details");
        details.open = category === "core";
        const summary = document.createElement("summary");
        const swatch = document.createElement("span");
        swatch.className = `swatch ${category}`;
        const heading = document.createElement("span");
        heading.className = "section-heading";
        const title = document.createElement("strong");
        title.textContent = meta.title;
        heading.append(title);
        if (meta.summary) {
          const summaryText = document.createElement("small");
          summaryText.textContent = meta.summary;
          heading.append(summaryText);
        }
        summary.append(swatch, heading);

        const body = document.createElement("div");
        body.className = "section-body";
        const actions = document.createElement("div");
        actions.className = "section-actions";
        const visibility = document.createElement("label");
        visibility.className = "visibility";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.setAttribute("aria-label", `Show ${meta.title}`);
        checkbox.addEventListener("change", () => setCategoryVisible(category, checkbox.checked));
        visibilityInputs[category] = checkbox;
        const visibilityText = document.createElement("span");
        visibilityText.textContent = "Visible";
        visibility.append(checkbox, visibilityText);
        const focus = document.createElement("button");
        focus.type = "button";
        focus.textContent = "Focus";
        focus.setAttribute("aria-label", `Focus ${meta.title}`);
        focus.setAttribute("aria-pressed", "false");
        focusButtons[category] = focus;
        focus.addEventListener("click", () => focusCategory(category));
        actions.append(visibility, focus);

        const categoryFacts = factsFor(category);
        const facts = document.createElement("div");
        facts.className = "facts";
        for (const fact of categoryFacts) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "fact";
          button.title = fact.point.name;
          button.setAttribute("aria-pressed", "false");
          const factTitle = document.createElement("span");
          factTitle.className = "fact-title";
          const factTitleText = document.createElement("span");
          factTitleText.textContent = fact.title;
          const factScope = document.createElement("span");
          factScope.className = "fact-scope";
          factScope.textContent = fact.point.hub ? "Gem" : fact.point.kind;
          factTitle.append(factTitleText, factScope);
          const factName = document.createElement("span");
          factName.className = "fact-name";
          factName.textContent = fact.point.name;
          const factValue = document.createElement("span");
          factValue.className = "fact-value";
          factValue.textContent = fact.value.toLocaleString();
          button.append(factTitle, factName, factValue);
          button.addEventListener("click", () => focusPoint(fact.point, button));
          facts.append(button);
        }
        body.append(actions, createRubyBreakdown(meta.title, meta.rubyCounts, meta.metricIndexes));
        if (meta.note) {
          const sectionNote = document.createElement("p");
          sectionNote.className = "section-note";
          sectionNote.textContent = meta.note;
          body.append(sectionNote);
        }
        if (categoryFacts.length) {
          const factLabel = document.createElement("p");
          factLabel.className = "fact-label";
          factLabel.textContent = "Ruby code highlights";
          body.append(factLabel, facts);
        }
        details.append(summary, body);
        container.append(details);
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      if (pointRenderer) pointRenderer.resize(width, height, dpr);
      else context.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateSceneViewport();
      requestRender();
    }

    function updateSceneViewport() {
      if (captureMode) {
        sceneRight = width;
        sceneBottom = height;
        sceneCenterX = width * CAPTURE_CAMERA.centerX;
        sceneCenterY = height * CAPTURE_CAMERA.centerY;
        return;
      }
      const panelBounds = panel.getBoundingClientRect();
      sceneRight = width > 760 && !panel.classList.contains("is-collapsed") ? panelBounds.left - 14 : width;
      sceneBottom = width <= 760 && !panel.classList.contains("is-collapsed") ? panelBounds.top - 12 : height;
      sceneRight = Math.max(280, sceneRight);
      sceneBottom = Math.max(320, sceneBottom);
      sceneCenterX = sceneRight * .5;
      sceneCenterY = sceneBottom * .53;
    }

    function zoomBetween(nextZoom, fromX, fromY, toX = fromX, toY = fromY) {
      const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const scale = clampedZoom / zoom;
      panX = toX - sceneCenterX - (fromX - sceneCenterX - panX) * scale;
      panY = toY - sceneCenterY - (fromY - sceneCenterY - panY) * scale;
      zoom = clampedZoom;
    }

    function panBy(dx, dy) {
      panX += dx;
      panY += dy;
    }

    function isEditableTarget(target) {
      if (!(target instanceof Element)) return false;
      if (target.isContentEditable || target.matches("textarea, select")) return true;
      return target.matches("input") && !["checkbox", "radio", "button", "submit", "reset"].includes(target.type);
    }

    function moveViewWithArrow(event) {
      if (!event.key.startsWith("Arrow") || pointers.size > 0) return false;
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return false;
      cancelCameraFlight();
      const distance = event.shiftKey ? 96 : 32;
      if (event.key === "ArrowLeft") panBy(distance, 0);
      else if (event.key === "ArrowRight") panBy(-distance, 0);
      else if (event.key === "ArrowUp") panBy(0, distance);
      else if (event.key === "ArrowDown") panBy(0, -distance);
      else return false;
      event.preventDefault();
      requestRender();
      return true;
    }

    function resetCamera() {
      yaw = -.36;
      pitch = .34;
      zoom = 1;
      panX = 0;
      panY = 0;
    }

    function setNavigationMode(mode) {
      navigationMode = mode;
      const panMode = document.getElementById("pan-mode");
      const panning = navigationMode === "pan";
      panMode.setAttribute("aria-pressed", String(panning));
      canvas.classList.toggle("is-pan", panning);
    }

    function project(point, matrix) {
      const position = point.position;
      const anchor = expandedPackageIndex !== null && point.packageIndex === expandedPackageIndex
        ? packageAnchors[expandedPackageIndex]
        : null;
      const positionX = anchor ? anchor[0] + (position[0] - anchor[0]) * DEPENDENCY_EXPANSION : position[0];
      const positionY = anchor ? anchor[1] + (position[1] - anchor[1]) * DEPENDENCY_EXPANSION : position[1];
      const positionZ = anchor ? anchor[2] + (position[2] - anchor[2]) * DEPENDENCY_EXPANSION : position[2];
      const [cy, sy, cp, sp] = matrix;
      const x1 = positionX * cy - positionZ * sy;
      const z1 = positionX * sy + positionZ * cy;
      const y2 = positionY * cp - z1 * sp;
      const z2 = positionY * sp + z1 * cp;
      const depth = 270 - z2;
      if (depth <= 35) return null;
      const perspective = 440 / depth * zoom;
      return [sceneCenterX + panX + x1 * perspective, sceneCenterY + panY + y2 * perspective, perspective];
    }

    function updateInteractionProjection(matrix) {
      const started = performance.now();
      const candidates = new Set([...interactivePoints, ...dependencyHubs]);
      if (selectedPoint) candidates.add(selectedPoint);
      let projectedCount = 0;
      for (const point of candidates) {
        point.screen = null;
        if (point.hub) point.cloudScreenRadius = null;
        if (!visibleCategories[point.category]) continue;
        projectedCount += 1;
        const projected = project(point, matrix);
        if (!projected) continue;
        const [x, y, perspective] = projected;
        if (x < -20 || x > sceneRight + 20 || y < -20 || y > sceneBottom + 20) continue;
        const size = clamp(point.base * (.62 + point.signal * .46) * perspective, .35, point.hub ? 5.2 : 3.2);
        point.screen = [x, y, size];
        if (point.hub) {
          const expansion = expandedPackageIndex === point.packageIndex ? DEPENDENCY_EXPANSION : 1;
          point.cloudScreenRadius = Math.max(12, packageAnchors[point.packageIndex][3] * perspective * expansion * 1.2);
        }
      }
      rendererMetrics.cpuProjectedPoints = projectedCount;
      rendererMetrics.cpuProjectionMilliseconds = performance.now() - started;
    }

    function render(timestamp) {
      const frameStarted = performance.now();
      animationFrame = 0;
      updateCameraFlight(timestamp);
      document.getElementById("zoom-level").value = `${Math.round(zoom * 100)}%`;
      const matrix = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      if (pointRenderer) {
        pointRenderer.draw({ matrix, width, height, panX, panY, sceneCenterX, sceneCenterY, zoom, visibleCategories, focusedCategory, expandedPackageIndex, expandedAnchor: expandedPackageIndex === null ? null : packageAnchors[expandedPackageIndex], selectedPoint, selectionLocked });
        updateInteractionProjection(matrix);
        if (selectedPoint) {
          if (cameraFlight) tooltip.hidden = true;
          else positionTooltip(selectedPoint);
        }
        rendererMetrics.frameMilliseconds = performance.now() - frameStarted;
        if (cameraFlight) requestRender();
        else if (drifting && !dragging && !selectedPoint) { yaw += .00055; requestRender(); }
        return;
      }
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "#03040a";
      context.fillRect(0, 0, width, height);
      const vignette = context.createRadialGradient(sceneCenterX + panX, sceneCenterY + panY, 0, sceneCenterX + panX, sceneCenterY + panY, Math.max(width, height) * .72);
      vignette.addColorStop(0, "rgba(30,16,45,.18)"); vignette.addColorStop(1, "rgba(0,0,0,.6)");
      context.fillStyle = vignette; context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const deepDetail = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
      for (const point of renderPoints) {
        point.screen = null;
        if (point.hub) point.cloudScreenRadius = null;
        if (!visibleCategories[point.category]) continue;
        const projected = project(point, matrix);
        if (!projected) continue;
        const [x, y, perspective] = projected;
        const cullMargin = point === selectedPoint ? 0 : 20;
        if (x < -cullMargin || x > sceneRight + cullMargin || y < -cullMargin || y > sceneBottom + cullMargin) continue;
        const signal = point.signal;
        const size = clamp(point.base * (.62 + signal * .46) * perspective, .35, point.hub ? 5.2 : 3.2);
        const alpha = clamp(.14 + signal * .105, .12, point.hub ? .86 : .7);
        const focusedPackagePoint = expandedPackageIndex !== null && point.category === "dependencies" && point.packageIndex === expandedPackageIndex;
        const emphasis = expandedPackageIndex !== null
          ? (focusedPackagePoint ? 1 : contextVisibility.package)
          : selectionLocked && selectedPoint ? (point === selectedPoint ? 1 : contextVisibility.selection) : focusedCategory && point.category !== focusedCategory ? contextVisibility.category : 1;
        const visibleAlpha = focusedPackagePoint ? Math.max(.34, alpha) : alpha * emphasis;
        const colour = colours[point.category];
        point.screen = [x, y, size];
        if (point.hub) {
          const expansion = expandedPackageIndex === point.packageIndex ? DEPENDENCY_EXPANSION : 1;
          point.cloudScreenRadius = Math.max(12, packageAnchors[point.packageIndex][3] * perspective * expansion * 1.2);
        }
        const detailedPoint = expandedPackageIndex !== null ? focusedPackagePoint : emphasis >= .1;
        if (size > 1.35 && detailedPoint) {
          const glowScale = focusedPackagePoint ? 2.2 - deepDetail * .8 : 3.4 - deepDetail * 1.3;
          context.beginPath(); context.arc(x, y, size * glowScale, 0, Math.PI * 2);
          context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${visibleAlpha * (focusedPackagePoint ? .045 : .055)})`; context.fill();
        }
        context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${visibleAlpha})`;
        if (!detailedPoint || size < .85) context.fillRect(x, y, 1, 1);
        else { context.beginPath(); context.arc(x, y, size, 0, Math.PI * 2); context.fill(); }
        if (size > 1.1 && detailedPoint) {
          context.beginPath(); context.arc(x, y, Math.max(.45 + deepDetail * .25, size * (.24 + deepDetail * .06)), 0, Math.PI * 2);
          context.fillStyle = `rgba(255,248,244,${Math.min(.9, visibleAlpha * 1.25)})`; context.fill();
        }
        if (point === selectedPoint) {
          context.beginPath(); context.arc(x, y, Math.max(7, size * 2.5), 0, Math.PI * 2);
          context.strokeStyle = "rgba(255,255,255,.95)"; context.lineWidth = 1.2; context.stroke();
          context.beginPath(); context.arc(x, y, Math.max(12, size * 4), 0, Math.PI * 2);
          context.strokeStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},.5)`; context.lineWidth = 1; context.stroke();
        }
      }
      context.globalCompositeOperation = "source-over";
      rendererMetrics.cpuProjectedPoints = renderPoints.length;
      rendererMetrics.frameMilliseconds = performance.now() - frameStarted;
      if (selectedPoint) {
        if (cameraFlight) tooltip.hidden = true;
        else positionTooltip(selectedPoint);
      }
      if (cameraFlight) requestRender();
      else if (drifting && !dragging && !selectedPoint) { yaw += .00055; requestRender(); }
    }

    function requestRender() {
      if (!animationFrame) animationFrame = requestAnimationFrame(render);
    }

    function renderCaptureFrame(index, total) {
      if (!captureMode) throw new Error("RubyLens capture mode is not active");
      if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1) throw new Error("Invalid capture frame");
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      cameraFlight = null;
      cancelPendingHover();
      selectedPoint = null;
      selectionLocked = false;
      focusedCategory = null;
      expandedPackageIndex = null;
      tooltip.hidden = true;
      Object.keys(visibleCategories).forEach(category => { visibleCategories[category] = true; });
      const progress = ((index % total) + total) % total / total;
      const phase = progress * Math.PI * 2 * CAPTURE_CAMERA.turns;
      const viewportScale = Math.min(width / CAPTURE_CAMERA.referenceWidth, height / CAPTURE_CAMERA.referenceHeight);
      yaw = CAPTURE_CAMERA.startYaw + phase;
      pitch = CAPTURE_CAMERA.pitch + Math.sin(phase) * CAPTURE_CAMERA.pitchSway;
      zoom = (CAPTURE_CAMERA.zoom + (1 - Math.cos(phase)) * CAPTURE_CAMERA.zoomBreath) * viewportScale;
      panX = 0;
      panY = 0;
      render(performance.now());
      return { index, total, yaw, pitch, zoom, viewportScale, renderedPoints: renderPoints.length };
    }

    function populateCaptureStats() {
      const core = model.categoryStats?.core || [0, 0, 0, 0];
      const tests = model.categoryStats?.tests || [0, 0, 0, 0];
      const format = value => Number(value || 0).toLocaleString("en-US");
      const counted = (value, singular, plural) => `${format(value)} ${Number(value || 0) === 1 ? singular : plural}`;
      ["classes", "modules", "methods", "constants"].forEach((metric, index) => {
        document.getElementById(`cinema-${metric}`).textContent = format(core[index]);
      });
      document.getElementById("cinema-secondary").textContent = `Tests · ${counted(tests[0], "class", "classes")} · ${counted(tests[2], "method", "methods")}   ·   ${counted(totals.packages, "dependency gem", "dependency gems")} in orbit`;
    }

    function setDrifting(next) {
      if (next) cancelCameraFlight();
      drifting = next;
      const motion = document.getElementById("motion");
      motion.textContent = drifting ? "Pause drift" : "Resume drift";
      motion.setAttribute("aria-pressed", String(!drifting));
      requestRender();
    }

    const pointerMetrics = () => {
      const active = [...pointers.values()];
      if (active.length < 2) return null;
      return {
        distance: Math.hypot(active[0][0] - active[1][0], active[0][1] - active[1][1]),
        x: (active[0][0] + active[1][0]) / 2,
        y: (active[0][1] + active[1][1]) / 2,
      };
    };
    function clearGestureState() {
      pointers.clear();
      gesture = null;
      pinchState = null;
      dragging = false;
      canvas.classList.remove("is-dragging-pan");
      requestRender();
    };
    canvas.addEventListener("pointerdown", event => {
      cancelCameraFlight();
      canvas.focus({ preventScroll: true });
      const firstPointer = pointers.size === 0;
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      canvas.setPointerCapture(event.pointerId);
      dragging = true;
      if (firstPointer) {
        const mode = navigationMode === "pan" || event.shiftKey || event.button !== 0 ? "pan" : "orbit";
        gesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, mode, moved: false, tappable: event.button === 0 };
        canvas.classList.toggle("is-dragging-pan", mode === "pan");
        if (!selectionLocked) selectPoint(null);
      } else {
        gesture = null;
        pinchState = pointerMetrics();
        canvas.classList.remove("is-dragging-pan");
      }
    });
    canvas.addEventListener("pointermove", event => {
      if (!pointers.has(event.pointerId)) {
        if (event.pointerType === "mouse") queueHover(event.clientX, event.clientY);
        return;
      }
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      if (pointers.size >= 2) {
        const nextPinch = pointerMetrics();
        if (pinchState && nextPinch && pinchState.distance > 0) {
          zoomBetween(zoom * nextPinch.distance / pinchState.distance, pinchState.x, pinchState.y, nextPinch.x, nextPinch.y);
        }
        pinchState = nextPinch;
        gesture = null;
        requestRender();
        return;
      }
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.lastX;
      const dy = event.clientY - gesture.lastY;
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 3) gesture.moved = true;
      if (gesture.mode === "pan") panBy(dx, dy);
      else {
        yaw += dx * .006;
        pitch = clamp(pitch + dy * .004, -TOP_DOWN_PITCH, TOP_DOWN_PITCH);
      }
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      requestRender();
    });
    function finishPointer(event, cancelled = false) {
      const wasTap = !cancelled && pointers.size === 1 && gesture?.pointerId === event.pointerId && gesture.tappable && !gesture.moved;
      pointers.delete(event.pointerId);
      gesture = null;
      pinchState = pointers.size >= 2 ? pointerMetrics() : null;
      dragging = pointers.size > 0;
      canvas.classList.remove("is-dragging-pan");
      if (wasTap) {
        const point = hoverTargetAt(event.clientX, event.clientY);
        clearActiveFact();
        clearCategoryFocus();
        if (point?.category === "dependencies" && selectionLocked && selectedPoint === point) focusDependencyPackage(point.packageIndex);
        else if (point) selectPoint(point, true);
        else clearExplorationFocus();
      }
      requestRender();
    }
    canvas.addEventListener("pointerup", event => finishPointer(event));
    canvas.addEventListener("pointercancel", event => finishPointer(event, true));
    canvas.addEventListener("lostpointercapture", event => { if (pointers.has(event.pointerId)) finishPointer(event, true); });
    canvas.addEventListener("pointerleave", () => { if (!selectionLocked && pointers.size === 0) selectPoint(null); });
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    window.addEventListener("blur", clearGestureState);
    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      if (pointers.size > 0) return;
      cancelCameraFlight();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      zoomBetween(zoom * Math.exp(-delta * .0012), event.clientX, event.clientY);
      requestRender();
    }, { passive: false });
    canvas.addEventListener("dblclick", event => {
      if (pointers.size > 0) return;
      const dependency = dependencyPackageAt(event.clientX, event.clientY);
      if (dependency) {
        focusDependencyPackage(dependency.packageIndex);
        return;
      }
      cancelCameraFlight();
      zoomBetween(zoom * 2, event.clientX, event.clientY);
      requestRender();
    });
    canvas.addEventListener("keydown", event => {
      if (pointers.size > 0) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") { cancelCameraFlight(); zoomBetween(zoom * ZOOM_STEP, sceneCenterX, sceneCenterY); }
      else if (event.key === "-") { cancelCameraFlight(); zoomBetween(zoom / ZOOM_STEP, sceneCenterX, sceneCenterY); }
      else if (event.key === "0") { cancelCameraFlight(); resetCamera(); }
      else if (event.key.toLowerCase() === "p") { cancelCameraFlight(); setNavigationMode(navigationMode === "pan" ? "orbit" : "pan"); }
      else if ((event.key === "Enter" || event.key.toLowerCase() === "f") && selectedPoint?.category === "dependencies") focusDependencyPackage(selectedPoint.packageIndex);
      else return;
      event.preventDefault();
      requestRender();
    });
    window.addEventListener("keydown", event => {
      if (event.key === "Escape") clearExplorationFocus();
      else moveViewWithArrow(event);
    });
    window.addEventListener("resize", resize);
    document.getElementById("motion").addEventListener("click", () => setDrifting(!drifting));
    document.getElementById("pan-mode").addEventListener("click", () => { cancelCameraFlight(); setNavigationMode(navigationMode === "pan" ? "orbit" : "pan"); });
    document.getElementById("zoom-in").addEventListener("click", () => { if (pointers.size === 0) { cancelCameraFlight(); zoomBetween(zoom * ZOOM_STEP, sceneCenterX, sceneCenterY); } requestRender(); });
    document.getElementById("zoom-out").addEventListener("click", () => { if (pointers.size === 0) { cancelCameraFlight(); zoomBetween(zoom / ZOOM_STEP, sceneCenterX, sceneCenterY); } requestRender(); });
    document.getElementById("view").addEventListener("click", () => {
      cancelCameraFlight();
      resetCamera();
      setNavigationMode("orbit");
      for (const category of Object.keys(visibleCategories)) setCategoryVisible(category, true);
      clearExplorationFocus();
      requestRender();
    });
    panelToggle.addEventListener("click", () => setPanelCollapsed(panelToggle.getAttribute("aria-expanded") === "true"));
    panel.addEventListener("transitionend", event => { if (event.propertyName === "width") { updateSceneViewport(); requestRender(); } });
    reducedMotionQuery.addEventListener("change", event => {
      if (!event.matches) return;
      completeCameraFlight();
      setDrifting(false);
    });

    document.getElementById("coverage").textContent = `${renderedDependencyStars.toLocaleString()} dependency stars shown`;
    const warningTotal = Object.values(model.warningCounts).reduce((sum, count) => sum + count, 0);
    if (warningTotal > 0) { const status = document.getElementById("status"); status.hidden = false; status.textContent = `${warningTotal.toLocaleString()} partial-index warning${warningTotal === 1 ? "" : "s"}`; }
    setDrifting(drifting);
    setNavigationMode(navigationMode);
    document.querySelector("h1").textContent = model.projectName;
    document.title = `RubyLens · ${model.projectName}`;
    canvas.setAttribute("aria-label", `Interactive three-dimensional stellar artwork of ${model.projectName}. Hover class and module stars for Ruby code details or gem clouds for package summaries. Sidebar highlights open a top-down view. Double-click a gem cloud, press Enter or F on a selected gem marker, or tap that marker again to expand its stars. Drag to orbit, Shift-drag or Pan mode to move, scroll or pinch to zoom at a point, and use arrow keys to move the view. Escape exits a focused gem system.`);
    if (captureMode) {
      document.querySelector(".eyebrow").textContent = "RubyLens · codebase galaxy";
      populateCaptureStats();
      resize();
      renderCaptureFrame(0, 1);
      window.RubyLensCapture = Object.freeze({
        ready: true,
        renderFrame: renderCaptureFrame,
        renderedPoints: renderPoints.length,
        totalPoints: points.length,
        renderedGemHubs: renderPoints.filter(point => point.hub).length,
        totalGemHubs: dependencyHubs.length,
        renderer: () => pointRenderer ? pointRenderer.info() : { kind: "canvas2d", fallbackReason: rendererSelection.error },
        metrics: () => ({ ...rendererMetrics }),
      });
      document.documentElement.dataset.captureReady = "true";
    } else {
      createExplorer();
      setPanelCollapsed(window.matchMedia("(max-width: 760px)").matches);
      resize();
    }
    window.RubyLensRendererDebug = Object.freeze({
      info: () => pointRenderer ? pointRenderer.info() : { kind: "canvas2d", fallbackReason: rendererSelection.error },
      metrics: () => ({ ...rendererMetrics }),
      sample: () => {
        const point = interactivePoints.find(candidate => candidate.screen);
        return point ? { x: point.screen[0], y: point.screen[1], size: point.screen[2], category: point.category } : null;
      },
    });
