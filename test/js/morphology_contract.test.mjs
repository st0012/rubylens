import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRuntime } from "./helpers/runtime.mjs";

// Every row the Ruby classifier emits (test/morphology_contract_fixture_test.rb)
// must decode losslessly — the runtime and the classifier are two
// implementations of one schema, and fallback on a real row means a silently
// wrong galaxy.
const entries = JSON.parse(readFileSync(join(process.cwd(), "test/js/fixtures/morphology_contract.json"), "utf8"));
const runtime = loadRuntime();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

describe("Ruby classifier rows decode losslessly", () => {
  it("covers every family across project and package classifications", () => {
    expect(new Set(entries.map(entry => entry.family)).size).toBe(5);
  });

  for (const entry of entries) {
    it(`decodes ${entry.label} (${entry.designation})`, () => {
      const row = entry.row;
      const decoded = runtime.decodeMorphology(row);
      expect(decoded.family).toBe(entry.family);
      expect(decoded.phaseSeed).toBe(row[9] >>> 0);
      if (row[9] !== 0) expect(decoded.phase).toBe(runtime.fallbackMorphology(row[9]).phase);
      if (entry.family === 0) expect(decoded.ellipticity).toBeCloseTo(clamp(row[1], 0, 700) / 1000, 9);
      if ([1, 2, 3].includes(entry.family)) expect(decoded.bulgeShare).toBeCloseTo(clamp(row[2], 80, 600) / 1000, 9);
      if ([2, 3].includes(entry.family)) {
        expect(decoded.armCount).toBe(clamp(row[3], 2, entry.family === 2 ? 6 : 4));
        expect(decoded.winding).toBeCloseTo(clamp(row[4], 40, 220) / 1000, 9);
        expect(decoded.armFraction).toBeCloseTo(clamp(row[5], 0, 800) / 1000, 9);
      }
      if (entry.family === 3) expect(decoded.barLength).toBeCloseTo(clamp(row[6], 100, 700) / 1000, 9);
      if (entry.family === 4) {
        expect(decoded.clumpCount).toBe(clamp(row[7], 2, 5));
        expect(decoded.clumpSpread).toBeCloseTo(clamp(row[8], 250, 1000) / 1000, 9);
      }
    });
  }
});
