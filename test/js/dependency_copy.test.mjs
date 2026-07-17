import { describe, expect, it } from "vitest";
import { loadRuntime } from "./helpers/runtime.mjs";

const runtime = loadRuntime();

describe("dependencyCoverageText", () => {
  it("distinguishes complete, sampled, and unavailable rows", () => {
    expect(runtime.dependencyCoverageText(164037, 164037, 164037, 301))
      .toBe("164,037 dependency declarations plotted across 301 gems");
    expect(runtime.dependencyCoverageText(18000, 18000, 164037, 301))
      .toBe("18,000 sampled dependency declarations plotted (of 164,037 across 301 gems)");
    expect(runtime.dependencyCoverageText(1, 1, 1, 1))
      .toBe("1 dependency declaration plotted across 1 gem");
    expect(runtime.dependencyCoverageText(0, 164037, 164037, 301, true))
      .toBe("WebGL2 is required to plot 164,037 dependency declarations across 301 gems");
    expect(runtime.dependencyCoverageText(0, 18000, 42592, 35, true))
      .toBe("WebGL2 is required to plot this report's 18,000 sampled dependency declarations (of 42,592 across 35 gems)");
  });
});

describe("dependencySamplingState", () => {
  it("reports only bounded embedded data", () => {
    expect(runtime.dependencySamplingState(100, 100, 3)).toBeNull();
    const bounded = runtime.dependencySamplingState(100, 30, 3);
    expect(bounded.summary).toBe("Dependency sampling");
    expect(bounded.countLabel).toBe("30 embedded");
    expect(bounded.note).toContain("embeds 30 sampled dependency declarations of 100");
    expect(bounded.note).toContain("Exact totals across 3 gems remain complete");
  });
});
