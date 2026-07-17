import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

// Package row: [seed, role, location, declarationCount, 4 rubyCounts, systemIndex]
function fixtureModel() {
  return minimalModel({
    totals: { namespaces: 0, packages: 3, dependencyStars: 0, renderedDependencyStars: 0 },
    packageNames: ["gem-a", "gem-b", "gem-c"],
    packages: [
      [101, 0, 1, 0, 0, 0, 0, 0, 0],
      [202, 1, 1, 3, 1, 0, 2, 0, 0],
      [303, 1, 1, 2, 0, 1, 1, 0, -1],
    ],
    packageMorphologies: [
      [0, 250, 0, 0, 0, 0, 0, 0, 0, 101],
      [0, 250, 0, 0, 0, 0, 0, 0, 0, 202],
      [0, 250, 0, 0, 0, 0, 0, 0, 0, 303],
    ],
    dependencySystems: [[404, 0]],
  });
}

describe("git-source dependency systems", () => {
  const runtime = loadRuntime(fixtureModel());

  it("groups member packages under their system with exact aggregates", () => {
    expect(runtime.systemMembers).toEqual([[0, 1]]);
    expect(runtime.systemAggregates[0].declarationCount).toBe(3);
    expect(runtime.systemAggregates[0].directCount).toBe(1);
  });

  it("anchors members around the parent and keeps distinct hub positions", () => {
    expect(runtime.packageAnchors[0][3]).toBe(1.6);
    expect(runtime.packageAnchors[0].slice(0, 3)).not.toEqual(runtime.packageAnchors[1].slice(0, 3));
    expect(runtime.packageAnchors[2][5]).toBe(-1);
    expect(runtime.systemAnchors[0]).toHaveLength(5);
  });

  it("lays out deterministically", () => {
    const repeat = loadRuntime(fixtureModel());
    expect(repeat.systemAnchors).toEqual(runtime.systemAnchors);
    expect(repeat.packageAnchors).toEqual(runtime.packageAnchors);
  });
});
