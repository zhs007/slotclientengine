import { describe, expect, it } from "vitest";
import basicMessage from "./fixtures/gamemoduleinfo-basic.json";
import { createGameLogic, LogicParseError } from "../src";

const cloneFixture = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("component mapping", () => {
  it("uses historyComponents for trigger checks and maps usedScenes within the current step", () => {
    const logic = createGameLogic(basicMessage);
    const step = logic.getStep(0);

    expect(step.hasComponent("bg-spin")).toBe(true);
    expect(step.hasComponent("bg-trigger-x5")).toBe(true);
    expect(step.hasComponent("not-exists")).toBe(false);
    expect(logic.hasComponent(0, "bg-spin")).toBe(true);

    const spin = step.getComponent("bg-spin");
    expect(spin?.usedSceneIndexes).toEqual([0]);
    expect(spin?.usedOtherSceneIndexes).toEqual([]);
    expect(step.getComponentScenes("bg-spin")[0]).toEqual(step.getScene(0));
    expect(logic.getComponentScenes(0, "bg-spin")[0]).toEqual(step.getScene(0));
  });

  it("maps usedOtherScenes within the current step", () => {
    const logic = createGameLogic(basicMessage);
    const step = logic.getStep(0);
    const genCoins = step.getComponent("bg-gencoins");

    expect(genCoins?.usedOtherSceneIndexes).toEqual([0]);
    expect(step.getComponentOtherScenes("bg-gencoins")[0]).toEqual(
      step.getOtherScene(0),
    );
    expect(logic.getComponentOtherScenes(0, "bg-gencoins")[0]).toEqual(
      step.getOtherScene(0),
    );
  });

  it("maps usedResults and keeps all win result fields", () => {
    const logic = createGameLogic(basicMessage);
    const step = logic.getStep(0);
    const trigger = step.getComponent("bg-trigger-x5");

    expect(trigger?.usedResultIndexes).toEqual([0]);
    expect(step.getComponentResults("bg-trigger-x5")[0].pos).toEqual([4, 0]);
    expect(logic.getComponentResults(0, "bg-trigger-x5")[0].type).toBe(5);
  });

  it("keeps protobuf Any component raw data without faking basicComponentData", () => {
    const step = createGameLogic(basicMessage).getStep(0);
    const pay = step.getComponent("bg-pay");

    expect(pay?.hasBasicComponentData).toBe(false);
    expect(pay?.usedSceneIndexes).toEqual([]);
    expect(pay?.usedOtherSceneIndexes).toEqual([]);
    expect(pay?.usedResultIndexes).toEqual([]);
    expect((pay?.raw as any).type_url).toBe(
      "type.googleapis.com/sgc7pb.MoneyTriggerData",
    );
    expect(step.getComponentScenes("bg-pay")).toEqual([]);
    expect(step.getComponentResults("bg-pay")).toEqual([]);
  });

  it("returns undefined and empty mappings for untriggered components", () => {
    const step = createGameLogic(basicMessage).getStep(0);

    expect(step.getComponent("not-exists")).toBeUndefined();
    expect(step.getComponentScenes("not-exists")).toEqual([]);
    expect(step.getComponentOtherScenes("not-exists")).toEqual([]);
    expect(step.getComponentResults("not-exists")).toEqual([]);
  });

  it("maps data from the last candidate in historyComponents", () => {
    const logic = createGameLogic(createLastComponentMessage());
    const step = logic.getStep(0);
    const candidates = ["b", "c"];

    expect(step.getLastComponentScenes(candidates)).toEqual([[[3]]]);
    expect(step.getLastComponentOtherScenes(candidates)).toEqual([[[30]]]);
    expect(step.getLastComponentResults(candidates)[0].marker).toBe("b");
    expect(logic.getLastComponentScenes(0, candidates)).toEqual([[[3]]]);
    expect(logic.getLastComponentOtherScenes(0, candidates)).toEqual([[[30]]]);
    expect(logic.getLastComponentResults(0, candidates)[0].marker).toBe("b");
  });

  it("returns frozen empty mappings when no candidate was triggered", () => {
    const step = createGameLogic(createLastComponentMessage()).getStep(0);

    const scenes = step.getLastComponentScenes(["missing"]);
    const otherScenes = step.getLastComponentOtherScenes(["missing"]);
    const results = step.getLastComponentResults(["missing"]);
    expect(scenes).toEqual([]);
    expect(otherScenes).toEqual([]);
    expect(results).toEqual([]);
    expect(Object.isFrozen(scenes)).toBe(true);
    expect(Object.isFrozen(otherScenes)).toBe(true);
    expect(Object.isFrozen(results)).toBe(true);
  });

  it("validates last-component candidates and never skips invalid latest data", () => {
    const step = createGameLogic(createLastComponentMessage()).getStep(0);
    expect(() => step.getLastComponentScenes([])).toThrow(/must not be empty/);
    expect(() => step.getLastComponentScenes([""])).toThrow(
      /must not be blank/,
    );
    expect(() => step.getLastComponentScenes(["a", "a"])).toThrow(/duplicate/);

    const invalidIndex = createLastComponentMessage();
    invalidIndex.gmi.replyPlay.results[0].clientData.curGameModParam.mapComponents[
      "b"
    ].basicComponentData.usedScenes = [99];
    expect(() =>
      createGameLogic(invalidIndex)
        .getStep(0)
        .getLastComponentScenes(["b", "c"]),
    ).toThrow(LogicParseError);

    const missingLatest = createLastComponentMessage();
    delete missingLatest.gmi.replyPlay.results[0].clientData.curGameModParam
      .mapComponents["b"];
    expect(() =>
      createGameLogic(missingLatest)
        .getStep(0)
        .getLastComponentResults(["b", "c"]),
    ).toThrow(LogicParseError);
  });

  it("throws when a triggered component is missing in mapComponents", () => {
    const message = cloneFixture(basicMessage);
    delete (
      message.gmi.replyPlay.results[0].clientData.curGameModParam
        .mapComponents as any
    )["bg-spin"];
    const step = createGameLogic(message).getStep(0);

    expect(step.hasComponent("bg-spin")).toBe(true);
    expect(() => step.getComponent("bg-spin")).toThrow(LogicParseError);
  });

  it("throws when component basic data has invalid or out-of-range indexes", () => {
    const invalidUsedScenes = cloneFixture(basicMessage);
    (
      invalidUsedScenes.gmi.replyPlay.results[0].clientData.curGameModParam
        .mapComponents["bg-spin"].basicComponentData as any
    ).usedScenes = [99];
    expect(() =>
      createGameLogic(invalidUsedScenes)
        .getStep(0)
        .getComponentScenes("bg-spin"),
    ).toThrow(LogicParseError);

    const invalidUsedResults = cloneFixture(basicMessage);
    (
      invalidUsedResults.gmi.replyPlay.results[0].clientData.curGameModParam
        .mapComponents["bg-trigger-x5"].basicComponentData as any
    ).usedResults = [99];
    expect(() =>
      createGameLogic(invalidUsedResults)
        .getStep(0)
        .getComponentResults("bg-trigger-x5"),
    ).toThrow(LogicParseError);

    const invalidUsedOtherScenes = cloneFixture(basicMessage);
    (
      invalidUsedOtherScenes.gmi.replyPlay.results[0].clientData.curGameModParam
        .mapComponents["bg-gencoins"].basicComponentData as any
    ).usedOtherScenes = [99];
    expect(() =>
      createGameLogic(invalidUsedOtherScenes)
        .getStep(0)
        .getComponentOtherScenes("bg-gencoins"),
    ).toThrow(LogicParseError);

    const nonArrayIndexes = cloneFixture(basicMessage);
    (
      nonArrayIndexes.gmi.replyPlay.results[0].clientData.curGameModParam
        .mapComponents["bg-spin"].basicComponentData as any
    ).usedScenes = "bad";
    expect(() =>
      createGameLogic(nonArrayIndexes).getStep(0).getComponent("bg-spin"),
    ).toThrow(LogicParseError);

    const missingUsedOtherScenes = cloneFixture(basicMessage);
    delete (
      missingUsedOtherScenes.gmi.replyPlay.results[0].clientData.curGameModParam
        .mapComponents["bg-gencoins"].basicComponentData as any
    ).usedOtherScenes;
    expect(() =>
      createGameLogic(missingUsedOtherScenes)
        .getStep(0)
        .getComponent("bg-gencoins"),
    ).toThrow(LogicParseError);
  });
});

function createLastComponentMessage(): any {
  const message = cloneFixture(basicMessage) as any;
  const clientData = message.gmi.replyPlay.results[0].clientData;
  const params = clientData.curGameModParam;
  clientData.scenes = [matrix(1), matrix(2), matrix(3)];
  clientData.otherScenes = [matrix(10), matrix(20), matrix(30)];
  clientData.results = [
    { pos: [0, 0], marker: "a" },
    { pos: [0, 0], marker: "c" },
    { pos: [0, 0], marker: "b" },
  ];
  params.historyComponents = ["a", "c", "b"];
  params.mapComponents = {
    a: componentData(0),
    c: componentData(1),
    b: componentData(2),
  };
  return message;
}

function matrix(value: number) {
  return { values: [{ values: [value] }] };
}

function componentData(index: number) {
  return {
    basicComponentData: {
      usedScenes: [index],
      usedOtherScenes: [index],
      usedResults: [index],
    },
  };
}
