import {
  fixtures,
  type CosmosFixture,
  type DependencyDeclarationRow,
  type DependencyGranularity,
  type NamespaceRow,
  type PackageRow,
  type StyleId,
  type TargetId,
  type VariantId,
} from "./cosmos-data";
import {
  defaultGalaxyParameters,
  type GalaxyParameters,
  type NamespaceGalaxyParameters,
  type PointStyleParameters,
} from "./galaxy-parameters";

export type RoleId = "core" | "tests" | "dependencies";
export type FieldId = RoleId | "dependency_hubs" | "foundations" | "roads" | "road_markings";

export interface RoleField {
  readonly role: FieldId;
  readonly primitive: "points" | "boxes";
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly sizes: Float32Array;
  readonly luminosities: Float32Array;
  readonly shapes: Float32Array;
  readonly labels?: string[];
  readonly pointStyle?: PointStyleParameters;
  readonly visible?: boolean;
  readonly scales?: Float32Array;
  readonly rotations?: Float32Array;
}

export interface Composition {
  readonly target: TargetId;
  readonly style: StyleId;
  readonly variant: VariantId;
  readonly fields: readonly [RoleField, RoleField, RoleField];
  readonly decorations?: readonly RoleField[];
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
function random(seed: number, channel: number): number {
  let value = (seed ^ channel) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

const signed = (seed: number, channel: number): number => random(seed, channel) * 2 - 1;
const normalizedLog = (value: number, maximum: number): number => maximum === 0 ? 0 : Math.log1p(value) / Math.log1p(maximum);

function writePoint(target: Float32Array, index: number, x: number, y: number, z: number): void {
  const offset = index * 3;
  target[offset] = x;
  target[offset + 1] = y;
  target[offset + 2] = z;
}

function writeColor(target: Float32Array, index: number, color: readonly number[], lift = 0): void {
  const offset = index * 3;
  target[offset] = Math.min(1, color[0]! + lift);
  target[offset + 1] = Math.min(1, color[1]! + lift);
  target[offset + 2] = Math.min(1, color[2]! + lift);
}

function makeField(role: FieldId, primitive: "points" | "boxes", count: number, pointStyle?: PointStyleParameters, visible = true, withLabels = true): RoleField {
  return {
    role,
    primitive,
    positions: new Float32Array(count * 3),
    colors: new Float32Array(count * 3),
    sizes: new Float32Array(count),
    luminosities: new Float32Array(count),
    shapes: new Float32Array(count),
    ...(pointStyle ? { pointStyle } : {}),
    visible,
    ...(primitive === "points" && withLabels ? { labels: new Array<string>(count).fill("") } : {}),
    ...(primitive === "boxes" ? {
      scales: new Float32Array(count * 3),
      rotations: new Float32Array(count),
    } : {}),
  };
}

function splitNamespaces(data: CosmosFixture): { core: NamespaceRow[]; tests: NamespaceRow[] } {
  const core: NamespaceRow[] = [];
  const tests: NamespaceRow[] = [];
  for (const row of data.namespaces) (row[3] === 1 ? tests : core).push(row);
  return { core, tests };
}

interface NamespaceSignals {
  readonly depth: number;
  readonly sites: number;
  readonly reopens: number;
  readonly descendants: number;
  readonly references: number;
  readonly members: number;
  readonly volume: number;
  readonly light: number;
}

function namespaceSignals(row: NamespaceRow, data: CosmosFixture): NamespaceSignals {
  const depth = normalizedLog(row[4], data.domains.depth);
  const sites = normalizedLog(row[5], data.domains.sites);
  const reopens = normalizedLog(row[6], data.domains.reopens);
  const descendants = normalizedLog(row[7], data.domains.reach);
  const references = normalizedLog(row[8], data.domains.inboundReferences);
  const members = normalizedLog(row[9], data.domains.members);
  return { depth, sites, reopens, descendants, references, members, volume: sites * 0.62 + descendants * 0.38, light: 0.42 + reopens * 0.28 + descendants * 0.3 };
}

export type GalaxySignalChannel = "size" | "orbit" | "emphasis";

function clampSignal(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function namespaceWeightedSignal(signal: NamespaceSignals, parameters: NamespaceGalaxyParameters, channel: GalaxySignalChannel): number {
  const weights = channel === "size"
    ? [parameters.sizeMembersWeight, parameters.sizeDescendantsWeight, parameters.sizeReferencesWeight, parameters.sizeDepthWeight, parameters.sizeSitesWeight, parameters.sizeReopensWeight]
    : channel === "orbit"
      ? [parameters.orbitMembersWeight, parameters.orbitDescendantsWeight, parameters.orbitReferencesWeight, parameters.orbitDepthWeight, parameters.orbitSitesWeight, parameters.orbitReopensWeight]
      : [parameters.emphasisMembersWeight, parameters.emphasisDescendantsWeight, parameters.emphasisReferencesWeight, parameters.emphasisDepthWeight, parameters.emphasisSitesWeight, parameters.emphasisReopensWeight];
  return clampSignal(
    signal.members * weights[0]!
      + signal.descendants * weights[1]!
      + signal.references * weights[2]!
      + signal.depth * weights[3]!
      + signal.sites * weights[4]!
      + signal.reopens * weights[5]!,
  );
}

interface DependencySignals {
  readonly definitions: number;
  readonly observed: number;
  readonly depth: number;
  readonly workspace: number;
}

function dependencyWeightedSignal(signal: DependencySignals, parameters: GalaxyParameters["dependencies"], channel: GalaxySignalChannel): number {
  const weights = channel === "size"
    ? [parameters.sizeDefinitionsWeight, parameters.sizeObservedWeight, parameters.sizeDepthWeight, parameters.sizeWorkspaceWeight]
    : channel === "orbit"
      ? [parameters.orbitDefinitionsWeight, parameters.orbitObservedWeight, parameters.orbitDepthWeight, parameters.orbitWorkspaceWeight]
      : [parameters.emphasisDefinitionsWeight, parameters.emphasisObservedWeight, parameters.emphasisDepthWeight, parameters.emphasisWorkspaceWeight];
  return clampSignal(
    signal.definitions * weights[0]!
      + signal.observed * weights[1]!
      + signal.depth * weights[2]!
      + signal.workspace * weights[3]!,
  );
}

interface DependencyDeclarationSignals {
  readonly depth: number;
  readonly sites: number;
  readonly reopens: number;
  readonly descendants: number;
  readonly references: number;
  readonly members: number;
}

function dependencyDeclarationSignals(row: DependencyDeclarationRow, data: CosmosFixture): DependencyDeclarationSignals {
  return {
    depth: normalizedLog(row[3], data.domains.dependencyDeclarationDepth),
    sites: normalizedLog(row[4], data.domains.dependencyDeclarationSites),
    reopens: normalizedLog(row[5], data.domains.dependencyDeclarationReopens),
    descendants: normalizedLog(row[6], data.domains.dependencyDeclarationReach),
    references: normalizedLog(row[7], data.domains.dependencyDeclarationReferences),
    members: normalizedLog(row[8], data.domains.dependencyDeclarationMembers),
  };
}

function dependencyDeclarationWeightedSignal(signal: DependencyDeclarationSignals, parameters: GalaxyParameters["dependencies"], channel: GalaxySignalChannel): number {
  const weights = channel === "size"
    ? [parameters.declarationSizeMembersWeight, parameters.declarationSizeDescendantsWeight, parameters.declarationSizeReferencesWeight, parameters.declarationSizeDepthWeight, parameters.declarationSizeSitesWeight, parameters.declarationSizeReopensWeight]
    : channel === "orbit"
      ? [parameters.declarationOrbitMembersWeight, parameters.declarationOrbitDescendantsWeight, parameters.declarationOrbitReferencesWeight, parameters.declarationOrbitDepthWeight, parameters.declarationOrbitSitesWeight, parameters.declarationOrbitReopensWeight]
      : [parameters.declarationEmphasisMembersWeight, parameters.declarationEmphasisDescendantsWeight, parameters.declarationEmphasisReferencesWeight, parameters.declarationEmphasisDepthWeight, parameters.declarationEmphasisSitesWeight, parameters.declarationEmphasisReopensWeight];
  return clampSignal(
    signal.members * weights[0]!
      + signal.descendants * weights[1]!
      + signal.references * weights[2]!
      + signal.depth * weights[3]!
      + signal.sites * weights[4]!
      + signal.reopens * weights[5]!,
  );
}

function galaxyStarColor(kind: 0 | 1, references: number, parameters: NamespaceGalaxyParameters): readonly [number, number, number] {
  const base = parameters.baseColor;
  const hot = parameters.hotColor;
  const heat = Math.pow(references, parameters.heatCurve) * parameters.heatMix;
  const moduleLift = kind === 1 ? parameters.moduleLift : 0;
  return [
    Math.min(1, base[0] * (1 - heat) + hot[0] * heat + moduleLift),
    Math.min(1, base[1] * (1 - heat) + hot[1] * heat + moduleLift),
    Math.min(1, base[2] * (1 - heat) + hot[2] * heat + moduleLift),
  ];
}

function fillGalaxyNamespaces(field: RoleField, rows: readonly NamespaceRow[], data: CosmosFixture, variant: VariantId, parameters: NamespaceGalaxyParameters): void {
  const role = field.role as RoleId;
  const nameBySeed = new Map(data.namespaces.map((row, index) => [row[0], data.namespaceNames[index]!]));
  rows.forEach((row, index) => {
    const seed = row[0];
    const signal = namespaceSignals(row, data);
    const orbitSignal = namespaceWeightedSignal(signal, parameters, "orbit");
    const sizeSignal = namespaceWeightedSignal(signal, parameters, "size");
    const emphasisSignal = namespaceWeightedSignal(signal, parameters, "emphasis");
    let x = 0;
    let y = 0;
    let z = 0;

    if (variant === "a") {
      const radius = parameters.orbitBase + Math.pow(orbitSignal, parameters.depthCurve) * parameters.depthScale + random(seed, role === "core" ? 11 : 12) * parameters.orbitJitter;
      const angle = index * parameters.angleStep + parameters.anglePhase + radius * parameters.twist + signed(seed, 13) * parameters.angleJitter;
      x = Math.cos(angle) * radius;
      y = parameters.verticalOffset + signed(seed, 14) * parameters.verticalSpread;
      z = Math.sin(angle) * radius;
    } else if (variant === "b") {
      const center = role === "core" ? -8.2 : 8.2;
      const radius = 0.8 + orbitSignal * 6.6 + random(seed, 21) * 1.2;
      const angle = index * GOLDEN_ANGLE + radius * (role === "core" ? 0.48 : -0.48);
      x = center + Math.cos(angle) * radius;
      y = signed(seed, 22) * 0.85;
      z = Math.sin(angle) * radius;
    } else {
      const centerAngle = role === "core" ? -Math.PI / 2 : Math.PI / 6;
      const centerX = Math.cos(centerAngle) * 9.5;
      const centerZ = Math.sin(centerAngle) * 9.5;
      const radius = 0.5 + Math.pow(random(seed, 31), 0.58) * (4.2 + orbitSignal * 2.1);
      const angle = index * GOLDEN_ANGLE + signed(seed, 32) * 0.2;
      x = centerX + Math.cos(angle) * radius;
      y = signed(seed, 33) * (1.2 + orbitSignal * 1.4);
      z = centerZ + Math.sin(angle) * radius;
    }

    writePoint(field.positions, index, x, y, z);
    writeColor(field.colors, index, galaxyStarColor(row[2], emphasisSignal, parameters));
    field.sizes[index] = parameters.sizeBase + (parameters.sizeCap - parameters.sizeBase) * Math.pow(sizeSignal, parameters.memberCurve);
    field.luminosities[index] = Math.pow(emphasisSignal, parameters.referenceCurve);
    field.shapes[index] = row[2] === 1 ? parameters.moduleShape : parameters.classShape;
    if (field.labels) field.labels[index] = nameBySeed.get(seed) ?? "";
  });
}

interface DependencyPackageAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly angle: number;
}

interface DependencySystem extends DependencyPackageAnchor {
  readonly radius: number;
  readonly count: number;
}

function dependencyPackageAnchor(
  row: PackageRow,
  index: number,
  variant: VariantId,
  parameters: GalaxyParameters["dependencies"],
  orbitSignal: number,
): DependencyPackageAnchor {
  const seed = row[0];
  if (variant === "a" || variant === "b") {
    const radialSpread = variant === "a" ? random(seed, 41) * parameters.orbitJitter : signed(seed, 41) * parameters.orbitJitter;
    const radius = (variant === "a" ? parameters.orbitBase : 21) + Math.pow(orbitSignal, parameters.roleCurve) * parameters.roleSpacing * 2 + radialSpread;
    const angle = index * parameters.angleStep + parameters.anglePhase + random(seed, 42) * parameters.angleJitter;
    return {
      x: Math.cos(angle) * radius,
      y: parameters.verticalOffset + signed(seed, 43) * (variant === "a" ? parameters.verticalSpread : 1.8),
      z: Math.sin(angle) * radius,
      angle,
    };
  }
  const centerAngle = Math.PI * 5 / 6;
  const centerX = Math.cos(centerAngle) * 9.5;
  const centerZ = Math.sin(centerAngle) * 9.5;
  const radius = 0.6 + Math.pow(random(seed, 44), 0.62) * (4.2 + orbitSignal * 2);
  const angle = index * GOLDEN_ANGLE;
  const x = centerX + Math.cos(angle) * radius;
  const z = centerZ + Math.sin(angle) * radius;
  return { x, y: signed(seed, 45) * 2.4, z, angle: Math.atan2(z, x) };
}

function dependencySystemLayout(
  data: CosmosFixture,
  variant: VariantId,
  parameters: GalaxyParameters["dependencies"],
): readonly DependencySystem[] {
  const counts = new Uint32Array(data.packages.length);
  for (const row of data.dependencyDeclarations) counts[row[1]] = (counts[row[1]] ?? 0) + 1;
  const radiusFor = (count: number): number => Math.max(0.65, Math.min(3.35, 0.55 + 0.027 * Math.sqrt(count)));
  const systems: DependencySystem[] = new Array(data.packages.length);

  if (variant !== "a") {
    data.packages.forEach((row, index) => {
      const signals: DependencySignals = {
        definitions: normalizedLog(row[3], data.domains.packageDefinitions),
        observed: row[4],
        depth: row[1] / 2,
        workspace: row[2] === 0 ? 1 : 0,
      };
      const anchor = dependencyPackageAnchor(row, index, variant, parameters, dependencyWeightedSignal(signals, parameters, "orbit"));
      systems[index] = { ...anchor, radius: radiusFor(counts[index] ?? 0), count: counts[index] ?? 0 };
    });
    return systems;
  }

  for (const role of [0, 1, 2] as const) {
    const shellRadius = 26 + role * 8.5;
    const items = data.packages.map((row, index) => ({ index, row, radius: radiusFor(counts[index] ?? 0) })).filter((item) => item.row[1] === role);
    const requiredArc = items.reduce((sum, item) => sum + item.radius * 2 + 0.55, 0);
    const laneCount = Math.max(1, Math.ceil(requiredArc / (TAU * shellRadius)));
    const lanes = Array.from({ length: laneCount }, () => ({ items: [] as typeof items, arc: 0 }));
    for (const item of [...items].sort((left, right) => right.radius - left.radius || left.index - right.index)) {
      const lane = lanes.reduce((shortest, candidate) => candidate.arc < shortest.arc ? candidate : shortest);
      lane.items.push(item);
      lane.arc += item.radius * 2 + 0.55;
    }
    lanes.forEach((lane, laneIndex) => {
      const ordered = lane.items.sort((left, right) => left.index - right.index);
      const slack = ordered.length === 0 ? 0 : Math.max(0, (TAU * shellRadius - lane.arc) / ordered.length);
      const laneMaxRadius = ordered.reduce((maximum, item) => Math.max(maximum, item.radius), 0.65);
      const laneY = (laneIndex - (laneCount - 1) / 2) * (laneMaxRadius * 2 + 0.65);
      let cursor = 0;
      for (const item of ordered) {
        const angle = role * 0.82 + (cursor + item.radius + slack * 0.5) / shellRadius;
        const radialOffset = signed(item.row[0], 41) * 0.28;
        const radius = shellRadius + radialOffset;
        systems[item.index] = {
          x: Math.cos(angle) * radius,
          y: laneY + signed(item.row[0], 43) * 0.28,
          z: Math.sin(angle) * radius,
          angle,
          radius: item.radius,
          count: counts[item.index] ?? 0,
        };
        cursor += item.radius * 2 + 0.55 + slack;
      }
    });
  }
  return systems;
}

function fillGalaxyDependencies(field: RoleField, rows: readonly PackageRow[], data: CosmosFixture, variant: VariantId, parameters: GalaxyParameters["dependencies"]): void {
  rows.forEach((row, index) => {
    const [, role, location, definitions, observed] = row;
    const volume = normalizedLog(definitions, data.domains.packageDefinitions);
    const signals: DependencySignals = {
      definitions: volume,
      observed,
      depth: role / 2,
      workspace: location === 0 ? 1 : 0,
    };
    const orbitSignal = dependencyWeightedSignal(signals, parameters, "orbit");
    const sizeSignal = dependencyWeightedSignal(signals, parameters, "size");
    const emphasisSignal = dependencyWeightedSignal(signals, parameters, "emphasis");
    const anchor = dependencyPackageAnchor(row, index, variant, parameters, orbitSignal);
    writePoint(field.positions, index, anchor.x, anchor.y, anchor.z);
    const heat = Math.pow(emphasisSignal, parameters.definitionHeatCurve) * parameters.heatMix;
    const color: readonly [number, number, number] = [
      parameters.baseColor[0] * (1 - heat) + parameters.hotColor[0] * heat,
      parameters.baseColor[1] * (1 - heat) + parameters.hotColor[1] * heat,
      parameters.baseColor[2] * (1 - heat) + parameters.hotColor[2] * heat,
    ];
    writeColor(field.colors, index, color, location === 0 ? parameters.locationLift : 0);
    field.sizes[index] = Math.min(parameters.sizeCap, parameters.sizeBase + Math.pow(sizeSignal, parameters.definitionCurve) * parameters.definitionScale);
    field.luminosities[index] = clampSignal(parameters.unobservedBase + emphasisSignal);
    field.shapes[index] = role === 0 ? parameters.directShape : role === 1 ? parameters.bundleShape : parameters.transitiveShape;
    if (field.labels) field.labels[index] = data.packageNames[index] ?? "";
  });
}

function dependencyDeclarationPointStyle(parameters: GalaxyParameters["dependencies"]): PointStyleParameters {
  return {
    ...parameters,
    pointMinPixelSize: 0.7,
    haloBaseSize: 0.35,
    haloScale: 3.8,
    haloBaseAlpha: 0.008,
    haloAlphaScale: 0.22,
    edgeAlpha: 0.08,
    lightBase: 0.42,
    lightScale: 0.82,
    coreBoost: 0.18,
    maxPixelSize: 12,
  };
}

function fillGalaxyDependencyDeclarations(
  field: RoleField,
  rows: readonly DependencyDeclarationRow[],
  data: CosmosFixture,
  variant: VariantId,
  parameters: GalaxyParameters["dependencies"],
  channel?: GalaxySignalChannel,
): void {
  const updateOrbit = channel === undefined || channel === "orbit";
  const updateSize = channel === undefined || channel === "size";
  const updateEmphasis = channel === undefined || channel === "emphasis";
  const systems = updateOrbit ? dependencySystemLayout(data, variant, parameters) : null;
  const packageSeen = updateOrbit ? new Uint32Array(data.packages.length) : null;

  rows.forEach((row, index) => {
    const [seed, packageIndex, kind] = row;
    const signals = dependencyDeclarationSignals(row, data);
    if (updateOrbit && systems && packageSeen) {
      const packageRow = data.packages[packageIndex]!;
      const system = systems[packageIndex]!;
      const count = Math.max(1, system.count);
      const ordinal = packageSeen[packageIndex] ?? 0;
      packageSeen[packageIndex] = ordinal + 1;
      const orbitSignal = dependencyDeclarationWeightedSignal(signals, parameters, "orbit");
      const progress = Math.sqrt((ordinal + 0.5) / count);
      const spiralAngle = ordinal * GOLDEN_ANGLE + progress * (2.4 + random(packageRow[0], 47) * 1.8) + signed(seed, 46) * 0.12;
      const localRadius = system.radius * Math.min(0.96, 0.12 + progress * 0.38 + orbitSignal * 0.46);
      const tiltDirection = random(packageRow[0], 48) < 0.5 ? -1 : 1;
      const tilt = tiltDirection * (0.18 + random(packageRow[0], 50) * 0.42);
      const cosAnchor = Math.cos(system.angle);
      const sinAnchor = Math.sin(system.angle);
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);
      const uX = -sinAnchor;
      const uZ = cosAnchor;
      const vX = cosAnchor * cosTilt;
      const vY = sinTilt;
      const vZ = sinAnchor * cosTilt;
      const normalX = -cosAnchor * sinTilt;
      const normalY = cosTilt;
      const normalZ = -sinAnchor * sinTilt;
      const diskX = Math.cos(spiralAngle) * localRadius;
      const diskY = Math.sin(spiralAngle) * localRadius;
      const thickness = signed(seed, 49) * Math.min(0.06, Math.max(0.025, system.radius * 0.035));
      const x = system.x + uX * diskX + vX * diskY + normalX * thickness;
      const y = system.y + vY * diskY + normalY * thickness;
      const z = system.z + uZ * diskX + vZ * diskY + normalZ * thickness;
      writePoint(field.positions, index, x, y, z);
    }
    if (updateSize) {
      const sizeSignal = dependencyDeclarationWeightedSignal(signals, parameters, "size");
      field.sizes[index] = 0.38 + Math.pow(sizeSignal, 0.72) * 2.4;
    }
    if (updateEmphasis) {
      const emphasisSignal = dependencyDeclarationWeightedSignal(signals, parameters, "emphasis");
      const heat = Math.pow(emphasisSignal, parameters.definitionHeatCurve) * parameters.heatMix;
      writeColor(field.colors, index, [
        parameters.baseColor[0] * (1 - heat) + parameters.hotColor[0] * heat,
        parameters.baseColor[1] * (1 - heat) + parameters.hotColor[1] * heat,
        parameters.baseColor[2] * (1 - heat) + parameters.hotColor[2] * heat,
      ]);
      field.luminosities[index] = Math.pow(emphasisSignal, 0.52);
    }
    if (channel === undefined) field.shapes[index] = kind === 0 ? 0 : kind === 1 ? 2 : 1;
  });
}

interface PackItem {
  readonly index: number;
  readonly width: number;
  readonly depth: number;
  readonly seed: number;
}

interface PackedRect extends PackItem {
  readonly x: number;
  readonly z: number;
}

interface PackedLayout {
  readonly items: readonly PackedRect[];
  readonly width: number;
  readonly depth: number;
}

interface District {
  readonly component: number;
  readonly core: PackedLayout;
  readonly tests: PackedLayout;
  readonly width: number;
  readonly depth: number;
  centerX: number;
  centerZ: number;
  rotation: number;
}

function packRectangles(items: readonly PackItem[], gap: number, widthBias = 1.16): PackedLayout {
  if (items.length === 0) return { items: [], width: 0, depth: 0 };
  const ordered = [...items].sort((left, right) =>
    right.depth - left.depth || right.width - left.width || left.seed - right.seed || left.index - right.index,
  );
  const area = ordered.reduce((sum, item) => sum + (item.width + gap) * (item.depth + gap), 0);
  const targetWidth = Math.max(...ordered.map((item) => item.width), Math.sqrt(area) * widthBias);
  const placed: Array<PackedRect> = [];
  let cursorX = 0;
  let cursorZ = 0;
  let rowDepth = 0;
  let usedWidth = 0;

  for (const item of ordered) {
    if (cursorX > 0 && cursorX + item.width > targetWidth) {
      cursorZ += rowDepth + gap;
      cursorX = 0;
      rowDepth = 0;
    }
    placed.push({ ...item, x: cursorX + item.width / 2, z: cursorZ + item.depth / 2 });
    cursorX += item.width + gap;
    rowDepth = Math.max(rowDepth, item.depth);
    usedWidth = Math.max(usedWidth, cursorX - gap);
  }

  const usedDepth = cursorZ + rowDepth;
  return {
    items: placed.map((item) => ({ ...item, x: item.x - usedWidth / 2, z: item.z - usedDepth / 2 })),
    width: usedWidth,
    depth: usedDepth,
  };
}

function namespaceFootprint(row: NamespaceRow, data: CosmosFixture, role: "core" | "tests", variant: VariantId): readonly [number, number] {
  const sites = normalizedLog(row[5], data.domains.sites);
  const baseArea = (role === "core" ? 0.13 : 0.095) + sites * (role === "core" ? 0.28 : 0.18);
  const channel = variant === "a" ? 510 : variant === "b" ? 520 : 530;
  const area = baseArea * (0.82 + random(row[0], channel) * 0.38);
  const aspect = 0.62 + random(row[0], channel + 1) * 0.84;
  return [Math.max(0.2, Math.sqrt(area * aspect)), Math.max(0.2, Math.sqrt(area / aspect))];
}

function rotateLocal(x: number, z: number, rotation: number): readonly [number, number] {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return [x * cosine - z * sine, x * sine + z * cosine];
}

function buildDistricts(coreRows: readonly NamespaceRow[], testRows: readonly NamespaceRow[], data: CosmosFixture, variant: VariantId): District[] {
  const count = data.componentCounts.length;
  const coreGroups = Array.from({ length: count }, () => [] as PackItem[]);
  const testGroups = Array.from({ length: count }, () => [] as PackItem[]);
  coreRows.forEach((row, index) => {
    const [width, depth] = namespaceFootprint(row, data, "core", variant);
    coreGroups[row[1]]!.push({ index, width, depth, seed: row[0] });
  });
  testRows.forEach((row, index) => {
    const [width, depth] = namespaceFootprint(row, data, "tests", variant);
    testGroups[row[1]]!.push({ index, width, depth, seed: row[0] });
  });

  const districts = Array.from({ length: count }, (_, component) => {
    const core = packRectangles(coreGroups[component]!, 0.2);
    const tests = packRectangles(testGroups[component]!, 0.14, 1.05);
    return {
      component,
      core,
      tests,
      width: Math.max(1.8, core.width, tests.width) + 0.9,
      depth: Math.max(1.8, core.depth, tests.depth) + 0.9,
      centerX: 0,
      centerZ: 0,
      rotation: 0,
    };
  });

  if (variant === "a") {
    const packed = packRectangles(districts.map((district) => ({
      index: district.component,
      width: district.width,
      depth: district.depth,
      seed: Math.imul(district.component + 1, 0x9e3779b1) >>> 0,
    })), 2.7, 1.08);
    for (const item of packed.items) {
      districts[item.index]!.centerX = item.x;
      districts[item.index]!.centerZ = item.z;
    }
  } else if (variant === "b") {
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const cellWidth = Math.max(...districts.map((district) => district.width)) + 2.8;
    const cellDepth = Math.max(...districts.map((district) => district.depth)) + 2.8;
    districts.forEach((district, index) => {
      district.centerX = ((index % columns) - (columns - 1) / 2) * cellWidth;
      district.centerZ = (Math.floor(index / columns) - (rows - 1) / 2) * cellDepth;
    });
  } else {
    const maxExtent = Math.max(...districts.map((district) => Math.max(district.width, district.depth)));
    const step = maxExtent * 0.66 + 2.4;
    districts.forEach((district, index) => {
      const radius = index === 0 ? 0 : Math.sqrt(index) * step;
      const angle = index * GOLDEN_ANGLE;
      district.centerX = Math.cos(angle) * radius;
      district.centerZ = Math.sin(angle) * radius;
      district.rotation = signed(Math.imul(index + 1, 0x85ebca6b), 531) * 0.16;
    });
  }

  return districts;
}

function cityCoreColor(row: NamespaceRow, data: CosmosFixture): readonly [number, number, number] {
  const heat = normalizedLog(row[6], data.domains.reopens);
  return [1, 0.72 - heat * 0.48, 0.1 + heat * 0.02];
}

function fillCityBuildings(field: RoleField, rows: readonly NamespaceRow[], data: CosmosFixture, districts: readonly District[]): void {
  const placements = new Map<number, { x: number; z: number; rotation: number; width: number; depth: number }>();
  for (const district of districts) {
    for (const item of district.core.items) {
      const [localX, localZ] = rotateLocal(item.x, item.z, district.rotation);
      placements.set(item.index, {
        x: district.centerX + localX,
        z: district.centerZ + localZ,
        rotation: district.rotation,
        width: item.width,
        depth: item.depth,
      });
    }
  }

  rows.forEach((row, index) => {
    const placement = placements.get(index)!;
    const ancestry = data.domains.depth === 0 ? 0 : Math.min(1, row[4] / data.domains.depth);
    const height = 0.85 + Math.pow(ancestry, 0.58) * 13.5;
    writePoint(field.positions, index, placement.x, height / 2, placement.z);
    writePoint(field.scales!, index, placement.width, height, placement.depth);
    writeColor(field.colors, index, cityCoreColor(row, data));
    field.sizes[index] = height;
    field.luminosities[index] = 0.58 + ancestry * 0.42;
    field.shapes[index] = 0;
    field.rotations![index] = placement.rotation + signed(row[0], 541) * 0.055;
  });
}

function fillUndergroundTests(field: RoleField, rows: readonly NamespaceRow[], data: CosmosFixture, districts: readonly District[], variant: VariantId): void {
  const placements = new Map<number, { x: number; z: number; rotation: number }>();
  for (const district of districts) {
    for (const item of district.tests.items) {
      const [localX, localZ] = rotateLocal(item.x, item.z, district.rotation);
      placements.set(item.index, { x: district.centerX + localX, z: district.centerZ + localZ, rotation: district.rotation });
    }
  }
  const depthScale = variant === "a" ? 4.8 : variant === "b" ? 6.1 : 7.2;

  rows.forEach((row, index) => {
    const placement = placements.get(index)!;
    const ancestry = data.domains.depth === 0 ? 0 : Math.min(1, row[4] / data.domains.depth);
    const undergroundDepth = 0.7 + Math.pow(ancestry, 0.62) * depthScale;
    const [width, depth] = namespaceFootprint(row, data, "tests", variant);
    writePoint(field.positions, index, placement.x, 0.08 - undergroundDepth / 2, placement.z);
    writePoint(field.scales!, index, width, undergroundDepth, depth);
    writeColor(field.colors, index, [0.08, 0.58 + random(row[0], 551) * 0.22, 1]);
    field.sizes[index] = undergroundDepth;
    field.luminosities[index] = 0.68 + ancestry * 0.32;
    field.shapes[index] = 1;
    field.rotations![index] = placement.rotation + signed(row[0], 552) * 0.04;
  });
}

function fillFoundations(field: RoleField, districts: readonly District[]): void {
  districts.forEach((district, index) => {
    const height = 0.24 + Math.min(0.22, Math.log1p(district.core.items.length + district.tests.items.length) * 0.025);
    writePoint(field.positions, index, district.centerX, -height / 2, district.centerZ);
    writePoint(field.scales!, index, district.width, height, district.depth);
    const shade = 0.34 - (index % 5) * 0.018;
    writeColor(field.colors, index, [shade, shade + 0.018, shade + 0.04]);
    field.sizes[index] = height;
    field.luminosities[index] = 0.4;
    field.shapes[index] = 0;
    field.rotations![index] = district.rotation;
  });
}

function districtEdgePoint(source: District, target: District): readonly [number, number] {
  const dx = target.centerX - source.centerX;
  const dz = target.centerZ - source.centerZ;
  const extent = Math.max(Math.abs(dx) / Math.max(0.1, source.width / 2), Math.abs(dz) / Math.max(0.1, source.depth / 2), 1);
  return [source.centerX + dx / extent, source.centerZ + dz / extent];
}

function writeRoadSegment(
  field: RoleField,
  index: number,
  start: readonly [number, number],
  finish: readonly [number, number],
  width: number,
  methodSignal: number,
  marking = false,
): void {
  const dx = finish[0] - start[0];
  const dz = finish[1] - start[1];
  const length = Math.max(0.02, Math.hypot(dx, dz));
  writePoint(field.positions, index, (start[0] + finish[0]) / 2, marking ? 0.17 : 0.095, (start[1] + finish[1]) / 2);
  writePoint(field.scales!, index, marking ? 0.055 : width, marking ? 0.018 : 0.14, marking ? length * 0.86 : length);
  writeColor(field.colors, index, marking
    ? [0.92, 0.68 + methodSignal * 0.12, 0.18]
    : [0.2 + methodSignal * 0.08, 0.22 + methodSignal * 0.09, 0.25 + methodSignal * 0.11]);
  field.sizes[index] = width;
  field.luminosities[index] = methodSignal;
  field.shapes[index] = 0;
  field.rotations![index] = Math.atan2(dx, dz);
}

function fillReferenceRoads(field: RoleField, markings: RoleField, data: CosmosFixture, districts: readonly District[]): void {
  data.componentRoads.forEach((road, roadIndex) => {
    const [left, right, constantReferences, methodReferences] = road;
    const source = districts[left]!;
    const target = districts[right]!;
    const start = districtEdgePoint(source, target);
    const finish = districtEdgePoint(target, source);
    const constantSignal = normalizedLog(constantReferences, data.domains.roadConstantReferences);
    const methodSignal = normalizedLog(methodReferences, data.domains.roadMethodReferences);
    const width = 0.38 + constantSignal * 1.02;
    const horizontalFirst = ((left * 31 + right * 17) & 1) === 0;
    const elbow: readonly [number, number] = horizontalFirst ? [finish[0], start[1]] : [start[0], finish[1]];
    writeRoadSegment(field, roadIndex * 2, start, elbow, width, methodSignal);
    writeRoadSegment(field, roadIndex * 2 + 1, elbow, finish, width, methodSignal);
    writeRoadSegment(markings, roadIndex * 2, start, elbow, width, methodSignal, true);
    writeRoadSegment(markings, roadIndex * 2 + 1, elbow, finish, width, methodSignal, true);
  });
}

function fillDependencyParks(field: RoleField, rows: readonly PackageRow[], data: CosmosFixture, districts: readonly District[], variant: VariantId): void {
  const cityRadius = districts.reduce((maximum, district) => Math.max(
    maximum,
    Math.hypot(district.centerX, district.centerZ) + Math.hypot(district.width, district.depth) / 2,
  ), 1);
  const insideRatio = variant === "a" ? 0.18 : variant === "b" ? 0.3 : 0.42;

  rows.forEach((row, index) => {
    const [seed, dependencyRole, location, definitions, observed] = row;
    const volume = normalizedLog(definitions, data.domains.packageDefinitions);
    const inside = dependencyRole === 0 || random(seed, 561) < insideRatio;
    let x: number;
    let z: number;
    if (inside) {
      const district = districts[Math.floor(random(seed, 562) * districts.length)]!;
      const edge = Math.floor(random(seed, 563) * 4);
      const along = signed(seed, 564) * (edge < 2 ? district.width : district.depth) * 0.32;
      const localX = edge === 2 ? district.width * 0.42 : edge === 3 ? -district.width * 0.42 : along;
      const localZ = edge === 0 ? district.depth * 0.42 : edge === 1 ? -district.depth * 0.42 : along;
      const [parkX, parkZ] = rotateLocal(localX, localZ, district.rotation);
      x = district.centerX + parkX;
      z = district.centerZ + parkZ;
    } else {
      const angle = random(seed, 565) * TAU;
      const radius = cityRadius + 2.8 + dependencyRole * 1.7 + random(seed, 566) * 4.2;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    }
    const parkHeight = 0.12 + volume * 0.12;
    const footprint = (inside ? 0.7 : 1.1) + volume * (inside ? 1.15 : 2.1);
    const aspect = 0.72 + random(seed, 567) * 0.64;
    writePoint(field.positions, index, x, parkHeight / 2 + 0.02, z);
    writePoint(field.scales!, index, footprint * aspect, parkHeight, footprint / aspect);
    writeColor(field.colors, index, [0.1 + random(seed, 568) * 0.08, 0.46 + random(seed, 569) * 0.22, 0.17 + random(seed, 570) * 0.08], location === 0 ? 0.04 : 0);
    field.sizes[index] = footprint;
    field.luminosities[index] = observed ? 0.78 : 0.55;
    field.shapes[index] = inside ? 1 : 2;
    field.rotations![index] = Math.round(random(seed, 571) * 2) * Math.PI / 2 + signed(seed, 572) * 0.08;
  });
}

function composeCity(target: TargetId, variant: VariantId, data: CosmosFixture, namespaces: { core: NamespaceRow[]; tests: NamespaceRow[] }): Composition {
  const core = makeField("core", "boxes", namespaces.core.length);
  const tests = makeField("tests", "boxes", namespaces.tests.length);
  const dependencies = makeField("dependencies", "boxes", data.packages.length);
  const districts = buildDistricts(namespaces.core, namespaces.tests, data, variant);
  const foundations = makeField("foundations", "boxes", districts.length);
  const roads = makeField("roads", "boxes", data.componentRoads.length * 2);
  const roadMarkings = makeField("road_markings", "boxes", data.componentRoads.length * 2);
  fillCityBuildings(core, namespaces.core, data, districts);
  fillUndergroundTests(tests, namespaces.tests, data, districts, variant);
  fillDependencyParks(dependencies, data.packages, data, districts, variant);
  fillFoundations(foundations, districts);
  fillReferenceRoads(roads, roadMarkings, data, districts);
  return { target, style: "city", variant, fields: [core, tests, dependencies], decorations: [foundations, roads, roadMarkings] };
}

function buildGalaxyField(
  role: RoleId,
  variant: VariantId,
  data: CosmosFixture,
  namespaces: { core: NamespaceRow[]; tests: NamespaceRow[] },
  parameters: GalaxyParameters,
  dependencyGranularity: DependencyGranularity,
  dependencyDeclarationChannel?: GalaxySignalChannel,
): RoleField {
  if (role === "core") {
    const field = makeField(role, "points", namespaces.core.length, parameters.core, parameters.core.visible);
    fillGalaxyNamespaces(field, namespaces.core, data, variant, parameters.core);
    return field;
  }
  if (role === "tests") {
    const field = makeField(role, "points", namespaces.tests.length, parameters.tests, parameters.tests.visible);
    fillGalaxyNamespaces(field, namespaces.tests, data, variant, parameters.tests);
    return field;
  }
  if (dependencyGranularity === "declarations") {
    const field = makeField(role, "points", data.dependencyDeclarations.length, dependencyDeclarationPointStyle(parameters.dependencies), parameters.dependencies.visible, false);
    fillGalaxyDependencyDeclarations(field, data.dependencyDeclarations, data, variant, parameters.dependencies, dependencyDeclarationChannel);
    return field;
  }
  const field = makeField(role, "points", data.packages.length, parameters.dependencies, parameters.dependencies.visible);
  fillGalaxyDependencies(field, data.packages, data, variant, parameters.dependencies);
  return field;
}

function buildGalaxyDependencyHubs(data: CosmosFixture, variant: VariantId, parameters: GalaxyParameters): RoleField {
  const style: PointStyleParameters = {
    ...parameters.dependencies,
    haloScale: 6.2,
    haloAlphaScale: 0.34,
    maxPixelSize: 20,
  };
  const field = makeField("dependency_hubs", "points", data.packages.length, style, parameters.dependencies.visible);
  const systems = dependencySystemLayout(data, variant, parameters.dependencies);
  data.packages.forEach((row, index) => {
    const [, role, location, definitions, observed] = row;
    const system = systems[index]!;
    writePoint(field.positions, index, system.x, system.y, system.z);
    const volume = normalizedLog(definitions, data.domains.packageDefinitions);
    const emphasis = clampSignal(parameters.dependencies.unobservedBase + observed * 0.22 + volume * 0.38);
    const heat = Math.pow(emphasis, parameters.dependencies.definitionHeatCurve) * parameters.dependencies.heatMix;
    writeColor(field.colors, index, [
      parameters.dependencies.baseColor[0] * (1 - heat) + parameters.dependencies.hotColor[0] * heat,
      parameters.dependencies.baseColor[1] * (1 - heat) + parameters.dependencies.hotColor[1] * heat,
      parameters.dependencies.baseColor[2] * (1 - heat) + parameters.dependencies.hotColor[2] * heat,
    ], location === 0 ? parameters.dependencies.locationLift : 0);
    field.sizes[index] = Math.min(4.8, 1.4 + 0.38 * Math.log1p(system.count));
    field.luminosities[index] = emphasis;
    field.shapes[index] = role === 0 ? parameters.dependencies.directShape : role === 1 ? parameters.dependencies.bundleShape : parameters.dependencies.transitiveShape;
    if (field.labels) field.labels[index] = data.packageNames[index] ?? "";
  });
  return field;
}

export function composeGalaxyField(
  target: TargetId,
  variant: VariantId,
  role: RoleId,
  galaxyParameters: GalaxyParameters = defaultGalaxyParameters,
  dependencyGranularity: DependencyGranularity = "packages",
  dependencyDeclarationChannel?: GalaxySignalChannel,
): RoleField {
  const data = fixtures[target];
  return buildGalaxyField(role, variant, data, splitNamespaces(data), galaxyParameters, dependencyGranularity, dependencyDeclarationChannel);
}

export function compose(
  target: TargetId,
  style: StyleId,
  variant: VariantId,
  galaxyParameters: GalaxyParameters = defaultGalaxyParameters,
  dependencyGranularity: DependencyGranularity = "packages",
): Composition {
  const data = fixtures[target];
  const namespaces = splitNamespaces(data);
  if (style === "city") return composeCity(target, variant, data, namespaces);
  const core = buildGalaxyField("core", variant, data, namespaces, galaxyParameters, dependencyGranularity);
  const tests = buildGalaxyField("tests", variant, data, namespaces, galaxyParameters, dependencyGranularity);
  const dependencies = buildGalaxyField("dependencies", variant, data, namespaces, galaxyParameters, dependencyGranularity);
  const decorations = dependencyGranularity === "declarations" ? [buildGalaxyDependencyHubs(data, variant, galaxyParameters)] : undefined;
  return { target, style, variant, fields: [core, tests, dependencies], ...(decorations ? { decorations } : {}) };
}
