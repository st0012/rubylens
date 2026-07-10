export type GalaxyRoleId = "core" | "tests" | "dependencies";
export type GalaxyShape = 0 | 1 | 2;
export type RGB = readonly [number, number, number];
export type GalaxyParameterValue = number | boolean | RGB;

export interface PointStyleParameters {
  readonly perspectiveScale: number;
  readonly perspectiveMin: number;
  readonly perspectiveMax: number;
  readonly pointMinPixelSize: number;
  readonly haloBaseSize: number;
  readonly haloScale: number;
  readonly haloInner: number;
  readonly haloOuter: number;
  readonly haloBaseAlpha: number;
  readonly haloAlphaScale: number;
  readonly edgeAlpha: number;
  readonly lightBase: number;
  readonly lightScale: number;
  readonly coreBoost: number;
  readonly maxPixelSize: number;
  readonly alphaDiscard: number;
}

export interface NamespaceGalaxyParameters extends PointStyleParameters {
  readonly visible: boolean;
  readonly baseColor: RGB;
  readonly hotColor: RGB;
  readonly classShape: GalaxyShape;
  readonly moduleShape: GalaxyShape;
  readonly orbitBase: number;
  readonly depthScale: number;
  readonly depthCurve: number;
  readonly orbitJitter: number;
  readonly angleStep: number;
  readonly anglePhase: number;
  readonly twist: number;
  readonly angleJitter: number;
  readonly verticalOffset: number;
  readonly verticalSpread: number;
  readonly sizeBase: number;
  readonly memberScale: number;
  readonly memberCurve: number;
  readonly descendantBoost: number;
  readonly descendantCurve: number;
  readonly sizeCap: number;
  readonly referenceCurve: number;
  readonly heatCurve: number;
  readonly heatMix: number;
  readonly moduleLift: number;
  readonly sizeMembersWeight: number;
  readonly sizeDescendantsWeight: number;
  readonly sizeReferencesWeight: number;
  readonly sizeDepthWeight: number;
  readonly sizeSitesWeight: number;
  readonly sizeReopensWeight: number;
  readonly orbitMembersWeight: number;
  readonly orbitDescendantsWeight: number;
  readonly orbitReferencesWeight: number;
  readonly orbitDepthWeight: number;
  readonly orbitSitesWeight: number;
  readonly orbitReopensWeight: number;
  readonly emphasisMembersWeight: number;
  readonly emphasisDescendantsWeight: number;
  readonly emphasisReferencesWeight: number;
  readonly emphasisDepthWeight: number;
  readonly emphasisSitesWeight: number;
  readonly emphasisReopensWeight: number;
}

export interface DependencyGalaxyParameters extends PointStyleParameters {
  readonly visible: boolean;
  readonly baseColor: RGB;
  readonly hotColor: RGB;
  readonly directShape: GalaxyShape;
  readonly bundleShape: GalaxyShape;
  readonly transitiveShape: GalaxyShape;
  readonly orbitBase: number;
  readonly roleSpacing: number;
  readonly roleCurve: number;
  readonly orbitJitter: number;
  readonly angleStep: number;
  readonly anglePhase: number;
  readonly angleJitter: number;
  readonly verticalOffset: number;
  readonly verticalSpread: number;
  readonly sizeBase: number;
  readonly definitionScale: number;
  readonly definitionCurve: number;
  readonly sizeCap: number;
  readonly observedBase: number;
  readonly definitionLightScale: number;
  readonly unobservedBase: number;
  readonly locationLift: number;
  readonly definitionHeatCurve: number;
  readonly heatMix: number;
  readonly sizeDefinitionsWeight: number;
  readonly sizeObservedWeight: number;
  readonly sizeDepthWeight: number;
  readonly sizeWorkspaceWeight: number;
  readonly orbitDefinitionsWeight: number;
  readonly orbitObservedWeight: number;
  readonly orbitDepthWeight: number;
  readonly orbitWorkspaceWeight: number;
  readonly emphasisDefinitionsWeight: number;
  readonly emphasisObservedWeight: number;
  readonly emphasisDepthWeight: number;
  readonly emphasisWorkspaceWeight: number;
  readonly declarationSizeMembersWeight: number;
  readonly declarationSizeDescendantsWeight: number;
  readonly declarationSizeReferencesWeight: number;
  readonly declarationSizeDepthWeight: number;
  readonly declarationSizeSitesWeight: number;
  readonly declarationSizeReopensWeight: number;
  readonly declarationOrbitMembersWeight: number;
  readonly declarationOrbitDescendantsWeight: number;
  readonly declarationOrbitReferencesWeight: number;
  readonly declarationOrbitDepthWeight: number;
  readonly declarationOrbitSitesWeight: number;
  readonly declarationOrbitReopensWeight: number;
  readonly declarationEmphasisMembersWeight: number;
  readonly declarationEmphasisDescendantsWeight: number;
  readonly declarationEmphasisReferencesWeight: number;
  readonly declarationEmphasisDepthWeight: number;
  readonly declarationEmphasisSitesWeight: number;
  readonly declarationEmphasisReopensWeight: number;
}

export interface GalaxyParameters {
  readonly core: NamespaceGalaxyParameters;
  readonly tests: NamespaceGalaxyParameters;
  readonly dependencies: DependencyGalaxyParameters;
}

const pointStyleDefaults: PointStyleParameters = {
  perspectiveScale: 145,
  perspectiveMin: 1,
  perspectiveMax: 8,
  pointMinPixelSize: 1.5,
  haloBaseSize: 2,
  haloScale: 9.5,
  haloInner: 0.05,
  haloOuter: 1,
  haloBaseAlpha: 0.025,
  haloAlphaScale: 0.48,
  edgeAlpha: 0.12,
  lightBase: 0.56,
  lightScale: 1,
  coreBoost: 0.34,
  maxPixelSize: 28,
  alphaDiscard: 0.015,
};

export const defaultGalaxyParameters: GalaxyParameters = {
  core: {
    ...pointStyleDefaults,
    visible: true,
    baseColor: [0.96, 0.1, 0.2],
    hotColor: [1, 0.88, 0.7],
    classShape: 0,
    moduleShape: 2,
    orbitBase: 1.2,
    depthScale: 9.4,
    depthCurve: 1,
    orbitJitter: 1.6,
    angleStep: Math.PI * (3 - Math.sqrt(5)),
    anglePhase: 0,
    twist: 0.42,
    angleJitter: 0.16,
    verticalOffset: 0.65,
    verticalSpread: 1.05,
    sizeBase: 1.15,
    memberScale: 5.1,
    memberCurve: 0.72,
    descendantBoost: 0.65,
    descendantCurve: 0.65,
    sizeCap: 10.5,
    referenceCurve: 0.52,
    heatCurve: 0.62,
    heatMix: 0.62,
    moduleLift: 0.05,
    sizeMembersWeight: 0.75,
    sizeDescendantsWeight: 0.25,
    sizeReferencesWeight: 0,
    sizeDepthWeight: 0,
    sizeSitesWeight: 0,
    sizeReopensWeight: 0,
    orbitMembersWeight: 0,
    orbitDescendantsWeight: 0,
    orbitReferencesWeight: 0,
    orbitDepthWeight: 1,
    orbitSitesWeight: 0,
    orbitReopensWeight: 0,
    emphasisMembersWeight: 0,
    emphasisDescendantsWeight: 0,
    emphasisReferencesWeight: 1,
    emphasisDepthWeight: 0,
    emphasisSitesWeight: 0,
    emphasisReopensWeight: 0,
  },
  tests: {
    ...pointStyleDefaults,
    visible: true,
    baseColor: [0.12, 0.68, 1],
    hotColor: [0.86, 0.95, 1],
    classShape: 1,
    moduleShape: 1,
    orbitBase: 13.4,
    depthScale: 5.2,
    depthCurve: 1,
    orbitJitter: 2.2,
    angleStep: Math.PI * (3 - Math.sqrt(5)),
    anglePhase: 0,
    twist: -0.25,
    angleJitter: 0.16,
    verticalOffset: -0.35,
    verticalSpread: 1.9,
    sizeBase: 1.15,
    memberScale: 5.1,
    memberCurve: 0.72,
    descendantBoost: 0.65,
    descendantCurve: 0.65,
    sizeCap: 10.5,
    referenceCurve: 0.52,
    heatCurve: 0.62,
    heatMix: 0.62,
    moduleLift: 0.05,
    sizeMembersWeight: 0.75,
    sizeDescendantsWeight: 0.25,
    sizeReferencesWeight: 0,
    sizeDepthWeight: 0,
    sizeSitesWeight: 0,
    sizeReopensWeight: 0,
    orbitMembersWeight: 0,
    orbitDescendantsWeight: 0,
    orbitReferencesWeight: 0,
    orbitDepthWeight: 1,
    orbitSitesWeight: 0,
    orbitReopensWeight: 0,
    emphasisMembersWeight: 0,
    emphasisDescendantsWeight: 0,
    emphasisReferencesWeight: 1,
    emphasisDepthWeight: 0,
    emphasisSitesWeight: 0,
    emphasisReopensWeight: 0,
  },
  dependencies: {
    ...pointStyleDefaults,
    visible: true,
    baseColor: [1, 0.62, 0.1],
    hotColor: [1, 0.92, 0.7],
    directShape: 0,
    bundleShape: 1,
    transitiveShape: 2,
    orbitBase: 22,
    roleSpacing: 2.2,
    roleCurve: 1,
    orbitJitter: 5.2,
    angleStep: Math.PI * (3 - Math.sqrt(5)),
    anglePhase: 0,
    angleJitter: 0.28,
    verticalOffset: 0,
    verticalSpread: 4.2,
    sizeBase: 3.2,
    definitionScale: 6.5,
    definitionCurve: 1,
    sizeCap: 12,
    observedBase: 0.62,
    definitionLightScale: 0.38,
    unobservedBase: 0.4,
    locationLift: 0.08,
    definitionHeatCurve: 1,
    heatMix: 0.45,
    sizeDefinitionsWeight: 1,
    sizeObservedWeight: 0,
    sizeDepthWeight: 0,
    sizeWorkspaceWeight: 0,
    orbitDefinitionsWeight: 0,
    orbitObservedWeight: 0,
    orbitDepthWeight: 1,
    orbitWorkspaceWeight: 0,
    emphasisDefinitionsWeight: 0.38,
    emphasisObservedWeight: 0.22,
    emphasisDepthWeight: 0,
    emphasisWorkspaceWeight: 0,
    declarationSizeMembersWeight: 0.6,
    declarationSizeDescendantsWeight: 0.25,
    declarationSizeReferencesWeight: 0.15,
    declarationSizeDepthWeight: 0,
    declarationSizeSitesWeight: 0,
    declarationSizeReopensWeight: 0,
    declarationOrbitMembersWeight: 0,
    declarationOrbitDescendantsWeight: 0,
    declarationOrbitReferencesWeight: 0,
    declarationOrbitDepthWeight: 1,
    declarationOrbitSitesWeight: 0,
    declarationOrbitReopensWeight: 0,
    declarationEmphasisMembersWeight: 0,
    declarationEmphasisDescendantsWeight: 0,
    declarationEmphasisReferencesWeight: 1,
    declarationEmphasisDepthWeight: 0,
    declarationEmphasisSitesWeight: 0,
    declarationEmphasisReopensWeight: 0,
  },
};

export interface GalaxyControlSpec {
  readonly key: string;
  readonly label: string;
  readonly kind?: "range" | "color" | "shape" | "toggle";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface GalaxyControlSection {
  readonly label: string;
  readonly controls: readonly GalaxyControlSpec[];
}

const weight = (key: string, label: string): GalaxyControlSpec => ({ key, label, min: 0, max: 1, step: 0.05 });

const namespaceWeightControls = (channel: "size" | "orbit" | "emphasis"): readonly GalaxyControlSpec[] => [
  weight(`${channel}MembersWeight`, "Direct members"),
  weight(`${channel}DescendantsWeight`, "Descendant reach"),
  weight(`${channel}ReferencesWeight`, "Inbound references"),
  weight(`${channel}DepthWeight`, "Ancestor-chain depth"),
  weight(`${channel}SitesWeight`, "Definition sites"),
  weight(`${channel}ReopensWeight`, "Reopen events"),
];

const dependencyWeightControls = (channel: "size" | "orbit" | "emphasis"): readonly GalaxyControlSpec[] => [
  weight(`${channel}DefinitionsWeight`, "Definition volume · RubyDex"),
  weight(`${channel}ObservedWeight`, "Observed presence · RubyDex"),
  weight(`${channel}DepthWeight`, "Dependency depth · Bundler"),
  weight(`${channel}WorkspaceWeight`, "Workspace origin · Bundler"),
];

const namespaceSections: readonly GalaxyControlSection[] = [
  { label: "Star size weights", controls: namespaceWeightControls("size") },
  { label: "Orbit weights", controls: namespaceWeightControls("orbit") },
  { label: "Glow & heat weights", controls: namespaceWeightControls("emphasis") },
];

const dependencySections: readonly GalaxyControlSection[] = [
  { label: "Star size weights", controls: dependencyWeightControls("size") },
  { label: "Orbit weights", controls: dependencyWeightControls("orbit") },
  { label: "Glow & heat weights", controls: dependencyWeightControls("emphasis") },
];

const dependencyDeclarationWeightControls = (channel: "Size" | "Orbit" | "Emphasis"): readonly GalaxyControlSpec[] => [
  weight(`declaration${channel}MembersWeight`, "Direct members"),
  weight(`declaration${channel}DescendantsWeight`, "Descendant reach"),
  weight(`declaration${channel}ReferencesWeight`, "Resolved references"),
  weight(`declaration${channel}DepthWeight`, "Ancestor-chain depth"),
  weight(`declaration${channel}SitesWeight`, "Definition sites"),
  weight(`declaration${channel}ReopensWeight`, "Reopen events"),
];

export const dependencyDeclarationControlSections: readonly GalaxyControlSection[] = [
  { label: "Declaration size weights", controls: dependencyDeclarationWeightControls("Size") },
  { label: "Declaration orbit weights", controls: dependencyDeclarationWeightControls("Orbit") },
  { label: "Declaration glow & heat weights", controls: dependencyDeclarationWeightControls("Emphasis") },
];

export const galaxyControlSections: Record<GalaxyRoleId, readonly GalaxyControlSection[]> = {
  core: namespaceSections,
  tests: namespaceSections,
  dependencies: dependencySections,
};

export function cloneGalaxyParameters(source: GalaxyParameters = defaultGalaxyParameters): GalaxyParameters {
  return {
    core: { ...source.core, baseColor: [...source.core.baseColor], hotColor: [...source.core.hotColor] },
    tests: { ...source.tests, baseColor: [...source.tests.baseColor], hotColor: [...source.tests.hotColor] },
    dependencies: { ...source.dependencies, baseColor: [...source.dependencies.baseColor], hotColor: [...source.dependencies.hotColor] },
  };
}

export function galaxyParameterValue(parameters: GalaxyParameters, role: GalaxyRoleId, key: string): GalaxyParameterValue {
  return (parameters[role] as unknown as Record<string, GalaxyParameterValue>)[key] ?? 0;
}

export function withGalaxyParameter(parameters: GalaxyParameters, role: GalaxyRoleId, key: string, value: GalaxyParameterValue): GalaxyParameters {
  return {
    ...parameters,
    [role]: { ...parameters[role], [key]: value },
  } as GalaxyParameters;
}
