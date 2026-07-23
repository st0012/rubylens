import { describe, expect, it } from "vitest";
import { loadRuntime } from "./helpers/runtime.mjs";
import { runtimeFunction } from "./helpers/runtime_source.mjs";

// Explorer milk contracts: the Showcase integrated-light treatment on a live
// camera. Milk must dissolve across the same deep-detail band where the
// pass-1 haze points brighten into resolved stars, so zooming reads as a
// telescope pulling focus instead of a fog layer sliding over the galaxy.
describe("explorer milk", () => {
  const runtime = loadRuntime();
  const preset = runtime.EXPLORER_MILK_PRESET;
  const renderer = runtimeFunction("createExplorerRenderer");
  const pipeline = runtimeFunction("createMilkPipeline");

  it("locks the approved preset", () => {
    expect(preset).toEqual({
      radius: 10,
      gainPercent: 4,
      referenceZoom: 2,
      minRadiusScale: 0.5,
      maxRadiusScale: 2,
      fadeStartDetail: 0.25,
      fadeEndDetail: 0.6,
    });
    expect(Object.isFrozen(preset)).toBe(true);
  });

  it("draws only haze rows as milk, faded by deep detail and scaled by zoom", () => {
    expect(renderer).toContain("if (u_pass == 3) {");
    expect(renderer).toContain("float milkStrength = 1.0 - smoothstep(float(${EXPLORER_MILK_PRESET.fadeStartDetail}), float(${EXPLORER_MILK_PRESET.fadeEndDetail}), u_deepDetail);");
    expect(renderer).toContain("float radiusScale = clamp(sqrt(u_zoom / float(${EXPLORER_MILK_PRESET.referenceZoom})), float(${EXPLORER_MILK_PRESET.minRadiusScale}), float(${EXPLORER_MILK_PRESET.maxRadiusScale}));");
    expect(renderer).toContain("radius = float(${EXPLORER_MILK_PRESET.radius}) * radiusScale;");
    expect(renderer).toContain("alpha = visibleAlpha * float(${EXPLORER_MILK_PRESET.gainPercent}) / 100.0 * milkStrength;");
  });

  it("marks milk sprites for the shared gaussian fragment branch at quarter size", () => {
    expect(renderer).toContain("gl_PointSize = max(1.0, radius * 2.0) * u_dpr * (u_pass == 3 ? 0.25 : 1.0);");
    expect(renderer).toContain("v_radius = (u_pass == 3 ? -radius : radius) * u_dpr;");
  });

  it("skips the milk pass once zoom has fully resolved the haze", () => {
    // The JS mirror of the shader's fade: past fadeEndDetail the pass would
    // be all clears and hidden points, so the renderer skips it entirely.
    expect(renderer).toContain("const milkStrength = 1 - smoothstep(EXPLORER_MILK_PRESET.fadeStartDetail, EXPLORER_MILK_PRESET.fadeEndDetail, deepDetail);");
    expect(renderer).toContain("if (milkStrength > 0.001) {");
    expect(renderer).toContain("gl.drawArrays(gl.POINTS, scenePointCount, renderPointCount - scenePointCount);");
    const detailAt = zoom => Math.min(1, Math.max(0, Math.log2(Math.max(1, zoom)) / 5));
    expect(detailAt(preset.referenceZoom)).toBeLessThan(preset.fadeStartDetail);
    expect(detailAt(17)).toBeGreaterThan(preset.fadeEndDetail);
  });

  it("keeps the milk target sized with the canvas and under the sprite floor", () => {
    expect(renderer).toContain("const milk = createMilkPipeline(gl);");
    expect(renderer).toContain("milk.ensureTarget(liveCanvas);");
    expect(renderer).toContain("EXPLORER_MILK_PRESET.radius * EXPLORER_MILK_PRESET.maxRadiusScale * 2 * 0.25");
    // The capped milk sprite must not become the binding capability floor:
    // the Core/Test glow still decides rendererDpr.
    expect(preset.radius * preset.maxRadiusScale * 2 * 0.25).toBeLessThanOrEqual(3.2 * 3.4 * 2);
  });

  it("shares one quarter-resolution linearly-filtered pipeline with Showcase", () => {
    expect(pipeline).toContain("Math.round(targetCanvas.width / 4)");
    expect(pipeline).toContain("gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);");
    expect(pipeline).toContain("outColor = texture(u_milk, gl_FragCoord.xy / u_resolution);");
    expect(runtimeFunction("createShowcaseRenderer")).toContain("const milk = createMilkPipeline(gl);");
  });
});
