import { describe, expect, it } from "vitest";
import {
  selectServerComponentSource,
  type GameLogic,
  type GameLogicStep,
  type LogicComponent,
} from "../../src/index";

describe("slot operation component selectors", () => {
  it("preserves authoritative component indexes and normalizes positions", () => {
    const scene = Object.freeze([Object.freeze([3])]);
    const other = Object.freeze([Object.freeze([9])]);
    const result = Object.freeze({ pos: Object.freeze([0, 0]), cashWin: 10 });
    const component: LogicComponent = Object.freeze({
      name: "bg-test",
      raw: {},
      hasBasicComponentData: true,
      basicComponentData: Object.freeze({
        usedScenes: Object.freeze([0]),
        usedOtherScenes: Object.freeze([0]),
        usedResults: Object.freeze([0]),
        pos: Object.freeze([0, 0]),
      }),
      usedSceneIndexes: Object.freeze([0]),
      usedOtherSceneIndexes: Object.freeze([0]),
      usedResultIndexes: Object.freeze([0]),
    });
    const step = {
      getScene: () => scene,
      getOtherScene: () => other,
      getResult: () => result,
    } as unknown as GameLogicStep;
    const logic = {
      getStepCount: () => 1,
      getStep: () => step,
      getComponent: (_stepIndex: number, name: string) =>
        name === "bg-test" ? component : undefined,
    } as unknown as GameLogic;

    const source = selectServerComponentSource({
      logic,
      stepIndex: 0,
      bindings: { target: { componentName: "bg-test" } },
    });

    expect(source.bindings.target).toMatchObject({
      componentName: "bg-test",
      scenes: [{ index: 0, value: scene }],
      otherScenes: [{ index: 0, value: other }],
      results: [{ index: 0, value: result }],
      positions: [{ x: 0, y: 0 }],
    });
  });

  it("rejects absent required components without a fallback", () => {
    const logic = {
      getStepCount: () => 1,
      getComponent: () => undefined,
    } as unknown as GameLogic;
    expect(() =>
      selectServerComponentSource({
        logic,
        stepIndex: 0,
        bindings: { missing: { componentName: "bg-missing" } },
      }),
    ).toThrow(/required component/);
  });
});
