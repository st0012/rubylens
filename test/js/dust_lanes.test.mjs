import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

// Row: [seed, kind, test, 6 signals, 4 rubyCounts, ivars]
const namespaceRow = (seed, kind, test) => [seed, kind, test, 2, 1, 0, 4, 9, 3, 1, 0, 5, 2, 1];

function fixtureModel(overrides = {}) {
  return minimalModel({
    totals: { namespaces: 2, packages: 0, dependencyStars: 0 },
    namespaceNames: ["Core::Alpha", "Spec::Beta"],
    namespaces: [namespaceRow(11, 0, 0), namespaceRow(12, 0, 1)],
    ...overrides,
  });
}

describe("dustAttenuation", () => {
  const spiral = loadRuntime(fixtureModel());

  it("absorbs inside the disc window, bounded by the preset maximum", () => {
    let strongest = 0;
    let weakest = 1;
    for (let sample = 0; sample < 400; sample += 1) {
      const radial = 10 + (sample % 20) * 1.8;
      const theta = Math.floor(sample / 20) * (Math.PI / 10);
      const absorbed = spiral.dustAttenuation([Math.cos(theta) * radial, 0, Math.sin(theta) * radial], 1);
      expect(absorbed).toBeGreaterThanOrEqual(0);
      expect(absorbed).toBeLessThanOrEqual(spiral.DUST_PRESET.maxAbsorption);
      strongest = Math.max(strongest, absorbed);
      weakest = Math.min(weakest, absorbed);
    }
    // Lanes are broken and local: some samples sit in a lane, most do not.
    expect(strongest).toBeGreaterThan(0.15);
    expect(weakest).toBeLessThan(0.02);
  });

  it("leaves the bulge dust-free out to its outer edge", () => {
    // corePosition's bulge radial law caps at 17; every bulge star must stay
    // untouched no matter how close to an arm lane it sits.
    for (let sample = 0; sample < 60; sample += 1) {
      const theta = sample * (Math.PI / 6);
      const radial = 3 + (sample % 5) * 3.5;
      expect(spiral.dustAttenuation([Math.cos(theta) * radial, 0, Math.sin(theta) * radial], 1)).toBe(0);
    }
  });

  it("applies no dust to non-spiral morphologies", () => {
    const elliptical = loadRuntime(fixtureModel({ morphology: [0, 250, 0, 0, 0, 0, 0, 0, 0, 77] }));
    expect(elliptical.morphology.family).toBe(0);
    for (let sample = 0; sample < 20; sample += 1) {
      expect(elliptical.dustAttenuation([sample * 2, 0, sample * 1.3], 1)).toBe(0);
    }
  });

  it("only ever dims marks and haze, never brightens them", () => {
    const undimmed = loadRuntime(fixtureModel({ morphology: [0, 250, 0, 0, 0, 0, 0, 0, 0, 77] }));
    // Same namespaces, spiral vs elliptical: spiral alphas can only be equal or
    // lower than the corresponding dust-free construction alpha.
    for (let index = 0; index < spiral.scenePointCount; index += 1) {
      const offset = index * spiral.SCENE_POINT_STRIDE;
      expect(spiral.sceneData[offset + 4]).toBeLessThanOrEqual(undimmed.sceneData[offset + 4] + 1e-6);
    }
  });
});
