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

  it("freezes a rotating dependency departure at launch and its destination at landing", () => {
    const runtime = loadRuntime(concurrentFixtureModel([[0, 20]]));
    runtime.state.zoom = 0.5;
    runtime.state.dependencySpinElapsed = 1_234;
    runtime.travelEpisodesThrough(0);
    const episode = runtime.travelEpisodesThrough(12_000).find(candidate => candidate.route);
    const link = runtime.constantReferenceLinks[episode.linkIndex];
    const launchSpin = 1_234 + episode.startsAt;
    const landingSpin = launchSpin + runtime.TRAVEL_PRESET.flightDurationMs;
    const expectedDeparture = runtime.scenePointWorldPosition(link.departureIndex, launchSpin);
    const expectedArrival = runtime.scenePointWorldPosition(link.arrivalIndex, landingSpin);

    episode.route.departure.forEach((value, index) =>
      expect(value).toBeCloseTo(expectedDeparture[index], 10)
    );
    episode.route.arrival.forEach((value, index) =>
      expect(value).toBeCloseTo(expectedArrival[index], 10)
    );
    const dependencyAtLanding = runtime.scenePointWorldPosition(link.departureIndex, landingSpin);
    expect(Math.hypot(
      dependencyAtLanding[0] - episode.route.departure[0],
      dependencyAtLanding[1] - episode.route.departure[1],
      dependencyAtLanding[2] - episode.route.departure[2],
    )).toBeGreaterThan(0.01);
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

  it("projects one immutable world route through the live camera without drift", () => {
    const runtime = loadRuntime(concurrentFixtureModel([CONCURRENT_LINKS[0]]));
    runtime.state.zoom = 3;
    const initialYaw = runtime.state.yaw;
    runtime.travelEpisodesThrough(0);
    const episode = runtime.travelEpisodesThrough(2_000).find(candidate => candidate.route);
    const elapsed = episode.startsAt + runtime.TRAVEL_PRESET.flightDurationMs * 0.7;
    const state = stateForEpisode(runtime, elapsed, episode);
    const route = episode.route;
    const frozenRoute = structuredClone(route);
    runtime.state.yaw = initialYaw + runtime.screenRotationYawSign(runtime.state.pitch) *
      runtime.DRIFT_RADIANS_PER_SECOND * elapsed / 1000 * 8;
    runtime.state.pitch = 0.72;
    runtime.state.zoom = 2.4;
    runtime.state.panX = 37;
    runtime.state.panY = -23;
    const matrix = runtime.viewMatrix();
    const projectedAt = progress => {
      const world = route.departure.map((value, index) =>
        runtime.quadraticCoordinate(value, route.control[index], route.arrival[index], progress)
      );
      return runtime.projectCoordinates(world[0], world[1], world[2], matrix);
    };
    const tangentProgress = state.progress < 0.999 ? state.progress + 0.001 : state.progress - 0.001;
    const expectedHead = projectedAt(state.progress);
    const expectedTangent = projectedAt(tangentProgress);
    const pixelsPerProgress = Math.hypot(
      expectedTangent[0] - expectedHead[0],
      expectedTangent[1] - expectedHead[1],
    ) / Math.abs(tangentProgress - state.progress);
    const wakeEnd = Math.max(
      0,
      state.progress - runtime.TRAVEL_PRESET.headLengthPx *
        (1 - runtime.TRAVEL_PRESET.tailHeadOverlap) / pixelsPerProgress,
    );
    const tailStart = Math.max(
      0,
      wakeEnd - runtime.TRAVEL_PRESET.tailFraction,
      wakeEnd - runtime.TRAVEL_PRESET.tailLengthPx / pixelsPerProgress,
    );
    const expectedStart = projectedAt(tailStart);
    const projectedDeparture = projectedAt(0);
    const projectedArrival = projectedAt(1);
    const projectedControl = runtime.projectCoordinates(
      route.control[0], route.control[1], route.control[2], matrix,
    );
    const screenQuadraticHead = [0, 1].map(index => runtime.quadraticCoordinate(
      projectedDeparture[index], projectedControl[index], projectedArrival[index], state.progress,
    ));
    runtime.context2D.reset();
    runtime.drawTravelOverlay(elapsed, true);
    runtime.context2D.strokes[0].from.forEach((value, index) =>
      expect(value).toBeCloseTo(expectedStart[index], 10)
    );
    runtime.context2D.fillPaths[0].translation.forEach((value, index) =>
      expect(value).toBeCloseTo(expectedHead[index], 10)
    );
    expect(Math.hypot(
      expectedHead[0] - screenQuadraticHead[0],
      expectedHead[1] - screenQuadraticHead[1],
    )).toBeGreaterThan(0.01);
    expect(route).toEqual(frozenRoute);
  });

  it("keeps active world routes visible through manual zoom and orbit", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    runtime.state.zoom = 3;
    const activeAt = firstVisibleTravelOverlap(runtime, runtime.travelFlightLimit);
    const episodes = drawableTravelStates(runtime, activeAt).map(state => state.episode);

    runtime.context2D.reset();
    runtime.drawTravelOverlay(activeAt, true);
    const initialHeads = runtime.context2D.fillPaths.map(path => path.translation);
    expect(runtime.context2D.strokes).toHaveLength(
      runtime.travelFlightLimit * runtime.TRAVEL_PRESET.tailSegments,
    );
    expect(runtime.context2D.fills).toBe(runtime.travelFlightLimit);
    runtime.zoomBetween(3.5, runtime.state.sceneRight / 2, runtime.state.sceneBottom / 2);
    runtime.state.yaw += 0.08;
    runtime.context2D.reset();
    runtime.drawTravelOverlay(activeAt, true);
    expect(runtime.context2D.strokes.length).toBeGreaterThan(0);
    expect(runtime.context2D.fills).toBe(runtime.travelFlightLimit);
    expect(runtime.context2D.fillPaths.map(path => path.translation)).not.toEqual(initialHeads);
    drawableTravelStates(runtime, activeAt).forEach((state, index) =>
      expect(state.episode).toBe(episodes[index])
    );
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

  it("uses the same capped timebase for Explorer drift and travel", () => {
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

  it("requires the screen-space control hull, not only its endpoints, inside the viewport", () => {
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
    expect(runtime.travelGuideFits(route, right, bottom, inset)).toBe(false);
  });

  it("rejects perspective escapes and keeps admitted unequal-depth curves bounded", () => {
    const runtime = loadRuntime();
    runtime.state.yaw = 0;
    runtime.state.pitch = 0;
    runtime.state.zoom = 1;
    runtime.state.panX = 0;
    runtime.state.panY = 0;
    const inset = runtime.TRAVEL_PRESET.admissionInsetPx;
    const right = runtime.state.sceneRight;
    const bottom = runtime.state.sceneBottom;
    const { cameraDistance, cameraFocalLength } = runtime.layoutMetricsForCoreCount(0, runtime.morphology);
    const atDepth = ([screenX, screenY], depth) => [
      (screenX - runtime.state.sceneCenterX) * depth / cameraFocalLength,
      (screenY - runtime.state.sceneCenterY) * depth / cameraFocalLength,
      cameraDistance - depth,
    ];
    const departureDepth = 40;
    const arrivalDepth = 400;
    const routeFromGuide = guide => ({
      departure: atDepth(guide.departure, departureDepth),
      control: atDepth(
        [guide.controlX, guide.controlY],
        (departureDepth + arrivalDepth) / 2,
      ),
      arrival: atDepth(guide.arrival, arrivalDepth),
    });
    const matrix = runtime.viewMatrix();
    const unsafeGuide = {
      departure: [inset + right * 0.04, bottom / 2],
      arrival: [right - inset - 4, bottom / 2],
      controlX: inset - right * 0.12,
      controlY: bottom / 2,
    };
    const guideSamples = Array.from({ length: 1_001 }, (_, index) =>
      runtime.quadraticCoordinate(
        unsafeGuide.departure[0],
        unsafeGuide.controlX,
        unsafeGuide.arrival[0],
        index / 1_000,
      )
    );
    expect(guideSamples.every(value => value >= inset && value <= right - inset)).toBe(true);
    expect(runtime.travelGuideFits(unsafeGuide, right, bottom, inset)).toBe(false);
    const unsafeProjected = Array.from({ length: 1_001 }, (_, index) =>
      runtime.projectTravelRoutePoint(routeFromGuide(unsafeGuide), index / 1_000, matrix)
    );
    expect(unsafeProjected.some(point => point[0] < inset)).toBe(true);

    const guide = {
      departure: [inset + 24, bottom * 0.35],
      arrival: [right - inset - 24, bottom * 0.65],
      controlX: right / 2,
      controlY: inset + 24,
    };
    expect(runtime.travelGuideFits(guide, right, bottom, inset)).toBe(true);
    const route = routeFromGuide(guide);
    const projected = Array.from({ length: 1_001 }, (_, index) =>
      runtime.projectTravelRoutePoint(route, index / 1_000, matrix)
    );
    expect(projected.every(Boolean)).toBe(true);
    expect(projected.every(point =>
      point[0] >= inset && point[0] <= right - inset &&
      point[1] >= inset && point[1] <= bottom - inset
    )).toBe(true);

    const [departure, arrival] = [projected[0], projected.at(-1)];
    const dx = arrival[0] - departure[0];
    const dy = arrival[1] - departure[1];
    const chordLength = Math.hypot(dx, dy);
    const maximumBend = Math.max(...projected.map(point =>
      Math.abs(dx * (point[1] - departure[1]) - dy * (point[0] - departure[0])) / chordLength
    ));
    expect(maximumBend).toBeGreaterThan(40);
  });

  it("draws visible wake and head samples when a route endpoint crosses the near plane", () => {
    const runtime = loadRuntime(concurrentFixtureModel([CONCURRENT_LINKS[0]]));
    runtime.state.zoom = 3;
    runtime.travelEpisodesThrough(0);
    const episode = runtime.travelEpisodesThrough(2_000).find(candidate => candidate.route);
    runtime.state.yaw = 0;
    runtime.state.pitch = 0;
    runtime.state.zoom = 1;
    runtime.state.panX = 0;
    runtime.state.panY = 0;

    const { cameraDistance, cameraFocalLength } = runtime.layoutMetricsForCoreCount(15, runtime.morphology);
    const atDepth = ([screenX, screenY], depth) => [
      (screenX - runtime.state.sceneCenterX) * depth / cameraFocalLength,
      (screenY - runtime.state.sceneCenterY) * depth / cameraFocalLength,
      cameraDistance - depth,
    ];
    episode.route = {
      departure: atDepth([runtime.state.sceneCenterX - 180, runtime.state.sceneCenterY + 40], 30),
      control: atDepth([runtime.state.sceneCenterX, runtime.state.sceneCenterY - 80], 120),
      arrival: atDepth([runtime.state.sceneCenterX + 180, runtime.state.sceneCenterY + 40], 200),
    };
    const elapsed = episode.startsAt + runtime.TRAVEL_PRESET.flightDurationMs * 0.4;
    const state = stateForEpisode(runtime, elapsed, episode);
    const matrix = runtime.viewMatrix();
    expect(runtime.projectTravelRoutePoint(episode.route, 0, matrix)).toBeNull();
    expect(runtime.projectTravelRoutePoint(episode.route, state.progress, matrix)).not.toBeNull();

    runtime.context2D.reset();
    runtime.drawTravelOverlay(elapsed, true);
    expect(runtime.context2D.strokes.length).toBeGreaterThan(0);
    expect(runtime.context2D.strokes.length).toBeLessThan(runtime.TRAVEL_PRESET.tailSegments);
    expect(runtime.context2D.fills).toBe(1);
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

  it("bends each admitted route by the configured arc height", () => {
    const runtime = loadRuntime(concurrentFixtureModel([CONCURRENT_LINKS[0]]));
    runtime.state.zoom = 3;
    const initialYaw = runtime.state.yaw;
    runtime.travelEpisodesThrough(0);
    const episode = runtime.travelEpisodesThrough(2_000).find(candidate => candidate.route);
    const route = episode.route;
    const midpointElapsed = episode.startsAt + runtime.TRAVEL_PRESET.flightDurationMs / 2;
    runtime.state.yaw = initialYaw + runtime.screenRotationYawSign(runtime.state.pitch) *
      runtime.DRIFT_RADIANS_PER_SECOND * midpointElapsed / 1000;
    const matrix = runtime.viewMatrix();
    const departure = runtime.projectCoordinates(
      route.departure[0], route.departure[1], route.departure[2], matrix,
    );
    const control = runtime.projectCoordinates(
      route.control[0], route.control[1], route.control[2], matrix,
    );
    const arrival = runtime.projectCoordinates(
      route.arrival[0], route.arrival[1], route.arrival[2], matrix,
    );
    const distance = Math.hypot(
      arrival[0] - departure[0],
      arrival[1] - departure[1],
    );
    const midpointX = (departure[0] + arrival[0]) / 2;
    const midpointY = (departure[1] + arrival[1]) / 2;
    const expectedArcHeight = Math.min(
      runtime.TRAVEL_PRESET.arcHeightMax,
      Math.max(
        runtime.TRAVEL_PRESET.arcHeightMin,
        distance * runtime.TRAVEL_PRESET.arcHeightPercent / 100,
      ),
    );
    expect(Math.hypot(control[0] - midpointX, control[1] - midpointY))
      .toBeCloseTo(expectedArcHeight, 10);
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

  it("uses the compact tapered meteor preset without a projectile head", () => {
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
    expect(runtime.TRAVEL_PRESET.tailSegments).toBe(12);
    expect(runtime.TRAVEL_PRESET.tailLengthPx).toBe(145.6);
    expect(runtime.TRAVEL_PRESET.lineWidth).toBe(1.91);
    expect(runtime.TRAVEL_PRESET.tailAlpha).toBe(0.38);
    expect(runtime.TRAVEL_PRESET).not.toHaveProperty("tailHaloAlpha");
    expect(runtime.TRAVEL_PRESET).not.toHaveProperty("tailHaloBlur");
    expect(runtime.TRAVEL_PRESET.tailHeadOverlap).toBe(0.82);
    expect(runtime.TRAVEL_PRESET.headLengthPx).toBe(6.5);
    expect(runtime.TRAVEL_PRESET.headWidthPx).toBe(1.82);
    expect(runtime.TRAVEL_PRESET.headAlpha).toBe(0.64);
    expect(runtime.TRAVEL_PRESET.headGlowAlpha).toBe(0.12);
    expect(runtime.TRAVEL_PRESET.headGlowBlur).toBe(2.95);
    expect(runtime.TRAVEL_PRESET).not.toHaveProperty("tipLengthPx");
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

  it("renders only the size-scaled concurrent, same-hue meteor wakes with single drop heads", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    runtime.state.zoom = 3;
    const activeAt = firstVisibleTravelOverlap(runtime, runtime.travelFlightLimit);
    runtime.context2D.reset();

    runtime.drawTravelOverlay(activeAt, true);
    const visibleStates = drawableTravelStates(runtime, activeAt);
    const links = visibleStates.map(state => runtime.constantReferenceLinks[state.episode.linkIndex]);
    const strokesPerFlight = runtime.TRAVEL_PRESET.tailSegments;
    expect(runtime.travelFlightLimit).toBe(2);
    expect(links).toHaveLength(runtime.travelFlightLimit);
    expect(runtime.context2D.strokes).toHaveLength(links.length * strokesPerFlight);
    expect(runtime.context2D.arcs).toEqual([]);
    expect(runtime.context2D.fills).toBe(links.length);
    expect(runtime.context2D.fillPaths).toHaveLength(links.length);
    expect(new Set(visibleStates.map(state => state.episode.linkIndex)).size).toBe(links.length);

    const renderedTailLengths = [];
    const tailToHeadRatios = [];
    const categoryRgb = {
      core: "244,82,132",
      tests: "87,204,255",
      dependencies: "255,184,77",
    };
    for (let index = 0; index < links.length; index += 1) {
      const strokes = runtime.context2D.strokes.slice(index * strokesPerFlight, (index + 1) * strokesPerFlight);
      const tail = strokes;
      const head = runtime.context2D.fillPaths[index];
      const state = visibleStates[index];
      const route = state.episode.route;
      const matrix = runtime.viewMatrix();
      const renderedTailLength = tail.reduce((sum, stroke) => sum + stroke.length, 0);
      const peakTailWidth = Math.max(...tail.map(stroke => stroke.lineWidth));
      const expectedRgb = categoryRgb[runtime.travelEndpointCategory(links[index].departureIndex)];
      renderedTailLengths.push(renderedTailLength);
      tailToHeadRatios.push(renderedTailLength / runtime.TRAVEL_PRESET.headLengthPx);

      expect(renderedTailLength).toBeGreaterThan(12);
      expect(peakTailWidth).toBeLessThanOrEqual(runtime.TRAVEL_PRESET.lineWidth);
      expect(tail[0].lineWidth).toBeLessThan(peakTailWidth);
      expect(tail.at(-1).lineWidth).toBeCloseTo(peakTailWidth, 12);
      expect(tail.every(stroke => stroke.lineCap === "round")).toBe(true);
      expect(tail.every(stroke => stroke.strokeStyle.startsWith(`rgba(${expectedRgb},`))).toBe(true);
      expect(tail.every(stroke => stroke.shadowBlur === 0)).toBe(true);
      expect(tail.every(stroke => !stroke.strokeStyle.includes("255,248,244"))).toBe(true);
      expect(head.fillStyle.startsWith(`rgba(${expectedRgb},`)).toBe(true);
      expect(head.shadowColor.startsWith(`rgba(${expectedRgb},`)).toBe(true);
      expect(head.shadowBlur).toBe(runtime.TRAVEL_PRESET.headGlowBlur);
      expect(head.closed).toBe(true);
      expect(head.commands.map(command => command[0])).toEqual([
        "moveTo",
        "bezierCurveTo",
        "bezierCurveTo",
        "bezierCurveTo",
        "bezierCurveTo",
        "closePath",
      ]);
      expect(head.commands[0][1]).toBe(-runtime.TRAVEL_PRESET.headLengthPx);
      expect(head.commands[0][2]).toBe(0);
      expect(head.commands[2].slice(-2)).toEqual([0, 0]);
      expect(head.commands[1].at(-1)).toBeCloseTo(-runtime.TRAVEL_PRESET.headWidthPx / 2, 12);
      expect(head.commands[3].at(-1)).toBeCloseTo(runtime.TRAVEL_PRESET.headWidthPx / 2, 12);
      const expectedHead = runtime.projectTravelRoutePoint(route, state.progress, matrix);
      const tangentProgress = state.progress < 0.999 ? state.progress + 0.001 : state.progress - 0.001;
      const tangentPoint = runtime.projectTravelRoutePoint(route, tangentProgress, matrix);
      const tangent = tangentProgress > state.progress
        ? [tangentPoint[0] - expectedHead[0], tangentPoint[1] - expectedHead[1]]
        : [expectedHead[0] - tangentPoint[0], expectedHead[1] - tangentPoint[1]];
      const expectedAngle = Math.atan2(tangent[1], tangent[0]);
      head.translation.forEach((coordinate, at) => expect(coordinate).toBeCloseTo(expectedHead[at], 10));
      expect(head.rotation).toBeCloseTo(expectedAngle, 12);
      const direction = [Math.cos(head.rotation), Math.sin(head.rotation)];
      const rear = [
        head.translation[0] - direction[0] * runtime.TRAVEL_PRESET.headLengthPx,
        head.translation[1] - direction[1] * runtime.TRAVEL_PRESET.headLengthPx,
      ];
      const tailEnd = tail.at(-1).to;
      const overlap = ((tailEnd[0] - rear[0]) * direction[0] +
        (tailEnd[1] - rear[1]) * direction[1]) / runtime.TRAVEL_PRESET.headLengthPx;
      expect(overlap).toBeGreaterThan(0.7);
      expect(overlap).toBeLessThan(1.05);
    }
    expect(Math.max(...renderedTailLengths)).toBeGreaterThan(30);
    expect(Math.max(...tailToHeadRatios)).toBeGreaterThan(3);
    expect(runtime.TRAVEL_PRESET.tailLengthPx / runtime.TRAVEL_PRESET.headLengthPx).toBeGreaterThan(20);
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
    expect(runtime.context2D.strokes).toHaveLength(2 * runtime.TRAVEL_PRESET.tailSegments);
    expect(runtime.context2D.fills).toBe(2);
  });

  it("draws only the admitted concurrent trails, then clears and suppresses them for reduced motion", () => {
    const runtime = loadRuntime(concurrentFixtureModel());
    runtime.state.zoom = 3;
    const activeAt = firstVisibleTravelOverlap(runtime, runtime.travelFlightLimit);

    runtime.context2D.reset();
    runtime.drawTravelOverlay(activeAt, true);
    expect(runtime.context2D.strokes).toHaveLength(
      runtime.travelFlightLimit * runtime.TRAVEL_PRESET.tailSegments,
    );
    expect(runtime.context2D.fills).toBe(runtime.travelFlightLimit);
    runtime.context2D.reset();
    runtime.drawTravelOverlay(activeAt, false);
    expect(runtime.context2D.strokes).toEqual([]);
    expect(runtime.context2D.fills).toBe(0);

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
      expect(reducedRuntime.context2D.fills).toBe(0);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

});
