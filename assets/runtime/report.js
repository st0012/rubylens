    "use strict";
    const model = JSON.parse(atob("{{MODEL_BASE64}}"));
    const showcaseMode = document.body.dataset.rubylensMode === "showcase";
    const showcaseDetails = showcaseMode && model.details === true;
    const interactiveMode = !showcaseMode;
    const canvas = document.getElementById("cosmos");
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
    const helpOverlay = document.getElementById("shortcuts-help");
    const helpClose = document.getElementById("help-close");
    let helpReturnFocus = null;
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
    let width = 0, height = 0, dpr = 1, sceneRight = 0, sceneBottom = 0, sceneCenterX = 0, sceneCenterY = 0, yaw = -.36, pitch = .34, zoom = 1, panX = 0, panY = 0, dragging = false, gesture = null, pinchState = null, animationFrame = 0, hoverFrame = 0, pendingHover = null, selectedPoint = null, selectionLocked = false, focusedCategory = null, expandedSystemIndex = null, expandedPackageIndex = null, activeFactButton = null, navigationMode = "orbit", cameraFlight = null, showcaseStartedAt = null, showcaseRenderer = null, showcaseAnnotationSlot = -1, activeShowcaseAnnotation = null;
    const MIN_ZOOM = .35, MAX_ZOOM = 40, ZOOM_STEP = 1.7, DEPENDENCY_EXPANSION = 2.35, SHOWCASE_POINT_LIMIT = 50_000;
    const CORE_SCALE_BASELINE = 3_000;
    const MORPHOLOGY_FAMILY = Object.freeze({ elliptical: 0, lenticular: 1, spiral: 2, barredSpiral: 3, irregular: 4 });
    const MORPHOLOGY_FAMILY_LABELS = Object.freeze(["Elliptical galaxy", "Lenticular galaxy", "Spiral galaxy", "Barred spiral galaxy", "Irregular galaxy"]);
    const LEGACY_MORPHOLOGY = Object.freeze({
      legacy: true,
      family: MORPHOLOGY_FAMILY.spiral,
      ellipticity: 0,
      bulgeShare: .24,
      armCount: 3,
      winding: .105,
      armFraction: .38,
      barLength: 0,
      clumpCount: 0,
      clumpSpread: 0,
      phaseSeed: 0,
      phase: 0,
    });
    const RSPEC_PROXY_PREFIX = "RSpec example group #";
    const DEFAULT_CAMERA = Object.freeze({ yaw: -.36, pitch: .34, zoom: 2, panX: 0, panY: 0 });
    const DEFAULT_ROTATION_DIRECTION = "clockwise";
    const DRIFT_RADIANS_PER_SECOND = .04125;
    const MAX_DRIFT_DELTA_MS = 50;
    const SEARCH_DEBOUNCE_MS = 120;
    const SEARCH_RESULT_LIMIT = 24;
    const SEARCH_BATCH_SIZE = 8;
    const WARNING_ROW_LIMIT = 24;
    let lastDriftTimestamp = null;
    let doubleClickTarget = null;
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
    const SHOWCASE_WIDESCREEN_LAYOUT_PRESET = Object.freeze({
      "minimumFittedWidth": 1600,
      "minimumAspectRatio": 1.6,
      "centerXPercent": 49,
      "centerYPercent": 54,
      "textScalePercent": 44,
      "layoutReferenceWidth": 720,
      "mastheadLeft": 44,
      "mastheadTop": 17,
      "mastheadWidth": 420
    });
    const SHOWCASE_DEFAULT_LAYOUT_PRESET = Object.freeze({
      "centerXPercent": SHOWCASE_PRESET.centerXPercent,
      "centerYPercent": SHOWCASE_PRESET.centerYPercent,
      "textScalePercent": SHOWCASE_PRESET.textScalePercent,
      "layoutReferenceWidth": SHOWCASE_PRESET.layoutReferenceWidth,
      "mastheadLeft": SHOWCASE_PRESET.mastheadLeft,
      "mastheadTop": SHOWCASE_PRESET.mastheadTop,
      "mastheadWidth": SHOWCASE_PRESET.mastheadWidth
    });
    let activeShowcaseLayout = SHOWCASE_DEFAULT_LAYOUT_PRESET;
    const SHOWCASE_DEPENDENCY_PRESET = Object.freeze({
      "starSizeScale": 1.5,
      "starAlphaScale": 1.2
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
    const CONTEXT_TARGET_X = .32;
    const CONTEXT_CORE_X = .68;
    const CONTEXT_CENTER_Y = .48;
    const contextVisibility = { selection: .75, category: .16, package: .75 };
    const pointers = new Map();
    const visibleCategories = { core: true, tests: true, dependencies: true };
    const visibilityInputs = {};
    const focusButtons = {};
    const excludedTriviaNames = new Set(["Object", "Kernel", "BasicObject"]);
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let driftRequested = interactiveMode;
    let drifting = driftRequested && !reducedMotionQuery.matches;
    const colours = { core: [244, 82, 132], tests: [87, 204, 255], dependencies: [255, 184, 77] };
    const whiteHotColour = [255, 248, 244];
    const whiteHotRgb = whiteHotColour.join(",");
    const glslVec3 = rgb => `vec3(${rgb.map(channel => channel.toFixed(1)).join(", ")})`;
    const colourStyles = Object.fromEntries(Object.entries(colours).map(([category, rgb]) => [category, `rgb(${rgb.join(",")})`]));
    const projectionScratch = [0, 0, 0];
    let zoomReadout = null;
    let zoomReadoutText = "";
    const showcaseAnnotationData = showcaseDetails && Array.isArray(model.annotations)
      ? model.annotations.slice(0, SHOWCASE_ANNOTATION_PRESET.limit)
      : [];
    const showcaseAnnotationKey = (category, anchor) => `${category}:${anchor}`;
    const showcaseAnnotationAnchors = new Set(showcaseAnnotationData.map(annotation => showcaseAnnotationKey(annotation.category, annotation.anchor)));
    const showcasePinnedNamespaceAnchors = new Set(showcaseDetails && Array.isArray(model.pinnedNamespaceAnchors)
      ? model.pinnedNamespaceAnchors
      : []);
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
    function decodeMorphology(raw) {
      const row = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray(raw.knobs)
          ? [raw.family, ...raw.knobs]
          : null;
      if (!row || row.length !== 10 || !row.every(Number.isInteger)) return LEGACY_MORPHOLOGY;
      const family = row[0];
      if (family < MORPHOLOGY_FAMILY.elliptical || family > MORPHOLOGY_FAMILY.irregular) return LEGACY_MORPHOLOGY;
      if (row[9] < 0 || row[9] > 0xffff_ffff) return LEGACY_MORPHOLOGY;
      const legacy = family === MORPHOLOGY_FAMILY.spiral &&
        row.slice(1).every((value, index) => value === [0, 240, 3, 105, 380, 0, 0, 0, 0][index]);
      const phaseSeed = row[9] >>> 0;
      return Object.freeze({
        legacy,
        family,
        ellipticity: family === MORPHOLOGY_FAMILY.elliptical ? clamp(row[1], 0, 700) / 1000 : 0,
        bulgeShare: [MORPHOLOGY_FAMILY.lenticular, MORPHOLOGY_FAMILY.spiral, MORPHOLOGY_FAMILY.barredSpiral].includes(family)
          ? clamp(row[2], 80, 600) / 1000
          : 0,
        armCount: family === MORPHOLOGY_FAMILY.spiral
          ? clamp(row[3], 2, 6)
          : family === MORPHOLOGY_FAMILY.barredSpiral ? clamp(row[3], 2, 4) : 0,
        winding: [MORPHOLOGY_FAMILY.spiral, MORPHOLOGY_FAMILY.barredSpiral].includes(family) ? clamp(row[4], 40, 220) / 1000 : 0,
        armFraction: [MORPHOLOGY_FAMILY.spiral, MORPHOLOGY_FAMILY.barredSpiral].includes(family) ? clamp(row[5], 0, 800) / 1000 : 0,
        barLength: family === MORPHOLOGY_FAMILY.barredSpiral ? clamp(row[6], 100, 700) / 1000 : 0,
        clumpCount: family === MORPHOLOGY_FAMILY.irregular ? clamp(row[7], 2, 5) : 0,
        clumpSpread: family === MORPHOLOGY_FAMILY.irregular ? clamp(row[8], 250, 1000) / 1000 : 0,
        phaseSeed,
        phase: unit(phaseSeed, 80) * Math.PI * 2,
      });
    }
    const morphology = decodeMorphology(model.morphology);
    const spiralMorphology = morphology.family === MORPHOLOGY_FAMILY.spiral || morphology.family === MORPHOLOGY_FAMILY.barredSpiral;
    function screenRotationYawSign(pitchRadians) {
      const clockwiseSign = Math.sin(pitchRadians) > 0 ? -1 : 1;
      return DEFAULT_ROTATION_DIRECTION === "clockwise" ? clockwiseSign : -clockwiseSign;
    }

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

    function layoutMetricsForCoreCount(coreCount, activeMorphology) {
      const coreRatio = Math.max(1, coreCount / CORE_SCALE_BASELINE);
      const disk = Math.pow(coreRatio, .45);
      const tests = disk;
      const cameraScale = Math.pow(tests, .8);
      let coreExtent = 42;
      let testExtent = 62;
      if (!activeMorphology.legacy) {
        if (activeMorphology.family === MORPHOLOGY_FAMILY.elliptical) {
          coreExtent = 36;
          testExtent = 52;
        } else if (activeMorphology.family === MORPHOLOGY_FAMILY.lenticular) {
          const discProgress = clamp((.42 - activeMorphology.bulgeShare) / .08, 0, 1);
          coreExtent = 42 + 2 * discProgress;
          testExtent = 54 + 4 * discProgress;
        } else if (activeMorphology.family === MORPHOLOGY_FAMILY.irregular) {
          const centerSpread = 12 + 18 * activeMorphology.clumpSpread;
          coreExtent = centerSpread + 24;
          testExtent = centerSpread + 32;
        }
      }
      return Object.freeze({
        disk,
        bulge: Math.pow(coreRatio, .35),
        tests,
        cameraScale,
        cameraDistance: 270 * cameraScale * testExtent / 62,
        cameraFocalLength: 440,
        coreOuterRadius: coreExtent * disk,
        testOuterRadius: testExtent * tests,
        dependencyInnerRadius: testExtent * tests + 8,
      });
    }

    const coreCount = model.namespaces.reduce((count, row) => count + (row[3] === 1 ? 0 : 1), 0);
    const layoutScale = layoutMetricsForCoreCount(coreCount, morphology);
    const cameraDistance = layoutScale.cameraDistance;
    const cameraFocalLength = layoutScale.cameraFocalLength;

    const irregularClumpCenters = morphology.family === MORPHOLOGY_FAMILY.irregular && !morphology.legacy
      ? Array.from({ length: morphology.clumpCount }, (_, index) => {
          const centerSpread = 12 + 18 * morphology.clumpSpread;
          const angle = morphology.phase + index * Math.PI * 2 / morphology.clumpCount + (unit(morphology.phaseSeed, 90 + index * 3) - .5) * .8;
          const distance = centerSpread * (.42 + unit(morphology.phaseSeed, 91 + index * 3) * .58);
          return [
            Math.cos(angle) * distance,
            normal(morphology.phaseSeed, 92 + index * 3) * centerSpread * .12,
            Math.sin(angle) * distance,
            angle,
          ];
        })
      : [];

    function spheroidPosition(seed, outerShell) {
      const radius = outerShell
        ? 28 + 24 * Math.pow(unit(seed, 3), .72)
        : 36 * Math.pow(unit(seed, 3), 1.7);
      const polar = unit(seed, 4) * 2 - 1;
      const equatorial = Math.sqrt(Math.max(0, 1 - polar * polar));
      const theta = morphology.phase + unit(seed, 5) * Math.PI * 2;
      const scale = outerShell ? layoutScale.tests : layoutScale.disk;
      return [
        Math.cos(theta) * equatorial * radius * scale,
        polar * radius * (1 - morphology.ellipticity) * scale,
        Math.sin(theta) * equatorial * radius * scale,
      ];
    }

    function spiralArmTheta(seed, radial, channel) {
      const arm = Math.floor(unit(seed, channel) * morphology.armCount);
      const scatter = .22 - (morphology.armCount - 2) * .025;
      let origin;
      let armRadial = radial;
      if (morphology.family === MORPHOLOGY_FAMILY.barredSpiral) {
        const barEnd = arm % 2;
        const branch = Math.floor(arm / 2);
        const branchesAtEnd = Math.ceil((morphology.armCount - barEnd) / 2);
        const branchOffset = (branch - (branchesAtEnd - 1) / 2) * Math.PI / Math.max(3, morphology.armCount);
        origin = morphology.phase + barEnd * Math.PI + branchOffset;
        armRadial = Math.max(0, radial - (12 + morphology.barLength * 24) * .55);
      } else {
        origin = morphology.phase + arm * Math.PI * 2 / morphology.armCount;
      }
      return origin + armRadial * morphology.winding + normal(seed, channel + 1) * scatter;
    }

    function irregularPosition(seed, outer) {
      const clumpIndex = Math.min(irregularClumpCenters.length - 1, Math.floor(unit(seed, 52) * irregularClumpCenters.length));
      const center = irregularClumpCenters[clumpIndex] || [0, 0, 0, morphology.phase];
      const localSpread = outer ? 10 : 7.5;
      const along = clamp(normal(seed, 53), -2.6, 2.6) * localSpread;
      const across = clamp(normal(seed, 55), -2.6, 2.6) * localSpread * .62;
      const vertical = center[1] + clamp(normal(seed, 57), -2.6, 2.6) * localSpread * .38;
      const cos = Math.cos(center[3]), sin = Math.sin(center[3]);
      const scale = outer ? layoutScale.tests : layoutScale.disk;
      return [
        (center[0] + cos * along - sin * across) * scale,
        vertical * scale,
        (center[2] + sin * along + cos * across) * scale,
      ];
    }

    function barredCorePosition(seed, vertical, scale) {
      const halfLength = 12 + morphology.barLength * 24;
      const along = (unit(seed, 34) * 2 - 1) * halfLength;
      const across = normal(seed, 35) * (1 + Math.abs(along) * .025);
      const cos = Math.cos(morphology.phase), sin = Math.sin(morphology.phase);
      return [
        (cos * along - sin * across) * scale,
        vertical * scale,
        (sin * along + cos * across) * scale,
      ];
    }

    function coreDiscUsesArm(seed, bulge) {
      return !bulge &&
        spiralMorphology &&
        unit(seed, 30) < morphology.armFraction;
    }

    function corePosition(seed) {
      if (morphology.legacy) {
        const bulge = unit(seed, 2) < .24;
        const radial = bulge ? 17 * Math.pow(unit(seed, 3), 1.75) : Math.min(42, -10 * Math.log(Math.max(1e-5, 1 - unit(seed, 3))));
        const theta = unit(seed, 4) * Math.PI * 2 + radial * .04;
        const vertical = normal(seed, 5) * (bulge ? 5.8 : 1.4 + radial * .025);
        const scale = bulge ? layoutScale.bulge : layoutScale.disk;
        return [Math.cos(theta) * radial * scale, vertical * scale, Math.sin(theta) * radial * scale];
      }
      if (morphology.family === MORPHOLOGY_FAMILY.elliptical) return spheroidPosition(seed, false);
      if (morphology.family === MORPHOLOGY_FAMILY.irregular) return irregularPosition(seed, false);

      const bulge = unit(seed, 2) < morphology.bulgeShare;
      const discLimit = morphology.family === MORPHOLOGY_FAMILY.lenticular ? layoutScale.coreOuterRadius / layoutScale.disk : 42;
      const radial = bulge ? 17 * Math.pow(unit(seed, 3), 1.75) : Math.min(discLimit, -10 * Math.log(Math.max(1e-5, 1 - unit(seed, 3))));
      const vertical = normal(seed, 5) * (bulge ? 5.8 : 1.4 + radial * .025);
      const scale = bulge ? layoutScale.bulge : layoutScale.disk;
      if (!bulge && morphology.family === MORPHOLOGY_FAMILY.barredSpiral && radial < 12 + morphology.barLength * 24 && unit(seed, 33) < .72) {
        return barredCorePosition(seed, vertical, scale);
      }
      const inArm = coreDiscUsesArm(seed, bulge);
      const theta = inArm
        ? spiralArmTheta(seed, radial, 31)
        : morphology.phase + unit(seed, 4) * Math.PI * 2 + radial * .04;
      return [Math.cos(theta) * radial * scale, vertical * scale, Math.sin(theta) * radial * scale];
    }

    function testPosition(seed) {
      if (morphology.legacy) {
        const radial = 17 + Math.min(45, -14 * Math.log(Math.max(1e-5, 1 - unit(seed, 7))));
        const arm = Math.floor(unit(seed, 8) * 3);
        const inArm = unit(seed, 9) < .38;
        const theta = inArm
          ? arm * (Math.PI * 2 / 3) + radial * .105 + normal(seed, 10) * .22
          : unit(seed, 10) * Math.PI * 2;
        const vertical = normal(seed, 11) * (1.4 + radial * .035);
        return [Math.cos(theta) * radial * layoutScale.tests, vertical * layoutScale.tests, Math.sin(theta) * radial * layoutScale.tests];
      }
      if (morphology.family === MORPHOLOGY_FAMILY.elliptical) return spheroidPosition(seed, true);
      if (morphology.family === MORPHOLOGY_FAMILY.irregular) return irregularPosition(seed, true);

      const radial = morphology.family === MORPHOLOGY_FAMILY.lenticular
        ? 16 + Math.min(layoutScale.testOuterRadius / layoutScale.tests - 16, -13 * Math.log(Math.max(1e-5, 1 - unit(seed, 7))))
        : 17 + Math.min(45, -14 * Math.log(Math.max(1e-5, 1 - unit(seed, 7))));
      const inArm = spiralMorphology && unit(seed, 9) < morphology.armFraction;
      const theta = inArm
        ? spiralArmTheta(seed, radial, 8)
        : morphology.phase + unit(seed, 10) * Math.PI * 2;
      const vertical = normal(seed, 11) * (1.4 + radial * .035);
      return [Math.cos(theta) * radial * layoutScale.tests, vertical * layoutScale.tests, Math.sin(theta) * radial * layoutScale.tests];
    }

    const dependencySystems = Array.isArray(model.dependencySystems) ? model.dependencySystems : [];
    const systemMembers = Array.from({ length: dependencySystems.length }, () => []);
    const packageMemberOrdinals = new Array(model.packages.length).fill(-1);
    model.packages.forEach((row, packageIndex) => {
      const systemIndex = Number(row[8]);
      if (!Number.isInteger(systemIndex) || systemIndex < 0 || systemIndex >= systemMembers.length) return;
      packageMemberOrdinals[packageIndex] = systemMembers[systemIndex].length;
      systemMembers[systemIndex].push(packageIndex);
    });
    const systemAggregates = systemMembers.map(packageIndexes => {
      const aggregate = { declarationCount: 0, directCount: 0, rubyCounts: [0, 0, 0, 0] };
      for (const packageIndex of packageIndexes) {
        const row = model.packages[packageIndex];
        aggregate.declarationCount += Number(row[3]) || 0;
        aggregate.directCount += row[1] === 0 ? 1 : 0;
        for (let index = 0; index < aggregate.rubyCounts.length; index += 1) aggregate.rubyCounts[index] += Number(row[index + 4]) || 0;
      }
      return aggregate;
    });
    const dependencyAnchor = (seed, declarationCount) => {
      const radius = layoutScale.dependencyInnerRadius + 72 * Math.sqrt(layoutScale.tests) * Math.pow(unit(seed, 14), .72);
      const theta = unit(seed, 15) * Math.PI * 2;
      const vertical = normal(seed, 16) * 24 * Math.sqrt(layoutScale.tests);
      return [Math.cos(theta) * radius, vertical, Math.sin(theta) * radius, 1.6 + Math.min(9, Math.sqrt(declarationCount) * .055)];
    };
    const systemAnchors = dependencySystems.map((row, index) => {
      const anchor = dependencyAnchor(row[0], systemAggregates[index]?.declarationCount || 0);
      anchor[3] += Math.min(5, systemMembers[index].length * .65);
      anchor.push(index);
      return anchor;
    });
    const packageAnchors = model.packages.map((row, index) => {
      const systemIndex = Number(row[8]);
      const cloudRadius = 1.6 + Math.min(9, Math.sqrt(row[3]) * .055);
      if (!Number.isInteger(systemIndex) || systemIndex < 0 || !systemAnchors[systemIndex]) {
        return [...dependencyAnchor(row[0], row[3]), index, -1];
      }

      const parent = systemAnchors[systemIndex];
      const memberCount = systemMembers[systemIndex].length;
      const ordinal = packageMemberOrdinals[index];
      const phase = unit(dependencySystems[systemIndex][0], 22) * Math.PI * 2;
      const theta = phase + ordinal * Math.PI * 2 / memberCount;
      const spread = Math.max(3.4, parent[3] * .58) * (.72 + unit(row[0], 23) * .18);
      const vertical = normal(row[0], 24) * Math.max(1, spread * .16);
      return [
        parent[0] + Math.cos(theta) * spread,
        parent[1] + vertical,
        parent[2] + Math.sin(theta) * spread,
        cloudRadius,
        index,
        systemIndex,
      ];
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
      const packageHubs = [];
      const systemHubs = [];
      const addPoint = (point, interactive = true) => {
        point.sizeFactor = point.base * (.62 + point.signal * .46);
        point.maxSize = point.hub ? 5.2 : 3.2;
        point.alphaBase = clamp(.14 + point.signal * .105, .12, point.hub ? .86 : .7);
        point.screen = null;
        points.push(point);
        if (interactive && interactiveMode) interactivePoints.push(point);
        if (point.hub) dependencyHubs.push(point);
        if (point.packageHub) packageHubs.push(point);
        if (point.systemHub) systemHubs.push(point);
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
          if (showcaseAnnotationAnchors.has(annotationKey) || showcasePinnedNamespaceAnchors.has(index)) {
            showcasePointsByAnchor.set(annotationKey, point);
          }
        }
        addPoint(point, !name.startsWith(RSPEC_PROXY_PREFIX));
      });
      model.dependencyStars.forEach(row => {
        const values = row.slice(2, 8);
        const packageIndex = row[1];
        addPoint({ category: "dependencies", packageIndex, systemIndex: Number(model.packages[packageIndex]?.[8] ?? -1), seed: row[0], position: dependencyPosition(row[0], packageIndex), signal: weightedSignal(normalizedSignals(values), "dependencies"), base: .45 }, false);
      });
      systemAnchors.forEach((anchor, index) => {
        const systemRow = dependencySystems[index];
        const aggregate = systemAggregates[index];
        const visualValues = [0, aggregate.declarationCount, 0, 0, 0, 0];
        const point = { category: "dependencies", systemIndex: index, seed: systemRow[0], position: anchor.slice(0, 3), signal: weightedSignal(normalizedSignals(visualValues), "dependencies"), base: 2.15, hub: true, systemHub: true };
        if (interactiveMode) Object.assign(point, { name: model.packageNames[systemRow[1]], memberCount: systemMembers[index].length, directMemberCount: aggregate.directCount, rubyCounts: aggregate.rubyCounts });
        addPoint(point);
      });
      packageAnchors.forEach((anchor, index) => {
        const packageRow = model.packages[index];
        const systemIndex = Number(packageRow[8]);
        const rubyCounts = packageRow.slice(4, 8);
        const visualValues = [0, packageRow[3], 0, 0, 0, 0];
        const point = { category: "dependencies", packageIndex: index, systemIndex, seed: packageRow[0], position: anchor.slice(0, 3), signal: weightedSignal(normalizedSignals(visualValues), "dependencies"), base: systemIndex >= 0 ? 1.55 : 1.8, hub: true, packageHub: true };
        if (interactiveMode) Object.assign(point, { name: model.packageNames[index], packageRole: packageRow[1] === 0 ? "Direct dependency" : "Transitive dependency", packageLocation: packageRow[2] === 0 ? "Workspace package" : "External gem", rubyCounts, groupedMemberCount: systemIndex >= 0 ? systemMembers[systemIndex].length : 0 });
        if (showcaseDetails) {
          const annotationKey = showcaseAnnotationKey("dependencies", index);
          if (showcaseAnnotationAnchors.has(annotationKey)) showcasePointsByAnchor.set(annotationKey, point);
        }
        addPoint(point);
      });
      return { points, interactivePoints, dependencyHubs, packageHubs, systemHubs };
    }
    const { points, interactivePoints, dependencyHubs, packageHubs, systemHubs } = buildPoints();
    function showcasePointSample() {
      if (!showcaseMode || points.length <= SHOWCASE_POINT_LIMIT) return points;
      const rank = point => [hash(point.seed, 73), point.seed, point];
      const sample = (candidates, limit) => candidates.map(rank)
        .sort((left, right) => left[0] - right[0] || left[1] - right[1])
        .slice(0, limit)
        .map(candidate => candidate[2]);
      const pinned = showcaseDetails ? Array.from(showcasePointsByAnchor.values()) : [];
      const pinnedPoints = new Set(pinned);
      const hubs = points.filter(point => point.hub && !pinnedPoints.has(point));
      const availableAfterPins = Math.max(0, SHOWCASE_POINT_LIMIT - pinned.length);
      if (hubs.length >= availableAfterPins) {
        return sample(hubs, availableAfterPins).concat(pinned);
      }
      const availableAfterHubs = Math.max(0, availableAfterPins - hubs.length);
      const unpinnedStars = points.filter(point => !point.hub && !pinnedPoints.has(point));
      const dependencyStars = unpinnedStars.filter(point => point.category === "dependencies");
      if (dependencyStars.length >= availableAfterHubs) {
        return sample(dependencyStars, availableAfterHubs).concat(hubs, pinned);
      }
      const namespacePoints = unpinnedStars.filter(point => point.category !== "dependencies");
      const availableAfterDependencies = Math.max(0, availableAfterHubs - dependencyStars.length);
      return sample(namespacePoints, availableAfterDependencies).concat(dependencyStars, hubs, pinned);
    }
    const renderPoints = showcasePointSample();
    const totals = model.totals || {
      namespaces: model.namespaces.length,
      packages: model.packages.length,
      dependencyStars: model.dependencyStars.length,
      renderedDependencyStars: model.dependencyStars.length,
    };
    const exactDependencyDeclarations = Math.max(0, Number(totals.dependencyStars) || 0);
    const embeddedDependencyDeclarations = model.dependencyStars.length;
    let plottedDependencyDeclarations = embeddedDependencyDeclarations;
    function dependencyCoverageText(plotted, embedded, exact, packageCount, rendererUnavailable = false) {
      const formattedPlotted = plotted.toLocaleString();
      const formattedEmbedded = embedded.toLocaleString();
      const formattedExact = exact.toLocaleString();
      const gems = `${packageCount.toLocaleString()} ${packageCount === 1 ? "gem" : "gems"}`;
      if (rendererUnavailable) {
        if (embedded < exact) {
          return `WebGL2 is required to plot this report's ${formattedEmbedded} sampled dependency declarations (of ${formattedExact} across ${gems})`;
        }
        return `WebGL2 is required to plot ${formattedExact} dependency declaration${exact === 1 ? "" : "s"} across ${gems}`;
      }
      if (plotted < exact) {
        return `${formattedPlotted} sampled dependency declarations plotted (of ${formattedExact} across ${gems})`;
      }
      return `${formattedPlotted} dependency declaration${plotted === 1 ? "" : "s"} plotted across ${gems}`;
    }

    function dependencySamplingState(exact, embedded, packageCount) {
      if (embedded >= exact) return null;
      const gems = `${packageCount.toLocaleString()} ${packageCount === 1 ? "gem" : "gems"}`;
      return {
        summary: "Dependency sampling",
        title: "Report data",
        countLabel: `${embedded.toLocaleString()} embedded`,
        note: `This report embeds ${embedded.toLocaleString()} sampled dependency declarations of ${exact.toLocaleString()}. Exact totals across ${gems} remain complete.`,
      };
    }

    function updateDependencyCoverage() {
      const coverage = document.getElementById("coverage");
      if (!coverage) return;
      const rendererUnavailable = document.documentElement.dataset.explorerRenderer === "unavailable";
      coverage.textContent = dependencyCoverageText(plottedDependencyDeclarations, embeddedDependencyDeclarations, exactDependencyDeclarations, totals.packages, rendererUnavailable);
    }

    function updateGalaxySummary() {
      const summary = document.getElementById("galaxy-summary");
      if (document.documentElement.dataset.explorerRenderer === "unavailable") {
        summary.textContent = `${MORPHOLOGY_FAMILY_LABELS[morphology.family]} · WebGL2 required`;
        return;
      }
      summary.textContent = `${MORPHOLOGY_FAMILY_LABELS[morphology.family]} - ${renderPoints.length.toLocaleString("en-US")} ${renderPoints.length === 1 ? "star" : "stars"}`;
    }

    function disableExplorerControls() {
      document.querySelectorAll("button").forEach(button => { if (button !== panelToggle) button.disabled = true; });
      document.querySelectorAll("#controls input").forEach(input => { input.disabled = true; });
      document.querySelector(".toolbar").hidden = true;
      searchInput.disabled = true;
      searchRegion.hidden = true;
      searchResults.hidden = true;
      canvas.removeAttribute("tabindex");
      canvas.style.pointerEvents = "none";
      canvas.style.cursor = "default";
      const hint = document.querySelector(".hint");
      if (hint) hint.textContent = "WebGL2 is required to view this report";
    }

    function markExplorerUnavailable(reason, error = null) {
      const activeElement = document.activeElement;
      const hadInteractiveFocus = !helpOverlay.hidden || activeElement === canvas || Boolean(activeElement?.closest?.(".toolbar, #controls, #explorer-search-region"));
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      animationFrame = 0;
      hoverFrame = 0;
      pendingHover = null;
      pointers.clear();
      gesture = null;
      pinchState = null;
      dragging = false;
      cameraFlight = null;
      drifting = false;
      driftRequested = false;
      lastDriftTimestamp = null;
      selectedPoint = null;
      selectionLocked = false;
      doubleClickTarget = null;
      tooltip.hidden = true;
      canvas.classList.remove("is-dragging-pan", "is-star");
      if (!helpOverlay.hidden) closeHelp();
      plottedDependencyDeclarations = 0;
      document.documentElement.dataset.explorerRenderer = "unavailable";
      document.documentElement.dataset.explorerUnavailableReason = reason;
      document.documentElement.dataset.dependencySampling = String(embeddedDependencyDeclarations < exactDependencyDeclarations);
      document.documentElement.dataset.embeddedDependencySampling = String(embeddedDependencyDeclarations < exactDependencyDeclarations);
      document.documentElement.dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations);
      document.documentElement.dataset.plottedScenePoints = "0";
      if (error) document.documentElement.dataset.explorerRendererError = error.message;
      canvas.setAttribute("aria-label", "Interactive artwork unavailable because WebGL2 is required.");
      disableExplorerControls();
      updateDependencyCoverage();
      updateGalaxySummary();
      populateWarningDisclosure();
      if (hadInteractiveFocus) document.getElementById("warning-summary").focus({ preventScroll: true });
    }
    const renderedShowcaseAnnotations = showcaseAnnotationData.map(annotation => {
      const point = showcasePointsByAnchor.get(showcaseAnnotationKey(annotation.category, annotation.anchor));
      return point ? Object.freeze({ ...annotation, point }) : null;
    }).filter(Boolean);

    const FULLSCREEN_TRIANGLE_VERTEX_SOURCE = `#version 300 es
        precision highp float;
        const vec2 POSITIONS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
        void main() { gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0); }
      `;

    const POINT_FRAGMENT_SOURCE = `#version 300 es
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
      `;

    function compileGlShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "Unknown WebGL shader error";
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    function createGlProgram(gl, vertexSource, fragmentSource) {
      const program = gl.createProgram();
      const vertex = compileGlShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fragment = compileGlShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
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

      const createProgram = (vertexSource, fragmentSource) => createGlProgram(gl, vertexSource, fragmentSource);

      const backgroundProgram = createProgram(FULLSCREEN_TRIANGLE_VERTEX_SOURCE, `#version 300 es
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
            ? ${glslVec3(colours.core)} / 255.0
            : (a_category < 1.5 ? ${glslVec3(colours.tests)} / 255.0 : ${glslVec3(colours.dependencies)} / 255.0);

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
            colour = ${glslVec3(whiteHotColour)} / 255.0;
          }

          gl_Position = vec4(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0, 0.0, 1.0);
          gl_PointSize = max(1.0, radius * 2.0);
          v_colour = colour;
          v_alpha = alpha;
          v_radius = radius;
        }
      `, POINT_FRAGMENT_SOURCE);

      const pointData = new Float32Array(renderPoints.length * 7);
      const categoryIndex = { core: 0, tests: 1, dependencies: 2 };
      renderPoints.forEach((point, index) => {
        const offset = index * 7;
        const dependencyStar = point.category === "dependencies" && !point.hub;
        const sizeScale = dependencyStar ? SHOWCASE_DEPENDENCY_PRESET.starSizeScale : 1;
        const alphaScale = dependencyStar ? SHOWCASE_DEPENDENCY_PRESET.starAlphaScale : 1;
        pointData[offset] = point.position[0];
        pointData[offset + 1] = point.position[1];
        pointData[offset + 2] = point.position[2];
        pointData[offset + 3] = point.sizeFactor * sizeScale;
        pointData[offset + 4] = clamp(point.alphaBase * alphaScale, 0, 1);
        pointData[offset + 5] = categoryIndex[point.category];
        pointData[offset + 6] = point.maxSize;
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

    function createExplorerRenderer() {
      const liveCanvas = document.createElement("canvas");
      liveCanvas.id = "explorer-cosmos";
      liveCanvas.setAttribute("aria-hidden", "true");
      canvas.insertAdjacentElement("beforebegin", liveCanvas);
      const gl = liveCanvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        depth: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      if (!gl) {
        liveCanvas.remove();
        document.documentElement.dataset.explorerUnavailableReason = "webgl2-unavailable";
        return null;
      }
      // Largest sprite is an unexpanded hub glow: radius 5.2 * 3.4 CSS pixels.
      const maxSpriteCssSize = 5.2 * 3.4 * 2 + 2;
      const pointSizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      if (pointSizeRange[1] < maxSpriteCssSize) {
        liveCanvas.remove();
        document.documentElement.dataset.explorerUnavailableReason = "webgl2-point-size-range";
        return null;
      }
      let rendererDpr = 1;

      const backgroundProgram = createGlProgram(gl, FULLSCREEN_TRIANGLE_VERTEX_SOURCE, `#version 300 es
        precision highp float;
        uniform vec2 u_resolution;
        uniform vec2 u_center;
        out vec4 outColor;
        void main() {
          vec2 pixel = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
          float radius = max(u_resolution.x, u_resolution.y) * 0.72;
          float distanceMix = clamp(distance(pixel, u_center) / radius, 0.0, 1.0);
          vec3 base = vec3(3.0, 4.0, 10.0) / 255.0;
          vec3 source = mix(vec3(30.0, 16.0, 45.0) / 255.0, vec3(0.0), distanceMix);
          float alpha = mix(0.18, 0.6, distanceMix);
          outColor = vec4(mix(base, source, alpha), 1.0);
        }
      `);

      const pointProgram = createGlProgram(gl, `#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in float a_sizeFactor;
        layout(location = 2) in float a_alpha;
        layout(location = 3) in float a_category;
        layout(location = 4) in float a_maxSize;
        layout(location = 5) in float a_packageIndex;
        layout(location = 6) in float a_systemIndex;
        uniform vec2 u_resolution;
        uniform vec2 u_center;
        uniform vec2 u_sceneBounds;
        uniform float u_yaw;
        uniform float u_pitch;
        uniform float u_zoom;
        uniform float u_cameraDistance;
        uniform float u_cameraFocalLength;
        uniform float u_exposure;
        uniform float u_deepDetail;
        uniform float u_dpr;
        uniform vec3 u_categoryVisible;
        uniform vec3 u_categoryEmphasis;
        uniform float u_expandedPackage;
        uniform float u_expandedSystem;
        uniform vec3 u_expandedAnchor;
        uniform float u_expansion;
        uniform int u_selectedIndex;
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
          int category = int(a_category + 0.5);
          if (u_categoryVisible[category] < 0.5) { hidePoint(); return; }
          vec3 position = a_position;
          bool expandedPoint = (u_expandedPackage >= 0.0 && a_packageIndex == u_expandedPackage)
            || (u_expandedSystem >= 0.0 && a_systemIndex == u_expandedSystem);
          if (expandedPoint) position = u_expandedAnchor + (position - u_expandedAnchor) * u_expansion;
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

          float perspective = u_cameraFocalLength / depth * u_zoom;
          vec2 screen = u_center + vec2(x1, y2) * perspective;
          bool selected = gl_VertexID == u_selectedIndex;
          float margin = selected ? 0.0 : 20.0;
          if (screen.x < -margin || screen.x > u_sceneBounds.x + margin || screen.y < -margin || screen.y > u_sceneBounds.y + margin) {
            hidePoint();
            return;
          }

          float size = clamp(a_sizeFactor * perspective, 0.35, a_maxSize);
          bool focusedDependencyPoint = expandedPoint && category == 2;
          float emphasis = focusedDependencyPoint || selected ? 1.0 : u_categoryEmphasis[category];
          float visibleAlpha = (focusedDependencyPoint ? max(0.34, a_alpha) : a_alpha * emphasis) * u_exposure;
          bool detailed = emphasis >= 0.1;
          float radius = size;
          float alpha = visibleAlpha;
          vec3 colour = a_category < 0.5
            ? ${glslVec3(colours.core)} / 255.0
            : (a_category < 1.5 ? ${glslVec3(colours.tests)} / 255.0 : ${glslVec3(colours.dependencies)} / 255.0);

          if (u_pass == 0) {
            if (size <= 1.35 || !detailed) { hidePoint(); return; }
            float glowScale = focusedDependencyPoint ? 2.2 - u_deepDetail * 0.8 : 3.4 - u_deepDetail * 1.3;
            radius = size * glowScale;
            alpha = visibleAlpha * (focusedDependencyPoint ? 0.045 : 0.055);
          } else if (u_pass == 1) {
            radius = (!detailed || size < 0.85) ? 0.5 : size;
          } else {
            if (size <= 1.1 || !detailed) { hidePoint(); return; }
            radius = max(0.45 + u_deepDetail * 0.25, size * (0.24 + u_deepDetail * 0.06));
            alpha = min(0.9, visibleAlpha * 1.25);
            colour = ${glslVec3(whiteHotColour)} / 255.0;
          }

          gl_Position = vec4(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0, 0.0, 1.0);
          gl_PointSize = max(1.0, radius * 2.0) * u_dpr;
          v_colour = colour;
          v_alpha = alpha;
          v_radius = radius * u_dpr;
        }
      `, POINT_FRAGMENT_SOURCE);

      const pointData = new Float32Array(renderPoints.length * 9);
      const categoryIndex = { core: 0, tests: 1, dependencies: 2 };
      renderPoints.forEach((point, index) => {
        const offset = index * 9;
        point.renderIndex = index;
        pointData[offset] = point.position[0];
        pointData[offset + 1] = point.position[1];
        pointData[offset + 2] = point.position[2];
        pointData[offset + 3] = point.sizeFactor;
        pointData[offset + 4] = point.alphaBase;
        pointData[offset + 5] = categoryIndex[point.category];
        pointData[offset + 6] = point.maxSize;
        pointData[offset + 7] = point.packageIndex ?? -1;
        pointData[offset + 8] = point.systemIndex ?? -1;
      });

      const pointVao = gl.createVertexArray();
      const pointBuffer = gl.createBuffer();
      gl.bindVertexArray(pointVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.STATIC_DRAW);
      const stride = 9 * Float32Array.BYTES_PER_ELEMENT;
      [[0, 3, 0], [1, 1, 3], [2, 1, 4], [3, 1, 5], [4, 1, 6], [5, 1, 7], [6, 1, 8]].forEach(([location, size, offset]) => {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
      });
      gl.bindVertexArray(null);

      const backgroundUniforms = {
        resolution: gl.getUniformLocation(backgroundProgram, "u_resolution"),
        center: gl.getUniformLocation(backgroundProgram, "u_center"),
      };
      const pointUniforms = Object.fromEntries([
        "u_resolution", "u_center", "u_sceneBounds", "u_yaw", "u_pitch", "u_zoom",
        "u_cameraDistance", "u_cameraFocalLength", "u_exposure", "u_deepDetail", "u_dpr",
        "u_categoryVisible", "u_categoryEmphasis", "u_expandedPackage", "u_expandedSystem",
        "u_expandedAnchor", "u_expansion", "u_selectedIndex", "u_pass",
      ].map(name => [name.slice(2), gl.getUniformLocation(pointProgram, name)]));

      const categoryEmphasisVector = () => {
        if (expandedPackageIndex !== null || expandedSystemIndex !== null) return [contextVisibility.package, contextVisibility.package, contextVisibility.package];
        if (selectionLocked && selectedPoint) return [contextVisibility.selection, contextVisibility.selection, contextVisibility.selection];
        if (focusedCategory) {
          return ["core", "tests", "dependencies"].map(category => (category === focusedCategory ? 1 : contextVisibility.category));
        }
        return [1, 1, 1];
      };

      liveCanvas.addEventListener("webglcontextlost", () => {
        explorerRenderer = null;
        liveCanvas.remove();
        markExplorerUnavailable("webgl2-context-lost");
        context.clearRect(0, 0, width, height);
      });

      document.documentElement.dataset.explorerRenderer = "webgl2";
      return Object.freeze({
        resize() {
          rendererDpr = Math.min(dpr, pointSizeRange[1] / maxSpriteCssSize);
          liveCanvas.width = Math.round(width * rendererDpr);
          liveCanvas.height = Math.round(height * rendererDpr);
          gl.viewport(0, 0, liveCanvas.width, liveCanvas.height);
        },
        render() {
          const deepDetail = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
          const centerX = sceneCenterX + panX;
          const centerY = sceneCenterY + panY;
          gl.disable(gl.BLEND);
          gl.useProgram(backgroundProgram);
          gl.bindVertexArray(null);
          gl.uniform2f(backgroundUniforms.resolution, liveCanvas.width, liveCanvas.height);
          gl.uniform2f(backgroundUniforms.center, centerX * rendererDpr, centerY * rendererDpr);
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          gl.enable(gl.BLEND);
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE);
          gl.useProgram(pointProgram);
          gl.bindVertexArray(pointVao);
          gl.uniform2f(pointUniforms.resolution, width, height);
          gl.uniform2f(pointUniforms.center, centerX, centerY);
          gl.uniform2f(pointUniforms.sceneBounds, sceneRight, sceneBottom);
          gl.uniform1f(pointUniforms.yaw, yaw);
          gl.uniform1f(pointUniforms.pitch, pitch);
          gl.uniform1f(pointUniforms.zoom, zoom);
          gl.uniform1f(pointUniforms.cameraDistance, cameraDistance);
          gl.uniform1f(pointUniforms.cameraFocalLength, cameraFocalLength);
          gl.uniform1f(pointUniforms.exposure, explorerExposureForZoom(zoom));
          gl.uniform1f(pointUniforms.deepDetail, deepDetail);
          gl.uniform1f(pointUniforms.dpr, rendererDpr);
          gl.uniform3f(pointUniforms.categoryVisible, visibleCategories.core ? 1 : 0, visibleCategories.tests ? 1 : 0, visibleCategories.dependencies ? 1 : 0);
          const emphasis = categoryEmphasisVector();
          gl.uniform3f(pointUniforms.categoryEmphasis, emphasis[0], emphasis[1], emphasis[2]);
          const expandedSystem = expandedPackageIndex === null && expandedSystemIndex !== null ? expandedSystemIndex : null;
          const anchor = expandedPackageIndex !== null
            ? packageAnchors[expandedPackageIndex]
            : expandedSystem !== null ? systemAnchors[expandedSystem] : null;
          gl.uniform1f(pointUniforms.expandedPackage, expandedPackageIndex === null ? -1 : expandedPackageIndex);
          gl.uniform1f(pointUniforms.expandedSystem, expandedSystem === null ? -1 : expandedSystem);
          gl.uniform3f(pointUniforms.expandedAnchor, anchor ? anchor[0] : 0, anchor ? anchor[1] : 0, anchor ? anchor[2] : 0);
          gl.uniform1f(pointUniforms.expansion, DEPENDENCY_EXPANSION);
          gl.uniform1i(pointUniforms.selectedIndex, selectedPoint ? selectedPoint.renderIndex : -1);
          for (let pass = 0; pass < 3; pass += 1) {
            gl.uniform1i(pointUniforms.pass, pass);
            gl.drawArrays(gl.POINTS, 0, renderPoints.length);
          }
          gl.bindVertexArray(null);
          gl.disable(gl.BLEND);
        },
      });
    }

    let explorerRenderer = null;
    let explorerRendererError = null;
    if (interactiveMode) {
      try {
        explorerRenderer = createExplorerRenderer();
      } catch (error) {
        document.getElementById("explorer-cosmos")?.remove();
        explorerRenderer = null;
        explorerRendererError = error;
        document.documentElement.dataset.explorerUnavailableReason = "webgl2-initialization-error";
      }
      if (explorerRenderer) {
        document.documentElement.dataset.dependencySampling = String(plottedDependencyDeclarations < exactDependencyDeclarations);
        document.documentElement.dataset.embeddedDependencySampling = String(embeddedDependencyDeclarations < exactDependencyDeclarations);
        document.documentElement.dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations);
        document.documentElement.dataset.plottedScenePoints = String(renderPoints.length);
      } else {
        markExplorerUnavailable(
          document.documentElement.dataset.explorerUnavailableReason || "webgl2-unavailable",
          explorerRendererError,
        );
      }
    }
    const context = canvas.getContext("2d", { alpha: Boolean(explorerRenderer) });
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
    model.namespaces = [];
    model.packages = [];
    model.dependencyStars = [];

    function applyCameraTarget(target) {
      yaw = target.yaw;
      pitch = target.pitch;
      zoom = clamp(target.zoom, MIN_ZOOM, MAX_ZOOM);
      panX = target.panX;
      panY = target.panY;
    }

    function contextualSelectionCameraTarget(point, preferredZoom = point.hub ? 4 : point.category === "dependencies" ? 5 : 7) {
      const [x, y, z] = point.position;
      const radialDistance = Math.hypot(x, z);
      const targetYaw = radialDistance > 1 ? Math.PI - Math.atan2(z, x) : yaw;
      const targetPitch = pitch >= 0 ? TOP_DOWN_PITCH : -TOP_DOWN_PITCH;
      const cy = Math.cos(targetYaw), sy = Math.sin(targetYaw);
      const cp = Math.cos(targetPitch), sp = Math.sin(targetPitch);
      const x1 = x * cy - z * sy;
      const z1 = x * sy + z * cy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const desiredSeparation = sceneRight * (CONTEXT_CORE_X - CONTEXT_TARGET_X);
      const fitZoom = radialDistance > 1
        ? desiredSeparation * Math.max(35, cameraDistance - z2) / (radialDistance * cameraFocalLength)
        : preferredZoom;
      const coreFitZoom = Math.min(sceneRight, sceneBottom) * .28 * cameraDistance / (layoutScale.coreOuterRadius * cameraFocalLength);
      const targetZoom = clamp(fitZoom, MIN_ZOOM, Math.min(preferredZoom, coreFitZoom));
      const actualSeparation = Math.abs(x1) * cameraFocalLength / Math.max(35, cameraDistance - z2) * targetZoom;
      return {
        yaw: targetYaw,
        pitch: targetPitch,
        zoom: targetZoom,
        panX: sceneRight * .5 + actualSeparation * .5 - sceneCenterX,
        panY: sceneBottom * CONTEXT_CENTER_Y - sceneCenterY - y2 * cameraFocalLength / Math.max(35, cameraDistance - z2) * targetZoom * .5,
      };
    }

    function contextualCategoryCameraTarget(category) {
      return {
        yaw,
        pitch: pitch >= 0 ? TOP_DOWN_PITCH : -TOP_DOWN_PITCH,
        zoom: categoryMeta[category].focusZoom,
        panX: 0,
        panY: sceneBottom * CONTEXT_CENTER_Y - sceneCenterY,
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

    function flyCamera(target, { followDrift = false } = {}) {
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
        followDrift,
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

    function advanceExplorerDrift(timestamp) {
      if (!interactiveMode || !drifting) {
        lastDriftTimestamp = null;
        return false;
      }
      const elapsed = lastDriftTimestamp === null ? 1000 / 60 : clamp(timestamp - lastDriftTimestamp, 0, MAX_DRIFT_DELTA_MS);
      lastDriftTimestamp = timestamp;
      const driftDelta = screenRotationYawSign(pitch) * DRIFT_RADIANS_PER_SECOND * elapsed / 1000;
      if (!cameraFlight) {
        yaw += driftDelta;
      } else if (cameraFlight.followDrift) {
        yaw += driftDelta;
        cameraFlight.start.yaw += driftDelta;
        cameraFlight.target.yaw += driftDelta;
        cameraFlight.finalTarget.yaw += driftDelta;
      }
      return true;
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
      const parentSystem = point.systemHub && !point.packageHub;
      tooltipCategory.textContent = parentSystem ? "Dependency system" : point.hub ? "Gem" : point.category === "tests" ? "Tests" : "Core code";
      tooltipName.textContent = point.name || "Unnamed Ruby item";
      if (parentSystem) {
        const expanded = expandedSystemIndex === point.systemIndex && expandedPackageIndex === null ? " · Expanded system · Escape to exit" : " · Double-click or F to expand";
        const direct = point.directMemberCount === 1 ? "1 direct package" : `${point.directMemberCount.toLocaleString()} direct packages`;
        tooltipContext.textContent = `${point.memberCount.toLocaleString()} package subclouds · ${direct}${expanded}`;
        addRubyMetrics(point.rubyCounts, allRubyMetricIndexes);
        return;
      }
      if (point.packageHub) {
        const expanded = expandedPackageIndex === point.packageIndex ? " · Expanded gem cloud · Escape to exit" : " · Double-click or F to expand";
        const membership = point.groupedMemberCount > 1 ? ` · Member of ${point.groupedMemberCount.toLocaleString()}-package system` : "";
        tooltipContext.textContent = `${point.packageRole} · ${point.packageLocation}${membership}${expanded}`;
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

    function viewMatrix() {
      return [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    }

    function screenDataFor(point, matrix, cullMargin) {
      point.screen = null;
      if (point.hub) point.cloudScreenRadius = null;
      if (!visibleCategories[point.category]) return null;
      const projected = project(point, matrix, projectionScratch);
      if (!projected) return null;
      const x = projected[0], y = projected[1], perspective = projected[2];
      if (x < -cullMargin || x > sceneRight + cullMargin || y < -cullMargin || y > sceneBottom + cullMargin) return null;
      const screen = point.screenData || (point.screenData = [0, 0, 0]);
      screen[0] = x;
      screen[1] = y;
      screen[2] = clamp(point.sizeFactor * perspective, .35, point.maxSize);
      point.screen = screen;
      if (point.hub) {
        const parentSystem = point.systemHub && !point.packageHub;
        const anchor = parentSystem ? systemAnchors[point.systemIndex] : packageAnchors[point.packageIndex];
        const expanded = parentSystem
          ? expandedPackageIndex === null && expandedSystemIndex === point.systemIndex
          : expandedPackageIndex === point.packageIndex;
        point.cloudScreenRadius = Math.max(12, anchor[3] * perspective * (expanded ? DEPENDENCY_EXPANSION : 1) * 1.2);
      }
      return screen;
    }

    let hitScanRows = null;
    const HIT_SCAN_STRIDE = 8;
    const categoryCodes = { core: 0, tests: 1, dependencies: 2 };

    function ensureHitScanRows() {
      if (hitScanRows) return hitScanRows;
      hitScanRows = new Float32Array(interactivePoints.length * HIT_SCAN_STRIDE);
      interactivePoints.forEach((point, index) => {
        const offset = index * HIT_SCAN_STRIDE;
        hitScanRows[offset] = point.position[0];
        hitScanRows[offset + 1] = point.position[1];
        hitScanRows[offset + 2] = point.position[2];
        hitScanRows[offset + 3] = point.sizeFactor;
        hitScanRows[offset + 4] = point.maxSize;
        hitScanRows[offset + 5] = categoryCodes[point.category];
        hitScanRows[offset + 6] = point.packageIndex ?? -1;
        hitScanRows[offset + 7] = point.systemIndex ?? -1;
      });
      return hitScanRows;
    }

    function hitTestProjected(x, y) {
      const rows = ensureHitScanRows();
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const centerX = sceneCenterX + panX;
      const centerY = sceneCenterY + panY;
      const rightBound = sceneRight + 20;
      const bottomBound = sceneBottom + 20;
      const visible = [visibleCategories.core ? 1 : 0, visibleCategories.tests ? 1 : 0, visibleCategories.dependencies ? 1 : 0];
      const focusCode = focusedCategory === null ? -1 : categoryCodes[focusedCategory];
      const expanded = expandedPackageIndex === null ? -1 : expandedPackageIndex;
      const expandedSystem = expandedPackageIndex === null && expandedSystemIndex !== null ? expandedSystemIndex : -1;
      const anchor = expanded >= 0
        ? packageAnchors[expanded]
        : expandedSystem >= 0 ? systemAnchors[expandedSystem] : null;
      let bestIndex = -1;
      let bestDistanceSq = Infinity;
      for (let index = 0, offset = 0; offset < rows.length; index += 1, offset += HIT_SCAN_STRIDE) {
        const category = rows[offset + 5];
        if (visible[category] === 0) continue;
        if (focusCode >= 0 && category !== focusCode) continue;
        const packageIndex = rows[offset + 6];
        if (expanded >= 0 && (category !== 2 || packageIndex !== expanded)) continue;
        const systemIndex = rows[offset + 7];
        if (expandedSystem >= 0 && (category !== 2 || systemIndex !== expandedSystem)) continue;
        let px = rows[offset], py = rows[offset + 1], pz = rows[offset + 2];
        if ((expanded >= 0 && packageIndex === expanded) || (expandedSystem >= 0 && systemIndex === expandedSystem)) {
          px = anchor[0] + (px - anchor[0]) * DEPENDENCY_EXPANSION;
          py = anchor[1] + (py - anchor[1]) * DEPENDENCY_EXPANSION;
          pz = anchor[2] + (pz - anchor[2]) * DEPENDENCY_EXPANSION;
        }
        const x1 = px * cy - pz * sy;
        const z1 = px * sy + pz * cy;
        const y2 = py * cp - z1 * sp;
        const z2 = py * sp + z1 * cp;
        const pointDepth = cameraDistance - z2;
        if (pointDepth <= 35) continue;
        const perspective = cameraFocalLength / pointDepth * zoom;
        const screenX = centerX + x1 * perspective;
        const screenY = centerY + y2 * perspective;
        if (screenX < -20 || screenX > rightBound || screenY < -20 || screenY > bottomBound) continue;
        const dx = screenX - x;
        const dy = screenY - y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= bestDistanceSq) continue;
        const size = Math.min(Math.max(rows[offset + 3] * perspective, .35), rows[offset + 4]);
        const radius = Math.max(8, size + 4);
        if (distanceSq <= radius * radius) {
          bestIndex = index;
          bestDistanceSq = distanceSq;
        }
      }
      return bestIndex >= 0 ? interactivePoints[bestIndex] : null;
    }

    function hitTest(x, y) {
      return explorerRenderer ? hitTestProjected(x, y) : null;
    }

    function dependencyPackageAt(x, y, exact = hitTest(x, y)) {
      if (!explorerRenderer) return null;
      if (exact) return exact.hub ? exact : null;

      let nearestHub = null;
      let nearestRatio = Infinity;
      const matrix = viewMatrix();
      for (const point of dependencyHubs) {
        screenDataFor(point, matrix, 20);
        if (!point.screen || !point.cloudScreenRadius) continue;
        if (expandedPackageIndex !== null && point.packageIndex !== expandedPackageIndex) continue;
        if (expandedPackageIndex === null && expandedSystemIndex !== null && point.systemIndex !== expandedSystemIndex) continue;
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
      if (cameraFlight || dragging || pointers.size > 0) return;
      pendingHover = [x, y];
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (!pendingHover) return;
        const point = hoverTargetAt(pendingHover[0], pendingHover[1]);
        pendingHover = null;
        canvas.classList.toggle("is-star", Boolean(point));
        if (!selectionLocked && point !== selectedPoint) selectPoint(point);
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
          const result = maxPoint(packageHubs, point => point.rubyCounts[index]);
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
      expandedSystemIndex = null;
      expandedPackageIndex = null;
    }

    function clearExplorationFocus() {
      cancelCameraFlight();
      clearActiveFact();
      clearCategoryFocus();
      clearExpandedPackage();
      selectPoint(null);
    }

    function exitExplorationFocus() {
      const hadSpatialFocus = expandedSystemIndex !== null || expandedPackageIndex !== null || focusedCategory !== null || selectionLocked;
      clearExplorationFocus();
      if (hadSpatialFocus) flyCamera(DEFAULT_CAMERA, { followDrift: true });
    }

    function focusSearch() {
      if (panel.classList.contains("is-collapsed")) setPanelCollapsed(false);
      searchInput.focus();
      searchInput.select();
    }

    function toggleHelp() {
      if (helpOverlay.hidden) openHelp();
      else closeHelp();
    }

    function openHelp() {
      helpReturnFocus = document.activeElement;
      helpOverlay.hidden = false;
      helpClose.focus();
    }

    function closeHelp() {
      helpOverlay.hidden = true;
      if (helpReturnFocus instanceof HTMLElement && helpReturnFocus.isConnected && helpReturnFocus !== document.body) helpReturnFocus.focus();
      else canvas.focus({ preventScroll: true });
      helpReturnFocus = null;
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
      flyCamera(contextualCategoryCameraTarget(category), { followDrift: true });
    }

    function navigateToSelection(point, { button = null, expandDependency = false } = {}) {
      if (!point) return false;
      setCategoryVisible(point.category, true);
      clearActiveFact();
      if (button) {
        activeFactButton = button;
        activeFactButton.setAttribute("aria-pressed", "true");
      }
      clearCategoryFocus();
      if (expandDependency && point.systemHub && !point.packageHub) {
        expandedSystemIndex = point.systemIndex;
        expandedPackageIndex = null;
      } else if (expandDependency && point.packageHub) {
        expandedSystemIndex = point.systemIndex >= 0 ? point.systemIndex : null;
        expandedPackageIndex = point.packageIndex;
      } else {
        clearExpandedPackage();
      }
      selectedPoint = null;
      selectionLocked = false;
      selectPoint(point, true);
      flyCamera(contextualSelectionCameraTarget(point), { followDrift: true });
      return true;
    }

    function focusPoint(point, button) {
      if (button && activeFactButton === button) {
        clearExplorationFocus();
        return;
      }
      if (point.hub) {
        if (point.systemHub && !point.packageHub) focusDependencySystem(point.systemIndex, button);
        else focusDependencyPackage(point.packageIndex, button);
        return;
      }
      navigateToSelection(point, { button });
    }

    function focusDependencyPackage(packageIndex, button = null) {
      const hub = packageHubs.find(point => point.packageIndex === packageIndex);
      if (!hub) return false;

      return navigateToSelection(hub, { button, expandDependency: true });
    }

    function focusDependencySystem(systemIndex, button = null) {
      const hub = systemHubs.find(point => point.systemIndex === systemIndex);
      if (!hub) return false;

      return navigateToSelection(hub, { button, expandDependency: true });
    }

    function appendWarningGroup(container, title, count, rows = [], note = "", countLabel = null) {
      if (count <= 0) return;
      const group = document.createElement("section");
      group.className = "warning-group";
      const heading = document.createElement("h2");
      heading.className = "warning-group-heading";
      const label = document.createElement("span");
      label.textContent = title;
      const total = document.createElement("span");
      total.textContent = countLabel || `${count.toLocaleString()} ${count === 1 ? "warning" : "warnings"}`;
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
      const rendererUnavailable = interactiveMode && document.documentElement.dataset.explorerRenderer === "unavailable";
      const sampling = interactiveMode
        ? dependencySamplingState(exactDependencyDeclarations, embeddedDependencyDeclarations, totals.packages)
        : null;
      container.textContent = "";
      details.hidden = !rendererUnavailable && !sampling && warningTotal === 0;
      if (details.hidden) return;

      const partialIndexSummary = `${warningTotal.toLocaleString()} partial-index warning${warningTotal === 1 ? "" : "s"}`;
      const statusSummaries = [];
      if (rendererUnavailable) statusSummaries.push("WebGL2 required");
      if (sampling) statusSummaries.push(sampling.summary);
      if (warningTotal > 0) statusSummaries.push(partialIndexSummary);
      summary.textContent = statusSummaries.join(" · ");

      if (rendererUnavailable) {
        details.open = true;
        appendWarningGroup(
          container,
          "Interactive rendering",
          1,
          [],
          `This report requires WebGL2 to display its ${renderPoints.length.toLocaleString()}-point interactive scene. Exact dependency totals across ${totals.packages.toLocaleString()} ${totals.packages === 1 ? "gem" : "gems"} remain complete.`,
          "Unavailable",
        );
      }

      if (sampling) {
        appendWarningGroup(
          container,
          sampling.title,
          1,
          [],
          sampling.note,
          sampling.countLabel,
        );
      }

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
      const kind = point.systemHub && !point.packageHub ? "Dependency system" : point.packageHub ? "Gem package" : point.kind;
      const duplicate = duplicateTotal > 1 ? ` · Result ${duplicateOrdinal} of ${duplicateTotal}` : "";
      return `${kind} · ${category}${duplicate}`;
    }

    function activateSearchResult(point) {
      if (point.systemHub && !point.packageHub) focusDependencySystem(point.systemIndex);
      else if (point.packageHub) focusDependencyPackage(point.packageIndex);
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

    function flushPendingSearch() {
      if (!searchTimer) return;
      window.clearTimeout(searchTimer);
      runSearch();
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
        if (event.key === "Escape") {
          if (!searchInput.value && searchResults.hidden) return;
          event.preventDefault();
          event.stopPropagation();
          clearSearch({ focus: true });
          return;
        }
        if (event.key === "Enter" && event.target === searchInput) {
          if (!searchInput.value.trim()) return;
          event.preventDefault();
          flushPendingSearch();
          if (searchMatches.length) activateSearchResult(interactivePoints[searchMatches[0]]);
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        if (event.target === searchInput) flushPendingSearch();
        const focusables = [...searchResults.querySelectorAll(".search-result")];
        if (!focusables.length) return;
        event.preventDefault();
        if (event.target === searchInput) {
          if (event.key === "ArrowDown") focusables[0].focus();
          else focusables[focusables.length - 1].focus();
          return;
        }
        const index = focusables.indexOf(event.target);
        if (index < 0) return;
        if (event.key === "ArrowDown") { if (index < focusables.length - 1) focusables[index + 1].focus(); }
        else if (index === 0) searchInput.focus();
        else focusables[index - 1].focus();
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

    function selectShowcaseLayout() {
      const fitScale = Math.min(window.innerWidth / SHOWCASE_PRESET.stageWidth, window.innerHeight / SHOWCASE_PRESET.stageHeight);
      const fittedWidth = SHOWCASE_PRESET.stageWidth * fitScale;
      const aspectRatio = window.innerWidth / Math.max(1, window.innerHeight);
      const widescreen = fittedWidth >= SHOWCASE_WIDESCREEN_LAYOUT_PRESET.minimumFittedWidth
        && aspectRatio >= SHOWCASE_WIDESCREEN_LAYOUT_PRESET.minimumAspectRatio;
      document.documentElement.dataset.showcaseLayout = widescreen ? "widescreen" : "default";
      return widescreen ? SHOWCASE_WIDESCREEN_LAYOUT_PRESET : SHOWCASE_DEFAULT_LAYOUT_PRESET;
    }

    function configureShowcaseStage() {
      if (!showcaseStage) return;
      activeShowcaseLayout = selectShowcaseLayout();
      const stageScale = SHOWCASE_PRESET.stageWidth / activeShowcaseLayout.layoutReferenceWidth;
      const textScale = activeShowcaseLayout.textScalePercent / 100;
      showcaseStage.style.width = `${SHOWCASE_PRESET.stageWidth}px`;
      showcaseStage.style.height = `${SHOWCASE_PRESET.stageHeight}px`;
      const masthead = showcaseStage.querySelector(".masthead");
      masthead.style.left = `${activeShowcaseLayout.mastheadLeft * stageScale}px`;
      masthead.style.top = `${activeShowcaseLayout.mastheadTop * stageScale}px`;
      masthead.style.width = `${activeShowcaseLayout.mastheadWidth / textScale}px`;
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
        configureShowcaseStage();
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
      if (explorerRenderer) explorerRenderer.resize();
      updateSceneViewport();
      requestRender();
    }

    function updateSceneViewport() {
      if (showcaseMode) {
        sceneRight = width;
        sceneBottom = height;
        sceneCenterX = width * activeShowcaseLayout.centerXPercent / 100;
        sceneCenterY = height * activeShowcaseLayout.centerYPercent / 100;
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

    function isNativeSpaceTarget(target) {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest("input, textarea, select, button, summary, a[href], [contenteditable], [role='button']"));
    }

    function toggleDriftWithSpace(event) {
      if ((event.key !== " " && event.code !== "Space") || event.repeat) return false;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
      if (reducedMotionQuery.matches || isNativeSpaceTarget(event.target)) return false;
      event.preventDefault();
      setDrifting(!driftRequested);
      return true;
    }

    function isPanelOrDialogTarget(target) {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest(".panel, .help-overlay"));
    }

    function handleViewShortcut(event) {
      if (pointers.size > 0) return false;
      if (event.metaKey || event.ctrlKey || event.altKey) return false;
      if (isEditableTarget(event.target)) return false;
      if (event.key === "+" || event.key === "=") { cancelCameraFlight(); zoomBetween(zoom * ZOOM_STEP, sceneCenterX, sceneCenterY); }
      else if (event.key === "-") { cancelCameraFlight(); zoomBetween(zoom / ZOOM_STEP, sceneCenterX, sceneCenterY); }
      else if (event.key === "0") resetView();
      else if (event.key.toLowerCase() === "p") { cancelCameraFlight(); setNavigationMode(navigationMode === "pan" ? "orbit" : "pan"); }
      else if (event.key === "/") focusSearch();
      else if (event.key === "?") { if (!event.repeat) toggleHelp(); }
      else if ((event.key === "Enter" || event.key.toLowerCase() === "f") && selectedPoint?.category === "dependencies") {
        if (event.key === "Enter" && event.target !== canvas && event.target !== document.body) return false;
        if (selectedPoint.systemHub && !selectedPoint.packageHub) focusDependencySystem(selectedPoint.systemIndex);
        else focusDependencyPackage(selectedPoint.packageIndex);
      }
      else return false;
      event.preventDefault();
      requestRender();
      return true;
    }

    function moveViewWithArrow(event) {
      if (!event.key.startsWith("Arrow") || pointers.size > 0) return false;
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target) || isPanelOrDialogTarget(event.target)) return false;
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

    function resetView() {
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

    function project(point, matrix, out) {
      const position = point.position;
      let anchor = null;
      if (expandedPackageIndex !== null && point.packageIndex === expandedPackageIndex) anchor = packageAnchors[expandedPackageIndex];
      else if (expandedPackageIndex === null && expandedSystemIndex !== null && point.systemIndex === expandedSystemIndex) anchor = systemAnchors[expandedSystemIndex];
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
      const projected = out || [0, 0, 0];
      projected[0] = sceneCenterX + panX + x1 * perspective;
      projected[1] = sceneCenterY + panY + y2 * perspective;
      projected[2] = perspective;
      return projected;
    }

    function updateZoomReadout() {
      zoomReadout ||= document.getElementById("zoom-level");
      const text = `${Math.round(zoom * 100)}%`;
      if (text === zoomReadoutText) return;
      zoomReadoutText = text;
      zoomReadout.value = text;
    }

    function updateExplorerOverlay() {
      context.clearRect(0, 0, width, height);
      if (!selectedPoint) return;
      const screen = screenDataFor(selectedPoint, viewMatrix(), 0);
      if (!screen) return;
      const [x, y, size] = screen;
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 1;
      context.beginPath(); context.arc(x, y, Math.max(7, size * 2.5), 0, Math.PI * 2);
      context.strokeStyle = "rgba(255,255,255,.95)"; context.lineWidth = 1.2; context.stroke();
      context.globalAlpha = .5;
      context.beginPath(); context.arc(x, y, Math.max(12, size * 4), 0, Math.PI * 2);
      context.strokeStyle = colourStyles[selectedPoint.category]; context.lineWidth = 1; context.stroke();
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
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
      const matrix = viewMatrix();
      const deepDetail = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
      for (const point of renderPoints) {
        const projected = project(point, matrix);
        if (!projected) continue;
        const [x, y, perspective] = projected;
        if (x < -20 || x > sceneRight + 20 || y < -20 || y > sceneBottom + 20) continue;
        const dependencyStar = point.category === "dependencies" && !point.hub;
        const sizeScale = dependencyStar ? SHOWCASE_DEPENDENCY_PRESET.starSizeScale : 1;
        const alphaScale = dependencyStar ? SHOWCASE_DEPENDENCY_PRESET.starAlphaScale : 1;
        const size = clamp(point.sizeFactor * sizeScale * perspective, .35, point.maxSize);
        const alpha = clamp(point.alphaBase * alphaScale, 0, 1) * SHOWCASE_PRESET.starBrightnessPercent / 100;
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
          context.fillStyle = `rgba(${whiteHotRgb},${Math.min(.9, alpha * 1.25)})`;
          context.fill();
        }
      }
      context.globalCompositeOperation = "source-over";
    }

    function render(timestamp) {
      animationFrame = 0;
      if (showcaseMode) {
        if (showcaseRenderer) showcaseRenderer.render();
        else renderShowcaseFallback();
        return;
      }
      if (!explorerRenderer) return;
      const driftAdvanced = advanceExplorerDrift(timestamp);
      updateCameraFlight(timestamp);
      updateZoomReadout();
      explorerRenderer.render();
      updateExplorerOverlay();
      if (selectedPoint) {
        if (cameraFlight) tooltip.hidden = true;
        else positionTooltip(selectedPoint);
      }
      if (cameraFlight || driftAdvanced) requestRender();
    }

    function requestRender() {
      if (!animationFrame) animationFrame = requestAnimationFrame(render);
    }

    function applyShowcaseCamera(progress) {
      const wrapped = ((Number(progress) % 1) + 1) % 1;
      const yawSign = screenRotationYawSign(SHOWCASE_PRESET.elevationDegrees * Math.PI / 180);
      const phase = wrapped * Math.PI * 2 * SHOWCASE_PRESET.turns * yawSign;
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
      const matrix = viewMatrix();
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

    function syncDrifting() {
      const rendererUnavailable = document.documentElement.dataset.explorerRenderer === "unavailable";
      drifting = interactiveMode && !rendererUnavailable && driftRequested && !reducedMotionQuery.matches;
      lastDriftTimestamp = null;
      const motion = document.getElementById("motion");
      motion.disabled = rendererUnavailable || reducedMotionQuery.matches;
      if (rendererUnavailable) {
        motion.textContent = "Drift unavailable";
        motion.setAttribute("aria-label", "Drift unavailable because WebGL2 is required");
        motion.setAttribute("aria-pressed", "true");
        motion.title = "WebGL2 required";
      } else if (reducedMotionQuery.matches) {
        motion.textContent = "Drift off";
        motion.setAttribute("aria-label", "Drift disabled by reduced motion preference");
        motion.setAttribute("aria-pressed", "true");
        motion.title = "Drift disabled by reduced motion preference";
      } else {
        const label = drifting ? "Pause drift" : "Resume drift";
        motion.textContent = label;
        motion.setAttribute("aria-label", label);
        motion.setAttribute("aria-pressed", String(!drifting));
        motion.title = `${label} (Space)`;
      }
      requestRender();
    }

    function setDrifting(next) {
      driftRequested = interactiveMode && Boolean(next);
      syncDrifting();
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
      canvas.classList.remove("is-star");
      requestRender();
    }
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
        const rememberedTapIsFresh = doubleClickTarget &&
          event.timeStamp - doubleClickTarget.at <= 1000 &&
          Math.hypot(event.clientX - doubleClickTarget.x, event.clientY - doubleClickTarget.y) <= 12;
        if (point) {
          if (!rememberedTapIsFresh) doubleClickTarget = { point, x: event.clientX, y: event.clientY, at: event.timeStamp };
        } else if (!rememberedTapIsFresh) {
          doubleClickTarget = null;
        }
        clearActiveFact();
        clearCategoryFocus();
        if (point?.category === "dependencies" && selectionLocked && selectedPoint === point) {
          if (point.systemHub && !point.packageHub) focusDependencySystem(point.systemIndex);
          else focusDependencyPackage(point.packageIndex);
        }
        else if (point) navigateToSelection(point);
        else clearExplorationFocus();
      }
      requestRender();
    }
    canvas.addEventListener("pointerup", event => finishPointer(event));
    canvas.addEventListener("pointercancel", event => finishPointer(event, true));
    canvas.addEventListener("lostpointercapture", event => { if (pointers.has(event.pointerId)) finishPointer(event, true); });
    canvas.addEventListener("pointerleave", () => {
      canvas.classList.remove("is-star");
      if (!selectionLocked && pointers.size === 0) selectPoint(null);
    });
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
      const remembered = doubleClickTarget;
      doubleClickTarget = null;
      const rememberedPoint = remembered &&
        event.timeStamp - remembered.at <= 1000 &&
        Math.hypot(event.clientX - remembered.x, event.clientY - remembered.y) <= 12
        ? remembered.point
        : null;
      const exact = hitTest(event.clientX, event.clientY);
      const target = rememberedPoint || dependencyPackageAt(event.clientX, event.clientY, exact);
      if (target?.category === "dependencies") {
        if (target.systemHub && !target.packageHub) focusDependencySystem(target.systemIndex);
        else focusDependencyPackage(target.packageIndex);
        return;
      }
      if (target) {
        navigateToSelection(target);
        return;
      }
      if (exact) return;
      cancelCameraFlight();
      zoomBetween(event.shiftKey ? zoom / 2 : zoom * 2, event.clientX, event.clientY);
      requestRender();
    });
    window.addEventListener("keydown", event => {
      if (event.defaultPrevented) return;
      if (!helpOverlay.hidden) {
        if (event.key === "Escape" || (event.key === "?" && !event.repeat)) { event.preventDefault(); closeHelp(); }
        else if (event.key === "Tab") { event.preventDefault(); helpClose.focus(); }
        return;
      }
      if (!explorerRenderer) return;
      if (toggleDriftWithSpace(event)) return;
      if (event.key === "Escape") exitExplorationFocus();
      else if (!handleViewShortcut(event)) moveViewWithArrow(event);
    });
    document.getElementById("motion").addEventListener("click", () => setDrifting(!driftRequested));
    document.getElementById("pan-mode").addEventListener("click", () => { cancelCameraFlight(); setNavigationMode(navigationMode === "pan" ? "orbit" : "pan"); });
    document.getElementById("zoom-in").addEventListener("click", () => { if (pointers.size === 0) { cancelCameraFlight(); zoomBetween(zoom * ZOOM_STEP, sceneCenterX, sceneCenterY); } requestRender(); });
    document.getElementById("zoom-out").addEventListener("click", () => { if (pointers.size === 0) { cancelCameraFlight(); zoomBetween(zoom / ZOOM_STEP, sceneCenterX, sceneCenterY); } requestRender(); });
    document.getElementById("reset-view").addEventListener("click", resetView);
    document.getElementById("help-open").addEventListener("click", toggleHelp);
    helpClose.addEventListener("click", closeHelp);
    helpOverlay.addEventListener("click", event => { if (event.target === helpOverlay) closeHelp(); });
    panelToggle.addEventListener("click", () => setPanelCollapsed(panelToggle.getAttribute("aria-expanded") === "true"));
    panel.addEventListener("transitionend", event => { if (event.propertyName === "width") { updateSceneViewport(); requestRender(); } });
    reducedMotionQuery.addEventListener("change", event => {
      if (event.matches) completeCameraFlight();
      syncDrifting();
    });
    }

    window.addEventListener("resize", resize);
    document.querySelector("h1").textContent = model.projectName;
    updateGalaxySummary();
    if (showcaseMode) {
      document.title = `${model.projectName} · RubyLens showcase`;
      const showcaseLabel = `Autonomous stellar artwork of ${model.projectName}, completing one slow rotation each minute.`;
      canvas.setAttribute("aria-label", showcaseLabel);
      document.getElementById("showcase-cosmos")?.setAttribute("aria-label", showcaseLabel);
      populateShowcaseStats();
      reducedMotionQuery.addEventListener("change", startShowcase);
      resize();
      startShowcase();
    } else {
      document.title = `RubyLens · ${model.projectName}`;
      if (explorerRenderer) {
        canvas.setAttribute("aria-label", `Interactive three-dimensional stellar artwork of ${model.projectName}. Hover class and module stars for Ruby code details, dependency systems, or gem package subclouds. Selections open a top-down view that keeps the selected target and Core visible. Double-click a dependency system or gem subcloud, press Enter or F on its selected marker, or tap that marker again to expand its stars. Drag to orbit, Shift-drag or Pan mode to move, scroll or pinch to zoom at a point, use arrow keys to move the view, Space to pause or resume drift, 0 to reset, slash to search, and question mark for the full shortcut list.`);
      }
      updateDependencyCoverage();
      populateWarningDisclosure();
      applyCameraTarget(DEFAULT_CAMERA);
      setDrifting(driftRequested);
      setNavigationMode(navigationMode);
      createExplorer();
      if (!explorerRenderer) disableExplorerControls();
      initializeSearch();
      setPanelCollapsed(window.matchMedia("(max-width: 760px)").matches);
      resize();
    }
