import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";
import { orderedIndex, RUNTIME_SOURCE, runtimeFunction } from "./helpers/runtime_source.mjs";

// The approved Showcase contract, moved from the retired Ruby string checks.
// Preset objects are asserted against the live runtime bindings; shipped-text
// contracts (GLSL, dataset flags, choreography order) assert on the source.
const APPROVED_PRESET = {
  stageWidth: 1920,
  stageHeight: 1080,
  durationMs: 60_000,
  targetFps: 60,
  turns: 1,
  startAngleDegrees: -54,
  elevationDegrees: -25,
  elevationSwayDegrees: 1.5,
  zoom: 1.6,
  zoomBreathPercent: 0,
  centerXPercent: 49,
  centerYPercent: 67,
  starBrightnessPercent: 75,
  pointGlowPercent: 0,
  hazeMilkRadius: 12,
  hazeMilkGainPercent: 12,
  backgroundGlowPercent: 200,
  textScalePercent: 80,
  layoutReferenceWidth: 720,
  layoutReferenceHeight: 405,
  mastheadLeft: 44,
  mastheadTop: 40,
  mastheadWidth: 632,
};
const APPROVED_ANNOTATION_PRESET = {
  // `limit` is also pinned Ruby-side as ShowcaseModel::ANNOTATION_LIMIT = 200;
  // each side asserts the shared number independently.
  limit: 200,
  slotDurationMs: 6_000,
  revealStartMs: 1_350,
  revealEndMs: 4_650,
  fadeInMs: 1_200,
  fadeOutMs: 900,
  safeInsetX: 80,
  safeInsetTop: 340,
  safeInsetBottom: 90,
  labelWidth: 440,
};
const APPROVED_WIDESCREEN_LAYOUT_PRESET = {
  minimumFittedWidth: 1600,
  minimumAspectRatio: 1.6,
  centerXPercent: 49,
  centerYPercent: 54,
  textScalePercent: 44,
  layoutReferenceWidth: 720,
  mastheadLeft: 44,
  mastheadTop: 17,
  mastheadWidth: 420,
};

const runtime = loadRuntime(minimalModel());
const functionBody = name => {
  const match = RUNTIME_SOURCE.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)^    \\}`, "m"));
  if (!match) throw new Error(`${name} function not found in the runtime`);
  return match[1];
};

describe("showcase contract", () => {
  it("keeps the approved showcase preset exact and frozen", () => {
    expect(runtime.SHOWCASE_PRESET).toEqual(APPROVED_PRESET);
    expect(Object.isFrozen(runtime.SHOWCASE_PRESET)).toBe(true);
  });

  it("keeps the approved annotation preset exact and frozen", () => {
    expect(runtime.SHOWCASE_ANNOTATION_PRESET).toEqual(APPROVED_ANNOTATION_PRESET);
    expect(Object.isFrozen(runtime.SHOWCASE_ANNOTATION_PRESET)).toBe(true);
  });

  it("tightens the masthead and raises the scene in the widescreen layout", () => {
    expect(runtime.SHOWCASE_WIDESCREEN_LAYOUT_PRESET).toEqual(APPROVED_WIDESCREEN_LAYOUT_PRESET);
    expect(Object.isFrozen(runtime.SHOWCASE_WIDESCREEN_LAYOUT_PRESET)).toBe(true);
    expect(runtimeFunction("resize")).toContain("configureShowcaseStage()");
    const layoutSelection = runtimeFunction("selectShowcaseLayout");
    expect(layoutSelection).toContain("fittedWidth >= SHOWCASE_WIDESCREEN_LAYOUT_PRESET.minimumFittedWidth");
    expect(layoutSelection).toContain("aspectRatio >= SHOWCASE_WIDESCREEN_LAYOUT_PRESET.minimumAspectRatio");
    expect(layoutSelection).toContain('dataset.showcaseLayout = widescreen ? "widescreen" : "default"');
    expect(runtimeFunction("configureShowcaseStage")).toContain("activeShowcaseLayout = selectShowcaseLayout()");
    expect(runtimeFunction("updateSceneViewport")).toContain("activeShowcaseLayout.centerYPercent");
  });

  it("completes one clockwise turn in sixty seconds through the approved camera positions", () => {
    const preset = runtime.SHOWCASE_PRESET;
    expect(preset.targetFps * preset.durationMs / 1000).toBe(3_600);
    const expected = [
      [-54, -25],
      [36, -23.5],
      [126, -25],
      [216, -26.5],
      [-54, -25],
    ];
    const actual = [0, 0.25, 0.5, 0.75, 1].map(progress => {
      const wrapped = ((progress % 1) + 1) % 1;
      const phase = wrapped * 360 * preset.turns;
      const yaw = preset.startAngleDegrees + phase;
      const pitch = preset.elevationDegrees + Math.sin(phase * Math.PI / 180) * preset.elevationSwayDegrees;
      return [yaw, Number(pitch.toFixed(10))];
    });
    expect(actual).toEqual(expected);
    const lastFrameYaw = preset.startAngleDegrees + (3_599 / 3_600) * 360;
    expect(lastFrameYaw).toBeCloseTo(305.9, 10);
  });

  it("shares the clockwise default across pitch hemispheres", () => {
    expect(RUNTIME_SOURCE).toContain('const DEFAULT_ROTATION_DIRECTION = "clockwise";');
    expect(runtime.screenRotationYawSign(-25 * Math.PI / 180)).toBe(1);
    expect(runtime.screenRotationYawSign(0.34)).toBe(-1);
    expect(runtime.screenRotationYawSign(0)).toBe(1);
    expect(runtimeFunction("showcaseCameraState")).toContain("screenRotationYawSign(SHOWCASE_PRESET.elevationDegrees * Math.PI / 180)");
    expect(runtimeFunction("applyShowcaseCamera")).toContain("showcaseCameraState(progress, showcaseCameraScratch)");
  });

  it("drives fixed stage motion and lighting from the preset", () => {
    for (const field of [
      "stageWidth", "stageHeight", "durationMs", "targetFps", "turns", "startAngleDegrees",
      "elevationDegrees", "elevationSwayDegrees", "zoom", "zoomBreathPercent", "centerXPercent",
      "centerYPercent", "starBrightnessPercent", "pointGlowPercent", "backgroundGlowPercent",
      "hazeMilkRadius", "hazeMilkGainPercent", "textScalePercent",
    ]) {
      expect(RUNTIME_SOURCE).toContain(`SHOWCASE_PRESET.${field}`);
    }
    expect(RUNTIME_SOURCE).toContain("requestAnimationFrame(renderShowcase)");
    expect(RUNTIME_SOURCE).toContain("Math.min(window.innerWidth / SHOWCASE_PRESET.stageWidth, window.innerHeight / SHOWCASE_PRESET.stageHeight)");
  });

  it("scales only showcase dependency alpha through the dependency preset", () => {
    expect(runtime.SHOWCASE_DEPENDENCY_PRESET).toEqual({ starAlphaScale: 0.3 });
    expect(Object.isFrozen(runtime.SHOWCASE_DEPENDENCY_PRESET)).toBe(true);
    const renderer = runtimeFunction("createShowcaseRenderer");
    expect(renderer).toContain("float starAlphaScale = categoryCode > 1.5 ? float(${SHOWCASE_DEPENDENCY_PRESET.starAlphaScale}) : 1.0;");
    expect(renderer).toContain("clamp(a_alpha * starAlphaScale * u_brightness / 100.0, 0.0, 1.0)");
  });

  it("renders every scene point plus the milk pass", () => {
    expect(RUNTIME_SOURCE).toContain("const { sceneData, scenePointCount, interactivePoints, dependencyHubs, packageHubs, systemHubs } = buildPoints()");
    expect(RUNTIME_SOURCE).toContain("renderPointData.set(sceneData, 0)");
    expect(RUNTIME_SOURCE).toContain("renderPointData.set(hazeData, sceneData.length)");
    const renderer = runtimeFunction("createShowcaseRenderer");
    expect(renderer).toContain("gl.bufferData(gl.ARRAY_BUFFER, renderPointData, gl.STATIC_DRAW)");
    expect(renderer).toContain("gl.drawArrays(gl.POINTS, 0, scenePointCount)");
    expect(renderer).toContain("gl.drawArrays(gl.POINTS, scenePointCount, renderPointCount - scenePointCount)");
    expect(renderer).toContain("radius = float(${SHOWCASE_PRESET.hazeMilkRadius});");
    expect(renderer).toContain("alpha = visibleAlpha * float(${SHOWCASE_PRESET.hazeMilkGainPercent}) / 100.0;");
    expect(renderer).toContain("v_radius = u_pass == 3 ? -radius : radius;");
    expect(renderer).toContain("const ensureMilkTarget = () => {");
    expect(RUNTIME_SOURCE).toContain("if (v_radius < 0.0) {");
    expect(runtimeFunction("updateGalaxySummary")).toContain('${scenePointCount.toLocaleString("en-US")} ${scenePointCount === 1 ? "star" : "stars"}');
  });

  it("requires WebGL2 and fails explicitly", () => {
    const renderer = runtimeFunction("createShowcaseRenderer");
    const unavailable = runtimeFunction("markShowcaseUnavailable");
    expect(renderer).toContain('canvas.getContext("webgl2"');
    expect(renderer).toContain('dataset.showcaseUnavailableReason = "webgl2-unavailable"');
    expect(renderer).toContain('dataset.showcaseUnavailableReason = "webgl2-point-size-range"');
    expect(renderer).toContain('markShowcaseUnavailable("webgl2-context-lost")');
    expect(RUNTIME_SOURCE).toContain('dataset.showcaseUnavailableReason = "webgl2-initialization-error"');
    expect(unavailable).toContain('dataset.showcaseRenderer = "unavailable"');
    expect(unavailable).toContain("plottedDependencyDeclarations = 0");
    expect(unavailable).toContain("dataset.plottedDependencyDeclarations = String(plottedDependencyDeclarations)");
    expect(unavailable).toContain('dataset.plottedScenePoints = "0"');
    expect(unavailable).toContain('dataset.showcaseMotion = "unavailable"');
    expect(unavailable).toContain('dataset.showcaseReady = "true"');
    expect(unavailable).toContain('showcaseStatus.textContent = "WebGL2 is required to display this Showcase."');
    expect(RUNTIME_SOURCE).toContain('const context = interactiveMode ? canvas.getContext("2d"');
  });

  it("keeps annotation timing and tracking choreography in order", () => {
    const renderShowcase = functionBody("renderShowcase");
    const trackAnnotation = functionBody("trackShowcaseAnnotation");
    const updateAnnotation = functionBody("updateShowcaseAnnotation");
    expect(orderedIndex(renderShowcase, "applyShowcaseCamera(showcaseFrameProgress")).toBeLessThan(orderedIndex(renderShowcase, "render(timestamp)"));
    expect(orderedIndex(renderShowcase, "render(timestamp)")).toBeLessThan(orderedIndex(renderShowcase, "updateShowcaseAnnotation(timestamp)"));
    expect(trackAnnotation).toContain("project(activeShowcaseAnnotation.annotation.point, matrix)");
    expect(trackAnnotation).toContain("showcaseAnnotation.style.transform");
    expect(updateAnnotation).toContain("trackShowcaseAnnotation(Math.max(0, timestamp - showcaseStartedAt))");
    expect(updateAnnotation).toContain("slotElapsed >= SHOWCASE_ANNOTATION_PRESET.revealStartMs");
    expect(updateAnnotation).toContain("slotElapsed <= SHOWCASE_ANNOTATION_PRESET.revealEndMs");
    expect(RUNTIME_SOURCE).toContain("--annotation-fade-in");
    expect(RUNTIME_SOURCE).toContain("SHOWCASE_ANNOTATION_PRESET.fadeOutMs");
  });

  it("keeps clip frames a pure function of frame index and fps", () => {
    const clipFrame = functionBody("renderShowcaseClipFrame");
    const beginClip = functionBody("beginShowcaseClip");
    const clipAnnotation = functionBody("updateShowcaseClipAnnotation");
    // Clip frames are a pure function of (frameIndex, fps): the same quantized
    // camera as the live loop, then annotation opacity from the synthetic clock.
    expect(orderedIndex(clipFrame, "applyShowcaseCamera(showcaseFrameProgress(elapsed))")).toBeLessThan(orderedIndex(clipFrame, "render(elapsed)"));
    expect(orderedIndex(clipFrame, "render(elapsed)")).toBeLessThan(orderedIndex(clipFrame, "updateShowcaseClipAnnotation(elapsed)"));
    expect(clipFrame).toContain("frameIndex * 1000 / fps");
    expect(clipFrame).toContain("dataset.clipFrame = String(frameIndex)");
    expect(beginClip).toContain("cancelAnimationFrame(animationFrame)");
    expect(beginClip).toContain('dataset.rubylensClip = "true"');
    expect(beginClip).toContain('dataset.showcaseMotion = "clip"');
    expect(clipAnnotation).toContain("trackShowcaseAnnotation(elapsed)");
    expect(clipAnnotation).toContain("showcaseAnnotation.style.opacity = opacity.toFixed(4)");
    // The live loop must never race the external capture driver.
    expect(RUNTIME_SOURCE).toContain("if (!showcaseRenderer || clipMode) return;");
    expect(RUNTIME_SOURCE).toMatch(/function startShowcase\(\) \{\n      if \(clipMode\) return;/);
  });

  it("keeps annotation work opt-in, bounded, and disabled for reduced motion", () => {
    const reducedBranch = RUNTIME_SOURCE.match(/function startShowcase\(\) \{[\s\S]*?if \(reducedMotionQuery\.matches\) \{([\s\S]*?)\} else \{/)[1];
    expect(RUNTIME_SOURCE).toContain("model.details === true");
    expect(RUNTIME_SOURCE).toContain(".slice(0, SHOWCASE_ANNOTATION_PRESET.limit)");
    expect(RUNTIME_SOURCE).toContain("Array.isArray(model.pinnedNamespaceAnchors)");
    expect(runtimeFunction("buildPoints")).toContain("showcasePinnedNamespaceAnchors.has(index)");
    expect(runtimeFunction("buildPoints")).toContain("showcasePointsByAnchor.set(annotationKey, point)");
    expect(reducedBranch).toContain("showcaseAnnotation.hidden = true");
    expect(reducedBranch).toContain("hideShowcaseAnnotation()");
    expect(reducedBranch).not.toContain("updateShowcaseAnnotation");
  });

  it("renders one stable start frame under reduced motion without scheduling motion", () => {
    const reducedBranch = RUNTIME_SOURCE.match(/function startShowcase\(\) \{[\s\S]*?if \(reducedMotionQuery\.matches\) \{([\s\S]*?)\} else \{/);
    expect(reducedBranch).not.toBeNull();
    expect(reducedBranch[1]).toContain("applyShowcaseCamera(0)");
    expect(reducedBranch[1]).toContain("render(performance.now())");
    expect(reducedBranch[1]).toContain('dataset.showcaseMotion = "reduced"');
    expect(reducedBranch[1]).not.toContain("requestAnimationFrame");
    expect(RUNTIME_SOURCE).toContain('reducedMotionQuery.addEventListener("change", startShowcase)');
  });
});
