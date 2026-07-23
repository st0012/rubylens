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
// Order matters: setDrifting schedules a frame via syncDrifting, so the
// animation frame is cancelled after it.
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
  await page.waitForFunction(name => selectedPoint?.name === name, target.name);
  await expect(page.locator("#tooltip")).toBeVisible();
  await expect(page.locator("#tooltip-name")).toHaveText(target.name);
  await page.mouse.click(target.x, target.y);
  expect(await page.evaluate(() => selectionLocked && selectedPoint?.name)).toBe(target.name);
});

test("hide UI gives the galaxy the full viewport and disables hover", async ({ page }) => {
  await openExplorer(page);
  await freeze(page);
  const target = await page.evaluate(() => {
    for (const point of interactivePoints) {
      if (point.hub) continue;
      const screen = project(point, viewMatrix());
      if (screen && screen[0] > 40 && screen[0] < sceneRight - 40 && screen[1] > 40 && screen[1] < sceneBottom - 40
        && hitTestProjected(screen[0], screen[1]) === point) {
        return { x: screen[0], y: screen[1] };
      }
    }
    return null;
  });
  expect(target).not.toBeNull();

  await page.getByRole("button", { name: "Hide interface" }).click();
  await expect(page.locator("body")).toHaveClass(/is-ui-hidden/);
  await expect(page.locator(".masthead")).toBeHidden();
  await expect(page.locator("#panel")).toBeHidden();
  await expect(page.locator(".toolbar")).toBeHidden();
  expect(await page.evaluate(() => [sceneRight, sceneBottom])).toEqual([1280, 800]);

  await page.mouse.move(target.x, target.y);
  await expect(page.locator("#tooltip")).toBeHidden();
  expect(await page.evaluate(() => selectedPoint)).toBeNull();

  await page.keyboard.press("h");
  await expect(page.locator("body")).not.toHaveClass(/is-ui-hidden/);
  await expect(page.locator(".masthead")).toBeVisible();
  await page.mouse.move(1, 1);
  await page.mouse.move(target.x, target.y);
  await expect(page.locator("#tooltip")).toBeVisible();

  await page.getByRole("button", { name: "Hide interface" }).click();
  await page.mouse.click(640, 700);
  await expect(page.locator("body")).not.toHaveClass(/is-ui-hidden/);
});

test("search ranks and activates results", async ({ page }) => {
  await openExplorer(page);
  await page.fill("#explorer-search", "core::node700");
  const results = page.locator(".search-result");
  await expect(results.first()).toContainText("Core::Node700");
  await results.first().click();
  expect(await page.evaluate(() => selectedPoint?.name)).toBe("Core::Node700");
});

test("sidebar summarizes systems and reflects visibility and focus", async ({ page }) => {
  await openExplorer(page);
  const core = page.locator(".explorer-section.core");
  await expect(core.locator("summary")).toContainText("945 classes · 24,600 methods");
  await expect(core.locator(".section-state .visible")).toBeVisible();

  const visibility = core.getByRole("checkbox", { name: "Show Core code" });
  await core.getByText("Show stars").click();
  await expect(visibility).not.toBeChecked();
  await expect(core.locator(".section-state .hidden")).toBeVisible();
  expect(await page.evaluate(() => visibleCategories.core)).toBe(false);

  await core.getByText("Show stars").click();
  await expect(visibility).toBeChecked();
  await core.getByRole("button", { name: "Focus Core code" }).click();
  await expect(core.locator(".section-state .focused")).toBeVisible();
  expect(await page.evaluate(() => focusedCategory)).toBe("core");

  await page.getByRole("button", { name: "Collapse Explorer" }).click();
  await expect(page.locator("#panel-body")).toBeHidden();
  await expect(page.getByRole("button", { name: "Expand Explorer" })).toBeVisible();
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
