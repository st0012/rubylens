import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const FIXTURE = pathToFileURL(join(process.cwd(), "test/browser/.fixtures/explorer.html")).href;

// Readiness comes from the runtime's own dataset signals, never from timeouts.
async function openExplorer(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => document.documentElement.dataset.plottedScenePoints !== undefined);
  return page.evaluate(() => document.documentElement.dataset.explorerRenderer);
}

// Freeze the scene so projections computed in evaluate() stay valid for input.
function freeze(page) {
  return page.evaluate(() => {
    setDrifting(false);
    if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
    applyCameraTarget(DEFAULT_CAMERA);
    render(1000);
  });
}

test("renders the complete scene with WebGL2", async ({ page }) => {
  const renderer = await openExplorer(page);
  expect(renderer).toBe("webgl2");
  const plotted = await page.evaluate(() => ({
    scenePoints: Number(document.documentElement.dataset.plottedScenePoints),
    declarations: Number(document.documentElement.dataset.plottedDependencyDeclarations),
    summary: document.getElementById("galaxy-summary").textContent,
  }));
  expect(plotted.scenePoints).toBe(1500 + 2500 + 1 + 12);
  expect(plotted.declarations).toBe(2500);
  expect(plotted.summary).toContain("4,013 stars");
});

test("hover and click select a star and show its tooltip", async ({ page }) => {
  await openExplorer(page);
  await freeze(page);
  const target = await page.evaluate(() => {
    for (const point of interactivePoints) {
      if (point.hub) continue;
      const screen = project(point, viewMatrix());
      if (screen && screen[0] > 40 && screen[0] < sceneRight - 40 && screen[1] > 40 && screen[1] < sceneBottom - 40
        && hitTestProjected(screen[0], screen[1]) === point) {
        return { x: screen[0], y: screen[1], name: point.name };
      }
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.mouse.move(target.x, target.y);
  await expect(page.locator("#tooltip")).toBeVisible();
  await expect(page.locator("#tooltip-name")).toHaveText(target.name);
  await page.mouse.click(target.x, target.y);
  expect(await page.evaluate(() => selectionLocked && selectedPoint?.name)).toBe(target.name);
});

test("search ranks and activates results", async ({ page }) => {
  await openExplorer(page);
  await page.fill("#explorer-search", "core::node700");
  const results = page.locator(".search-result");
  await expect(results.first()).toContainText("Core::Node700");
  await results.first().click();
  expect(await page.evaluate(() => selectedPoint?.name)).toBe("Core::Node700");
});

test("gem clouds expand and escape restores the full scene", async ({ page }) => {
  await openExplorer(page);
  await page.evaluate(() => focusDependencyPackage(5));
  expect(await page.evaluate(() => expandedPackageIndex)).toBe(5);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => expandedPackageIndex)).toBeNull();
  expect(await page.evaluate(() => selectedPoint)).toBeNull();
});

test("fixed-frame rendering is deterministic", async ({ page }) => {
  await openExplorer(page);
  await freeze(page);
  const sample = () => page.evaluate(() => {
    render(1000);
    const gl = document.getElementById("explorer-cosmos").getContext("webgl2");
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const samples = [];
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
      const offset = (y * w + x) * 4;
      samples.push(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    }
    return samples;
  });
  const first = await sample();
  const second = await sample();
  expect(first.some(channel => channel > 0)).toBe(true);
  expect(second).toEqual(first);
});
