import { performance } from "node:perf_hooks";

const NAMESPACE_COUNT = 120_000;
const PACKAGE_COUNT = 5_000;
const RESULT_LIMIT = 24;
const QUERIES = ["area119", "node119999", "package-4999", "node", "not-present"];

function syntheticNames() {
  const names = [];
  for (let index = 0; index < NAMESPACE_COUNT; index += 1) {
    names.push(`Domain::Area${String(index % 240).padStart(3, "0")}::Node${String(index).padStart(6, "0")}`);
  }
  for (let index = 0; index < PACKAGE_COUNT; index += 1) {
    names.push(`package-${String(index).padStart(4, "0")}`);
  }
  return names;
}

function rankedMatches(entries, query, candidates = entries.keys()) {
  const buckets = [[], [], [], []];
  for (const index of candidates) {
    const key = entries[index];
    const position = key.indexOf(query);
    if (position < 0) continue;
    const rank = position === 0 ? (key.length === query.length ? 0 : 1) : /[^a-z0-9]/.test(key[position - 1]) ? 2 : 3;
    if (buckets[rank].length < RESULT_LIMIT) buckets[rank].push(index);
  }
  return buckets.flat().slice(0, RESULT_LIMIT);
}

function buildFlat(names) {
  return names.map(name => name.toLowerCase());
}

function trigrams(value) {
  const grams = new Set();
  for (let index = 0; index <= value.length - 3; index += 1) grams.add(value.slice(index, index + 3));
  return grams;
}

function buildTrigram(names) {
  const entries = buildFlat(names);
  const postings = new Map();
  entries.forEach((key, index) => {
    for (const gram of trigrams(key)) {
      const list = postings.get(gram);
      if (list) list.push(index);
      else postings.set(gram, [index]);
    }
  });
  return { entries, postings };
}

function trigramCandidates(index, query) {
  if (query.length < 3) return index.entries.keys();
  const lists = [...trigrams(query)].map(gram => index.postings.get(gram) || []);
  if (!lists.length || lists.some(list => list.length === 0)) return [];
  lists.sort((left, right) => left.length - right.length);
  const allowed = lists.slice(1).map(list => new Set(list));
  return lists[0].filter(candidate => allowed.every(set => set.has(candidate)));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureBuild(builder, names) {
  global.gc?.();
  const beforeHeap = process.memoryUsage().heapUsed;
  const started = performance.now();
  const index = builder(names);
  const buildMs = performance.now() - started;
  global.gc?.();
  return { index, buildMs, heapDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - beforeHeap) };
}

function measureQueries(run) {
  return Object.fromEntries(QUERIES.map(query => {
    const timings = [];
    let resultCount = 0;
    for (let iteration = 0; iteration < 9; iteration += 1) {
      const started = performance.now();
      resultCount = run(query).length;
      timings.push(performance.now() - started);
    }
    return [query, { medianMs: median(timings), maxMs: Math.max(...timings), resultCount }];
  }));
}

const names = syntheticNames();
const flat = measureBuild(buildFlat, names);
const flatMetrics = {
  strategy: "lazy-normalized-flat-scan",
  buildMs: flat.buildMs,
  heapDeltaBytes: flat.heapDeltaBytes,
  normalizedCharacters: flat.index.reduce((sum, name) => sum + name.length, 0),
  arraySlots: flat.index.length,
  queries: measureQueries(query => rankedMatches(flat.index, query.toLowerCase())),
};

flat.index = null;
global.gc?.();

const trigram = measureBuild(buildTrigram, names);
const postingCount = [...trigram.index.postings.values()].reduce((sum, list) => sum + list.length, 0);
const trigramMetrics = {
  strategy: "lazy-trigram-inverted-index",
  buildMs: trigram.buildMs,
  heapDeltaBytes: trigram.heapDeltaBytes,
  normalizedCharacters: trigram.index.entries.reduce((sum, name) => sum + name.length, 0),
  postingCount,
  trigramCount: trigram.index.postings.size,
  queries: measureQueries(query => {
    const normalized = query.toLowerCase();
    return rankedMatches(trigram.index.entries, normalized, trigramCandidates(trigram.index, normalized));
  }),
};

console.log(JSON.stringify({
  syntheticModel: { namespaces: NAMESPACE_COUNT, dependencySystems: PACKAGE_COUNT },
  resultLimit: RESULT_LIMIT,
  gcExposed: typeof global.gc === "function",
  strategies: [flatMetrics, trigramMetrics],
}, null, 2));
