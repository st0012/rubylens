import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

function fixtureModel() {
  return minimalModel({
    totals: { namespaces: 1, packages: 3, dependencyStars: 3 },
    namespaceNames: ["Core::Anchor"],
    namespaces: [[11, 0, 0, 2, 1, 0, 4, 9, 3, 1, 0, 5, 2, 1]],
    packageNames: ["small", "medium", "large"],
    packages: [
      [21, 0, 1, 4, 1, 0, 6, 1, -1],
      [22, 1, 1, 100, 0, 1, 30, 2, -1],
      [23, 1, 1, 10_000, 20, 4, 900, 12, -1],
    ],
    packageMorphologies: [
      [0, 250, 0, 0, 0, 0, 0, 0, 0, 21],
      [2, 0, 260, 4, 110, 500, 0, 0, 0, 22],
      [3, 0, 260, 2, 110, 500, 420, 0, 0, 23],
    ],
    dependencyStars: [
      [41, 0, 1, 1, 0, 2, 7, 3],
      [42, 1, 0, 1, 1, 0, 3, 1],
      [43, 2, 2, 1, 0, 1, 5, 0],
    ],
  });
}

describe("dependency cloud spin", () => {
  const runtime = loadRuntime(fixtureModel());

  it("uses self-gravity and tidal frequencies to assign bounded loop-safe speeds", () => {
    const densePackage = [1, 0, 1, 500, 0, 0, 0, 0, -1];
    const lightPackage = [1, 0, 1, 10, 0, 0, 0, 0, -1];
    const near = runtime.dependencySpinTurns(densePackage, [60, 0, 0, 3]);
    const far = runtime.dependencySpinTurns(densePackage, [140, 0, 0, 3]);
    const diffuse = runtime.dependencySpinTurns(densePackage, [60, 0, 0, 6]);
    const light = runtime.dependencySpinTurns(lightPackage, [60, 0, 0, 3]);

    expect(near).toBe(2);
    expect(far).toBe(1);
    expect(diffuse).toBe(1);
    expect(light).toBe(1);
    expect(runtime.DEPENDENCY_SPIN_RECIPE.maximumTurnsPerLoop).toBe(2);
    const assignedTurns = runtime.packageSpinRates.map(rate =>
      Math.abs(rate) * runtime.SHOWCASE_PRESET.durationMs / 1000 / (Math.PI * 2)
    );
    expect(new Set(assignedTurns.map(Math.round)).size).toBeGreaterThan(1);
    for (const turns of assignedTurns) {
      expect(turns).toBe(Math.round(turns));
      expect(turns).toBeGreaterThanOrEqual(runtime.DEPENDENCY_SPIN_RECIPE.minimumTurnsPerLoop);
      expect(turns).toBeLessThanOrEqual(runtime.DEPENDENCY_SPIN_RECIPE.maximumTurnsPerLoop);
    }
  });

  it("rotates each cloud rigidly around its own hub and closes the Showcase seam", () => {
    const packageIndex = 1;
    const anchor = runtime.packageAnchors[packageIndex];
    const initial = runtime.dependencyPosition(42, packageIndex);
    const rotated = runtime.dependencySpunPosition(...initial, packageIndex, 12_345);
    const looped = runtime.dependencySpunPosition(
      ...initial,
      packageIndex,
      runtime.SHOWCASE_PRESET.durationMs,
    );

    expect(rotated).not.toEqual(initial);
    expect(rotated[1]).toBe(initial[1]);
    expect(Math.hypot(rotated[0] - anchor[0], rotated[2] - anchor[2])).toBeCloseTo(
      Math.hypot(initial[0] - anchor[0], initial[2] - anchor[2]),
      10,
    );
    expect(looped[0]).toBeCloseTo(initial[0], 10);
    expect(looped[1]).toBeCloseTo(initial[1], 10);
    expect(looped[2]).toBeCloseTo(initial[2], 10);
  });

  it("projects moving dependency stars without moving workspace stars", () => {
    const matrix = runtime.viewMatrix();
    const dependencyRenderIndex = 2;
    const initialDependency = runtime.projectScenePoint(dependencyRenderIndex, matrix, undefined, null, 0);
    const rotatedDependency = runtime.projectScenePoint(dependencyRenderIndex, matrix, undefined, null, 12_345);
    const initialCore = runtime.projectScenePoint(0, matrix, undefined, null, 0);
    const laterCore = runtime.projectScenePoint(0, matrix, undefined, null, 12_345);

    expect(rotatedDependency).not.toEqual(initialDependency);
    expect(laterCore).toEqual(initialCore);
  });
});
