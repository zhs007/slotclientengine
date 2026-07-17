import { describe, expect, it } from "vitest";
import {
  createGame002WinSummaryCollectOptions,
  formatGame002CashSummary,
  resolveGame002WinResultCoinAmount,
  resolveGame002WinResultCashAmount,
  sortGame002CascadeCollectItems,
} from "../src/cascade-win-summary-config.js";

describe("game002 cascade win summary config", () => {
  it("selects coinWin64 by field presence and rejects every invalid amount", () => {
    expect(resolveCoin({ coinWin: 2 })).toBe(2);
    expect(resolveCoin({ coinWin: 2, coinWin64: 5 })).toBe(5);
    for (const result of [
      { coinWin: 2, coinWin64: 0 },
      {},
      { coinWin: 1.5 },
      { coinWin: Number.POSITIVE_INFINITY },
      { coinWin: Number.MAX_SAFE_INTEGER + 1 },
      { cashWin64: 100 },
    ]) {
      expect(() => resolveCoin(result)).toThrow(/positive safe integer/);
    }
    expect(resolveCash({ cashWin: 200 })).toBe(200);
    expect(resolveCash({ cashWin: 200, cashWin64: 580 })).toBe(580);
    expect(() => resolveCash({ cashWin: 1.5 })).toThrow(
      /positive safe integer/,
    );
    expect(formatGame002CashSummary(290)).toBe("$2.90");
    expect(() => formatGame002CashSummary(0)).toThrow(/positive safe integer/);
  });

  it("sorts collect positions by screen row then column", () => {
    const contexts = [
      context({ x: 4, y: 1 }),
      context({ x: 5, y: 0 }),
      context({ x: 4, y: 0 }),
    ];
    expect(
      sortGame002CascadeCollectItems(contexts).map(({ position }) => position),
    ).toEqual([
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 4, y: 1 },
    ]);
  });

  it("derives symbol/value/layout callbacks from the live reel runtime", () => {
    const group = createGroup({ symbol: 8, coinWin64: 8, cashWin64: 80 });
    const runtime = {
      layerLayout: {
        rawReelsContentWidth: 720,
        rawReelsContentHeight: 1080,
      },
      getCurrentScene: () => [[8]],
      getCascadeValues: () => [[5]],
      gameConfig: {
        getPaytableEntry: (code: number) =>
          code === 8
            ? { symbol: "VALUE" }
            : code === 0
              ? { symbol: "WL" }
              : undefined,
      },
    } as any;
    const presentation = {
      order: 1,
      playback: {
        mode: "sequentialCollect",
        startState: "a",
        loopState: "b",
        collectState: "c",
        removeState: "d",
      },
      summary: { mode: "itemAmount" },
    } as const;
    const options = createGame002WinSummaryCollectOptions({
      runtime,
      skin: {
        cascadeWinPresentations: { VALUE: presentation },
      } as any,
    });
    const itemContext = {
      group,
      groupIndex: 0,
      position: { x: 0, y: 0 },
      positionIndex: 0,
    };
    expect(options.position).toEqual({ x: 360, y: 1116 });
    expect(options.sequentialCollectStartIntervalSeconds).toBe(0.3);
    expect(options.resolveGroupSymbol({ group, groupIndex: 0 })).toBe("VALUE");
    expect(options.resolveSymbol(itemContext)).toBe("VALUE");
    expect(
      options.allowCompanionPosition?.({
        ...itemContext,
        groupSymbol: "VALUE",
        symbol: "WL",
      }),
    ).toBe(true);
    expect(
      options.allowCompanionPosition?.({
        ...itemContext,
        groupSymbol: "VALUE",
        symbol: "H1",
      }),
    ).toBe(false);
    expect(options.resolveGroupAmount({ group, groupIndex: 0 })).toBe(80);
    expect(options.resolveItemAmount(itemContext)).toBe(50);
    expect(() =>
      options.resolveItemAmount({
        ...itemContext,
        group: createGroup({
          symbol: 8,
          coinWin64: 8,
          cashWin64: 81,
        }),
      }),
    ).toThrow(/divide.*exactly/);

    runtime.getCascadeValues = () => [[null]];
    expect(() => options.resolveItemAmount(itemContext)).toThrow(/positive/);
    runtime.getCurrentScene = () => [[0]];
    expect(options.resolveSymbol(itemContext)).toBe("WL");
    runtime.getCurrentScene = () => null;
    expect(() => options.resolveSymbol(itemContext)).toThrow(/not available/);
  });
});

function resolveCoin(result: Record<string, unknown>) {
  return resolveGame002WinResultCoinAmount({
    group: createGroup(result),
    groupIndex: 0,
  });
}

function resolveCash(result: Record<string, unknown>) {
  return resolveGame002WinResultCashAmount({
    group: createGroup(result),
    groupIndex: 0,
  });
}

function createGroup(result: Record<string, unknown>) {
  return {
    componentName: "bg-win",
    stepIndex: 0,
    resultIndex: 2,
    result: { pos: [], ...result },
    positions: [{ x: 0, y: 0 }],
    removePositions: [{ x: 0, y: 0 }],
    amount: 80,
  } as any;
}

function context(position: { x: number; y: number }) {
  const group = createGroup({ symbol: 8, coinWin64: 8 });
  return { group, groupIndex: 0, position, positionIndex: 0 };
}
