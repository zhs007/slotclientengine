import { createGameLogicFromGmi } from "@slotclientengine/logiccore";
import {
  findComponentSteps,
  getComponentResultsByName,
  getComponentScenesByName,
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
    expect(getComponentResultsByName(logic, "lineWin")).toHaveLength(2);
    expect(getComponentResultsByName(logic, "missing")).toEqual([]);
    expect(() => findComponentSteps(logic, "")).toThrow(/component name/);
    expect(() =>
      getComponentScenesByName(logic, "lineWin", { stepIndex: 99 }),
    ).toThrow(/stepIndex/);
  });
});
