import { describe, expect, it } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

const namespaceRow = (seed, test = 0) => [seed, 0, test, 1, 1, 0, 2, 3, 2, 1, 0, 2, 1, 0];
const LINKS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 0],
];

function fixtureModel(links = LINKS) {
  return minimalModel({
    totals: { namespaces: 6, packages: 0, dependencyStars: 0 },
    namespaceNames: ["A", "B", "C", "D", "E", "F"],
    namespaces: [
      namespaceRow(11),
      namespaceRow(12, 1),
      namespaceRow(13),
      namespaceRow(14),
      namespaceRow(15, 1),
      namespaceRow(16),
    ],
    constantReferenceLinks: links,
  });
}

function dependencyFixtureModel(links) {
  return minimalModel({
    totals: { namespaces: 4, packages: 2, dependencyStars: 2 },
    namespaceNames: ["Core::A", "Core::B", "Test::A", "Test::B"],
    namespaces: [
      namespaceRow(11),
      namespaceRow(12),
      namespaceRow(13, 1),
      namespaceRow(14, 1),
    ],
    packageNames: ["gem-a", "gem-b"],
    packages: [
      [101, 0, 1, 1, 1, 0, 0, 0, 0],
      [102, 1, 1, 1, 0, 1, 0, 0, 0],
    ],
    packageMorphologies: [
      [2, 0, 240, 3, 105, 380, 0, 0, 0, 101],
      [2, 0, 240, 3, 105, 380, 0, 0, 0, 102],
    ],
    dependencySystems: [[201, 0]],
    dependencyStars: [
      [301, 0, 1, 1, 0, 0, 1, 1],
      [302, 1, 1, 1, 0, 0, 1, 1],
    ],
    constantReferenceLinks: links,
  });
}

const CONCURRENT_LINKS = [
  [1, 0],
  [2, 10],
  [3, 19],
  [4, 18],
];

function concurrentFixtureModel(links = CONCURRENT_LINKS, dependencyCount = 4_980) {
  const namespaces = Array.from({ length: 20 }, (_, index) =>
    namespaceRow(100 + index, index % 4 === 0 ? 1 : 0)
  );
  const dependencyStars = Array.from({ length: dependencyCount }, (_, index) =>
    [500 + index, 0, 1, 1, 0, 0, 1, 1]
  );
  return minimalModel({
    totals: { namespaces: namespaces.length, packages: 1, dependencyStars: dependencyStars.length },
    namespaceNames: namespaces.map((_, index) => `Namespace${index}`),
    namespaces,
    packageNames: ["traffic-fixture"],
    packages: [[401, 0, 1, dependencyStars.length, 1, 0, 0, 0, -1]],
    packageMorphologies: [[2, 0, 240, 3, 105, 380, 0, 0, 0, 401]],
    dependencyStars,
    constantReferenceLinks: links,
  });
}

function launchEpisodes(runtime, through = 2_000) {
  return runtime.travelEpisodesThrough(through)
    .map(episode => ({ linkIndex: episode.linkIndex, startsAt: episode.startsAt }))
    .sort((left, right) => left.startsAt - right.startsAt);
}

function admittedLaunchEpisodes(runtime, through = 2_000) {
  return runtime.travelEpisodesThrough(through)
    .filter(episode => episode.route)
    .map(episode => ({ linkIndex: episode.linkIndex, startsAt: episode.startsAt, route: episode.route }))
    .sort((left, right) => left.startsAt - right.startsAt);
}

function stateForEpisode(runtime, elapsed, episode) {
  return runtime.travelStatesAt(elapsed).find(state =>
    state.episode.linkIndex === episode.linkIndex && state.episode.startsAt === episode.startsAt
  );
}

function stateAtRawProgress(runtime, episode, rawProgress) {
  return stateForEpisode(
    runtime,
    episode.startsAt + runtime.TRAVEL_PRESET.flightDurationMs * rawProgress,
    episode,
  );
}

function drawableTravelStates(runtime, elapsed) {
  return runtime.travelStatesAt(elapsed)
    .filter(state => state.visibility >= runtime.TRAVEL_PRESET.minimumVisibility);
}

function mostDevelopedConcurrentTime(runtime, minimum = 2) {
  let best = null;
  const end = 24_000;
  for (let elapsed = 0; elapsed < end; elapsed += 1) {
    const states = runtime.travelStatesAt(elapsed);
    if (states.length < minimum) continue;
    const score = Math.min(...states.map(state => state.visibility));
    if (!best || score > best.score) best = { elapsed, score };
  }
  if (!best) throw new Error(`fixture never reached ${minimum}-way overlap`);
  return best.elapsed;
}

function firstVisibleTravelOverlap(runtime, minimum = 2, step = 5) {
  let best = null;
  const end = 24_000;
  for (let elapsed = 0; elapsed < end; elapsed += step) {
    const visibleStates = drawableTravelStates(runtime, elapsed);
    if (visibleStates.length < minimum) continue;
    const score = Math.min(...visibleStates.map(state =>
      (elapsed - state.episode.startsAt) / runtime.TRAVEL_PRESET.flightDurationMs
    ));
    if (!best || score > best.score) best = { elapsed, score };
  }
  if (best) return best.elapsed;
  throw new Error(`fixture never rendered ${minimum} concurrent routes`);
}

describe("constant-reference travel links", () => {
  it("presents each resolved reference from the referenced star to its referrer", () => {
    const runtime = loadRuntime(fixtureModel([[3, 1]]));
    expect(runtime.constantReferenceLinks).toEqual([{
      departureIndex: 1,
      arrivalIndex: 3,
    }]);
    expect(runtime.travelEndpointCategory(1)).toBe("tests");
    expect(runtime.travelEndpointCategory(3)).toBe("core");
  });

  it("accepts only workspace referrers targeting workspace or dependency stars", () => {
    const rows = [
      [0, 1],
      [0, 2],
      [2, 0],
      [2, 3],
      [0, 4],
      [2, 5],
      [4, 2],
      [4, 5],
      [6, 0],
      [0, 6],
      [0, 0],
      [0],
      [0.5, 1],
      [-1, 1],
      [0, 1, 2],
      [0, 4],
    ];
    const runtime = loadRuntime(dependencyFixtureModel(rows));

    expect(runtime.constantReferenceLinks.map(link => [
      link.departureIndex,
      link.arrivalIndex,
      runtime.travelEndpointCategory(link.departureIndex),
      runtime.travelEndpointCategory(link.arrivalIndex),
    ])).toEqual([
      [1, 0, "core", "core"],
      [2, 0, "tests", "core"],
      [0, 2, "core", "tests"],
      [3, 2, "tests", "tests"],
      [4, 0, "dependencies", "core"],
      [5, 2, "dependencies", "tests"],
    ]);
    const firstHubRenderIndex = 4 + 2;
    expect(runtime.constantReferenceLinks.every(link =>
      link.departureIndex < firstHubRenderIndex && link.arrivalIndex < firstHubRenderIndex
    )).toBe(true);
  });

  it("decodes at most 1,024 global endpoint pairs", () => {
    const namespaces = Array.from({ length: 1_026 }, (_, index) => namespaceRow(index + 1));
    const runtime = loadRuntime(minimalModel({
      totals: { namespaces: namespaces.length, packages: 0, dependencyStars: 0 },
      namespaceNames: namespaces.map((_, index) => `Namespace${index}`),
      namespaces,
      constantReferenceLinks: Array.from({ length: 1_025 }, (_, index) => [0, index + 1]),
    }));

    expect(runtime.constantReferenceLinks).toHaveLength(1_024);
    expect(runtime.constantReferenceLinks.at(-1)).toEqual({ departureIndex: 1_024, arrivalIndex: 0 });
  });

  it("projects dependency endpoints through package and system expansion", () => {
    const runtime = loadRuntime(dependencyFixtureModel([
      [0, 5],
    ]));
    const dependencyRenderIndex = 4 + 1;
    const offset = dependencyRenderIndex * runtime.SCENE_POINT_STRIDE;
    const position = Array.from(runtime.sceneData.slice(offset, offset + 3));
    const matrix = runtime.viewMatrix();
    const expectedProjection = anchor => {
      const expanded = position.map((value, index) =>
        anchor[index] + (value - anchor[index]) * runtime.DEPENDENCY_EXPANSION
      );
      return runtime.project({ position: expanded, packageIndex: -1, systemIndex: -1 }, matrix);
    };
    const expectClose = (actual, expected) => {
      expect(actual[0]).toBeCloseTo(expected[0], 10);
      expect(actual[1]).toBeCloseTo(expected[1], 10);
      expect(actual[2]).toBeCloseTo(expected[2], 10);
    };

    const namespaceBefore = runtime.projectScenePoint(0, matrix);
    const dependencyBefore = runtime.projectScenePoint(dependencyRenderIndex, matrix);
    runtime.state.expandedPackageIndex = 1;
    expectClose(runtime.projectScenePoint(dependencyRenderIndex, matrix), expectedProjection(runtime.packageAnchors[1]));
    expect(runtime.projectScenePoint(dependencyRenderIndex, matrix)).not.toEqual(dependencyBefore);
    expect(runtime.projectScenePoint(0, matrix)).toEqual(namespaceBefore);

    runtime.state.expandedPackageIndex = null;
    runtime.state.expandedSystemIndex = 0;
    expectClose(runtime.projectScenePoint(dependencyRenderIndex, matrix), expectedProjection(runtime.systemAnchors[0]));
    expect(runtime.projectScenePoint(dependencyRenderIndex, matrix)).not.toEqual(dependencyBefore);
    expect(runtime.projectScenePoint(0, matrix)).toEqual(namespaceBefore);
  });

  it("scales traffic with the rendered project population", () => {
    const runtime = loadRuntime(fixtureModel());

    expect(runtime.travelFlightLimitForPointCount(499)).toBe(1);
    expect(runtime.travelFlightLimitForPointCount(500)).toBe(2);
    expect(runtime.travelFlightLimitForPointCount(4_999)).toBe(2);
    expect(runtime.travelFlightLimitForPointCount(5_000)).toBe(2);
    expect(runtime.travelFlightLimitForPointCount(99_999)).toBe(2);
    expect(runtime.travelFlightLimitForPointCount(100_000)).toBe(2);
    expect(runtime.travelFlightLimit).toBe(1);
  });

  it("stagger starts and endings continuously while keeping a hard simultaneous cap", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    runtime.state.zoom = 3;
    const repeatedRuntime = loadRuntime(concurrentFixtureModel());
    repeatedRuntime.state.zoom = 3;
    const duration = 59_900;
    const episodes = admittedLaunchEpisodes(runtime, duration);
    const repeatedEpisodes = admittedLaunchEpisodes(repeatedRuntime, duration)
      .map(({ linkIndex, startsAt }) => ({ linkIndex, startsAt }));
    const alternateModel = concurrentFixtureModel();
    alternateModel.morphology = [...alternateModel.morphology.slice(0, 9), 8];
    const alternateRuntime = loadRuntime(alternateModel);
    alternateRuntime.state.zoom = 3;
    const alternateEpisodes = admittedLaunchEpisodes(alternateRuntime, duration)
      .map(({ linkIndex, startsAt }) => ({ linkIndex, startsAt }));

    expect(runtime.travelFlightLimit).toBe(2);
    expect(repeatedEpisodes).toEqual(
      episodes.map(({ linkIndex, startsAt }) => ({ linkIndex, startsAt })),
    );
    expect(alternateEpisodes).not.toEqual(repeatedEpisodes);

    const starts = episodes.map(episode => episode.startsAt);
    const launchIntervals = starts.slice(1).map((start, index) => start - starts[index]);
    expect(Math.min(...launchIntervals)).toBeGreaterThan(100);
    expect(Math.max(...launchIntervals)).toBeGreaterThan(Math.min(...launchIntervals) * 1.5);
    expect(new Set(launchIntervals.map(interval => Math.round(interval))).size).toBeGreaterThan(20);
    const crossing = episodes.find(episode =>
      Math.floor(episode.startsAt / 2_000) !==
        Math.floor((episode.startsAt + runtime.TRAVEL_PRESET.flightDurationMs) / 2_000)
    );
    expect(crossing).toBeDefined();
    const crossedBoundary = Math.ceil(crossing.startsAt / 2_000) * 2_000;
    const crossingStates = [-1, 0, 1].map(offset =>
      stateForEpisode(runtime, crossedBoundary + offset, crossing)
    );
    expect(crossingStates.every(state => state?.episode.route === crossing.route)).toBe(true);
    expect(crossingStates.map(state => state.progress)).toEqual(
      [...crossingStates.map(state => state.progress)].sort((left, right) => left - right),
    );

    const events = episodes.flatMap(episode => [
      { at: episode.startsAt, kind: "start", episode },
      { at: episode.startsAt + runtime.TRAVEL_PRESET.flightDurationMs, kind: "end", episode },
    ]).sort((left, right) => left.at - right.at || (left.kind === "end" ? -1 : 1));
    const active = new Set();
    let peakConcurrency = 0;
    for (const event of events) {
      if (event.kind === "end") {
        active.delete(event.episode);
        continue;
      }
      const link = runtime.constantReferenceLinks[event.episode.linkIndex];
      for (const other of active) {
        const otherLink = runtime.constantReferenceLinks[other.linkIndex];
        expect([
          otherLink.departureIndex,
          otherLink.arrivalIndex,
        ]).not.toContain(link.departureIndex);
        expect([
          otherLink.departureIndex,
          otherLink.arrivalIndex,
        ]).not.toContain(link.arrivalIndex);
      }
      active.add(event.episode);
      peakConcurrency = Math.max(peakConcurrency, active.size);
      expect(active.size).toBeLessThanOrEqual(runtime.travelFlightLimit);
    }
    expect(peakConcurrency).toBe(runtime.travelFlightLimit);

    const occupiedBoundaries = Array.from({ length: 29 }, (_, index) =>
      runtime.travelStatesAt((index + 1) * 2_000).length
    ).filter(Boolean);
    expect(occupiedBoundaries.length).toBeGreaterThan(24);
    const steadyStart = 5_000;
    const steadyEnd = 55_000;
    const occupiedMs = episodes.reduce((total, episode) =>
      total + Math.max(0, Math.min(steadyEnd, episode.startsAt + runtime.TRAVEL_PRESET.flightDurationMs) -
        Math.max(steadyStart, episode.startsAt)), 0);
    expect(occupiedMs / (steadyEnd - steadyStart)).toBeGreaterThan(
      runtime.travelFlightLimit * 0.75,
    );
    expect(runtime.travelStatesAt(59_999)).toEqual([]);
    expect(runtime.travelStatesAt(60_000)).toEqual([]);
  });

  it("freezes a route between the projected launch and arrival positions", () => {
    const runtime = loadRuntime(concurrentFixtureModel([CONCURRENT_LINKS[0]]));
    runtime.state.zoom = 3;
    const initialYaw = runtime.state.yaw;
    const direction = runtime.screenRotationYawSign(runtime.state.pitch);
    runtime.travelEpisodesThrough(0);
    const episode = runtime.travelEpisodesThrough(2_000).find(candidate => candidate.route);
    const projectAt = (renderIndex, elapsed) => {
      runtime.state.yaw = initialYaw + direction * runtime.DRIFT_RADIANS_PER_SECOND * elapsed / 1000;
      return runtime.projectScenePoint(renderIndex, runtime.viewMatrix());
    };
    const link = runtime.constantReferenceLinks[episode.linkIndex];
    const expectedDeparture = projectAt(link.departureIndex, episode.startsAt);
    const expectedArrival = projectAt(
      link.arrivalIndex,
      episode.startsAt + runtime.TRAVEL_PRESET.flightDurationMs,
    );

    episode.route.departure.forEach((value, index) => expect(value).toBeCloseTo(expectedDeparture[index], 10));
    episode.route.arrival.forEach((value, index) => expect(value).toBeCloseTo(expectedArrival[index], 10));
  });

  it("restarts from a clean launch delay after a manual camera change", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    runtime.state.zoom = 3;
    const activeAt = firstVisibleTravelOverlap(runtime, runtime.travelFlightLimit);

    runtime.context2D.reset();
    runtime.drawTravelOverlay(activeAt, true);
    expect(runtime.context2D.strokes).toHaveLength(
      runtime.travelFlightLimit * (runtime.TRAVEL_PRESET.tailSegments + 1),
    );
    runtime.zoomBetween(3.5, runtime.state.sceneRight / 2, runtime.state.sceneBottom / 2);
    runtime.context2D.reset();
    runtime.drawTravelOverlay(5, true);
    expect(runtime.context2D.strokes).toEqual([]);
    const resetEpisodes = runtime.travelEpisodesThrough(2_000);
    expect(resetEpisodes.length).toBeGreaterThan(0);
    expect(resetEpisodes[0].startsAt).toBeGreaterThan(5);
  });

  it("keeps the Explorer travel clock monotonic through routine jank cadence", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    const timestamps = Array.from({ length: 20 }, (_, index) => 1_000 + index * 50);
    const elapsed = timestamps.map(timestamp => runtime.explorerTravelElapsedAt(timestamp, true));
    const firstFrame = 1_000 / 60;

    const expectedElapsed = timestamps.map((_, index) => firstFrame + index * 50);
    elapsed.forEach((value, index) => expect(value).toBeCloseTo(expectedElapsed[index], 12));
    const progress = elapsed
      .map(value => runtime.travelStatesAt(value)[0]?.progress)
      .filter(value => value !== undefined);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.every((value, index) => index === 0 || value > progress[index - 1])).toBe(true);
    expect(runtime.explorerTravelElapsedAt(2_000, true)).toBeCloseTo(expectedElapsed.at(-1) + 50, 12);
    expect(runtime.explorerTravelElapsedAt(2_100, false)).toBe(0);
    runtime.context2D.reset();
    runtime.drawTravelOverlay(0, false);
    expect(runtime.context2D.strokes).toEqual([]);
    expect(runtime.explorerTravelElapsedAt(9_000, true)).toBe(firstFrame);
    expect(runtime.travelStatesAt(firstFrame)).toEqual([]);
    expect(runtime.explorerTravelElapsedAt(9_050, true)).toBe(firstFrame + 50);
  });

  it("uses the same capped timebase for Explorer drift and admission prediction", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    runtime.state.drifting = true;
    runtime.state.lastDriftTimestamp = null;
    const timestamps = [3_000, 3_050, 3_110, 3_190, 3_290];
    const direction = runtime.screenRotationYawSign(runtime.state.pitch);
    let origin = null;

    for (const timestamp of timestamps) {
      expect(runtime.advanceExplorerDrift(timestamp)).toBe(true);
      const elapsed = runtime.explorerTravelElapsedAt(timestamp, true);
      if (!origin) {
        runtime.travelEpisodesThrough(elapsed);
        origin = { elapsed, yaw: runtime.state.yaw };
      }
      const expectedYaw = origin.yaw + direction * runtime.DRIFT_RADIANS_PER_SECOND *
        (elapsed - origin.elapsed) / 1000;
      expect(runtime.state.yaw).toBeCloseTo(expectedYaw, 12);
    }
  });

  it("checks the full quadratic, not only its endpoints, against the viewport", () => {
    const runtime = loadRuntime();
    const inset = runtime.TRAVEL_PRESET.admissionInsetPx;
    const right = runtime.state.sceneRight;
    const bottom = runtime.state.sceneBottom;
    const distance = 240;
    const arcHeight = Math.min(
      runtime.TRAVEL_PRESET.arcHeightMax,
      Math.max(runtime.TRAVEL_PRESET.arcHeightMin, distance * runtime.TRAVEL_PRESET.arcHeightPercent / 100),
    );
    const route = {
      departure: [inset, bottom / 2 - distance / 2],
      arrival: [inset, bottom / 2 + distance / 2],
      controlX: inset - arcHeight,
      controlY: bottom / 2,
    };
    expect(runtime.travelCurveFits(route, right, bottom, inset)).toBe(false);
  });

  it("prioritizes dependency routes, rotates them, and supports sparse link sets", () => {
    const runtime = loadRuntime(dependencyFixtureModel([
      [0, 4],
      [0, 5],
      [1, 0],
    ]));
    runtime.state.zoom = 3;
    const preferredCategories = Array.from({ length: 12 }, (_, episodeIndex) => {
      const preferredLink = runtime.constantReferenceLinks[
        runtime.travelLinkCandidatesForEpisode(episodeIndex, new Set())[0]
      ];
      return runtime.travelEndpointCategory(preferredLink.departureIndex) === "dependencies"
        ? "dependencies"
        : "workspace";
    });
    const episodes = runtime.travelEpisodesThrough(12_000);
    const firstHalf = runtime.travelEpisodesThrough(6_000);

    expect(runtime.travelFlightLimit).toBe(1);
    expect(preferredCategories.filter(category => category === "dependencies")).toHaveLength(9);
    expect(preferredCategories.filter(category => category === "workspace")).toHaveLength(3);
    expect(firstHalf).toEqual(episodes.filter(episode => episode.startsAt <= 6_000));
    expect(episodes.some(episode => {
      const link = runtime.constantReferenceLinks[episode.linkIndex];
      return episode.route && runtime.travelEndpointCategory(link.departureIndex) !== "dependencies";
    })).toBe(true);
    const sparse = launchEpisodes(loadRuntime(fixtureModel(LINKS.slice(0, 2))));
    expect(sparse.length).toBeGreaterThan(0);
    expect(sparse.every(episode => [0, 1].includes(episode.linkIndex))).toBe(true);
  });

  it("rejects shared endpoints across overlapping launches", () => {
    const runtime = loadRuntime(concurrentFixtureModel([
      [1, 0],
      [2, 0],
      [2, 10],
      [3, 19],
      [4, 18],
      [5, 17],
    ]));
    runtime.state.zoom = 3;
    runtime.travelEpisodesThrough(20_000);
    let sawOverlap = false;
    for (let elapsed = 0; elapsed < 20_000; elapsed += 25) {
      const states = runtime.travelStatesAt(elapsed);
      if (states.length > 1) sawOverlap = true;
      for (let left = 0; left < states.length; left += 1) {
        const leftLink = runtime.constantReferenceLinks[states[left].episode.linkIndex];
        for (let right = left + 1; right < states.length; right += 1) {
          const rightLink = runtime.constantReferenceLinks[states[right].episode.linkIndex];
          expect([
            leftLink.departureIndex,
            leftLink.arrivalIndex,
          ]).not.toContain(rightLink.departureIndex);
          expect([
            leftLink.departureIndex,
            leftLink.arrivalIndex,
          ]).not.toContain(rightLink.arrivalIndex);
        }
      }
    }
    expect(sawOverlap).toBe(true);
  });

  it("bends each frozen route by the configured arc height", () => {
    const runtime = loadRuntime(concurrentFixtureModel([CONCURRENT_LINKS[0]]));
    runtime.state.zoom = 3;
    const route = runtime.travelEpisodesThrough(2_000).find(episode => episode.route).route;
    const distance = Math.hypot(
      route.arrival[0] - route.departure[0],
      route.arrival[1] - route.departure[1],
    );
    const midpointX = (route.departure[0] + route.arrival[0]) / 2;
    const midpointY = (route.departure[1] + route.arrival[1]) / 2;
    const expectedArcHeight = Math.min(
      runtime.TRAVEL_PRESET.arcHeightMax,
      Math.max(
        runtime.TRAVEL_PRESET.arcHeightMin,
        distance * runtime.TRAVEL_PRESET.arcHeightPercent / 100,
      ),
    );
    const curveMidpointX = runtime.quadraticCoordinate(route.departure[0], route.controlX, route.arrival[0], 0.5);
    const curveMidpointY = runtime.quadraticCoordinate(route.departure[1], route.controlY, route.arrival[1], 0.5);

    expect(Math.hypot(route.controlX - midpointX, route.controlY - midpointY))
      .toBeCloseTo(expectedArcHeight, 10);
    expect(Math.hypot(curveMidpointX - midpointX, curveMidpointY - midpointY))
      .toBeCloseTo(expectedArcHeight / 2, 10);
  });

  it("suppresses imperceptible fade endpoints and projected routes shorter than 48 pixels", () => {
    const fadingRuntime = loadRuntime(concurrentFixtureModel([CONCURRENT_LINKS[0]]));
    fadingRuntime.state.zoom = 3;
    const fadingEpisode = launchEpisodes(fadingRuntime)[0];
    const fadingElapsed = fadingEpisode.startsAt + fadingRuntime.TRAVEL_PRESET.flightDurationMs * 0.001;
    expect(fadingRuntime.travelStatesAt(fadingElapsed)).toHaveLength(1);
    fadingRuntime.drawTravelOverlay(fadingElapsed, true);
    expect(fadingRuntime.context2D.strokes).toEqual([]);

    const shortRuntime = loadRuntime(concurrentFixtureModel([CONCURRENT_LINKS[0]]));
    shortRuntime.state.zoom = 0.1;
    const shortEpisode = launchEpisodes(shortRuntime)[0];
    const shortElapsed = shortEpisode.startsAt + shortRuntime.TRAVEL_PRESET.flightDurationMs / 2;
    expect(shortRuntime.travelStatesAt(shortElapsed)).toEqual([]);
    shortRuntime.drawTravelOverlay(shortElapsed, true);
    expect(shortRuntime.context2D.strokes).toEqual([]);
  });

  it("uses the broad, feathered meteor preset without a projectile head", () => {
    const runtime = loadRuntime(fixtureModel());
    const episode = launchEpisodes(runtime)[0];
    const startsAt = episode.startsAt;
    const endsAt = startsAt + runtime.TRAVEL_PRESET.flightDurationMs;

    expect(runtime.TRAVEL_PRESET.flightDurationMs).toBe(2_200);
    expect(runtime.TRAVEL_PRESET.initialDelayMin).toBe(0.2);
    expect(runtime.TRAVEL_PRESET.initialDelayRange).toBe(0.5);
    expect(runtime.TRAVEL_PRESET.intervalMin).toBe(0.55);
    expect(runtime.TRAVEL_PRESET.intervalRange).toBe(0.75);
    expect(runtime.TRAVEL_PRESET.handoffGapMinMs).toBe(24);
    expect(runtime.TRAVEL_PRESET.handoffGapRangeMs).toBe(126);
    expect(runtime.TRAVEL_PRESET.loopQuietMs).toBe(80);
    expect(runtime.TRAVEL_PRESET.minimumVisibility).toBe(0.04);
    expect(runtime.TRAVEL_PRESET.arcHeightPercent).toBe(24);
    expect(runtime.TRAVEL_PRESET.arcHeightMin).toBe(16);
    expect(runtime.TRAVEL_PRESET.arcHeightMax).toBe(120);
    expect(stateForEpisode(runtime, startsAt - 0.001, episode)).toBeUndefined();
    expect(stateForEpisode(runtime, startsAt + 0.001, episode)?.episode.linkIndex).toBe(episode.linkIndex);
    expect(stateForEpisode(runtime, endsAt - 0.001, episode)?.episode.linkIndex).toBe(episode.linkIndex);
    expect(stateForEpisode(runtime, endsAt + 0.001, episode)).toBeUndefined();
    expect(runtime.TRAVEL_PRESET.tailFraction).toBe(0.7);
    expect(runtime.TRAVEL_PRESET.tailSegments).toBe(24);
    expect(runtime.TRAVEL_PRESET.tailLengthPx).toBe(168);
    expect(runtime.TRAVEL_PRESET.lineWidth).toBe(2.2);
    expect(runtime.TRAVEL_PRESET.tailAlpha).toBe(0.38);
    expect(runtime.TRAVEL_PRESET.tailHaloAlpha).toBe(0.09);
    expect(runtime.TRAVEL_PRESET.tailHaloBlur).toBe(2.2);
    expect(runtime.TRAVEL_PRESET.tipLengthPx).toBe(1.5);
    expect(runtime.TRAVEL_PRESET.tipWidth).toBe(0.64);
    expect(runtime.TRAVEL_PRESET.tipAlpha).toBe(0.3);
    expect(runtime.TRAVEL_PRESET.tipGlowAlpha).toBe(0.07);
    expect(runtime.TRAVEL_PRESET.tipGlowBlur).toBe(1.4);
    expect(runtime.TRAVEL_PRESET).not.toHaveProperty("cycleDurationMs");
    expect(runtime.TRAVEL_PRESET).not.toHaveProperty("launchWindowMs");
    expect(runtime.TRAVEL_PRESET).not.toHaveProperty("headRadius");
    const quarter = stateAtRawProgress(runtime, episode, 0.25);
    const halfway = stateAtRawProgress(runtime, episode, 0.5);
    const threeQuarters = stateAtRawProgress(runtime, episode, 0.75);
    expect(quarter.progress).toBeLessThan(0.25);
    expect(halfway.progress).toBeCloseTo(0.5, 12);
    expect(threeQuarters.progress).toBeGreaterThan(0.75);
    expect(stateAtRawProgress(runtime, episode, 0.001).visibility).toBeLessThan(runtime.TRAVEL_PRESET.minimumVisibility);
    expect(stateAtRawProgress(runtime, episode, 0.2).visibility).toBe(1);
    expect(stateAtRawProgress(runtime, episode, 0.95).visibility).toBeLessThan(1);
  });

  it("renders only the size-scaled concurrent, same-hue meteor wakes with tiny linear heads", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    runtime.state.zoom = 3;
    const activeAt = firstVisibleTravelOverlap(runtime, runtime.travelFlightLimit);
    runtime.context2D.reset();

    runtime.drawTravelOverlay(activeAt, true);
    const visibleStates = drawableTravelStates(runtime, activeAt);
    const links = visibleStates.map(state => runtime.constantReferenceLinks[state.episode.linkIndex]);
    const strokesPerFlight = runtime.TRAVEL_PRESET.tailSegments + 1;
    expect(runtime.travelFlightLimit).toBe(2);
    expect(links).toHaveLength(runtime.travelFlightLimit);
    expect(runtime.context2D.strokes).toHaveLength(links.length * strokesPerFlight);
    expect(runtime.context2D.arcs).toEqual([]);
    expect(runtime.context2D.fills).toBe(0);
    expect(new Set(visibleStates.map(state => state.episode.linkIndex)).size).toBe(links.length);

    const renderedTailLengths = [];
    const tailToTipRatios = [];
    const categoryRgb = {
      core: "244,82,132",
      tests: "87,204,255",
      dependencies: "255,184,77",
    };
    for (let index = 0; index < links.length; index += 1) {
      const strokes = runtime.context2D.strokes.slice(index * strokesPerFlight, (index + 1) * strokesPerFlight);
      const tail = strokes.slice(0, -1);
      const tip = strokes.at(-1);
      const renderedTailLength = tail.reduce((sum, stroke) => sum + stroke.length, 0);
      const peakTailWidth = Math.max(...tail.map(stroke => stroke.lineWidth));
      const expectedRgb = categoryRgb[runtime.travelEndpointCategory(links[index].departureIndex)];
      renderedTailLengths.push(renderedTailLength);
      tailToTipRatios.push(renderedTailLength / tip.length);

      expect(renderedTailLength).toBeGreaterThan(12);
      expect(peakTailWidth).toBeLessThanOrEqual(runtime.TRAVEL_PRESET.lineWidth);
      expect(tail[0].lineWidth).toBeLessThan(peakTailWidth);
      expect(tail.at(-1).lineWidth).toBeLessThan(peakTailWidth);
      expect(tail.every(stroke => stroke.lineCap === "round")).toBe(true);
      expect(strokes.every(stroke => stroke.strokeStyle.startsWith(`rgba(${expectedRgb},`))).toBe(true);
      expect(strokes.every(stroke => stroke.shadowColor.startsWith(`rgba(${expectedRgb},`))).toBe(true);
      expect(strokes.every(stroke => !stroke.strokeStyle.includes("255,248,244"))).toBe(true);
      expect(tip.length).toBeLessThanOrEqual(4);
      expect(tip.lineWidth).toBe(runtime.TRAVEL_PRESET.tipWidth);
      expect(tip.shadowBlur).toBe(runtime.TRAVEL_PRESET.tipGlowBlur);
      expect(renderedTailLength / tip.length).toBeGreaterThan(6);
    }
    expect(Math.max(...renderedTailLengths)).toBeGreaterThan(30);
    expect(Math.max(...tailToTipRatios)).toBeGreaterThan(10);
  });

  it("keeps large-project traffic at the two-flight cap", () => {
    const links = Array.from({ length: 20 }, (_, index) => [index, 20 + index]);
    const runtime = loadRuntime(concurrentFixtureModel(links, 99_980));
    runtime.state.zoom = 3;
    const activeAt = firstVisibleTravelOverlap(runtime, 2);

    runtime.context2D.reset();
    runtime.drawTravelOverlay(activeAt, true);

    expect(runtime.travelFlightLimit).toBe(2);
    expect(drawableTravelStates(runtime, activeAt)).toHaveLength(2);
    expect(runtime.context2D.strokes).toHaveLength(2 * (runtime.TRAVEL_PRESET.tailSegments + 1));
  });

  it("draws only the admitted concurrent trails, then clears and suppresses them for reduced motion", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    runtime.state.zoom = 3;
    const activeAt = firstVisibleTravelOverlap(runtime, runtime.travelFlightLimit);

    runtime.context2D.reset();
    runtime.drawTravelOverlay(activeAt, true);
    expect(runtime.context2D.strokes).toHaveLength(
      runtime.travelFlightLimit * (runtime.TRAVEL_PRESET.tailSegments + 1),
    );
    runtime.context2D.reset();
    runtime.drawTravelOverlay(activeAt, false);
    expect(runtime.context2D.strokes).toEqual([]);

    const originalMatchMedia = window.matchMedia;
    window.matchMedia = query => query === "(prefers-reduced-motion: reduce)"
      ? {
          matches: true,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() { return true; },
        }
      : originalMatchMedia.call(window, query);
    try {
      const reducedRuntime = loadRuntime(concurrentFixtureModel());
      reducedRuntime.state.zoom = 3;
      const reducedActiveAt = mostDevelopedConcurrentTime(reducedRuntime);
      reducedRuntime.context2D.reset();
      reducedRuntime.drawTravelOverlay(reducedActiveAt, true);
      expect(reducedRuntime.context2D.strokes).toEqual([]);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

});
