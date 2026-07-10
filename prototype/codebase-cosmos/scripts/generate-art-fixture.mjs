import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const outputDirectory = join(here, "../src/data");
const checking = process.argv.includes("--check");
const namespaceDefinitionKinds = new Set(["class_definition", "module_definition"]);
const testSegments = new Set(["test", "tests", "spec", "specs", "feature", "features"]);
const roleCodes = { direct_runtime: 0, bundle_only: 1, transitive: 2 };
const locationCodes = { workspace: 0, external_rubygems: 1 };

function railsComponent(path) {
  return path.split("/")[0];
}

function rdocComponent(path) {
  const segments = path.split("/");
  let relative;
  if (["lib", "test", "doc"].includes(segments[0]) && segments[1] === "rdoc") relative = segments[2] ?? "rdoc.rb";
  else if (["lib", "test", "doc"].includes(segments[0])) relative = segments[1] ?? "rdoc.rb";
  else relative = segments[0] ?? "rdoc.rb";
  const anchor = relative.toLowerCase().replace(/\.rb$/, "").replace(/^test_/, "");
  if (/^(?:rdoc_)?(?:markup|markdown)/.test(anchor)) return "markup-markdown";
  if (/^(?:rdoc_)?parser/.test(anchor)) return "parsers";
  if (/^(?:rdoc_)?generator/.test(anchor)) return "generators";
  if (/^(?:rdoc_)?(?:code_object|store|cross_reference|context|top_level)/.test(anchor)) return "code-model";
  if (/^(?:rdoc_)?ri(?:_|$)/.test(anchor)) return "ri";
  if (/^(?:rdoc_)?rd(?:_|$)/.test(anchor)) return "rd";
  if (/^(?:rdoc_)?(?:comment|text|tom_doc|token_stream|i18n|encoding)/.test(anchor)) return "text-comments";
  if (/^(?:rdoc_)?(?:stats|server|servlet|task|rubygems_hook|options|rdoc|require)/.test(anchor)) return "app-runtime";
  return "support-other";
}

const targets = [
  {
    id: "rails",
    declarationFile: "generated/rails/workspace/raw/declarations.json.gz",
    referenceFile: "generated/rails/workspace/raw/references.json.gz",
    analysisFile: "generated/rails/analysis.json",
    seedChannel: 0x51a7e11a,
    packageSeedChannel: 0xd3a0f221,
    componentForPath: railsComponent,
    expected: {
      namespaces: 8051, classes: 6791, modules: 1260, scopes: [2433, 5528, 90],
      packages: 230, roles: [12, 76, 142], locations: [13, 217], observedExternal: 214, unobservedExternal: 3,
      dependencyDeclarations: 105009,
      constants: 232, maxDepth: 85, maxWorkspaceReach: 6772, maxFullReach: 29365,
      components: [3134, 1455, 1095, 535, 518, 325, 244, 188, 176, 134, 96, 86, 41, 22, 2],
    },
  },
  {
    id: "rdoc",
    declarationFile: "generated/rdoc/workspace/raw/declarations.json.gz",
    referenceFile: "generated/rdoc/workspace/raw/references.json.gz",
    analysisFile: "generated/rdoc/analysis.json",
    seedChannel: 0x8d0c711a,
    packageSeedChannel: 0x4d0cf221,
    componentForPath: rdocComponent,
    expected: {
      namespaces: 258, classes: 238, modules: 20, scopes: [138, 120, 0],
      packages: 35, roles: [4, 9, 22], locations: [0, 35], observedExternal: 35, unobservedExternal: 0,
      dependencyDeclarations: 42649,
      constants: 19, maxDepth: 21, maxWorkspaceReach: 90, maxFullReach: 90,
      components: [73, 39, 34, 27, 24, 23, 16, 11, 11],
    },
  },
];

function assertSame(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function anonymousSeed(ordinal, channel) {
  let value = ((ordinal + 1) ^ channel) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function isWorkspaceNamespaceDefinition(definition) {
  return namespaceDefinitionKinds.has(definition.kind) && definition.location?.origin?.kind === "workspace";
}

function siteKey(definition) {
  const location = definition.location;
  return [definition.kind, location.path, location.start_line, location.start_column, location.end_line, location.end_column].join("\0");
}

function scopeForPath(path) {
  return path.split("/").some((segment) => testSegments.has(segment)) ? 1 : 0;
}

function combinedScope(definitions) {
  const scopes = new Set(definitions.map((definition) => scopeForPath(definition.location.path)));
  return scopes.size === 2 ? 2 : scopes.values().next().value;
}

function primaryComponent(definitions, componentForPath) {
  const groups = new Map();
  for (const definition of definitions) {
    const component = componentForPath(definition.location.path);
    const group = groups.get(component) ?? { sites: new Set(), hasSource: false };
    group.sites.add(siteKey(definition));
    if (scopeForPath(definition.location.path) === 0) group.hasSource = true;
    groups.set(component, group);
  }
  return [...groups].sort((left, right) =>
    right[1].sites.size - left[1].sites.size
      || Number(right[1].hasSource) - Number(left[1].hasSource)
      || left[0].localeCompare(right[0]),
  )[0][0];
}

function buildComponentRoads(referencePayload, config, componentId, strictComponentByName) {
  const edges = new Map();
  const add = (record, targetName, channel) => {
    if (record.location?.origin?.kind !== "workspace") return;
    const source = componentId.get(config.componentForPath(record.location.path));
    const target = strictComponentByName.get(targetName);
    if (source === undefined || target === undefined || source === target) return;
    const left = Math.min(source, target);
    const right = Math.max(source, target);
    const key = `${left}:${right}`;
    const edge = edges.get(key) ?? { left, right, constant: 0, method: 0 };
    edge[channel] += 1;
    edges.set(key, edge);
  };

  for (const reference of referencePayload.constant.records) {
    if (reference.resolved === true && reference.target) add(reference, reference.target, "constant");
  }
  for (const reference of referencePayload.method.records) {
    if (reference.receiver) add(reference, reference.receiver, "method");
  }

  const ranked = [...edges.values()].filter((edge) => edge.constant > 0).sort((left, right) =>
    right.constant - left.constant || right.method - left.method || left.left - right.left || left.right - right.right,
  );
  const limit = Math.min(ranked.length, componentId.size * 2);
  const selected = new Set();
  for (let component = 0; component < componentId.size; component += 1) {
    const strongest = ranked.find((edge) => edge.left === component || edge.right === component);
    if (strongest) selected.add(`${strongest.left}:${strongest.right}`);
  }
  for (const edge of ranked) {
    if (selected.size >= limit) break;
    selected.add(`${edge.left}:${edge.right}`);
  }
  return ranked.filter((edge) => selected.has(`${edge.left}:${edge.right}`)).map((edge) => [edge.left, edge.right, edge.constant, edge.method]);
}

function buildTarget(config) {
  const raw = JSON.parse(gunzipSync(readFileSync(join(repo, config.declarationFile))));
  const references = JSON.parse(gunzipSync(readFileSync(join(repo, config.referenceFile))));
  const analysis = JSON.parse(readFileSync(join(repo, config.analysisFile), "utf8"));
  const declarationByName = new Map(raw.payload.records.map((record) => [record.name, record]));
  const strict = raw.payload.records.filter((record) =>
    (record.kind === "class" || record.kind === "module")
      && record.definitions.some(isWorkspaceNamespaceDefinition),
  );
  const strictNames = new Set(strict.map((record) => record.name));
  const strictOrdinalByName = new Map();
  strict.forEach((record, ordinal) => {
    strictOrdinalByName.set(record.name, ordinal);
    if (record.singleton_class) strictOrdinalByName.set(record.singleton_class, ordinal);
  });
  const inboundReferenceCounts = Array(strict.length).fill(0);
  for (const reference of references.payload.constant.records) {
    if (reference.location?.origin?.kind !== "workspace" || reference.resolved !== true || !reference.target) continue;
    const target = strictOrdinalByName.get(reference.target);
    if (target !== undefined) inboundReferenceCounts[target] += 1;
  }
  const definitionsFor = (record) => record.definitions.filter(isWorkspaceNamespaceDefinition);
  const workspaceMemberCount = (record) => {
    const memberNames = new Set(record.members ?? []);
    const singleton = declarationByName.get(record.singleton_class);
    for (const member of singleton?.members ?? []) memberNames.add(member);
    return [...memberNames].filter((name) =>
      declarationByName.get(name)?.definitions?.some((definition) => definition.location?.origin?.kind === "workspace"),
    ).length;
  };
  const componentNames = [...new Set(strict.map((record) => primaryComponent(definitionsFor(record), config.componentForPath)))].sort();
  const componentId = new Map(componentNames.map((component, index) => [component, index]));
  const strictComponentByName = new Map();
  for (const record of strict) {
    const component = componentId.get(primaryComponent(definitionsFor(record), config.componentForPath));
    strictComponentByName.set(record.name, component);
    if (record.singleton_class) strictComponentByName.set(record.singleton_class, component);
  }
  if (references.payload.constant.complete !== true || references.payload.method.complete !== true) {
    throw new Error(`${config.id} reference stream is incomplete`);
  }
  const componentRoads = buildComponentRoads(references.payload, config, componentId, strictComponentByName);
  let maxFullReach = 0;

  const namespaces = strict.map((record, ordinal) => {
    const definitions = definitionsFor(record);
    const sites = new Set(definitions.map(siteKey)).size;
    assertSame(record.ancestors.filter((ancestor) => ancestor === record.name).length, 1, `${config.id} ancestry self cardinality`);
    const fullDescendants = new Set(record.descendants.filter((descendant) => descendant !== record.name));
    const workspaceReach = new Set([...fullDescendants].filter((descendant) => strictNames.has(descendant))).size;
    maxFullReach = Math.max(maxFullReach, fullDescendants.size);
    // seed, component, class/module, source/test/both, depth, definition sites, reopen events, strict-workspace reach, inbound resolved workspace constant references, direct members
    return [
      anonymousSeed(ordinal, config.seedChannel),
      componentId.get(primaryComponent(definitions, config.componentForPath)),
      record.kind === "class" ? 0 : 1,
      combinedScope(definitions),
      record.ancestors.length - 1,
      sites,
      Math.max(0, sites - 1),
      workspaceReach,
      inboundReferenceCounts[ordinal],
      workspaceMemberCount(record),
    ];
  });

  const packageEntries = analysis.dependencies.packages.filter((entry) => !entry.self_package);
  const packageIndexByOrigin = new Map(packageEntries.map((entry, index) => [`${entry.name}\0${entry.version}`, index]));
  const dependencies = packageEntries.map((entry, ordinal) => [
    anonymousSeed(ordinal, config.packageSeedChannel),
    roleCodes[entry.primary_role],
    locationCodes[entry.location_scope],
    entry.rubydex_observation.definitions,
    entry.rubydex_observation.observed ? 1 : 0,
  ]);
  const dependencyMemberCount = (record, origin) => {
    const names = new Set(record.members ?? []);
    const singleton = declarationByName.get(record.singleton_class);
    for (const member of singleton?.members ?? []) names.add(member);
    return [...names].filter((name) => declarationByName.get(name)?.definitions?.some((definition) => {
      const candidate = definition.location?.origin;
      return candidate?.kind === "gem" && candidate.name === origin.name && candidate.version === origin.version;
    })).length;
  };
  const dependencyDeclarations = [];
  raw.payload.records.forEach((record, ordinal) => {
    const candidates = (record.origins ?? []).filter((origin) =>
      origin.kind === "gem" && packageIndexByOrigin.has(`${origin.name}\0${origin.version}`),
    ).map((origin) => ({
      origin,
      sites: new Set((record.definitions ?? []).filter((definition) => {
        const candidate = definition.location?.origin;
        return candidate?.kind === "gem" && candidate.name === origin.name && candidate.version === origin.version;
      }).map(siteKey)).size,
    })).sort((left, right) => right.sites - left.sites
      || left.origin.name.localeCompare(right.origin.name)
      || left.origin.version.localeCompare(right.origin.version));
    const origin = candidates[0]?.origin;
    if (!origin) return;
    const packageIndex = packageIndexByOrigin.get(`${origin.name}\0${origin.version}`);
    const definitions = (record.definitions ?? []).filter((definition) => {
      const candidate = definition.location?.origin;
      return candidate?.kind === "gem" && candidate.name === origin.name && candidate.version === origin.version;
    });
    const sites = new Set(definitions.map(siteKey)).size;
    const descendants = new Set((record.descendants ?? []).filter((name) => name !== record.name)).size;
    // seed, package, class/module/other, ancestry depth, definition sites, reopen events, descendant reach, resolved references, direct members
    dependencyDeclarations.push([
      anonymousSeed(ordinal, config.packageSeedChannel ^ 0x6d2b79f5),
      packageIndex,
      record.kind === "class" ? 0 : record.kind === "module" ? 1 : 2,
      Math.max(0, (record.ancestors?.length ?? 1) - 1),
      sites,
      Math.max(0, sites - 1),
      descendants,
      record.reference_count ?? 0,
      dependencyMemberCount(record, origin),
    ]);
  });
  const count = (rows, field, value) => rows.filter((row) => row[field] === value).length;
  const componentCounts = componentNames.map((_, component) => count(namespaces, 1, component));
  const expected = config.expected;

  assertSame(namespaces.length, expected.namespaces, `${config.id} namespace total`);
  assertSame(strictNames.size, expected.namespaces, `${config.id} strict identity total`);
  assertSame(count(namespaces, 2, 0), expected.classes, `${config.id} class total`);
  assertSame(count(namespaces, 2, 1), expected.modules, `${config.id} module total`);
  assertSame([0, 1, 2].map((scope) => count(namespaces, 3, scope)), expected.scopes, `${config.id} scopes`);
  assertSame(Math.max(...namespaces.map((row) => row[4])), expected.maxDepth, `${config.id} maximum depth`);
  assertSame(Math.max(...namespaces.map((row) => row[7])), expected.maxWorkspaceReach, `${config.id} maximum workspace reach`);
  assertSame(maxFullReach, expected.maxFullReach, `${config.id} generator-only full reach`);
  assertSame([...componentCounts].sort((a, b) => b - a), expected.components, `${config.id} component distribution`);
  assertSame(dependencies.length, expected.packages, `${config.id} package total`);
  assertSame([0, 1, 2].map((role) => count(dependencies, 1, role)), expected.roles, `${config.id} package roles`);
  assertSame([0, 1].map((location) => count(dependencies, 2, location)), expected.locations, `${config.id} package locations`);
  assertSame(dependencies.filter((row) => row[2] === 1 && row[4] === 1).length, expected.observedExternal, `${config.id} observed external packages`);
  assertSame(dependencies.filter((row) => row[2] === 1 && row[4] === 0).length, expected.unobservedExternal, `${config.id} unobserved external packages`);
  assertSame(dependencyDeclarations.length, expected.dependencyDeclarations, `${config.id} dependency declaration total`);
  assertSame(analysis.population.workspace_namespaces.class_module_shaped_constant_only_exclusion_count, expected.constants, `${config.id} constants`);

  return {
    schema: "rubylens.cosmos.v1",
    totals: {
      namespaces: expected.namespaces,
      classes: expected.classes,
      modules: expected.modules,
      scopes: expected.scopes,
      packages: expected.packages,
      dependencyDeclarations: expected.dependencyDeclarations,
      packageRoles: expected.roles,
      packageLocations: expected.locations,
      constants: expected.constants,
      roads: componentRoads.length,
    },
    domains: {
      depth: expected.maxDepth,
      sites: Math.max(...namespaces.map((row) => row[5])),
      reopens: Math.max(...namespaces.map((row) => row[6])),
      reach: expected.maxWorkspaceReach,
      inboundReferences: Math.max(...inboundReferenceCounts, 0),
      members: Math.max(...namespaces.map((row) => row[9]), 0),
      packageDefinitions: Math.max(...dependencies.map((row) => row[3])),
      dependencyDeclarationDepth: Math.max(...dependencyDeclarations.map((row) => row[3]), 0),
      dependencyDeclarationSites: Math.max(...dependencyDeclarations.map((row) => row[4]), 0),
      dependencyDeclarationReopens: Math.max(...dependencyDeclarations.map((row) => row[5]), 0),
      dependencyDeclarationReach: Math.max(...dependencyDeclarations.map((row) => row[6]), 0),
      dependencyDeclarationReferences: Math.max(...dependencyDeclarations.map((row) => row[7]), 0),
      dependencyDeclarationMembers: Math.max(...dependencyDeclarations.map((row) => row[8]), 0),
      roadConstantReferences: Math.max(...componentRoads.map((row) => row[2]), 0),
      roadMethodReferences: Math.max(...componentRoads.map((row) => row[3]), 0),
    },
    componentCounts,
    namespaceNames: strict.map((record) => record.name),
    namespaces,
    packageNames: packageEntries.map((entry) => `${entry.name} ${entry.version}`),
    packages: dependencies,
    dependencyDeclarations,
    componentRoads,
  };
}

mkdirSync(outputDirectory, { recursive: true });
for (const target of targets) {
  const outputPath = join(outputDirectory, `${target.id}-art.json`);
  const serialized = `${JSON.stringify(buildTarget(target))}\n`;
  if (checking) {
    if (readFileSync(outputPath, "utf8") !== serialized) throw new Error(`${target.id} art fixture is stale; run npm run generate:data`);
  } else {
    writeFileSync(outputPath, serialized);
  }
  console.log(`${checking ? "verified" : "wrote"} ${target.id}: ${target.expected.namespaces} workspace namespaces + ${target.expected.packages} packages + ${target.expected.dependencyDeclarations} dependency declarations + reference roads`);
}
