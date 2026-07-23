import { describe, expect, test } from "vitest";
import { loadRuntime, minimalModel } from "./helpers/runtime.mjs";

function projectModel(projectName, namespaceName, seed, morphology = [2, 0, 240, 3, 105, 380, 0, 0, 0, 7]) {
  return minimalModel({
    projectName,
    morphology,
    totals: { namespaces: 1, packages: 0, dependencyStars: 0 },
    namespaceNames: [namespaceName],
    namespaces: [[seed, 0, 0, 1, 1, 0, 2, 3, 1, 1, 0, 4, 1, 0]],
    categoryStats: { core: [1, 0, 4, 1], tests: [0, 0, 0, 0] },
  });
}

function collection(models) {
  return {
    schema: "rubylens.collection.v2",
    galaxies: models,
  };
}

describe("collection scene", () => {
  test("places separately indexed galaxies in one scene model and world space", () => {
    const runtime = loadRuntime(collection([
      projectModel("First", "First::Node", 101),
      projectModel("Second", "Second::Node", 202, [4, 0, 0, 0, 0, 0, 0, 3, 600, 9]),
    ]));

    expect(runtime.collectionMode).toBe(true);
    expect(runtime.sceneModel.schema).toBe("rubylens.collection.v2");
    expect(runtime.sceneModel.galaxies).toBe(runtime.galaxyModels);
    expect(runtime.galaxyModels.map(model => model.morphology[0])).toEqual([2, 4]);
    expect(runtime.galaxyGroups).toMatchObject([
      { projectLabel: "First", center: [-120, 0, 0] },
      { projectLabel: "Second", center: [120, 0, 0] },
    ]);
    expect(runtime.scenePointCount).toBe(2);
    expect(runtime.interactivePoints.map(point => [point.name, point.projectLabel, point.renderIndex])).toEqual([
      ["First::Node", "First", 0],
      ["Second::Node", "Second", 1],
    ]);
    const bufferedPositions = [
      Array.from(runtime.sceneData.slice(0, 3)),
      Array.from(runtime.sceneData.slice(runtime.SCENE_POINT_STRIDE, runtime.SCENE_POINT_STRIDE + 3)),
    ];
    runtime.interactivePoints.forEach((point, index) => {
      point.position.forEach((value, axis) => expect(value).toBeCloseTo(bufferedPositions[index][axis], 4));
    });
    expect(runtime.interactivePoints[0].position[0]).toBeLessThan(0);
    expect(runtime.interactivePoints[1].position[0]).toBeGreaterThan(0);
    expect(runtime.ensureSearchIndex()).toEqual(["first::node", "second::node"]);
  });

  test("derives stable ordinal labels without adding them to galaxy models", () => {
    const runtime = loadRuntime(collection([
      projectModel("Same", "One", 1),
      projectModel("Same", "Two", 2),
    ]));

    expect(runtime.projectLabels).toEqual(["Same (1)", "Same (2)"]);
    expect(runtime.galaxyModels.map(model => model.projectName)).toEqual(["Same", "Same"]);
  });

  test("orbits the shared universe so every galaxy moves through one camera", () => {
    const runtime = loadRuntime(collection([
      projectModel("First", "One", 1),
      projectModel("Second", "Two", 2),
    ]));
    const positions = runtime.interactivePoints.map(point => [...point.position]);
    const beforeView = runtime.viewMatrix();
    const beforeCenters = runtime.galaxyGroups.map(group => runtime.projectGalaxyCenter(group));
    const beforePoints = runtime.interactivePoints.map(point => runtime.project(point, beforeView));

    runtime.rotateUniverse(40, -25);

    const afterView = runtime.viewMatrix();
    const afterCenters = runtime.galaxyGroups.map(group => runtime.projectGalaxyCenter(group));
    const afterPoints = runtime.interactivePoints.map(point => runtime.project(point, afterView));
    expect(afterView).not.toEqual(beforeView);
    expect(afterCenters[0]).not.toEqual(beforeCenters[0]);
    expect(afterCenters[1]).not.toEqual(beforeCenters[1]);
    expect(afterPoints[0]).not.toEqual(beforePoints[0]);
    expect(afterPoints[1]).not.toEqual(beforePoints[1]);
    expect(runtime.interactivePoints.map(point => point.position)).toEqual(positions);
  });
});
