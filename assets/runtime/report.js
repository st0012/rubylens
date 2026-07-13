    "use strict";
    const model = JSON.parse(atob("{{MODEL_BASE64}}"));
    const showcaseMode = document.body.dataset.rubylensMode === "showcase";
    const interactiveMode = !showcaseMode;
    const scaleAdaptiveMode = model.schema === "rubylens.art.v9" || model.schema === "rubylens.showcase.v3";
    if (!scaleAdaptiveMode) throw new Error("RubyLens requires the unified art.v9 visual contract");
    const configuredRegions = interactiveMode && Array.isArray(model.regionNames);
    document.body.classList.add("has-scale-adaptive-core");
    const qaMode = window.__RUBYLENS_QA__ === true;
    const canvas = document.getElementById("cosmos");
    const context = canvas.getContext("2d", { alpha: showcaseMode ? false : true });
    const showcaseStage = document.getElementById("showcase-stage");
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
    const frameworkReference = interactiveMode ? model.frameworkReference : null;
    const signalWeights = {
      core: { ancestorDepth: .28, definitionSites: .2, reopenings: .18, descendants: .72, references: .82, members: .7 },
      tests: { ancestorDepth: .18, definitionSites: .25, reopenings: .18, descendants: .42, references: .85, members: .55 },
      dependencies: { ancestorDepth: .12, definitionSites: .35, reopenings: .2, descendants: .32, references: .48, members: .4 },
    };
    let width = 0, height = 0, dpr = 1, sceneRight = 0, sceneBottom = 0, sceneCenterX = 0, sceneCenterY = 0, yaw = -.36, pitch = .34, zoom = 1, panX = 0, panY = 0, dragging = false, gesture = null, pinchState = null, animationFrame = 0, hoverFrame = 0, pendingHover = null, selectedPoint = null, selectionLocked = false, focusedCategory = null, focusedGroupIndex = null, expandedPackageIndex = null, activeFactButton = null, navigationMode = "orbit", cameraFlight = null, showcaseStartedAt = null, sceneRenderer = null, railsComparisonEnabled = false, railsComparisonNotice = "", railsReferenceVisible = null, railsReferenceToggle = null, railsReferenceStatus = null, railsReferenceMetrics = null;
    const MIN_ZOOM = .35, MAX_ZOOM = 40, ZOOM_STEP = 1.7, DEPENDENCY_EXPANSION = 2.35, SHOWCASE_POINT_LIMIT = 50_000, OVERVIEW_PICK_LIMIT = 4_000, FOCUSED_PICK_LIMIT = 12_000;
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
    const contextVisibility = { selection: .75, category: .16, package: .75, system: .75 };
    const pointers = new Map();
    const visibleCategories = { core: true, tests: true, dependencies: true };
    const visibilityInputs = {};
    const focusButtons = {};
    const systemFocusButtons = {};
    const excludedTriviaNames = new Set(["Object", "Kernel", "BasicObject"]);
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const configuredMobile = () => Math.min(window.innerWidth, window.innerHeight) <= 430;
    let drifting = interactiveMode && !reducedMotionQuery.matches;
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

    const workspaceRadius = model.workspaceRadius / 1000;
    const cameraDistance = 230 + workspaceRadius * .9;
    const cameraFocal = 440;
    const regionBounds = model.regionBounds.map(([start, finish, inner, outer]) => [start / 1_000_000, finish / 1_000_000, inner / 1000, outer / 1000]);
    const regionCentroids = model.regionCentroids.map(row => row.map(value => value / 1000));
    const regionRadii = regionBounds.map(([start, finish, _inner, outer]) => outer * Math.sqrt(Math.max(0, finish - start) / (Math.PI * 2)));
    const groups = model.regions;
    const groupRanges = model.regionRanges;
    const groupLods = model.regionLods;
    const groupAnchors = regionCentroids;
    const groupRadii = regionRadii;
    const groupNames = model.regionNames || [];

    function circularBlend(left, right, mix) {
      const delta = Math.atan2(Math.sin(right - left), Math.cos(right - left));
      return left + delta * mix;
    }

    function workspaceNamespacePosition(row) {
      const seed = row[0];
      const regionIndex = row[1];
      const tests = row[3] === 1;
      const bounds = regionBounds[regionIndex] || [0, Math.PI * 2, 0, workspaceRadius];
      const span = Math.max(0, bounds[1] - bounds[0]);
      const bulge = !tests && unit(seed, 2) < .1;
      const radial = tests
        ? workspaceRadius * (.7 + .34 * Math.pow(unit(seed, 7), .7))
        : bulge
          ? workspaceRadius * (.05 + .3 * Math.pow(unit(seed, 3), .72))
          : workspaceRadius * (.12 + .86 * Math.pow(unit(seed, 3), .54));
      const armCount = 4;
      const arm = Math.floor(unit(seed, 4) * armCount);
      const armTheta = arm * Math.PI * 2 / armCount + radial / Math.max(workspaceRadius, 1) * 3.7 + normal(seed, 5) * (tests ? .16 : .22);
      const sectorTheta = bounds[0] + span * unit(seed, 6);
      const sectorMix = configuredRegions || showcaseMode ? .58 : .18;
      const theta = circularBlend(armTheta, sectorTheta, sectorMix) + normal(seed, 12) * Math.min(.2, span * .12);
      const verticalScale = tests
        ? .025 + radial * .018
        : bulge ? workspaceRadius * .11 : .035 + radial * .012;
      const vertical = normal(seed, tests ? 11 : 8) * verticalScale;
      return [Math.cos(theta) * radial, vertical, Math.sin(theta) * radial];
    }

    const packageAnchors = model.packages.map((row, index) => {
      const seed = row[0];
      const cloudRadius = 1.6 + Math.min(9, Math.sqrt(row[3]) * .055);
      const radius = workspaceRadius + cloudRadius + 14 + Math.max(28, workspaceRadius * .72) * Math.pow(unit(seed, 14), .7);
      const theta = unit(seed, 15) * Math.PI * 2;
      const vertical = normal(seed, 16) * Math.min(24, 5 + workspaceRadius * .16);
      return [Math.cos(theta) * radius, vertical, Math.sin(theta) * radius, cloudRadius, index];
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
      const namespacePoints = [];
      const interactivePoints = [];
      const dependencyHubs = [];
      const systemHubs = [];
      const namespaceLods = Array(model.namespaces.length).fill(2);
      if (scaleAdaptiveMode) {
        groupRanges.forEach(([first, length], groupIndex) => {
          const midLength = groupLods[groupIndex][0];
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
        const representedWeight = Number(row[15] || 1);
        const densityLift = Math.log1p(representedWeight) / Math.log1p(Math.max(1, model.workspaceDensity[5] || 1));
        const point = { category, groupIndex: row[1], sourceIndex: index, lod: namespaceLods[index], seed: row[0], position: workspaceNamespacePosition(row), signal: weightedSignal(normalizedSignals(values), category), base: (category === "core" ? .7 : .46) * (.88 + densityLift * .24), representedWeight };
        if (interactiveMode) Object.assign(point, { name: model.namespaceNames[index], groupName: groupNames[row[1]] || null, kind: row[2] === 0 ? "Class" : "Module", rubyCounts, instanceVariableCount: row[14] || 0, values });
        namespacePoints.push(point);
        addPoint(point);
      });
      if (configuredRegions) {
        groups.forEach((row, groupIndex) => {
          const coreCount = Number(row[1] || 0) + Number(row[3] || 0);
          const testCount = Number(row[2] || 0);
          if (coreCount + testCount === 0) return;
          const point = {
            category: coreCount > 0 ? "core" : "tests",
            groupIndex,
            lod: 0,
            seed: hash(groupIndex + 1, 34),
            position: regionCentroids[groupIndex],
            signal: .5,
            base: .8 + Math.min(1.6, regionRadii[groupIndex] * .08),
            systemHub: true,
            systemRadius: regionRadii[groupIndex],
          };
          if (interactiveMode) Object.assign(point, {
            name: groupNames[groupIndex],
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
        addPoint({ category: "dependencies", lod: 1, packageIndex: row[1], seed: row[0], position: dependencyPosition(row[0], row[1]), signal: weightedSignal(normalizedSignals(values), "dependencies"), base: .45 }, false);
      });
      packageAnchors.forEach((anchor, index) => {
        const packageRow = model.packages[index];
        const rubyCounts = packageRow.slice(4, 8);
        const visualValues = [0, packageRow[3], 0, 0, 0, 0];
        const point = { category: "dependencies", lod: 0, packageIndex: index, seed: packageRow[0], position: anchor.slice(0, 3), signal: weightedSignal(normalizedSignals(visualValues), "dependencies"), base: 1.8, hub: true };
        if (interactiveMode) Object.assign(point, { name: model.packageNames[index], packageRole: packageRow[1] === 0 ? "Direct dependency" : "Transitive dependency", packageLocation: packageRow[2] === 0 ? "Workspace package" : "External gem", rubyCounts });
        addPoint(point);
      });
      return { points, namespacePoints, interactivePoints, dependencyHubs, systemHubs };
    }
    const { points, namespacePoints, interactivePoints, dependencyHubs, systemHubs } = buildPoints();
    const frameworkLandmark = frameworkReference?.kind === "rails"
      ? dependencyHubs.find(point => point.packageIndex === frameworkReference.packageIndex)
      : null;
    document.documentElement.dataset.rubylensRailsLandmark = String(Boolean(frameworkLandmark));
    function boundedRangeSample(candidates, first, length, limit) {
      const available = Math.max(0, Math.min(length, candidates.length - first));
      if (available <= limit) return candidates.slice(first, first + available);
      const sampled = new Array(limit);
      const step = available / limit;
      const offset = unit(available ^ first, 74) * step;
      for (let index = 0; index < limit; index += 1) sampled[index] = candidates[first + Math.floor(offset + index * step)];
      return sampled;
    }
    const overviewPickPoints = boundedRangeSample(namespacePoints, 0, namespacePoints.length, OVERVIEW_PICK_LIMIT)
      .concat(dependencyHubs, systemHubs);
    function showcasePointSample() {
      if (!showcaseMode || points.length <= SHOWCASE_POINT_LIMIT) return points;
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
    const renderPoints = sampledPoints.slice().sort((left, right) => left.lod - right.lod || left.renderOrder - right.renderOrder);
    const firstMidPoint = renderPoints.findIndex(point => point.lod > 0);
    const farPointCount = firstMidPoint < 0 ? renderPoints.length : firstMidPoint;
    const firstNearPoint = renderPoints.findIndex(point => point.lod > 1);
    const midPointCount = firstNearPoint < 0 ? renderPoints.length : firstNearPoint;
    const firstFaintDependency = renderPoints.findIndex(point => point.lod === 1 && point.category === "dependencies" && !point.hub);
    const essentialMidPointCount = firstFaintDependency < 0 ? midPointCount : Math.min(midPointCount, firstFaintDependency);
    const groupNearDrawRanges = groups.map(() => [0, 0]);
    const groupMidDrawRanges = groups.map(() => [0, 0]);
    const packageMidDrawRanges = model.packages.map(() => []);
    if (scaleAdaptiveMode) {
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
      const basePointCount = configuredMobile() ? essentialMidPointCount : midPointCount;
      if (focusedGroupIndex !== null) {
        const mid = groupMidDrawRanges[focusedGroupIndex] || [0, 0];
        const near = groupNearDrawRanges[focusedGroupIndex] || [0, 0];
        return [[0, farPointCount], mid, near].filter(range => range[1] > 0);
      }
      const overviewCount = basePointCount;
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
      if (!qaMode) return;
      const ranges = visibleDrawRanges();
      document.documentElement.dataset.rubylensRetainedPoints = String(renderPoints.length);
      document.documentElement.dataset.rubylensRenderedPoints = String(ranges.reduce((sum, range) => sum + range[1], 0));
      document.documentElement.dataset.rubylensDrawRanges = JSON.stringify(ranges);
      document.documentElement.dataset.rubylensFarPoints = String(farPointCount);
      document.documentElement.dataset.rubylensMidPoints = String(midPointCount);
      document.documentElement.dataset.rubylensEssentialMidPoints = String(essentialMidPointCount);
      document.documentElement.dataset.rubylensSelectedRangePoints = focusedGroupIndex === null ? "0" : String(groupRanges[focusedGroupIndex][1]);
      document.documentElement.dataset.rubylensSelectedMidPoints = focusedGroupIndex === null ? "0" : String(groupMidDrawRanges[focusedGroupIndex][1]);
      document.documentElement.dataset.rubylensSelectedNearPoints = focusedGroupIndex === null ? "0" : String(groupNearDrawRanges[focusedGroupIndex][1]);
      document.documentElement.dataset.rubylensCpuProjectionLimit = String(focusedGroupIndex === null ? OVERVIEW_PICK_LIMIT : FOCUSED_PICK_LIMIT);
      document.documentElement.dataset.rubylensCpuProjectedPoints = String(activePickingPoints().length);
    }
    if (qaMode) {
      document.documentElement.dataset.rubylensNamespacePoints = String(model.namespaces.length);
      document.documentElement.dataset.rubylensRangePoints = String(groupRanges.reduce((sum, range) => sum + range[1], 0));
      document.documentElement.dataset.rubylensWorkspaceRadius = workspaceRadius.toFixed(3);
      let minimumCentroidDistance = Infinity;
      const activeGroupIndexes = groups.map((row, index) => Number(row[1] || 0) + Number(row[2] || 0) + Number(row[3] || 0) > 0 ? index : null).filter(Number.isInteger);
      for (let leftRank = 0; leftRank < activeGroupIndexes.length; leftRank += 1) {
        const leftIndex = activeGroupIndexes[leftRank];
        const left = groupAnchors[leftIndex];
        for (let rightRank = leftRank + 1; rightRank < activeGroupIndexes.length; rightRank += 1) {
          const rightIndex = activeGroupIndexes[rightRank];
          const right = groupAnchors[rightIndex];
          minimumCentroidDistance = Math.min(minimumCentroidDistance, Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]));
        }
      }
      const hostDistances = { core: { sum: 0, count: 0 }, tests: { sum: 0, count: 0 } };
      let minimumDependencyRadius = Infinity;
      let minimumDependencyProjectedRadius = Infinity;
      for (const point of points) {
        if (Number.isInteger(point.groupIndex) && !point.systemHub) {
          hostDistances[point.category].sum += Math.hypot(point.position[0], point.position[1], point.position[2]);
          hostDistances[point.category].count += 1;
        } else if (point.category === "dependencies") {
          minimumDependencyRadius = Math.min(minimumDependencyRadius, Math.hypot(point.position[0], point.position[1], point.position[2]));
          minimumDependencyProjectedRadius = Math.min(minimumDependencyProjectedRadius, Math.hypot(point.position[0], point.position[1]));
        }
      }
      document.documentElement.dataset.rubylensCentroidSeparation = Number.isFinite(minimumCentroidDistance) ? minimumCentroidDistance.toFixed(3) : "0";
      document.documentElement.dataset.rubylensCoreMeanRadius = (hostDistances.core.sum / Math.max(1, hostDistances.core.count)).toFixed(3);
      document.documentElement.dataset.rubylensTestMeanRadius = (hostDistances.tests.sum / Math.max(1, hostDistances.tests.count)).toFixed(3);
      document.documentElement.dataset.rubylensDependencyMargin = Number.isFinite(minimumDependencyRadius) ? (minimumDependencyRadius - workspaceRadius).toFixed(3) : "0";
      document.documentElement.dataset.rubylensDependencyProjectedMargin = Number.isFinite(minimumDependencyProjectedRadius) ? (minimumDependencyProjectedRadius - workspaceRadius).toFixed(3) : "0";
      updateQaDrawCounts();
    }

    function createSceneRenderer() {
      const liveCanvas = document.createElement("canvas");
      liveCanvas.id = "rubylens-cosmos";
      liveCanvas.setAttribute("aria-hidden", "true");
      liveCanvas.style.pointerEvents = "none";
      liveCanvas.style.zIndex = "0";
      canvas.style.zIndex = "1";
      canvas.insertAdjacentElement("beforebegin", liveCanvas);
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
        document.documentElement.dataset.rubylensRenderer = "canvas2d-fallback";
        if (showcaseMode) document.documentElement.dataset.showcaseRenderer = "canvas2d-fallback";
        return null;
      }
      liveCanvas.addEventListener("webglcontextlost", event => {
        event.preventDefault();
        liveCanvas.remove();
        sceneRenderer = null;
        canvas.style.display = "";
        document.documentElement.dataset.rubylensRenderer = "canvas2d-fallback";
        document.documentElement.dataset.rubylensRendererError = "webgl-context-lost";
        if (showcaseMode) document.documentElement.dataset.showcaseRenderer = "canvas2d-fallback";
        requestRender();
      }, { once: true });

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
        uniform float u_hazeStrength;
        uniform float u_hazeTestMix;
        uniform float u_hazeRadius;
        out vec4 outColor;
        void main() {
          vec2 pixel = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
          float radius = max(u_resolution.x, u_resolution.y) * 0.72;
          float distanceMix = clamp(distance(pixel, u_center) / radius, 0.0, 1.0);
          vec3 base = vec3(3.0, 4.0, 10.0) / 255.0;
          vec3 source = mix(vec3(30.0, 16.0, 45.0) / 255.0, vec3(0.0), distanceMix);
          float centerAlpha = min(0.5, 0.18 * u_backgroundGlow / 100.0);
          float alpha = mix(centerAlpha, 0.6, distanceMix);
          float hostDistance = distance(pixel, u_center) / max(1.0, u_hazeRadius);
          float hostField = (1.0 - smoothstep(0.08, 1.1, hostDistance)) * u_hazeStrength;
          vec3 hostColour = mix(vec3(244.0, 82.0, 132.0), vec3(87.0, 204.0, 255.0), u_hazeTestMix) / 255.0;
          outColor = vec4(mix(base, source, alpha) + hostColour * hostField * 0.055, 1.0);
        }
      `);

      const pointProgram = createProgram(`#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in float a_sizeFactor;
        layout(location = 2) in float a_alpha;
        layout(location = 3) in float a_category;
        layout(location = 4) in float a_maxSize;
        layout(location = 5) in float a_groupIndex;
        layout(location = 6) in float a_packageIndex;
        layout(location = 7) in vec3 a_packageAnchor;
        uniform vec2 u_resolution;
        uniform vec2 u_center;
        uniform float u_yaw;
        uniform float u_pitch;
        uniform float u_zoom;
        uniform float u_cameraDistance;
        uniform float u_cameraFocal;
        uniform float u_brightness;
        uniform float u_glow;
        uniform float u_deepDetail;
        uniform int u_grouped;
        uniform int u_pass;
        uniform vec3 u_visibility;
        uniform float u_focusedGroup;
        uniform float u_focusedPackage;
        uniform float u_focusedCategory;
        uniform float u_dependencyExpansion;
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
          vec3 position = a_position;
          if (u_focusedPackage >= 0.0 && abs(a_packageIndex - u_focusedPackage) < 0.5) {
            position = a_packageAnchor + (position - a_packageAnchor) * u_dependencyExpansion;
          }
          float cy = cos(u_yaw);
          float sy = sin(u_yaw);
          float cp = cos(u_pitch);
          float sp = sin(u_pitch);
          float x1 = position.x * cy - position.z * sy;
          float z1 = position.x * sy + position.z * cy;
          float y2 = position.y * cp - z1 * sp;
          float z2 = position.y * sp + z1 * cp;
          float depth = u_cameraDistance - z2;
          if (depth <= 35.0) { hidePoint(); return; }

          float perspective = u_cameraFocal / depth * u_zoom;
          vec2 screen = u_center + vec2(x1, y2) * perspective;
          if (screen.x < -20.0 || screen.x > u_resolution.x + 20.0 || screen.y < -20.0 || screen.y > u_resolution.y + 20.0) {
            hidePoint();
            return;
          }

          float size = clamp(a_sizeFactor * perspective, 0.35, a_maxSize);
          int categoryIndex = int(a_category + 0.5);
          float visibleAlpha = clamp(a_alpha * u_brightness / 100.0, 0.0, 1.0) * u_visibility[categoryIndex];
          if (u_focusedCategory >= 0.0 && abs(a_category - u_focusedCategory) >= 0.5) visibleAlpha *= 0.72;
          if (u_focusedGroup >= 0.0 && a_groupIndex >= 0.0 && abs(a_groupIndex - u_focusedGroup) >= 0.5) visibleAlpha *= 0.78;
          if (u_focusedPackage >= 0.0 && a_packageIndex >= 0.0 && abs(a_packageIndex - u_focusedPackage) >= 0.5) visibleAlpha *= 0.78;
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

      const pointData = new Float32Array(renderPoints.length * 12);
      const categoryIndex = { core: 0, tests: 1, dependencies: 2 };
      renderPoints.forEach((point, index) => {
        const offset = index * 12;
        pointData[offset] = point.position[0];
        pointData[offset + 1] = point.position[1];
        pointData[offset + 2] = point.position[2];
        pointData[offset + 3] = point.base * (.62 + point.signal * .46);
        pointData[offset + 4] = clamp(.11 + point.signal * .09, .09, point.hub ? .76 : .58) * (point.category === "tests" && !point.systemHub ? .68 : 1);
        pointData[offset + 5] = categoryIndex[point.category];
        pointData[offset + 6] = point.systemHub ? 8 : point.hub ? 5.2 : 3.2;
        pointData[offset + 7] = Number.isInteger(point.groupIndex) ? point.groupIndex : -1;
        pointData[offset + 8] = Number.isInteger(point.packageIndex) ? point.packageIndex : -1;
        const packageAnchor = Number.isInteger(point.packageIndex) ? packageAnchors[point.packageIndex] : null;
        pointData[offset + 9] = packageAnchor?.[0] || 0;
        pointData[offset + 10] = packageAnchor?.[1] || 0;
        pointData[offset + 11] = packageAnchor?.[2] || 0;
      });

      const pointVao = gl.createVertexArray();
      const pointBuffer = gl.createBuffer();
      gl.bindVertexArray(pointVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.STATIC_DRAW);
      const stride = 12 * Float32Array.BYTES_PER_ELEMENT;
      [[0, 3, 0], [1, 1, 3], [2, 1, 4], [3, 1, 5], [4, 1, 6], [5, 1, 7], [6, 1, 8], [7, 3, 9]].forEach(([location, size, offset]) => {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
      });
      gl.bindVertexArray(null);

      const backgroundUniforms = {
        resolution: gl.getUniformLocation(backgroundProgram, "u_resolution"),
        center: gl.getUniformLocation(backgroundProgram, "u_center"),
        backgroundGlow: gl.getUniformLocation(backgroundProgram, "u_backgroundGlow"),
        hazeStrength: gl.getUniformLocation(backgroundProgram, "u_hazeStrength"),
        hazeTestMix: gl.getUniformLocation(backgroundProgram, "u_hazeTestMix"),
        hazeRadius: gl.getUniformLocation(backgroundProgram, "u_hazeRadius"),
      };
      const pointUniforms = {
        resolution: gl.getUniformLocation(pointProgram, "u_resolution"),
        center: gl.getUniformLocation(pointProgram, "u_center"),
        yaw: gl.getUniformLocation(pointProgram, "u_yaw"),
        pitch: gl.getUniformLocation(pointProgram, "u_pitch"),
        zoom: gl.getUniformLocation(pointProgram, "u_zoom"),
        cameraDistance: gl.getUniformLocation(pointProgram, "u_cameraDistance"),
        cameraFocal: gl.getUniformLocation(pointProgram, "u_cameraFocal"),
        brightness: gl.getUniformLocation(pointProgram, "u_brightness"),
        glow: gl.getUniformLocation(pointProgram, "u_glow"),
        deepDetail: gl.getUniformLocation(pointProgram, "u_deepDetail"),
        grouped: gl.getUniformLocation(pointProgram, "u_grouped"),
        pass: gl.getUniformLocation(pointProgram, "u_pass"),
        visibility: gl.getUniformLocation(pointProgram, "u_visibility"),
        focusedGroup: gl.getUniformLocation(pointProgram, "u_focusedGroup"),
        focusedPackage: gl.getUniformLocation(pointProgram, "u_focusedPackage"),
        focusedCategory: gl.getUniformLocation(pointProgram, "u_focusedCategory"),
        dependencyExpansion: gl.getUniformLocation(pointProgram, "u_dependencyExpansion"),
      };
      const pointSizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      document.documentElement.dataset.rubylensRenderer = "webgl2";
      if (showcaseMode) document.documentElement.dataset.showcaseRenderer = "webgl2";
      document.documentElement.dataset.pointSizeRange = `${pointSizeRange[0]},${pointSizeRange[1]}`;
      if (showcaseMode) canvas.style.display = "none";

      let renderScale = 1;
      return Object.freeze({
        resize(viewportWidth, viewportHeight) {
          renderScale = showcaseMode ? (configuredMobile() ? .75 : 1) : Math.min(dpr, configuredMobile() ? 1.1 : 1.5);
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
          gl.uniform2f(backgroundUniforms.center, (sceneCenterX + panX) * renderScale, (sceneCenterY + panY) * renderScale);
          gl.uniform1f(backgroundUniforms.backgroundGlow, (showcaseMode ? SHOWCASE_PRESET.backgroundGlowPercent : 100) * (configuredMobile() ? .8 : 1));
          const exactCore = Number(model.workspaceDensity[1] || 0);
          const exactTests = Number(model.workspaceDensity[2] || 0);
          const exactTotal = exactCore + exactTests;
          const hazeStrength = clamp(Math.log1p(exactTotal) / Math.log1p(1_000_000), 0, 1);
          const projectedHostRadius = workspaceRadius * cameraFocal / cameraDistance * zoom * renderScale;
          gl.uniform1f(backgroundUniforms.hazeStrength, hazeStrength);
          gl.uniform1f(backgroundUniforms.hazeTestMix, exactTests / Math.max(1, exactTotal));
          gl.uniform1f(backgroundUniforms.hazeRadius, Math.max(1, projectedHostRadius));
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          gl.enable(gl.BLEND);
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE);
          gl.useProgram(pointProgram);
          gl.bindVertexArray(pointVao);
          gl.uniform2f(pointUniforms.resolution, width * renderScale, height * renderScale);
          gl.uniform2f(pointUniforms.center, (sceneCenterX + panX) * renderScale, (sceneCenterY + panY) * renderScale);
          gl.uniform1f(pointUniforms.yaw, yaw);
          gl.uniform1f(pointUniforms.pitch, pitch);
          gl.uniform1f(pointUniforms.zoom, zoom * renderScale);
          gl.uniform1f(pointUniforms.cameraDistance, cameraDistance);
          gl.uniform1f(pointUniforms.cameraFocal, cameraFocal);
          gl.uniform1f(pointUniforms.brightness, showcaseMode ? SHOWCASE_PRESET.starBrightnessPercent : 92);
          gl.uniform1f(pointUniforms.glow, (showcaseMode ? SHOWCASE_PRESET.pointGlowPercent : 24) * (configuredMobile() ? .65 : 1));
          gl.uniform1f(pointUniforms.deepDetail, deepDetail);
          gl.uniform1i(pointUniforms.grouped, scaleAdaptiveMode ? 1 : 0);
          gl.uniform3f(pointUniforms.visibility, visibleCategories.core ? 1 : 0, visibleCategories.tests ? 1 : 0, visibleCategories.dependencies ? 1 : 0);
          gl.uniform1f(pointUniforms.focusedGroup, focusedGroupIndex ?? -1);
          gl.uniform1f(pointUniforms.focusedPackage, expandedPackageIndex ?? -1);
          gl.uniform1f(pointUniforms.focusedCategory, focusedCategory === null ? -1 : categoryIndex[focusedCategory]);
          gl.uniform1f(pointUniforms.dependencyExpansion, DEPENDENCY_EXPANSION);
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

    try {
      sceneRenderer = createSceneRenderer();
    } catch (error) {
      document.getElementById("rubylens-cosmos")?.remove();
      canvas.style.display = "";
      document.documentElement.dataset.rubylensRenderer = "canvas2d-fallback";
      if (showcaseMode) {
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
      const perspective = cameraFocal / (cameraDistance - z2) * targetZoom;
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
      tooltipCategory.textContent = point.systemHub ? "Core region" : point.hub ? "Gem" : point.category === "tests" ? "Tests" : "Core code";
      tooltipName.textContent = point.name || "Unnamed Ruby item";
      if (point.systemHub) {
        const spans = point.crossGroupCount > 0 ? ` · ${point.crossGroupCount.toLocaleString()} shared namespace span${point.crossGroupCount === 1 ? "" : "s"}` : "";
        tooltipContext.textContent = `${point.coreCount.toLocaleString()} Core · ${point.testCount.toLocaleString()} Tests${spans}`;
        addRubyMetrics(point.rubyCounts, allRubyMetricIndexes);
        return;
      }
      if (point.hub) {
        const expanded = expandedPackageIndex === point.packageIndex ? " · Expanded gem cloud · Escape to exit" : "";
        const landmark = point === frameworkLandmark ? " · Rails framework landmark" : "";
        tooltipContext.textContent = `${point.packageRole} · ${point.packageLocation}${landmark}${expanded}`;
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

    function selectPoint(point, locked = false) {
      if (locked && selectionLocked && selectedPoint === point) point = null;
      selectedPoint = point;
      selectionLocked = Boolean(point) && locked;
      if (point) updateTooltipContent(point);
      else tooltip.hidden = true;
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
      const candidates = boundedRangeSample(namespacePoints, first, length, FOCUSED_PICK_LIMIT);
      for (const point of candidates) {
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
      if (!configuredRegions) return nearestScreenPoint(overviewPickPoints, x, y);
      if (focusedGroupIndex === null) return systemHubAt(x, y) || nearestScreenPoint(overviewPickPoints, x, y);

      const [first, length] = groupRanges[focusedGroupIndex];
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

    function railsReferenceUnavailableReason() {
      if (!frameworkReference) return "";
      if (Number(model.workspaceDensity[1] || 0) <= 0) return "Comparison unavailable: this report has no Core class or module namespaces.";
      if (frameworkReference.status === "partial_family") {
        return `Comparison unavailable: ${Number(frameworkReference.coverage?.[0] || 0)} of ${Number(frameworkReference.coverage?.[1] || 0)} version-aligned framework gems are available for indexing.`;
      }
      if (frameworkReference.status === "unsupported_family_shape") return "Comparison unavailable: this Rails framework family shape is not supported.";
      if (frameworkReference.status === "rails_package_missing") return "Comparison unavailable: the locked Rails landmark was not indexed.";
      return "Comparison unavailable: indexing coverage is incomplete.";
    }

    function createFrameworkMetric(title, rubyCounts) {
      const metric = document.createElement("div");
      metric.className = "framework-reference-metric";
      const heading = document.createElement("h4");
      heading.textContent = title;
      metric.append(heading, createRubyBreakdown(title, rubyCounts, [0, 1]));
      return metric;
    }

    function updateRailsReferenceControl() {
      if (!frameworkReference || !railsReferenceStatus) return;
      const comparable = frameworkReference.comparable === true && Number(model.workspaceDensity[1] || 0) > 0;
      if (railsReferenceToggle) {
        railsReferenceToggle.disabled = !comparable;
        railsReferenceToggle.setAttribute("aria-pressed", String(comparable && railsComparisonEnabled));
        railsReferenceToggle.textContent = comparable && railsComparisonEnabled ? "Comparing with Rails" : "Compare with Rails";
      }
      if (railsReferenceMetrics) {
        railsReferenceMetrics.textContent = "";
        if (comparable) {
          railsReferenceMetrics.append(
            createFrameworkMetric("Core host", model.categoryStats.core),
            createFrameworkMetric(`Rails ${frameworkReference.version}`, frameworkReference.rubyCounts),
          );
        }
      }
      railsReferenceStatus.textContent = comparable
        ? railsComparisonEnabled
          ? railsReferenceVisible === false
            ? "Scale glyph unavailable at the current view. Zoom out or reset the view to compare."
            : `Same-scale glyph on. Rails ${frameworkReference.version} appears beside the whole Core host.`
          : railsComparisonNotice || `Same-scale glyph off. Rails ${frameworkReference.version} is ready to compare with the whole Core host.`
        : railsReferenceUnavailableReason();
    }

    function disableRailsComparison(notice) {
      if (!railsComparisonEnabled) return;
      railsComparisonEnabled = false;
      railsReferenceVisible = null;
      railsComparisonNotice = notice;
      updateRailsReferenceControl();
      requestRender();
    }

    function createRailsReferenceControl() {
      const section = document.createElement("section");
      section.className = "framework-reference";
      const header = document.createElement("div");
      header.className = "framework-reference-header";
      const heading = document.createElement("h3");
      heading.textContent = `Rails ${frameworkReference.version}`;
      const coverage = document.createElement("small");
      coverage.textContent = `${Number(frameworkReference.coverage?.[0] || 0)} / ${Number(frameworkReference.coverage?.[1] || 0)} framework gems available for indexing`;
      const title = document.createElement("div");
      title.append(heading, coverage);
      const toggle = document.createElement("button");
      toggle.id = "rails-reference-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-pressed", "false");
      toggle.setAttribute("aria-label", `Compare the whole Core host with Rails ${frameworkReference.version}`);
      toggle.addEventListener("click", () => {
        const enabling = !railsComparisonEnabled;
        railsComparisonNotice = "";
        if (enabling) {
          clearExplorationFocus();
          setCategoryVisible("core", true);
          setDrifting(false);
          railsComparisonEnabled = true;
          flyCamera({ yaw: -.36, pitch: .34, zoom: 1, panX: 0, panY: 0 });
        } else {
          railsComparisonEnabled = false;
        }
        railsReferenceVisible = null;
        updateRailsReferenceControl();
        requestRender();
      });
      railsReferenceToggle = toggle;
      header.append(title, toggle);
      railsReferenceMetrics = document.createElement("div");
      railsReferenceMetrics.className = "framework-reference-metrics";
      const scope = document.createElement("p");
      scope.className = "framework-reference-scope";
      scope.textContent = `First-party framework family: ${frameworkReference.members.join(", ")}. The Rails meta-gem and unrelated transitive gems are excluded.`;
      railsReferenceStatus = document.createElement("p");
      railsReferenceStatus.className = "framework-reference-status";
      railsReferenceStatus.setAttribute("role", "status");
      railsReferenceStatus.setAttribute("aria-live", "polite");
      section.append(header, railsReferenceMetrics, scope, railsReferenceStatus);
      updateRailsReferenceControl();
      return section;
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
      document.dispatchEvent(new CustomEvent("rubylens:core-region-focus", { detail: { regionIndex: null } }));
      updateQaDrawCounts();
    }

    function activateSystemRange(groupIndex, button = systemFocusButtons[groupIndex]) {
      focusedGroupIndex = groupIndex;
      if (button) button.setAttribute("aria-pressed", "true");
      document.body.dataset.focusedGroupIndex = String(groupIndex);
      document.dispatchEvent(new CustomEvent("rubylens:core-region-focus", { detail: { regionIndex: groupIndex } }));
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
      if (category === "core" && !visible) {
        disableRailsComparison("Same-scale comparison turned off because Core code is hidden.");
      }
      visibleCategories[category] = visible;
      if (visibilityInputs[category]) visibilityInputs[category].checked = visible;
      if (!visible && (selectedPoint?.category === category || focusedCategory === category)) clearExplorationFocus();
      requestRender();
    }

    function focusCategory(category) {
      disableRailsComparison("Same-scale comparison turned off because category focus leaves the whole-host overview.");
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

    function focusPoint(point, button) {
      disableRailsComparison("Same-scale comparison turned off because item focus leaves the whole-host overview.");
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
      clearSystemFocus();
      if (Number.isInteger(point.groupIndex)) activateSystemRange(point.groupIndex);
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

    function focusSystem(groupIndex, button = systemFocusButtons[groupIndex]) {
      disableRailsComparison("Same-scale comparison turned off because region focus leaves the whole-host overview.");
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

    if (interactiveMode && configuredRegions) {
      window.RubyLensCoreRegions = Object.freeze({
        focus: groupIndex => focusSystem(Number(groupIndex)),
        clear: () => { clearExplorationFocus(); return true; },
        range: groupIndex => groupRanges[Number(groupIndex)]?.slice() || null,
        selected: () => focusedGroupIndex,
      });
    }

    function focusDependencyPackage(packageIndex, button = null) {
      disableRailsComparison("Same-scale comparison turned off because gem expansion leaves the whole-host overview.");
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
        if (category === "core" && frameworkReference) body.append(createRailsReferenceControl());
        if (category === "core" && configuredRegions) {
          const systems = document.createElement("section");
          systems.className = "systems-summary";
          const systemsTitle = document.createElement("h3");
          systemsTitle.textContent = "Core regions";
          const systemList = document.createElement("ol");
          const activeSystemIndexes = groups
            .map((row, index) => Number(row[1] || 0) + Number(row[2] || 0) + Number(row[3] || 0) > 0 ? index : null)
            .filter(Number.isInteger);
          activeSystemIndexes.slice(0, 16).forEach(index => {
            const name = groupNames[index];
            const row = groups[index];
            const item = document.createElement("li");
            const label = document.createElement("button");
            label.type = "button";
            label.setAttribute("aria-pressed", "false");
            label.setAttribute("aria-label", `Focus Core region ${name}`);
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
            remainder.textContent = `${(activeSystemIndexes.length - 16).toLocaleString()} more regions`;
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
        if (sceneRenderer) sceneRenderer.resize(width, height);
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
      dpr = Math.min(window.devicePixelRatio || 1, configuredMobile() ? 1.25 : 2);
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (sceneRenderer) sceneRenderer.resize(width, height);
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
      const depth = cameraDistance - z2;
      if (depth <= 35) return null;
      const perspective = cameraFocal / depth * zoom;
      return [sceneCenterX + panX + x1 * perspective, sceneCenterY + panY + y2 * perspective, perspective];
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
        const alpha = clamp(.11 + point.signal * .09, .09, point.hub ? .76 : .58) * (point.category === "tests" && !point.systemHub ? .68 : 1) * SHOWCASE_PRESET.starBrightnessPercent / 100;
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
        if (size > 1.1 && !configuredMobile() && point.category !== "tests") {
          context.beginPath();
          context.arc(x, y, Math.max(.45 + deepDetail * .25, size * (.24 + deepDetail * .06)), 0, Math.PI * 2);
          context.fillStyle = `rgba(255,248,244,${Math.min(.9, alpha * 1.25)})`;
          context.fill();
        }
      }}
      context.globalCompositeOperation = "source-over";
    }

    function updateProjectedPoint(point, matrix) {
      point.screen = null;
      if (point.hub) point.cloudScreenRadius = null;
      if (!visibleCategories[point.category]) return;
      const projected = project(point, matrix);
      if (!projected) return;
      const [x, y, perspective] = projected;
      if (x < -20 || x > sceneRight + 20 || y < -20 || y > sceneBottom + 20) return;
      const size = clamp(point.base * (.62 + point.signal * .46) * perspective, .35, point.systemHub ? 8 : point.hub ? 5.2 : 3.2);
      point.screen = [x, y, size, perspective];
      if (point.hub) point.cloudScreenRadius = Math.max(12, packageAnchors[point.packageIndex][3] * perspective * 1.2);
    }

    function activePickingPoints() {
      if (focusedGroupIndex === null) return overviewPickPoints;
      const [first, length] = groupRanges[focusedGroupIndex];
      return boundedRangeSample(namespacePoints, first, length, FOCUSED_PICK_LIMIT).concat(dependencyHubs, systemHubs);
    }

    function renderSelectionOverlay() {
      if (!selectedPoint?.screen) return;
      const [x, y, size] = selectedPoint.screen;
      const colour = colours[selectedPoint.category];
      context.beginPath(); context.arc(x, y, Math.max(7, size * 2.5), 0, Math.PI * 2);
      context.strokeStyle = "rgba(255,255,255,.95)"; context.lineWidth = 1.2; context.stroke();
      context.beginPath(); context.arc(x, y, Math.max(12, size * 4), 0, Math.PI * 2);
      context.strokeStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},.5)`; context.lineWidth = 1; context.stroke();
    }

    function renderFrameworkLandmark() {
      if (!frameworkLandmark?.screen) return;
      const [x, y, size] = frameworkLandmark.screen;
      const offset = Math.max(5, size + 3);
      context.fillStyle = "rgba(211,218,226,.76)";
      context.fillRect(x + offset, y - offset, 3, 3);
    }

    function renderRailsReference(matrix) {
      if (!railsComparisonEnabled || !frameworkReference?.comparable || Number(model.workspaceDensity[1] || 0) <= 0) return;
      const projected = project({ position: [0, 0, 0] }, matrix);
      if (!projected) { setRailsReferenceVisible(false); return; }
      const hostRadius = workspaceRadius * projected[2];
      const referenceRadius = Number(frameworkReference.systemRadius || 0) / 1000 * projected[2];
      if (!(referenceRadius > 0)) { setRailsReferenceVisible(false); return; }
      context.save();
      const label = `Rails ${frameworkReference.version} · same scale`;
      context.font = "600 10px ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif";
      const labelHalfWidth = context.measureText(label).width / 2;
      const preferredOffset = hostRadius + referenceRadius + 16;
      const minimumOffset = hostRadius + referenceRadius + 4;
      const halfWidth = Math.max(referenceRadius, labelHalfWidth);
      const padding = 12;
      const minX = padding + halfWidth;
      const maxX = sceneRight - padding - halfWidth;
      const minY = padding + referenceRadius + 14;
      const maxY = sceneBottom - padding - referenceRadius;
      const candidates = [
        [projected[0] + preferredOffset, projected[1]],
        [projected[0] - preferredOffset, projected[1]],
        [projected[0], projected[1] - preferredOffset],
        [projected[0], projected[1] + preferredOffset],
        [maxX, minY],
        [minX, minY],
        [maxX, maxY],
        [minX, maxY],
      ];
      const position = candidates.find(([x, y]) => (
        minX <= maxX && minY <= maxY && x >= minX && x <= maxX && y >= minY && y <= maxY &&
        Math.hypot(x - projected[0], y - projected[1]) >= minimumOffset
      ));
      if (!position) { context.restore(); setRailsReferenceVisible(false); return; }
      setRailsReferenceVisible(true);
      const [x, y] = position;
      context.fillStyle = "rgba(151,161,173,.06)";
      context.strokeStyle = "rgba(190,199,209,.72)";
      context.lineWidth = 1;
      context.setLineDash([3, 4]);
      context.beginPath();
      context.arc(x, y, referenceRadius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(x - referenceRadius, y);
      context.lineTo(x + referenceRadius, y);
      context.moveTo(x - referenceRadius, y - 3);
      context.lineTo(x - referenceRadius, y + 3);
      context.moveTo(x + referenceRadius, y - 3);
      context.lineTo(x + referenceRadius, y + 3);
      context.strokeStyle = "rgba(190,199,209,.48)";
      context.stroke();
      context.fillStyle = "rgba(218,223,230,.86)";
      context.textAlign = "center";
      context.fillText(label, x, y - referenceRadius - 5);
      context.restore();
    }

    function setRailsReferenceVisible(visible) {
      if (railsReferenceVisible === visible) return;
      railsReferenceVisible = visible;
      document.documentElement.dataset.rubylensRailsReferenceVisible = String(visible);
      updateRailsReferenceControl();
    }

    function render(timestamp) {
      animationFrame = 0;
      updateCameraFlight(timestamp);
      if (showcaseMode) {
        if (sceneRenderer) sceneRenderer.render();
        else renderShowcaseFallback();
        return;
      }
      if (interactiveMode) document.getElementById("zoom-level").value = `${Math.round(zoom * 100)}%`;
      const matrix = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      if (sceneRenderer) {
        context.clearRect(0, 0, width, height);
        sceneRenderer.render();
        const pickingPoints = activePickingPoints();
        for (const point of pickingPoints) updateProjectedPoint(point, matrix);
        if (selectedPoint && !pickingPoints.includes(selectedPoint)) updateProjectedPoint(selectedPoint, matrix);
        renderSelectionOverlay();
        renderFrameworkLandmark();
        renderRailsReference(matrix);
        if (selectedPoint) {
          if (cameraFlight) tooltip.hidden = true;
          else positionTooltip(selectedPoint);
        }
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
      for (const [first, length] of visibleDrawRanges()) {
      for (let index = first; index < first + length; index += 1) {
        const point = renderPoints[index];
        point.screen = null;
        if (point.hub) point.cloudScreenRadius = null;
        if (!visibleCategories[point.category]) continue;
        const projected = project(point, matrix);
        if (!projected) continue;
        const [x, y, perspective] = projected;
        const cullMargin = point === selectedPoint ? 0 : 20;
        if (x < -cullMargin || x > sceneRight + cullMargin || y < -cullMargin || y > sceneBottom + cullMargin) continue;
        const signal = point.signal;
        const size = clamp(point.base * (.62 + signal * .46) * perspective, .35, point.systemHub ? 8 : point.hub ? 5.2 : 3.2);
        const focusedSystemTest = focusedGroupIndex !== null && point.groupIndex === focusedGroupIndex && point.category === "tests" && !point.systemHub;
        const alpha = clamp(.11 + signal * .09, .09, point.hub ? .76 : .58) * (focusedSystemTest ? .34 : point.category === "tests" && !point.systemHub ? .68 : 1);
        const focusedPackagePoint = expandedPackageIndex !== null && point.category === "dependencies" && point.packageIndex === expandedPackageIndex;
        const systemEmphasis = focusedGroupIndex !== null && Number.isInteger(point.groupIndex) && point.groupIndex !== focusedGroupIndex
          ? contextVisibility.system
          : 1;
        const selectionEmphasis = selectionLocked && selectedPoint
          ? (selectedPoint.systemHub ? 1 : point === selectedPoint ? 1 : contextVisibility.selection)
          : focusedCategory && point.category !== focusedCategory ? contextVisibility.category : 1;
        const emphasis = (expandedPackageIndex !== null
          ? (focusedPackagePoint ? 1 : contextVisibility.package)
          : selectionEmphasis) * systemEmphasis;
        const visibleAlpha = focusedPackagePoint ? Math.max(.34, alpha) : alpha * emphasis;
        const colour = colours[point.category];
        point.screen = [x, y, size, perspective];
        if (point.hub) {
          const expansion = expandedPackageIndex === point.packageIndex ? DEPENDENCY_EXPANSION : 1;
          point.cloudScreenRadius = Math.max(12, packageAnchors[point.packageIndex][3] * perspective * expansion * 1.2);
        }
        const detailedPoint = expandedPackageIndex !== null ? focusedPackagePoint : emphasis >= .1;
        if (size > 1.35 && detailedPoint && !focusedSystemTest) {
          const glowScale = (focusedPackagePoint ? 2.2 - deepDetail * .8 : 3.4 - deepDetail * 1.3) * (configuredMobile() ? .7 : 1);
          context.beginPath(); context.arc(x, y, size * glowScale, 0, Math.PI * 2);
          context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${visibleAlpha * (focusedPackagePoint ? .045 : .055)})`; context.fill();
        }
        context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${visibleAlpha})`;
        if (!detailedPoint || size < .85) context.fillRect(x, y, 1, 1);
        else { context.beginPath(); context.arc(x, y, size, 0, Math.PI * 2); context.fill(); }
        if (size > 1.1 && detailedPoint && !configuredMobile() && point.category !== "tests") {
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
      renderFrameworkLandmark();
      renderRailsReference(matrix);
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
    if (interactiveMode) {
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
      else if ((event.key === "Enter" || event.key.toLowerCase() === "f") && selectedPoint?.systemHub) focusSystem(selectedPoint.groupIndex);
      else if ((event.key === "Enter" || event.key.toLowerCase() === "f") && selectedPoint?.category === "dependencies") focusDependencyPackage(selectedPoint.packageIndex);
      else return;
      event.preventDefault();
      requestRender();
    });
    window.addEventListener("keydown", event => {
      if (event.key === "Escape") clearExplorationFocus();
      else moveViewWithArrow(event);
    });
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
    }

    window.addEventListener("resize", resize);
    document.querySelector("h1").textContent = model.projectName;
    if (showcaseMode) {
      document.title = `${model.projectName} · RubyLens showcase`;
      const showcaseLabel = `Autonomous stellar artwork of ${model.projectName}, completing one slow rotation each minute.`;
      canvas.setAttribute("aria-label", showcaseLabel);
      document.getElementById("rubylens-cosmos")?.setAttribute("aria-label", showcaseLabel);
      populateShowcaseStats();
      reducedMotionQuery.addEventListener("change", startShowcase);
      configureShowcaseStage();
      resize();
      startShowcase();
    } else {
      document.title = `RubyLens · ${model.projectName}`;
      canvas.setAttribute("aria-label", `Interactive three-dimensional stellar artwork of ${model.projectName}. Hover class and module stars for Ruby code details or gem clouds for package summaries. Sidebar highlights open a top-down view. Double-click a gem cloud, press Enter or F on a selected gem marker, or tap that marker again to expand its stars. Drag to orbit, Shift-drag or Pan mode to move, scroll or pinch to zoom at a point, and use arrow keys to move the view. Escape exits a focused gem cloud.`);
      document.getElementById("coverage").textContent = `${renderedDependencyStars.toLocaleString()} dependency stars shown`;
      const warningTotal = Object.values(model.warningCounts).reduce((sum, count) => sum + count, 0);
      if (warningTotal > 0) { const status = document.getElementById("status"); status.hidden = false; status.textContent = `${warningTotal.toLocaleString()} partial-index warning${warningTotal === 1 ? "" : "s"}`; }
      resetCamera();
      setDrifting(drifting);
      setNavigationMode(navigationMode);
      createExplorer();
      setPanelCollapsed(window.matchMedia("(max-width: 760px)").matches);
      resize();
    }
