// Loads the real Explorer runtime into the happy-dom test environment.
//
// The runtime is deliberately a single classic script spliced into the report
// shell, so tests evaluate the genuine file against the genuine shell DOM and
// receive its script-scope bindings back — no per-function extraction. WebGL2
// is unavailable under happy-dom, so the runtime takes its documented
// unavailable path at init; buildPoints and every binding still run for real.
//
// new Function()/innerHTML here evaluate only first-party sources read from
// this repository (the runtime, the shell, and test fixtures) — the same trust
// boundary as the test files themselves. No untrusted input reaches either.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SHELL = readFileSync(join(ROOT, "assets/shells/report.html"), "utf8");
const RUNTIME = readFileSync(join(ROOT, "assets/runtime/report.js"), "utf8");
const BODY = SHELL.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/\{\{REPORT_RUNTIME\}\}/, "")
  .replace(/\{\{REPORT_STYLES\}\}/, "");

// Script-scope bindings the tests consume. Mutable `let` state is exposed
// through accessors so tests can position the camera before projecting.
const EXPORTS = `;return ({
  decodeMorphology, fallbackMorphology, morphology, packageMorphologies,
  layoutMetricsForCoreCount, normalizedSignals, weightedSignal, explorerExposureForZoom,
  corePosition, testPosition, dependencyCloudOffset, dependencyPosition,
  systemMembers, systemAggregates, systemAnchors, packageAnchors,
  decodePackageMorphology, DEPENDENCY_CLOUD_THRESHOLD,
  SCENE_POINT_STRIDE, categoryCodes, sceneData, scenePointCount,
  interactivePoints, dependencyHubs, packageHubs, systemHubs,
  ensureHitScanRows, hitTestProjected, ensureSearchIndex, searchRenderedPoints,
  project, viewMatrix, visibleCategories,
  DEPENDENCY_STAR_ALPHA_SCALE: 0.85,
  state: {
    get yaw() { return yaw; }, set yaw(v) { yaw = v; },
    get pitch() { return pitch; }, set pitch(v) { pitch = v; },
    get zoom() { return zoom; }, set zoom(v) { zoom = v; },
    get panX() { return panX; }, set panX(v) { panX = v; },
    get panY() { return panY; }, set panY(v) { panY = v; },
    get width() { return width; }, set width(v) { width = v; },
    get height() { return height; }, set height(v) { height = v; },
    get sceneRight() { return sceneRight; }, set sceneRight(v) { sceneRight = v; },
    get sceneBottom() { return sceneBottom; }, set sceneBottom(v) { sceneBottom = v; },
    get sceneCenterX() { return sceneCenterX; }, set sceneCenterX(v) { sceneCenterX = v; },
    get sceneCenterY() { return sceneCenterY; }, set sceneCenterY(v) { sceneCenterY = v; },
    get focusedCategory() { return focusedCategory; }, set focusedCategory(v) { focusedCategory = v; },
    get expandedPackageIndex() { return expandedPackageIndex; }, set expandedPackageIndex(v) { expandedPackageIndex = v; },
    get expandedSystemIndex() { return expandedSystemIndex; }, set expandedSystemIndex(v) { expandedSystemIndex = v; },
  },
})`;

const CONTEXT_2D_STUB = {
  setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, stroke() {},
  getImageData() { return { data: new Uint8ClampedArray(4) }; },
  globalAlpha: 1, globalCompositeOperation: "source-over", strokeStyle: "", lineWidth: 1,
};

export function minimalModel(overrides = {}) {
  return {
    schema: "rubylens.art.v12",
    projectName: "Fixture",
    morphology: [2, 0, 240, 3, 105, 380, 0, 0, 0, 7],
    totals: { namespaces: 0, packages: 0, dependencyStars: 0 },
    domains: { ancestorDepth: 8, definitionSites: 4, reopenings: 3, descendants: 40, references: 90, members: 30 },
    categoryStats: { core: [0, 0, 0, 0], tests: [0, 0, 0, 0] },
    namespaceNames: [],
    namespaces: [],
    packageNames: [],
    packages: [],
    packageMorphologies: [],
    dependencySystems: [],
    dependencyStars: [],
    dependencyWarnings: [],
    warningCounts: { manifest: 0, index: 0, integrity: 0 },
    ...overrides,
  };
}

export function loadRuntime(model = minimalModel()) {
  document.documentElement.innerHTML = "";
  document.body.innerHTML = BODY;
  delete document.body.dataset.rubylensMode;
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    return kind === "2d" ? CONTEXT_2D_STUB : null;
  };
  const encoded = Buffer.from(JSON.stringify(model)).toString("base64");
  const source = RUNTIME.replace("{{MODEL_BASE64}}", encoded);
  return new Function(`${source}\n${EXPORTS}`)();
}
