import { describe, expect, it } from "vitest";
import { RUNTIME_SOURCE, runtimeFunction } from "./helpers/runtime_source.mjs";

describe("layout density contract", () => {
  it("cpu projection and webgl share the adaptive camera", () => {
    expect(RUNTIME_SOURCE).toContain("float depth = u_cameraDistance - z2;");
    expect(RUNTIME_SOURCE).toContain("float perspective = u_cameraFocalLength / depth * u_zoom;");
    expect(RUNTIME_SOURCE).toContain("gl.uniform1f(pointUniforms.cameraDistance, cameraDistance);");
    expect(RUNTIME_SOURCE).toContain("gl.uniform1f(pointUniforms.cameraFocalLength, cameraFocalLength);");
    expect(RUNTIME_SOURCE).toContain("const depth = cameraDistance - z2;");
    expect(RUNTIME_SOURCE).toContain("const perspective = cameraFocalLength / depth * (camera?.zoom ?? zoom);");
    expect(RUNTIME_SOURCE).toContain(
      'function contextualSelectionCameraTarget(point, preferredZoom = point.hub ? 4 : point.category === "dependencies" ? 5 : 7) {',
    );
    expect(RUNTIME_SOURCE).toContain(
      "const coreFitZoom = Math.min(sceneRight, sceneBottom) * .28 * cameraDistance / (layoutScale.coreOuterRadius * cameraFocalLength);",
    );
  });

  it("adaptive layout work is confined to load time setup", () => {
    expect(RUNTIME_SOURCE.split("layoutMetricsForCoreCount(").length - 1).toBe(2);
    expect(RUNTIME_SOURCE.split("model.namespaces.reduce").length - 1).toBe(1);
    expect(RUNTIME_SOURCE.indexOf("model.namespaces.reduce")).toBeLessThan(RUNTIME_SOURCE.indexOf("function corePosition"));
    expect(RUNTIME_SOURCE.indexOf("const layoutScale = layoutMetricsForCoreCount(coreCount, morphology);")).toBeLessThan(
      RUNTIME_SOURCE.indexOf("function buildPoints"),
    );

    for (const name of ["createShowcaseRenderer", "project", "render", "applyShowcaseCamera", "renderShowcase"]) {
      const fn = runtimeFunction(name);
      expect(fn).not.toContain("model.namespaces");
      expect(fn).not.toContain("layoutMetricsForCoreCount");
    }
  });
});
