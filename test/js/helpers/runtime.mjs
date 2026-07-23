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
  systemMembers, systemAggregates, dependencyAnchor, systemAnchors, packageAnchors,
  decodePackageMorphology, dependencyOrientation, orientDependencyOffset, packageOrientations,
  dependencySpinTurns, dependencySpunPosition, packageSpinRates,
  DEPENDENCY_CLOUD_THRESHOLD, DEPENDENCY_HALO_SPACING_SCALE, DEPENDENCY_SPIN_RECIPE, SHOWCASE_PRESET,
  SHOWCASE_ANNOTATION_PRESET, SHOWCASE_WIDESCREEN_LAYOUT_PRESET, SHOWCASE_DEPENDENCY_PRESET,
  SCENE_POINT_STRIDE, categoryCodes, sceneData, scenePointCount,
  HAZE_CATEGORY_OFFSET, HAZE_RECIPE, ...hazeBuffers(),
  hazePointCount: hazeBuffers().hazeData.length / SCENE_POINT_STRIDE,
  renderPointCount: hazeBuffers().renderPointData.length / SCENE_POINT_STRIDE,
  hash, unit, dustAttenuation, DUST_PRESET,
  interactivePoints, dependencyHubs, packageHubs, systemHubs,
  ensureHitScanRows, hitTestProjected, ensureSearchIndex, searchRenderedPoints,
  project, projectScenePoint, viewMatrix, visibleCategories,
  TRAVEL_PRESET, travelFlightLimitForPointCount, travelFlightLimit,
  constantReferenceLinks, travelEndpointCategory, travelLinkCandidatesForEpisode,
  travelEpisodesThrough, travelStatesAt, travelRouteAt,
  travelCurveFits, quadraticCoordinate,
  advanceExplorerDrift, explorerTravelElapsedAt, zoomBetween,
  screenRotationYawSign, drawTravelOverlay,
  DRIFT_RADIANS_PER_SECOND, MAX_DRIFT_DELTA_MS,
  DEPENDENCY_EXPANSION, DEPENDENCY_STAR_ALPHA_SCALE: 0.85,
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
    get drifting() { return drifting; }, set drifting(v) { drifting = v; },
    get lastDriftTimestamp() { return lastDriftTimestamp; }, set lastDriftTimestamp(v) { lastDriftTimestamp = v; },
    get dependencySpinElapsed() { return dependencySpinElapsed; }, set dependencySpinElapsed(v) { dependencySpinElapsed = v; },
    get lastDependencySpinTimestamp() { return lastDependencySpinTimestamp; }, set lastDependencySpinTimestamp(v) { lastDependencySpinTimestamp = v; },
  },
})`;

function createContext2DStub() {
  const savedStates = [];
  const drawingProperties = [
    "globalAlpha", "globalCompositeOperation", "lineCap", "strokeStyle",
    "fillStyle", "lineWidth", "shadowColor", "shadowBlur",
  ];
  const context = {
    strokes: [],
    arcs: [],
    fills: 0,
    fillPaths: [],
    pathCommands: [],
    pathClosed: false,
    pathStart: null,
    pathEnd: null,
    translation: [0, 0],
    rotation: 0,
    setTransform() {},
    translate(x, y) { this.translation = [x, y]; },
    rotate(angle) { this.rotation += angle; },
    clearRect() {},
    beginPath() {
      this.pathStart = null;
      this.pathEnd = null;
      this.pathCommands = [];
      this.pathClosed = false;
    },
    arc(...args) { this.arcs.push(args); },
    fill() {
      this.fills += 1;
      this.fillPaths.push({
        commands: this.pathCommands.map(command => [...command]),
        closed: this.pathClosed,
        fillStyle: this.fillStyle,
        shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur,
        translation: [...this.translation],
        rotation: this.rotation,
      });
    },
    moveTo(x, y) {
      this.pathStart = [x, y];
      this.pathEnd = [x, y];
      this.pathCommands.push(["moveTo", x, y]);
    },
    lineTo(x, y) {
      this.pathEnd = [x, y];
      this.pathCommands.push(["lineTo", x, y]);
    },
    bezierCurveTo(...coordinates) {
      this.pathEnd = coordinates.slice(-2);
      this.pathCommands.push(["bezierCurveTo", ...coordinates]);
    },
    closePath() {
      this.pathClosed = true;
      this.pathCommands.push(["closePath"]);
    },
    stroke() {
      const from = this.pathStart;
      const to = this.pathEnd;
      this.strokes.push({
        from,
        to,
        length: from && to ? Math.hypot(to[0] - from[0], to[1] - from[1]) : 0,
        lineWidth: this.lineWidth,
        lineCap: this.lineCap,
        strokeStyle: this.strokeStyle,
        shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur,
      });
    },
    save() {
      savedStates.push({
        ...Object.fromEntries(drawingProperties.map(property => [property, this[property]])),
        translation: [...this.translation],
        rotation: this.rotation,
      });
    },
    restore() {
      const state = savedStates.pop();
      if (state) Object.assign(this, state);
    },
    reset() {
      this.strokes.length = 0;
      this.arcs.length = 0;
      this.fills = 0;
      this.fillPaths.length = 0;
      this.pathCommands = [];
      this.pathClosed = false;
      this.pathStart = null;
      this.pathEnd = null;
      this.translation = [0, 0];
      this.rotation = 0;
      savedStates.length = 0;
    },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineCap: "butt",
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    shadowColor: "",
    shadowBlur: 0,
  };
  return context;
}

export function minimalModel(overrides = {}) {
  return {
    schema: "rubylens.art.v13",
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
    constantReferenceLinks: [],
    dependencyWarnings: [],
    warningCounts: { manifest: 0, index: 0, integrity: 0 },
    ...overrides,
  };
}

export function loadRuntime(model = minimalModel()) {
  document.documentElement.innerHTML = "";
  document.body.innerHTML = BODY;
  delete document.body.dataset.rubylensMode;
  const context2D = createContext2DStub();
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    return kind === "2d" ? context2D : null;
  };
  const encoded = Buffer.from(JSON.stringify(model)).toString("base64");
  const source = RUNTIME.replace("{{MODEL_BASE64}}", encoded);
  return Object.assign(new Function(`${source}\n${EXPORTS}`)(), { context2D });
}
