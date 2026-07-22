import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

// Degenerate-density guards. Geometry regressions that per-point assertions
// cannot see show up as distributional artifacts: angular spikes (spokes and
// crosses from arm members collapsing onto their origin angle) or
// single-radius pile-ups (rings and arcs from clamping draws to a bound).
// Thresholds sit ~1.4x above the healthy maxima of every family; the spoke
// regression fixed in "Keep unbarred spiral arms out of the core" measured
// 0.056-0.068 against the 0.048 inner angular bound.
//
// Bars, SB(r) rings, and irregular clumps are intentional concentrations, so
// barred families skip the core angular guard and irregulars skip both.
const SCENARIOS = [
  { name: "SBa", barred: true, row: [3, 0, 338, 2, 169, 461, 478, 0, 0, 0x1111] },
  { name: "SBb ringed", barred: true, row: [3, 0, 261, 3, 128, 500, 421, 0, 0, 0x7777] },
  { name: "SBc", barred: true, row: [3, 0, 162, 4, 77, 549, 302, 0, 0, 0x3333] },
  { name: "Sa", barred: false, row: [2, 0, 338, 2, 169, 461, 0, 0, 0, 0x1111] },
  { name: "Sb", barred: false, row: [2, 0, 261, 3, 128, 500, 0, 0, 0, 0x2222] },
  { name: "Sc", barred: false, row: [2, 0, 162, 6, 77, 549, 0, 0, 0, 0x3333] },
  { name: "S0", barred: false, row: [1, 0, 380, 0, 0, 0, 0, 0, 0, 0x9999] },
  { name: "E4", barred: false, row: [0, 400, 0, 0, 0, 0, 0, 0, 0, 0x9999] },
  { name: "Irr", barred: false, clumped: true, row: [4, 0, 0, 0, 0, 0, 0, 4, 600, 0x9999] },
];

const sample = (position, count) => Array.from({ length: count }, (_, index) => position(index + 1));

function maxAngularShare(points, low, high) {
  const bins = new Array(36).fill(0);
  let inside = 0;
  for (const [x, , z] of points) {
    const radial = Math.hypot(x, z);
    if (radial < low || radial > high) continue;
    inside += 1;
    bins[Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * 36) % 36] += 1;
  }
  return inside ? Math.max(...bins) / inside : 0;
}

function maxRadialShare(points) {
  const bins = new Map();
  for (const [x, , z] of points) {
    const bin = Math.round(Math.hypot(x, z) * 2);
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }
  return Math.max(...bins.values()) / points.length;
}

describe("position distributions", () => {
  for (const scenario of SCENARIOS) {
    it(`keeps ${scenario.name} free of angular spikes and radial pile-ups`, () => {
      const runtime = loadRuntime(minimalModel({ morphology: scenario.row }));
      const core = sample(runtime.corePosition, 6000);
      const tests = sample(runtime.testPosition, 3000);
      const cloudShape = runtime.decodeMorphology(scenario.row);
      const cloud = sample(seed => runtime.dependencyCloudOffset(seed, cloudShape, 6), 4000);

      expect(maxRadialShare(core)).toBeLessThan(.09);
      expect(maxRadialShare(tests)).toBeLessThan(.09);
      expect(maxRadialShare(cloud)).toBeLessThan(.25);
      if (!scenario.clumped) {
        expect(maxAngularShare(tests, 2, 24)).toBeLessThan(scenario.barred ? .1 : .075);
        if (!scenario.barred) {
          expect(maxAngularShare(core, 2, 7.5)).toBeLessThan(.048);
          expect(maxAngularShare(cloud, .6, 3)).toBeLessThan(.07);
        }
      }
    });
  }
});
