import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

// Same shape as build_points.test.mjs: 2 core namespaces, 2 test namespaces,
// 4 dependency stars, 1 system hub, 3 package hubs → 12 data rows.
// Row: [seed, kind, test, 6 signals, 4 rubyCounts, ivars]
function fixtureModel() {
  const namespaceRow = (seed, kind, test) => [seed, kind, test, 2, 1, 0, 4, 9, 3, 1, 0, 5, 2, 1];
  return minimalModel({
    totals: { namespaces: 4, packages: 3, dependencyStars: 4 },
    namespaceNames: ["Core::Alpha", "Core::Beta", "RSpec example group #000001", "Spec::Gamma"],
    namespaces: [
      namespaceRow(11, 0, 0),
      namespaceRow(12, 1, 0),
      namespaceRow(13, 0, 1),
      namespaceRow(14, 0, 1),
    ],
    packageNames: ["gem-a", "gem-b", "gem-c"],
    packages: [
      [21, 0, 1, 2, 1, 0, 6, 1, 0],
      [22, 1, 1, 1, 0, 1, 3, 0, 0],
      [23, 1, 1, 1, 2, 0, 9, 2, -1],
    ],
    dependencySystems: [[31, 0]],
    dependencyStars: [
      [41, 0, 1, 1, 0, 2, 7, 3],
      [42, 0, 0, 1, 1, 0, 3, 1],
      [43, 1, 2, 1, 0, 1, 5, 0],
      [44, 2, 1, 2, 1, 3, 8, 2],
    ],
  });
}

describe("buildHazePoints", () => {
  const runtime = loadRuntime(fixtureModel());
  const stride = runtime.SCENE_POINT_STRIDE;
  // Pools resample the population law per category: 2 core marks × 24, 2 test
  // marks × 18, then 4 dependency stars × 2; hubs shed no haze.
  const poolCounts = [48, 36, 8];

  it("appends haze rows after the data rows in the render buffer", () => {
    expect(runtime.hazeData.length).toBe(runtime.hazePointCount * stride);
    expect(runtime.renderPointCount).toBe(runtime.scenePointCount + runtime.hazePointCount);
    expect(runtime.renderPointData.length).toBe(runtime.sceneData.length + runtime.hazeData.length);
    expect(Array.from(runtime.renderPointData.slice(0, runtime.sceneData.length)))
      .toEqual(Array.from(runtime.sceneData));
    expect(Array.from(runtime.renderPointData.slice(runtime.sceneData.length)))
      .toEqual(Array.from(runtime.hazeData));
  });

  it("sizes category pools from mark counts under the global budget", () => {
    expect(runtime.hazePointCount).toBe(poolCounts[0] + poolCounts[1] + poolCounts[2]);
    expect(runtime.hazePointCount).toBeLessThanOrEqual(runtime.HAZE_POINT_BUDGET);
  });

  it("marks every haze row with the offset category and faint bounded attributes", () => {
    for (let index = 0; index < runtime.hazePointCount; index += 1) {
      const offset = index * stride;
      const category = runtime.hazeData[offset + 5] - runtime.HAZE_CATEGORY_OFFSET;
      expect([0, 1, 2]).toContain(category);
      expect(runtime.hazeData[offset + 3]).toBeGreaterThanOrEqual(0.16);
      expect(runtime.hazeData[offset + 3]).toBeLessThanOrEqual(0.48);
      expect(runtime.hazeData[offset + 4]).toBeGreaterThan(0);
      expect(runtime.hazeData[offset + 4]).toBeLessThan(1.1);
      expect(runtime.hazeData[offset + 6]).toBeCloseTo(1.2, 5);
    }
  });

  it("draws haze positions from the same position law as the data marks", () => {
    const categoryAt = index => runtime.hazeData[index * stride + 5] - runtime.HAZE_CATEGORY_OFFSET;
    // Core pool first, then tests, then dependency rows.
    for (let index = 0; index < poolCounts[0]; index += 1) {
      expect(categoryAt(index)).toBe(0);
      const expected = runtime.corePosition(runtime.hash(index + 1, 133));
      expect(runtime.hazeData[index * stride]).toBeCloseTo(expected[0], 3);
      expect(runtime.hazeData[index * stride + 1]).toBeCloseTo(expected[1], 3);
      expect(runtime.hazeData[index * stride + 2]).toBeCloseTo(expected[2], 3);
      expect(runtime.hazeData[index * stride + 7]).toBe(-1);
      expect(runtime.hazeData[index * stride + 8]).toBe(-1);
    }
    for (let pool = 0; pool < poolCounts[1]; pool += 1) {
      const index = poolCounts[0] + pool;
      expect(categoryAt(index)).toBe(1);
      const expected = runtime.testPosition(runtime.hash(pool + 1, 134));
      expect(runtime.hazeData[index * stride]).toBeCloseTo(expected[0], 3);
      expect(runtime.hazeData[index * stride + 1]).toBeCloseTo(expected[1], 3);
      expect(runtime.hazeData[index * stride + 2]).toBeCloseTo(expected[2], 3);
    }
    // Dependency haze: 2 stars per declaration row (data rows 4-7), keeping
    // that row's package and system indexes for expansion.
    for (let pool = 0; pool < poolCounts[2]; pool += 1) {
      const index = poolCounts[0] + poolCounts[1] + pool;
      const dataRow = 4 + Math.floor(pool / 2);
      const rowKey = dataRow * 8 + (pool % 2);
      expect(categoryAt(index)).toBe(2);
      const packageIndex = runtime.sceneData[dataRow * stride + 7];
      const expected = runtime.dependencyPosition(runtime.hash(rowKey + 1, 135), packageIndex);
      expect(runtime.hazeData[index * stride]).toBeCloseTo(expected[0], 3);
      expect(runtime.hazeData[index * stride + 1]).toBeCloseTo(expected[1], 3);
      expect(runtime.hazeData[index * stride + 2]).toBeCloseTo(expected[2], 3);
      expect(runtime.hazeData[index * stride + 7]).toBe(packageIndex);
      expect(runtime.hazeData[index * stride + 8]).toBe(runtime.sceneData[dataRow * stride + 8]);
    }
  });

  it("keeps haze out of interaction and reported scene counts", () => {
    expect(runtime.scenePointCount).toBe(12);
    expect(runtime.interactivePoints.every(point => point.renderIndex < runtime.scenePointCount)).toBe(true);
  });

  it("generates deterministically across loads", () => {
    const second = loadRuntime(fixtureModel());
    expect(Array.from(second.hazeData)).toEqual(Array.from(runtime.hazeData));
  });
});
