import { describe, expect, it } from "vitest";
import {
  createSlotOperationServerView,
  requireExactlyOneComponent,
  selectAllPresentComponents,
  selectFirstPresentComponent,
  selectLastPresentComponent,
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

  it("selects the last present component and never treats invalid data as absent", () => {
    const good = component("bg-win");
    const bad = component("bg-win-cm", [99]);
    const logic = {
      getStepCount: () => 1,
      getSteps: () => [],
      getStep: () => ({
        getScene: (index: number) => {
          if (index !== 0)
            throw new RangeError(`scene index ${index} is out of range.`);
          return Object.freeze([Object.freeze([3])]);
        },
        getOtherScene: () => Object.freeze([Object.freeze([9])]),
        getResult: () => Object.freeze({ pos: Object.freeze([0, 0]) }),
      }),
      hasComponent: (_stepIndex: number, name: string) =>
        name === "bg-win" || name === "bg-win-cm",
      getComponent: (_stepIndex: number, name: string) =>
        name === "bg-win" ? good : name === "bg-win-cm" ? bad : undefined,
    } as unknown as GameLogic;

    const step = createSlotOperationServerView(logic).firstStep;
    expect(() => step.lastPresent(["bg-win", "bg-win-cm"], "win")).toThrow(
      /scene index 99 is out of range/,
    );
  });

  it("exposes strict step policies and typed component accessors", () => {
    const a = Object.freeze({
      ...component("a"),
      basicComponentData: Object.freeze({
        usedScenes: Object.freeze([0]),
        usedOtherScenes: Object.freeze([0]),
        usedResults: Object.freeze([0]),
        pos: Object.freeze([0, 0]),
      }),
      usedOtherSceneIndexes: Object.freeze([0]),
      usedResultIndexes: Object.freeze([0]),
    });
    const b = component("b");
    const logic = {
      getStepCount: () => 2,
      getStep: () => ({
        getScene: () => Object.freeze([Object.freeze([3])]),
        getOtherScene: () => Object.freeze([Object.freeze([4])]),
        getResult: () => Object.freeze({ pos: Object.freeze([0, 0]) }),
      }),
      hasComponent: (_stepIndex: number, name: string) =>
        name === "a" || name === "b",
      getComponent: (_stepIndex: number, name: string) =>
        name === "a" ? a : name === "b" ? b : undefined,
    } as unknown as GameLogic;
    const view = createSlotOperationServerView(logic);
    expect(view.firstStep.index).toBe(0);
    expect(view.lastStep.index).toBe(1);
    expect(view.step(1)).toBe(view.lastStep);
    expect(() => view.step(-1)).toThrow(/out of range/);
    expect(view.firstStep.optional("missing", "role")).toMatchObject({
      presence: "absent",
      role: "role",
    });
    expect(() => view.firstStep.require("missing")).toThrow(/missing/);
    const selected = requireExactlyOneComponent(
      view.firstStep,
      ["missing", "a"],
      "picked",
    );
    expect(selected.scene().value).toEqual([[3]]);
    expect(selected.otherScene().value).toEqual([[4]]);
    expect(selected.results()).toHaveLength(1);
    expect(selected.positions()).toEqual([{ x: 0, y: 0 }]);
    expect(() => selected.scene(1)).toThrow(/out of range/);
    expect(
      selectFirstPresentComponent(view.firstStep, ["b", "a"]).componentName,
    ).toBe("b");
    expect(
      selectLastPresentComponent(view.firstStep, ["b", "a"]).componentName,
    ).toBe("a");
    expect(
      view.firstStep.firstPresent(["missing", "also-missing"]),
    ).toMatchObject({
      presence: "absent",
      componentName: "missing",
    });
    expect(
      view.firstStep.lastPresent(["missing", "also-missing"]),
    ).toMatchObject({
      presence: "absent",
      componentName: "also-missing",
    });
    expect(
      selectAllPresentComponents(view.firstStep, ["a", "missing", "b"]),
    ).toHaveLength(2);
    expect(() => view.firstStep.requireExactlyOne(["a", "b"])).toThrow(
      /exactly one/,
    );
    expect(() => view.firstStep.firstPresent([])).toThrow(/must not be empty/);
    expect(() => view.firstStep.lastPresent(["a", "a"])).toThrow(/duplicate/);
    expect(() => view.firstStep.allPresent([""])).toThrow(/must not be blank/);
  });

  it("rejects an empty server round", () => {
    expect(() =>
      createSlotOperationServerView({ getStepCount: () => 0 } as GameLogic),
    ).toThrow(/at least one step/);
  });
});

function component(
  name: string,
  usedSceneIndexes: readonly number[] = [0],
): LogicComponent {
  return Object.freeze({
    name,
    raw: {},
    hasBasicComponentData: true,
    basicComponentData: Object.freeze({
      usedScenes: Object.freeze([...usedSceneIndexes]),
      usedOtherScenes: Object.freeze([]),
      usedResults: Object.freeze([]),
    }),
    usedSceneIndexes: Object.freeze([...usedSceneIndexes]),
    usedOtherSceneIndexes: Object.freeze([]),
    usedResultIndexes: Object.freeze([]),
  });
}
