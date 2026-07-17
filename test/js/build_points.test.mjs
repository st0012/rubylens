import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

// 3 core namespaces (1 an RSpec proxy), 1 test namespace, 4 dependency stars,
// 1 two-package system, 3 packages. Row: [seed, component, kind, test, 6 signals, 4 rubyCounts, ivars]
function fixtureModel() {
  const namespaceRow = (seed, kind, test) => [seed, 0, kind, test, 2, 1, 0, 4, 9, 3, 1, 0, 5, 2, 1];
  return minimalModel({
    totals: { namespaces: 4, packages: 3, dependencyStars: 4, renderedDependencyStars: 4 },
    namespaceNames: ["Core::Alpha", "Core::Beta", "RSpec example group #000001", "Spec::Gamma"],
    namespaces: [
      namespaceRow(11, 0, 0),
      namespaceRow(12, 1, 0),
      namespaceRow(13, 0, 1),
      namespaceRow(14, 0, 1),
    ],
    packageNames: ["gem-a", "gem-b", "gem-c"],
    // Package row: [seed, role, location, declarationCount, 4 rubyCounts, systemIndex]
    packages: [
      [21, 0, 1, 2, 1, 0, 6, 1, 0],
      [22, 1, 1, 1, 0, 1, 3, 0, 0],
      [23, 1, 1, 1, 2, 0, 9, 2, -1],
    ],
    packageMorphologies: [
      [0, 250, 0, 0, 0, 0, 0, 0, 0, 21],
      [1, 0, 350, 0, 0, 0, 0, 0, 0, 22],
      [2, 0, 260, 4, 110, 500, 0, 0, 0, 23],
    ],
    dependencySystems: [[31, 0]],
    // Dependency row: [seed, packageIndex, 6 signals]
    dependencyStars: [
      [41, 0, 1, 1, 0, 2, 7, 3],
      [42, 0, 0, 1, 1, 0, 3, 1],
      [43, 1, 2, 1, 0, 1, 5, 0],
      [44, 2, 1, 2, 1, 3, 8, 2],
    ],
  });
}

describe("buildPoints", () => {
  const runtime = loadRuntime(fixtureModel());

  it("writes one scene row per point in namespace, star, system, package order", () => {
    expect(runtime.scenePointCount).toBe(4 + 4 + 1 + 3);
    expect(runtime.sceneData.length).toBe(runtime.scenePointCount * runtime.SCENE_POINT_STRIDE);
    const categoryAt = index => runtime.sceneData[index * runtime.SCENE_POINT_STRIDE + 5];
    expect([0, 1, 2, 3].map(categoryAt)).toEqual([0, 0, 1, 1]);
    expect([4, 5, 6, 7].map(categoryAt)).toEqual([2, 2, 2, 2]);
    expect([8, 9, 10, 11].map(categoryAt)).toEqual([2, 2, 2, 2]);
  });

  it("creates objects only for interactive points and hubs", () => {
    expect(runtime.interactivePoints.map(point => point.name)).toEqual([
      "Core::Alpha", "Core::Beta", "Spec::Gamma", "gem-a", "gem-a", "gem-b", "gem-c",
    ]);
    expect(runtime.systemHubs).toHaveLength(1);
    expect(runtime.packageHubs).toHaveLength(3);
    expect(runtime.dependencyHubs).toHaveLength(4);
  });

  it("pairs every surviving object with its scene row via renderIndex", () => {
    for (const point of [...runtime.interactivePoints, ...runtime.dependencyHubs]) {
      const offset = point.renderIndex * runtime.SCENE_POINT_STRIDE;
      expect(runtime.sceneData[offset]).toBeCloseTo(point.position[0], 3);
      expect(runtime.sceneData[offset + 1]).toBeCloseTo(point.position[1], 3);
      expect(runtime.sceneData[offset + 2]).toBeCloseTo(point.position[2], 3);
      expect(runtime.sceneData[offset + 5]).toBe(runtime.categoryCodes[point.category]);
    }
    expect(runtime.systemHubs[0].renderIndex).toBe(8);
    expect(runtime.packageHubs.map(point => point.renderIndex)).toEqual([9, 10, 11]);
  });

  it("excludes RSpec proxies from interaction but keeps their scene row", () => {
    const names = runtime.interactivePoints.map(point => point.name);
    expect(names).not.toContain("RSpec example group #000001");
    expect(runtime.scenePointCount).toBe(12);
  });

  it("applies the star alpha scale to dependency stars but not hubs", () => {
    const alphaAt = index => runtime.sceneData[index * runtime.SCENE_POINT_STRIDE + 4];
    const maxSizeAt = index => runtime.sceneData[index * runtime.SCENE_POINT_STRIDE + 6];
    for (const star of [4, 5, 6, 7]) {
      expect(alphaAt(star)).toBeLessThanOrEqual(0.7 * runtime.DEPENDENCY_STAR_ALPHA_SCALE + 1e-6);
      expect(maxSizeAt(star)).toBeCloseTo(3.2, 5);
    }
    for (const hub of [8, 9, 10, 11]) expect(maxSizeAt(hub)).toBeCloseTo(5.2, 5);
  });

  it("stamps package and system indexes for expansion", () => {
    const row = index => {
      const offset = index * runtime.SCENE_POINT_STRIDE;
      return [runtime.sceneData[offset + 7], runtime.sceneData[offset + 8]];
    };
    expect(row(4)).toEqual([0, 0]);
    expect(row(6)).toEqual([1, 0]);
    expect(row(7)).toEqual([2, -1]);
    expect(row(8)).toEqual([-1, 0]);
    expect(row(11)).toEqual([2, -1]);
  });

  it("copies hit-scan rows from the scene buffer", () => {
    const rows = runtime.ensureHitScanRows();
    expect(rows.length).toBe(runtime.interactivePoints.length * 8);
    runtime.interactivePoints.forEach((point, index) => {
      const hit = index * 8;
      const scene = point.renderIndex * runtime.SCENE_POINT_STRIDE;
      expect(rows[hit]).toBe(runtime.sceneData[scene]);
      expect(rows[hit + 3]).toBe(runtime.sceneData[scene + 3]);
      expect(rows[hit + 4]).toBe(runtime.sceneData[scene + 6]);
      expect(rows[hit + 5]).toBe(runtime.sceneData[scene + 5]);
      expect(rows[hit + 6]).toBe(runtime.sceneData[scene + 7]);
      expect(rows[hit + 7]).toBe(runtime.sceneData[scene + 8]);
    });
  });

  it("is deterministic for a fixed model", () => {
    const repeat = loadRuntime(fixtureModel());
    expect(Array.from(repeat.sceneData)).toEqual(Array.from(runtime.sceneData));
  });
});
