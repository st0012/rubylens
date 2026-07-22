// Builds a self-contained Explorer report at synthetic huge-codebase scale and
// instruments it with an in-page drift frame-time benchmark.
//
//   node benchmark/explorer_frame.mjs [output.html]
//
// The synthetic model matches rubylens.art.v13 as consumed by the runtime:
// NAMESPACES class/module rows (TEST_RATIO of them tests), DEPENDENCY_DECLARATIONS
// embedded dependency declaration rows across PACKAGES gems, exact aggregate totals, and
// signal domains derived from the generated rows. The bounded relationship sample
// defaults to its 1,024-row ceiling; the driven benchmark clock is anchored at
// peak size-scaled visible overlap so drawing and endpoint-projection costs are measured.
// Defaults model a codebase with 100,000 classes/modules and
// over one million total declarations.
//
// The appended inline benchmark script (the report CSP permits inline
// scripts) drives the runtime's render() directly with 60fps-spaced synthetic
// timestamps — the same work a drift frame performs — timing every frame and
// forcing a raster/GPU sync (1px readback) so deferred rasterization is
// included. This works even in hidden tabs, where requestAnimationFrame never
// fires. When the tab is visible it additionally samples real rAF deltas for
// MEASURE_MS. Results land in window.__RUBYLENS_BENCH__, the page title, and
// an on-page overlay. Open the output file in a browser to run it.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NAMESPACES = Number(process.env.NAMESPACES || 100_000);
const TEST_RATIO = Number(process.env.TEST_RATIO || 0.15);
const PACKAGES = Number(process.env.PACKAGES || 400);
const DEPENDENCY_DECLARATIONS = Number(process.env.DEPENDENCY_DECLARATIONS || process.env.DEPENDENCY_STARS || 164_000);
const CONSTANT_REFERENCE_LINKS = Math.min(1_024, Math.max(0, Number(process.env.CONSTANT_REFERENCE_LINKS || 1_024)));
// Multi-gem Git dependency systems (rubylens.art.v13): each groups three
// consecutive packages. Default 0 keeps published benchmark numbers stable.
const DEPENDENCY_SYSTEMS = Number(process.env.DEPENDENCY_SYSTEMS || 0);
const SYSTEM_SPAN = 3;
const WARMUP_FRAMES = Number(process.env.WARMUP_FRAMES || 20);
const MEASURE_FRAMES = Number(process.env.MEASURE_FRAMES || 100);
const MEASURE_MS = Number(process.env.MEASURE_MS || 10_000);
const OUTPUT = process.argv[2] || join(tmpdir(), "rubylens-explorer-frame-bench.html");

const ROOT = new URL("..", import.meta.url).pathname;
const SIGNAL_FIELDS = ["ancestorDepth", "definitionSites", "reopenings", "descendants", "references", "members"];
const PACKAGE_MORPHOLOGY_SHAPES = [
  [0, 250, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 350, 0, 0, 0, 0, 0, 0],
  [2, 0, 260, 4, 110, 500, 0, 0, 0],
  [3, 0, 230, 3, 100, 520, 360, 0, 0],
  [4, 0, 0, 0, 0, 0, 0, 4, 600],
];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(0x51a7e11a);
const randomSeed = () => Math.floor(random() * 0x1_0000_0000);
const heavyTail = (maximum, exponent) => Math.floor(Math.pow(random(), exponent) * maximum);

function signalValues() {
  return [
    heavyTail(13, 1.2),
    1 + heavyTail(5, 3),
    heavyTail(4, 4),
    heavyTail(2_000, 9),
    heavyTail(5_000, 7),
    heavyTail(300, 5),
  ];
}

function buildModel() {
  const namespaceNames = [];
  const namespaces = [];
  const categoryStats = { core: [0, 0, 0, 0], tests: [0, 0, 0, 0] };
  const testCount = Math.round(NAMESPACES * TEST_RATIO);
  for (let index = 0; index < NAMESPACES; index += 1) {
    const test = index < testCount ? 1 : 0;
    const kind = random() < 0.8 ? 0 : 1;
    const rubyCounts = [kind === 0 ? 1 : 0, kind === 1 ? 1 : 0, 2 + heavyTail(120, 3), heavyTail(20, 4)];
    const stats = categoryStats[test === 1 ? "tests" : "core"];
    rubyCounts.forEach((count, at) => { stats[at] += count; });
    namespaceNames.push(test === 1
      ? `Spec::Suite${String(index % 320).padStart(3, "0")}::Case${String(index).padStart(6, "0")}`
      : `Domain::Area${String(index % 240).padStart(3, "0")}::Node${String(index).padStart(6, "0")}`);
    namespaces.push([randomSeed(), kind, test, ...signalValues(), ...rubyCounts, heavyTail(12, 3)]);
  }

  const packageNames = [];
  const packages = [];
  const packageWeights = [];
  const dependencySystems = [];
  for (let index = 0; index < DEPENDENCY_SYSTEMS; index += 1) dependencySystems.push([randomSeed(), index * SYSTEM_SPAN]);
  for (let index = 0; index < PACKAGES; index += 1) {
    const weight = Math.pow(random(), 4) + 0.02;
    packageWeights.push(weight);
    packageNames.push(`gem-${String(index).padStart(4, "0")}`);
    const systemIndex = index < DEPENDENCY_SYSTEMS * SYSTEM_SPAN ? Math.floor(index / SYSTEM_SPAN) : -1;
    packages.push([
      randomSeed(),
      index % 7 === 0 ? 0 : 1,
      random() < 0.05 ? 0 : 1,
      0,
      3 + heavyTail(400, 3),
      1 + heavyTail(120, 3),
      20 + heavyTail(4_000, 3),
      heavyTail(600, 3),
      systemIndex,
    ]);
  }
  const totalWeight = packageWeights.reduce((sum, weight) => sum + weight, 0);
  const dependencyStars = [];
  for (let index = 0; index < DEPENDENCY_DECLARATIONS; index += 1) {
    let pick = random() * totalWeight;
    let packageIndex = 0;
    while (packageIndex < PACKAGES - 1 && pick > packageWeights[packageIndex]) {
      pick -= packageWeights[packageIndex];
      packageIndex += 1;
    }
    packages[packageIndex][3] += 1;
    dependencyStars.push([randomSeed(), packageIndex, ...signalValues()]);
  }
  const indexedDependencyCount = dependencyStars.length;
  const packageDependencyCount = packages.reduce((sum, packageRow) => sum + packageRow[3], 0);
  if (packageDependencyCount !== indexedDependencyCount) {
    throw new Error(`package dependency total ${packageDependencyCount} != embedded rows ${indexedDependencyCount}`);
  }
  // Cycle valid family rows to exercise every renderer recipe. This is a
  // runtime performance fixture, not a calibration of the synthetic counts.
  const packageMorphologies = packages.map((packageRow, index) => [
    ...PACKAGE_MORPHOLOGY_SHAPES[index % PACKAGE_MORPHOLOGY_SHAPES.length],
    packageRow[0],
  ]);

  const domains = Object.fromEntries(SIGNAL_FIELDS.map((field, at) => {
    let maximum = 0;
    for (const row of namespaces) maximum = Math.max(maximum, row[3 + at]);
    for (const row of dependencyStars) maximum = Math.max(maximum, row[2 + at]);
    return [field, maximum];
  }));

  const linkRandom = mulberry32(0xc057a17e);
  const constantReferenceLinks = [];
  const seenLinks = new Set();
  const maximumLinks = NAMESPACES > 0
    ? Math.min(CONSTANT_REFERENCE_LINKS, NAMESPACES * Math.max(0, NAMESPACES - 1) + NAMESPACES * DEPENDENCY_DECLARATIONS)
    : 0;
  while (constantReferenceLinks.length < maximumLinks) {
    const referencedKind = DEPENDENCY_DECLARATIONS > 0 && (NAMESPACES < 2 || linkRandom() < 0.5) ? 1 : 0;
    const referringIndex = Math.floor(linkRandom() * NAMESPACES);
    const referencedIndex = Math.floor(linkRandom() * (referencedKind === 0 ? NAMESPACES : DEPENDENCY_DECLARATIONS));
    const referencedGlobalIndex = referencedKind === 0 ? referencedIndex : NAMESPACES + referencedIndex;
    const key = `${referringIndex}:${referencedGlobalIndex}`;
    if (referencedKind === 0 && referringIndex === referencedIndex) continue;
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    constantReferenceLinks.push([referringIndex, referencedGlobalIndex]);
  }

  return {
    schema: "rubylens.art.v13",
    projectName: "Synthetic Metropolis",
    morphology: [2, 0, 210, 4, 100, 600, 0, 0, 0, 0x51a7e11a],
    totals: {
      namespaces: namespaces.length,
      packages: packages.length,
      dependencyStars: indexedDependencyCount,
    },
    domains,
    categoryStats,
    namespaceNames,
    namespaces,
    constantReferenceLinks,
    packageNames,
    packages,
    packageMorphologies,
    dependencySystems,
    dependencyStars,
    dependencyWarnings: [],
    warningCounts: { manifest: 0, index: 0, integrity: 0 },
  };
}

function substituteOnce(template, placeholder, replacement) {
  const occurrences = template.split(placeholder).length - 1;
  if (occurrences !== 1) throw new Error(`expected exactly one ${placeholder}, found ${occurrences}`);
  return template.replace(placeholder, () => replacement);
}

function benchmarkScript() {
  return `  <script>
    (() => {
      const BENCH = { warmupFrames: ${WARMUP_FRAMES}, measureFrames: ${MEASURE_FRAMES}, rafMeasureMs: ${MEASURE_MS} };
      window.__RUBYLENS_BENCH__ = { status: "pending", config: BENCH };
      const banner = document.createElement("div");
      banner.style.cssText = "position:fixed;left:12px;top:44%;z-index:9;padding:10px 12px;background:rgba(8,8,16,.92);border:1px solid rgba(255,255,255,.25);border-radius:10px;font:11px/1.5 ui-monospace,monospace;color:#d9f7d9;white-space:pre;pointer-events:none;";
      banner.textContent = "bench: pending";
      document.body.append(banner);
      const stats = samples => {
        const sorted = [...samples].sort((left, right) => left - right);
        const at = fraction => sorted[Math.min(sorted.length - 1, Math.round((sorted.length - 1) * fraction))];
        const round = value => Number(value.toFixed(3));
        return {
          avg: round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
          p50: round(at(0.5)),
          p95: round(at(0.95)),
          p99: round(at(0.99)),
          max: round(sorted[sorted.length - 1]),
        };
      };
      // The runtime is a classic top-level script, so its bindings (render,
      // context, scenePointCount, drifting, ...) share this global scope.
      const forcedSync = () => {
        const webglExplorer = document.getElementById("explorer-cosmos");
        const gl = webglExplorer && webglExplorer.getContext("webgl2");
        const pixel = new Uint8Array(4);
        return () => {
          if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          context.getImageData(0, 0, 1, 1);
        };
      };
      const drawableTravelStatesAt = elapsed => travelStatesAt(elapsed)
        .filter(state => state.visibility >= TRAVEL_PRESET.minimumVisibility);
      const firstDrawableTravelOverlap = () => {
        if (!constantReferenceLinks.length) return null;
        const frameMs = 1000 / 60;
        const visibleFlights = travelFlightLimit;
        for (let elapsed = 0; elapsed < SHOWCASE_PRESET.durationMs; elapsed += frameMs) {
          if (drawableTravelStatesAt(elapsed).length === visibleFlights) return elapsed;
        }
        return null;
      };
      const measureDrivenFrames = onDone => {
        // Hidden tabs can report a 0x0 viewport at load; force real dimensions.
        if (!width || !height) resize();
        if (!width || !height) { banner.textContent = "bench: viewport is 0x0 — make the tab visible and rerun __RUBYLENS_BENCH_RUN__()"; return; }
        if (!drifting) setDrifting(true);
        if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
        const sync = forcedSync();
        const submitSamples = [];
        const frameSamples = [];
        const syntheticFrameMs = 1000 / 60;
        const travelStart = firstDrawableTravelOverlap();
        if (travelStart === null) {
          const error = "bench: no drawable " + travelFlightLimit + "-flight overlap found";
          window.__RUBYLENS_BENCH__ = { status: "error", error, config: BENCH };
          banner.textContent = error;
          throw new Error(error);
        }
        let clock = travelStart;
        const resetDrivenClock = () => {
          clock = travelStart;
          lastDriftTimestamp = travelStart;
          explorerTravelElapsed = travelStart;
          explorerTravelLastTimestamp = travelStart;
        };
        resetDrivenClock();
        let remaining = BENCH.warmupFrames + BENCH.measureFrames;
        let activeTravelFrames = 0;
        // MessageChannel tasks are exempt from hidden-tab timer throttling.
        const channel = new MessageChannel();
        const scheduleStep = () => channel.port2.postMessage(0);
        const step = () => {
          if (travelStart !== null && remaining === BENCH.measureFrames) {
            resetDrivenClock();
          }
          clock += syntheticFrameMs;
          const startedAt = performance.now();
          render(clock);
          const submitMs = performance.now() - startedAt;
          sync();
          const measuredFrameMs = performance.now() - startedAt;
          if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
          remaining -= 1;
          if (remaining < BENCH.measureFrames) {
            submitSamples.push(submitMs);
            frameSamples.push(measuredFrameMs);
            if (drawableTravelStatesAt(explorerTravelElapsed).length) activeTravelFrames += 1;
          }
          if (remaining > 0) {
            banner.textContent = "bench: driven frame " + (BENCH.warmupFrames + BENCH.measureFrames - remaining + 1);
            scheduleStep();
            return;
          }
          const synced = stats(frameSamples);
          onDone({
            frames: frameSamples.length,
            submitMs: stats(submitSamples),
            frameMs: synced,
            estimatedFps: Number((1000 / synced.avg).toFixed(1)),
            activeTravelFrames,
          });
        };
        channel.port1.onmessage = step;
        scheduleStep();
      };
      const measureRafCadence = onDone => {
        if (document.visibilityState !== "visible") { onDone(null); return; }
        // The driven phase cancelled the Explorer's own rAF loop; restart it so
        // sampled deltas reflect real drift rendering, not idle vsync ticks.
        lastDriftTimestamp = null;
        if (!drifting) setDrifting(true);
        requestRender();
        const deltas = [];
        let last = null;
        let started = null;
        const tick = timestamp => {
          started ??= timestamp;
          if (last !== null) deltas.push(timestamp - last);
          last = timestamp;
          if (timestamp - started < BENCH.rafMeasureMs) { requestAnimationFrame(tick); return; }
          const spacing = stats(deltas);
          onDone({
            frames: deltas.length,
            avgFps: Number((1000 / spacing.avg).toFixed(1)),
            deltaMs: spacing,
            framesOver20Ms: deltas.filter(delta => delta > 20).length,
          });
        };
        requestAnimationFrame(tick);
      };
      const run = () => measureDrivenFrames(driven => measureRafCadence(raf => {
        const result = {
          status: "done",
          renderer: document.documentElement.dataset.explorerRenderer || "canvas2d",
          points: scenePointCount,
          driven,
          raf,
        };
        window.__RUBYLENS_BENCH__ = result;
        banner.textContent = [
          "bench: done · " + result.renderer + " · " + result.points.toLocaleString() + " points",
          "driven frame ms avg " + driven.frameMs.avg + " (submit " + driven.submitMs.avg + ") -> ~" + driven.estimatedFps + " fps",
          "driven p50 " + driven.frameMs.p50 + " · p95 " + driven.frameMs.p95 + " · p99 " + driven.frameMs.p99 + " · max " + driven.frameMs.max,
          "active travel overlay frames " + driven.activeTravelFrames + "/" + driven.frames,
          raf ? "visible rAF avg " + raf.avgFps + " fps · p95 " + raf.deltaMs.p95 + "ms · >20ms x" + raf.framesOver20Ms : "visible rAF skipped (tab hidden)",
        ].join("\\n");
        document.title = "BENCH " + driven.frameMs.avg + "ms ~" + driven.estimatedFps + "fps " + result.renderer;
      }));
      window.__RUBYLENS_BENCH_RUN__ = run;
      window.addEventListener("load", () => setTimeout(run, 800));
    })();
  </script>
`;
}

const model = buildModel();
const shell = readFileSync(join(ROOT, "assets/shells/report.html"), "utf8");
const styles = readFileSync(join(ROOT, "assets/styles/report.css"), "utf8");
const runtime = readFileSync(join(ROOT, "assets/runtime/report.js"), "utf8");
let html = substituteOnce(shell, "{{REPORT_STYLES}}", styles);
html = substituteOnce(html, "{{REPORT_RUNTIME}}", runtime);
html = substituteOnce(html, "{{MODEL_BASE64}}", Buffer.from(JSON.stringify(model)).toString("base64"));
html = substituteOnce(html, "</body>", `${benchmarkScript()}</body>`);
writeFileSync(OUTPUT, html);

const totalDeclarations = model.totals.namespaces
  + model.categoryStats.core[2] + model.categoryStats.core[3]
  + model.categoryStats.tests[2] + model.categoryStats.tests[3]
  + model.totals.dependencyStars;
console.log(`wrote ${OUTPUT} (${(html.length / 1024 / 1024).toFixed(1)} MiB)`);
console.log(`namespaces ${model.totals.namespaces.toLocaleString()} · packages ${model.totals.packages.toLocaleString()} · embedded dependency declarations ${model.dependencyStars.length.toLocaleString()}`);
console.log(`scene points embedded ${(model.totals.namespaces + model.dependencyStars.length + model.totals.packages + model.dependencySystems.length).toLocaleString()} · exact declarations represented ${totalDeclarations.toLocaleString()}`);
console.log(`open the file in a browser; results appear in the overlay, title, and window.__RUBYLENS_BENCH__ (${WARMUP_FRAMES}+${MEASURE_FRAMES} driven frames, then ${MEASURE_MS / 1000}s of rAF sampling when visible)`);
