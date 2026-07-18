import { describe, expect, it } from "vitest";
import { loadRuntime } from "./helpers/runtime.mjs";

const runtime = loadRuntime();

describe("dependencySamplingState", () => {
  it("reports only bounded embedded data", () => {
    expect(runtime.dependencySamplingState(100, 100, 3)).toBeNull();
    const bounded = runtime.dependencySamplingState(100, 30, 3);
    expect(bounded.summary).toBe("Dependency stars sampled");
    expect(bounded.countLabel).toBe("30 embedded");
    expect(bounded.note).toContain("embeds 30 of 100 dependency stars");
    expect(bounded.note).toContain("Exact totals across 3 gems remain complete");
  });
});
