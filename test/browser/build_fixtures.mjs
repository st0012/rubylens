// Playwright globalSetup: assemble a small deterministic Explorer report from
// the real shell, styles, and runtime. Small enough for software renderers,
// large enough to exercise every scene recipe (tests, systems, hubs, stars).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FIXTURES = join(ROOT, "test/browser/.fixtures");

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function fixtureModel({ namespaces = 1500, packages = 12, stars = 2500 } = {}) {
  const random = mulberry32(0x51a7e11a);
  const seed = () => Math.floor(random() * 0x1_0000_0000);
  const names = [];
  const rows = [];
  const categoryStats = { core: [0, 0, 0, 0], tests: [0, 0, 0, 0] };
  for (let index = 0; index < namespaces; index += 1) {
    const test = index < namespaces * 0.2 ? 1 : 0;
    const kind = random() < 0.8 ? 0 : 1;
    const rubyCounts = [kind === 0 ? 1 : 0, kind === 1 ? 1 : 0, 1 + (index % 40), index % 5];
    rubyCounts.forEach((count, at) => { categoryStats[test ? "tests" : "core"][at] += count; });
    names.push(test ? `Spec::Case${index}` : `Core::Node${index}`);
    rows.push([seed(), 0, kind, test, index % 9, 1 + (index % 3), index % 2, index % 30, index % 80, index % 20, ...rubyCounts, index % 4]);
  }
  const packageNames = [];
  const packageRows = [];
  const packageMorphologies = [];
  const shapes = [
    [0, 250, 0, 0, 0, 0, 0, 0, 0], [1, 0, 350, 0, 0, 0, 0, 0, 0],
    [2, 0, 260, 4, 110, 500, 0, 0, 0], [3, 0, 230, 3, 100, 520, 360, 0, 0],
    [4, 0, 0, 0, 0, 0, 0, 4, 600],
  ];
  for (let index = 0; index < packages; index += 1) {
    const packageSeed = seed();
    packageNames.push(`gem-${index}`);
    packageRows.push([packageSeed, index % 3 === 0 ? 0 : 1, 1, 0, 2 + index, 1, 10 + index, index % 4, index < 3 ? 0 : -1]);
    packageMorphologies.push([...shapes[index % shapes.length], packageSeed]);
  }
  const dependencyStars = [];
  for (let index = 0; index < stars; index += 1) {
    const packageIndex = index % packages;
    packageRows[packageIndex][3] += 1;
    dependencyStars.push([seed(), packageIndex, index % 6, 1 + (index % 2), index % 3, index % 25, index % 60, index % 15]);
  }
  const domains = { ancestorDepth: 9, definitionSites: 3, reopenings: 2, descendants: 30, references: 80, members: 20 };
  return {
    schema: "rubylens.art.v10",
    projectName: "Fixture Cosmos",
    morphology: { family: 2, designation: "Sb", knobs: [0, 240, 3, 105, 380, 0, 0, 0, 42] },
    totals: { namespaces, packages, dependencyStars: stars, renderedDependencyStars: stars },
    domains,
    componentCounts: [namespaces],
    categoryStats,
    namespaceNames: names,
    namespaces: rows,
    packageNames,
    packages: packageRows,
    packageMorphologies,
    dependencySystems: [[seed(), 0]],
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

export default function buildFixtures() {
  const shell = readFileSync(join(ROOT, "assets/shells/report.html"), "utf8");
  const styles = readFileSync(join(ROOT, "assets/styles/report.css"), "utf8");
  const runtime = readFileSync(join(ROOT, "assets/runtime/report.js"), "utf8");
  const model = fixtureModel();
  let html = substituteOnce(shell, "{{REPORT_STYLES}}", styles);
  html = substituteOnce(html, "{{REPORT_RUNTIME}}", runtime);
  html = substituteOnce(html, "{{MODEL_BASE64}}", Buffer.from(JSON.stringify(model)).toString("base64"));
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(join(FIXTURES, "explorer.html"), html);
}
