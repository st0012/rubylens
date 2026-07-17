import { describe, expect, it } from "vitest";
import { loadRuntime } from "./helpers/runtime.mjs";

const runtime = loadRuntime();
const metrics = coreCount => runtime.layoutMetricsForCoreCount(coreCount, { legacy: true, family: 2, clumpSpread: 0 });

const BASELINE = {
  disk: 1, bulge: 1, tests: 1, cameraScale: 1,
  cameraDistance: 270, cameraFocalLength: 440,
  coreOuterRadius: 42, testOuterRadius: 62, dependencyInnerRadius: 70,
};

describe("layoutMetricsForCoreCount", () => {
  it("preserves the original layout at or below the knee", () => {
    for (const coreCount of [0, 1, 2999, 3000]) {
      expect({ ...metrics(coreCount) }).toEqual(BASELINE);
    }
  });

  it("expands the outer system monotonically and concavely", () => {
    const scales = [3000, 6000, 9000, 12000].map(count => metrics(count));
    const disks = scales.map(item => item.disk);
    for (let index = 1; index < disks.length; index += 1) expect(disks[index]).toBeGreaterThan(disks[index - 1]);
    const increments = disks.slice(1).map((value, index) => value - disks[index]);
    for (let index = 1; index < increments.length; index += 1) expect(increments[index]).toBeLessThan(increments[index - 1]);
    for (const item of scales) expect(item.tests).toBe(item.disk);
  });

  it("keeps the bulge more concentrated than the disk as scale grows", () => {
    const scales = [6000, 12000, 100000].map(count => metrics(count));
    for (const item of scales) {
      expect(item.bulge).toBeLessThan(item.cameraScale);
      expect(item.cameraScale).toBeLessThan(item.disk);
    }
    const concentration = scales.map(item => item.bulge / item.disk);
    for (let index = 1; index < concentration.length; index += 1) {
      expect(concentration[index]).toBeLessThan(concentration[index - 1]);
    }
  });

  it("preserves the prototype geometry at moderately large scale", () => {
    const item = metrics(7121);
    expect(item.disk).toBeCloseTo(1.4754988623, 10);
    expect(item.bulge).toBeCloseTo(1.3533088, 10);
    expect(item.tests).toBeCloseTo(1.4754988623, 10);
    expect(item.cameraDistance).toBeCloseTo(368.5656589, 6);
    expect(item.testOuterRadius).toBeCloseTo(91.4809295, 6);
    expect(item.dependencyInnerRadius).toBeCloseTo(99.4809295, 6);
  });

  it("keeps the dependency anchor boundary eight units outside the test boundary", () => {
    for (const coreCount of [0, 3000, 7121, 100000]) {
      const item = metrics(coreCount);
      expect(item.dependencyInnerRadius - item.testOuterRadius).toBeCloseTo(8, 12);
    }
  });

  it("scales one non-linear system for very large repositories", () => {
    const item = metrics(100000);
    expect(item.disk).toBeCloseTo(4.845018452, 9);
    expect(item.bulge).toBeCloseTo(3.4119885167, 9);
    expect(item.tests).toBe(item.disk);
    expect(item.cameraScale).toBeLessThan(item.disk);
    expect(item.dependencyInnerRadius - item.testOuterRadius).toBeCloseTo(8, 12);
  });
});

describe("explorerExposureForZoom", () => {
  it("is identity through 100 percent and attenuates deep zoom", () => {
    const exposures = [0.35, 1, 2.5, 4.65, 7, 40].map(runtime.explorerExposureForZoom);
    expect(exposures[0]).toBeCloseTo(1, 6);
    expect(exposures[1]).toBeCloseTo(1, 6);
    expect(exposures[2]).toBeCloseTo(0.616, 3);
    expect(exposures[3]).toBeCloseTo(0.46, 2);
    expect(exposures[4]).toBeCloseTo(0.392, 3);
    expect(exposures[5]).toBeCloseTo(0.24, 2);
    for (let index = 2; index < exposures.length; index += 1) {
      expect(exposures[index]).toBeLessThan(exposures[index - 1]);
    }
  });
});
