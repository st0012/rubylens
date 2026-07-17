import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

// Package row: [seed, role, location, declarationCount, 4 rubyCounts, systemIndex]
const PACKAGES = [
  [101, 0, 1, 17, 1, 0, 16, 0, -1],
  [101, 0, 1, 18, 1, 0, 17, 0, -1],
  [102, 1, 1, 100, 0, 0, 85, 15, -1],
  [202, 1, 1, 100, 0, 0, 80, 20, 0],
  [202, 1, 1, 100, 0, 0, 80, 20, -1],
  [303, 1, 1, 100, 0, 0, 60, 40, -1],
  [404, 1, 1, 100, 10, 5, 80, 5, -1],
  [505, 1, 1, 100, 0, 0, 0, 0, -1],
];
const MORPHOLOGY_ROWS = [
  [0, 350, 0, 0, 0, 0, 0, 0, 0, 101],
  [0, 350, 0, 0, 0, 0, 0, 0, 0, 101],
  [1, 0, 350, 0, 0, 0, 0, 0, 0, 102],
  [2, 0, 240, 4, 120, 520, 0, 0, 0, 202],
  [2, 0, 240, 4, 120, 520, 0, 0, 0, 202],
  [3, 0, 240, 2, 100, 520, 450, 0, 0, 303],
  [4, 0, 0, 0, 0, 0, 0, 4, 600, 404],
  [99],
];

function hostModel(hostFamily) {
  return minimalModel({
    morphology: hostFamily === 0
      ? { family: 0, designation: "E4", knobs: [350, 0, 0, 0, 0, 0, 0, 0, 909] }
      : { family: 3, designation: "SBb", knobs: [0, 240, 2, 100, 520, 450, 0, 0, 909] },
    totals: { namespaces: 0, packages: PACKAGES.length, dependencyStars: 0, renderedDependencyStars: 0 },
    packageNames: PACKAGES.map((_, index) => `gem-${index}`),
    packages: PACKAGES,
    packageMorphologies: MORPHOLOGY_ROWS,
    dependencySystems: [[404, 3]],
  });
}

const offsetsFor = (runtime, cloud) => Array.from(
  { length: 1024 },
  (_, index) => runtime.dependencyCloudOffset(index + 1, cloud, 6),
);

describe("package cloud morphology", () => {
  const runtime = loadRuntime(hostModel(0));

  it("is independent of the host galaxy morphology", () => {
    const barredHost = loadRuntime(hostModel(3));
    expect(barredHost.packageMorphologies).toEqual(runtime.packageMorphologies);
    expect(offsetsFor(barredHost, barredHost.packageMorphologies[3]))
      .toEqual(offsetsFor(runtime, runtime.packageMorphologies[3]));
  });

  it("decodes families, compactness, and phase seeds from the rows", () => {
    expect(runtime.packageMorphologies.map(cloud => cloud.family)).toEqual([0, 0, 1, 2, 2, 3, 4, 2]);
    expect(runtime.packageMorphologies.map(cloud => cloud.compact).slice(0, 2)).toEqual([true, false]);
    expect(runtime.packageMorphologies[7].compact).toBe(false);
    expect(runtime.packageMorphologies[3]).toEqual(runtime.packageMorphologies[4]);
    expect(runtime.DEPENDENCY_CLOUD_THREASHOLD).toBe(18);
  });

  it("falls back for malformed rows without losing the package phase seed", () => {
    const fallback = runtime.packageMorphologies[7];
    expect(fallback.family).toBe(2);
    expect(fallback.phaseSeed).toBe(505);
    expect(fallback.phase).toBe(runtime.fallbackMorphology(505).phase);
  });

  it("keeps every family recipe finite, bounded, deterministic, and distinct", () => {
    const distinct = new Set();
    for (const index of [1, 2, 3, 5, 6]) {
      const cloud = runtime.packageMorphologies[index];
      const offsets = offsetsFor(runtime, cloud);
      expect(offsets.every(point => point.every(Number.isFinite))).toBe(true);
      expect(Math.max(...offsets.map(point => Math.hypot(...point)))).toBeLessThanOrEqual(6 + 1e-9);
      expect(offsetsFor(runtime, cloud)).toEqual(offsets);
      distinct.add(JSON.stringify(offsets));
    }
    expect(distinct.size).toBe(5);
  });
});
