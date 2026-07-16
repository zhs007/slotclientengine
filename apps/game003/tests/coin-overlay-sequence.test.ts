import { describe, expect, it } from "vitest";
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import {
  GAME003_SAMPLE_COIN_SPIN_RESULT,
  GAME003_SAMPLE_SPIN_RESULT,
  GAME003_SPIN_SCENE,
} from "./fixtures/game003-gmi.js";
import {
  GAME003_COIN_OVERLAY_COMPONENT_NAME,
  createGame003CoinOverlayItems,
} from "../src/coin-overlay-sequence.js";

describe("game003 coin overlay sequence", () => {
  it("maps bg-gencoins otherScene amounts to CO cells in stable x/y order", () => {
    expect(createItems()).toEqual([
      { x: 1, y: 1, amount: 2, text: "2" },
      { x: 1, y: 2, amount: 1, text: "1" },
      { x: 1, y: 3, amount: 150, text: "150" },
    ]);
  });

  it("returns an empty list when bg-gencoins is not triggered", () => {
    expect(
      createGame003CoinOverlayItems({
        logic: createLogic(GAME003_SAMPLE_SPIN_RESULT),
        targetScene: GAME003_SPIN_SCENE,
        coinSymbolCode: 11,
        componentName: GAME003_COIN_OVERLAY_COMPONENT_NAME,
      }),
    ).toEqual([]);
  });

  it("allows a triggered bg-gencoins component to omit unchanged data when there are no CO cells", () => {
    const result = cloneCoinSpinResult();
    result.gmi.replyPlay.results[0].clientData.scenes = [
      toSgc7Scene([
        [8, 9, 12, 1, 1],
        [10, 10, 10, 10, 6],
        [1, 1, 10, 10, 5],
        [8, 6, 3, 5, 6],
        [2, 6, 4, 8, 5],
      ]),
    ];
    result.gmi.replyPlay.results[0].clientData.otherScenes = [];
    result.gmi.replyPlay.results[0].clientData.curGameModParam.mapComponents[
      "bg-gencoins"
    ].basicComponentData.usedOtherScenes = [];
    const logic = createLogic(result);

    expect(
      createGame003CoinOverlayItems({
        logic,
        targetScene: logic.getStep(0).getScene(0),
        coinSymbolCode: 11,
        componentName: GAME003_COIN_OVERLAY_COMPONENT_NAME,
      }),
    ).toEqual([]);
  });

  it("fails fast for missing basic data and invalid usedOtherScenes cardinality", () => {
    const missingBasic = cloneCoinSpinResult();
    delete missingBasic.gmi.replyPlay.results[0].clientData.curGameModParam
      .mapComponents["bg-gencoins"].basicComponentData;
    expect(() => createItems(missingBasic)).toThrow(/basicComponentData/);

    const emptyUsed = cloneCoinSpinResult();
    emptyUsed.gmi.replyPlay.results[0].clientData.curGameModParam.mapComponents[
      "bg-gencoins"
    ].basicComponentData.usedOtherScenes = [];
    expect(createItems(emptyUsed)).toEqual([]);

    const multipleUsed = cloneCoinSpinResult();
    multipleUsed.gmi.replyPlay.results[0].clientData.otherScenes.push(
      toSgc7Scene([
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ]),
    );
    multipleUsed.gmi.replyPlay.results[0].clientData.curGameModParam.mapComponents[
      "bg-gencoins"
    ].basicComponentData.usedOtherScenes = [0, 1];
    expect(() => createItems(multipleUsed)).toThrow(/at most one otherScene/);

    const outOfRange = cloneCoinSpinResult();
    outOfRange.gmi.replyPlay.results[0].clientData.curGameModParam.mapComponents[
      "bg-gencoins"
    ].basicComponentData.usedOtherScenes = [99];
    expect(() => createItems(outOfRange)).toThrow(/out of range/);
  });

  it("fails fast for malformed otherScene values and CO/non-CO amount mismatches", () => {
    const badWidth = cloneCoinSpinResult();
    badWidth.gmi.replyPlay.results[0].clientData.otherScenes[0].values.pop();
    expect(() => createItems(badWidth)).toThrow(/width/);

    const badHeight = cloneCoinSpinResult();
    badHeight.gmi.replyPlay.results[0].clientData.otherScenes[0].values[1].values.pop();
    expect(() => createItems(badHeight)).toThrow(/height/);

    const zeroCoin = cloneCoinSpinResult();
    zeroCoin.gmi.replyPlay.results[0].clientData.otherScenes[0].values[1].values[1] = 0;
    expect(() => createItems(zeroCoin)).toThrow(/positive coin amount/);

    const nonCoinAmount = cloneCoinSpinResult();
    nonCoinAmount.gmi.replyPlay.results[0].clientData.otherScenes[0].values[0].values[0] = 1;
    expect(() => createItems(nonCoinAmount)).toThrow(/non-CO/);

    const fractionalAmount = cloneCoinSpinResult();
    fractionalAmount.gmi.replyPlay.results[0].clientData.otherScenes[0].values[1].values[1] = 1.5;
    expect(() => createItems(fractionalAmount)).toThrow(/integer/);

    const negativeAmount = cloneCoinSpinResult();
    negativeAmount.gmi.replyPlay.results[0].clientData.otherScenes[0].values[1].values[1] =
      -1;
    expect(() => createItems(negativeAmount)).toThrow(/non-negative/);

    const nanAmount = cloneCoinSpinResult();
    nanAmount.gmi.replyPlay.results[0].clientData.otherScenes[0].values[1].values[1] =
      Number.NaN;
    expect(() => createItems(nanAmount)).toThrow(/integer/);
  });

  it("fails fast for invalid coin symbol code and component names", () => {
    expect(() => createItems(undefined, -1)).toThrow(/coinSymbolCode/);
    expect(() =>
      createGame003CoinOverlayItems({
        logic: createLogic(GAME003_SAMPLE_COIN_SPIN_RESULT),
        targetScene: GAME003_SPIN_SCENE,
        coinSymbolCode: undefined as unknown as number,
        componentName: GAME003_COIN_OVERLAY_COMPONENT_NAME,
      }),
    ).toThrow(/coinSymbolCode/);
    expect(() =>
      createGame003CoinOverlayItems({
        logic: createLogic(GAME003_SAMPLE_COIN_SPIN_RESULT),
        targetScene: GAME003_SPIN_SCENE,
        coinSymbolCode: 11,
        componentName: "other" as "bg-gencoins",
      }),
    ).toThrow(/componentName/);
  });
});

function createItems(
  spinResult: unknown = GAME003_SAMPLE_COIN_SPIN_RESULT,
  coinSymbolCode = 11,
) {
  const logic = createLogic(spinResult);
  return createGame003CoinOverlayItems({
    logic,
    targetScene: logic.getStep(0).getScene(0),
    coinSymbolCode,
    componentName: GAME003_COIN_OVERLAY_COMPONENT_NAME,
  });
}

function createLogic(spinResult: unknown) {
  return createSlotGameLogicResult(spinResult, {
    bet: { bet: 5, lines: 10, times: 1 },
    userInfo: { balance: 1000, gameid: 69003 },
  }).logic;
}

function cloneCoinSpinResult(): any {
  return JSON.parse(JSON.stringify(GAME003_SAMPLE_COIN_SPIN_RESULT));
}

function toSgc7Scene(scene: readonly (readonly number[])[]) {
  return {
    values: scene.map((column) => ({ values: [...column] })),
    indexes: [],
    validRow: [],
  };
}
