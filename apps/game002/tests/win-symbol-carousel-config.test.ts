import { describe, expect, it } from "vitest";
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import {
  createSymbolWinCarousel,
  prepareSymbolWinGroups,
} from "@slotclientengine/rendercore";
import { formatServerUsdAmount } from "../src/money.js";
import {
  GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS,
  GAME002_WIN_COMPONENT_NAMES,
  resolveGame002WinResultAmount,
  validateGame002CascadeWinComponent,
  validateGame002WinComponent,
} from "../src/win-symbol-carousel-config.js";
import {
  GAME002_CASCADE_GMI,
  GAME002_CASCADE_INITIAL_SCENE,
} from "./fixtures/game002-cascade-gmi.js";
import {
  GAME002_REAL_BG_WIN_SCENE,
  GAME002_REAL_BG_WIN_SPIN_RESULT,
} from "./fixtures/game002-gmi.js";

describe("game002 symbol win carousel config", () => {
  it("selects the present 64 field and formats the real result as $3.00", () => {
    const logic = createSlotGameLogicResult(GAME002_REAL_BG_WIN_SPIN_RESULT, {
      bet: { bet: 10, lines: 30, times: 1 },
      userInfo: {},
    }).logic;
    const result = logic.getResult(0, 0);

    expect(
      resolveGame002WinResultAmount({
        componentName: "bg-win",
        stepIndex: 0,
        resultIndex: 0,
        result,
      }),
    ).toBe(300);
    expect(formatServerUsdAmount(300)).toBe("$3.00");

    const carousel = createSymbolWinCarousel({
      target: createTarget(),
      resolveAmount: resolveGame002WinResultAmount,
      validateComponent: validateGame002WinComponent,
      formatAmount: formatServerUsdAmount,
      ...GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS,
    });
    const prepared = carousel.prepare({
      logic,
      stepIndex: 0,
      scene: GAME002_REAL_BG_WIN_SCENE,
      componentNames: GAME002_WIN_COMPONENT_NAMES,
    });
    expect(prepared.groups[0]).toMatchObject({
      componentName: "bg-win",
      resultIndex: 0,
      amount: 300,
      positions: [
        { x: 0, y: 2 },
        { x: 0, y: 3 },
        { x: 1, y: 3 },
        { x: 1, y: 4 },
        { x: 2, y: 3 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
      ],
    });
  });

  it("falls back only when cashWin64 is absent and never treats zero as absent", () => {
    expect(resolveAmount({ cashWin: 125 })).toBe(125);
    expect(resolveAmount({ cashWin: 125, cashWin64: 250 })).toBe(250);
    expect(() => resolveAmount({ cashWin: 125, cashWin64: 0 })).toThrow(
      /positive/,
    );
    expect(() => resolveAmount({})).toThrow(/positive/);
    expect(() => resolveAmount({ cashWin: Number.NaN })).toThrow(/positive/);
  });

  it("validates cascade component cashWin as previous plus current groups", () => {
    const value = structuredClone(GAME002_CASCADE_GMI) as any;
    const firstStep = value.gmi.replyPlay.results[0].clientData;
    firstStep.results[0].cashWin64 = 120;
    firstStep.results[1].cashWin64 = 30;
    firstStep.curGameModParam.mapComponents[
      "bg-win"
    ].basicComponentData.cashWin = 750;
    const logic = createSlotGameLogicResult(value, {
      bet: { bet: 10, lines: 30, times: 1 },
      userInfo: { gameid: 0 },
    }).logic;
    const prepare = (previousCumulativeWin: number) =>
      prepareSymbolWinGroups(
        {
          resolveAmount: resolveGame002WinResultAmount,
          validateComponent: (context) =>
            validateGame002CascadeWinComponent(context, previousCumulativeWin),
        },
        {
          logic,
          stepIndex: 0,
          scene: GAME002_CASCADE_INITIAL_SCENE,
          componentNames: ["bg-win"],
        },
      );
    expect(() => prepare(600)).not.toThrow();
    expect(() => prepare(0)).toThrow(/expected 150/);
    expect(() => prepare(-1)).toThrow(/previous cumulative win/);
  });
});

function resolveAmount(result: Record<string, unknown>): number {
  return resolveGame002WinResultAmount({
    componentName: "bg-win",
    stepIndex: 0,
    resultIndex: 0,
    result: { pos: [], ...result },
  });
}

function createTarget() {
  return {
    requestVisibleSymbolStates: () => undefined,
    getVisibleSymbolStateSnapshots: () => [],
    getVisibleSymbolGeometrySnapshots: () => [],
    update: () => undefined,
  };
}
