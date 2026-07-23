import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const FIXTURES = join(process.cwd(), "test/browser/.fixtures");
const COLLECTION = pathToFileURL(join(FIXTURES, "collection.html")).href;
const PAIR = pathToFileURL(join(FIXTURES, "collection-pair.html")).href;

async function waitForScene(page) {
  await page.locator("html").evaluate(element => new Promise(resolve => {
    if (element.dataset.plottedScenePoints !== undefined) resolve();
    else {
      const observer = new MutationObserver(() => {
        if (element.dataset.plottedScenePoints === undefined) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(element, { attributes: true });
    }
  }));
}

test("renders every project in one Explorer scene", async ({ page }) => {
  const remoteRequests = [];
  page.on("request", request => {
    if (!request.url().startsWith("file:")) remoteRequests.push(request.url());
  });
  await page.goto(COLLECTION);
  await waitForScene(page);

  await expect(page.locator("h1")).toHaveText("First Cosmos + Second Cosmos (1) + Second Cosmos (2)");
  await expect(page.locator("#galaxy-summary")).toContainText("3 separately indexed galaxies");
  await expect(page.locator("#panel")).toHaveCount(1);
  await expect(page.locator("#explorer-search")).toHaveCount(1);
  await expect(page.locator(".toolbar")).toHaveCount(1);
  await expect(page.locator("#explorer-cosmos")).toHaveCount(1);
  await expect(page.locator("iframe, select, .collection-frame, .collection-tile")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-explorer-renderer", "webgl2");
  await expect(page.locator("html")).toHaveAttribute("data-plotted-scene-points", "1835");
  await expect(page.locator(".project-label")).toHaveCount(3);
  expect(await page.evaluate(() => [sceneModel.schema, sceneModel.galaxies.length])).toEqual([
    "rubylens.collection.v2",
    3,
  ]);
  expect(await page.evaluate(() => viewMatrix())).not.toEqual([1, 0, 1, 0]);
  expect(remoteRequests).toEqual([]);
});

test("orbits every galaxy together through one shared camera", async ({ page }) => {
  await page.goto(PAIR);
  await waitForScene(page);
  await page.locator("#motion").click();

  const labels = page.locator(".project-label");
  await expect(labels).toHaveCount(2);
  await expect(labels.nth(0)).toHaveText("First Cosmos");
  await expect(labels.nth(1)).toHaveText("Second Cosmos");
  const before = await Promise.all([labels.nth(0).boundingBox(), labels.nth(1).boundingBox()]);
  expect(before[1].x).toBeGreaterThan(before[0].x);

  const canvas = page.locator("#cosmos");
  const box = await canvas.boundingBox();
  const beforeScene = await page.evaluate(() => ({
    view: viewMatrix(),
    centers: galaxyGroups.map(group => projectGalaxyCenter(group)),
    points: galaxyGroups.map(group => {
      const point = interactivePoints.find(candidate => candidate.projectIndex === group.projectIndex);
      return project(point, viewMatrix());
    }),
    positions: interactivePoints.map(point => [...point.position]),
  }));
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .5 + 120, box.y + box.height * .43, { steps: 8 });
  await page.mouse.up();
  const afterScene = await page.evaluate(() => ({
    view: viewMatrix(),
    centers: galaxyGroups.map(group => projectGalaxyCenter(group)),
    points: galaxyGroups.map(group => {
      const point = interactivePoints.find(candidate => candidate.projectIndex === group.projectIndex);
      return project(point, viewMatrix());
    }),
    positions: interactivePoints.map(point => [...point.position]),
  }));
  expect(afterScene.view).not.toEqual(beforeScene.view);
  for (const index of [0, 1]) {
    expect(Math.hypot(
      afterScene.centers[index][0] - beforeScene.centers[index][0],
      afterScene.centers[index][1] - beforeScene.centers[index][1],
    )).toBeGreaterThan(1);
    expect(Math.hypot(
      afterScene.points[index][0] - beforeScene.points[index][0],
      afterScene.points[index][1] - beforeScene.points[index][1],
    )).toBeGreaterThan(1);
  }
  expect(afterScene.positions).toEqual(beforeScene.positions);
});

test("fits the expanded collection into the available narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.goto(PAIR);
  await waitForScene(page);
  await page.locator("#motion").click();

  const layout = await page.evaluate(() => {
    const [left, right, top, bottom] = collectionDefaultProjectionBounds;
    return {
      zoom,
      nominalZoom: DEFAULT_CAMERA.zoom,
      padding: COLLECTION_LAYOUT.viewportPadding,
      sceneRight,
      sceneBottom,
      bounds: [
        sceneCenterX + left * zoom,
        sceneCenterX + right * zoom,
        sceneCenterY + top * zoom,
        sceneCenterY + bottom * zoom,
      ],
    };
  });

  expect(layout.zoom).toBeLessThan(layout.nominalZoom);
  expect(layout.bounds[0]).toBeGreaterThanOrEqual(layout.padding - 1);
  expect(layout.bounds[1]).toBeLessThanOrEqual(layout.sceneRight - layout.padding + 1);
  expect(layout.bounds[2]).toBeGreaterThanOrEqual(layout.padding - 1);
  expect(layout.bounds[3]).toBeLessThanOrEqual(layout.sceneBottom - layout.padding + 1);
  await expect(page.locator(".project-label")).toHaveCount(2);
  await expect(page.locator(".project-label").nth(0)).toBeVisible();
  await expect(page.locator(".project-label").nth(1)).toBeVisible();
});

test("searches across projects and keeps project provenance", async ({ page }) => {
  await page.goto(PAIR);
  await waitForScene(page);
  if (await page.locator("#panel-body").isHidden()) await page.locator("#panel-toggle").click();

  const search = page.locator("#explorer-search");
  await search.fill("other::node200");
  await expect(page.locator(".search-result").first()).toContainText("Other::Node200");
  await expect(page.locator(".search-result-context").first()).toContainText("Second Cosmos");

  await search.fill("gem-0");
  await expect(page.locator(".search-result")).toHaveCount(4);
  await expect(page.locator(".search-result-context").nth(0)).toContainText("First Cosmos");
  await expect(page.locator(".search-result-context").nth(2)).toContainText("Second Cosmos");
});
