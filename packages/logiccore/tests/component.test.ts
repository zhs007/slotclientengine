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
