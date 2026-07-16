import { describe, expect, it } from "vitest";
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import {
  GAME002_CN_VALUE_SCENE,
  GAME002_CN_VALUE_SPIN_RESULT,
  GAME002_SAMPLE_SPIN_RESULT,
} from "./fixtures/game002-gmi.js";
import {
  createGame002CnPresentationValues,
  createGame002CnValueItems,
  GAME002_CN_VALUE_COMPONENT_NAME,
} from "../src/cn-value-sequence.js";

describe("game002 CN otherScene value sequence", () => {
  it("maps the complete fixture in stable x/y order with raw values", () => {
    expect(createItems()).toEqual([
      { x: 2, y: 6, symbol: "CN", symbolCode: 8, value: 2 },
      { x: 2, y: 7, symbol: "CN", symbolCode: 8, value: 25 },
      { x: 5, y: 3, symbol: "CN", symbolCode: 8, value: 1 },
      { x: 5, y: 4, symbol: "CN", symbolCode: 8, value: 1 },
    ]);
    expect(Object.isFrozen(createItems())).toBe(true);
    expect(Object.isFrozen(createItems()[0])).toBe(true);
  });

  it("returns empty when the component is absent or its unchanged otherScene is omitted", () => {
    const logic = createLogic(GAME002_SAMPLE_SPIN_RESULT);
    expect(
      createGame002CnValueItems({
        logic,
        targetScene: logic.getStep(0).getScene(0),
        cnSymbolCode: 8,
        componentName: GAME002_CN_VALUE_COMPONENT_NAME,
        stepIndex: 0,
      }),
    ).toEqual([]);

    const unchanged = structuredClone(GAME002_CN_VALUE_SPIN_RESULT) as any;
    unchanged.gmi.replyPlay.results[0].clientData.otherScenes = [];
    unchanged.gmi.replyPlay.results[0].clientData.curGameModParam.mapComponents[
      "bg-gencoins"
    ].basicComponentData.usedOtherScenes = [];
    expect(createItems(unchanged)).toEqual([]);
  });

  it("creates a frozen target matrix with server values only at CN cells", () => {
    const matrix = createGame002CnPresentationValues({
      targetScene: GAME002_CN_VALUE_SCENE,
      items: createItems(),
    });
    expect(matrix[2][6]).toBe(2);
    expect(matrix[2][7]).toBe(25);
    expect(matrix[5][3]).toBe(1);
    expect(matrix[5][4]).toBe(1);
    expect(matrix[0][0]).toBeNull();
    expect(Object.isFrozen(matrix)).toBe(true);
    expect(matrix.every((column) => Object.isFrozen(column))).toBe(true);
  });

  it("fails for missing basic data, cardinality, dimensions and unsafe values", () => {
    const mutations: Array<(result: any) => void> = [
      (result) =>
        delete result.gmi.replyPlay.results[0].clientData.curGameModParam
          .mapComponents["bg-gencoins"].basicComponentData,
      (result) => {
        result.gmi.replyPlay.results[0].clientData.otherScenes.push(
          structuredClone(
            result.gmi.replyPlay.results[0].clientData.otherScenes[0],
          ),
        );
        result.gmi.replyPlay.results[0].clientData.curGameModParam.mapComponents[
          "bg-gencoins"
        ].basicComponentData.usedOtherScenes = [0, 1];
      },
      (result) =>
        result.gmi.replyPlay.results[0].clientData.otherScenes[0].values.pop(),
      (result) =>
        result.gmi.replyPlay.results[0].clientData.otherScenes[0].values[2].values.pop(),
      (result) =>
        (result.gmi.replyPlay.results[0].clientData.otherScenes[0].values[2].values[6] = 0),
      (result) =>
        (result.gmi.replyPlay.results[0].clientData.otherScenes[0].values[2].values[6] = 1.5),
      (result) =>
        (result.gmi.replyPlay.results[0].clientData.otherScenes[0].values[0].values[0] = 1),
    ];
    for (const mutate of mutations) {
      const result = structuredClone(GAME002_CN_VALUE_SPIN_RESULT);
      mutate(result);
      expect(() => createItems(result)).toThrow();
    }
    expect(() => createItems(undefined, -1)).toThrow(/symbolCode/);
    expect(() => createItems(undefined, Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /symbolCode/,
    );
  });

  it("rejects an app component name outside the fixed game002 contract", () => {
    const logic = createLogic(GAME002_CN_VALUE_SPIN_RESULT);
    expect(() =>
      createGame002CnValueItems({
        logic,
        targetScene: GAME002_CN_VALUE_SCENE,
        cnSymbolCode: 8,
        componentName: "other" as "bg-gencoins",
        stepIndex: 0,
      }),
    ).toThrow(/componentName/);
  });

  it("rejects duplicate, non-positive and target-mismatched matrix items", () => {
    const items = createItems();
    expect(() =>
      createGame002CnPresentationValues({
        targetScene: GAME002_CN_VALUE_SCENE,
        items: [...items, items[0]],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      createGame002CnPresentationValues({
        targetScene: GAME002_CN_VALUE_SCENE,
        items: [{ ...items[0], value: 0 }],
      }),
    ).toThrow(/positive/);
    expect(() =>
      createGame002CnPresentationValues({
        targetScene: GAME002_CN_VALUE_SCENE,
        items: [{ ...items[0], x: 0, y: 0 }],
      }),
    ).toThrow(/does not match/);
  });
});

function createItems(
  result: unknown = GAME002_CN_VALUE_SPIN_RESULT,
  cnSymbolCode = 8,
) {
  const logic = createLogic(result);
  return createGame002CnValueItems({
    logic,
    targetScene: logic.getStep(0).getScene(0),
    cnSymbolCode,
    componentName: GAME002_CN_VALUE_COMPONENT_NAME,
    stepIndex: 0,
  });
}

function createLogic(result: unknown) {
  return createSlotGameLogicResult(result, {
    bet: { bet: 5, lines: 30, times: 1 },
    userInfo: { balance: 1000, gameid: 69002 },
  }).logic;
}
