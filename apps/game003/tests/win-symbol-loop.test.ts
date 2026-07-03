import { describe, expect, it } from "vitest";
import type {
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
} from "@slotclientengine/rendercore/reel";
import {
  createGame003WinSymbolLoopRuntime,
  type Game003WinSymbolLoopRuntimeOptions,
} from "../src/win-symbol-loop.js";
import type { Game003WinSymbolGroup } from "../src/win-sequence.js";

describe("game003 win symbol loop runtime", () => {
  it("plays result groups in order, exposes first-cycle completion, and loops after pause", () => {
    const reelRuntime = new FakeWinReelRuntime();
    const runtime = createRuntime({ reelRuntime: reelRuntime.asRuntime() });

    runtime.start(createGroups());

    expect(reelRuntime.requests).toEqual([
      {
        state: "win",
        positions: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    ]);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "playing",
      currentIndex: 0,
      firstCycleComplete: false,
      amountVisible: true,
      amountText: "$1.00",
      amountPosition: { x: 150, y: 72 },
    });

    expect(runtime.update(0.58)).toEqual({ firstCycleComplete: false });
    expect(reelRuntime.requests.at(-1)).toEqual({
      state: "win",
      positions: [
        { x: 0, y: 2 },
        { x: 1, y: 3 },
        { x: 2, y: 4 },
      ],
    });
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "playing",
      currentIndex: 1,
      amountText: "$1.50",
      amountPosition: { x: 150, y: 372 },
    });

    expect(runtime.update(0.58)).toEqual({ firstCycleComplete: true });
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "cycle-pause",
      currentIndex: null,
      firstCycleComplete: true,
      amountVisible: false,
    });

    runtime.update(0.5);
    expect(reelRuntime.requests).toHaveLength(2);
    runtime.update(0.5);
    expect(reelRuntime.requests.at(-1)).toEqual({
      state: "win",
      positions: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    });
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "playing",
      currentIndex: 0,
      firstCycleComplete: true,
      amountText: "$1.00",
    });
  });

  it("clears active state and result amount before the next spin", () => {
    const reelRuntime = new FakeWinReelRuntime();
    const runtime = createRuntime({ reelRuntime: reelRuntime.asRuntime() });

    runtime.start(createGroups());
    runtime.clear();

    expect(reelRuntime.requests.at(-1)).toEqual({
      state: "normal",
      positions: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    });
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "idle",
      amountVisible: false,
      firstCycleComplete: false,
    });
  });

  it("fails fast for invalid inputs and formatter output", () => {
    const reelRuntime = new FakeWinReelRuntime();
    const runtime = createRuntime({ reelRuntime: reelRuntime.asRuntime() });

    expect(() => runtime.start([])).toThrow(/at least one result/);
    expect(() => runtime.update(-1)).toThrow(/deltaSeconds/);
    expect(() => runtime.start([{ ...createGroups()[0], cashWin: 0 }])).toThrow(
      /cashWin/,
    );

    const badFormatter = createRuntime({
      reelRuntime: new FakeWinReelRuntime().asRuntime(),
      formatter: () => "",
    });
    expect(() => badFormatter.start(createGroups())).toThrow(/formatter/);
  });
});

function createRuntime(
  overrides: Partial<Game003WinSymbolLoopRuntimeOptions> = {},
) {
  return createGame003WinSymbolLoopRuntime({
    reelRuntime: new FakeWinReelRuntime().asRuntime(),
    config: {
      cyclePauseSeconds: 1,
      resultAmount: {
        yOffsetRatioFromCellCenter: 0.22,
        fontSize: 38,
        fill: "#fff7d6",
        stroke: "#5a2500",
        strokeWidth: 5,
      },
    },
    formatter: (amount) => `$${(amount / 100).toFixed(2)}`,
    ...overrides,
  });
}

function createGroups(): Game003WinSymbolGroup[] {
  return [
    {
      stepIndex: 0,
      resultIndex: 0,
      symbol: 4,
      coinWin: 10,
      cashWin: 100,
      positions: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    },
    {
      stepIndex: 0,
      resultIndex: 1,
      symbol: 3,
      coinWin: 15,
      cashWin: 150,
      positions: [
        { x: 0, y: 2 },
        { x: 1, y: 3 },
        { x: 2, y: 4 },
      ],
    },
  ];
}

class FakeWinReelRuntime {
  readonly requests: Array<{
    readonly positions: readonly { readonly x: number; readonly y: number }[];
    readonly state: string;
  }> = [];
  #activePositions: readonly { readonly x: number; readonly y: number }[] = [];
  #activeState: string | null = null;
  #elapsedSeconds = 0;

  asRuntime(): Game003WinSymbolLoopRuntimeOptions["reelRuntime"] {
    return {
      requestVisibleSymbolStates: (positions, state) => {
        this.requests.push({
          positions: positions.map((position) => ({ ...position })),
          state,
        });
        this.#activePositions = positions;
        this.#activeState = state;
        this.#elapsedSeconds = 0;
      },
      getVisibleSymbolStateSnapshots: (positions) =>
        positions.map((position) => this.createStateSnapshot(position)),
      getVisibleSymbolGeometrySnapshots: (positions) =>
        positions.map((position) => this.createGeometrySnapshot(position)),
      update: (deltaSeconds) => {
        if (this.#activeState === "win") {
          this.#elapsedSeconds += deltaSeconds;
          if (this.#elapsedSeconds >= 0.58) {
            this.#activeState = null;
            this.#activePositions = [];
          }
        }
        return {
          completed: false,
          spinning: false,
          startedAxes: [],
          stoppedAxes: [],
        };
      },
    };
  }

  private createStateSnapshot(position: {
    readonly x: number;
    readonly y: number;
  }): RenderVisibleSymbolStateSnapshot {
    const active = this.#activePositions.some(
      (candidate) => candidate.x === position.x && candidate.y === position.y,
    );
    const requestedState = active ? (this.#activeState ?? "normal") : "normal";
    return {
      x: position.x,
      y: position.y,
      code: 1,
      kind: "textured",
      requestedState,
      resolvedState: requestedState,
      isOnce: requestedState === "win",
    };
  }

  private createGeometrySnapshot(position: {
    readonly x: number;
    readonly y: number;
  }): RenderVisibleSymbolGeometrySnapshot {
    return {
      x: position.x,
      y: position.y,
      code: 1,
      kind: "textured",
      centerX: position.x * 100 + 50,
      centerY: position.y * 100 + 50,
      cellWidth: 100,
      cellHeight: 100,
    };
  }
}
