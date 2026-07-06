import { createGameLogicFromGmi } from "@slotclientengine/logiccore";
import {
  findComponentSteps,
  getComponentOtherScenesByName,
  getComponentResultsByName,
  getComponentScenesByName,
  getComponentWinResultGroupsByName,
} from "../src/index.js";
import { createGmiFixture } from "./test-helpers.js";

describe("component helpers", () => {
  it("reads component data only through GameLogic APIs", () => {
    const logic = createGameLogicFromGmi(
      createGmiFixture({ totalwin: 4, results: 2, componentName: "lineWin" }),
      { bet: 1, lines: 10, totalwin: 4 },
    );

    expect(findComponentSteps(logic, "lineWin")).toEqual([0, 1]);
    expect(getComponentScenesByName(logic, "lineWin")).toHaveLength(2);
    expect(
      getComponentScenesByName(logic, "lineWin", { stepIndex: 1 }),
    ).toHaveLength(1);
    expect(getComponentOtherScenesByName(logic, "lineWin")).toHaveLength(2);
    expect(
      getComponentOtherScenesByName(logic, "lineWin", { stepIndex: 1 }),
    ).toEqual([logic.getOtherScene(1, 0)]);
    expect(getComponentResultsByName(logic, "lineWin")).toHaveLength(2);
    expect(getComponentOtherScenesByName(logic, "missing")).toEqual([]);
    expect(getComponentResultsByName(logic, "missing")).toEqual([]);
    expect(() => findComponentSteps(logic, "")).toThrow(/component name/);
    expect(() => getComponentOtherScenesByName(logic, "")).toThrow(
      /component name/,
    );
    expect(() =>
      getComponentScenesByName(logic, "lineWin", { stepIndex: 99 }),
    ).toThrow(/stepIndex/);
    expect(() =>
      getComponentOtherScenesByName(logic, "lineWin", { stepIndex: 99 }),
    ).toThrow(/stepIndex/);
  });

  it("reads component win result positions through the facade", () => {
    const logic = createGameLogicFromGmi(
      createGmiFixture({
        totalwin: 4,
        results: 2,
        componentName: "lineWin",
      }),
      { bet: 1, lines: 10, totalwin: 4 },
    );

    expect(
      getComponentWinResultGroupsByName(logic, "lineWin", {
        stepIndex: 1,
        scene: logic.getStep(1).getScene(0),
      }),
    ).toMatchObject([
      {
        stepIndex: 1,
        resultIndex: 0,
        positions: [{ x: 0, y: 1 }],
      },
    ]);
    expect(getComponentWinResultGroupsByName(logic, "missing")).toEqual([]);
    expect(() => getComponentWinResultGroupsByName(logic, "")).toThrow(
      /component name/,
    );
  });
});
