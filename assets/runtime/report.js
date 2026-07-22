    "use strict";
    const model = JSON.parse(atob("{{MODEL_BASE64}}"));
    const showcaseMode = document.body.dataset.rubylensMode === "showcase";
    const showcaseDetails = showcaseMode && model.details === true;
    const interactiveMode = !showcaseMode;
    const canvas = document.getElementById("cosmos");
    const travelCanvas = showcaseMode ? document.getElementById("travel-cosmos") : canvas;
    const showcaseStage = document.getElementById("showcase-stage");
    const showcaseStatus = document.getElementById("showcase-status");
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
    let width = 0, height = 0, dpr = 1, sceneRight = 0, sceneBottom = 0, sceneCenterX = 0, sceneCenterY = 0, yaw = -.36, pitch = .34, zoom = 1, panX = 0, panY = 0, dragging = false, gesture = null, pinchState = null, animationFrame = 0, hoverFrame = 0, pendingHover = null, selectedPoint = null, selectionLocked = false, focusedCategory = null, expandedSystemIndex = null, expandedPackageIndex = null, activeFactButton = null, navigationMode = "orbit", cameraFlight = null, showcaseStartedAt = null, showcaseRenderer = null, showcaseAnnotationSlot = -1, activeShowcaseAnnotation = null, clipMode = false, dependencySpinElapsed = 0;
    const MIN_ZOOM = .35, MAX_ZOOM = 40, ZOOM_STEP = 1.7, DEPENDENCY_EXPANSION = 2.35;
    const CORE_SCALE_BASELINE = 3_000;
    const DEPENDENCY_CLOUD_THRESHOLD = 18;
    const DEPENDENCY_STAR_ALPHA_SCALE = .85;
    const MORPHOLOGY_FAMILY = Object.freeze({ elliptical: 0, lenticular: 1, spiral: 2, barredSpiral: 3, irregular: 4 });
    const MORPHOLOGY_FAMILY_LABELS = Object.freeze(["Elliptical galaxy", "Lenticular galaxy", "Spiral galaxy", "Barred spiral galaxy", "Irregular galaxy"]);
    const FALLBACK_MORPHOLOGY_ROW = Object.freeze([MORPHOLOGY_FAMILY.spiral, 0, 240, 3, 105, 380, 0, 0, 0, 0]);
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
    let lastDependencySpinTimestamp = null;
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
      "pointGlowPercent": 0,
      "hazeMilkRadius": 12,
      "hazeMilkGainPercent": 24,
      "backgroundGlowPercent": 200,
      "textScalePercent": 80,
      "layoutReferenceWidth": 720,
      "layoutReferenceHeight": 405,
      "mastheadLeft": 44,
      "mastheadTop": 40,
      "mastheadWidth": 632
    });
    // Self-gravitating systems have a characteristic angular frequency
    // proportional to sqrt(mass / radius^3). The host's tidal gradient adds a
    // weaker distance^-3/2 frequency term. Declaration count is the local mass
    // proxy; the result is compressed to whole turns per Showcase loop so Clip
    // keeps its exact seam. Direction is independent seeded enrichment.
    const DEPENDENCY_SPIN_RECIPE = Object.freeze({
      selfGravityScale: .25,
      tidalScale: .35,
      minimumTurnsPerLoop: 1,
      maximumTurnsPerLoop: 2,
      directionChannel: 104,
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
      "starAlphaScale": 0.3
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
    const TRAVEL_PRESET = Object.freeze({
      "flightDurationMs": 2200,
      "initialDelayMin": 0.2,
      "initialDelayRange": 0.5,
      "intervalMin": 0.55,
      "intervalRange": 0.75,
      "handoffGapMinMs": 24,
      "handoffGapRangeMs": 126,
      "loopQuietMs": 80,
      "tailFraction": 0.7,
      "progressEase": 0.055,
      "fadeInFraction": 0.12,
      "fadeOutStart": 0.82,
      "minimumVisibility": 0.04,
      "minimumRouteLengthPx": 48,
      "admissionInsetPx": 16,
      "admissionCandidateLimit": 12,
      "arcHeightPercent": 24,
      "arcHeightMin": 16,
      "arcHeightMax": 120,
      "tailSegments": 24,
      "tailLengthPx": 218.4,
      "lineWidth": 2.86,
      "tailAlpha": 0.38,
      "tailHaloAlpha": 0.09,
      "tailHaloBlur": 2.86,
      "tailHeadOverlap": 0.82,
      "headLengthPx": 9.75,
      "headWidthPx": 2.73,
      "headAlpha": 0.64,
      "headGlowAlpha": 0.12,
      "headGlowBlur": 4.42,
      "initialDelayChannel": 13,
      "intervalChannel": 29,
      "handoffGapChannel": 43,
      "candidateChannel": 59,
      "arcDirectionChannel": 71
    });
    function travelFlightLimitForPointCount(pointCount) {
      if (pointCount < 500) return 1;
      return 2;
    }
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
    const glslVec3 = rgb => `vec3(${rgb.map(channel => channel.toFixed(1)).join(", ")})`;
    const colourStyles = Object.fromEntries(Object.entries(colours).map(([category, rgb]) => [category, `rgb(${rgb.join(",")})`]));
    const projectionScratch = [0, 0, 0];
    const dependencySpinScratch = [0, 0, 0];
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
    // Spitzer isothermal-sheet vertical draw: a sech^2(z / 2z0) disc profile
    // via its logistic inverse CDF, scaled to Gaussian-sigma-equivalent units.
    const sheet = (seed, channel) => {
      const share = Math.min(.996, Math.max(.004, unit(seed, channel)));
      return .551 * Math.log(share / (1 - share));
    };
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    function decodeConstantReferenceLinks(rows) {
      if (!Array.isArray(rows)) return [];
      const seen = new Set();
      const endpointCount = model.namespaces.length + model.dependencyStars.length;
      return rows.slice(0, 1_024).reduce((links, row) => {
        if (!Array.isArray(row) || row.length !== 2 || !row.every(Number.isInteger)) return links;
        const [referringIndex, referencedIndex] = row;
        if (referringIndex < 0 || referringIndex >= model.namespaces.length) return links;
        if (referencedIndex < 0 || referencedIndex >= endpointCount) return links;
        if (referringIndex === referencedIndex) return links;
        const key = `${referringIndex}:${referencedIndex}`;
        if (seen.has(key)) return links;
        seen.add(key);
        links.push(Object.freeze({
          departureIndex: referencedIndex,
          arrivalIndex: referringIndex,
        }));
        return links;
      }, []);
    }
    function fallbackMorphology(phaseSeed = 0) {
      const normalizedSeed = Number.isInteger(phaseSeed) && phaseSeed >= 0 && phaseSeed <= 0xffff_ffff ? phaseSeed >>> 0 : 0;
      return decodeMorphology([...FALLBACK_MORPHOLOGY_ROW.slice(0, 9), normalizedSeed]);
    }
    function decodeMorphology(row, fallbackPhaseSeed = 0) {
      if (!Array.isArray(row) || row.length !== 10 || !row.every(Number.isInteger)) return fallbackMorphology(fallbackPhaseSeed);
      const family = row[0];
      if (family < MORPHOLOGY_FAMILY.elliptical || family > MORPHOLOGY_FAMILY.irregular) return fallbackMorphology(fallbackPhaseSeed);
      if (row[9] < 0 || row[9] > 0xffff_ffff) return fallbackMorphology(fallbackPhaseSeed);
      const phaseSeed = row[9] >>> 0;
      return Object.freeze({
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
        barLength: family === MORPHOLOGY_FAMILY.barredSpiral ? clamp(row[6], 100, 800) / 1000 : 0,
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
      if (activeMorphology.family === MORPHOLOGY_FAMILY.elliptical) {
        coreExtent = 36;
        testExtent = 52;
      } else if (activeMorphology.family === MORPHOLOGY_FAMILY.lenticular) {
        const discProgress = clamp((.42 - activeMorphology.bulgeShare) / .08, 0, 1);
        coreExtent = 42 + 2 * discProgress;
        testExtent = 54 + 4 * discProgress;
      } else if (activeMorphology.family === MORPHOLOGY_FAMILY.barredSpiral) {
        testExtent = Math.max(17, activeMorphology.barLength * 48) + 45;
      } else if (activeMorphology.family === MORPHOLOGY_FAMILY.irregular) {
        const centerSpread = 12 + 18 * activeMorphology.clumpSpread;
        coreExtent = centerSpread + 24;
        testExtent = centerSpread + 32;
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

    const coreCount = model.namespaces.reduce((count, row) => count + (row[2] === 1 ? 0 : 1), 0);
    const layoutScale = layoutMetricsForCoreCount(coreCount, morphology);
    const cameraDistance = layoutScale.cameraDistance;
    const cameraFocalLength = layoutScale.cameraFocalLength;
    const barRadius = morphology.barLength * 48;
    // Arm recipe shared by the project galaxy and dependency clouds. Seeded
    // jitters draw from a galaxy's phase seed on the channels below, so each
    // galaxy varies while every one of its stars agrees.
    const ARM_RECIPE = Object.freeze({
      // The winding knob maps linearly to tan(pitch), floored near 7 degrees
      // and reaching about 24 degrees for the loosest arms.
      tanPitchFloor: .12,
      tanPitchIntercept: .43,
      tanPitchSlope: 1.5,
      // Per-bar-end pitch (x0.82-1.18) and trailing-side-only takeoff
      // (0-0.12 rad) jitters keep the arm pair from mirroring.
      pitchJitterFloor: .82,
      pitchJitterSpan: .36,
      pitchChannel: 60,
      takeoffJitter: .12,
      takeoffChannel: 66,
      // Third and fourth arms ride a main arm, then fork off at 1.3-1.8x the
      // bar radius and open with a 1.4-1.9x looser pitch.
      forkRadialFloor: 1.3,
      forkRadialSpan: .5,
      forkRadialChannel: 72,
      forkPitchFloor: 1.4,
      forkPitchSpan: .5,
      forkPitchChannel: 84,
      // Roughly a third of barred galaxies are ringed SB(r) systems; rings
      // take 15% of arm members, hug the bar tips at 1.05-1.15x their
      // radius, and sit 15% squashed across the bar.
      ringGalaxyShare: .3,
      ringGalaxyChannel: 88,
      ringMemberShare: .15,
      ringRadialFloor: 1.05,
      ringRadialSpan: .1,
      ringSquash: .15,
      // 22% of arm members feather into a 2.6x wider sheath, and arm width
      // grows with radius from a .55 base, so arms read as overdensities
      // rather than rails.
      featherShare: .22,
      featherWidth: 2.6,
      widthFloor: .55,
      // Unbarred arms sweep from the log-spiral origin radius but admit
      // members only beyond the minimum, where the spiral has visibly curved
      // away from its takeoff angle; closer in, members share that angle and
      // would draw a cross of straight spokes through the core.
      unbarredOriginRadial: 6,
      unbarredMinimumRadial: 8,
    });
    const barredRing = morphology.family === MORPHOLOGY_FAMILY.barredSpiral &&
      unit(morphology.phaseSeed, ARM_RECIPE.ringGalaxyChannel) < ARM_RECIPE.ringGalaxyShare;

    const irregularClumpCenters = morphology.family === MORPHOLOGY_FAMILY.irregular
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

    const armTanPitch = winding =>
      Math.max(ARM_RECIPE.tanPitchFloor, ARM_RECIPE.tanPitchIntercept - ARM_RECIPE.tanPitchSlope * winding);

    // Constant-pitch logarithmic arm angle shared by the project galaxy and
    // dependency clouds: exactly one arm trails each bar end (takeoff jitter
    // stays on the trailing side), each end draws its own seeded pitch so the
    // pair is not a mirror image, and third and fourth arms are downstream
    // bifurcations that ride a main arm before forking outward with a looser
    // pitch, as in real multi-armed barred galaxies.
    function barredArmTheta(phaseSeed, phase, winding, arm, armRadial, tipRadial) {
      const barEnd = arm % 2;
      const branch = Math.floor(arm / 2);
      const tanPitch = armTanPitch(winding) *
        (ARM_RECIPE.pitchJitterFloor + ARM_RECIPE.pitchJitterSpan * unit(phaseSeed, ARM_RECIPE.pitchChannel + barEnd));
      const origin = phase + barEnd * Math.PI + unit(phaseSeed, ARM_RECIPE.takeoffChannel + barEnd) * ARM_RECIPE.takeoffJitter;
      let sweep = Math.log(armRadial / tipRadial) / tanPitch;
      if (branch > 0) {
        const forkRadial = tipRadial *
          (ARM_RECIPE.forkRadialFloor + ARM_RECIPE.forkRadialSpan * unit(phaseSeed, ARM_RECIPE.forkRadialChannel + arm));
        if (armRadial > forkRadial) {
          sweep = Math.log(forkRadial / tipRadial) / tanPitch +
            Math.log(armRadial / forkRadial) / (tanPitch *
              (ARM_RECIPE.forkPitchFloor + ARM_RECIPE.forkPitchSpan * unit(phaseSeed, ARM_RECIPE.forkPitchChannel + arm)));
        }
      }
      return origin + sweep;
    }

    // SB(r) variant: an inner ring hugging the bar ends, slightly elongated
    // along the bar. Shared by the project galaxy and dependency clouds.
    function barredRingPlacement(phase, tipRadial, radialUnit, thetaUnit) {
      const ringTheta = thetaUnit * Math.PI * 2;
      const across = Math.sin(ringTheta);
      return [
        phase + ringTheta,
        tipRadial * (ARM_RECIPE.ringRadialFloor + ARM_RECIPE.ringRadialSpan * radialUnit) * (1 - ARM_RECIPE.ringSquash * across * across),
      ];
    }

    // The arm's center angle at a radius — the one arm-angle law shared by
    // star placement and the dust lanes that hug those arms.
    function armCenterTheta(arm, radial) {
      if (morphology.family === MORPHOLOGY_FAMILY.barredSpiral) {
        return barredArmTheta(morphology.phaseSeed, morphology.phase, morphology.winding, arm, radial, barRadius);
      }
      const origin = ARM_RECIPE.unbarredOriginRadial;
      return morphology.phase + arm * Math.PI * 2 / morphology.armCount +
        Math.log(Math.max(radial, origin) / origin) / armTanPitch(morphology.winding);
    }

    // Answers both the arm angle and the point's (possibly adjusted) radius:
    // barred-spiral arms unwind from the bar tips, so arm members that fall
    // inside the bar are respread outward along the arm, densest at the tip.
    function spiralArmPlacement(seed, radial, channel) {
      const arm = Math.floor(unit(seed, channel) * morphology.armCount);
      const scatter = .22 - (morphology.armCount - 2) * .025;
      if (morphology.family === MORPHOLOGY_FAMILY.barredSpiral) {
        const armRadial = radial < barRadius
          ? barRadius + radial / barRadius * (40 - barRadius)
          : radial;
        if (barredRing && unit(seed, channel + 5) < ARM_RECIPE.ringMemberShare) {
          return barredRingPlacement(morphology.phase, barRadius, unit(seed, channel + 6), unit(seed, channel + 7));
        }
        const theta = armCenterTheta(arm, armRadial);
        const feather = unit(seed, channel + 2) < ARM_RECIPE.featherShare ? ARM_RECIPE.featherWidth : 1;
        const width = scatter * (ARM_RECIPE.widthFloor + armRadial / 64) * Math.min(1, 36 / armRadial) * feather;
        return [theta + normal(seed, channel + 3) * width, armRadial];
      }
      const theta = armCenterTheta(arm, radial) + normal(seed, channel + 1) * scatter;
      return [theta, radial];
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
      let along;
      let acrossSigma;
      if (morphology.barLength > .45 && unit(seed, 37) < .1) {
        // Long early-type bars carry ansae: bright knots near the bar ends.
        along = (unit(seed, 38) < .5 ? 1 : -1) * barRadius * .9 + normal(seed, 39) * barRadius * .08;
        acrossSigma = barRadius * .08;
      } else {
        const draw = unit(seed, 34) * 2 - 1;
        // Flat density along early-type bars, exponential-like falloff for
        // short late-type bars; lens envelope tapering into the tips.
        along = (morphology.barLength < .36 ? Math.sign(draw) * Math.pow(Math.abs(draw), 1.5) : draw) * barRadius;
        const taper = Math.sqrt(Math.max(.15, 1 - (along / barRadius) * (along / barRadius)));
        acrossSigma = barRadius * .16 * taper;
      }
      const across = normal(seed, 35) * acrossSigma;
      const cos = Math.cos(morphology.phase), sin = Math.sin(morphology.phase);
      return [
        (cos * along - sin * across) * scale,
        vertical * scale,
        (sin * along + cos * across) * scale,
      ];
    }

    function coreDiscUsesArm(seed, bulge, radial) {
      return !bulge &&
        spiralMorphology &&
        (morphology.family === MORPHOLOGY_FAMILY.barredSpiral || radial > ARM_RECIPE.unbarredMinimumRadial) &&
        unit(seed, 30) < morphology.armFraction;
    }

    function corePosition(seed) {
      if (morphology.family === MORPHOLOGY_FAMILY.elliptical) return spheroidPosition(seed, false);
      if (morphology.family === MORPHOLOGY_FAMILY.irregular) return irregularPosition(seed, false);

      const bulge = unit(seed, 2) < morphology.bulgeShare;
      const discLimit = morphology.family === MORPHOLOGY_FAMILY.lenticular ? layoutScale.coreOuterRadius / layoutScale.disk : 42;
      const radial = bulge ? 17 * Math.pow(unit(seed, 3), 1.75) : Math.min(discLimit, -10 * Math.log(Math.max(1e-5, 1 - unit(seed, 3))));
      const scale = bulge ? layoutScale.bulge : layoutScale.disk;
      if (!bulge && morphology.family === MORPHOLOGY_FAMILY.barredSpiral && unit(seed, 33) < .32) {
        return barredCorePosition(seed, sheet(seed, 5) * 1.6, scale);
      }
      if (coreDiscUsesArm(seed, bulge, radial)) {
        const [theta, armRadial] = spiralArmPlacement(seed, radial, 43);
        return [Math.cos(theta) * armRadial * scale, sheet(seed, 5) * (1.4 + armRadial * .025) * scale, Math.sin(theta) * armRadial * scale];
      }
      const vertical = bulge ? normal(seed, 5) * 5.8 : sheet(seed, 5) * (1.4 + radial * .025);
      const theta = morphology.phase + unit(seed, 4) * Math.PI * 2 + radial * .04;
      return [Math.cos(theta) * radial * scale, vertical * scale, Math.sin(theta) * radial * scale];
    }

    function testPosition(seed) {
      if (morphology.family === MORPHOLOGY_FAMILY.elliptical) return spheroidPosition(seed, true);
      if (morphology.family === MORPHOLOGY_FAMILY.irregular) return irregularPosition(seed, true);

      const discFloor = morphology.family === MORPHOLOGY_FAMILY.barredSpiral
        ? Math.max(17, barRadius) - 5 * unit(seed, 28)
        : 17;
      const radial = morphology.family === MORPHOLOGY_FAMILY.lenticular
        ? 16 + Math.min(layoutScale.testOuterRadius / layoutScale.tests - 16, -13 * Math.log(Math.max(1e-5, 1 - unit(seed, 7))))
        : discFloor + Math.min(45, -14 * Math.log(Math.max(1e-5, 1 - unit(seed, 7))));
      if (spiralMorphology && unit(seed, 9) < morphology.armFraction) {
        const [theta, armRadial] = spiralArmPlacement(seed, radial, 13);
        return [Math.cos(theta) * armRadial * layoutScale.tests, sheet(seed, 11) * (1.4 + armRadial * .035) * layoutScale.tests, Math.sin(theta) * armRadial * layoutScale.tests];
      }
      const theta = morphology.phase + unit(seed, 10) * Math.PI * 2;
      const vertical = sheet(seed, 11) * (1.4 + radial * .035);
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

    function decodePackageMorphology(raw, packageIndex) {
      const packageRow = model.packages[packageIndex] || [];
      const phaseSeed = Number(packageRow[0]) >>> 0;
      const declarationCount = Math.max(0, Number(packageRow[3]) || 0);
      return Object.freeze({
        ...decodeMorphology(raw, phaseSeed),
        compact: declarationCount < DEPENDENCY_CLOUD_THRESHOLD,
      });
    }

    const encodedPackageMorphologies = Array.isArray(model.packageMorphologies) ? model.packageMorphologies : [];
    const packageMorphologies = model.packages.map((_row, index) => decodePackageMorphology(encodedPackageMorphologies[index], index));

    function boundedDependencyOffset(x, y, z, radius) {
      const distance = Math.hypot(x, y, z);
      const scale = distance > radius ? radius / distance : 1;
      return [x * scale, y * scale, z * scale];
    }

    function dependencyCloudOffset(seed, cloud, radius) {
      if (cloud.compact || cloud.family === MORPHOLOGY_FAMILY.elliptical) {
        const distance = radius * (cloud.compact ? .72 : .94) * Math.pow(unit(seed, 18), 1.45);
        const polar = unit(seed, 19) * 2 - 1;
        const equatorial = Math.sqrt(Math.max(0, 1 - polar * polar));
        const theta = cloud.phase + unit(seed, 20) * Math.PI * 2;
        return boundedDependencyOffset(
          Math.cos(theta) * equatorial * distance,
          polar * distance * (1 - cloud.ellipticity),
          Math.sin(theta) * equatorial * distance,
          radius,
        );
      }

      if (cloud.family === MORPHOLOGY_FAMILY.irregular) {
        const clump = Math.min(cloud.clumpCount - 1, Math.floor(unit(seed, 18) * cloud.clumpCount));
        const clumpPhase = cloud.phase + clump * Math.PI * 2 / cloud.clumpCount;
        const centerRadius = radius * cloud.clumpSpread * (.65 + unit(cloud.phaseSeed, 70 + clump) * .35);
        const spread = radius * .16;
        return boundedDependencyOffset(
          Math.cos(clumpPhase) * centerRadius + clamp(normal(seed, 72), -2.2, 2.2) * spread,
          clamp(normal(seed, 74), -2.2, 2.2) * spread * .55,
          Math.sin(clumpPhase) * centerRadius + clamp(normal(seed, 76), -2.2, 2.2) * spread,
          radius,
        );
      }

      const barred = cloud.family === MORPHOLOGY_FAMILY.barredSpiral;
      const bulge = unit(seed, 18) < cloud.bulgeShare;
      const radialUnit = unit(seed, 19);
      const inArm = unit(seed, 22) < cloud.armFraction;
      const spiralArmTail = cloud.family === MORPHOLOGY_FAMILY.spiral && !bulge && inArm
        ? .12 * Math.max(0, -Math.log((1 - radialUnit) / .15))
        : 0;
      const radial = bulge
        ? radius * .36 * Math.pow(radialUnit, 1.55)
        : radius * (.2 + .72 * Math.sqrt(radialUnit) + spiralArmTail);
      const vertical = clamp(bulge ? normal(seed, 26) : sheet(seed, 26), -2.2, 2.2) * radius * (bulge ? .13 : .055);
      if (barred && !bulge && unit(seed, 21) < .34) {
        const halfLength = radius * cloud.barLength;
        const along = (unit(seed, 22) * 2 - 1) * halfLength;
        const taper = Math.sqrt(Math.max(.15, 1 - (along / halfLength) * (along / halfLength)));
        const across = clamp(normal(seed, 23), -2.2, 2.2) * halfLength * .16 * taper;
        return boundedDependencyOffset(
          Math.cos(cloud.phase) * along - Math.sin(cloud.phase) * across,
          vertical,
          Math.sin(cloud.phase) * along + Math.cos(cloud.phase) * across,
          radius,
        );
      }

      const armCount = Math.max(2, cloud.armCount);
      const arm = Math.floor(unit(seed, 25) * armCount);
      if (barred && !bulge && inArm) {
        const tipRadial = radius * cloud.barLength;
        const rootShare = (radial / radius - .2) / Math.max(.05, cloud.barLength - .2);
        const armRadial = radial < tipRadial
          ? tipRadial + rootShare * rootShare * (radius * .92 - tipRadial) * .5
          : radial;
        if (unit(cloud.phaseSeed, ARM_RECIPE.ringGalaxyChannel) < ARM_RECIPE.ringGalaxyShare && unit(seed, 29) < ARM_RECIPE.ringMemberShare) {
          const [ringTheta, ringRadial] = barredRingPlacement(cloud.phase, tipRadial, unit(seed, 30), unit(seed, 31));
          return boundedDependencyOffset(Math.cos(ringTheta) * ringRadial, vertical, Math.sin(ringTheta) * ringRadial, radius);
        }
        const feather = unit(seed, 28) < ARM_RECIPE.featherShare ? ARM_RECIPE.featherWidth : 1;
        const width = .16 * (ARM_RECIPE.widthFloor + armRadial / (radius * .92)) * Math.min(1, radius * .52 / armRadial) * feather;
        const theta = barredArmTheta(cloud.phaseSeed, cloud.phase, cloud.winding, arm, armRadial, tipRadial) + normal(seed, 23) * width;
        return boundedDependencyOffset(Math.cos(theta) * armRadial, vertical, Math.sin(theta) * armRadial, radius);
      }
      const theta = inArm && !barred && !bulge
        ? cloud.phase + arm * Math.PI * 2 / armCount +
          Math.log(Math.max(radial, radius * .2) / (radius * .2)) / armTanPitch(cloud.winding) + normal(seed, 23) * .17
        : cloud.phase + unit(seed, 23) * Math.PI * 2;
      const x = Math.cos(theta) * radial;
      const z = Math.sin(theta) * radial;
      return spiralArmTail > 0 ? [x, vertical, z] : boundedDependencyOffset(x, vertical, z, radius);
    }
    const dependencyAnchor = (seed, declarationCount) => {
      const radius = layoutScale.dependencyInnerRadius + 72 * Math.sqrt(layoutScale.tests) * Math.pow(unit(seed, 14), .72);
      const theta = unit(seed, 15) * Math.PI * 2;
      const vertical = normal(seed, 16) * 24 * Math.sqrt(layoutScale.tests);
      return [Math.cos(theta) * radius, vertical, Math.sin(theta) * radius, 1.6 + Math.sqrt(declarationCount) * .055];
    };
    const systemAnchors = dependencySystems.map((row, index) => {
      const anchor = dependencyAnchor(row[0], systemAggregates[index]?.declarationCount || 0);
      anchor[3] += Math.min(5, systemMembers[index].length * .65);
      anchor.push(index);
      return anchor;
    });
    const packageAnchors = model.packages.map((row, index) => {
      const systemIndex = Number(row[8]);
      const cloudRadius = 1.6 + Math.sqrt(row[3]) * .055;
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

    function dependencySpinTurns(packageRow, anchor) {
      const declarationCount = Math.max(1, Number(packageRow?.[3]) || 0);
      const cloudRadius = Math.max(1e-6, Number(anchor?.[3]) || 0);
      const coreDistance = Math.max(1e-6, Math.hypot(anchor?.[0] || 0, anchor?.[1] || 0, anchor?.[2] || 0));
      const selfGravityFrequency = Math.sqrt(declarationCount / cloudRadius ** 3);
      const tidalFrequency = (layoutScale.dependencyInnerRadius / coreDistance) ** 1.5;
      const characteristicFrequency = selfGravityFrequency * DEPENDENCY_SPIN_RECIPE.selfGravityScale +
        tidalFrequency * DEPENDENCY_SPIN_RECIPE.tidalScale;
      return clamp(
        Math.round(characteristicFrequency),
        DEPENDENCY_SPIN_RECIPE.minimumTurnsPerLoop,
        DEPENDENCY_SPIN_RECIPE.maximumTurnsPerLoop,
      );
    }

    const packageSpinRates = model.packages.map((row, index) => {
      const direction = unit(row[0], DEPENDENCY_SPIN_RECIPE.directionChannel) < .5 ? -1 : 1;
      const turns = dependencySpinTurns(row, packageAnchors[index]);
      return direction * turns * Math.PI * 2 / (SHOWCASE_PRESET.durationMs / 1000);
    });

    function dependencySpunPosition(positionX, positionY, positionZ, packageIndex, elapsed, out = [0, 0, 0]) {
      const anchor = packageAnchors[packageIndex];
      const rate = packageSpinRates[packageIndex];
      if (!anchor || !Number.isFinite(rate)) {
        out[0] = positionX;
        out[1] = positionY;
        out[2] = positionZ;
        return out;
      }
      const loopElapsed = ((Number(elapsed) % SHOWCASE_PRESET.durationMs) + SHOWCASE_PRESET.durationMs) % SHOWCASE_PRESET.durationMs;
      const angle = rate * loopElapsed / 1000;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const offsetX = positionX - anchor[0];
      const offsetZ = positionZ - anchor[2];
      out[0] = anchor[0] + offsetX * cosine - offsetZ * sine;
      out[1] = positionY;
      out[2] = anchor[2] + offsetX * sine + offsetZ * cosine;
      return out;
    }

    function createDependencySpinTexture(gl) {
      const maximumSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const width = Math.min(maximumSize, Math.max(1, model.packages.length));
      const height = Math.max(1, Math.ceil(model.packages.length / width));
      if (height > maximumSize) throw new Error("Dependency package count exceeds WebGL2 texture capacity");
      const pixels = new Float32Array(width * height * 4);
      packageAnchors.forEach((anchor, index) => {
        const offset = index * 4;
        pixels[offset] = anchor[0];
        pixels[offset + 1] = anchor[1];
        pixels[offset + 2] = anchor[2];
        pixels[offset + 3] = packageSpinRates[index];
      });
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, pixels);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return Object.freeze({ texture, width });
    }

    function dependencyPosition(seed, packageIndex) {
      const anchor = packageAnchors[packageIndex] || [0, 0, 0, 2];
      const offset = dependencyCloudOffset(seed, packageMorphologies[packageIndex], anchor[3]);
      return [
        anchor[0] + offset[0],
        anchor[1] + offset[1],
        anchor[2] + offset[2],
      ];
    }

    // Every scene point writes its render attributes into one interleaved
    // Float32Array consumed directly by both renderers. A JS point object is
    // created only when the point is consulted again after upload: hover and
    // search targets, dependency hubs, and showcase annotation anchors.
    const SCENE_POINT_STRIDE = 9;
    const categoryCodes = { core: 0, tests: 1, dependencies: 2 };
    function buildPoints() {
      const scenePointCount = model.namespaces.length + model.dependencyStars.length + systemAnchors.length + packageAnchors.length;
      const sceneData = new Float32Array(scenePointCount * SCENE_POINT_STRIDE);
      const interactivePoints = [];
      const dependencyHubs = [];
      const packageHubs = [];
      const systemHubs = [];
      let nextRenderIndex = 0;

      const writeScenePoint = (category, position, signal, base, hub, packageIndex, systemIndex) => {
        const offset = nextRenderIndex * SCENE_POINT_STRIDE;
        const sizeFactor = base * (.62 + signal * .46);
        const alphaScale = category === "dependencies" && !hub ? DEPENDENCY_STAR_ALPHA_SCALE : 1;
        sceneData[offset] = position[0];
        sceneData[offset + 1] = position[1];
        sceneData[offset + 2] = position[2];
        sceneData[offset + 3] = sizeFactor;
        sceneData[offset + 4] = clamp(.14 + signal * .105, .12, hub ? .86 : .7) * alphaScale;
        sceneData[offset + 5] = categoryCodes[category];
        sceneData[offset + 6] = hub ? 5.2 : 3.2;
        sceneData[offset + 7] = packageIndex;
        sceneData[offset + 8] = systemIndex;
        nextRenderIndex += 1;
        return sizeFactor;
      };

      // Must run in the same iteration as the point's writeScenePoint call:
      // renderIndex pairs the object with its sceneData row and gl_VertexID.
      const addPoint = (point, sizeFactor, interactive = true) => {
        point.renderIndex = nextRenderIndex - 1;
        point.sizeFactor = sizeFactor;
        point.maxSize = point.hub ? 5.2 : 3.2;
        point.screen = null;
        if (interactive && interactiveMode) interactivePoints.push(point);
        if (point.hub) dependencyHubs.push(point);
        if (point.packageHub) packageHubs.push(point);
        if (point.systemHub) systemHubs.push(point);
      };
      model.namespaces.forEach((row, index) => {
        const name = interactiveMode ? model.namespaceNames[index] : "";
        const category = row[2] === 1 ? "tests" : "core";
        const values = row.slice(3, 9);
        const position = category === "tests" ? testPosition(row[0]) : corePosition(row[0]);
        const sizeFactor = writeScenePoint(category, position, weightedSignal(normalizedSignals(values), category), category === "core" ? .82 : .68, false, -1, -1);
        const interactive = interactiveMode && !name.startsWith(RSPEC_PROXY_PREFIX);
        const annotationKey = showcaseAnnotationKey(category, index);
        const anchored = showcaseDetails && (showcaseAnnotationAnchors.has(annotationKey) || showcasePinnedNamespaceAnchors.has(index));
        if (!interactive && !anchored) return;
        const point = interactiveMode
          ? { category, position, name, kind: row[1] === 0 ? "Class" : "Module", rubyCounts: row.slice(9, 13), instanceVariableCount: row[13] || 0, values }
          : { category, position };
        if (anchored) showcasePointsByAnchor.set(annotationKey, point);
        addPoint(point, sizeFactor, interactive);
      });
      model.dependencyStars.forEach(row => {
        const values = row.slice(2, 8);
        const packageIndex = row[1];
        writeScenePoint(
          "dependencies",
          dependencyPosition(row[0], packageIndex),
          weightedSignal(normalizedSignals(values), "dependencies"),
          .45,
          false,
          packageIndex,
          Number(model.packages[packageIndex]?.[8] ?? -1),
        );
      });
      systemAnchors.forEach((anchor, index) => {
        const systemRow = dependencySystems[index];
        const aggregate = systemAggregates[index];
        const visualValues = [0, aggregate.declarationCount, 0, 0, 0, 0];
        const position = anchor.slice(0, 3);
        const sizeFactor = writeScenePoint("dependencies", position, weightedSignal(normalizedSignals(visualValues), "dependencies"), 2.15, true, -1, index);
        const point = { category: "dependencies", position, systemIndex: index, hub: true, systemHub: true };
        if (interactiveMode) Object.assign(point, { name: model.packageNames[systemRow[1]], memberCount: systemMembers[index].length, directMemberCount: aggregate.directCount, rubyCounts: aggregate.rubyCounts });
        addPoint(point, sizeFactor);
      });
      packageAnchors.forEach((anchor, index) => {
        const packageRow = model.packages[index];
        const systemIndex = Number(packageRow[8]);
        const rubyCounts = packageRow.slice(4, 8);
        const visualValues = [0, packageRow[3], 0, 0, 0, 0];
        const position = anchor.slice(0, 3);
        const sizeFactor = writeScenePoint("dependencies", position, weightedSignal(normalizedSignals(visualValues), "dependencies"), systemIndex >= 0 ? 1.55 : 1.8, true, index, systemIndex);
        const point = { category: "dependencies", position, packageIndex: index, systemIndex, hub: true, packageHub: true };
        if (interactiveMode) Object.assign(point, { name: model.packageNames[index], packageRole: packageRow[1] === 0 ? "Direct dependency" : "Transitive dependency", packageLocation: packageRow[2] === 0 ? "Workspace gem" : "External gem", rubyCounts, groupedMemberCount: systemIndex >= 0 ? systemMembers[systemIndex].length : 0 });
        if (showcaseDetails) {
          const annotationKey = showcaseAnnotationKey("dependencies", index);
          if (showcaseAnnotationAnchors.has(annotationKey)) showcasePointsByAnchor.set(annotationKey, point);
        }
        addPoint(point, sizeFactor);
      });
      return { sceneData, scenePointCount, interactivePoints, dependencyHubs, packageHubs, systemHubs };
    }
    const { sceneData, scenePointCount, interactivePoints, dependencyHubs, packageHubs, systemHubs } = buildPoints();
    const travelFlightLimit = travelFlightLimitForPointCount(scenePointCount);
    const constantReferenceLinks = decodeConstantReferenceLinks(model.constantReferenceLinks);
    const travelScheduleSeed = hash((
      morphology.phaseSeed ^ scenePointCount ^
      Math.imul(constantReferenceLinks.length + 1, 0x9e3779b9)
    ) >>> 0);
    delete model.constantReferenceLinks;
    function travelEndpointCategory(renderIndex) {
      const categoryCode = sceneData[renderIndex * SCENE_POINT_STRIDE + 5];
      if (categoryCode === categoryCodes.tests) return "tests";
      if (categoryCode === categoryCodes.dependencies) return "dependencies";
      return "core";
    }
    const dependencyTravelLinkIndices = [];
    const workspaceTravelLinkIndices = [];
    constantReferenceLinks.forEach((link, index) => {
      const pool = travelEndpointCategory(link.departureIndex) === "dependencies"
        ? dependencyTravelLinkIndices
        : workspaceTravelLinkIndices;
      pool.push(index);
    });
    const packageCount = model.packages.length;

    // Unresolved-glow population. The milky texture of a real galaxy is not a
    // halo around bright stars; it is millions of separate faint stars too
    // small to resolve. Haze micro-stars are therefore drawn from the same
    // deterministic position law as the data marks themselves — corePosition,
    // testPosition, and dependencyPosition with fresh seeds — so the haze is
    // literally more of the same stellar population, only fainter: arms stay
    // crisp, the exponential radial falloff shows, and zooming in resolves the
    // texture into faint individual stars instead of per-mark blur blobs.
    // Haze rows live after the data rows in one interleaved buffer, encode
    // their category as data category + HAZE_CATEGORY_OFFSET, and never enter
    // interactive points, hit scans, search, or reported scene point counts.
    const HAZE_CATEGORY_OFFSET = 3;
    // Tuned constants and unit/normal channels for the haze population, named
    // in one frozen recipe block per the renderer geometry practices. normal
    // draws consume their channel and channel + 1.
    const HAZE_RECIPE = Object.freeze({
      pointBudget: 90_000,
      starsPerMark: Object.freeze({ core: 24, tests: 18, dependencyStar: 2 }),
      sizeChannel: 96,
      faintChannel: 97,
      ditherSeedChannel: 120,
      ditherChannel: 121,
      poolSeedChannel: 133,      // + category code: core 133, tests 134, dependencies 135
      clumpCenterChannel: 137,   // + category code
      clumpMemberChannel: 139,   // + category code; members draw normal channels 1/3/5
      clumpSize: 14,
      clumpShare: Object.freeze({ core: .2, tests: .3 }),
      clumpSpread: Object.freeze({ core: 1.1, tests: 1.4 }),
      faintFloor: .24,
      faintSpan: .95,
      sparkleThreshold: .96,
      size: Object.freeze({ floor: .16, span: .14 }),
      sparkleSize: Object.freeze({ floor: .3, span: .18 }),
      maxSize: 1.2,
    });
    function buildHazePoints() {
      const markCounts = [0, 0, 0];
      const alphaSums = [0, 0, 0];
      for (let index = 0; index < scenePointCount; index += 1) {
        const offset = index * SCENE_POINT_STRIDE;
        if (sceneData[offset + 6] > 4) continue;
        const category = sceneData[offset + 5];
        markCounts[category] += 1;
        alphaSums[category] += sceneData[offset + 4];
      }
      const perMark = [HAZE_RECIPE.starsPerMark.core, HAZE_RECIPE.starsPerMark.tests, HAZE_RECIPE.starsPerMark.dependencyStar];
      const requested = markCounts[0] * perMark[0] + markCounts[1] * perMark[1] + markCounts[2] * perMark[2];
      const budgetScale = Math.min(1, HAZE_RECIPE.pointBudget / Math.max(1, requested));
      const poolCounts = markCounts.map((count, category) => Math.round(count * perMark[category] * budgetScale));
      // The budget is a hard cap: rounding and dither tails trim, never spill.
      poolCounts[0] = Math.min(poolCounts[0], HAZE_RECIPE.pointBudget);
      poolCounts[1] = Math.min(poolCounts[1], HAZE_RECIPE.pointBudget - poolCounts[0]);
      const meanAlpha = alphaSums.map((sum, category) => (markCounts[category] ? sum / markCounts[category] : 0));

      // Dependency haze resamples per declaration row so each gem cloud keeps
      // its exact share, morphology, and expansion indexes.
      const dependencyRows = [];
      if (poolCounts[2] > 0) {
        const perStar = perMark[2] * budgetScale;
        for (let index = 0; index < scenePointCount; index += 1) {
          const offset = index * SCENE_POINT_STRIDE;
          if (sceneData[offset + 5] !== categoryCodes.dependencies || sceneData[offset + 6] > 4) continue;
          const stars = Math.floor(perStar) +
            (unit(hash(index + 1, HAZE_RECIPE.ditherSeedChannel), HAZE_RECIPE.ditherChannel) < perStar % 1 ? 1 : 0);
          for (let star = 0; star < stars; star += 1) dependencyRows.push(index * 8 + star);
        }
        const dependencyBudget = Math.max(0, HAZE_RECIPE.pointBudget - poolCounts[0] - poolCounts[1]);
        if (dependencyRows.length > dependencyBudget) dependencyRows.length = dependencyBudget;
      }

      const hazeCount = poolCounts[0] + poolCounts[1] + dependencyRows.length;
      const data = new Float32Array(hazeCount * SCENE_POINT_STRIDE);
      let cursor = 0;
      const writeHazeStar = (position, category, packageIndex, systemIndex, seed) => {
        const out = cursor * SCENE_POINT_STRIDE;
        const faint = unit(seed, HAZE_RECIPE.faintChannel);
        // faint⁴ keeps most of the field very dim with a small sparkle tail of
        // brighter, slightly larger resolved stars — the depth hierarchy of a
        // real star field rather than uniform grain.
        const sparkle = faint > HAZE_RECIPE.sparkleThreshold;
        const size = sparkle ? HAZE_RECIPE.sparkleSize : HAZE_RECIPE.size;
        data[out] = position[0];
        data[out + 1] = position[1];
        data[out + 2] = position[2];
        data[out + 3] = size.floor + size.span * unit(seed, HAZE_RECIPE.sizeChannel);
        data[out + 4] = meanAlpha[category] * (HAZE_RECIPE.faintFloor + HAZE_RECIPE.faintSpan * faint * faint * faint * faint);
        data[out + 5] = category + HAZE_CATEGORY_OFFSET;
        data[out + 6] = HAZE_RECIPE.maxSize;
        data[out + 7] = packageIndex;
        data[out + 8] = systemIndex;
        cursor += 1;
      };
      // A fraction of each namespace pool lands in tight clumps resampled from
      // the same law — the flocculent star-cloud patchiness of a real disc.
      const writeNamespacePool = (count, category, positionFor, clumpShare, clumpSpread) => {
        const clumps = Math.floor(count * clumpShare / HAZE_RECIPE.clumpSize);
        const smooth = count - clumps * HAZE_RECIPE.clumpSize;
        for (let star = 0; star < smooth; star += 1) {
          const seed = hash(star + 1, HAZE_RECIPE.poolSeedChannel + category);
          writeHazeStar(positionFor(seed), category, -1, -1, seed);
        }
        for (let clump = 0; clump < clumps; clump += 1) {
          const center = positionFor(hash(clump + 1, HAZE_RECIPE.clumpCenterChannel + category));
          for (let member = 0; member < HAZE_RECIPE.clumpSize; member += 1) {
            const seed = hash(clump * 97 + member + 1, HAZE_RECIPE.clumpMemberChannel + category);
            writeHazeStar([
              center[0] + normal(seed, 1) * clumpSpread,
              center[1] + normal(seed, 3) * clumpSpread * .4,
              center[2] + normal(seed, 5) * clumpSpread,
            ], category, -1, -1, seed);
          }
        }
      };
      writeNamespacePool(poolCounts[0], categoryCodes.core, corePosition, HAZE_RECIPE.clumpShare.core, HAZE_RECIPE.clumpSpread.core * layoutScale.disk);
      writeNamespacePool(poolCounts[1], categoryCodes.tests, testPosition, HAZE_RECIPE.clumpShare.tests, HAZE_RECIPE.clumpSpread.tests * layoutScale.tests);
      for (const row of dependencyRows) {
        const offset = Math.floor(row / 8) * SCENE_POINT_STRIDE;
        const seed = hash(row + 1, HAZE_RECIPE.poolSeedChannel + categoryCodes.dependencies);
        writeHazeStar(
          dependencyPosition(seed, sceneData[offset + 7]),
          categoryCodes.dependencies,
          sceneData[offset + 7],
          sceneData[offset + 8],
          seed,
        );
      }
      return data;
    }
    // Dust absorbs. One broad, broken lane hugs each spiral arm's inner edge
    // and attenuates the marks and haze behind it by up to half — rule 6 of
    // docs/STELLAR_DESIGN_RESEARCH.md: dust is derived from the morphology,
    // broken into segments, and absorbing; never uniform fog and never new
    // glowing particles. Positions are static in galaxy space, so absorption
    // is baked into point alphas at build time and costs nothing per frame.
    // innerRadius matches the bulge's outer edge — corePosition's bulge radial
    // law caps at 17, and the tests disc starts there — so lanes never cut
    // through bulge stars and dust begins where arms actually live.
    const DUST_PRESET = Object.freeze({
      maxAbsorption: .5,
      laneWidth: 2.4,
      laneOffset: -.16,
      innerRadius: 17,
      fadeInSpan: 5,
      outerFadeStart: 44,
      outerFadeEnd: 58,
      segmentLength: 9,
      brokenChannel: 150,
    });
    const smoothstep = (low, high, value) => {
      const t = clamp((value - low) / (high - low), 0, 1);
      return t * t * (3 - 2 * t);
    };
    function dustAttenuation(position, radialScale) {
      if (!spiralMorphology) return 0;
      const x = position[0] / radialScale;
      const z = position[2] / radialScale;
      const radial = Math.hypot(x, z);
      const barred = morphology.family === MORPHOLOGY_FAMILY.barredSpiral;
      // Lanes hug arms, and barred arms only exist beyond the bar tips.
      const laneStart = barred ? Math.max(DUST_PRESET.innerRadius, barRadius) : DUST_PRESET.innerRadius;
      const window = smoothstep(laneStart, laneStart + DUST_PRESET.fadeInSpan, radial) *
        (1 - smoothstep(DUST_PRESET.outerFadeStart, DUST_PRESET.outerFadeEnd, radial));
      if (window <= 0) return 0;
      const pointTheta = Math.atan2(z, x);
      let density = 0;
      for (let arm = 0; arm < morphology.armCount; arm += 1) {
        // armCenterTheta is the same law that places arm stars, so the lane
        // follows the rendered arm — including its seeded jitters and forks.
        const laneTheta = armCenterTheta(arm, radial) + DUST_PRESET.laneOffset;
        const delta = Math.atan2(Math.sin(pointTheta - laneTheta), Math.cos(pointTheta - laneTheta));
        const across = Math.abs(delta) * radial;
        if (across > DUST_PRESET.laneWidth * 3) continue;
        const segment = Math.floor((radial + arm * 3.7) / DUST_PRESET.segmentLength);
        const broken = (.35 + .65 * unit(hash(morphology.phaseSeed + arm * 17 + 1, DUST_PRESET.brokenChannel + segment), 0)) *
          (.6 + .4 * Math.sin(radial * 1.7 + arm * 2.1));
        density = Math.max(density, Math.exp(-((across / DUST_PRESET.laneWidth) ** 2)) * clamp(broken, 0, 1));
      }
      return DUST_PRESET.maxAbsorption * window * density;
    }
    function applyDustLanes(rows, count, categoryColumnOffset) {
      for (let index = 0; index < count; index += 1) {
        const offset = index * SCENE_POINT_STRIDE;
        const category = rows[offset + 5] - categoryColumnOffset;
        if (category !== categoryCodes.core && category !== categoryCodes.tests) continue;
        const radialScale = category === categoryCodes.core ? layoutScale.disk : layoutScale.tests;
        const absorbed = dustAttenuation([rows[offset], rows[offset + 1], rows[offset + 2]], radialScale);
        if (absorbed > 0) rows[offset + 4] *= 1 - absorbed;
      }
    }
    // Haze and dust exist only to be rendered, so they are built on first use
    // by an accepted renderer — a browser that takes the WebGL2-unavailable
    // path never spends the CPU or memory. Data rows come first, haze rows
    // after: glow and white-hot passes draw only the first scenePointCount
    // rows, and data render indexes stay pairable with gl_VertexID for
    // selection.
    let hazeBufferState = null;
    function hazeBuffers() {
      if (!hazeBufferState) {
        const hazeData = buildHazePoints();
        applyDustLanes(sceneData, scenePointCount, 0);
        applyDustLanes(hazeData, hazeData.length / SCENE_POINT_STRIDE, HAZE_CATEGORY_OFFSET);
        const renderPointData = new Float32Array(sceneData.length + hazeData.length);
        renderPointData.set(sceneData, 0);
        renderPointData.set(hazeData, sceneData.length);
        // Counts are always derived from the buffers at their call sites; the
        // arrays are the single source of truth for the rendered workload.
        hazeBufferState = Object.freeze({ hazeData, renderPointData });
      }
      return hazeBufferState;
    }

    const embeddedDependencyDeclarations = model.dependencyStars.length;
    let plottedDependencyDeclarations = embeddedDependencyDeclarations;

    function updateGalaxySummary() {
      const summary = document.getElementById("galaxy-summary");
      const rendererUnavailable = showcaseMode
        ? document.documentElement.dataset.showcaseRenderer === "unavailable"
        : document.documentElement.dataset.explorerRenderer === "unavailable";
      if (rendererUnavailable) {
        summary.textContent = `${MORPHOLOGY_FAMILY_LABELS[morphology.family]} · WebGL2 required`;
        return;
      }
      summary.textContent = `${MORPHOLOGY_FAMILY_LABELS[morphology.family]} · ${scenePointCount.toLocaleString("en-US")} ${scenePointCount === 1 ? "star" : "stars"}`;
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
      document.documentElement.dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations);
      document.documentElement.dataset.plottedScenePoints = "0";
      document.documentElement.dataset.hazePoints = "0";
      if (error) document.documentElement.dataset.explorerRendererError = error.message;
      canvas.setAttribute("aria-label", "Interactive artwork unavailable because WebGL2 is required.");
      disableExplorerControls();
      updateGalaxySummary();
      populateWarningDisclosure();
      if (hadInteractiveFocus) document.getElementById("warning-summary").focus({ preventScroll: true });
    }

    function markShowcaseUnavailable(reason, error = null) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      showcaseRenderer = null;
      showcaseStartedAt = null;
      showcaseAnnotationSlot = -1;
      activeShowcaseAnnotation = null;
      hideShowcaseAnnotation();
      if (showcaseAnnotation) showcaseAnnotation.hidden = true;
      canvas.hidden = true;
      travelCanvas.hidden = true;
      canvas.setAttribute("aria-label", "Showcase artwork unavailable because WebGL2 is required.");
      if (showcaseStatus) {
        showcaseStatus.textContent = "WebGL2 is required to display this Showcase.";
        showcaseStatus.hidden = false;
      }
      document.documentElement.dataset.showcaseRenderer = "unavailable";
      document.documentElement.dataset.showcaseUnavailableReason = reason;
      plottedDependencyDeclarations = 0;
      document.documentElement.dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations);
      document.documentElement.dataset.plottedScenePoints = "0";
      document.documentElement.dataset.hazePoints = "0";
      document.documentElement.dataset.showcaseMotion = "unavailable";
      document.documentElement.dataset.showcaseReady = "true";
      if (error) document.documentElement.dataset.showcaseRendererError = error.message;
      updateGalaxySummary();
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
          // Negative radius marks a milk sprite: a soft puff whose additive
          // overlap integrates unresolved light into a continuous glow
          // surface. (1-r²)² tracks a gaussian closely and stays cheap on the
          // software rasterizers the milk pass must survive.
          if (v_radius < 0.0) {
            if (radial > 1.0) discard;
            float falloff = 1.0 - radial * radial;
            float milk = v_alpha * falloff * falloff;
            outColor = vec4(v_colour * milk, milk);
            return;
          }
          float feather = min(1.0, 1.0 / max(v_radius, 1.0));
          float coverage = 1.0 - smoothstep(1.0 - feather, 1.0, radial);
          if (coverage <= 0.0) discard;
          float contribution = v_alpha * coverage;
          outColor = vec4(v_colour * contribution, contribution);
        }
      `;

    const DEPENDENCY_SPIN_VERTEX_SOURCE = `
        uniform sampler2D u_dependencySpins;
        uniform int u_dependencySpinTextureWidth;
        uniform float u_dependencySpinElapsed;

        vec3 dependencySpinPosition(vec3 position, float category, float maxSize, float packageIndex) {
          if (category < 1.5 || maxSize >= 4.0 || packageIndex < 0.0) return position;
          int index = int(packageIndex + 0.5);
          ivec2 coordinate = ivec2(index % u_dependencySpinTextureWidth, index / u_dependencySpinTextureWidth);
          vec4 spin = texelFetch(u_dependencySpins, coordinate, 0);
          float angle = spin.w * u_dependencySpinElapsed;
          float cosine = cos(angle);
          float sine = sin(angle);
          vec2 offset = position.xz - spin.xz;
          return vec3(
            spin.x + offset.x * cosine - offset.y * sine,
            position.y,
            spin.z + offset.x * sine + offset.y * cosine
          );
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
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        depth: false,
        desynchronized: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      if (!gl) {
        document.documentElement.dataset.showcaseUnavailableReason = "webgl2-unavailable";
        return null;
      }
      // The largest active sprite decides the capability floor: the hub glow
      // when the glow pass is on, otherwise the larger of the hub body and the
      // milk sprite (drawn at quarter resolution, so its device size is half
      // a hazeMilkRadius).
      const maxSpriteCssSize = Math.max(
        SHOWCASE_PRESET.pointGlowPercent > 0 ? 5.2 * 3.4 * 2 : 5.2 * 2,
        SHOWCASE_PRESET.hazeMilkRadius / 2,
      ) + 2;
      const pointSizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      if (pointSizeRange[1] < maxSpriteCssSize) {
        document.documentElement.dataset.showcaseUnavailableReason = "webgl2-point-size-range";
        return null;
      }
      const { renderPointData } = hazeBuffers();
      const renderPointCount = renderPointData.length / SCENE_POINT_STRIDE;

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
        layout(location = 5) in float a_packageIndex;
        uniform vec2 u_resolution;
        uniform vec2 u_center;
        uniform vec4 u_trig;
        uniform float u_zoom;
        uniform float u_cameraDistance;
        uniform float u_cameraFocalLength;
        uniform float u_brightness;
        uniform float u_glow;
        uniform float u_deepDetail;
        uniform int u_pass;
        ${DEPENDENCY_SPIN_VERTEX_SOURCE}
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
          bool hazePoint = a_category >= 2.5;
          float categoryCode = hazePoint ? a_category - 3.0 : a_category;
          vec3 position = dependencySpinPosition(a_position, categoryCode, a_maxSize, a_packageIndex);
          float cy = u_trig.x;
          float sy = u_trig.y;
          float cp = u_trig.z;
          float sp = u_trig.w;
          float x1 = position.x * cy - position.z * sy;
          float z1 = position.x * sy + position.z * cy;
          float y2 = position.y * cp - z1 * sp;
          float z2 = position.y * sp + z1 * cp;
          float depth = u_cameraDistance - z2;
          if (depth <= 35.0) { hidePoint(); return; }

          float perspective = u_cameraFocalLength / depth * u_zoom;
          vec2 screen = u_center + vec2(x1, y2) * perspective;
          if (screen.x < -20.0 || screen.x > u_resolution.x + 20.0 || screen.y < -20.0 || screen.y > u_resolution.y + 20.0) {
            hidePoint();
            return;
          }

          float size = clamp(a_sizeFactor * perspective, 0.35, a_maxSize);
          float starAlphaScale = categoryCode > 1.5 ? float(${SHOWCASE_DEPENDENCY_PRESET.starAlphaScale}) : 1.0;
          float visibleAlpha = clamp(a_alpha * starAlphaScale * u_brightness / 100.0, 0.0, 1.0);
          float radius = size;
          float alpha = visibleAlpha;
          vec3 colour = categoryCode < 0.5
            ? ${glslVec3(colours.core)} / 255.0
            : (categoryCode < 1.5 ? ${glslVec3(colours.tests)} / 255.0 : ${glslVec3(colours.dependencies)} / 255.0);

          if (u_pass == 3) {
            // Milk pass: on the fixed far camera the unresolved population
            // presents as its integrated light — big, ultra-faint gaussian
            // sprites whose overlap forms a continuous glow tracing the
            // real density law, not individual resolved points. It renders
            // into a half-resolution target, so device sizes are halved.
            if (!hazePoint) { hidePoint(); return; }
            radius = float(${SHOWCASE_PRESET.hazeMilkRadius});
            alpha = visibleAlpha * float(${SHOWCASE_PRESET.hazeMilkGainPercent}) / 100.0;
          } else if (u_pass == 0) {
            if (hazePoint || size <= 1.35 || u_glow <= 0.0) { hidePoint(); return; }
            float glowScale = (3.4 - u_deepDetail * 1.3) * (0.75 + 0.25 * u_glow / 100.0);
            radius = size * glowScale;
            alpha = min(1.0, visibleAlpha * 0.055 * u_glow / 100.0);
          } else if (u_pass == 1) {
            if (hazePoint) { hidePoint(); return; }
            radius = size < 0.85 ? 0.5 : size;
          } else {
            if (hazePoint || size <= 1.1) { hidePoint(); return; }
            radius = max(0.45 + u_deepDetail * 0.25, size * (0.24 + u_deepDetail * 0.06));
            alpha = min(0.9, visibleAlpha * 1.25);
            colour = ${glslVec3(whiteHotColour)} / 255.0;
          }

          gl_Position = vec4(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0, 0.0, 1.0);
          gl_PointSize = max(1.0, radius * 2.0) * (u_pass == 3 ? 0.25 : 1.0);
          v_colour = colour;
          v_alpha = alpha;
          v_radius = u_pass == 3 ? -radius : radius;
        }
      `, POINT_FRAGMENT_SOURCE);

      const pointVao = gl.createVertexArray();
      const pointBuffer = gl.createBuffer();
      gl.bindVertexArray(pointVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, renderPointData, gl.STATIC_DRAW);
      const stride = SCENE_POINT_STRIDE * Float32Array.BYTES_PER_ELEMENT;
      [[0, 3, 0], [1, 1, 3], [2, 1, 4], [3, 1, 5], [4, 1, 6], [5, 1, 7]].forEach(([location, size, offset]) => {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
      });
      gl.bindVertexArray(null);
      const dependencySpins = createDependencySpinTexture(gl);

      // The milk pass accumulates into a quarter-resolution offscreen target
      // and is composited up with linear filtering: identical integrated light
      // at a sixteenth of the fragment work, which keeps large scenes and the
      // software rasterizers CI and clip export run on inside frame budgets.
      const milkTexture = gl.createTexture();
      const milkFramebuffer = gl.createFramebuffer();
      let milkWidth = 0;
      let milkHeight = 0;
      const ensureMilkTarget = () => {
        const targetWidth = Math.max(1, Math.round(canvas.width / 4));
        const targetHeight = Math.max(1, Math.round(canvas.height / 4));
        if (targetWidth === milkWidth && targetHeight === milkHeight) return;
        milkWidth = targetWidth;
        milkHeight = targetHeight;
        gl.bindTexture(gl.TEXTURE_2D, milkTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, milkWidth, milkHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, milkFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, milkTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      };
      const milkCompositeProgram = createProgram(FULLSCREEN_TRIANGLE_VERTEX_SOURCE, `#version 300 es
        precision highp float;
        uniform sampler2D u_milk;
        uniform vec2 u_resolution;
        out vec4 outColor;
        void main() { outColor = texture(u_milk, gl_FragCoord.xy / u_resolution); }
      `);
      const milkCompositeUniforms = {
        milk: gl.getUniformLocation(milkCompositeProgram, "u_milk"),
        resolution: gl.getUniformLocation(milkCompositeProgram, "u_resolution"),
      };

      const backgroundUniforms = {
        resolution: gl.getUniformLocation(backgroundProgram, "u_resolution"),
        center: gl.getUniformLocation(backgroundProgram, "u_center"),
        backgroundGlow: gl.getUniformLocation(backgroundProgram, "u_backgroundGlow"),
      };
      const pointUniforms = {
        resolution: gl.getUniformLocation(pointProgram, "u_resolution"),
        center: gl.getUniformLocation(pointProgram, "u_center"),
        trig: gl.getUniformLocation(pointProgram, "u_trig"),
        zoom: gl.getUniformLocation(pointProgram, "u_zoom"),
        cameraDistance: gl.getUniformLocation(pointProgram, "u_cameraDistance"),
        cameraFocalLength: gl.getUniformLocation(pointProgram, "u_cameraFocalLength"),
        brightness: gl.getUniformLocation(pointProgram, "u_brightness"),
        glow: gl.getUniformLocation(pointProgram, "u_glow"),
        deepDetail: gl.getUniformLocation(pointProgram, "u_deepDetail"),
        dependencySpins: gl.getUniformLocation(pointProgram, "u_dependencySpins"),
        dependencySpinTextureWidth: gl.getUniformLocation(pointProgram, "u_dependencySpinTextureWidth"),
        dependencySpinElapsed: gl.getUniformLocation(pointProgram, "u_dependencySpinElapsed"),
        pass: gl.getUniformLocation(pointProgram, "u_pass"),
      };
      canvas.addEventListener("webglcontextlost", () => {
        markShowcaseUnavailable("webgl2-context-lost");
      });

      document.documentElement.dataset.showcaseRenderer = "webgl2";
      document.documentElement.dataset.pointSizeRange = `${pointSizeRange[0]},${pointSizeRange[1]}`;

      return Object.freeze({
        resize(viewportWidth, viewportHeight) {
          canvas.width = Math.round(viewportWidth);
          canvas.height = Math.round(viewportHeight);
          gl.viewport(0, 0, canvas.width, canvas.height);
          ensureMilkTarget();
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
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, dependencySpins.texture);
          gl.uniform1i(pointUniforms.dependencySpins, 0);
          gl.uniform1i(pointUniforms.dependencySpinTextureWidth, dependencySpins.width);
          gl.uniform1f(pointUniforms.dependencySpinElapsed, dependencySpinElapsed / 1000);
          gl.uniform2f(pointUniforms.resolution, width, height);
          gl.uniform2f(pointUniforms.center, sceneCenterX, sceneCenterY);
          const [cy, sy, cp, sp] = viewMatrix();
          gl.uniform4f(pointUniforms.trig, cy, sy, cp, sp);
          gl.uniform1f(pointUniforms.zoom, zoom);
          gl.uniform1f(pointUniforms.cameraDistance, cameraDistance);
          gl.uniform1f(pointUniforms.cameraFocalLength, cameraFocalLength);
          gl.uniform1f(pointUniforms.brightness, SHOWCASE_PRESET.starBrightnessPercent);
          gl.uniform1f(pointUniforms.glow, SHOWCASE_PRESET.pointGlowPercent);
          gl.uniform1f(pointUniforms.deepDetail, deepDetail);

          ensureMilkTarget();
          gl.bindFramebuffer(gl.FRAMEBUFFER, milkFramebuffer);
          gl.viewport(0, 0, milkWidth, milkHeight);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1i(pointUniforms.pass, 3);
          gl.drawArrays(gl.POINTS, scenePointCount, renderPointCount - scenePointCount);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.useProgram(milkCompositeProgram);
          gl.bindVertexArray(null);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, milkTexture);
          gl.uniform1i(milkCompositeUniforms.milk, 1);
          gl.uniform2f(milkCompositeUniforms.resolution, canvas.width, canvas.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.useProgram(pointProgram);
          gl.bindVertexArray(pointVao);

          for (let pass = 0; pass < 3; pass += 1) {
            gl.uniform1i(pointUniforms.pass, pass);
            gl.drawArrays(gl.POINTS, 0, scenePointCount);
          }
          gl.bindVertexArray(null);
          gl.disable(gl.BLEND);
        },
      });
    }

    let showcaseRendererError = null;
    if (showcaseMode) {
      try {
        showcaseRenderer = createShowcaseRenderer();
      } catch (error) {
        showcaseRendererError = error;
        document.documentElement.dataset.showcaseUnavailableReason = "webgl2-initialization-error";
      }
      if (showcaseRenderer) {
        document.documentElement.dataset.plottedDependencyDeclarations = String(embeddedDependencyDeclarations);
        document.documentElement.dataset.plottedScenePoints = String(scenePointCount);
        document.documentElement.dataset.hazePoints = String(hazeBuffers().hazeData.length / SCENE_POINT_STRIDE);
      } else {
        markShowcaseUnavailable(
          document.documentElement.dataset.showcaseUnavailableReason || "webgl2-unavailable",
          showcaseRendererError,
        );
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
      const { renderPointData } = hazeBuffers();
      const renderPointCount = renderPointData.length / SCENE_POINT_STRIDE;
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
        uniform vec4 u_trig;
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
        ${DEPENDENCY_SPIN_VERTEX_SOURCE}
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
          bool hazePoint = a_category >= 2.5;
          float categoryCode = hazePoint ? a_category - 3.0 : a_category;
          int category = int(categoryCode + 0.5);
          if (u_categoryVisible[category] < 0.5) { hidePoint(); return; }
          vec3 position = dependencySpinPosition(a_position, categoryCode, a_maxSize, a_packageIndex);
          bool expandedPoint = (u_expandedPackage >= 0.0 && a_packageIndex == u_expandedPackage)
            || (u_expandedSystem >= 0.0 && a_systemIndex == u_expandedSystem);
          if (expandedPoint) position = u_expandedAnchor + (position - u_expandedAnchor) * u_expansion;
          float cy = u_trig.x;
          float sy = u_trig.y;
          float cp = u_trig.z;
          float sp = u_trig.w;
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
          bool focusedDependencyPoint = !hazePoint && expandedPoint && category == 2;
          bool focusedDependencyHub = focusedDependencyPoint && a_maxSize > 4.0;
          float emphasis = focusedDependencyPoint || selected ? 1.0 : u_categoryEmphasis[category];
          float focusedAlpha = max(focusedDependencyHub ? 0.34 : 0.289, a_alpha);
          float visibleAlpha = (focusedDependencyPoint ? focusedAlpha : a_alpha * emphasis) * u_exposure;
          bool detailed = emphasis >= 0.1;
          float radius = size;
          float alpha = visibleAlpha;
          vec3 colour = categoryCode < 0.5
            ? ${glslVec3(colours.core)} / 255.0
            : (categoryCode < 1.5 ? ${glslVec3(colours.tests)} / 255.0 : ${glslVec3(colours.dependencies)} / 255.0);

          if (u_pass == 0) {
            if (hazePoint || size <= 1.35 || !detailed) { hidePoint(); return; }
            float glowScale = focusedDependencyPoint ? 2.2 - u_deepDetail * 0.8 : 3.4 - u_deepDetail * 1.3;
            radius = size * glowScale;
            alpha = visibleAlpha * (focusedDependencyPoint ? 0.045 : 0.055) * (1.0 - 0.78 * u_deepDetail);
          } else if (u_pass == 1) {
            if (hazePoint) {
              // Haze escapes the zoom exposure dimming: as marks calm down at
              // depth, the unresolved field stays lit and reads as resolved
              // faint stars, the way a telescope resolves the Milky Way.
              radius = size * (1.0 + 0.4 * u_deepDetail);
              alpha = a_alpha * emphasis * mix(u_exposure, 1.35, u_deepDetail);
            } else {
              radius = (!detailed || size < 0.85) ? 0.5 : size;
            }
          } else {
            if (hazePoint || size <= 1.1 || !detailed) { hidePoint(); return; }
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

      const pointVao = gl.createVertexArray();
      const pointBuffer = gl.createBuffer();
      gl.bindVertexArray(pointVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, renderPointData, gl.STATIC_DRAW);
      const stride = SCENE_POINT_STRIDE * Float32Array.BYTES_PER_ELEMENT;
      [[0, 3, 0], [1, 1, 3], [2, 1, 4], [3, 1, 5], [4, 1, 6], [5, 1, 7], [6, 1, 8]].forEach(([location, size, offset]) => {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
      });
      gl.bindVertexArray(null);
      const dependencySpins = createDependencySpinTexture(gl);

      const backgroundUniforms = {
        resolution: gl.getUniformLocation(backgroundProgram, "u_resolution"),
        center: gl.getUniformLocation(backgroundProgram, "u_center"),
      };
      const pointUniforms = Object.fromEntries([
        "u_resolution", "u_center", "u_sceneBounds", "u_trig", "u_zoom",
        "u_cameraDistance", "u_cameraFocalLength", "u_exposure", "u_deepDetail", "u_dpr",
        "u_categoryVisible", "u_categoryEmphasis", "u_expandedPackage", "u_expandedSystem",
        "u_expandedAnchor", "u_expansion", "u_selectedIndex", "u_dependencySpins",
        "u_dependencySpinTextureWidth", "u_dependencySpinElapsed", "u_pass",
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
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, dependencySpins.texture);
          gl.uniform1i(pointUniforms.dependencySpins, 0);
          gl.uniform1i(pointUniforms.dependencySpinTextureWidth, dependencySpins.width);
          gl.uniform1f(pointUniforms.dependencySpinElapsed, dependencySpinElapsed / 1000);
          gl.uniform2f(pointUniforms.resolution, width, height);
          gl.uniform2f(pointUniforms.center, centerX, centerY);
          gl.uniform2f(pointUniforms.sceneBounds, sceneRight, sceneBottom);
          const [cy, sy, cp, sp] = viewMatrix();
          gl.uniform4f(pointUniforms.trig, cy, sy, cp, sp);
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
            gl.drawArrays(gl.POINTS, 0, pass === 1 ? renderPointCount : scenePointCount);
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
        document.documentElement.dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations);
        document.documentElement.dataset.plottedScenePoints = String(scenePointCount);
        document.documentElement.dataset.hazePoints = String(hazeBuffers().hazeData.length / SCENE_POINT_STRIDE);
      } else {
        markExplorerUnavailable(
          document.documentElement.dataset.explorerUnavailableReason || "webgl2-unavailable",
          explorerRendererError,
        );
      }
    }
    const context = interactiveMode ? canvas.getContext("2d", { alpha: Boolean(explorerRenderer) }) : null;
    const travelContext = showcaseMode ? travelCanvas.getContext("2d", { alpha: true }) : context;
    const directGemCount = model.packages.filter(row => row[1] === 0).length;
    const transitiveGemCount = packageCount - directGemCount;
    const allRubyMetricIndexes = [0, 1, 2, 3];
    const testRubyMetricIndexes = [0, 2];
    const dependencyRubyCounts = model.packages.reduce(
      (counts, row) => counts.map((count, index) => count + Number(row[index + 4] || 0)),
      [0, 0, 0, 0],
    );
    const categoryMeta = {
      core: { title: "Core code", rubyCounts: model.categoryStats?.core || [0, 0, 0, 0], metricIndexes: allRubyMetricIndexes, focusZoom: 2.8 },
      tests: { title: "Tests", rubyCounts: model.categoryStats?.tests || [0, 0, 0, 0], metricIndexes: testRubyMetricIndexes, focusZoom: 1.35 },
      dependencies: { title: "Gems", summary: `${packageCount.toLocaleString()} dependency gems`, rubyCounts: dependencyRubyCounts, metricIndexes: allRubyMetricIndexes, note: `${directGemCount.toLocaleString()} direct · ${transitiveGemCount.toLocaleString()} transitive`, focusZoom: .72 },
    };
    model.namespaces = [];
    model.packages = [];
    model.dependencyStars = [];

    function applyCameraTarget(target) {
      resetExplorerTravel();
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

    function advanceDependencySpin(timestamp) {
      if (!interactiveMode || !drifting || reducedMotionQuery.matches) {
        lastDependencySpinTimestamp = null;
        return false;
      }
      const elapsed = lastDependencySpinTimestamp === null
        ? 1000 / 60
        : clamp(timestamp - lastDependencySpinTimestamp, 0, MAX_DRIFT_DELTA_MS);
      lastDependencySpinTimestamp = timestamp;
      dependencySpinElapsed = (dependencySpinElapsed + elapsed) % SHOWCASE_PRESET.durationMs;
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
        const direct = point.directMemberCount === 1 ? "1 direct gem" : `${point.directMemberCount.toLocaleString()} direct gems`;
        tooltipContext.textContent = `${point.memberCount.toLocaleString()} gem clouds · ${direct}${expanded}`;
        addRubyMetrics(point.rubyCounts, allRubyMetricIndexes);
        return;
      }
      if (point.packageHub) {
        const expanded = expandedPackageIndex === point.packageIndex ? " · Expanded gem cloud · Escape to exit" : " · Double-click or F to expand";
        const membership = point.groupedMemberCount > 1 ? ` · Member of ${point.groupedMemberCount.toLocaleString()}-gem system` : "";
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

    function ensureHitScanRows() {
      if (hitScanRows) return hitScanRows;
      hitScanRows = new Float32Array(interactivePoints.length * HIT_SCAN_STRIDE);
      interactivePoints.forEach((point, index) => {
        const offset = index * HIT_SCAN_STRIDE;
        const scene = point.renderIndex * SCENE_POINT_STRIDE;
        hitScanRows[offset] = sceneData[scene];
        hitScanRows[offset + 1] = sceneData[scene + 1];
        hitScanRows[offset + 2] = sceneData[scene + 2];
        hitScanRows[offset + 3] = sceneData[scene + 3];
        hitScanRows[offset + 4] = sceneData[scene + 6];
        hitScanRows[offset + 5] = sceneData[scene + 5];
        hitScanRows[offset + 6] = sceneData[scene + 7];
        hitScanRows[offset + 7] = sceneData[scene + 8];
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
      if (expandedSystemIndex !== null || expandedPackageIndex !== null) resetExplorerTravel();
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
      if (visibleCategories[category] !== visible) resetExplorerTravel();
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
      container.textContent = "";
      details.hidden = !rendererUnavailable && warningTotal === 0;
      if (details.hidden) return;

      const analysisSummary = `${warningTotal.toLocaleString()} analysis warning${warningTotal === 1 ? "" : "s"}`;
      const statusSummaries = [];
      if (rendererUnavailable) statusSummaries.push("WebGL2 required");
      if (warningTotal > 0) statusSummaries.push(analysisSummary);
      summary.textContent = statusSummaries.join(" · ");

      if (rendererUnavailable) {
        details.open = true;
        appendWarningGroup(
          container,
          "Interactive rendering",
          1,
          [],
          `This report requires WebGL2 to display its ${scenePointCount.toLocaleString()}-star interactive scene. Exact dependency totals across ${packageCount.toLocaleString()} ${packageCount === 1 ? "gem" : "gems"} remain complete.`,
          "Unavailable",
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
      if (omittedCount > 0) dependencyNotes.push(`${omittedCount.toLocaleString()} more ${omittedCount === 1 ? "gem warning" : "gem warnings"} not shown.`);
      appendWarningGroup(container, "Dependency gems", safeWarnings.length, shownWarnings, dependencyNotes.join(" "));

      const undetailedManifestCount = Math.max(0, counts.manifest - safeWarnings.length);
      appendWarningGroup(container, "Dependency manifest", undetailedManifestCount, [], "Gem-specific details are unavailable for these warnings.");
      appendWarningGroup(container, "Code analysis", counts.index, [], "Only the aggregate count is included in this report.");
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
        travelCanvas.width = width;
        travelCanvas.height = height;
        travelContext.setTransform(1, 0, 0, 1, 0, 0);
        travelOverlayDirty = false;
        travelEpisodes.length = 0;
        travelScheduleMinute = 0;
        travelScheduleComplete = false;
        fitShowcaseStage();
        updateSceneViewport();
        if (reducedMotionQuery.matches) applyShowcaseCamera(0);
        if (showcaseRenderer) requestRender();
        return;
      }
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      travelOverlayDirty = false;
      resetExplorerTravel();
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
      resetExplorerTravel();
    }

    function zoomBetween(nextZoom, fromX, fromY, toX = fromX, toY = fromY) {
      resetExplorerTravel();
      const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const scale = clampedZoom / zoom;
      panX = toX - sceneCenterX - (fromX - sceneCenterX - panX) * scale;
      panY = toY - sceneCenterY - (fromY - sceneCenterY - panY) * scale;
      zoom = clampedZoom;
    }

    function panBy(dx, dy) {
      resetExplorerTravel();
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

    function projectCoordinates(positionX, positionY, positionZ, matrix, out, camera = null) {
      const [cy, sy, cp, sp] = matrix;
      const x1 = positionX * cy - positionZ * sy;
      const z1 = positionX * sy + positionZ * cy;
      const y2 = positionY * cp - z1 * sp;
      const z2 = positionY * sp + z1 * cp;
      const depth = cameraDistance - z2;
      if (depth <= 35) return null;
      const perspective = cameraFocalLength / depth * (camera?.zoom ?? zoom);
      const projected = out || [0, 0, 0];
      projected[0] = sceneCenterX + (camera?.panX ?? panX) + x1 * perspective;
      projected[1] = sceneCenterY + (camera?.panY ?? panY) + y2 * perspective;
      projected[2] = perspective;
      return projected;
    }

    function dependencyExpansionAnchor(packageIndex, systemIndex) {
      if (expandedPackageIndex !== null && packageIndex === expandedPackageIndex) return packageAnchors[expandedPackageIndex];
      if (expandedPackageIndex === null && expandedSystemIndex !== null && systemIndex === expandedSystemIndex) return systemAnchors[expandedSystemIndex];
      return null;
    }

    function projectScenePoint(renderIndex, matrix, out, camera = null, spinElapsed = dependencySpinElapsed) {
      const offset = renderIndex * SCENE_POINT_STRIDE;
      let positionX = sceneData[offset];
      let positionY = sceneData[offset + 1];
      let positionZ = sceneData[offset + 2];
      const packageIndex = sceneData[offset + 7];
      const systemIndex = sceneData[offset + 8];
      if (sceneData[offset + 5] === categoryCodes.dependencies && sceneData[offset + 6] < 4 && packageIndex >= 0) {
        const spun = dependencySpunPosition(positionX, positionY, positionZ, packageIndex, spinElapsed, dependencySpinScratch);
        positionX = spun[0];
        positionY = spun[1];
        positionZ = spun[2];
      }
      const anchor = dependencyExpansionAnchor(packageIndex, systemIndex);
      return projectCoordinates(
        anchor ? anchor[0] + (positionX - anchor[0]) * DEPENDENCY_EXPANSION : positionX,
        anchor ? anchor[1] + (positionY - anchor[1]) * DEPENDENCY_EXPANSION : positionY,
        anchor ? anchor[2] + (positionZ - anchor[2]) * DEPENDENCY_EXPANSION : positionZ,
        matrix,
        out,
        camera,
      );
    }

    function project(point, matrix, out) {
      const position = point.position;
      const anchor = dependencyExpansionAnchor(point.packageIndex, point.systemIndex);
      const positionX = anchor ? anchor[0] + (position[0] - anchor[0]) * DEPENDENCY_EXPANSION : position[0];
      const positionY = anchor ? anchor[1] + (position[1] - anchor[1]) * DEPENDENCY_EXPANSION : position[1];
      const positionZ = anchor ? anchor[2] + (position[2] - anchor[2]) * DEPENDENCY_EXPANSION : position[2];
      return projectCoordinates(positionX, positionY, positionZ, matrix, out);
    }

    const travelEpisodes = [];
    let travelScheduleMinute = 0;
    let travelScheduleComplete = false;
    let explorerTravelCameraOrigin = null;
    let explorerTravelElapsed = 0;
    let explorerTravelLastTimestamp = null;
    let travelOverlayDirty = false;

    function resetExplorerTravel() {
      if (!interactiveMode) return;
      travelEpisodes.length = 0;
      travelScheduleMinute = 0;
      travelScheduleComplete = false;
      explorerTravelCameraOrigin = null;
      explorerTravelElapsed = 0;
      explorerTravelLastTimestamp = null;
    }

    function travelLinksShareEndpoint(left, right) {
      return left.departureIndex === right.departureIndex ||
        left.departureIndex === right.arrivalIndex ||
        left.arrivalIndex === right.departureIndex ||
        left.arrivalIndex === right.arrivalIndex;
    }

    function travelEpisodeSeed(episodeIndex) {
      return hash(hash(travelScheduleSeed, travelScheduleMinute + 1), episodeIndex + 1);
    }

    function travelLinkCandidatesForEpisode(episodeIndex, selected) {
      const episodeSeed = travelEpisodeSeed(episodeIndex);
      const preferencePhase = hash(travelScheduleSeed, travelScheduleMinute + 1) & 3;
      const dependencyPreferred = (episodeIndex + preferencePhase) % 4 !== 0;
      const primaryPool = dependencyPreferred ? dependencyTravelLinkIndices : workspaceTravelLinkIndices;
      const secondaryPool = dependencyPreferred ? workspaceTravelLinkIndices : dependencyTravelLinkIndices;
      const candidates = [];
      const avoidSelected = selected.size < constantReferenceLinks.length;
      for (const [pool, channel] of [
        [primaryPool, TRAVEL_PRESET.candidateChannel],
        [secondaryPool, TRAVEL_PRESET.candidateChannel + 1],
      ]) {
        const start = Math.floor(unit(episodeSeed, channel) * pool.length);
        for (let offset = 0; offset < pool.length && candidates.length < TRAVEL_PRESET.admissionCandidateLimit; offset += 1) {
          const linkIndex = pool[(start + offset) % pool.length];
          if (avoidSelected && selected.has(linkIndex)) continue;
          candidates.push(linkIndex);
        }
      }
      return candidates;
    }

    function travelEpisodeStartsAt(episodeIndex) {
      const episodeSeed = travelEpisodeSeed(episodeIndex);
      const baseInterval = TRAVEL_PRESET.flightDurationMs / travelFlightLimit;
      const minuteStart = travelScheduleMinute * SHOWCASE_PRESET.durationMs;
      let startsAt;
      if (episodeIndex === 0) {
        startsAt = minuteStart + baseInterval * (
          TRAVEL_PRESET.initialDelayMin +
          unit(episodeSeed, TRAVEL_PRESET.initialDelayChannel) * TRAVEL_PRESET.initialDelayRange
        );
      } else {
        startsAt = travelEpisodes[episodeIndex - 1].startsAt + baseInterval * (
          TRAVEL_PRESET.intervalMin +
          unit(episodeSeed, TRAVEL_PRESET.intervalChannel) * TRAVEL_PRESET.intervalRange
        );
      }
      if (episodeIndex >= travelFlightLimit) {
        const handoffAt = travelEpisodes[episodeIndex - travelFlightLimit].startsAt +
          TRAVEL_PRESET.flightDurationMs + TRAVEL_PRESET.handoffGapMinMs +
          unit(episodeSeed, TRAVEL_PRESET.handoffGapChannel) * TRAVEL_PRESET.handoffGapRangeMs;
        startsAt = Math.max(startsAt, handoffAt);
      }
      const latestStart = minuteStart + SHOWCASE_PRESET.durationMs -
        TRAVEL_PRESET.flightDurationMs - TRAVEL_PRESET.loopQuietMs;
      return startsAt <= latestStart ? startsAt : minuteStart + SHOWCASE_PRESET.durationMs;
    }

    function travelEpisodeUpperBound(elapsed) {
      let low = 0;
      let high = travelEpisodes.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (travelEpisodes[middle].startsAt <= elapsed) low = middle + 1;
        else high = middle;
      }
      return low;
    }

    function travelEpisodesThrough(elapsed) {
      if (!constantReferenceLinks.length || !Number.isFinite(elapsed)) return [];
      const normalizedElapsed = showcaseMode
        ? ((elapsed % SHOWCASE_PRESET.durationMs) + SHOWCASE_PRESET.durationMs) % SHOWCASE_PRESET.durationMs
        : Math.max(0, elapsed);
      ensureTravelEpisodesThrough(normalizedElapsed, normalizedElapsed);
      return travelEpisodes.slice(0, travelEpisodeUpperBound(normalizedElapsed));
    }

    function travelStatesAt(elapsed) {
      if (!constantReferenceLinks.length || !Number.isFinite(elapsed)) return [];
      const normalizedElapsed = showcaseMode
        ? ((elapsed % SHOWCASE_PRESET.durationMs) + SHOWCASE_PRESET.durationMs) % SHOWCASE_PRESET.durationMs
        : Math.max(0, elapsed);
      ensureTravelEpisodesThrough(normalizedElapsed, normalizedElapsed);
      const states = [];
      for (let index = travelEpisodeUpperBound(normalizedElapsed) - 1; index >= 0; index -= 1) {
        const episode = travelEpisodes[index];
        const flightElapsed = normalizedElapsed - episode.startsAt;
        if (flightElapsed >= TRAVEL_PRESET.flightDurationMs) break;
        if (!episode.route) continue;
        const rawProgress = flightElapsed / TRAVEL_PRESET.flightDurationMs;
        const progress = rawProgress - TRAVEL_PRESET.progressEase * Math.sin(Math.PI * 2 * rawProgress);
        const fadeInProgress = Math.min(1, rawProgress / TRAVEL_PRESET.fadeInFraction);
        const fadeOutProgress = Math.max(0, (rawProgress - TRAVEL_PRESET.fadeOutStart) / (1 - TRAVEL_PRESET.fadeOutStart));
        const fadeIn = fadeInProgress * fadeInProgress * (3 - 2 * fadeInProgress);
        const fadeOut = 1 - fadeOutProgress * fadeOutProgress * (3 - 2 * fadeOutProgress);
        states.push({ episode, progress, visibility: fadeIn * fadeOut });
      }
      return states.reverse();
    }

    function travelEmphasis(category) {
      if (!interactiveMode) return 1;
      if (expandedPackageIndex !== null || expandedSystemIndex !== null) return contextVisibility.package;
      if (selectionLocked && selectedPoint) return contextVisibility.selection;
      if (focusedCategory) return category === focusedCategory ? 1 : contextVisibility.category;
      return 1;
    }

    function quadraticCoordinate(start, control, end, progress) {
      const inverse = 1 - progress;
      return inverse * inverse * start + 2 * inverse * progress * control + progress * progress * end;
    }

    function quadraticCoordinateFits(start, control, end, low, high) {
      let minimum = Math.min(start, end);
      let maximum = Math.max(start, end);
      const denominator = start - 2 * control + end;
      if (Math.abs(denominator) > 1e-9) {
        const progress = (start - control) / denominator;
        if (progress > 0 && progress < 1) {
          const extremum = quadraticCoordinate(start, control, end, progress);
          minimum = Math.min(minimum, extremum);
          maximum = Math.max(maximum, extremum);
        }
      }
      return minimum >= low && maximum <= high;
    }

    function travelCurveFits(route, right, bottom, inset) {
      return quadraticCoordinateFits(
        route.departure[0],
        route.controlX,
        route.arrival[0],
        inset,
        right - inset,
      ) && quadraticCoordinateFits(
        route.departure[1],
        route.controlY,
        route.arrival[1],
        inset,
        bottom - inset,
      );
    }

    function travelGeometry(departure, arrival, arcDirection) {
      const dx = arrival[0] - departure[0];
      const dy = arrival[1] - departure[1];
      const distance = Math.hypot(dx, dy);
      if (distance < 1) return null;

      const midpointX = (departure[0] + arrival[0]) / 2;
      const midpointY = (departure[1] + arrival[1]) / 2;
      const arcHeight = Math.min(
        TRAVEL_PRESET.arcHeightMax,
        Math.max(TRAVEL_PRESET.arcHeightMin, distance * TRAVEL_PRESET.arcHeightPercent / 100),
      );
      const direction = arcDirection < 0 ? -1 : 1;
      return {
        departure,
        arrival,
        controlX: midpointX - dy / distance * arcHeight * direction,
        controlY: midpointY + dx / distance * arcHeight * direction,
      };
    }

    function prepareTravelGeometry(link, episodeIndex, departure, arrival, right, bottom, inset = 8) {
      const visible = point => point[0] >= inset && point[0] <= right - inset && point[1] >= inset && point[1] <= bottom - inset;
      if (!visible(departure) || !visible(arrival)) return null;

      const positiveRoute = travelGeometry(departure, arrival, 1);
      if (!positiveRoute) return null;
      const distance = Math.hypot(arrival[0] - departure[0], arrival[1] - departure[1]);
      if (distance < TRAVEL_PRESET.minimumRouteLengthPx) return null;
      const midpointX = (departure[0] + arrival[0]) / 2;
      const midpointY = (departure[1] + arrival[1]) / 2;
      const negativeX = midpointX * 2 - positiveRoute.controlX;
      const negativeY = midpointY * 2 - positiveRoute.controlY;
      const centerX = right / 2;
      const centerY = bottom / 2;
      const positiveClearance = Math.hypot(positiveRoute.controlX - centerX, positiveRoute.controlY - centerY);
      const negativeClearance = Math.hypot(negativeX - centerX, negativeY - centerY);
      const linkSeed = hash((link.arrivalIndex ^ Math.imul(link.departureIndex + 1, 0x9e3779b9)) >>> 0);
      const seededDirection = unit(
        hash(linkSeed, episodeIndex + 1),
        TRAVEL_PRESET.arcDirectionChannel,
      ) < 0.5 ? -1 : 1;
      const arcDirection = Math.abs(positiveClearance - negativeClearance) < 1
        ? seededDirection
        : positiveClearance > negativeClearance ? 1 : -1;
      return arcDirection > 0 ? positiveRoute : travelGeometry(departure, arrival, -1);
    }

    function beginExplorerTravelCamera(elapsed) {
      if (explorerTravelCameraOrigin) return;
      const yawDirection = screenRotationYawSign(pitch);
      explorerTravelCameraOrigin = {
        elapsed: 0,
        yaw: yaw - yawDirection * DRIFT_RADIANS_PER_SECOND * elapsed / 1000,
        yawDirection,
        pitch,
        zoom,
        panX,
        panY,
        spinElapsed: dependencySpinElapsed - elapsed,
      };
    }

    function travelCameraAt(elapsed) {
      if (showcaseMode) return showcaseCameraState(showcaseFrameProgress(elapsed));
      const origin = explorerTravelCameraOrigin;
      return {
        yaw: origin.yaw + origin.yawDirection * DRIFT_RADIANS_PER_SECOND * (elapsed - origin.elapsed) / 1000,
        pitch: origin.pitch,
        zoom: origin.zoom,
        panX: origin.panX,
        panY: origin.panY,
      };
    }

    function travelSpinElapsedAt(elapsed) {
      if (showcaseMode) return elapsed;
      return explorerTravelCameraOrigin.spinElapsed + elapsed;
    }

    function travelCameraMatrix(camera) {
      return [
        Math.cos(camera.yaw),
        Math.sin(camera.yaw),
        Math.cos(camera.pitch),
        Math.sin(camera.pitch),
      ];
    }

    function prepareTravelRoute(episodeIndex, episode, right, bottom) {
      const link = constantReferenceLinks[episode.linkIndex];
      const departureCategory = travelEndpointCategory(link.departureIndex);
      const arrivalCategory = travelEndpointCategory(link.arrivalIndex);
      if (!visibleCategories[departureCategory] || !visibleCategories[arrivalCategory]) return null;
      const midpoint = episode.startsAt + TRAVEL_PRESET.flightDurationMs / 2;
      const camera = travelCameraAt(midpoint);
      const matrix = travelCameraMatrix(camera);
      const spinElapsed = travelSpinElapsedAt(midpoint);
      const departure = projectScenePoint(link.departureIndex, matrix, [0, 0, 0], camera, spinElapsed);
      const arrival = projectScenePoint(link.arrivalIndex, matrix, [0, 0, 0], camera, spinElapsed);
      if (!departure || !arrival) return null;
      const route = prepareTravelGeometry(
        link,
        episodeIndex,
        departure,
        arrival,
        right,
        bottom,
        TRAVEL_PRESET.admissionInsetPx,
      );
      return route && travelCurveFits(route, right, bottom, TRAVEL_PRESET.admissionInsetPx) ? route : null;
    }

    function travelRouteAt(episode, elapsed) {
      if (!episode.route) return null;
      const link = constantReferenceLinks[episode.linkIndex];
      const camera = travelCameraAt(elapsed);
      const matrix = travelCameraMatrix(camera);
      const spinElapsed = travelSpinElapsedAt(elapsed);
      const departure = projectScenePoint(link.departureIndex, matrix, [0, 0, 0], camera, spinElapsed);
      const arrival = projectScenePoint(link.arrivalIndex, matrix, [0, 0, 0], camera, spinElapsed);
      if (!departure || !arrival) return null;
      const admitted = episode.route;
      const admittedDx = admitted.arrival[0] - admitted.departure[0];
      const admittedDy = admitted.arrival[1] - admitted.departure[1];
      const arcCrossProduct = admittedDx * (admitted.controlY - admitted.departure[1]) -
        admittedDy * (admitted.controlX - admitted.departure[0]);
      return travelGeometry(departure, arrival, arcCrossProduct < 0 ? -1 : 1);
    }

    function ensureTravelEpisodesThrough(elapsed, cameraElapsed) {
      const minute = Math.floor(elapsed / SHOWCASE_PRESET.durationMs);
      if (travelScheduleMinute !== minute) {
        travelEpisodes.length = 0;
        travelScheduleMinute = minute;
        travelScheduleComplete = false;
      }
      if (!showcaseMode) beginExplorerTravelCamera(cameraElapsed);
      const right = interactiveMode ? sceneRight : width;
      const bottom = interactiveMode ? sceneBottom : height;
      while (!travelScheduleComplete && (!travelEpisodes.length || travelEpisodes.at(-1).startsAt <= elapsed)) {
        const episodeIndex = travelEpisodes.length;
        const startsAt = travelEpisodeStartsAt(episodeIndex);
        if (startsAt >= (minute + 1) * SHOWCASE_PRESET.durationMs) {
          travelScheduleComplete = true;
          break;
        }
        const overlapping = [];
        for (let index = travelEpisodes.length - 1; index >= 0; index -= 1) {
          const other = travelEpisodes[index];
          if (other.startsAt + TRAVEL_PRESET.flightDurationMs <= startsAt) break;
          if (other.route) overlapping.push(other);
        }
        const selected = new Set(overlapping.map(episode => episode.linkIndex));
        const candidates = travelLinkCandidatesForEpisode(episodeIndex, selected);
        let chosen = null;
        for (const linkIndex of candidates) {
          const episode = {
            linkIndex,
            startsAt,
            route: null,
          };
          chosen ||= episode;
          if (overlapping.length >= travelFlightLimit || overlapping.some(other => travelLinksShareEndpoint(
            constantReferenceLinks[other.linkIndex],
            constantReferenceLinks[episode.linkIndex],
          ))) {
            continue;
          }
          const route = prepareTravelRoute(episodeIndex, episode, right, bottom);
          if (!route) continue;
          episode.route = route;
          chosen = episode;
          break;
        }
        if (!chosen) break;
        travelEpisodes.push(chosen);
      }
    }

    function travelWakeWeight(position) {
      return 0.12 + 0.88 * Math.pow(position, 1.45);
    }

    function drawTravelHead(context, x, y, angle, colourChannels, emphasis) {
      const length = TRAVEL_PRESET.headLengthPx;
      const halfWidth = TRAVEL_PRESET.headWidthPx / 2;
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.shadowColor = `rgba(${colourChannels},${(TRAVEL_PRESET.headGlowAlpha * emphasis).toFixed(4)})`;
      context.shadowBlur = TRAVEL_PRESET.headGlowBlur;
      context.fillStyle = `rgba(${colourChannels},${(TRAVEL_PRESET.headAlpha * emphasis).toFixed(4)})`;
      context.beginPath();
      context.moveTo(-length, 0);
      context.bezierCurveTo(-length * 0.66, -halfWidth * 0.08, -length * 0.43, -halfWidth, -length * 0.18, -halfWidth);
      context.bezierCurveTo(-length * 0.06, -halfWidth, 0, -halfWidth * 0.52, 0, 0);
      context.bezierCurveTo(0, halfWidth * 0.52, -length * 0.06, halfWidth, -length * 0.18, halfWidth);
      context.bezierCurveTo(-length * 0.43, halfWidth, -length * 0.66, halfWidth * 0.08, -length, 0);
      context.closePath();
      context.fill();
      context.restore();
    }

    function travelCategoryAlpha(category) {
      if (category === "dependencies") return 0.82;
      if (category === "tests") return 1.08;
      return 1;
    }

    function hideTravelOverlay() {
      if (travelOverlayDirty) {
        travelContext.clearRect(0, 0, width, height);
        travelOverlayDirty = false;
      }
    }

    function explorerTravelElapsedAt(timestamp, enabled) {
      if (!enabled) {
        resetExplorerTravel();
        return 0;
      }
      if (!Number.isFinite(timestamp)) return explorerTravelElapsed;
      const delta = explorerTravelLastTimestamp === null
        ? 1000 / 60
        : clamp(timestamp - explorerTravelLastTimestamp, 0, MAX_DRIFT_DELTA_MS);
      explorerTravelElapsed += delta;
      explorerTravelLastTimestamp = timestamp;
      return explorerTravelElapsed;
    }

    function drawTravelOverlay(elapsed, enabled) {
      if (!enabled || reducedMotionQuery.matches) {
        hideTravelOverlay();
        return;
      }
      if (!constantReferenceLinks.length || !Number.isFinite(elapsed)) {
        hideTravelOverlay();
        return;
      }

      const states = travelStatesAt(elapsed);
      if (!states.length) {
        hideTravelOverlay();
        return;
      }
      if (travelOverlayDirty) {
        travelContext.clearRect(0, 0, width, height);
        travelOverlayDirty = false;
      }
      let drewTravel = false;
      travelContext.save();
      travelContext.globalCompositeOperation = "lighter";
      travelContext.lineCap = "round";
      for (const state of states) {
        const { episode, progress, visibility } = state;
        if (visibility < TRAVEL_PRESET.minimumVisibility) continue;
        const route = travelRouteAt(episode, elapsed);
        if (!route) continue;
        const { departure, arrival, controlX, controlY } = route;
        const distance = Math.hypot(arrival[0] - departure[0], arrival[1] - departure[1]);
        const link = constantReferenceLinks[episode.linkIndex];
        const departureCategory = travelEndpointCategory(link.departureIndex);
        const arrivalCategory = travelEndpointCategory(link.arrivalIndex);
        const departureColour = colours[departureCategory];
        const departureColourChannels = departureColour.join(",");
        const emphasis = Math.min(travelEmphasis(departureCategory), travelEmphasis(arrivalCategory)) *
          travelCategoryAlpha(departureCategory) * visibility;

        travelContext.shadowBlur = TRAVEL_PRESET.tailHaloBlur;
        const wakeEnd = Math.max(
          0,
          progress - TRAVEL_PRESET.headLengthPx * (1 - TRAVEL_PRESET.tailHeadOverlap) / distance,
        );
        const drawnTailStart = Math.max(
          0,
          wakeEnd - TRAVEL_PRESET.tailFraction,
          wakeEnd - TRAVEL_PRESET.tailLengthPx / distance,
        );
        let previousX = quadraticCoordinate(departure[0], controlX, arrival[0], drawnTailStart);
        let previousY = quadraticCoordinate(departure[1], controlY, arrival[1], drawnTailStart);
        for (let segment = 1; segment <= TRAVEL_PRESET.tailSegments; segment += 1) {
          const position = segment / TRAVEL_PRESET.tailSegments;
          const weight = travelWakeWeight(position);
          const segmentProgress = drawnTailStart + (wakeEnd - drawnTailStart) * position;
          const x = quadraticCoordinate(departure[0], controlX, arrival[0], segmentProgress);
          const y = quadraticCoordinate(departure[1], controlY, arrival[1], segmentProgress);
          travelContext.beginPath();
          travelContext.moveTo(previousX, previousY);
          travelContext.lineTo(x, y);
          travelContext.shadowColor = `rgba(${departureColourChannels},${(TRAVEL_PRESET.tailHaloAlpha * emphasis * weight).toFixed(4)})`;
          travelContext.strokeStyle = `rgba(${departureColourChannels},${(TRAVEL_PRESET.tailAlpha * emphasis * weight).toFixed(4)})`;
          travelContext.lineWidth = TRAVEL_PRESET.lineWidth * (0.28 + weight * 0.72);
          travelContext.stroke();
          previousX = x;
          previousY = y;
        }
        const headX = quadraticCoordinate(departure[0], controlX, arrival[0], progress);
        const headY = quadraticCoordinate(departure[1], controlY, arrival[1], progress);
        const inverseProgress = 1 - progress;
        const tangentX = 2 * inverseProgress * (controlX - departure[0]) + 2 * progress * (arrival[0] - controlX);
        const tangentY = 2 * inverseProgress * (controlY - departure[1]) + 2 * progress * (arrival[1] - controlY);
        drawTravelHead(
          travelContext,
          headX,
          headY,
          Math.atan2(tangentY, tangentX),
          departureColourChannels,
          emphasis,
        );
        drewTravel = true;
      }
      travelContext.restore();
      if (!drewTravel) {
        hideTravelOverlay();
        return;
      }
      travelOverlayDirty = true;
    }

    function updateZoomReadout() {
      zoomReadout ||= document.getElementById("zoom-level");
      const text = `${Math.round(zoom * 100)}%`;
      if (text === zoomReadoutText) return;
      zoomReadoutText = text;
      zoomReadout.value = text;
    }

    function updateExplorerOverlay(timestamp) {
      if (constantReferenceLinks.length) {
        const travelEnabled = drifting && !cameraFlight && !dragging && pointers.size === 0;
        drawTravelOverlay(explorerTravelElapsedAt(timestamp, travelEnabled), travelEnabled);
      } else {
        hideTravelOverlay();
      }
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
      travelOverlayDirty = true;
    }

    function render(timestamp) {
      animationFrame = 0;
      if (showcaseMode) {
        const elapsed = showcaseStartedAt === null ? 0 : Math.max(0, timestamp - showcaseStartedAt);
        dependencySpinElapsed = reducedMotionQuery.matches ? 0 : elapsed % SHOWCASE_PRESET.durationMs;
        if (showcaseRenderer) showcaseRenderer.render();
        if (constantReferenceLinks.length) drawTravelOverlay(elapsed, Boolean(showcaseRenderer));
        return;
      }
      if (!explorerRenderer) return;
      const driftAdvanced = advanceExplorerDrift(timestamp);
      const spinAdvanced = advanceDependencySpin(timestamp);
      updateCameraFlight(timestamp);
      updateZoomReadout();
      explorerRenderer.render();
      updateExplorerOverlay(timestamp);
      if (selectedPoint) {
        if (cameraFlight) tooltip.hidden = true;
        else positionTooltip(selectedPoint);
      }
      if (cameraFlight || driftAdvanced || spinAdvanced) requestRender();
    }

    function requestRender() {
      if (!animationFrame) animationFrame = requestAnimationFrame(render);
    }

    const showcaseCameraScratch = {};

    function showcaseCameraState(progress, out = {}) {
      const wrapped = ((Number(progress) % 1) + 1) % 1;
      const yawSign = screenRotationYawSign(SHOWCASE_PRESET.elevationDegrees * Math.PI / 180);
      const phase = wrapped * Math.PI * 2 * SHOWCASE_PRESET.turns * yawSign;
      const viewportScale = Math.min(width / SHOWCASE_PRESET.layoutReferenceWidth, height / SHOWCASE_PRESET.layoutReferenceHeight);
      out.yaw = SHOWCASE_PRESET.startAngleDegrees * Math.PI / 180 + phase;
      out.pitch = (SHOWCASE_PRESET.elevationDegrees + Math.sin(phase) * SHOWCASE_PRESET.elevationSwayDegrees) * Math.PI / 180;
      out.zoom = SHOWCASE_PRESET.zoom * (1 + ((1 - Math.cos(phase)) / 2) * SHOWCASE_PRESET.zoomBreathPercent / 100) * viewportScale;
      out.panX = 0;
      out.panY = 0;
      return out;
    }

    function applyShowcaseCamera(progress) {
      const camera = showcaseCameraState(progress, showcaseCameraScratch);
      yaw = camera.yaw;
      pitch = camera.pitch;
      zoom = camera.zoom;
      panX = camera.panX;
      panY = camera.panY;
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

    function trackShowcaseAnnotation(elapsed) {
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
      if (!activeShowcaseAnnotation) return null;

      const projected = project(activeShowcaseAnnotation.annotation.point, matrix);
      if (!projected) return null;
      const [x, y] = projected;
      showcaseAnnotation.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      return { slotElapsed, fits: showcaseAnnotationFits(x, y, activeShowcaseAnnotation.side) };
    }

    function updateShowcaseAnnotation(timestamp) {
      if (reducedMotionQuery.matches || !showcaseAnnotation || showcaseStartedAt === null) {
        hideShowcaseAnnotation();
        return;
      }
      const tracked = trackShowcaseAnnotation(Math.max(0, timestamp - showcaseStartedAt));
      if (!tracked) {
        hideShowcaseAnnotation();
        return;
      }
      const revealed = tracked.slotElapsed >= SHOWCASE_ANNOTATION_PRESET.revealStartMs &&
        tracked.slotElapsed <= SHOWCASE_ANNOTATION_PRESET.revealEndMs &&
        tracked.fits;
      showcaseAnnotation.classList.toggle("is-visible", revealed);
      document.documentElement.dataset.showcaseAnnotation = revealed
        ? activeShowcaseAnnotation.annotation.name
        : "hidden";
    }

    function showcaseFrameProgress(elapsed) {
      const frameCount = SHOWCASE_PRESET.targetFps * SHOWCASE_PRESET.durationMs / 1000;
      const rawProgress = (elapsed % SHOWCASE_PRESET.durationMs) / SHOWCASE_PRESET.durationMs;
      return Math.floor(rawProgress * frameCount) / frameCount;
    }

    function renderShowcase(timestamp) {
      if (!showcaseRenderer || clipMode) return;
      showcaseStartedAt ??= timestamp;
      applyShowcaseCamera(showcaseFrameProgress(timestamp - showcaseStartedAt));
      render(timestamp);
      if (!showcaseRenderer) return;
      if (showcaseDetails) updateShowcaseAnnotation(timestamp);
      document.documentElement.dataset.showcaseReady = "true";
      if (!reducedMotionQuery.matches) animationFrame = requestAnimationFrame(renderShowcase);
    }

    // Clip export drives Showcase frames from an external capture process
    // (`rubylens clip`). Frames are a pure function of (frameIndex, fps):
    // annotation choreography runs off the same synthetic clock with inline
    // opacity, because live CSS fades would tie captures to wall-clock time.
    function showcaseClipAnnotationOpacity(slotElapsed) {
      const preset = SHOWCASE_ANNOTATION_PRESET;
      if (slotElapsed < preset.revealStartMs) return 0;
      if (slotElapsed <= preset.revealEndMs) {
        const linear = Math.min(1, (slotElapsed - preset.revealStartMs) / preset.fadeInMs);
        return 1 - (1 - linear) ** 3;
      }
      const linear = Math.min(1, (slotElapsed - preset.revealEndMs) / preset.fadeOutMs);
      return Math.max(0, 1 - linear * linear);
    }

    function updateShowcaseClipAnnotation(elapsed) {
      if (!showcaseAnnotation) return;
      const tracked = trackShowcaseAnnotation(elapsed);
      const opacity = tracked && tracked.fits ? showcaseClipAnnotationOpacity(tracked.slotElapsed) : 0;
      showcaseAnnotation.classList.toggle("is-visible", opacity > 0);
      showcaseAnnotation.style.opacity = opacity.toFixed(4);
      document.documentElement.dataset.showcaseAnnotation = opacity > 0
        ? activeShowcaseAnnotation.annotation.name
        : "hidden";
    }

    function beginShowcaseClip() {
      if (!showcaseMode) return { status: "not-showcase" };
      if (!showcaseRenderer) return { status: "renderer-unavailable" };
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      clipMode = true;
      showcaseStartedAt = 0;
      showcaseAnnotationSlot = -1;
      activeShowcaseAnnotation = null;
      hideShowcaseAnnotation();
      drawTravelOverlay(0, false);
      if (showcaseAnnotation) {
        showcaseAnnotation.hidden = !showcaseDetails || !renderedShowcaseAnnotations.length;
        showcaseAnnotation.style.opacity = "0";
      }
      document.documentElement.dataset.rubylensClip = "true";
      document.documentElement.dataset.showcaseMotion = "clip";
      return {
        status: "ok",
        durationMs: SHOWCASE_PRESET.durationMs,
        stageWidth: SHOWCASE_PRESET.stageWidth,
        stageHeight: SHOWCASE_PRESET.stageHeight,
        details: showcaseDetails,
      };
    }

    function renderShowcaseClipFrame(frameIndex, fps) {
      if (!clipMode || !showcaseRenderer) return Promise.reject(new Error("clip mode is not active"));
      const elapsed = frameIndex * 1000 / fps;
      applyShowcaseCamera(showcaseFrameProgress(elapsed));
      render(elapsed);
      if (showcaseDetails) updateShowcaseClipAnnotation(elapsed);
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        document.documentElement.dataset.clipFrame = String(frameIndex);
        resolve(frameIndex);
      })));
    }

    function startShowcase() {
      if (clipMode) return;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      showcaseStartedAt = null;
      showcaseAnnotationSlot = -1;
      activeShowcaseAnnotation = null;
      if (!showcaseRenderer) {
        if (showcaseAnnotation) showcaseAnnotation.hidden = true;
        hideShowcaseAnnotation();
        document.documentElement.dataset.showcaseMotion = "unavailable";
        document.documentElement.dataset.showcaseReady = "true";
        return;
      }
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
      secondary.textContent = `Tests · ${counted(tests[0], "class", "classes")} · ${counted(tests[2], "method", "methods")}   ·   ${counted(packageCount, "dependency gem", "dependency gems")} in orbit`;
      stats.hidden = false;
      secondary.hidden = false;
    }

    function syncDrifting() {
      const rendererUnavailable = document.documentElement.dataset.explorerRenderer === "unavailable";
      drifting = interactiveMode && !rendererUnavailable && driftRequested && !reducedMotionQuery.matches;
      lastDriftTimestamp = null;
      lastDependencySpinTimestamp = null;
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
        resetExplorerTravel();
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
      const showcaseLabel = `Stellar artwork of ${model.projectName}, completing one slow rotation each minute.`;
      canvas.setAttribute("aria-label", showcaseLabel);
      populateShowcaseStats();
      reducedMotionQuery.addEventListener("change", startShowcase);
      resize();
      startShowcase();
    } else {
      document.title = `RubyLens · ${model.projectName}`;
      if (explorerRenderer) {
        canvas.setAttribute("aria-label", `Interactive three-dimensional stellar artwork of ${model.projectName}. Hover class or module stars, dependency systems, or gem clouds for details. Selections open a top-down view that keeps the selected target and Core visible. Double-click a dependency system or gem cloud, press Enter or F on its selected marker, or tap that marker again to expand it. Drag to orbit, Shift-drag or Pan mode to move, scroll or pinch to zoom at a point, use arrow keys to move the view, Space to pause or resume drift, 0 to reset, slash to search, and question mark for the full shortcut list.`);
      }
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
