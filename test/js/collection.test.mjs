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
    expect(runtime.galaxyGroups.map(group => group.projectLabel)).toEqual(["First", "Second"]);
    expect(runtime.galaxyGroups[0].center[0]).toBeLessThan(0);
    expect(runtime.galaxyGroups[1].center[0]).toBeGreaterThan(0);
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

  test("expands collection world and camera space without stretching either galaxy", () => {
    const models = [
      projectModel("First", "First::Node", 101),
      projectModel("Second", "Second::Node", 202, [4, 0, 0, 0, 0, 0, 0, 3, 600, 9]),
    ];
    const pair = loadRuntime(collection(models));
    const triple = loadRuntime(collection([...models, projectModel("Third", "Third::Node", 303)]));
    const localPosition = (runtime, projectIndex) => {
      const point = runtime.interactivePoints.find(candidate => candidate.projectIndex === projectIndex);
      const center = runtime.galaxyGroups[projectIndex].center;
      return point.position.map((coordinate, axis) => coordinate - center[axis]);
    };
    const radius = (scene, scale) => {
      let result = 0;
      for (let offset = 0; offset < scene.sceneData.length; offset += pair.SCENE_POINT_STRIDE) {
        result = Math.max(result, Math.hypot(
          scene.sceneData[offset] * scale,
          scene.sceneData[offset + 1] * scale,
          scene.sceneData[offset + 2] * scale,
        ));
      }
      return result;
    };

    const pairRadii = pair.rawGalaxies.map(scene => radius(scene, scene.scale));
    const pairCenterGap = pair.galaxyGroups[1].center[0] - pair.galaxyGroups[0].center[0];
    expect(pairCenterGap - pairRadii[0] - pairRadii[1]).toBeCloseTo(pair.COLLECTION_LAYOUT.galaxyGap, 4);
    for (const projectIndex of [0, 1]) {
      localPosition(triple, projectIndex).forEach((coordinate, axis) => {
        expect(coordinate).toBeCloseTo(localPosition(pair, projectIndex)[axis], 10);
      });
    }
    expect(triple.cameraDistance).toBeGreaterThan(pair.cameraDistance);
    expect(pair.cameraFocalLength / pair.cameraDistance).toBeCloseTo(440 / 270, 8);

    pair.state.yaw = Math.PI / 2;
    pair.state.pitch = 0;
    const centerPerspectives = pair.galaxyGroups.map(group => pair.projectGalaxyCenter(group)[2]);
    const perspectiveRatio = Math.max(...centerPerspectives) / Math.min(...centerPerspectives);
    expect(perspectiveRatio).toBeLessThanOrEqual(5 / 3);
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
