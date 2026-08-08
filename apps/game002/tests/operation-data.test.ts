import { describe, expect, it } from "vitest";
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import {
  readGame002FallOperationData,
  readGame002SpinOperationData,
} from "../src/operation-data.js";
import {
  GAME002_CASCADE_GMI,
  GAME002_CASCADE_REMOVED_SCENE,
} from "./fixtures/game002-cascade-gmi.js";

describe("game002 settled scene operation data", () => {
  it("uses bg-genco scene[2] as the initial settled scene", () => {
    const raw = createUpdatedServerFixture();
    const logic = createLogic(raw);

    const data = readGame002SpinOperationData({
      logic,
      cnSymbolCode: 8,
      auxiliaryValueSymbolCodes: [0, 7, 9],
    });

    expect(data.scene).toEqual(logic.getStep(0).getScene(2));
    expect(data.scene[0]![0]).toBe(5);
    expect(data.scene).not.toEqual(logic.getStep(0).getScene(0));
  });

  it("uses bg-genwm scene[3] as the refill settled scene", () => {
    const raw = createUpdatedServerFixture();
    const logic = createLogic(raw);
    const sourceValues = GAME002_CASCADE_REMOVED_SCENE.map((column) =>
      column.map((code) => (code === -1 ? -1 : null)),
    );

    const data = readGame002FallOperationData({
      step: logic.getStep(1),
      sourceScene: GAME002_CASCADE_REMOVED_SCENE,
      sourceValues,
      cnSymbolCode: 8,
      auxiliaryValueSymbolCodes: [0, 7, 9],
      canDropSymbol: ({ code }) => code !== 0,
    });

    expect(data.refillScene).toEqual(logic.getStep(1).getScene(3));
    expect(data.refillScene[0]![0]).toBe(4);
    expect(data.refillScene).not.toEqual(logic.getStep(1).getScene(2));
  });

  it("fails when the last scene component has invalid cardinality", () => {
    const raw = createUpdatedServerFixture();
    raw.gmi.replyPlay.results[0].clientData.curGameModParam.mapComponents[
      "bg-genco"
    ].basicComponentData.usedScenes = [];

    expect(() =>
      readGame002SpinOperationData({
        logic: createLogic(raw),
        cnSymbolCode: 8,
        auxiliaryValueSymbolCodes: [0, 7, 9],
      }),
    ).toThrow(/settled scene must use exactly one scene/);
  });

  it("rejects bg-spin and bg-refill in the same step", () => {
    const raw = createUpdatedServerFixture();
    const params = raw.gmi.replyPlay.results[0].clientData.curGameModParam;
    params.historyComponents.push("bg-refill");
    params.mapComponents["bg-refill"] = componentWithScene(0);

    expect(() =>
      readGame002SpinOperationData({
        logic: createLogic(raw),
        cnSymbolCode: 8,
        auxiliaryValueSymbolCodes: [0, 7, 9],
      }),
    ).toThrow(/must not trigger bg-refill/);
  });
});

function createUpdatedServerFixture(): any {
  const raw = structuredClone(GAME002_CASCADE_GMI) as any;
  const initial = raw.gmi.replyPlay.results[0].clientData;
  const initialFinal = structuredClone(initial.scenes[0]);
  initialFinal.values[0].values[0] = 5;
  initial.scenes.push(initialFinal);
  initial.curGameModParam.historyComponents = [
    "bg-spin",
    "bg-gencoins",
    "bg-genwilds",
    "bg-gencm",
    "bg-genco",
    "bg-win",
    "bg-remove",
  ];
  initial.curGameModParam.mapComponents["bg-gencm"] = componentWithScene(1);
  initial.curGameModParam.mapComponents["bg-genco"] = componentWithScene(2);

  const refill = raw.gmi.replyPlay.results[1].clientData;
  const refillFinal = structuredClone(refill.scenes[2]);
  refillFinal.values[0].values[0] = 4;
  refill.scenes.push(refillFinal);
  refill.curGameModParam.historyComponents = [
    "bg-respin",
    "bg-dropdown",
    "bg-incwl",
    "bg-refill",
    "bg-gencoins",
    "bg-genwilds",
    "bg-genwm",
  ];
  refill.curGameModParam.mapComponents["bg-genwm"] = componentWithScene(3);
  return raw;
}

function componentWithScene(index: number) {
  return {
    basicComponentData: {
      usedScenes: [index],
      usedOtherScenes: [],
      usedResults: [],
    },
  };
}

function createLogic(value: unknown) {
  return createSlotGameLogicResult(value, {
    bet: { bet: 10, lines: 30, times: 1 },
    userInfo: { gameid: 0 },
  }).logic;
}
