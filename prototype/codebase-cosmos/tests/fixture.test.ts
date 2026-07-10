import { describe, expect, it } from "vitest";
import { canvasLabelFor, fixtures, provenanceFor, titleFor, type TargetId } from "../src/cosmos-data";

const count = (rows: readonly (readonly number[])[], field: number, value: number): number =>
  rows.filter((row) => row[field] === value).length;

const expectations = {
  rails: {
    namespaces: 8051, kinds: [6791, 1260], scopes: [2433, 5528, 90], packages: 230,
    dependencyDeclarations: 105009,
    roles: [12, 76, 142], locations: [13, 217], observed: 214, unobserved: 3, constants: 232,
    depth: 85, reach: 6772, components: [3134, 1455, 1095, 535, 518, 325, 244, 188, 176, 134, 96, 86, 41, 22, 2],
  },
  rdoc: {
    namespaces: 258, kinds: [238, 20], scopes: [138, 120, 0], packages: 35,
    dependencyDeclarations: 42649,
    roles: [4, 9, 22], locations: [0, 35], observed: 35, unobserved: 0, constants: 19,
    depth: 21, reach: 90, components: [73, 39, 34, 27, 24, 23, 16, 11, 11],
  },
} as const;

describe("whole-codebase art fixtures", () => {
  it.each<TargetId>(["rails", "rdoc"])("reconciles the complete %s population", (target) => {
    const data = fixtures[target];
    const expected = expectations[target];
    expect(data.namespaces).toHaveLength(expected.namespaces);
    expect([0, 1].map((kind) => count(data.namespaces, 2, kind))).toEqual(expected.kinds);
    expect([0, 1, 2].map((scope) => count(data.namespaces, 3, scope))).toEqual(expected.scopes);
    expect(data.packages).toHaveLength(expected.packages);
    expect(data.dependencyDeclarations).toHaveLength(expected.dependencyDeclarations);
    expect([0, 1, 2].map((role) => count(data.packages, 1, role))).toEqual(expected.roles);
    expect([0, 1].map((location) => count(data.packages, 2, location))).toEqual(expected.locations);
    expect(data.packages.filter((row) => row[2] === 1 && row[4] === 1)).toHaveLength(expected.observed);
    expect(data.packages.filter((row) => row[2] === 1 && row[4] === 0)).toHaveLength(expected.unobserved);
    expect(data.totals.constants).toBe(expected.constants);
    expect(data.domains.depth).toBe(expected.depth);
    expect(data.domains.reach).toBe(expected.reach);
    expect([...data.componentCounts].sort((a, b) => b - a)).toEqual(expected.components);
    expect(data.componentCounts.reduce((sum, value) => sum + value, 0)).toBe(expected.namespaces);
  });

  it.each<TargetId>(["rails", "rdoc"])("ships only compact anonymous numeric fields for %s", (target) => {
    const data = fixtures[target];
    expect(data.namespaces.every((row) => row.length === 10 && row.every(Number.isFinite) && row[8] >= 0 && row[9] >= 0)).toBe(true);
    expect(data.namespaceNames).toHaveLength(data.namespaces.length);
    expect(data.namespaceNames.every((name) => typeof name === "string" && name.length > 0)).toBe(true);
    expect(Math.max(...data.namespaces.map((row) => row[8]))).toBe(data.domains.inboundReferences);
    expect(Math.max(...data.namespaces.map((row) => row[9]))).toBe(data.domains.members);
    expect(data.domains.inboundReferences).toBeGreaterThan(0);
    expect(data.packages.every((row) => row.length === 5 && row.every(Number.isFinite))).toBe(true);
    expect(data.packageNames).toHaveLength(data.packages.length);
    expect(data.dependencyDeclarations.every((row) => row.length === 9 && row.every(Number.isFinite) && row[1] >= 0 && row[1] < data.packages.length && row[2] >= 0 && row[2] <= 2)).toBe(true);
    expect(new Set(data.namespaces.map((row) => row[0])).size).toBe(data.namespaces.length);
    expect(new Set(data.packages.map((row) => row[0])).size).toBe(data.packages.length);
    expect(JSON.stringify(data)).not.toMatch(/\.rb\b|\/Users\/|gems\/|"(?:path|source|comment)"\s*:/i);
  });

  it("carries RubyDex member counts alongside fully qualified namespace names", () => {
    const data = fixtures.rdoc;
    const index = data.namespaceNames.indexOf("RDoc::RDoc");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(data.namespaces[index]?.[9]).toBe(49);
  });

  it("formats target-aware gallery identity without stale Rails copy", () => {
    expect(canvasLabelFor("rdoc", "city", "b")).toContain("whole RDoc codebase");
    expect(canvasLabelFor("rdoc", "city", "b")).not.toContain("Rails");
    expect(titleFor("rdoc", "city", "b")).toBe("RubyLens · RDoc · Avenue City");
    expect(provenanceFor("rdoc")).toContain("138 core · 120 tests · 35 dependency packages");
    expect(provenanceFor("rdoc", "galaxy", "declarations")).toContain("42,649 dependency declarations");
    expect(provenanceFor("rails", "city", "declarations")).toContain("230 dependency packages");
    expect(provenanceFor("rails", "city", "declarations")).not.toContain("105,009");
  });
});
