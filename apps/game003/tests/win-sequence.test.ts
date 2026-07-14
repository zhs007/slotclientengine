import { describe, expect, it } from "vitest";
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import { createSymbolWinCarousel } from "@slotclientengine/rendercore";
import {
  GAME003_SAMPLE_SPIN_RESULT,
  GAME003_SAMPLE_WIN_SPIN_RESULT,
  GAME003_WIN_SPIN_SCENE,
} from "./fixtures/game003-gmi.js";
import {
  GAME003_WIN_COMPONENT_NAMES,
  resolveGame003WinResultAmount,
  validateGame003WinComponent,
} from "../src/win-sequence.js";

describe("game003 win symbol sequence", () => {
  it("parses bg-wins usedResults into ordered win symbol groups", () => {
    const groups = createGame003WinSymbolSequence(
      createLogic(GAME003_SAMPLE_WIN_SPIN_RESULT),
      GAME003_WIN_SPIN_SCENE,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      stepIndex: 0,
      resultIndex: 0,
      componentName: "bg-wins",
      amount: 100,
      positions: [
        { x: 0, y: 4 },
        { x: 1, y: 2 },
        { x: 2, y: 0 },
      ],
    });
    expect(groups[1]).toMatchObject({
      stepIndex: 0,
      resultIndex: 1,
      componentName: "bg-wins",
      amount: 150,
      positions: [
        { x: 0, y: 2 },
        { x: 1, y: 3 },
        { x: 2, y: 4 },
      ],
    });
  });

  it("does not invent win positions when bg-wins is not triggered", () => {
    expect(
      createGame003WinSymbolSequence(
        createLogic(GAME003_SAMPLE_SPIN_RESULT),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toEqual([]);
  });

  it("does not treat symbolNum as a visible coordinate count for ways wins", () => {
    const symbolNumMismatch = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    getBgWins(symbolNumMismatch).symbolNum = 5;

    expect(
      createGame003WinSymbolSequence(
        createLogic(symbolNumMismatch),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toHaveLength(2);
  });

  it("does not enforce game-specific symbol matching without a validator", () => {
    const wildScene = GAME003_WIN_SPIN_SCENE.map((column, x) =>
      Object.freeze(column.map((code, y) => (x === 2 && y === 4 ? 0 : code))),
    );
    const wildResult = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    getClientResults(wildResult)[1].wilds = 1;

    expect(
      createGame003WinSymbolSequence(createLogic(wildResult), wildScene),
    ).toHaveLength(2);
  });

  it("fails fast for component win total mismatches", () => {
    const wild = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    getBgWins(wild).basicComponentData.coinWin = 24;
    expect(() =>
      createGame003WinSymbolSequence(createLogic(wild), GAME003_WIN_SPIN_SCENE),
    ).toThrow(/coinWin/);
  });

  it("keeps symbol optional and preserves its app-owned wire validation", () => {
    const noSymbol = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    delete getClientResults(noSymbol)[0].symbol;
    expect(
      createGame003WinSymbolSequence(
        createLogic(noSymbol),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toHaveLength(2);

    const invalidSymbol = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    getClientResults(invalidSymbol)[0].symbol = -1;
    expect(() =>
      createGame003WinSymbolSequence(
        createLogic(invalidSymbol),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toThrow(/symbol.*non-negative integer/);

    const invalidCoinWin = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    getClientResults(invalidCoinWin)[0].coinWin = "10";
    expect(() =>
      createGame003WinSymbolSequence(
        createLogic(invalidCoinWin),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toThrow(/coinWin/);
  });

  it("requires each displayed result to carry a positive cashWin", () => {
    const missingCashWin = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    delete getClientResults(missingCashWin)[0].cashWin;
    expect(() =>
      createGame003WinSymbolSequence(
        createLogic(missingCashWin),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toThrow(/cashWin.*required/);

    const zeroCashWin = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    getClientResults(zeroCashWin)[0].cashWin = 0;
    expect(() =>
      createGame003WinSymbolSequence(
        createLogic(zeroCashWin),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toThrow(/cashWin.*positive/);
  });

  it("fails when triggered bg-wins omits basicComponentData", () => {
    const missingBasic = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    delete getBgWins(missingBasic).basicComponentData;

    expect(() =>
      createGame003WinSymbolSequence(
        createLogic(missingBasic),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toThrow(/basicComponentData/);
  });

  it("keeps position bounds explicit even without symbol matching", () => {
    const mismatchedScene = GAME003_WIN_SPIN_SCENE.map((column, x) =>
      Object.freeze(column.map((code, y) => (x === 0 && y === 4 ? 1 : code))),
    );
    expect(
      createGame003WinSymbolSequence(
        createLogic(GAME003_SAMPLE_WIN_SPIN_RESULT),
        mismatchedScene,
      ),
    ).toHaveLength(2);

    const outOfBounds = clone(GAME003_SAMPLE_WIN_SPIN_RESULT);
    getClientResults(outOfBounds)[0].pos = [5, 0];
    expect(() =>
      createGame003WinSymbolSequence(
        createLogic(outOfBounds),
        GAME003_WIN_SPIN_SCENE,
      ),
    ).toThrow(/out of scene bounds/);
  });
});

function createGame003WinSymbolSequence(
  logic: ReturnType<typeof createLogic>,
  scene: typeof GAME003_WIN_SPIN_SCENE,
) {
  const carousel = createSymbolWinCarousel({
    target: {
      requestVisibleSymbolStates: () => undefined,
      getVisibleSymbolStateSnapshots: () => [],
      getVisibleSymbolGeometrySnapshots: () => [],
      update: () => undefined,
    },
    resolveAmount: resolveGame003WinResultAmount,
    validateComponent: validateGame003WinComponent,
    formatAmount: String,
    cyclePauseSeconds: 1,
    amountText: {
      yOffsetRatioFromCellCenter: 0.22,
      fontSize: 38,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 5,
    },
  });
  return carousel.prepare({
    logic,
    stepIndex: 0,
    scene,
    componentNames: GAME003_WIN_COMPONENT_NAMES,
  }).groups;
}

function createLogic(rawResult: unknown) {
  return createSlotGameLogicResult(rawResult, {
    bet: { bet: 5, lines: 10, times: 1 },
    userInfo: { balance: 1000, gameid: 69003 },
  }).logic;
}

function clone<T>(value: T): any {
  return JSON.parse(JSON.stringify(value));
}

function getClientResults(rawResult: any): any[] {
  return rawResult.gmi.replyPlay.results[0].clientData.results;
}

function getBgWins(rawResult: any): any {
  return rawResult.gmi.replyPlay.results[0].clientData.curGameModParam
    .mapComponents["bg-wins"];
}
