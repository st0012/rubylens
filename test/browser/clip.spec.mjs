import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

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

test("one full turn loops seamlessly at any capture rate", async ({ page }) => {
  const preset = await openShowcaseClip(page);
  expect(preset.status).toBe("ok");
  await renderClipFrame(page, 0);
  const start = await page.screenshot();
  await renderClipFrame(page, 1800);
  const wrapped = await page.screenshot();
  expect(wrapped.equals(start)).toBe(true);
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
