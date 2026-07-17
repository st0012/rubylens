import { describe, expect, it } from "vitest";
import { loadRuntime } from "./helpers/runtime.mjs";

const runtime = loadRuntime();
const LEGACY_ROW = [2, 0, 240, 3, 105, 380, 0, 0, 0, 0];

describe("decodeMorphology", () => {
  it("decodes each family with clamped knobs", () => {
    const elliptical = runtime.decodeMorphology([0, 900, 0, 0, 0, 0, 0, 0, 0, 5]);
    expect(elliptical.family).toBe(0);
    expect(elliptical.ellipticity).toBeCloseTo(0.7, 5);

    const barred = runtime.decodeMorphology([3, 0, 230, 9, 300, 900, 800, 0, 0, 5]);
    expect(barred.armCount).toBe(4);
    expect(barred.winding).toBeCloseTo(0.22, 5);
    expect(barred.armFraction).toBeCloseTo(0.8, 5);
    expect(barred.barLength).toBeCloseTo(0.7, 5);

    const irregular = runtime.decodeMorphology([4, 0, 0, 0, 0, 0, 0, 9, 100, 5]);
    expect(irregular.clumpCount).toBe(5);
    expect(irregular.clumpSpread).toBeCloseTo(0.25, 5);
  });

  it("marks only the exact legacy spiral row as legacy", () => {
    expect(runtime.decodeMorphology(LEGACY_ROW).legacy).toBe(true);
    const nearLegacy = [...LEGACY_ROW];
    nearLegacy[2] = 241;
    expect(runtime.decodeMorphology(nearLegacy).legacy).toBe(false);
  });

  it("falls back on malformed rows without losing the phase seed", () => {
    for (const bad of [null, [], [9, 0, 0, 0, 0, 0, 0, 0, 0, 0], [2, 0.5, 240, 3, 105, 380, 0, 0, 0, 0]]) {
      const decoded = runtime.decodeMorphology(bad, 77);
      expect(decoded.family).toBe(2);
      expect(decoded.phaseSeed).toBe(77);
    }
    expect(runtime.decodeMorphology(null, -1)).toBe(runtime.decodeMorphology(null, 2 ** 33));
  });

  it("derives phase deterministically from the seed", () => {
    const first = runtime.decodeMorphology([2, 0, 240, 3, 105, 380, 0, 0, 0, 12345]);
    const second = runtime.decodeMorphology([2, 0, 240, 3, 105, 380, 0, 0, 0, 12345]);
    expect(first.phase).toBe(second.phase);
    expect(first.legacy).toBe(false);
  });
});

describe("position recipes", () => {
  it("stay finite and inside their radii for every package morphology recipe", () => {
    const radius = 6;
    const shapes = [
      [0, 250, 0, 0, 0, 0, 0, 0, 0, 21],
      [1, 0, 350, 0, 0, 0, 0, 0, 0, 22],
      [2, 0, 260, 4, 110, 500, 0, 0, 0, 23],
      [3, 0, 230, 3, 100, 520, 360, 0, 0, 24],
      [4, 0, 0, 0, 0, 0, 0, 4, 600, 25],
    ];
    for (const shape of shapes) {
      const cloud = { ...runtime.decodeMorphology(shape), compact: false };
      for (let seed = 1; seed <= 512; seed += 1) {
        const offset = runtime.dependencyCloudOffset(seed, cloud, radius);
        expect(offset.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...offset)).toBeLessThanOrEqual(radius + 1e-9);
      }
    }
  });

  it("is deterministic per seed", () => {
    const cloud = { ...runtime.decodeMorphology([2, 0, 260, 4, 110, 500, 0, 0, 0, 9]), compact: false };
    expect(runtime.dependencyCloudOffset(7, cloud, 5)).toEqual(runtime.dependencyCloudOffset(7, cloud, 5));
    expect(runtime.corePosition(99)).toEqual(runtime.corePosition(99));
    expect(runtime.testPosition(99)).toEqual(runtime.testPosition(99));
  });
});
