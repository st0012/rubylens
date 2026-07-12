    "use strict";
    const model = JSON.parse(atob("{{MODEL_BASE64}}"));
    const showcaseMode = document.body.dataset.rubylensMode === "showcase";
    const interactiveMode = !showcaseMode;
    const groupedMode = Array.isArray(model.groups) && Array.isArray(model.groupRanges);
    if (groupedMode) document.body.classList.add("has-core-systems");
    const qaMode = window.__RUBYLENS_QA__ === true;
    const canvas = document.getElementById("cosmos");
    const context = canvas.getContext("2d", { alpha: false });
    const showcaseStage = document.getElementById("showcase-stage");
    const panel = document.getElementById("panel");
    const panelBody = document.getElementById("panel-body");
    const panelToggle = document.getElementById("panel-toggle");
    const coreRoutesButton = document.getElementById("core-routes");
    const routeModeStatus = document.getElementById("route-mode-status");
    const tooltip = document.getElementById("tooltip");
    const tooltipCategory = document.getElementById("tooltip-category");
    const tooltipName = document.getElementById("tooltip-name");
    const tooltipContext = document.getElementById("tooltip-context");
    const tooltipMetrics = document.getElementById("tooltip-metrics");
    const routePanel = document.getElementById("route-panel");
    const routeCount = document.getElementById("route-count");
    const routeSummary = document.getElementById("route-summary");
    const routeGroups = document.getElementById("route-groups");
    const routeMapCanvas = interactiveMode ? document.createElement("canvas") : null;
    const routeMapContext = routeMapCanvas?.getContext("2d");
    const fields = ["ancestorDepth", "definitionSites", "reopenings", "descendants", "references", "members"];
    const rubyMetricLabels = ["Classes", "Modules", "Methods", "Constants"];
    const signalWeights = {
      core: { ancestorDepth: .28, definitionSites: .2, reopenings: .18, descendants: .72, references: .82, members: .7 },
      tests: { ancestorDepth: .18, definitionSites: .25, reopenings: .18, descendants: .42, references: .85, members: .55 },
      dependencies: { ancestorDepth: .12, definitionSites: .35, reopenings: .2, descendants: .32, references: .48, members: .4 },
    };
    let width = 0, height = 0, dpr = 1, sceneRight = 0, sceneBottom = 0, sceneCenterX = 0, sceneCenterY = 0, yaw = -.36, pitch = .34, zoom = 1, panX = 0, panY = 0, dragging = false, gesture = null, pinchState = null, animationFrame = 0, hoverFrame = 0, pendingHover = null, selectedPoint = null, selectionLocked = false, focusedCategory = null, focusedGroupIndex = null, expandedPackageIndex = null, activeFactButton = null, navigationMode = "orbit", cameraFlight = null, showcaseStartedAt = null, showcaseRenderer = null, routeMapState = "idle", routeMapBuildFrame = 0, routeMapBuildIndex = 0, routeMapDrawnCount = 0, routeMapBuildToken = 0, routeMapLastAnnouncement = 0, routeMapLineAlpha = 0, routeMapRestoreDrift = false, routeMapRestoreCamera = null, routeMapProjectionState = null, routeMapProjectionX = null, routeMapProjectionY = null, routeMapMatrix = null;
    const MIN_ZOOM = .35, MAX_ZOOM = 40, ZOOM_STEP = 1.7, DEPENDENCY_EXPANSION = 2.35, SHOWCASE_POINT_LIMIT = 50_000;
    const SHOWCASE_PRESET = Object.freeze({
      "stageWidth": 1920,
      "stageHeight": 1080,
      "durationMs": 60000,
      "targetFps": 60,
      "turns": 1,
      "direction": "clockwise",
      "startAngleDegrees": -54,
      "elevationDegrees": -25,
      "elevationSwayDegrees": 1.5,
      "zoom": 1.6,
      "zoomBreathPercent": 0,
      "centerXPercent": 49,
      "centerYPercent": 67,
      "starBrightnessPercent": 75,
      "pointGlowPercent": 35,
      "backgroundGlowPercent": 200,
      "textScalePercent": 80,
      "layoutReferenceWidth": 720,
      "layoutReferenceHeight": 405,
      "mastheadLeft": 44,
      "mastheadTop": 40,
      "mastheadWidth": 632
    });
    const TOP_DOWN_PITCH = Math.PI / 2;
    const ROUTE_LIMIT = 16, COARSE_ROUTE_LIMIT = 8;
    const ROUTE_MAP_BATCH_SIZE = 256, ROUTE_MAP_FRAME_BUDGET = 7, ROUTE_MAP_ANNOUNCE_INTERVAL = 500;
    const EMPTY_SELECTED_ROUTE_CACHE = Object.freeze({ point: null, outgoingCount: 0, incomingCount: 0, entries: Object.freeze([]) });
    const contextVisibility = { selection: .75, category: .16, package: .75, system: .75 };
    const pointers = new Map();
    const visibleCategories = { core: true, tests: true, dependencies: true };
    const visibilityInputs = {};
    const focusButtons = {};
    const systemFocusButtons = {};
    const routeMapMutationKeys = new Set(["+", "=", "-", "0", "p", "enter", "f"]);
    const excludedTriviaNames = new Set(["Object", "Kernel", "BasicObject"]);
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const configuredMobile = () => groupedMode && Math.min(window.innerWidth, window.innerHeight) <= 430;
    let drifting = interactiveMode && !reducedMotionQuery.matches && !(groupedMode && model.explorerLayout === "atlas");
    let selectedRouteCache = EMPTY_SELECTED_ROUTE_CACHE;
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

    const GROUPED_WORKSPACE_RADIUS = groupedMode && interactiveMode && model.explorerLayout === "atlas" ? 160 : 42;
    const sourceGroupAnchors = groupedMode && interactiveMode && model.explorerLayout === "atlas"
      ? model.explorerAnchors
      : model.groupAnchors;
    const rawGroupRadii = groupedMode ? model.groupRadii.map(value => value / 1000) : [];
    const rawWorkspaceRadius = groupedMode ? sourceGroupAnchors.reduce((radius, anchor, index) => (
      Math.max(radius, Math.hypot(anchor[0], anchor[1], anchor[2]) + rawGroupRadii[index])
    ), 0) : 0;
    const groupedPositionScale = rawWorkspaceRadius > 0 ? GROUPED_WORKSPACE_RADIUS / rawWorkspaceRadius : 1;
    const groupAnchors = groupedMode ? sourceGroupAnchors.map(anchor => anchor.map(value => value * groupedPositionScale)) : [];
    const groupRadii = rawGroupRadii.map(radius => radius * groupedPositionScale);
    const workspaceSystemRadius = groupedMode ? groupAnchors.reduce((radius, anchor, index) => (
      Math.max(radius, Math.hypot(anchor[0], anchor[1], anchor[2]) + groupRadii[index])
    ), 0) : 0;

    function groupedNamespacePosition(row) {
      const groupIndex = row[1];
      const anchor = groupAnchors[groupIndex] || [0, 0, 0];
      const systemRadius = groupRadii[groupIndex] || 1;
      const tests = row[3] === 1;
      const local = tests ? testPosition(row[0]) : corePosition(row[0]);
      const magnitude = Math.max(Math.hypot(local[0], local[1], local[2]), 1e-6);
      const localRadius = systemRadius * (tests ? .68 + unit(row[0], 31) * .28 : .08 + unit(row[0], 30) * .5);
      const position = local.map(value => value / magnitude * localRadius);
      const pitch = (unit(groupIndex + 1, 32) - .5) * .28;
      const roll = (unit(groupIndex + 1, 33) - .5) * .2;
      const pitchCos = Math.cos(pitch), pitchSin = Math.sin(pitch);
      const rollCos = Math.cos(roll), rollSin = Math.sin(roll);
      const pitched = [position[0], position[1] * pitchCos - position[2] * pitchSin, position[1] * pitchSin + position[2] * pitchCos];
      const inclined = [pitched[0] * rollCos - pitched[1] * rollSin, pitched[0] * rollSin + pitched[1] * rollCos, pitched[2]];
      return anchor.map((value, index) => value + inclined[index]);
    }

    const packageAnchors = model.packages.map((row, index) => {
      const seed = row[0];
      const cloudRadius = 1.6 + Math.min(9, Math.sqrt(row[3]) * .055);
      const radius = groupedMode
        ? workspaceSystemRadius + cloudRadius + 18 + 72 * Math.pow(unit(seed, 14), .72)
        : 70 + 72 * Math.pow(unit(seed, 14), .72);
      const theta = unit(seed, 15) * Math.PI * 2;
      if (groupedMode && interactiveMode && model.explorerLayout === "atlas") {
        return [Math.cos(theta) * radius, Math.sin(theta) * radius, 0, cloudRadius, index];
      }
      const vertical = normal(seed, 16) * 24;
      return [Math.cos(theta) * radius, vertical, Math.sin(theta) * radius, cloudRadius, index];
    });

    function dependencyPosition(seed, packageIndex) {
      const anchor = packageAnchors[packageIndex] || [0, 0, 0, 2];
      const radius = Math.min(anchor[3], -anchor[3] * .34 * Math.log(Math.max(1e-5, 1 - unit(seed, 18))));
      const theta = unit(seed, 19) * Math.PI * 2;
      if (groupedMode && interactiveMode && model.explorerLayout === "atlas") {
        return [anchor[0] + Math.cos(theta) * radius, anchor[1] + Math.sin(theta) * radius, 0];
      }
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
      const namespacePoints = [];
      const interactivePoints = [];
      const dependencyHubs = [];
      const systemHubs = [];
      const namespaceLods = Array(model.namespaces.length).fill(2);
      if (groupedMode) {
        model.groupRanges.forEach(([first, length], groupIndex) => {
          const midLength = model.groupLods[groupIndex][0];
          for (let offset = 0; offset < length; offset += 1) namespaceLods[first + offset] = offset < midLength ? 1 : 2;
        });
      }
      const addPoint = (point, interactive = true) => {
        point.renderOrder = points.length;
        points.push(point);
        if (interactive && interactiveMode) interactivePoints.push(point);
        if (point.hub) dependencyHubs.push(point);
        if (point.systemHub) systemHubs.push(point);
      };
      model.namespaces.forEach((row, index) => {
        const category = row[3] === 1 ? "tests" : "core";
        const values = row.slice(4, 10);
        const rubyCounts = row.slice(10, 14);
        const point = { category, groupIndex: groupedMode ? row[1] : null, sourceIndex: index, lod: groupedMode ? namespaceLods[index] : 2, seed: row[0], position: groupedMode ? groupedNamespacePosition(row) : category === "tests" ? testPosition(row[0]) : corePosition(row[0]), signal: weightedSignal(normalizedSignals(values), category), base: category === "core" ? .82 : groupedMode ? .42 : .68 };
        if (interactiveMode) Object.assign(point, { name: model.namespaceNames[index], groupName: groupedMode ? model.groupNames[row[1]] : null, kind: row[2] === 0 ? "Class" : "Module", rubyCounts, instanceVariableCount: row[14] || 0, values });
        namespacePoints.push(point);
        addPoint(point);
      });
      if (groupedMode) {
        model.groups.forEach((row, groupIndex) => {
          const coreCount = Number(row[1] || 0) + Number(row[3] || 0);
          const testCount = Number(row[2] || 0);
          if (coreCount + testCount === 0) return;
          const point = {
            category: coreCount > 0 ? "core" : "tests",
            groupIndex,
            lod: 0,
            seed: hash(groupIndex + 1, 34),
            position: groupAnchors[groupIndex],
            signal: .5,
            base: 1 + Math.min(3.2, rawGroupRadii[groupIndex] * .22),
            systemHub: true,
            systemRadius: groupRadii[groupIndex],
          };
          if (interactiveMode) Object.assign(point, {
            name: model.groupNames[groupIndex],
            coreCount,
            testCount,
            crossGroupCount: Number(row[4] || 0),
            rubyCounts: row.slice(5, 9),
          });
          addPoint(point, false);
        });
      }
      model.dependencyStars.forEach(row => {
        const values = row.slice(2, 8);
        addPoint({ category: "dependencies", lod: groupedMode ? 1 : 2, packageIndex: row[1], seed: row[0], position: dependencyPosition(row[0], row[1]), signal: weightedSignal(normalizedSignals(values), "dependencies"), base: .45 }, false);
      });
      packageAnchors.forEach((anchor, index) => {
        const packageRow = model.packages[index];
        const rubyCounts = packageRow.slice(4, 8);
        const visualValues = [0, packageRow[3], 0, 0, 0, 0];
        const point = { category: "dependencies", lod: groupedMode ? 0 : 2, packageIndex: index, seed: packageRow[0], position: anchor.slice(0, 3), signal: weightedSignal(normalizedSignals(visualValues), "dependencies"), base: 1.8, hub: true };
        if (interactiveMode) Object.assign(point, { name: model.packageNames[index], packageRole: packageRow[1] === 0 ? "Direct dependency" : "Transitive dependency", packageLocation: packageRow[2] === 0 ? "Workspace package" : "External gem", rubyCounts });
        addPoint(point);
      });
      return { points, namespacePoints, interactivePoints, dependencyHubs, systemHubs };
    }
    const { points, namespacePoints, interactivePoints, dependencyHubs, systemHubs } = buildPoints();
    const coreReferenceRoutes = [];
    const outgoingRoutesByPoint = new Map();
    const incomingRoutesByPoint = new Map();
    const appendRoute = (routesByPoint, point, route) => {
      const routes = routesByPoint.get(point);
      if (routes) routes.push(route);
      else routesByPoint.set(point, [route]);
    };
    let routeProjectionCount = 0;
    let coreReferenceOccurrenceCount = 0;
    function decodeReferenceRoutes(rows) {
      for (const row of rows) {
        const source = namespacePoints[row[0]];
        const target = row[1] === 0 ? namespacePoints[row[2]] : dependencyHubs[row[2]];
        if (!source || !target) continue;
        const route = { source, target, count: Number(row[3]) || 0 };
        appendRoute(outgoingRoutesByPoint, source, route);
        appendRoute(incomingRoutesByPoint, target, route);
        if (source.category === "core" || target.category === "core") {
          coreReferenceRoutes.push(route);
          coreReferenceOccurrenceCount += route.count;
        }
      }
    }
    if (interactiveMode) {
      namespacePoints.forEach(point => {
        point.routeProjectionIndex = routeProjectionCount;
        routeProjectionCount += 1;
      });
      dependencyHubs.forEach(point => {
        point.routeProjectionIndex = routeProjectionCount;
        routeProjectionCount += 1;
      });
      decodeReferenceRoutes(model.referenceRoutes || []);
    }
    delete model.referenceRoutes;
    function showcasePointSample() {
      if (groupedMode || !showcaseMode || points.length <= SHOWCASE_POINT_LIMIT) return points;
      const hubs = points.filter(point => point.hub);
      const rank = point => [hash(point.seed, 73), point.seed, point];
      if (hubs.length >= SHOWCASE_POINT_LIMIT) {
        return hubs.map(rank)
          .sort((left, right) => left[0] - right[0] || left[1] - right[1])
          .slice(0, SHOWCASE_POINT_LIMIT)
          .map(candidate => candidate[2]);
      }
      const available = Math.max(0, SHOWCASE_POINT_LIMIT - hubs.length);
      const candidates = points.filter(point => !point.hub).map(rank);
      candidates.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      return candidates.slice(0, available).map(candidate => candidate[2]).concat(hubs);
    }
    const sampledPoints = showcasePointSample();
    const renderPoints = groupedMode
      ? sampledPoints.slice().sort((left, right) => left.lod - right.lod || left.renderOrder - right.renderOrder)
      : sampledPoints;
    const firstMidPoint = groupedMode ? renderPoints.findIndex(point => point.lod > 0) : -1;
    const farPointCount = groupedMode ? (firstMidPoint < 0 ? renderPoints.length : firstMidPoint) : renderPoints.length;
    const firstNearPoint = groupedMode ? renderPoints.findIndex(point => point.lod > 1) : -1;
    const midPointCount = groupedMode ? (firstNearPoint < 0 ? renderPoints.length : firstNearPoint) : renderPoints.length;
    const firstFaintDependency = groupedMode ? renderPoints.findIndex(point => point.lod === 1 && point.category === "dependencies" && !point.hub) : -1;
    const essentialMidPointCount = firstFaintDependency < 0 ? midPointCount : Math.min(midPointCount, firstFaintDependency);
    const groupNearDrawRanges = groupedMode ? model.groups.map(() => [0, 0]) : [];
    const groupMidDrawRanges = groupedMode ? model.groups.map(() => [0, 0]) : [];
    const packageMidDrawRanges = groupedMode ? model.packages.map(() => []) : [];
    if (groupedMode) {
      for (let index = farPointCount; index < midPointCount; index += 1) {
        const point = renderPoints[index];
        if (point.category === "dependencies" && Number.isInteger(point.packageIndex) && !point.hub) {
          const ranges = packageMidDrawRanges[point.packageIndex];
          const previous = ranges[ranges.length - 1];
          if (previous && previous[0] + previous[1] === index) previous[1] += 1;
          else ranges.push([index, 1]);
        }
        const groupIndex = point.groupIndex;
        if (!Number.isInteger(groupIndex)) continue;
        const range = groupMidDrawRanges[groupIndex];
        if (range[1] === 0) range[0] = index;
        range[1] += 1;
      }
      for (let index = midPointCount; index < renderPoints.length; index += 1) {
        const groupIndex = renderPoints[index].groupIndex;
        const range = groupNearDrawRanges[groupIndex];
        if (range[1] === 0) range[0] = index;
        range[1] += 1;
      }
    }

    function visibleDrawRanges() {
      if (!groupedMode) return [[0, renderPoints.length]];
      const basePointCount = configuredMobile() ? essentialMidPointCount : midPointCount;
      if (focusedGroupIndex !== null) {
        const mid = groupMidDrawRanges[focusedGroupIndex] || [0, 0];
        const near = groupNearDrawRanges[focusedGroupIndex] || [0, 0];
        return [[0, farPointCount], mid, near].filter(range => range[1] > 0);
      }
      const overviewCount = interactiveMode && model.explorerLayout === "atlas" ? farPointCount : basePointCount;
      const ranges = [[0, overviewCount]];
      if (expandedPackageIndex !== null) {
        for (const [first, length] of packageMidDrawRanges[expandedPackageIndex] || []) {
          const supplementalFirst = Math.max(first, overviewCount);
          const supplementalLength = first + length - supplementalFirst;
          if (supplementalLength > 0) ranges.push([supplementalFirst, supplementalLength]);
        }
      }
      return ranges;
    }
    function updateQaDrawCounts() {
      if (!groupedMode || !qaMode) return;
      const ranges = visibleDrawRanges();
      document.documentElement.dataset.rubylensRetainedPoints = String(renderPoints.length);
      document.documentElement.dataset.rubylensRenderedPoints = String(ranges.reduce((sum, range) => sum + range[1], 0));
      document.documentElement.dataset.rubylensDrawRanges = JSON.stringify(ranges);
      document.documentElement.dataset.rubylensFarPoints = String(farPointCount);
      document.documentElement.dataset.rubylensMidPoints = String(midPointCount);
      document.documentElement.dataset.rubylensEssentialMidPoints = String(essentialMidPointCount);
      document.documentElement.dataset.rubylensSelectedRangePoints = focusedGroupIndex === null ? "0" : String(model.groupRanges[focusedGroupIndex][1]);
      document.documentElement.dataset.rubylensSelectedMidPoints = focusedGroupIndex === null ? "0" : String(groupMidDrawRanges[focusedGroupIndex][1]);
      document.documentElement.dataset.rubylensSelectedNearPoints = focusedGroupIndex === null ? "0" : String(groupNearDrawRanges[focusedGroupIndex][1]);
    }
    if (groupedMode && qaMode) {
      document.documentElement.dataset.rubylensNamespacePoints = String(model.namespaces.length);
      document.documentElement.dataset.rubylensRangePoints = String(model.groupRanges.reduce((sum, range) => sum + range[1], 0));
      let minimumCentroidDistance = Infinity;
      const activeGroupIndexes = model.groups.map((row, index) => Number(row[1] || 0) + Number(row[2] || 0) + Number(row[3] || 0) > 0 ? index : null).filter(Number.isInteger);
      for (let leftRank = 0; leftRank < activeGroupIndexes.length; leftRank += 1) {
        const leftIndex = activeGroupIndexes[leftRank];
        const left = groupAnchors[leftIndex];
        for (let rightRank = leftRank + 1; rightRank < activeGroupIndexes.length; rightRank += 1) {
          const rightIndex = activeGroupIndexes[rightRank];
          const right = groupAnchors[rightIndex];
          minimumCentroidDistance = Math.min(minimumCentroidDistance, Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]));
        }
      }
      const localDistances = { core: { sum: 0, count: 0 }, tests: { sum: 0, count: 0 } };
      let minimumDependencyRadius = Infinity;
      let minimumDependencyProjectedRadius = Infinity;
      for (const point of points) {
        if (Number.isInteger(point.groupIndex) && !point.systemHub) {
          const anchor = groupAnchors[point.groupIndex];
          localDistances[point.category].sum += Math.hypot(point.position[0] - anchor[0], point.position[1] - anchor[1], point.position[2] - anchor[2]);
          localDistances[point.category].count += 1;
        } else if (point.category === "dependencies") {
          minimumDependencyRadius = Math.min(minimumDependencyRadius, Math.hypot(point.position[0], point.position[1], point.position[2]));
          minimumDependencyProjectedRadius = Math.min(minimumDependencyProjectedRadius, Math.hypot(point.position[0], point.position[1]));
        }
      }
      document.documentElement.dataset.rubylensCentroidSeparation = Number.isFinite(minimumCentroidDistance) ? minimumCentroidDistance.toFixed(3) : "0";
      document.documentElement.dataset.rubylensCoreMeanRadius = (localDistances.core.sum / Math.max(1, localDistances.core.count)).toFixed(3);
      document.documentElement.dataset.rubylensTestMeanRadius = (localDistances.tests.sum / Math.max(1, localDistances.tests.count)).toFixed(3);
      document.documentElement.dataset.rubylensDependencyMargin = Number.isFinite(minimumDependencyRadius) ? (minimumDependencyRadius - workspaceSystemRadius).toFixed(3) : "0";
      document.documentElement.dataset.rubylensDependencyProjectedMargin = Number.isFinite(minimumDependencyProjectedRadius) ? (minimumDependencyProjectedRadius - workspaceSystemRadius).toFixed(3) : "0";
      updateQaDrawCounts();
    }

    function createShowcaseRenderer() {
      const liveCanvas = document.createElement("canvas");
      liveCanvas.id = "showcase-cosmos";
      liveCanvas.setAttribute("role", "img");
      liveCanvas.setAttribute("aria-label", canvas.getAttribute("aria-label") || "Autonomous stellar artwork of a Ruby codebase.");
      canvas.insertAdjacentElement("afterend", liveCanvas);
      const gl = liveCanvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        depth: false,
        desynchronized: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      if (!gl) {
        liveCanvas.remove();
        document.documentElement.dataset.showcaseRenderer = "canvas2d-fallback";
        return null;
      }

      const compileShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(shader) || "Unknown WebGL shader error";
          gl.deleteShader(shader);
          throw new Error(message);
        }
        return shader;
      };
      const createProgram = (vertexSource, fragmentSource) => {
        const program = gl.createProgram();
        const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          const message = gl.getProgramInfoLog(program) || "Unknown WebGL program error";
          gl.deleteProgram(program);
          throw new Error(message);
        }
        return program;
      };

      const backgroundProgram = createProgram(`#version 300 es
        precision highp float;
        const vec2 POSITIONS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
        void main() { gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0); }
      `, `#version 300 es
        precision highp float;
        uniform vec2 u_resolution;
        uniform vec2 u_center;
        uniform float u_backgroundGlow;
        out vec4 outColor;
        void main() {
          vec2 pixel = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
          float radius = max(u_resolution.x, u_resolution.y) * 0.72;
          float distanceMix = clamp(distance(pixel, u_center) / radius, 0.0, 1.0);
          vec3 base = vec3(3.0, 4.0, 10.0) / 255.0;
          vec3 source = mix(vec3(30.0, 16.0, 45.0) / 255.0, vec3(0.0), distanceMix);
          float centerAlpha = min(0.5, 0.18 * u_backgroundGlow / 100.0);
          float alpha = mix(centerAlpha, 0.6, distanceMix);
          outColor = vec4(mix(base, source, alpha), 1.0);
        }
      `);

      const pointProgram = createProgram(`#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in float a_sizeFactor;
        layout(location = 2) in float a_alpha;
        layout(location = 3) in float a_category;
        layout(location = 4) in float a_maxSize;
        uniform vec2 u_resolution;
        uniform vec2 u_center;
        uniform float u_yaw;
        uniform float u_pitch;
        uniform float u_zoom;
        uniform float u_brightness;
        uniform float u_glow;
        uniform float u_deepDetail;
        uniform int u_grouped;
        uniform int u_pass;
        out vec3 v_colour;
        out float v_alpha;
        out float v_radius;

        void hidePoint() {
          gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
          gl_PointSize = 1.0;
          v_colour = vec3(0.0);
          v_alpha = 0.0;
          v_radius = 0.5;
        }

        void main() {
          float cy = cos(u_yaw);
          float sy = sin(u_yaw);
          float cp = cos(u_pitch);
          float sp = sin(u_pitch);
          float x1 = a_position.x * cy - a_position.z * sy;
          float z1 = a_position.x * sy + a_position.z * cy;
          float y2 = a_position.y * cp - z1 * sp;
          float z2 = a_position.y * sp + z1 * cp;
          float depth = 270.0 - z2;
          if (depth <= 35.0) { hidePoint(); return; }

          float perspective = 440.0 / depth * u_zoom;
          vec2 screen = u_center + vec2(x1, y2) * perspective;
          if (screen.x < -20.0 || screen.x > u_resolution.x + 20.0 || screen.y < -20.0 || screen.y > u_resolution.y + 20.0) {
            hidePoint();
            return;
          }

          float size = clamp(a_sizeFactor * perspective, 0.35, a_maxSize);
          float visibleAlpha = clamp(a_alpha * u_brightness / 100.0, 0.0, 1.0);
          float radius = size;
          float alpha = visibleAlpha;
          vec3 colour = a_category < 0.5
            ? vec3(244.0, 82.0, 132.0) / 255.0
            : (a_category < 1.5 ? vec3(87.0, 204.0, 255.0) / 255.0 : vec3(255.0, 184.0, 77.0) / 255.0);

          if (u_pass == 0) {
            if (size <= 1.35 || u_glow <= 0.0) { hidePoint(); return; }
            float glowScale = (3.4 - u_deepDetail * 1.3) * (0.75 + 0.25 * u_glow / 100.0);
            radius = size * glowScale;
            alpha = min(1.0, visibleAlpha * 0.055 * u_glow / 100.0);
          } else if (u_pass == 1) {
            radius = size < 0.85 ? 0.5 : size;
          } else {
            if (u_grouped == 1 && a_category >= 0.5 && a_category < 1.5) { hidePoint(); return; }
            if (size <= 1.1) { hidePoint(); return; }
            radius = max(0.45 + u_deepDetail * 0.25, size * (0.24 + u_deepDetail * 0.06));
            alpha = min(0.9, visibleAlpha * 1.25);
            colour = vec3(255.0, 248.0, 244.0) / 255.0;
          }

          gl_Position = vec4(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0, 0.0, 1.0);
          gl_PointSize = max(1.0, radius * 2.0);
          v_colour = colour;
          v_alpha = alpha;
          v_radius = radius;
        }
      `, `#version 300 es
        precision highp float;
        in vec3 v_colour;
        in float v_alpha;
        in float v_radius;
        out vec4 outColor;
        void main() {
          if (v_alpha <= 0.0) discard;
          float radial = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float feather = min(1.0, 1.0 / max(v_radius, 1.0));
          float coverage = 1.0 - smoothstep(1.0 - feather, 1.0, radial);
          if (coverage <= 0.0) discard;
          float contribution = v_alpha * coverage;
          outColor = vec4(v_colour * contribution, contribution);
        }
      `);

      const pointData = new Float32Array(renderPoints.length * 7);
      const categoryIndex = { core: 0, tests: 1, dependencies: 2 };
      renderPoints.forEach((point, index) => {
        const offset = index * 7;
        pointData[offset] = point.position[0];
        pointData[offset + 1] = point.position[1];
        pointData[offset + 2] = point.position[2];
        pointData[offset + 3] = point.base * (.62 + point.signal * .46);
        pointData[offset + 4] = clamp(.14 + point.signal * .105, .12, point.hub ? .86 : .7) * (groupedMode && point.category === "tests" && !point.systemHub ? .55 : 1);
        pointData[offset + 5] = categoryIndex[point.category];
        pointData[offset + 6] = point.systemHub ? 8 : point.hub ? 5.2 : 3.2;
      });

      const pointVao = gl.createVertexArray();
      const pointBuffer = gl.createBuffer();
      gl.bindVertexArray(pointVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.STATIC_DRAW);
      const stride = 7 * Float32Array.BYTES_PER_ELEMENT;
      [[0, 3, 0], [1, 1, 3], [2, 1, 4], [3, 1, 5], [4, 1, 6]].forEach(([location, size, offset]) => {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
      });
      gl.bindVertexArray(null);

      const backgroundUniforms = {
        resolution: gl.getUniformLocation(backgroundProgram, "u_resolution"),
        center: gl.getUniformLocation(backgroundProgram, "u_center"),
        backgroundGlow: gl.getUniformLocation(backgroundProgram, "u_backgroundGlow"),
      };
      const pointUniforms = {
        resolution: gl.getUniformLocation(pointProgram, "u_resolution"),
        center: gl.getUniformLocation(pointProgram, "u_center"),
        yaw: gl.getUniformLocation(pointProgram, "u_yaw"),
        pitch: gl.getUniformLocation(pointProgram, "u_pitch"),
        zoom: gl.getUniformLocation(pointProgram, "u_zoom"),
        brightness: gl.getUniformLocation(pointProgram, "u_brightness"),
        glow: gl.getUniformLocation(pointProgram, "u_glow"),
        deepDetail: gl.getUniformLocation(pointProgram, "u_deepDetail"),
        grouped: gl.getUniformLocation(pointProgram, "u_grouped"),
        pass: gl.getUniformLocation(pointProgram, "u_pass"),
      };
      const pointSizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      document.documentElement.dataset.showcaseRenderer = "webgl2";
      document.documentElement.dataset.pointSizeRange = `${pointSizeRange[0]},${pointSizeRange[1]}`;
      canvas.style.display = "none";

      let renderScale = 1;
      return Object.freeze({
        resize(viewportWidth, viewportHeight) {
          renderScale = configuredMobile() ? .75 : 1;
          liveCanvas.width = Math.round(viewportWidth * renderScale);
          liveCanvas.height = Math.round(viewportHeight * renderScale);
          gl.viewport(0, 0, liveCanvas.width, liveCanvas.height);
        },
        render() {
          const deepDetail = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
          gl.disable(gl.BLEND);
          gl.useProgram(backgroundProgram);
          gl.bindVertexArray(null);
          gl.uniform2f(backgroundUniforms.resolution, width * renderScale, height * renderScale);
          gl.uniform2f(backgroundUniforms.center, sceneCenterX * renderScale, sceneCenterY * renderScale);
          gl.uniform1f(backgroundUniforms.backgroundGlow, SHOWCASE_PRESET.backgroundGlowPercent * (configuredMobile() ? .8 : 1));
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          gl.enable(gl.BLEND);
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE);
          gl.useProgram(pointProgram);
          gl.bindVertexArray(pointVao);
          gl.uniform2f(pointUniforms.resolution, width * renderScale, height * renderScale);
          gl.uniform2f(pointUniforms.center, sceneCenterX * renderScale, sceneCenterY * renderScale);
          gl.uniform1f(pointUniforms.yaw, yaw);
          gl.uniform1f(pointUniforms.pitch, pitch);
          gl.uniform1f(pointUniforms.zoom, zoom * renderScale);
          gl.uniform1f(pointUniforms.brightness, SHOWCASE_PRESET.starBrightnessPercent);
          gl.uniform1f(pointUniforms.glow, SHOWCASE_PRESET.pointGlowPercent * (configuredMobile() ? .65 : 1));
          gl.uniform1f(pointUniforms.deepDetail, deepDetail);
          gl.uniform1i(pointUniforms.grouped, groupedMode ? 1 : 0);
          for (let pass = 0; pass < 3; pass += 1) {
            if (configuredMobile() && pass === 2) continue;
            gl.uniform1i(pointUniforms.pass, pass);
            for (const [first, length] of visibleDrawRanges()) gl.drawArrays(gl.POINTS, first, length);
          }
          gl.bindVertexArray(null);
          gl.disable(gl.BLEND);
        },
      });
    }

    if (showcaseMode) {
      try {
        showcaseRenderer = createShowcaseRenderer();
      } catch (error) {
        document.getElementById("showcase-cosmos")?.remove();
        canvas.style.display = "";
        document.documentElement.dataset.showcaseRenderer = "canvas2d-fallback";
        document.documentElement.dataset.showcaseRendererError = error.message;
      }
    }
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
    if (showcaseMode) {
      model.namespaces = [];
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

    function atlasFaceOnCameraTargetForPoint(point, targetZoom) {
      const [x, y, z] = point.position;
      const perspective = 440 / (270 - z) * targetZoom;
      return { yaw: 0, pitch: 0, zoom: targetZoom, panX: -x * perspective, panY: -y * perspective };
    }

    function cameraTargetForPoint(point, targetZoom = point.hub ? 4 : point.category === "dependencies" ? 5 : 7) {
      if (groupedMode && interactiveMode && model.explorerLayout === "atlas") return atlasFaceOnCameraTargetForPoint(point, targetZoom);
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
      if (groupedMode && interactiveMode && model.explorerLayout === "atlas") return atlasFaceOnCameraTargetForPoint(point, targetZoom);
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
      if (routeMapOpen()) return;
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
      tooltipCategory.textContent = point.systemHub ? "Core system" : point.hub ? "Gem" : point.category === "tests" ? "Tests" : "Core code";
      tooltipName.textContent = point.name || "Unnamed Ruby item";
      if (point.systemHub) {
        const spans = point.crossGroupCount > 0 ? ` · ${point.crossGroupCount.toLocaleString()} shared namespace span${point.crossGroupCount === 1 ? "" : "s"}` : "";
        tooltipContext.textContent = `${point.coreCount.toLocaleString()} Core · ${point.testCount.toLocaleString()} Tests${spans}`;
        addRubyMetrics(point.rubyCounts, allRubyMetricIndexes);
        return;
      }
      if (point.hub) {
        const expanded = expandedPackageIndex === point.packageIndex ? " · Expanded gem cloud · Escape to exit" : "";
        tooltipContext.textContent = `${point.packageRole} · ${point.packageLocation}${expanded}`;
        addRubyMetrics(point.rubyCounts, allRubyMetricIndexes);
        return;
      }
      tooltipContext.textContent = point.groupName ? `${point.kind} · ${point.groupName}` : point.kind;
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

    function routeCategoryLabel(point) {
      return point.hub ? "Gem" : point.category === "tests" ? "Tests" : "Core code";
    }

    function routeVisible(route) {
      return visibleCategories[route.source.category] && visibleCategories[route.target.category];
    }

    function compareRouteEntries(left, right) {
      const countOrder = right.route.count - left.route.count;
      if (countOrder) return countOrder;
      const nameOrder = left.destination.name === right.destination.name ? 0 : left.destination.name < right.destination.name ? -1 : 1;
      if (nameOrder) return nameOrder;
      if (left.direction !== right.direction) return left.direction === "outgoing" ? -1 : 1;
      const categoryOrder = left.destination.category === right.destination.category ? 0 : left.destination.category < right.destination.category ? -1 : 1;
      if (categoryOrder) return categoryOrder;
      return (left.destination.routeProjectionIndex || 0) - (right.destination.routeProjectionIndex || 0);
    }

    function insertBoundedRouteEntry(entries, entry, limit) {
      let low = 0, high = entries.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (compareRouteEntries(entry, entries[middle]) < 0) high = middle;
        else low = middle + 1;
      }
      if (low >= limit) return;
      entries.splice(low, 0, entry);
      if (entries.length > limit) entries.pop();
    }

    function buildSelectedRouteCache(point) {
      const limit = coarsePointerQuery.matches ? COARSE_ROUTE_LIMIT : ROUTE_LIMIT;
      const entries = [];
      let outgoingCount = 0, incomingCount = 0;
      for (const route of outgoingRoutesByPoint.get(point) || []) {
        if (!routeVisible(route)) continue;
        outgoingCount += 1;
        if (!point.hub) insertBoundedRouteEntry(entries, { route, direction: "outgoing", destination: route.target }, limit);
      }
      for (const route of incomingRoutesByPoint.get(point) || []) {
        if (!routeVisible(route)) continue;
        incomingCount += 1;
        insertBoundedRouteEntry(entries, { route, direction: "incoming", destination: route.source }, limit);
      }
      return { point, outgoingCount, incomingCount, entries };
    }

    function refreshSelectedRouteCache() {
      selectedRouteCache = selectionLocked && selectedPoint && !selectedPoint.systemHub
        ? buildSelectedRouteCache(selectedPoint)
        : EMPTY_SELECTED_ROUTE_CACHE;
      return selectedRouteCache;
    }

    function selectedRouteEntries() {
      return selectedRouteCache.entries;
    }

    function createRouteGroup(title, entries) {
      const group = document.createElement("section");
      group.className = "route-group";
      const heading = document.createElement("h4");
      heading.textContent = title;
      const list = document.createElement("div");
      list.className = "route-list";
      for (const entry of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "route-link";
        const direction = document.createElement("span");
        direction.className = "route-direction";
        direction.textContent = entry.direction === "outgoing" ? "→" : "←";
        direction.setAttribute("aria-hidden", "true");
        const identity = document.createElement("span");
        identity.className = "route-identity";
        const name = document.createElement("span");
        name.className = "route-name";
        name.textContent = entry.destination.name;
        const meta = document.createElement("span");
        meta.className = "route-meta";
        meta.textContent = routeCategoryLabel(entry.destination);
        identity.append(name, meta);
        const weight = document.createElement("span");
        weight.className = "route-weight";
        weight.textContent = `×${entry.route.count.toLocaleString()}`;
        const directionLabel = entry.direction === "outgoing" ? "Outgoing to" : "Incoming from";
        const referenceLabel = entry.route.count === 1 ? "reference" : "references";
        button.setAttribute("aria-label", `${directionLabel} ${entry.destination.name}, ${routeCategoryLabel(entry.destination)}, ${entry.route.count.toLocaleString()} resolved ${referenceLabel}`);
        button.append(direction, identity, weight);
        button.addEventListener("click", () => travelAlongRoute(entry));
        list.append(button);
      }
      group.append(heading, list);
      return group;
    }

    function updateRoutePanel() {
      routeGroups.textContent = "";
      if (!selectionLocked || !selectedPoint || selectedPoint.systemHub) {
        routePanel.hidden = true;
        routeCount.textContent = "";
        routeSummary.textContent = "";
        return;
      }

      const cache = selectedRouteCache;
      const entries = cache.entries;
      const total = cache.outgoingCount + cache.incomingCount;
      routePanel.hidden = false;
      routeCount.textContent = total > entries.length ? `${entries.length} of ${total}` : `${total}`;
      if (!total) {
        routeSummary.textContent = `No resolved constant-reference routes connect ${selectedPoint.name} to another plotted star or gem.`;
        return;
      }

      const shown = total > entries.length ? ` Strongest ${entries.length} shown.` : "";
      routeSummary.textContent = `${cache.outgoingCount} outgoing · ${cache.incomingCount} incoming for ${selectedPoint.name}.${shown}`;
      const outgoing = entries.filter(entry => entry.direction === "outgoing");
      const incoming = entries.filter(entry => entry.direction === "incoming");
      if (outgoing.length) routeGroups.append(createRouteGroup("Outgoing to", outgoing));
      if (incoming.length) routeGroups.append(createRouteGroup("Incoming from", incoming));
    }

    function selectPoint(point, locked = false) {
      if (locked && selectionLocked && selectedPoint === point) point = null;
      selectedPoint = point;
      selectionLocked = Boolean(point) && locked;
      if (point) updateTooltipContent(point);
      else tooltip.hidden = true;
      refreshSelectedRouteCache();
      updateRoutePanel();
      requestRender();
    }

    function nearestScreenPoint(candidates, x, y) {
      let nearest = null;
      let nearestDistance = Infinity;
      for (const point of candidates) {
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

    function nearestNamespaceInRange(first, length, x, y) {
      let nearest = null;
      let nearestDistance = Infinity;
      const last = Math.min(namespacePoints.length, first + length);
      for (let index = first; index < last; index += 1) {
        const point = namespacePoints[index];
        if (!point.screen || (focusedCategory && point.category !== focusedCategory)) continue;
        const distance = Math.hypot(point.screen[0] - x, point.screen[1] - y);
        const radius = Math.max(8, point.screen[2] + 4);
        if (distance <= radius && distance < nearestDistance) {
          nearest = point;
          nearestDistance = distance;
        }
      }
      return nearest;
    }

    function systemHubAt(x, y) {
      let nearest = null;
      let nearestRatio = Infinity;
      for (const point of systemHubs) {
        if (!point.screen) continue;
        const distance = Math.hypot(point.screen[0] - x, point.screen[1] - y);
        const radius = Math.max(10, point.screen[2] + point.systemRadius * point.screen[3]);
        const ratio = distance / radius;
        if (ratio <= 1 && ratio < nearestRatio) {
          nearest = point;
          nearestRatio = ratio;
        }
      }
      return nearest;
    }

    function hitTest(x, y) {
      if (!groupedMode) return nearestScreenPoint(interactivePoints, x, y);
      if (focusedGroupIndex === null) return systemHubAt(x, y);

      const [first, length] = model.groupRanges[focusedGroupIndex];
      return nearestNamespaceInRange(first, length, x, y);
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
      if (routeMapOpen() || cameraFlight || selectionLocked || dragging || pointers.size > 0) return;
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

    function coreRouteLabel() {
      return coreReferenceRoutes.length === 1 ? "1 Core route" : `${coreReferenceRoutes.length.toLocaleString()} Core routes`;
    }

    function routeMapOpen() {
      return routeMapState !== "idle";
    }

    function setRouteMapControlsDisabled(disabled) {
      Object.values(visibilityInputs).forEach(input => { input.disabled = disabled; });
      Object.values(focusButtons).forEach(button => { button.disabled = disabled; });
      Object.values(systemFocusButtons).forEach(button => { button.disabled = disabled; });
      document.querySelectorAll(".fact, .route-link").forEach(button => { button.disabled = disabled; });
      ["motion", "pan-mode", "zoom-in", "zoom-out"].forEach(id => { document.getElementById(id).disabled = disabled; });
      panelToggle.disabled = disabled;
      canvas.classList.toggle("is-route-map", disabled);
      canvas.tabIndex = disabled ? -1 : 0;
      if (disabled) canvas.setAttribute("aria-disabled", "true");
      else canvas.removeAttribute("aria-disabled");
    }

    function clearRouteMapBuildData() {
      routeMapProjectionState = null;
      routeMapProjectionX = null;
      routeMapProjectionY = null;
      routeMapMatrix = null;
    }

    function cachedRouteProjection(point) {
      const index = point.routeProjectionIndex;
      if (routeMapProjectionState[index] === 0) {
        const projected = project(point, routeMapMatrix);
        if (projected) {
          routeMapProjectionState[index] = 1;
          routeMapProjectionX[index] = projected[0];
          routeMapProjectionY[index] = projected[1];
        } else {
          routeMapProjectionState[index] = 2;
        }
      }
      return routeMapProjectionState[index] === 1 ? index : -1;
    }

    function completeRouteMapBuild(token) {
      if (token !== routeMapBuildToken || routeMapState !== "building") return;
      routeMapState = "active";
      routeMapBuildFrame = 0;
      clearRouteMapBuildData();
      canvas.dataset.routeMapState = routeMapState;
      canvas.dataset.referenceRoutesDrawn = String(routeMapDrawnCount);
      canvas.removeAttribute("aria-busy");
      coreRoutesButton.removeAttribute("aria-busy");
      coreRoutesButton.textContent = "Exit routes";
      coreRoutesButton.setAttribute("aria-label", "Exit Core route map");
      coreRoutesButton.title = `Exit the map of ${coreRouteLabel()}`;
      const rendered = routeMapDrawnCount === coreReferenceRoutes.length
        ? coreRouteLabel()
        : `${routeMapDrawnCount.toLocaleString()} of ${coreRouteLabel()}`;
      routeModeStatus.textContent = `Core route map · ${rendered} rendered · ${coreReferenceOccurrenceCount.toLocaleString()} resolved references touching Core code`;
      requestRender();
    }

    function drawRouteMapBatch() {
      const batchEnd = Math.min(routeMapBuildIndex + ROUTE_MAP_BATCH_SIZE, coreReferenceRoutes.length);
      let drawnInBatch = 0;
      routeMapContext.save();
      routeMapContext.beginPath();
      routeMapContext.rect(0, 0, sceneRight, sceneBottom);
      routeMapContext.clip();
      routeMapContext.beginPath();
      while (routeMapBuildIndex < batchEnd) {
        const route = coreReferenceRoutes[routeMapBuildIndex];
        const sourceIndex = cachedRouteProjection(route.source);
        const targetIndex = cachedRouteProjection(route.target);
        if (sourceIndex >= 0 && targetIndex >= 0) {
          routeMapContext.moveTo(routeMapProjectionX[sourceIndex], routeMapProjectionY[sourceIndex]);
          routeMapContext.lineTo(routeMapProjectionX[targetIndex], routeMapProjectionY[targetIndex]);
          routeMapDrawnCount += 1;
          drawnInBatch += 1;
        }
        routeMapBuildIndex += 1;
      }
      if (drawnInBatch > 0) {
        routeMapContext.strokeStyle = `rgba(184,216,255,${routeMapLineAlpha})`;
        routeMapContext.lineWidth = .65;
        routeMapContext.stroke();
      }
      routeMapContext.restore();
    }

    function buildRouteMapChunk(token) {
      if (token !== routeMapBuildToken || routeMapState !== "building") return;
      const startedAt = performance.now();
      do {
        drawRouteMapBatch();
      } while (routeMapBuildIndex < coreReferenceRoutes.length && performance.now() - startedAt < ROUTE_MAP_FRAME_BUDGET);
      canvas.dataset.referenceRoutesProcessed = String(routeMapBuildIndex);
      const now = performance.now();
      if (now - routeMapLastAnnouncement >= ROUTE_MAP_ANNOUNCE_INTERVAL) {
        routeMapLastAnnouncement = now;
        routeModeStatus.textContent = `Building Core route map · ${routeMapBuildIndex.toLocaleString()} of ${coreReferenceRoutes.length.toLocaleString()} routes`;
      }
      if (routeMapBuildIndex >= coreReferenceRoutes.length) completeRouteMapBuild(token);
      else routeMapBuildFrame = requestAnimationFrame(() => buildRouteMapChunk(token));
    }

    function stopCoreRouteMap(focusButton = false) {
      const resumeDrift = routeMapOpen() ? routeMapRestoreDrift && !reducedMotionQuery.matches : drifting;
      const restoreCamera = routeMapRestoreCamera;
      routeMapBuildToken += 1;
      if (routeMapBuildFrame) cancelAnimationFrame(routeMapBuildFrame);
      routeMapBuildFrame = 0;
      routeMapBuildIndex = 0;
      routeMapDrawnCount = 0;
      routeMapLastAnnouncement = 0;
      routeMapLineAlpha = 0;
      routeMapRestoreDrift = false;
      routeMapRestoreCamera = null;
      routeMapState = "idle";
      clearRouteMapBuildData();
      routeMapCanvas.width = 0;
      routeMapCanvas.height = 0;
      canvas.dataset.routeMapState = routeMapState;
      canvas.dataset.referenceRoutesProcessed = "0";
      canvas.dataset.referenceRoutesDrawn = "0";
      canvas.removeAttribute("aria-busy");
      coreRoutesButton.removeAttribute("aria-busy");
      coreRoutesButton.textContent = "Core routes";
      coreRoutesButton.setAttribute("aria-pressed", "false");
      coreRoutesButton.setAttribute("aria-label", "Build Core route map");
      coreRoutesButton.title = `Build a map of ${coreRouteLabel()}`;
      routeModeStatus.hidden = true;
      routeModeStatus.textContent = "";
      setRouteMapControlsDisabled(false);
      if (restoreCamera) applyCameraTarget(restoreCamera);
      setDrifting(resumeDrift);
      requestRender();
      if (focusButton) coreRoutesButton.focus({ preventScroll: true });
    }

    function startCoreRouteMap() {
      if (!routeMapContext || !coreReferenceRoutes.length || routeMapState !== "idle") return;
      completeCameraFlight();
      cancelPendingHover();
      routeMapRestoreDrift = drifting;
      routeMapRestoreCamera = { yaw, pitch, zoom, panX, panY };
      resetCamera();
      routeMapState = "building";
      routeMapBuildToken += 1;
      const token = routeMapBuildToken;
      routeMapBuildIndex = 0;
      routeMapDrawnCount = 0;
      setDrifting(false);
      setRouteMapControlsDisabled(true);
      routeMapCanvas.width = Math.max(1, Math.ceil(width));
      routeMapCanvas.height = Math.max(1, Math.ceil(height));
      routeMapContext.clearRect(0, 0, routeMapCanvas.width, routeMapCanvas.height);
      routeMapProjectionState = new Uint8Array(routeProjectionCount);
      routeMapProjectionX = new Float32Array(routeProjectionCount);
      routeMapProjectionY = new Float32Array(routeProjectionCount);
      routeMapMatrix = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      routeMapLineAlpha = clamp(.46 / Math.sqrt(Math.log2(coreReferenceRoutes.length + 1)), .08, .22);
      canvas.dataset.routeMapState = routeMapState;
      canvas.dataset.referenceRoutesProcessed = "0";
      canvas.dataset.referenceRoutesDrawn = "0";
      canvas.setAttribute("aria-busy", "true");
      coreRoutesButton.setAttribute("aria-busy", "true");
      coreRoutesButton.setAttribute("aria-pressed", "true");
      coreRoutesButton.setAttribute("aria-label", "Cancel Core route map build");
      coreRoutesButton.textContent = "Cancel";
      coreRoutesButton.title = `Cancel building ${coreRouteLabel()}`;
      routeModeStatus.hidden = false;
      routeModeStatus.textContent = `Building Core route map · 0 of ${coreReferenceRoutes.length.toLocaleString()} routes`;
      routeMapLastAnnouncement = performance.now();
      requestRender();
      routeMapBuildFrame = requestAnimationFrame(() => buildRouteMapChunk(token));
    }

    function setCoreRouteMap(next, focusButton = false) {
      if (Boolean(next) && coreReferenceRoutes.length > 0) startCoreRouteMap();
      else stopCoreRouteMap(focusButton);
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
      if (expandedPackageIndex === null) return;
      expandedPackageIndex = null;
      updateQaDrawCounts();
    }

    function clearSystemFocus() {
      if (focusedGroupIndex === null) return;
      const previous = focusedGroupIndex;
      focusedGroupIndex = null;
      if (systemFocusButtons[previous]) systemFocusButtons[previous].setAttribute("aria-pressed", "false");
      document.body.removeAttribute("data-focused-group-index");
      document.dispatchEvent(new CustomEvent("rubylens:core-system-focus", { detail: { groupIndex: null } }));
      updateQaDrawCounts();
    }

    function activateSystemRange(groupIndex, button = systemFocusButtons[groupIndex]) {
      focusedGroupIndex = groupIndex;
      if (button) button.setAttribute("aria-pressed", "true");
      document.body.dataset.focusedGroupIndex = String(groupIndex);
      document.dispatchEvent(new CustomEvent("rubylens:core-system-focus", { detail: { groupIndex } }));
      updateQaDrawCounts();
    }

    function clearExplorationFocus() {
      cancelCameraFlight();
      clearActiveFact();
      clearCategoryFocus();
      clearSystemFocus();
      clearExpandedPackage();
      selectPoint(null);
    }

    function setCategoryVisible(category, visible) {
      const changed = visibleCategories[category] !== visible;
      visibleCategories[category] = visible;
      if (visibilityInputs[category]) visibilityInputs[category].checked = visible;
      if (!visible && (selectedPoint?.category === category || focusedCategory === category)) clearExplorationFocus();
      else {
        if (changed) refreshSelectedRouteCache();
        updateRoutePanel();
      }
      requestRender();
    }

    function focusCategory(category) {
      if (focusedCategory === category) {
        clearExplorationFocus();
        return;
      }
      setCategoryVisible(category, true);
      clearActiveFact();
      clearSystemFocus();
      clearExpandedPackage();
      selectPoint(null);
      clearCategoryFocus();
      focusedCategory = category;
      focusButtons[category].setAttribute("aria-pressed", "true");
      focusButtons[category].textContent = "Focused";
      setDrifting(false);
      flyCamera({ yaw: -.36, pitch: .34, zoom: categoryMeta[category].focusZoom, panX: 0, panY: 0 });
    }

    function focusPoint(point, button = null) {
      if (button && activeFactButton === button) {
        clearExplorationFocus();
        return;
      }
      if (point.hub) {
        focusDependencyPackage(point.packageIndex, button, Boolean(button));
        return;
      }
      setCategoryVisible(point.category, true);
      clearActiveFact();
      clearSystemFocus();
      if (Number.isInteger(point.groupIndex)) activateSystemRange(point.groupIndex);
      clearExpandedPackage();
      if (button) {
        activeFactButton = button;
        activeFactButton.setAttribute("aria-pressed", "true");
      }
      clearCategoryFocus();
      setDrifting(false);
      selectedPoint = null;
      selectionLocked = false;
      selectPoint(point, true);
      flyCamera(topDownCameraTargetForPoint(point));
    }

    function focusSystem(groupIndex, button = systemFocusButtons[groupIndex]) {
      const hub = systemHubs.find(point => point.groupIndex === Number(groupIndex));
      if (!hub) return false;
      if (focusedGroupIndex === hub.groupIndex) {
        clearExplorationFocus();
        return true;
      }

      clearActiveFact();
      clearCategoryFocus();
      clearExpandedPackage();
      clearSystemFocus();
      activateSystemRange(hub.groupIndex, button);
      setDrifting(false);
      selectedPoint = null;
      selectionLocked = false;
      selectPoint(hub, true);
      flyCamera(cameraTargetForPoint(hub, clamp(32 / Math.max(hub.systemRadius, .1), 4, 30)));
      return true;
    }

    if (interactiveMode && groupedMode) {
      window.RubyLensCoreSystems = Object.freeze({
        focus: groupIndex => focusSystem(Number(groupIndex)),
        clear: () => { clearExplorationFocus(); return true; },
        range: groupIndex => model.groupRanges[Number(groupIndex)]?.slice() || null,
        selected: () => focusedGroupIndex,
        layout: model.explorerLayout,
      });
    }

    function focusDependencyPackage(packageIndex, button = null, topDown = false) {
      const hub = dependencyHubs.find(point => point.packageIndex === packageIndex);
      if (!hub) return false;

      setCategoryVisible("dependencies", true);
      clearActiveFact();
      clearSystemFocus();
      if (button) {
        activeFactButton = button;
        activeFactButton.setAttribute("aria-pressed", "true");
      }
      clearCategoryFocus();
      expandedPackageIndex = packageIndex;
      updateQaDrawCounts();
      setDrifting(false);
      selectedPoint = null;
      selectionLocked = false;
      selectPoint(hub, true);
      flyCamera(button || topDown ? topDownCameraTargetForPoint(hub, 4) : cameraTargetForPoint(hub, 4));
      return true;
    }

    function travelAlongRoute(entry) {
      const destination = entry.destination;
      if (destination.hub) focusDependencyPackage(destination.packageIndex, null, true);
      else focusPoint(destination);
      requestAnimationFrame(() => {
        const nextRoute = routeGroups.querySelector(".route-link");
        (nextRoute || routeSummary).focus({ preventScroll: true });
      });
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
        if (category === "core" && groupedMode && model.groupNames?.length) {
          const systems = document.createElement("section");
          systems.className = "systems-summary";
          const systemsTitle = document.createElement("h3");
          systemsTitle.textContent = "Core systems";
          const systemList = document.createElement("ol");
          const activeSystemIndexes = model.groups
            .map((row, index) => Number(row[1] || 0) + Number(row[2] || 0) + Number(row[3] || 0) > 0 ? index : null)
            .filter(Number.isInteger);
          activeSystemIndexes.slice(0, 16).forEach(index => {
            const name = model.groupNames[index];
            const row = model.groups[index];
            const item = document.createElement("li");
            const label = document.createElement("button");
            label.type = "button";
            label.setAttribute("aria-pressed", "false");
            label.setAttribute("aria-label", `Focus Core system ${name}`);
            label.textContent = name;
            systemFocusButtons[index] = label;
            label.addEventListener("click", () => focusSystem(index, label));
            const count = document.createElement("small");
            count.textContent = `${Number(row[1] || 0) + Number(row[3] || 0)} core · ${Number(row[2] || 0)} tests`;
            item.append(label, count);
            systemList.append(item);
          });
          systems.append(systemsTitle, systemList);
          if (activeSystemIndexes.length > 16) {
            const remainder = document.createElement("p");
            remainder.textContent = `${(activeSystemIndexes.length - 16).toLocaleString()} more systems`;
            systems.append(remainder);
          }
          body.append(systems);
        }
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

    function configureShowcaseStage() {
      if (!showcaseStage) return;
      const stageScale = SHOWCASE_PRESET.stageWidth / SHOWCASE_PRESET.layoutReferenceWidth;
      const textScale = SHOWCASE_PRESET.textScalePercent / 100;
      showcaseStage.style.width = `${SHOWCASE_PRESET.stageWidth}px`;
      showcaseStage.style.height = `${SHOWCASE_PRESET.stageHeight}px`;
      const masthead = showcaseStage.querySelector(".masthead");
      masthead.style.left = `${SHOWCASE_PRESET.mastheadLeft * stageScale}px`;
      masthead.style.top = `${SHOWCASE_PRESET.mastheadTop * stageScale}px`;
      masthead.style.width = `${SHOWCASE_PRESET.mastheadWidth / textScale}px`;
      masthead.style.transform = `scale(${stageScale * textScale})`;
    }

    function fitShowcaseStage() {
      if (!showcaseStage) return;
      const scale = Math.min(window.innerWidth / SHOWCASE_PRESET.stageWidth, window.innerHeight / SHOWCASE_PRESET.stageHeight);
      const fittedWidth = SHOWCASE_PRESET.stageWidth * scale;
      const fittedHeight = SHOWCASE_PRESET.stageHeight * scale;
      showcaseStage.style.left = `${(window.innerWidth - fittedWidth) / 2}px`;
      showcaseStage.style.top = `${(window.innerHeight - fittedHeight) / 2}px`;
      showcaseStage.style.transform = `scale(${scale})`;
      document.documentElement.dataset.showcaseStageScale = String(scale);
    }

    function resize() {
      if (showcaseMode) {
        dpr = 1;
        width = SHOWCASE_PRESET.stageWidth;
        height = SHOWCASE_PRESET.stageHeight;
        if (showcaseRenderer) showcaseRenderer.resize(width, height);
        else {
          const renderScale = configuredMobile() ? .75 : 1;
          canvas.width = Math.round(width * renderScale);
          canvas.height = Math.round(height * renderScale);
          context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
        }
        fitShowcaseStage();
        updateSceneViewport();
        updateQaDrawCounts();
        if (reducedMotionQuery.matches) applyShowcaseCamera(0);
        requestRender();
        return;
      }
      if (routeMapOpen()) stopCoreRouteMap();
      dpr = Math.min(window.devicePixelRatio || 1, configuredMobile() ? 1.25 : 2);
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateSceneViewport();
      updateQaDrawCounts();
      requestRender();
    }

    function updateSceneViewport() {
      if (showcaseMode) {
        sceneRight = width;
        sceneBottom = height;
        sceneCenterX = width * SHOWCASE_PRESET.centerXPercent / 100;
        sceneCenterY = height * SHOWCASE_PRESET.centerYPercent / 100;
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
      if (routeMapOpen()) {
        event.preventDefault();
        return true;
      }
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
      const atlas = groupedMode && interactiveMode && model.explorerLayout === "atlas";
      yaw = atlas ? 0 : -.36;
      pitch = atlas ? 0 : .34;
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

    function clipSegmentToScene(start, end, padding = 18) {
      const xMin = padding, xMax = sceneRight - padding;
      const yMin = padding, yMax = sceneBottom - padding;
      const dx = end[0] - start[0], dy = end[1] - start[1];
      let startTime = 0, endTime = 1;
      const boundaries = [
        [-dx, start[0] - xMin],
        [dx, xMax - start[0]],
        [-dy, start[1] - yMin],
        [dy, yMax - start[1]],
      ];
      for (const [direction, distance] of boundaries) {
        if (Math.abs(direction) < 1e-7) {
          if (distance < 0) return null;
          continue;
        }
        const time = distance / direction;
        if (direction < 0) {
          if (time > endTime) return null;
          startTime = Math.max(startTime, time);
        } else {
          if (time < startTime) return null;
          endTime = Math.min(endTime, time);
        }
      }
      return {
        start: [start[0] + dx * startTime, start[1] + dy * startTime],
        end: [start[0] + dx * endTime, start[1] + dy * endTime],
        startGated: startTime > .001,
        endGated: endTime < .999,
      };
    }

    function referenceRouteGeometry(route, matrix) {
      const projectedSource = project(route.source, matrix);
      const projectedTarget = project(route.target, matrix);
      if (!projectedSource || !projectedTarget) return null;
      const clipped = clipSegmentToScene(projectedSource, projectedTarget);
      if (!clipped) return null;
      const dx = clipped.end[0] - clipped.start[0];
      const dy = clipped.end[1] - clipped.start[1];
      const length = Math.hypot(dx, dy);
      if (length < 4) return null;

      const routeSeed = hash(route.source.seed, route.target.seed ^ 0x51a7);
      const side = unit(routeSeed, 31) < .5 ? -1 : 1;
      const bend = Math.min(48, length * (.08 + unit(routeSeed, 32) * .08)) * side;
      const middleX = (clipped.start[0] + clipped.end[0]) / 2;
      const middleY = (clipped.start[1] + clipped.end[1]) / 2;
      const control = [
        clamp(middleX - dy / length * bend, 12, sceneRight - 12),
        clamp(middleY + dx / length * bend, 12, sceneBottom - 12),
      ];
      return { ...clipped, control };
    }

    function drawRouteEndpoint(position, point, gated) {
      const colour = colours[point.category];
      context.beginPath();
      context.arc(position[0], position[1], gated ? 3.2 : 2.1, 0, Math.PI * 2);
      context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},.92)`;
      context.fill();
      if (gated) {
        context.beginPath();
        context.arc(position[0], position[1], 5.2, 0, Math.PI * 2);
        context.strokeStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},.48)`;
        context.lineWidth = 1;
        context.stroke();
      }
    }

    function drawRouteArrow(geometry, width) {
      const dx = geometry.end[0] - geometry.control[0];
      const dy = geometry.end[1] - geometry.control[1];
      const length = Math.hypot(dx, dy);
      if (length < 1) return;
      const ux = dx / length, uy = dy / length;
      const arrowLength = 5.5 + width;
      const arrowWidth = 3 + width * .45;
      const backX = geometry.end[0] - ux * arrowLength;
      const backY = geometry.end[1] - uy * arrowLength;
      context.beginPath();
      context.moveTo(geometry.end[0], geometry.end[1]);
      context.lineTo(backX - uy * arrowWidth, backY + ux * arrowWidth);
      context.lineTo(backX + uy * arrowWidth, backY - ux * arrowWidth);
      context.closePath();
      context.fillStyle = "rgba(225,239,255,.72)";
      context.fill();
    }

    function drawCoreRouteMap() {
      if (routeMapState !== "active" || routeMapCanvas.width === 0) return;
      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha = .92;
      context.drawImage(routeMapCanvas, 0, 0, width, height);
      context.restore();
    }

    function drawSelectedReferenceRoutes(matrix) {
      if (!selectionLocked || !selectedPoint || selectedPoint.systemHub || cameraFlight) return;
      const entries = selectedRouteEntries();
      if (!entries.length) return;

      context.save();
      context.globalCompositeOperation = "source-over";
      context.lineCap = "round";
      context.lineJoin = "round";
      for (const entry of entries) {
        const geometry = referenceRouteGeometry(entry.route, matrix);
        if (!geometry) continue;
        const width = .8 + Math.min(1.4, .35 * Math.log2(entry.route.count + 1));
        context.beginPath();
        context.moveTo(geometry.start[0], geometry.start[1]);
        context.quadraticCurveTo(geometry.control[0], geometry.control[1], geometry.end[0], geometry.end[1]);
        context.strokeStyle = "rgba(213,232,255,.36)";
        context.lineWidth = width;
        context.stroke();
        drawRouteEndpoint(geometry.start, entry.route.source, geometry.startGated);
        drawRouteEndpoint(geometry.end, entry.route.target, geometry.endGated);
        drawRouteArrow(geometry, width);
      }
      context.restore();
    }

    function renderShowcaseFallback() {
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "#03040a";
      context.fillRect(0, 0, width, height);
      const vignette = context.createRadialGradient(sceneCenterX, sceneCenterY, 0, sceneCenterX, sceneCenterY, Math.max(width, height) * .72);
      vignette.addColorStop(0, `rgba(30,16,45,${Math.min(.5, .18 * SHOWCASE_PRESET.backgroundGlowPercent / 100)})`);
      vignette.addColorStop(1, "rgba(0,0,0,.6)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const matrix = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      const deepDetail = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
      for (const [first, length] of visibleDrawRanges()) {
      for (let index = first; index < first + length; index += 1) {
        const point = renderPoints[index];
        const projected = project(point, matrix);
        if (!projected) continue;
        const [x, y, perspective] = projected;
        if (x < -20 || x > sceneRight + 20 || y < -20 || y > sceneBottom + 20) continue;
        const size = clamp(point.base * (.62 + point.signal * .46) * perspective, .35, point.systemHub ? 8 : point.hub ? 5.2 : 3.2);
        const alpha = clamp(.14 + point.signal * .105, .12, point.hub ? .86 : .7) * (groupedMode && point.category === "tests" && !point.systemHub ? .55 : 1) * SHOWCASE_PRESET.starBrightnessPercent / 100;
        const colour = colours[point.category];
        if (size > 1.35) {
          const mobileGlow = configuredMobile() ? .65 : 1;
          const glowScale = (3.4 - deepDetail * 1.3) * (.75 + .25 * SHOWCASE_PRESET.pointGlowPercent * mobileGlow / 100);
          context.beginPath();
          context.arc(x, y, size * glowScale, 0, Math.PI * 2);
          context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${alpha * .055 * SHOWCASE_PRESET.pointGlowPercent * mobileGlow / 100})`;
          context.fill();
        }
        context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${alpha})`;
        if (size < .85) context.fillRect(x, y, 1, 1);
        else {
          context.beginPath();
          context.arc(x, y, size, 0, Math.PI * 2);
          context.fill();
        }
        if (size > 1.1 && !configuredMobile() && !(groupedMode && point.category === "tests")) {
          context.beginPath();
          context.arc(x, y, Math.max(.45 + deepDetail * .25, size * (.24 + deepDetail * .06)), 0, Math.PI * 2);
          context.fillStyle = `rgba(255,248,244,${Math.min(.9, alpha * 1.25)})`;
          context.fill();
        }
      }}
      context.globalCompositeOperation = "source-over";
    }

    function render(timestamp) {
      animationFrame = 0;
      updateCameraFlight(timestamp);
      if (showcaseMode) {
        if (showcaseRenderer) showcaseRenderer.render();
        else renderShowcaseFallback();
        return;
      }
      if (interactiveMode) document.getElementById("zoom-level").value = `${Math.round(zoom * 100)}%`;
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "#03040a";
      context.fillRect(0, 0, width, height);
      const vignette = context.createRadialGradient(sceneCenterX + panX, sceneCenterY + panY, 0, sceneCenterX + panX, sceneCenterY + panY, Math.max(width, height) * .72);
      vignette.addColorStop(0, "rgba(30,16,45,.18)"); vignette.addColorStop(1, "rgba(0,0,0,.6)");
      context.fillStyle = vignette; context.fillRect(0, 0, width, height);
      const matrix = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      drawSelectedReferenceRoutes(matrix);
      context.globalCompositeOperation = "lighter";
      const deepDetail = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
      const drawRanges = routeMapOpen() ? [[0, renderPoints.length]] : visibleDrawRanges();
      for (const [first, length] of drawRanges) {
      for (let index = first; index < first + length; index += 1) {
        const point = renderPoints[index];
        point.screen = null;
        if (point.hub) point.cloudScreenRadius = null;
        if (!routeMapOpen() && !visibleCategories[point.category]) continue;
        const projected = project(point, matrix);
        if (!projected) continue;
        const [x, y, perspective] = projected;
        const cullMargin = point === selectedPoint ? 0 : 20;
        if (x < -cullMargin || x > sceneRight + cullMargin || y < -cullMargin || y > sceneBottom + cullMargin) continue;
        const signal = point.signal;
        const size = clamp(point.base * (.62 + signal * .46) * perspective, .35, point.systemHub ? 8 : point.hub ? 5.2 : 3.2);
        const focusedSystemTest = focusedGroupIndex !== null && point.groupIndex === focusedGroupIndex && point.category === "tests" && !point.systemHub;
        const alpha = clamp(.14 + signal * .105, .12, point.hub ? .86 : .7) * (focusedSystemTest ? .22 : groupedMode && point.category === "tests" && !point.systemHub ? .55 : 1);
        const focusedPackagePoint = expandedPackageIndex !== null && point.category === "dependencies" && point.packageIndex === expandedPackageIndex;
        const systemEmphasis = focusedGroupIndex !== null && Number.isInteger(point.groupIndex) && point.groupIndex !== focusedGroupIndex
          ? contextVisibility.system
          : 1;
        const selectionEmphasis = selectionLocked && selectedPoint
          ? (selectedPoint.systemHub ? 1 : point === selectedPoint ? 1 : contextVisibility.selection)
          : focusedCategory && point.category !== focusedCategory ? contextVisibility.category : 1;
        const emphasis = routeMapOpen()
          ? 1
          : (expandedPackageIndex !== null
            ? (focusedPackagePoint ? 1 : contextVisibility.package)
            : selectionEmphasis) * systemEmphasis;
        const visibleAlpha = focusedPackagePoint ? Math.max(.34, alpha) : alpha * emphasis;
        const colour = colours[point.category];
        point.screen = [x, y, size, perspective];
        if (point.hub) {
          const expansion = expandedPackageIndex === point.packageIndex ? DEPENDENCY_EXPANSION : 1;
          point.cloudScreenRadius = Math.max(12, packageAnchors[point.packageIndex][3] * perspective * expansion * 1.2);
        }
        const detailedPoint = point.systemHub || point.hub || (!routeMapOpen() && (expandedPackageIndex !== null ? focusedPackagePoint : emphasis >= .1));
        if (size > 1.35 && detailedPoint && !focusedSystemTest) {
          const glowScale = (focusedPackagePoint ? 2.2 - deepDetail * .8 : 3.4 - deepDetail * 1.3) * (configuredMobile() ? .7 : 1);
          context.beginPath(); context.arc(x, y, size * glowScale, 0, Math.PI * 2);
          context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${visibleAlpha * (focusedPackagePoint ? .045 : .055)})`; context.fill();
        }
        context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${visibleAlpha})`;
        if (!detailedPoint || size < .85) context.fillRect(x, y, 1, 1);
        else { context.beginPath(); context.arc(x, y, size, 0, Math.PI * 2); context.fill(); }
        if (size > 1.1 && detailedPoint && !configuredMobile() && !(groupedMode && point.category === "tests")) {
          context.beginPath(); context.arc(x, y, Math.max(.45 + deepDetail * .25, size * (.24 + deepDetail * .06)), 0, Math.PI * 2);
          context.fillStyle = `rgba(255,248,244,${Math.min(.9, visibleAlpha * 1.25)})`; context.fill();
        }
        if (point === selectedPoint) {
          context.beginPath(); context.arc(x, y, Math.max(7, size * 2.5), 0, Math.PI * 2);
          context.strokeStyle = "rgba(255,255,255,.95)"; context.lineWidth = 1.2; context.stroke();
          context.beginPath(); context.arc(x, y, Math.max(12, size * 4), 0, Math.PI * 2);
          context.strokeStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},.5)`; context.lineWidth = 1; context.stroke();
        }
      }}
      context.globalCompositeOperation = "source-over";
      drawCoreRouteMap();
      if (selectedPoint) {
        if (cameraFlight) tooltip.hidden = true;
        else positionTooltip(selectedPoint);
      }
      if (cameraFlight) requestRender();
      else if (interactiveMode && drifting && !dragging && !selectedPoint) { yaw += .00055; requestRender(); }
    }

    function requestRender() {
      if (!animationFrame) animationFrame = requestAnimationFrame(render);
    }

    function applyShowcaseCamera(progress) {
      const wrapped = ((Number(progress) % 1) + 1) % 1;
      const direction = SHOWCASE_PRESET.direction === "clockwise" ? 1 : -1;
      const phase = wrapped * Math.PI * 2 * SHOWCASE_PRESET.turns * direction;
      const viewportScale = Math.min(width / SHOWCASE_PRESET.layoutReferenceWidth, height / SHOWCASE_PRESET.layoutReferenceHeight);
      yaw = SHOWCASE_PRESET.startAngleDegrees * Math.PI / 180 + phase;
      pitch = (SHOWCASE_PRESET.elevationDegrees + Math.sin(phase) * SHOWCASE_PRESET.elevationSwayDegrees) * Math.PI / 180;
      zoom = SHOWCASE_PRESET.zoom * (1 + ((1 - Math.cos(phase)) / 2) * SHOWCASE_PRESET.zoomBreathPercent / 100) * viewportScale;
      panX = 0;
      panY = 0;
    }

    function renderShowcase(timestamp) {
      showcaseStartedAt ??= timestamp;
      const frameCount = SHOWCASE_PRESET.targetFps * SHOWCASE_PRESET.durationMs / 1000;
      const rawProgress = ((timestamp - showcaseStartedAt) % SHOWCASE_PRESET.durationMs) / SHOWCASE_PRESET.durationMs;
      const progress = Math.floor(rawProgress * frameCount) / frameCount;
      applyShowcaseCamera(progress);
      render(timestamp);
      document.documentElement.dataset.showcaseReady = "true";
      if (!reducedMotionQuery.matches) animationFrame = requestAnimationFrame(renderShowcase);
    }

    function startShowcase() {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      showcaseStartedAt = null;
      if (reducedMotionQuery.matches) {
        applyShowcaseCamera(0);
        render(performance.now());
        document.documentElement.dataset.showcaseReady = "true";
        document.documentElement.dataset.showcaseMotion = "reduced";
      } else {
        document.documentElement.dataset.showcaseMotion = "active";
        animationFrame = requestAnimationFrame(renderShowcase);
      }
    }

    function populateShowcaseStats() {
      const core = model.categoryStats?.core || [0, 0, 0, 0];
      const tests = model.categoryStats?.tests || [0, 0, 0, 0];
      const format = value => Number(value || 0).toLocaleString("en-US");
      const counted = (value, singular, plural) => `${format(value)} ${Number(value || 0) === 1 ? singular : plural}`;
      ["classes", "modules", "methods", "constants"].forEach((metric, index) => {
        document.getElementById(`cinema-${metric}`).textContent = format(core[index]);
      });
      if (groupedMode) {
        const coreSystemCount = model.groups.filter(row => Number(row[1] || 0) + Number(row[2] || 0) + Number(row[3] || 0) > 0).length;
        document.querySelector(".eyebrow").textContent = "RubyLens · Core systems";
        document.getElementById("cinema-secondary").textContent = `Core systems · ${format(coreSystemCount)}   ·   Tests · ${counted(tests[0], "class", "classes")} · ${counted(tests[2], "method", "methods")}   ·   ${counted(totals.packages, "dependency gem", "dependency gems")} in orbit`;
      } else {
        document.getElementById("cinema-secondary").textContent = `Tests · ${counted(tests[0], "class", "classes")} · ${counted(tests[2], "method", "methods")}   ·   ${counted(totals.packages, "dependency gem", "dependency gems")} in orbit`;
      }
    }

    function setDrifting(next) {
      if (next && routeMapOpen()) return;
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
    if (interactiveMode) {
    canvas.addEventListener("pointerdown", event => {
      if (routeMapOpen()) {
        event.preventDefault();
        return;
      }
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
        else if (point?.systemHub) focusSystem(point.groupIndex);
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
      if (routeMapOpen() || pointers.size > 0) return;
      cancelCameraFlight();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      zoomBetween(zoom * Math.exp(-delta * .0012), event.clientX, event.clientY);
      requestRender();
    }, { passive: false });
    canvas.addEventListener("dblclick", event => {
      if (routeMapOpen() || pointers.size > 0) return;
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
      if (routeMapOpen()) {
        if (routeMapMutationKeys.has(event.key.toLowerCase())) event.preventDefault();
        return;
      }
      if (event.key === "+" || event.key === "=") { cancelCameraFlight(); zoomBetween(zoom * ZOOM_STEP, sceneCenterX, sceneCenterY); }
      else if (event.key === "-") { cancelCameraFlight(); zoomBetween(zoom / ZOOM_STEP, sceneCenterX, sceneCenterY); }
      else if (event.key === "0") { cancelCameraFlight(); resetCamera(); }
      else if (event.key.toLowerCase() === "p") { cancelCameraFlight(); setNavigationMode(navigationMode === "pan" ? "orbit" : "pan"); }
      else if ((event.key === "Enter" || event.key.toLowerCase() === "f") && selectedPoint?.systemHub) focusSystem(selectedPoint.groupIndex);
      else if ((event.key === "Enter" || event.key.toLowerCase() === "f") && selectedPoint?.category === "dependencies") focusDependencyPackage(selectedPoint.packageIndex);
      else return;
      event.preventDefault();
      requestRender();
    });
    window.addEventListener("keydown", event => {
      if (event.key === "Escape" && routeMapOpen()) {
        event.preventDefault();
        setCoreRouteMap(false, true);
      } else if (event.key === "Escape") clearExplorationFocus();
      else moveViewWithArrow(event);
    });
    document.getElementById("motion").addEventListener("click", () => setDrifting(!drifting));
    document.getElementById("pan-mode").addEventListener("click", () => { cancelCameraFlight(); setNavigationMode(navigationMode === "pan" ? "orbit" : "pan"); });
    document.getElementById("zoom-in").addEventListener("click", () => { if (pointers.size === 0) { cancelCameraFlight(); zoomBetween(zoom * ZOOM_STEP, sceneCenterX, sceneCenterY); } requestRender(); });
    document.getElementById("zoom-out").addEventListener("click", () => { if (pointers.size === 0) { cancelCameraFlight(); zoomBetween(zoom / ZOOM_STEP, sceneCenterX, sceneCenterY); } requestRender(); });
    document.getElementById("view").addEventListener("click", () => {
      cancelCameraFlight();
      setCoreRouteMap(false);
      resetCamera();
      setNavigationMode("orbit");
      for (const category of Object.keys(visibleCategories)) setCategoryVisible(category, true);
      clearExplorationFocus();
      requestRender();
    });
    coreRoutesButton.addEventListener("click", () => setCoreRouteMap(!routeMapOpen()));
    panelToggle.addEventListener("click", () => setPanelCollapsed(panelToggle.getAttribute("aria-expanded") === "true"));
    panel.addEventListener("transitionend", event => { if (event.propertyName === "width") { updateSceneViewport(); requestRender(); } });
    reducedMotionQuery.addEventListener("change", event => {
      if (!event.matches) return;
      completeCameraFlight();
      setDrifting(false);
    });
    coarsePointerQuery.addEventListener("change", () => {
      refreshSelectedRouteCache();
      updateRoutePanel();
      requestRender();
    });
    }

    window.addEventListener("resize", resize);
    document.querySelector("h1").textContent = model.projectName;
    if (showcaseMode) {
      document.title = `${model.projectName} · RubyLens showcase`;
      const showcaseLabel = `Autonomous stellar artwork of ${model.projectName}, completing one slow rotation each minute.`;
      canvas.setAttribute("aria-label", showcaseLabel);
      document.getElementById("showcase-cosmos")?.setAttribute("aria-label", showcaseLabel);
      populateShowcaseStats();
      reducedMotionQuery.addEventListener("change", startShowcase);
      configureShowcaseStage();
      resize();
      startShowcase();
    } else {
      document.title = `RubyLens · ${model.projectName}`;
      canvas.setAttribute("aria-label", `Interactive three-dimensional stellar artwork of ${model.projectName}. Hover class and module stars for Ruby code details or gem clouds for package summaries. Select a star or gem to reveal its strongest resolved constant-reference routes; route destinations are also available as buttons in the explorer, and the Core routes control builds a frozen map of routes touching Core code. Sidebar highlights open a top-down view. Double-click a gem cloud, press Enter or F on a selected gem marker, or tap that marker again to expand its stars. Drag to orbit, Shift-drag or Pan mode to move, scroll or pinch to zoom at a point, and use arrow keys to move the view. Escape exits focused exploration or the Core route map.`);
      document.getElementById("coverage").textContent = `${renderedDependencyStars.toLocaleString()} dependency stars shown`;
      const warningTotal = Object.values(model.warningCounts).reduce((sum, count) => sum + count, 0);
      if (warningTotal > 0) { const status = document.getElementById("status"); status.hidden = false; status.textContent = `${warningTotal.toLocaleString()} partial-index warning${warningTotal === 1 ? "" : "s"}`; }
      coreRoutesButton.disabled = coreReferenceRoutes.length === 0 || !routeMapContext;
      setCoreRouteMap(false);
      resetCamera();
      setDrifting(drifting);
      setNavigationMode(navigationMode);
      createExplorer();
      setPanelCollapsed(window.matchMedia("(max-width: 760px)").matches);
      resize();
    }
