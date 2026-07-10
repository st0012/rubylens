import railsFixture from "./data/rails-art.json";
import rdocFixture from "./data/rdoc-art.json";

export type TargetId = "rails" | "rdoc";
export type StyleId = "galaxy" | "city";
export type VariantId = "a" | "b" | "c";
export type DependencyGranularity = "packages" | "declarations";
export type NamespaceRow = readonly [number, number, 0 | 1, 0 | 1 | 2, number, number, number, number, number, number];
export type PackageRow = readonly [number, 0 | 1 | 2, 0 | 1, number, 0 | 1];
export type DependencyDeclarationRow = readonly [number, number, 0 | 1 | 2, number, number, number, number, number, number];
export type ComponentRoadRow = readonly [number, number, number, number];

export interface CosmosFixture {
  readonly schema: "rubylens.cosmos.v1";
  readonly totals: {
    readonly namespaces: number;
    readonly classes: number;
    readonly modules: number;
    readonly scopes: readonly [number, number, number];
    readonly packages: number;
    readonly dependencyDeclarations: number;
    readonly packageRoles: readonly [number, number, number];
    readonly packageLocations: readonly [number, number];
    readonly constants: number;
    readonly roads: number;
  };
  readonly domains: {
    readonly depth: number;
    readonly sites: number;
    readonly reopens: number;
    readonly reach: number;
    readonly inboundReferences: number;
    readonly members: number;
    readonly packageDefinitions: number;
    readonly dependencyDeclarationDepth: number;
    readonly dependencyDeclarationSites: number;
    readonly dependencyDeclarationReopens: number;
    readonly dependencyDeclarationReach: number;
    readonly dependencyDeclarationReferences: number;
    readonly dependencyDeclarationMembers: number;
    readonly roadConstantReferences: number;
    readonly roadMethodReferences: number;
  };
  readonly componentCounts: readonly number[];
  readonly namespaceNames: readonly string[];
  readonly namespaces: readonly NamespaceRow[];
  readonly packageNames: readonly string[];
  readonly packages: readonly PackageRow[];
  readonly dependencyDeclarations: readonly DependencyDeclarationRow[];
  readonly componentRoads: readonly ComponentRoadRow[];
}

export const fixtures: Record<TargetId, CosmosFixture> = {
  rails: railsFixture as unknown as CosmosFixture,
  rdoc: rdocFixture as unknown as CosmosFixture,
};

export const targetLabels: Record<TargetId, string> = { rails: "Rails", rdoc: "RDoc" };

const viewCopy: Record<StyleId, Record<VariantId, { readonly name: string; readonly sentence: (label: string) => string }>> = {
  galaxy: {
    a: { name: "Concentric Galaxy", sentence: (label) => `${label} core gathers inward, tests counter-sweep around it, and dependencies hold the outer orbit. Mix RubyDex signals independently to decide what makes each star larger, farther out, or brighter.` },
    b: { name: "Binary Galaxy", sentence: (label) => `${label} core and tests form twin stellar systems inside one circumbinary dependency belt.` },
    c: { name: "Triad Galaxy", sentence: (label) => `${label} core, tests, and dependencies balance as three category-sized gravitational masses.` },
  },
  city: {
    a: { name: "Foundation City", sentence: (label) => `${label} ancestry raises the core skyline, tests extend below grade, dependencies seed parks, and resolved constant traffic lays the arterial streets.` },
    b: { name: "Avenue City", sentence: (label) => `${label} components line up as avenue-separated blocks, with an underground test grid and dependency parks breaking the density.` },
    c: { name: "Garden Boroughs", sentence: (label) => `${label} components spread into rotated boroughs above deep test structures, surrounded and punctuated by dependency green space.` },
  },
};

export function copyFor(target: TargetId, style: StyleId, variant: VariantId): { readonly name: string; readonly sentence: string } {
  const copy = viewCopy[style][variant];
  return { name: copy.name, sentence: copy.sentence(targetLabels[target]) };
}

export function canvasLabelFor(target: TargetId, style: StyleId, variant: VariantId): string {
  return `Interactive ${copyFor(target, style, variant).name} art model of the whole ${targetLabels[target]} codebase. Drag to rotate and use a mouse wheel or pinch gesture to zoom.`;
}

export function titleFor(target: TargetId, style: StyleId, variant: VariantId): string {
  return `RubyLens · ${targetLabels[target]} · ${copyFor(target, style, variant).name}`;
}

export function provenanceFor(target: TargetId, style: StyleId = "galaxy", dependencyGranularity: DependencyGranularity = "packages"): string {
  const data = fixtures[target];
  const core = data.totals.scopes[0] + data.totals.scopes[2];
  const dependencyCount = style === "galaxy" && dependencyGranularity === "declarations"
    ? `${data.totals.dependencyDeclarations.toLocaleString("en-GB")} dependency declarations`
    : `${data.totals.packages} dependency packages`;
  const base = `${targetLabels[target]} · ${core.toLocaleString("en-GB")} core · ${data.totals.scopes[1].toLocaleString("en-GB")} tests · ${dependencyCount}`;
  if (style === "city") return `${base} · ${data.totals.roads} constant-reference arterials · method occurrences style roads only`;
  return `${base} · size, orbit, and glow each use independent signal weights · package presence does not prove runtime loading`;
}
