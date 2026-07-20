import { beforeEach, describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

function fixtureModel() {
  const row = (seed, test) => [seed, 0, test, 3, 1, 0, 2, 8, 4, 1, 0, 6, 1, 0];
  return minimalModel({
    totals: { namespaces: 3, packages: 0, dependencyStars: 0 },
    namespaceNames: ["Core::One", "Core::Two", "Spec::Three"],
    namespaces: [row(5, 0), row(6, 0), row(7, 1)],
  });
}

describe("hitTestProjected", () => {
  let runtime;
  beforeEach(() => {
    runtime = loadRuntime(fixtureModel());
    Object.assign(runtime.state, {
      width: 1200, height: 800, sceneRight: 1200, sceneBottom: 800,
      sceneCenterX: 600, sceneCenterY: 424,
      yaw: -0.36, pitch: 0.34, zoom: 2, panX: 0, panY: 0,
    });
  });

  it("returns the point whose projection matches the cursor", () => {
    const target = runtime.interactivePoints[0];
    const screen = runtime.project(target, runtime.viewMatrix());
    expect(screen).not.toBeNull();
    expect(runtime.hitTestProjected(screen[0], screen[1])).toBe(target);
  });

  it("misses far from any projection", () => {
    const projections = runtime.interactivePoints
      .map(point => runtime.project(point, runtime.viewMatrix()))
      .filter(Boolean);
    const clearX = Math.max(...projections.map(p => p[0])) + 300;
    expect(runtime.hitTestProjected(clearX, 10)).toBeNull();
  });

  it("respects category visibility and focus filters", () => {
    const testPoint = runtime.interactivePoints.find(point => point.category === "tests");
    const screen = runtime.project(testPoint, runtime.viewMatrix());
    runtime.visibleCategories.tests = false;
    expect(runtime.hitTestProjected(screen[0], screen[1])).not.toBe(testPoint);
    runtime.visibleCategories.tests = true;
    runtime.state.focusedCategory = "core";
    expect(runtime.hitTestProjected(screen[0], screen[1])).not.toBe(testPoint);
    runtime.state.focusedCategory = null;
    expect(runtime.hitTestProjected(screen[0], screen[1])).toBe(testPoint);
  });
});
