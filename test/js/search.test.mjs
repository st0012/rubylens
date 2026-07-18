import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

function modelWithNames(names) {
  const row = seed => [seed, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0];
  return minimalModel({
    totals: { namespaces: names.length, packages: 0, dependencyStars: 0, renderedDependencyStars: 0 },
    namespaceNames: names,
    namespaces: names.map((_, index) => row(index + 1)),
  });
}

describe("searchRenderedPoints", () => {
  it("ranks exact, prefix, word-boundary, then substring matches", () => {
    const runtime = loadRuntime(modelWithNames([
      "Widget::User", "User", "UserRecord", "PowerUser", "Confuserator",
    ]));
    const names = runtime.searchRenderedPoints("user").map(index => runtime.interactivePoints[index].name);
    expect(names).toEqual(["User", "UserRecord", "Widget::User", "PowerUser", "Confuserator"]);
  });

  it("caps each rank bucket at the result limit", () => {
    const runtime = loadRuntime(modelWithNames(
      Array.from({ length: 40 }, (_, index) => `Match::Item${String(index).padStart(2, "0")}`),
    ));
    expect(runtime.searchRenderedPoints("item")).toHaveLength(24);
  });

  it("finds nothing for absent terms and searches case-insensitively", () => {
    const runtime = loadRuntime(modelWithNames(["Alpha::Beta"]));
    expect(runtime.searchRenderedPoints("gamma")).toEqual([]);
    expect(runtime.searchRenderedPoints("beta")).toHaveLength(1);
  });
});
