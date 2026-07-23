import { describe, expect, it } from "vitest";
import { RUNTIME_SOURCE, runtimeFunction } from "./helpers/runtime_source.mjs";

// Mirrors the retired Ruby test's technique: extract the load-time morphology
// and geometry source verbatim from the shipped runtime and evaluate it
// in-process (the Ruby version shelled out to a `node -e` subprocess because
// Ruby cannot run JS itself; here we can just build and call a Function).
function runtimeGeometrySource() {
  const family = RUNTIME_SOURCE.match(/^ {4}const MORPHOLOGY_FAMILY = .*;$/m)[0].trim();
  const fallbackRow = RUNTIME_SOURCE.match(/^ {4}const FALLBACK_MORPHOLOGY_ROW = .*;$/m)[0].trim();
  const primitives = RUNTIME_SOURCE.match(
    /^ {4}const hash = [\s\S]*?^ {4}const spiralMorphology = morphology\.family === MORPHOLOGY_FAMILY\.spiral \|\| morphology\.family === MORPHOLOGY_FAMILY\.barredSpiral;$/m,
  )[0];
  const layout = runtimeFunction("layoutMetricsForCoreCount");
  const positions = RUNTIME_SOURCE.match(/^ {4}const coreCount = [\s\S]*?^ {4}\}\n\n {4}const dependencySystems =/m)[0].replace(
    /\n\n {4}const dependencySystems =$/,
    "",
  );

  for (const [name, source] of [["family", family], ["fallbackRow", fallbackRow], ["primitives", primitives], ["layout", layout], ["positions", positions]]) {
    if (!source) throw new Error(`morphology runtime source not found: ${name}`);
  }

  return [family, fallbackRow, primitives, layout, positions].join("\n");
}

function runtimeStats(rawMorphology) {
  const source = runtimeGeometrySource();
  const script = `
    const model = { morphology: ${JSON.stringify(rawMorphology)}, namespaces: Array.from({length: 3000}, (_, index) => [index, 0, index % 4 === 0 ? 1 : 0]) };
    const CORE_SCALE_BASELINE = 3000;
    ${source}
    const seeds = Array.from({length: 4096}, (_, index) => index + 1);
    const core = seeds.map(corePosition);
    const tests = seeds.map(testPosition);
    const all = core.concat(tests);
    const radius = point => Math.hypot(point[0], point[2]);
    const equalPoint = (left, right) => left.every((value, index) => Object.is(value, right[index]));
    const discSeeds = seeds.filter(seed => unit(seed, 2) >= morphology.bulgeShare);
    const discRadial = seed => Math.min(42, -10 * Math.log(Math.max(1e-5, 1 - unit(seed, 3))));
    const armSeeds = discSeeds.filter(seed => coreDiscUsesArm(seed, false, discRadial(seed)));
    return {
      morphology,
      layout: layoutScale,
      clumpCenters: irregularClumpCenters.length,
      finite: all.every(point => point.every(Number.isFinite)),
      deterministic: seeds.every(seed => equalPoint(corePosition(seed), corePosition(seed)) && equalPoint(testPosition(seed), testPosition(seed))),
      maxCoreRadius: Math.max(...core.map(radius)),
      maxTestRadius: Math.max(...tests.map(radius)),
      meanHorizontal: core.reduce((sum, point) => sum + Math.hypot(point[0], point[2]), 0) / core.length,
      meanVertical: core.reduce((sum, point) => sum + Math.abs(point[1]), 0) / core.length,
      coreArmShare: discSeeds.length ? armSeeds.length / discSeeds.length : 0,
    };
  `;
  return new Function(script)();
}

describe("morphology runtime contract", () => {
  it("absent and classifier default render the same default spiral", () => {
    const absent = runtimeStats(null);
    const fallback = runtimeStats([2, 0, 240, 3, 105, 380, 0, 0, 0, 0]);

    expect(absent).toEqual(fallback);
    for (const stats of [absent, fallback]) {
      expect(stats.morphology.family).toBe(2);
      expect(stats.morphology.armCount).toBe(3);
      expect(stats.layout.coreOuterRadius).toBe(42);
      expect(stats.layout.testOuterRadius).toBe(62);
    }
  });

  it("every family is deterministic finite and inside its declared extent", () => {
    const morphologies = [
      [0, 600, 0, 0, 0, 0, 0, 0, 0, 11],
      [1, 0, 380, 0, 0, 0, 0, 0, 0, 22],
      [2, 0, 240, 6, 70, 520, 0, 0, 0, 33],
      [3, 0, 220, 4, 80, 520, 480, 0, 0, 44],
      [4, 0, 0, 0, 0, 0, 0, 4, 650, 55],
    ];

    for (const row of morphologies) {
      const stats = runtimeStats(row);
      expect(stats.finite, `Family ${row[0]}`).toBe(true);
      expect(stats.deterministic, `Family ${row[0]}`).toBe(true);
      expect(stats.maxCoreRadius).toBeLessThanOrEqual(stats.layout.coreOuterRadius + 1e-9);
      expect(stats.maxTestRadius).toBeLessThanOrEqual(stats.layout.testOuterRadius + 1e-9);
      expect(Math.abs(stats.layout.dependencyInnerRadius - stats.layout.testOuterRadius - 8)).toBeLessThan(1e-12);
    }
  });

  it("ellipticity flattens only the vertical axis", () => {
    const round = runtimeStats([0, 0, 0, 0, 0, 0, 0, 0, 0, 77]);
    const flat = runtimeStats([0, 700, 0, 0, 0, 0, 0, 0, 0, 77]);

    expect(Math.abs(round.meanHorizontal - flat.meanHorizontal)).toBeLessThan(1e-12);
    expect(flat.meanVertical).toBeLessThan(round.meanVertical * 0.31);
  });

  it("spiral core arm participation and arm bounds are load time values", () => {
    const spiral = runtimeStats([2, 0, 200, 99, 70, 500, 0, 0, 0, 88]);
    const barred = runtimeStats([3, 0, 200, 99, 70, 500, 500, 0, 0, 99]);

    expect(spiral.morphology.armCount).toBe(6);
    expect(barred.morphology.armCount).toBe(4);
    // Unbarred arm membership excludes the inner core (radial <= 8), so the
    // rendered share sits near armFraction times the outer-disc probability.
    expect(Math.abs(spiral.coreArmShare - 0.225)).toBeLessThan(0.025);
    expect(Math.abs(barred.coreArmShare - 0.5)).toBeLessThan(0.025);
    expect(RUNTIME_SOURCE.split("const morphology = decodeMorphology(model.morphology);").length - 1).toBe(1);
    expect(RUNTIME_SOURCE.split("const irregularClumpCenters =").length - 1).toBe(1);
  });

  it("irregular recipe precomputes the requested bounded clumps", () => {
    const stats = runtimeStats([4, 0, 0, 0, 0, 0, 0, 5, 750, 123]);

    expect(stats.clumpCenters).toBe(5);
    expect(stats.morphology.family).toBe(4);
  });

  it("all family labels share the actual rendered count", () => {
    const labels = RUNTIME_SOURCE.match(/^ {4}const MORPHOLOGY_FAMILY_LABELS = Object\.freeze\((?<labels>\[.*\])\);$/m).groups.labels;

    expect(JSON.parse(labels)).toEqual(["Elliptical galaxy", "Lenticular galaxy", "Spiral galaxy", "Barred spiral galaxy", "Irregular galaxy"]);
    expect(RUNTIME_SOURCE).toContain("function updateGalaxySummary()");
    expect(RUNTIME_SOURCE.split("updateGalaxySummary();").length - 1).toBe(3);
    expect(RUNTIME_SOURCE).toContain(
      '`${MORPHOLOGY_FAMILY_LABELS[morphology.family]} · ${scenePointCount.toLocaleString("en-US")} ${scenePointCount === 1 ? "star" : "stars"}`',
    );
  });
});
