import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { FIXTURE_CONSTANT_REFERENCE_LINKS } from "./build_fixtures.mjs";

const FIXTURE = pathToFileURL(join(process.cwd(), "test/browser/.fixtures/showcase.html")).href;

// The clip stage is 1920x1080; capturing at that viewport keeps the stage
// scale at exactly 1, like the Ruby clip driver does.
test.use({ viewport: { width: 1920, height: 1080 } });

// Readiness comes from the runtime's own dataset signals, never from timeouts.
async function openShowcaseClip(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => document.documentElement.dataset.showcaseReady === "true");
  return page.evaluate(() => beginShowcaseClip());
}

function renderClipFrame(page, frameIndex, fps = 30) {
  return page.evaluate(([index, rate]) => renderShowcaseClipFrame(index, rate), [frameIndex, fps]);
}

function peakTravelFrame(page, fps = 60) {
  return page.evaluate(rate => {
    const frameCount = SHOWCASE_PRESET.durationMs * rate / 1000;
    let peak = { frame: null, count: 0, score: -1 };
    for (let frame = 0; frame < frameCount; frame += 1) {
      const elapsed = frame * 1000 / rate;
      const states = travelStatesAt(elapsed);
      const score = states.length
        ? Math.min(...states.map(state => {
            const rawProgress = (elapsed - state.episode.startsAt) / TRAVEL_PRESET.flightDurationMs;
            return Math.min(rawProgress, 1 - rawProgress);
          }))
        : -1;
      if (states.length > peak.count || (states.length === peak.count && score > peak.score)) {
        peak = { frame, count: states.length, score };
      }
    }
    return { ...peak, limit: travelFlightLimit };
  }, fps);
}

function peakVisibleTravelFrame(page, fps = 30) {
  return page.evaluate(rate => {
    const frameCount = SHOWCASE_PRESET.durationMs * rate / 1000;
    let peak = { frame: null, count: 0, visibility: -1 };
    for (let frame = 0; frame < frameCount; frame += 1) {
      const elapsed = frame * 1000 / rate;
      const visibleStates = travelStatesAt(elapsed)
        .filter(state => state.visibility >= TRAVEL_PRESET.minimumVisibility);
      const visibility = visibleStates
        .reduce((minimum, state) => Math.min(minimum, state.visibility), 1);
      if (visibleStates.length > peak.count || (visibleStates.length === peak.count && visibility > peak.visibility)) {
        peak = { frame, count: visibleStates.length, visibility };
      }
      if (peak.count === travelFlightLimit && visibleStates.length < peak.count) break;
    }
    return { ...peak, limit: travelFlightLimit };
  }, fps);
}

async function firstRenderedTravelFrame(page, fps = 60) {
  return page.evaluate(rate => {
    const frameCount = SHOWCASE_PRESET.durationMs * rate / 1000;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const elapsed = frame * 1000 / rate;
      const visibleState = travelStatesAt(elapsed)
        .find(state => state.visibility >= TRAVEL_PRESET.minimumVisibility);
      if (visibleState) {
        return { frame, linkIndex: visibleState.episode.linkIndex };
      }
    }
    return null;
  }, fps);
}

function travelPixels(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("travel-cosmos");
    const { data, width, height } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let opaque = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let offset = 3, pixel = 0; offset < data.length; offset += 4, pixel += 1) {
      if (data[offset] === 0) continue;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      opaque += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return {
      opaque,
      spanX: maxX < 0 ? 0 : maxX - minX + 1,
      spanY: maxY < 0 ? 0 : maxY - minY + 1,
    };
  });
}

test("beginShowcaseClip freezes the live loop and reports the preset", async ({ page }) => {
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  expect(preset.durationMs).toBe(60000);
  expect(preset.stageWidth).toBe(1920);
  expect(preset.stageHeight).toBe(1080);
  expect(preset.details).toBe(true);
  expect(await page.evaluate(() => document.documentElement.dataset.showcaseMotion)).toBe("clip");
  await renderClipFrame(page, 7);
  expect(await page.evaluate(() => document.documentElement.dataset.clipFrame)).toBe("7");
});

test("clip frames are a pure function of frame index", async ({ page }) => {
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  // Frame 270 sits mid-reveal (t=9s), so annotation choreography is covered.
  await renderClipFrame(page, 270);
  const first = await page.screenshot();
  await renderClipFrame(page, 900);
  await renderClipFrame(page, 270);
  const second = await page.screenshot();
  expect(second.equals(first)).toBe(true);
  await renderClipFrame(page, 900);
  const other = await page.screenshot();
  expect(other.equals(first)).toBe(false);
});

test("dependency clouds rotate at a fixed camera and close their own loop", async ({ page }) => {
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  const captureCloudPhase = async elapsed => {
    await page.evaluate(value => {
      applyShowcaseCamera(0);
      render(value);
    }, elapsed);
    return page.locator("#cosmos").screenshot();
  };

  const start = await captureCloudPhase(0);
  const rotated = await captureCloudPhase(12_345);
  const looped = await captureCloudPhase(preset.durationMs);
  expect(rotated.equals(start)).toBe(false);
  expect(looped.equals(start)).toBe(true);
});

test("spatially distinct travel wakes are repeatable and follow decoded directions", async ({ page }) => {
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  const renderedDirection = await firstRenderedTravelFrame(page);
  expect(renderedDirection).not.toBeNull();
  const rawLink = FIXTURE_CONSTANT_REFERENCE_LINKS[renderedDirection.linkIndex];
  const flight = await page.evaluate(([linkIndex, row]) => {
    const [referringIndex, referencedIndex] = row;
    const decoded = constantReferenceLinks[linkIndex];
    return {
      decoded: {
        departureIndex: decoded.departureIndex,
        arrivalIndex: decoded.arrivalIndex,
      },
      expected: {
        departureIndex: referencedIndex,
        arrivalIndex: referringIndex,
      },
    };
  }, [renderedDirection.linkIndex, rawLink]);
  expect(flight.decoded).toEqual(flight.expected);

  await renderClipFrame(page, renderedDirection.frame, 60);
  expect((await travelPixels(page)).opaque).toBeGreaterThan(0);

  const peak = await peakTravelFrame(page);
  expect(peak.count).toBe(peak.limit);
  const visiblePeak = await peakVisibleTravelFrame(page);
  expect(visiblePeak.count).toBe(visiblePeak.limit);
  const visibleLinkIndexes = await page.evaluate(([frame, rate]) => {
    const elapsed = frame * 1000 / rate;
    return travelStatesAt(elapsed)
      .filter(state => state.visibility >= TRAVEL_PRESET.minimumVisibility)
      .map(state => state.episode.linkIndex);
  }, [visiblePeak.frame, 30]);
  expect(visibleLinkIndexes).toHaveLength(visiblePeak.limit);
  expect(new Set(visibleLinkIndexes).size).toBe(visiblePeak.limit);
  const loopStates = await page.evaluate(([frame, rate]) => {
    const elapsed = frame * 1000 / rate;
    const snapshot = value => travelStatesAt(value).map(state => ({
      linkIndex: state.episode.linkIndex,
      startsAt: state.episode.startsAt,
      progress: state.progress,
      visibility: state.visibility,
      route: state.episode.route,
    }));
    return [snapshot(elapsed), snapshot(elapsed + SHOWCASE_PRESET.durationMs)];
  }, [visiblePeak.frame, 30]);
  expect(loopStates[1]).toEqual(loopStates[0]);
  await renderClipFrame(page, visiblePeak.frame, 30);
  const pixels = await travelPixels(page);
  expect(pixels.opaque).toBeGreaterThan(40);
  expect(Math.max(pixels.spanX, pixels.spanY)).toBeGreaterThan(12);
  await renderClipFrame(page, 0);
  expect(await travelPixels(page)).toEqual({ opaque: 0, spanX: 0, spanY: 0 });
  await renderClipFrame(page, visiblePeak.frame, 30);
  const first = await page.screenshot();
  await renderClipFrame(page, 0);
  await renderClipFrame(page, visiblePeak.frame, 30);
  const second = await page.screenshot();
  expect(second.equals(first)).toBe(true);
});

test("immutable travel routes follow 4x and 8x Clip cameras", async ({ page }) => {
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  const fps = 60;
  const flight = await page.evaluate(() => {
    const episode = travelEpisodesThrough(5_000).find(candidate =>
      candidate.route &&
      travelEndpointCategory(constantReferenceLinks[candidate.linkIndex].departureIndex) === "dependencies"
    );
    return {
      linkIndex: episode.linkIndex,
      startsAt: episode.startsAt,
      durationMs: TRAVEL_PRESET.flightDurationMs,
    };
  });
  const samples = [];

  for (const cameraSpeed of [4, 8]) {
    for (const rawProgress of [0.15, 0.5, 0.85]) {
      const frame = Math.round(
        (flight.startsAt + rawProgress * flight.durationMs) * fps / 1000,
      );
      await renderClipFrame(page, frame, fps);
      samples.push(await page.evaluate(([index, rate, expectedFlight, speed, sampleProgress]) => {
        const elapsed = index * 1000 / rate;
        const state = travelStatesAt(elapsed).find(candidate =>
          candidate.episode.linkIndex === expectedFlight.linkIndex &&
          candidate.episode.startsAt === expectedFlight.startsAt
        );
        const route = state.episode.route;
        const drawnHeads = [];
        const originalDrawTravelHead = drawTravelHead;

        try {
          drawTravelHead = (context, x, y, angle, colourChannels, emphasis) => {
            drawnHeads.push({ x, y });
            return originalDrawTravelHead(context, x, y, angle, colourChannels, emphasis);
          };
          applyShowcaseCamera(showcaseFrameProgress(elapsed * speed));
          render(elapsed);
        } finally {
          drawTravelHead = originalDrawTravelHead;
        }

        const project = position => {
          const cy = Math.cos(yaw);
          const sy = Math.sin(yaw);
          const cp = Math.cos(pitch);
          const sp = Math.sin(pitch);
          const x1 = position[0] * cy - position[2] * sy;
          const z1 = position[0] * sy + position[2] * cy;
          const y2 = position[1] * cp - z1 * sp;
          const z2 = position[1] * sp + z1 * cp;
          const depth = cameraDistance - z2;
          if (depth <= 35) return null;
          const perspective = cameraFocalLength / depth * zoom;
          return {
            x: sceneCenterX + panX + x1 * perspective,
            y: sceneCenterY + panY + y2 * perspective,
          };
        };
        const pointOnRoute = (candidateRoute, progress) => {
          const inverse = 1 - progress;
          return [0, 1, 2].map(axis =>
            inverse * inverse * candidateRoute.departure[axis] +
            2 * inverse * progress * candidateRoute.control[axis] +
            progress * progress * candidateRoute.arrival[axis]
          );
        };
        const expectedHeads = [];
        for (const candidate of travelStatesAt(elapsed)) {
          if (candidate.visibility < TRAVEL_PRESET.minimumVisibility) continue;
          const head = project(pointOnRoute(candidate.episode.route, candidate.progress));
          const tangentProgress = candidate.progress < 0.999
            ? candidate.progress + 0.001
            : candidate.progress - 0.001;
          const tangent = project(pointOnRoute(candidate.episode.route, tangentProgress));
          if (!head || !tangent) continue;
          expectedHeads.push({
            ...head,
            linkIndex: candidate.episode.linkIndex,
            startsAt: candidate.episode.startsAt,
          });
        }
        return {
          cameraSpeed: speed,
          rawProgress: sampleProgress,
          route: {
            departure: [...route.departure],
            control: [...route.control],
            arrival: [...route.arrival],
          },
          drawnHeads,
          expectedHeads,
        };
      }, [frame, fps, flight, cameraSpeed, rawProgress]));
    }
  }

  for (const sample of samples) {
    expect(sample.drawnHeads).toHaveLength(sample.expectedHeads.length);
    expect(sample.drawnHeads.length).toBeGreaterThan(0);
    for (let index = 0; index < sample.expectedHeads.length; index += 1) {
      expect(sample.drawnHeads[index].x).toBeCloseTo(sample.expectedHeads[index].x, 8);
      expect(sample.drawnHeads[index].y).toBeCloseTo(sample.expectedHeads[index].y, 8);
    }
    expect(sample.expectedHeads.some(head =>
      head.linkIndex === flight.linkIndex && head.startsAt === flight.startsAt
    )).toBe(true);
  }
  for (const sample of samples.slice(1)) expect(sample.route).toEqual(samples[0].route);
  for (const rawProgress of [0.15, 0.5, 0.85]) {
    const fourX = samples.find(sample => sample.cameraSpeed === 4 && sample.rawProgress === rawProgress);
    const eightX = samples.find(sample => sample.cameraSpeed === 8 && sample.rawProgress === rawProgress);
    const fourXHead = fourX.expectedHeads.find(head =>
      head.linkIndex === flight.linkIndex && head.startsAt === flight.startsAt
    );
    const eightXHead = eightX.expectedHeads.find(head =>
      head.linkIndex === flight.linkIndex && head.startsAt === flight.startsAt
    );
    expect([fourXHead.x, fourXHead.y]).not.toEqual([eightXHead.x, eightXHead.y]);
  }
});

test("one full turn loops seamlessly at any capture rate", async ({ page }) => {
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  for (const fps of [30, 60]) {
    const loopFrame = preset.durationMs * fps / 1000;
    await renderClipFrame(page, 0, fps);
    const start = await page.screenshot();
    expect(await travelPixels(page)).toEqual({ opaque: 0, spanX: 0, spanY: 0 });
    await renderClipFrame(page, loopFrame - 1, fps);
    expect(await travelPixels(page)).toEqual({ opaque: 0, spanX: 0, spanY: 0 });
    await renderClipFrame(page, loopFrame, fps);
    const wrapped = await page.screenshot();
    expect(wrapped.equals(start)).toBe(true);
  }
});

test("reduced motion suppresses travel streaks in clip mode", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  const peak = await peakTravelFrame(page);
  expect(peak.count).toBe(peak.limit);
  await renderClipFrame(page, peak.frame, 60);
  expect(await travelPixels(page)).toEqual({ opaque: 0, spanX: 0, spanY: 0 });
});

test("annotation opacity follows the synthetic clock, not wall time", async ({ page }) => {
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  const samples = [];
  // Slot 0 reveals between 1350ms and 4650ms; sample before, during, after.
  for (const frame of [0, 60, 90, 174]) {
    await renderClipFrame(page, frame);
    samples.push(await page.evaluate(() => ({
      opacity: Number(document.getElementById("cinema-annotation").style.opacity),
      shown: document.documentElement.dataset.showcaseAnnotation !== "hidden",
    })));
  }
  expect(samples[0].opacity).toBe(0);
  expect(samples[3].opacity).toBe(0);
  if (samples[2].shown) {
    expect(samples[2].opacity).toBe(1);
    expect(samples[1].opacity).toBeGreaterThan(0);
    expect(samples[1].opacity).toBeLessThan(1);
  } else {
    // The slot's annotation never fit the safe area at this camera; opacity
    // must then stay zero for every sampled frame.
    expect(Math.max(...samples.map(sample => sample.opacity))).toBe(0);
  }
});
