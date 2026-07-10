import { describe, expect, it } from "vitest";
import { compose } from "../src/compositions";
import { fixtures, type StyleId, type TargetId, type VariantId } from "../src/cosmos-data";
import { cloneGalaxyParameters, withGalaxyParameter } from "../src/galaxy-parameters";

const targets: readonly TargetId[] = ["rails", "rdoc"];
const styles: readonly StyleId[] = ["galaxy", "city"];
const variants: readonly VariantId[] = ["a", "b", "c"];
const combinations = targets.flatMap((target) => styles.flatMap((style) => variants.map((variant) => ({ target, style, variant }))));

describe("category compositions", () => {
  it.each(combinations)("builds finite deterministic $target/$style/$variant fields", ({ target, style, variant }) => {
    const first = compose(target, style, variant);
    const second = compose(target, style, variant);
    const data = fixtures[target];
    const expectedCounts = [data.totals.scopes[0] + data.totals.scopes[2], data.totals.scopes[1], data.totals.packages];

    expect(first.fields.map((field) => field.role)).toEqual(["core", "tests", "dependencies"]);
    expect(first.fields.map((field) => field.sizes.length)).toEqual(expectedCounts);
    expect(first.fields.map((field) => field.primitive)).toEqual(Array(3).fill(style === "galaxy" ? "points" : "boxes"));

    first.fields.forEach((field, index) => {
      expect(field.positions).toEqual(second.fields[index]!.positions);
      expect(field.positions.every(Number.isFinite)).toBe(true);
      expect(field.colors.every(Number.isFinite)).toBe(true);
      if (style === "city") expect(field.scales?.every(Number.isFinite)).toBe(true);
    });
  });

  it("changes one Galaxy category without changing the other category fields", () => {
    const defaults = cloneGalaxyParameters();
    const baseline = compose("rdoc", "galaxy", "a", defaults);
    const parameters = withGalaxyParameter(defaults, "core", "sizeReferencesWeight", 1);
    const changed = compose("rdoc", "galaxy", "a", parameters);

    expect(changed.fields[0].sizes).not.toEqual(baseline.fields[0].sizes);
    expect(changed.fields[1].positions).toEqual(baseline.fields[1].positions);
    expect(changed.fields[1].sizes).toEqual(baseline.fields[1].sizes);
    expect(changed.fields[2].positions).toEqual(baseline.fields[2].positions);
    expect(changed.fields[2].sizes).toEqual(baseline.fields[2].sizes);
  });

  it("lets each visual channel mix RubyDex signals independently", () => {
    let members = cloneGalaxyParameters();
    members = withGalaxyParameter(members, "core", "sizeMembersWeight", 1);
    members = withGalaxyParameter(members, "core", "sizeDescendantsWeight", 0);
    let descendants = cloneGalaxyParameters();
    descendants = withGalaxyParameter(descendants, "core", "sizeMembersWeight", 0);
    descendants = withGalaxyParameter(descendants, "core", "sizeDescendantsWeight", 1);

    const memberComposition = compose("rails", "galaxy", "a", members);
    const descendantComposition = compose("rails", "galaxy", "a", descendants);

    expect(memberComposition.fields[0].sizes).not.toEqual(descendantComposition.fields[0].sizes);
    expect(memberComposition.fields[0].positions).toEqual(descendantComposition.fields[0].positions);
    expect(memberComposition.fields[0].luminosities).toEqual(descendantComposition.fields[0].luminosities);
  });

  it.each<TargetId>(targets)("expands %s dependencies into one deterministic declaration point field", (target) => {
    const expanded = compose(target, "galaxy", "a", undefined, "declarations");
    const repeated = compose(target, "galaxy", "a", undefined, "declarations");
    const data = fixtures[target];

    expect(expanded.fields[2].sizes).toHaveLength(data.totals.dependencyDeclarations);
    expect(expanded.fields[2].positions).toEqual(repeated.fields[2].positions);
    expect(expanded.fields[2].positions.every(Number.isFinite)).toBe(true);
    expect(expanded.fields[0].sizes).toHaveLength(data.totals.scopes[0] + data.totals.scopes[2]);
    expect(expanded.fields[1].sizes).toHaveLength(data.totals.scopes[1]);
    expect(expanded.fields[2].labels).toBeUndefined();
    expect(expanded.decorations).toHaveLength(1);
    expect(expanded.decorations?.[0]?.role).toBe("dependency_hubs");
    expect(expanded.decorations?.[0]?.sizes).toHaveLength(data.totals.packages);
    expect(expanded.decorations?.[0]?.labels?.filter(Boolean)).toHaveLength(data.totals.packages);
  });
});
