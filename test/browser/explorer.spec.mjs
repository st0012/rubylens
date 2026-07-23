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

async function hittablePoint(page, dependency = false) {
  const target = await page.evaluate(dependency => {
    for (const point of dependency ? packageHubs : interactivePoints) {
      if (!dependency && point.hub) continue;
      const screen = project(point, viewMatrix());
      if (screen && screen[0] > 40 && screen[0] < sceneRight - 40 && screen[1] > 40 && screen[1] < sceneBottom - 40
        && hitTestProjected(screen[0], screen[1]) === point) {
        return { x: screen[0], y: screen[1], name: point.name };
      }
    }
    return null;
  }, dependency);
  expect(target).not.toBeNull();
  return target;
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
  const target = await hittablePoint(page);
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
  const target = await hittablePoint(page);

  await page.getByRole("button", { name: "Hide interface" }).click();
  await expect(page.locator("body")).toHaveClass(/is-ui-hidden/);
  await expect(page.locator(".masthead")).toBeHidden();
  await expect(page.locator("#panel")).toBeHidden();
  await expect(page.locator(".toolbar")).toBeHidden();
  expect(await page.evaluate(() => [sceneRight, sceneBottom])).toEqual([1280, 800]);

  await page.mouse.move(target.x, target.y);
  await expect(page.locator("#tooltip")).toBeHidden();
  expect(await page.evaluate(() => selectedPoint)).toBeNull();

  await page.keyboard.press("?");
  await expect(page.locator("#shortcuts-help")).toHaveJSProperty("hidden", true);
  await page.keyboard.press("h");
  await expect(page.locator("body")).not.toHaveClass(/is-ui-hidden/);
  await expect(page.locator(".masthead")).toBeVisible();
  await page.mouse.move(1, 1);
  await page.mouse.move(target.x, target.y);
  await expect(page.locator("#tooltip")).toBeVisible();

  await page.getByRole("button", { name: "Hide interface" }).click();
  await page.mouse.click(640, 700);
  await expect(page.locator("body")).not.toHaveClass(/is-ui-hidden/);

  await page.getByRole("button", { name: "Hide interface" }).click();
  await page.keyboard.press("/");
  await expect(page.locator("body")).not.toHaveClass(/is-ui-hidden/);
  await expect(page.locator("#explorer-search")).toBeFocused();
});

test("renderer loss reveals its warning while the UI is hidden", async ({ page }) => {
  await openExplorer(page);
  await page.getByRole("button", { name: "Hide interface" }).click();
  await page.evaluate(() => {
    document.getElementById("explorer-cosmos").dispatchEvent(new Event("webglcontextlost"));
  });
  await expect(page.locator("body")).not.toHaveClass(/is-ui-hidden/);
  await expect(page.locator("#warning-summary")).toContainText("WebGL2 required");
});

test("a tap restoring the UI cannot expand a remembered dependency", async ({ page }) => {
  await openExplorer(page);
  await freeze(page);
  const target = await hittablePoint(page, true);
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction(name => selectionLocked && selectedPoint?.name === name, target.name);
  await page.keyboard.press("h");
  await page.mouse.click(target.x, target.y);
  await page.evaluate(({ x, y }) => {
    canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
  }, target);
  expect(await page.evaluate(() => [expandedSystemIndex, expandedPackageIndex])).toEqual([null, null]);
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
  await expect(core.locator("summary")).toHaveAccessibleName(/Core code.*In view/);

  const visibility = core.getByRole("checkbox", { name: "Show Core code" });
  await core.getByText("Show stars").click();
  await expect(visibility).not.toBeChecked();
  await expect(core.locator("summary")).toHaveAccessibleName(/Core code.*Hidden/);
  expect(await page.evaluate(() => visibleCategories.core)).toBe(false);

  await core.getByText("Show stars").click();
  await expect(visibility).toBeChecked();
  await core.getByRole("button", { name: "Focus Core code" }).click();
  await expect(core.locator("summary")).toHaveAccessibleName(/Core code.*Focused/);
  expect(await page.evaluate(() => focusedCategory)).toBe("core");

  await page.getByRole("button", { name: "Collapse Explorer" }).click();
  await expect(page.locator("#panel-body")).toBeHidden();
  await expect(page.getByRole("button", { name: "Expand Explorer" })).toBeVisible();
});

test("mobile toolbar keeps every control inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openExplorer(page);
  const controls = await page.locator(".toolbar button, .toolbar output").evaluateAll(elements => elements.map(element => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top };
  }));
  expect(new Set(controls.map(control => control.top)).size).toBeGreaterThan(1);
  expect(controls.every(control => control.left >= 0 && control.right <= 320)).toBe(true);
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

test("active travel stays visible through Explorer orbit and zoom", async ({ page }) => {
  expect(await openExplorer(page)).toBe("webgl2");
  const target = await page.evaluate(() => {
    if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
    let active = null;
    window.__travelHeads = [];
    window.__originalDrawTravelHead = drawTravelHead;
    drawTravelHead = (...args) => {
      window.__travelHeads.push([args[1], args[2]]);
      return window.__originalDrawTravelHead(...args);
    };
    for (let elapsed = 0; elapsed < SHOWCASE_PRESET.durationMs; elapsed += 1000 / 60) {
      const states = travelStatesAt(elapsed).filter(state => {
        const raw = (elapsed - state.episode.startsAt) / TRAVEL_PRESET.flightDurationMs;
        return raw >= 0.25 && raw <= 0.35 && state.visibility >= TRAVEL_PRESET.minimumVisibility;
      });
      if (!states.length) continue;
      window.__travelHeads.length = 0;
      drawTravelOverlay(elapsed, true);
      if (window.__travelHeads.length) {
        active = states[0];
        explorerTravelElapsed = elapsed;
        break;
      }
    }
    if (!active) throw new Error("fixture never drew an active travel head");
    explorerTravelLastTimestamp = 10_000;
    lastDriftTimestamp = 10_000;
    lastDependencySpinTimestamp = 10_000;
    render(10_000);
    return {
      linkIndex: active.episode.linkIndex,
      startsAt: active.episode.startsAt,
      route: active.episode.route,
    };
  });
  try {
    expect(await page.evaluate(() => window.__travelHeads.splice(0).length)).toBeGreaterThan(0);
    await page.mouse.move(500, 500);
    await page.mouse.down();
    await page.mouse.move(620, 540, { steps: 4 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => dragging && window.__travelHeads.splice(0).length > 0)).toBe(true);
    await page.mouse.up();
    await page.mouse.wheel(0, -120);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => window.__travelHeads.splice(0).length)).toBeGreaterThan(0);

    const route = await page.evaluate(expected => travelStatesAt(explorerTravelElapsed)
      .find(state => state.episode.linkIndex === expected.linkIndex &&
        state.episode.startsAt === expected.startsAt)?.episode.route, target);
    expect(route).toEqual(target.route);
  } finally {
    await page.evaluate(() => {
      drawTravelHead = window.__originalDrawTravelHead;
      delete window.__originalDrawTravelHead;
      delete window.__travelHeads;
    });
  }
});
