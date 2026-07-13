    "use strict";
    const model = JSON.parse(atob("{{MODEL_BASE64}}"));
    const showcaseMode = document.body.dataset.rubylensMode === "showcase";
    const showcaseDetails = showcaseMode && model.details === true;
    const interactiveMode = !showcaseMode;
    const canvas = document.getElementById("cosmos");
    const context = canvas.getContext("2d", { alpha: false });
    const showcaseStage = document.getElementById("showcase-stage");
    const showcaseAnnotation = document.getElementById("cinema-annotation");
    const showcaseAnnotationKind = showcaseAnnotation?.querySelector(".cinema-annotation-kind");
    const showcaseAnnotationName = showcaseAnnotation?.querySelector(".cinema-annotation-name");
    const panel = document.getElementById("panel");
    const panelBody = document.getElementById("panel-body");
    const panelToggle = document.getElementById("panel-toggle");
    const searchRegion = document.getElementById("explorer-search-region");
    const searchInput = document.getElementById("explorer-search");
    const searchStatus = document.getElementById("search-status");
    const searchResults = document.getElementById("search-results");
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
    let width = 0, height = 0, dpr = 1, sceneRight = 0, sceneBottom = 0, sceneCenterX = 0, sceneCenterY = 0, yaw = -.36, pitch = .34, zoom = 1, panX = 0, panY = 0, dragging = false, gesture = null, pinchState = null, animationFrame = 0, hoverFrame = 0, pendingHover = null, selectedPoint = null, selectionLocked = false, focusedCategory = null, expandedPackageIndex = null, activeFactButton = null, navigationMode = "orbit", cameraFlight = null, showcaseStartedAt = null, showcaseRenderer = null, showcaseAnnotationSlot = -1, activeShowcaseAnnotation = null;
    const MIN_ZOOM = .35, MAX_ZOOM = 40, ZOOM_STEP = 1.7, DEPENDENCY_EXPANSION = 2.35, SHOWCASE_POINT_LIMIT = 50_000;
    const CORE_SCALE_BASELINE = 3_000;
    const RSPEC_PROXY_PREFIX = "RSpec example group #";
    const DEFAULT_CAMERA = Object.freeze({ yaw: -.36, pitch: .34, zoom: 1, panX: 0, panY: 0 });
    const DRIFT_RADIANS_PER_SECOND = .04125;
    const MAX_DRIFT_DELTA_MS = 50;
    const SEARCH_DEBOUNCE_MS = 120;
    const SEARCH_RESULT_LIMIT = 24;
    const SEARCH_BATCH_SIZE = 8;
    const WARNING_ROW_LIMIT = 24;
    let lastDriftTimestamp = null;
    let searchIndex = null;
    let searchTimer = 0;
    let searchMatches = [];
    let searchVisibleCount = SEARCH_BATCH_SIZE;
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
    const SHOWCASE_ANNOTATION_PRESET = Object.freeze({
      "limit": 200,
      "slotDurationMs": 6000,
      "revealStartMs": 1350,
      "revealEndMs": 4650,
      "fadeInMs": 1200,
      "fadeOutMs": 900,
      "safeInsetX": 80,
      "safeInsetTop": 340,
      "safeInsetBottom": 90,
      "labelWidth": 440
    });
    const TOP_DOWN_PITCH = Math.PI / 2;
    const contextVisibility = { selection: .75, category: .16, package: .75 };
    const pointers = new Map();
    const visibleCategories = { core: true, tests: true, dependencies: true };
    const visibilityInputs = {};
    const focusButtons = {};
    const excludedTriviaNames = new Set(["Object", "Kernel", "BasicObject"]);
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let drifting = interactiveMode && !reducedMotionQuery.matches;
    const colours = { core: [244, 82, 132], tests: [87, 204, 255], dependencies: [255, 184, 77] };
    const showcaseAnnotationData = showcaseDetails && Array.isArray(model.annotations)
      ? model.annotations.slice(0, SHOWCASE_ANNOTATION_PRESET.limit)
      : [];
    const showcaseAnnotationKey = (category, anchor) => `${category}:${anchor}`;
    const showcaseAnnotationAnchors = new Set(showcaseAnnotationData.map(annotation => showcaseAnnotationKey(annotation.category, annotation.anchor)));
    const showcasePointsByAnchor = new Map();

    const hash = (seed, channel = 0) => {
      let value = (seed ^ (channel * 0x9e3779b9)) >>> 0;
      value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
      value = Math.imul(value ^ value >>> 15, 0x735a2d97);
      return (value ^ value >>> 15) >>> 0;
    };
    const unit = (seed, channel) => hash(seed, channel) / 4294967296;
    const normal = (seed, channel) => Math.sqrt(-2 * Math.log(Math.max(unit(seed, channel), 1e-7))) * Math.cos(6.283185 * unit(seed, channel + 1));
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    function explorerExposureForZoom(zoomLevel) {
      const zoomStops = Math.max(0, Math.log2(zoomLevel));
      const easedStops = zoomStops * zoomStops / (zoomStops + .5);
      return 1 / (1 + .65 * easedStops);
    }

    function normalizedSignals(values) {
      return fields.map((field, index) => Math.log1p(values[index] || 0) / Math.log1p(model.domains[field] || 1));
    }

    function weightedSignal(normalized, category) {
      return fields.reduce((total, field, index) => total + signalWeights[category][field] * normalized[index], .12);
    }

    function layoutMetricsForCoreCount(coreCount) {
      const coreRatio = Math.max(1, coreCount / CORE_SCALE_BASELINE);
      const disk = Math.pow(coreRatio, .45);
      const tests = disk;
      const cameraScale = Math.pow(tests, .8);
      return Object.freeze({
        disk,
        bulge: Math.pow(coreRatio, .35),
        tests,
        cameraScale,
        cameraDistance: 270 * cameraScale,
        cameraFocalLength: 440,
        testOuterRadius: 62 * tests,
        dependencyInnerRadius: 62 * tests + 8,
      });
    }

    const coreCount = model.namespaces.reduce((count, row) => count + (row[3] === 1 ? 0 : 1), 0);
    const layoutScale = layoutMetricsForCoreCount(coreCount);
    const cameraDistance = layoutScale.cameraDistance;
    const cameraFocalLength = layoutScale.cameraFocalLength;

    function corePosition(seed) {
      const bulge = unit(seed, 2) < .24;
      const radial = bulge ? 17 * Math.pow(unit(seed, 3), 1.75) : Math.min(42, -10 * Math.log(Math.max(1e-5, 1 - unit(seed, 3))));
      const theta = unit(seed, 4) * Math.PI * 2 + radial * .04;
      const vertical = normal(seed, 5) * (bulge ? 5.8 : 1.4 + radial * .025);
      const scale = bulge ? layoutScale.bulge : layoutScale.disk;
      return [Math.cos(theta) * radial * scale, vertical * scale, Math.sin(theta) * radial * scale];
    }

    function testPosition(seed) {
      const radial = 17 + Math.min(45, -14 * Math.log(Math.max(1e-5, 1 - unit(seed, 7))));
      const arm = Math.floor(unit(seed, 8) * 3);
      const inArm = unit(seed, 9) < .38;
      const theta = inArm
        ? arm * (Math.PI * 2 / 3) + radial * .105 + normal(seed, 10) * .22
        : unit(seed, 10) * Math.PI * 2;
      const vertical = normal(seed, 11) * (1.4 + radial * .035);
      return [Math.cos(theta) * radial * layoutScale.tests, vertical * layoutScale.tests, Math.sin(theta) * radial * layoutScale.tests];
    }

    const packageAnchors = model.packages.map((row, index) => {
      const seed = row[0], radius = layoutScale.dependencyInnerRadius + 72 * Math.sqrt(layoutScale.tests) * Math.pow(unit(seed, 14), .72);
      const theta = unit(seed, 15) * Math.PI * 2;
      const vertical = normal(seed, 16) * 24 * Math.sqrt(layoutScale.tests);
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
        if (interactive && interactiveMode) interactivePoints.push(point);
        if (point.hub) dependencyHubs.push(point);
      };
      model.namespaces.forEach((row, index) => {
        const name = interactiveMode ? model.namespaceNames[index] : "";
        const category = row[3] === 1 ? "tests" : "core";
        const values = row.slice(4, 10);
        const rubyCounts = row.slice(10, 14);
        const point = { category, seed: row[0], position: category === "tests" ? testPosition(row[0]) : corePosition(row[0]), signal: weightedSignal(normalizedSignals(values), category), base: category === "core" ? .82 : .68 };
        if (interactiveMode) Object.assign(point, { name, kind: row[2] === 0 ? "Class" : "Module", rubyCounts, instanceVariableCount: row[14] || 0, values });
        if (showcaseDetails) {
          const annotationKey = showcaseAnnotationKey(category, index);
          if (showcaseAnnotationAnchors.has(annotationKey)) showcasePointsByAnchor.set(annotationKey, point);
        }
        addPoint(point, !name.startsWith(RSPEC_PROXY_PREFIX));
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
        if (interactiveMode) Object.assign(point, { name: model.packageNames[index], packageRole: packageRow[1] === 0 ? "Direct dependency" : "Transitive dependency", packageLocation: packageRow[2] === 0 ? "Workspace package" : "External gem", rubyCounts });
        if (showcaseDetails) {
          const annotationKey = showcaseAnnotationKey("dependencies", index);
          if (showcaseAnnotationAnchors.has(annotationKey)) showcasePointsByAnchor.set(annotationKey, point);
        }
        addPoint(point);
      });
      return { points, interactivePoints, dependencyHubs };
    }
    const { points, interactivePoints, dependencyHubs } = buildPoints();
    function showcasePointSample() {
      if (!showcaseMode || points.length <= SHOWCASE_POINT_LIMIT) return points;
      const rank = point => [hash(point.seed, 73), point.seed, point];
      const pinned = showcaseDetails ? Array.from(showcasePointsByAnchor.values()) : [];
      const pinnedPoints = new Set(pinned);
      const hubs = points.filter(point => point.hub && !pinnedPoints.has(point));
      const availableAfterPins = Math.max(0, SHOWCASE_POINT_LIMIT - pinned.length);
      if (hubs.length >= availableAfterPins) {
        return hubs.map(rank)
          .sort((left, right) => left[0] - right[0] || left[1] - right[1])
          .slice(0, availableAfterPins)
          .map(candidate => candidate[2])
          .concat(pinned);
      }
      const available = Math.max(0, availableAfterPins - hubs.length);
      const candidates = points.filter(point => !point.hub && !pinnedPoints.has(point)).map(rank);
      candidates.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      return candidates.slice(0, available).map(candidate => candidate[2]).concat(hubs, pinned);
    }
    const renderPoints = showcasePointSample();
    const renderedShowcaseAnnotations = showcaseAnnotationData.map(annotation => {
      const point = showcasePointsByAnchor.get(showcaseAnnotationKey(annotation.category, annotation.anchor));
      return point ? Object.freeze({ ...annotation, point }) : null;
    }).filter(Boolean);

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
        uniform float u_cameraDistance;
        uniform float u_cameraFocalLength;
        uniform float u_brightness;
        uniform float u_glow;
        uniform float u_deepDetail;
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
          float depth = u_cameraDistance - z2;
          if (depth <= 35.0) { hidePoint(); return; }

          float perspective = u_cameraFocalLength / depth * u_zoom;
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
        pointData[offset + 4] = clamp(.14 + point.signal * .105, .12, point.hub ? .86 : .7);
        pointData[offset + 5] = categoryIndex[point.category];
        pointData[offset + 6] = point.hub ? 5.2 : 3.2;
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
        cameraDistance: gl.getUniformLocation(pointProgram, "u_cameraDistance"),
        cameraFocalLength: gl.getUniformLocation(pointProgram, "u_cameraFocalLength"),
        brightness: gl.getUniformLocation(pointProgram, "u_brightness"),
        glow: gl.getUniformLocation(pointProgram, "u_glow"),
        deepDetail: gl.getUniformLocation(pointProgram, "u_deepDetail"),
        pass: gl.getUniformLocation(pointProgram, "u_pass"),
      };
      const pointSizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      document.documentElement.dataset.showcaseRenderer = "webgl2";
      document.documentElement.dataset.pointSizeRange = `${pointSizeRange[0]},${pointSizeRange[1]}`;
      canvas.style.display = "none";

      return Object.freeze({
        resize(viewportWidth, viewportHeight) {
          liveCanvas.width = Math.round(viewportWidth);
          liveCanvas.height = Math.round(viewportHeight);
          gl.viewport(0, 0, liveCanvas.width, liveCanvas.height);
        },
        render() {
          const deepDetail = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
          gl.disable(gl.BLEND);
          gl.useProgram(backgroundProgram);
          gl.bindVertexArray(null);
          gl.uniform2f(backgroundUniforms.resolution, width, height);
          gl.uniform2f(backgroundUniforms.center, sceneCenterX, sceneCenterY);
          gl.uniform1f(backgroundUniforms.backgroundGlow, SHOWCASE_PRESET.backgroundGlowPercent);
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          gl.enable(gl.BLEND);
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE);
          gl.useProgram(pointProgram);
          gl.bindVertexArray(pointVao);
          gl.uniform2f(pointUniforms.resolution, width, height);
          gl.uniform2f(pointUniforms.center, sceneCenterX, sceneCenterY);
          gl.uniform1f(pointUniforms.yaw, yaw);
          gl.uniform1f(pointUniforms.pitch, pitch);
          gl.uniform1f(pointUniforms.zoom, zoom);
          gl.uniform1f(pointUniforms.cameraDistance, cameraDistance);
          gl.uniform1f(pointUniforms.cameraFocalLength, cameraFocalLength);
          gl.uniform1f(pointUniforms.brightness, SHOWCASE_PRESET.starBrightnessPercent);
          gl.uniform1f(pointUniforms.glow, SHOWCASE_PRESET.pointGlowPercent);
          gl.uniform1f(pointUniforms.deepDetail, deepDetail);
          for (let pass = 0; pass < 3; pass += 1) {
            gl.uniform1i(pointUniforms.pass, pass);
            gl.drawArrays(gl.POINTS, 0, renderPoints.length);
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
    const totals = model.totals || {
      namespaces: model.namespaces.length,
      packages: model.packages.length,
      dependencyStars: model.dependencyStars.length,
      renderedDependencyStars: model.dependencyStars.length,
    };
    const renderedDependencyStars = totals.renderedDependencyStars;
    const directGemCount = model.packages.filter(row => row[1] === 0).length;
    const transitiveGemCount = totals.packages - directGemCount;
    const allRubyMetricIndexes = [0, 1, 2, 3];
    const testRubyMetricIndexes = [0, 2];
    const dependencyRubyCounts = model.packages.reduce(
      (counts, row) => counts.map((count, index) => count + Number(row[index + 4] || 0)),
      [0, 0, 0, 0],
    );
    const categoryMeta = {
      core: { title: "Core code", rubyCounts: model.categoryStats?.core || [0, 0, 0, 0], metricIndexes: allRubyMetricIndexes, focusZoom: 2.8 },
      tests: { title: "Tests", rubyCounts: model.categoryStats?.tests || [0, 0, 0, 0], metricIndexes: testRubyMetricIndexes, focusZoom: 1.35 },
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
      const perspective = cameraFocalLength / (cameraDistance - z2) * targetZoom;
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
      const target = cameraFlight.finalTarget;
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
      const finalTarget = { ...target };
      const yawDelta = Math.atan2(Math.sin(target.yaw - yaw), Math.cos(target.yaw - yaw));
      const resolvedTarget = { ...target, yaw: yaw + yawDelta };
      tooltip.hidden = true;
      if (reducedMotionQuery.matches) {
        applyCameraTarget(finalTarget);
        canvas.removeAttribute("aria-busy");
        requestRender();
        return;
      }

      const angularDistance = Math.hypot(yawDelta, resolvedTarget.pitch - pitch);
      const zoomStops = Math.abs(Math.log2(resolvedTarget.zoom / zoom));
      const panDistance = Math.hypot(resolvedTarget.panX - panX, resolvedTarget.panY - panY);
      if (angularDistance < .001 && zoomStops < .01 && panDistance < .5) {
        applyCameraTarget(finalTarget);
        canvas.removeAttribute("aria-busy");
        requestRender();
        return;
      }
      const minimumZoom = Math.min(zoom, resolvedTarget.zoom);
      const cruiseZoom = Math.min(2.5, minimumZoom);
      cameraFlight = {
        start: { yaw, pitch, zoom, panX, panY },
        target: resolvedTarget,
        finalTarget,
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
      const { start, target, finalTarget } = cameraFlight;
      yaw = start.yaw + (target.yaw - start.yaw) * eased;
      pitch = start.pitch + (target.pitch - start.pitch) * eased;
      panX = start.panX + (target.panX - start.panX) * eased;
      panY = start.panY + (target.panY - start.panY) * eased;
      const pullback = Math.sin(Math.PI * progress) ** 2 * cameraFlight.pullback;
      zoom = Math.exp(Math.log(start.zoom) + (Math.log(target.zoom) - Math.log(start.zoom)) * eased - pullback);
      if (progress >= 1) {
        cameraFlight = null;
        applyCameraTarget(finalTarget);
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
      if (button && activeFactButton === button) {
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

    function appendWarningGroup(container, title, count, rows = [], note = "") {
      if (count <= 0) return;
      const group = document.createElement("section");
      group.className = "warning-group";
      const heading = document.createElement("h2");
      heading.className = "warning-group-heading";
      const label = document.createElement("span");
      label.textContent = title;
      const total = document.createElement("span");
      total.textContent = `${count.toLocaleString()} ${count === 1 ? "warning" : "warnings"}`;
      heading.append(label, total);
      group.append(heading);
      if (rows.length) {
        const list = document.createElement("ul");
        list.className = "warning-rows";
        for (const warning of rows) {
          const item = document.createElement("li");
          item.className = "warning-row";
          const name = document.createElement("strong");
          name.textContent = warning.name;
          const reason = document.createElement("span");
          reason.textContent = warning.reason;
          item.append(name, reason);
          list.append(item);
        }
        group.append(list);
      }
      if (note) {
        const summary = document.createElement("p");
        summary.className = "warning-note";
        summary.textContent = note;
        group.append(summary);
      }
      container.append(group);
    }

    function populateWarningDisclosure() {
      const details = document.getElementById("status");
      const summary = document.getElementById("warning-summary");
      const container = document.getElementById("warning-details");
      const counts = Object.fromEntries(["manifest", "index", "integrity"].map(category => [category, Math.max(0, Number(model.warningCounts?.[category]) || 0)]));
      const warningTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
      if (!warningTotal) return;

      details.hidden = false;
      summary.textContent = `${warningTotal.toLocaleString()} partial-index warning${warningTotal === 1 ? "" : "s"}`;
      container.textContent = "";

      const safeWarnings = (Array.isArray(model.dependencyWarnings) ? model.dependencyWarnings : []).filter(warning =>
        warning && typeof warning.name === "string" && warning.name.length > 0 && typeof warning.reason === "string" && warning.reason.length > 0
      );
      const seen = new Set();
      const uniqueWarnings = safeWarnings.filter(warning => {
        const key = `${warning.name}\u0000${warning.reason}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const shownWarnings = uniqueWarnings.slice(0, WARNING_ROW_LIMIT);
      const dependencyNotes = [];
      const duplicateCount = safeWarnings.length - uniqueWarnings.length;
      const omittedCount = uniqueWarnings.length - shownWarnings.length;
      if (duplicateCount > 0) dependencyNotes.push(`${duplicateCount.toLocaleString()} duplicate ${duplicateCount === 1 ? "entry" : "entries"} summarized.`);
      if (omittedCount > 0) dependencyNotes.push(`${omittedCount.toLocaleString()} more ${omittedCount === 1 ? "package warning" : "package warnings"} not shown.`);
      appendWarningGroup(container, "Dependency packages", safeWarnings.length, shownWarnings, dependencyNotes.join(" "));

      const undetailedManifestCount = Math.max(0, counts.manifest - safeWarnings.length);
      appendWarningGroup(container, "Manifest", undetailedManifestCount, [], "Package-specific details are unavailable for these warnings.");
      appendWarningGroup(container, "Ruby index", counts.index, [], "Only the aggregate count is included in this report.");
      appendWarningGroup(container, "Integrity checks", counts.integrity, [], "Only the aggregate count is included in this report.");
    }

    function ensureSearchIndex() {
      searchIndex ||= interactivePoints.map(point => point.name.toLowerCase());
      return searchIndex;
    }

    function searchRenderedPoints(query) {
      const names = ensureSearchIndex();
      const buckets = [[], [], [], []];
      for (let index = 0; index < names.length; index += 1) {
        const name = names[index];
        const position = name.indexOf(query);
        if (position < 0) continue;
        const rank = position === 0 ? (name.length === query.length ? 0 : 1) : /[^a-z0-9]/.test(name[position - 1]) ? 2 : 3;
        if (buckets[rank].length < SEARCH_RESULT_LIMIT) buckets[rank].push(index);
      }
      return buckets.flat().slice(0, SEARCH_RESULT_LIMIT);
    }

    function searchResultContext(point, duplicateOrdinal, duplicateTotal) {
      const category = point.category === "core" ? "Core" : point.category === "tests" ? "Tests" : "Gems";
      const kind = point.hub ? "Dependency system" : point.kind;
      const duplicate = duplicateTotal > 1 ? ` · Result ${duplicateOrdinal} of ${duplicateTotal}` : "";
      return `${kind} · ${category}${duplicate}`;
    }

    function activateSearchResult(point) {
      if (point.hub) focusDependencyPackage(point.packageIndex);
      else focusPoint(point);
    }

    function renderSearchResults(focusIndex = null) {
      searchResults.textContent = "";
      const visibleMatches = searchMatches.slice(0, searchVisibleCount);
      const duplicateTotals = new Map();
      for (const match of searchMatches) {
        const point = interactivePoints[match];
        const key = `${point.category}\u0000${point.name}`;
        duplicateTotals.set(key, (duplicateTotals.get(key) || 0) + 1);
      }
      const duplicateOrdinals = new Map();
      for (const match of visibleMatches) {
        const point = interactivePoints[match];
        const key = `${point.category}\u0000${point.name}`;
        const ordinal = (duplicateOrdinals.get(key) || 0) + 1;
        duplicateOrdinals.set(key, ordinal);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-result";
        const name = document.createElement("span");
        name.className = "search-result-name";
        name.textContent = point.name;
        const type = document.createElement("span");
        type.className = "search-result-type";
        type.textContent = point.category === "core" ? "Core" : point.category === "tests" ? "Test" : "Gem";
        const context = document.createElement("span");
        context.className = "search-result-context";
        context.textContent = searchResultContext(point, ordinal, duplicateTotals.get(key));
        button.append(name, type, context);
        button.addEventListener("click", () => activateSearchResult(point));
        searchResults.append(button);
      }
      if (searchVisibleCount < searchMatches.length) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "search-more";
        const remaining = searchMatches.length - searchVisibleCount;
        more.textContent = `Show ${Math.min(SEARCH_BATCH_SIZE, remaining)} more`;
        more.addEventListener("click", () => {
          const firstNewResult = searchVisibleCount;
          searchVisibleCount = Math.min(searchMatches.length, searchVisibleCount + SEARCH_BATCH_SIZE);
          renderSearchResults(firstNewResult);
        });
        searchResults.append(more);
      }
      searchResults.hidden = visibleMatches.length === 0;
      if (focusIndex !== null) searchResults.querySelectorAll(".search-result")[focusIndex]?.focus();
    }

    function clearSearch({ focus = false } = {}) {
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = 0;
      searchMatches = [];
      searchVisibleCount = SEARCH_BATCH_SIZE;
      searchInput.value = "";
      searchResults.textContent = "";
      searchResults.hidden = true;
      searchStatus.textContent = "Search Core, Tests, and Gems.";
      if (focus) searchInput.focus();
    }

    function runSearch() {
      searchTimer = 0;
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        clearSearch();
        return;
      }
      searchMatches = searchRenderedPoints(query);
      searchVisibleCount = SEARCH_BATCH_SIZE;
      searchStatus.textContent = searchMatches.length
        ? `${searchMatches.length.toLocaleString()} ${searchMatches.length === 1 ? "result" : "results"} shown`
        : `No results for “${searchInput.value.trim()}”`;
      renderSearchResults();
    }

    function initializeSearch() {
      searchInput.addEventListener("input", () => {
        if (searchTimer) window.clearTimeout(searchTimer);
        const query = searchInput.value.trim();
        if (!query) {
          clearSearch();
          return;
        }
        searchStatus.textContent = "Searching…";
        searchTimer = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
      });
      searchRegion.addEventListener("keydown", event => {
        if (event.key !== "Escape" || (!searchInput.value && searchResults.hidden)) return;
        event.preventDefault();
        event.stopPropagation();
        clearSearch({ focus: true });
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
      if (showcaseAnnotation) {
        showcaseAnnotation.style.setProperty("--annotation-fade-in", `${SHOWCASE_ANNOTATION_PRESET.fadeInMs}ms`);
        showcaseAnnotation.style.setProperty("--annotation-fade-out", `${SHOWCASE_ANNOTATION_PRESET.fadeOutMs}ms`);
      }
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
          canvas.width = width;
          canvas.height = height;
          context.setTransform(1, 0, 0, 1, 0, 0);
        }
        fitShowcaseStage();
        updateSceneViewport();
        if (reducedMotionQuery.matches) applyShowcaseCamera(0);
        requestRender();
        return;
      }
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateSceneViewport();
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

    function goHome() {
      cancelCameraFlight();
      clearActiveFact();
      clearCategoryFocus();
      clearExpandedPackage();
      selectPoint(null);
      setNavigationMode("orbit");
      for (const category of Object.keys(visibleCategories)) setCategoryVisible(category, true);
      flyCamera(DEFAULT_CAMERA);
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
      const perspective = cameraFocalLength / depth * zoom;
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
      for (const point of renderPoints) {
        const projected = project(point, matrix);
        if (!projected) continue;
        const [x, y, perspective] = projected;
        if (x < -20 || x > sceneRight + 20 || y < -20 || y > sceneBottom + 20) continue;
        const size = clamp(point.base * (.62 + point.signal * .46) * perspective, .35, point.hub ? 5.2 : 3.2);
        const alpha = clamp(.14 + point.signal * .105, .12, point.hub ? .86 : .7) * SHOWCASE_PRESET.starBrightnessPercent / 100;
        const colour = colours[point.category];
        if (size > 1.35) {
          const glowScale = (3.4 - deepDetail * 1.3) * (.75 + .25 * SHOWCASE_PRESET.pointGlowPercent / 100);
          context.beginPath();
          context.arc(x, y, size * glowScale, 0, Math.PI * 2);
          context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${alpha * .055 * SHOWCASE_PRESET.pointGlowPercent / 100})`;
          context.fill();
        }
        context.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${alpha})`;
        if (size < .85) context.fillRect(x, y, 1, 1);
        else {
          context.beginPath();
          context.arc(x, y, size, 0, Math.PI * 2);
          context.fill();
        }
        if (size > 1.1) {
          context.beginPath();
          context.arc(x, y, Math.max(.45 + deepDetail * .25, size * (.24 + deepDetail * .06)), 0, Math.PI * 2);
          context.fillStyle = `rgba(255,248,244,${Math.min(.9, alpha * 1.25)})`;
          context.fill();
        }
      }
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
      context.globalCompositeOperation = "lighter";
      const matrix = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      const deepDetail = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
      const exposure = explorerExposureForZoom(zoom);
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
        const visibleAlpha = (focusedPackagePoint ? Math.max(.34, alpha) : alpha * emphasis) * exposure;
        const colour = colours[point.category];
        point.screen = [x, y, size];
        if (point.hub) {
          const expansion = expandedPackageIndex === point.packageIndex ? DEPENDENCY_EXPANSION : 1;
          point.cloudScreenRadius = Math.max(12, packageAnchors[point.packageIndex][3] * perspective * expansion * 1.2);
        }
        const detailedPoint = emphasis >= .1;
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
      if (selectedPoint) {
        if (cameraFlight) tooltip.hidden = true;
        else positionTooltip(selectedPoint);
      }
      if (cameraFlight) {
        lastDriftTimestamp = null;
        requestRender();
      } else if (interactiveMode && drifting && !dragging && !selectedPoint) {
        const elapsed = lastDriftTimestamp === null ? 1000 / 60 : clamp(timestamp - lastDriftTimestamp, 0, MAX_DRIFT_DELTA_MS);
        lastDriftTimestamp = timestamp;
        yaw += DRIFT_RADIANS_PER_SECOND * elapsed / 1000;
        requestRender();
      } else {
        lastDriftTimestamp = null;
      }
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

    function hideShowcaseAnnotation() {
      showcaseAnnotation?.classList.remove("is-visible");
      document.documentElement.dataset.showcaseAnnotation = "hidden";
    }

    function showcaseAnnotationKindLabel(annotation) {
      if (annotation.category === "core") return `Core · ${annotation.kind}`;
      if (annotation.category === "tests") return `Test · ${annotation.kind}`;
      return annotation.kind;
    }

    function showcaseAnnotationFits(x, y, side) {
      const labelWidth = window.innerWidth <= 600 ? 720 : SHOWCASE_ANNOTATION_PRESET.labelWidth;
      const horizontalFit = side === "left" ? x > labelWidth : x < width - labelWidth;
      return x > SHOWCASE_ANNOTATION_PRESET.safeInsetX &&
        x < width - SHOWCASE_ANNOTATION_PRESET.safeInsetX &&
        y > SHOWCASE_ANNOTATION_PRESET.safeInsetTop &&
        y < height - SHOWCASE_ANNOTATION_PRESET.safeInsetBottom &&
        horizontalFit;
    }

    function chooseShowcaseAnnotation(slot, matrix) {
      if (!renderedShowcaseAnnotations.length) return null;
      const categories = ["core", "dependencies", "tests"];
      const category = categories[slot % categories.length];
      const candidates = renderedShowcaseAnnotations.filter(annotation => annotation.category === category);
      if (!candidates.length) return null;
      const first = Math.floor(slot / categories.length) % candidates.length;
      for (let offset = 0; offset < candidates.length; offset += 1) {
        const annotation = candidates[(first + offset) % candidates.length];
        const projected = project(annotation.point, matrix);
        if (!projected) continue;
        const [x, y] = projected;
        const side = x > width / 2 ? "left" : "right";
        if (showcaseAnnotationFits(x, y, side)) return { annotation, side };
      }
      return null;
    }

    function updateShowcaseAnnotation(timestamp) {
      if (reducedMotionQuery.matches || !showcaseAnnotation || showcaseStartedAt === null) {
        hideShowcaseAnnotation();
        return;
      }
      const elapsed = Math.max(0, timestamp - showcaseStartedAt);
      const slot = Math.floor(elapsed / SHOWCASE_ANNOTATION_PRESET.slotDurationMs);
      const slotElapsed = elapsed % SHOWCASE_ANNOTATION_PRESET.slotDurationMs;
      const matrix = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      if (showcaseAnnotationSlot !== slot) {
        showcaseAnnotationSlot = slot;
        hideShowcaseAnnotation();
        activeShowcaseAnnotation = chooseShowcaseAnnotation(slot, matrix);
        if (activeShowcaseAnnotation) {
          const annotation = activeShowcaseAnnotation.annotation;
          showcaseAnnotation.dataset.category = annotation.category;
          showcaseAnnotation.dataset.side = activeShowcaseAnnotation.side;
          showcaseAnnotationKind.textContent = showcaseAnnotationKindLabel(annotation);
          showcaseAnnotationName.textContent = annotation.name;
        }
      }
      if (!activeShowcaseAnnotation) return;

      const projected = project(activeShowcaseAnnotation.annotation.point, matrix);
      if (!projected) {
        hideShowcaseAnnotation();
        return;
      }
      const [x, y] = projected;
      showcaseAnnotation.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const revealed = slotElapsed >= SHOWCASE_ANNOTATION_PRESET.revealStartMs &&
        slotElapsed <= SHOWCASE_ANNOTATION_PRESET.revealEndMs &&
        showcaseAnnotationFits(x, y, activeShowcaseAnnotation.side);
      showcaseAnnotation.classList.toggle("is-visible", revealed);
      document.documentElement.dataset.showcaseAnnotation = revealed
        ? activeShowcaseAnnotation.annotation.name
        : "hidden";
    }

    function renderShowcase(timestamp) {
      showcaseStartedAt ??= timestamp;
      const frameCount = SHOWCASE_PRESET.targetFps * SHOWCASE_PRESET.durationMs / 1000;
      const rawProgress = ((timestamp - showcaseStartedAt) % SHOWCASE_PRESET.durationMs) / SHOWCASE_PRESET.durationMs;
      const progress = Math.floor(rawProgress * frameCount) / frameCount;
      applyShowcaseCamera(progress);
      render(timestamp);
      if (showcaseDetails) updateShowcaseAnnotation(timestamp);
      document.documentElement.dataset.showcaseReady = "true";
      if (!reducedMotionQuery.matches) animationFrame = requestAnimationFrame(renderShowcase);
    }

    function startShowcase() {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      showcaseStartedAt = null;
      showcaseAnnotationSlot = -1;
      activeShowcaseAnnotation = null;
      if (reducedMotionQuery.matches) {
        if (showcaseAnnotation) showcaseAnnotation.hidden = true;
        hideShowcaseAnnotation();
        applyShowcaseCamera(0);
        render(performance.now());
        document.documentElement.dataset.showcaseReady = "true";
        document.documentElement.dataset.showcaseMotion = "reduced";
      } else {
        if (showcaseAnnotation) showcaseAnnotation.hidden = !showcaseDetails || !renderedShowcaseAnnotations.length;
        document.documentElement.dataset.showcaseMotion = "active";
        animationFrame = requestAnimationFrame(renderShowcase);
      }
    }

    function populateShowcaseStats() {
      if (!showcaseDetails) return;
      const core = model.categoryStats?.core || [0, 0, 0, 0];
      const tests = model.categoryStats?.tests || [0, 0, 0, 0];
      const format = value => Number(value || 0).toLocaleString("en-US");
      const counted = (value, singular, plural) => `${format(value)} ${Number(value || 0) === 1 ? singular : plural}`;
      ["classes", "modules", "methods", "constants"].forEach((metric, index) => {
        document.getElementById(`cinema-${metric}`).textContent = format(core[index]);
      });
      const stats = document.querySelector(".cinema-stats");
      const secondary = document.getElementById("cinema-secondary");
      secondary.textContent = `Tests · ${counted(tests[0], "class", "classes")} · ${counted(tests[2], "method", "methods")}   ·   ${counted(totals.packages, "dependency gem", "dependency gems")} in orbit`;
      stats.hidden = false;
      secondary.hidden = false;
    }

    function setDrifting(next) {
      if (next) cancelCameraFlight();
      drifting = next;
      lastDriftTimestamp = null;
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
      else if (event.key === "0") goHome();
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
    document.getElementById("motion").addEventListener("click", () => setDrifting(!drifting));
    document.getElementById("pan-mode").addEventListener("click", () => { cancelCameraFlight(); setNavigationMode(navigationMode === "pan" ? "orbit" : "pan"); });
    document.getElementById("zoom-in").addEventListener("click", () => { if (pointers.size === 0) { cancelCameraFlight(); zoomBetween(zoom * ZOOM_STEP, sceneCenterX, sceneCenterY); } requestRender(); });
    document.getElementById("zoom-out").addEventListener("click", () => { if (pointers.size === 0) { cancelCameraFlight(); zoomBetween(zoom / ZOOM_STEP, sceneCenterX, sceneCenterY); } requestRender(); });
    document.getElementById("view").addEventListener("click", goHome);
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
      document.getElementById("showcase-cosmos")?.setAttribute("aria-label", showcaseLabel);
      populateShowcaseStats();
      reducedMotionQuery.addEventListener("change", startShowcase);
      configureShowcaseStage();
      resize();
      startShowcase();
    } else {
      document.title = `RubyLens · ${model.projectName}`;
      canvas.setAttribute("aria-label", `Interactive three-dimensional stellar artwork of ${model.projectName}. Hover class and module stars for Ruby code details or gem clouds for package summaries. Sidebar highlights open a top-down view. Double-click a gem cloud, press Enter or F on a selected gem marker, or tap that marker again to expand its stars. Drag to orbit, Shift-drag or Pan mode to move, scroll or pinch to zoom at a point, and use arrow keys to move the view. Escape exits a focused gem system.`);
      document.getElementById("coverage").textContent = `${renderedDependencyStars.toLocaleString()} dependency stars shown`;
      populateWarningDisclosure();
      setDrifting(drifting);
      setNavigationMode(navigationMode);
      createExplorer();
      initializeSearch();
      setPanelCollapsed(window.matchMedia("(max-width: 760px)").matches);
      resize();
    }
