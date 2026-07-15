import { describe, expect, it } from "vitest";
import {
  createLastUseRemoveGroups,
  createSymbolCascadePlayer,
  type SymbolCascadeGroup,
} from "../../src/index.js";

describe("symbol cascade player", () => {
  it("shows all amounts, then wins and removes each group sequentially", () => {
    const target = new FakeTarget();
    const player = createSymbolCascadePlayer({
      target,
      formatAmount: (amount) => `$${amount}`,
      amountText: {
        fontSize: 40,
        fill: "#fff",
        stroke: "#000",
        strokeWidth: 2,
        yOffsetRatioFromCellCenter: 0.25,
      },
      emphasisSeconds: 0,
      dimmingInSeconds: 0,
      dimmingOutSeconds: 0,
      nonWinningDimmingAlpha: 0.82,
    });
    const groups: readonly SymbolCascadeGroup[] = [
      group(
        0,
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
        [{ x: 0, y: 0 }],
        10,
      ),
      group(1, [{ x: 0, y: 1 }], [{ x: 0, y: 1 }], 20),
    ];
    player.start(player.prepare(groups));
    expect(target.requests).toEqual(["win:0,0|0,1"]);
    expect(player.getSnapshot()).toMatchObject({
      phase: "win",
      amountVisible: true,
      amountText: "$10 | $20",
    });
    expect(target.dimming[0]).toBe("0,0|0,1:0");

    target.completeRequestedState();
    expect(player.update(0.1).completed).toBe(false);
    expect(target.requests.at(-1)).toBe("remove:0,0");
    expect(player.getSnapshot()).toMatchObject({
      phase: "remove",
      amountVisible: true,
      amountText: "$10 | $20",
    });
    expect(target.releases).toEqual([]);

    target.completeRequestedState();
    expect(player.update(0.1).completed).toBe(false);
    expect(target.releases).toEqual(["0,0"]);
    expect(target.requests.at(-1)).toBe("win:0,1");
    expect(player.getSnapshot()).toMatchObject({
      phase: "win",
      currentIndex: 1,
      amountText: "$20",
    });

    target.completeRequestedState();
    expect(player.update(0.1).completed).toBe(false);
    expect(target.requests.at(-1)).toBe("remove:0,1");
    expect(player.getSnapshot()).toMatchObject({
      phase: "remove",
      amountText: "$20",
    });

    target.completeRequestedState();
    expect(player.update(0.1)).toEqual({ completed: true });
    expect(
      target.requests.filter((request) => request.startsWith("win:")),
    ).toEqual(["win:0,0|0,1", "win:0,1"]);
    expect(target.releases).toEqual(["0,0", "0,1"]);
    expect(player.getSnapshot()).toMatchObject({
      phase: "complete",
      amountVisible: false,
    });
  });

  it("fails prepare when a remove capability is absent", () => {
    const target = new FakeTarget();
    target.removeCapability = false;
    const player = createSymbolCascadePlayer({
      target,
      formatAmount: String,
      amountText: {
        fontSize: 20,
        fill: "#fff",
        stroke: "#000",
        strokeWidth: 1,
        yOffsetRatioFromCellCenter: 0,
      },
      emphasisSeconds: 0,
      dimmingInSeconds: 0,
      dimmingOutSeconds: 0,
      nonWinningDimmingAlpha: 0.82,
    });
    expect(() =>
      player.prepare([group(0, [{ x: 0, y: 0 }], [{ x: 0, y: 0 }], 1)]),
    ).toThrow(/no remove capability/);
  });

  it("strictly validates generic prepared groups before animation starts", () => {
    const target = new FakeTarget();
    const player = createPlayer(target);
    expect(() => player.prepare([])).toThrow(/must not be empty/);
    expect(() =>
      player.prepare([
        group(
          0,
          [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          [{ x: 0, y: 0 }],
          1,
        ),
      ]),
    ).toThrow(/duplicate position/);
    expect(() =>
      player.prepare([group(0, [{ x: -1, y: 0 }], [{ x: -1, y: 0 }], 1)]),
    ).toThrow(/non-negative x\/y pair/);
    expect(() =>
      player.prepare([group(0, [{ x: 0, y: 0 }], [{ x: 0, y: 1 }], 1)]),
    ).toThrow(/not a win position/);
    expect(() =>
      player.prepare([
        group(0, [{ x: 0, y: 0 }], [{ x: 0, y: 0 }], Number.NaN),
      ]),
    ).toThrow(/finite and positive/);
    target.winCapability = false;
    expect(() =>
      player.prepare([group(0, [{ x: 0, y: 0 }], [{ x: 0, y: 0 }], 1)]),
    ).toThrow(/no win capability/);
  });

  it("enforces update, clear, repeated-start and destroy lifecycles", () => {
    const target = new FakeTarget();
    const player = createPlayer(target);
    const prepared = player.prepare([
      group(0, [{ x: 0, y: 0 }], [{ x: 0, y: 0 }], 1),
    ]);
    player.start(prepared);
    expect(() => player.start(prepared)).toThrow(/cannot start from win/);
    expect(() => player.update(-1)).toThrow(/finite and non-negative/);
    expect(() => player.update(Number.NaN)).toThrow(/finite and non-negative/);
    player.clear();
    expect(player.getSnapshot()).toMatchObject({
      phase: "idle",
      amountVisible: false,
    });
    expect(target.requests.at(-1)).toBe("normal:0,0");
    player.destroy();
    player.destroy();
    expect(player.getSnapshot().phase).toBe("destroyed");
    expect(() => player.update(0)).toThrow(/was destroyed/);
    expect(() => player.clear()).toThrow(/was destroyed/);
  });

  it("assigns a shared position to its last result remove group", () => {
    const groups = createLastUseRemoveGroups([
      group(
        0,
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
        [],
        10,
      ),
      group(
        1,
        [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
        [],
        20,
      ),
    ]);
    expect(groups[0].removePositions).toEqual([{ x: 0, y: 0 }]);
    expect(groups[1].removePositions).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it("fades non-winners over a bounded emphasis, then wins the protected group", () => {
    const target = new FakeTarget();
    const player = createSymbolCascadePlayer({
      target,
      formatAmount: (amount) => `$${amount}`,
      amountText: {
        fontSize: 20,
        fill: "#fff",
        stroke: "#000",
        strokeWidth: 1,
        yOffsetRatioFromCellCenter: 0,
      },
      emphasisSeconds: 1,
      dimmingInSeconds: 0.1,
      dimmingOutSeconds: 0.1,
      nonWinningDimmingAlpha: 0.85,
    });
    player.start(player.prepare([group(0, [{ x: 0, y: 0 }], [], 10)]));
    expect(player.getSnapshot()).toMatchObject({
      phase: "emphasis",
      amountVisible: true,
      amountText: "$10",
    });
    expect(target.requests).toEqual([]);
    expect(target.dimming).toEqual(["0,0:0"]);
    player.update(0.05);
    expect(Number(target.dimming.at(-1)?.split(":")[1])).toBeCloseTo(0.425);
    player.update(0.05);
    expect(Number(target.dimming.at(-1)?.split(":")[1])).toBeCloseTo(0.85);
    player.update(1);
    expect(target.requests).toEqual([]);
    player.update(0.05);
    expect(Number(target.dimming.at(-1)?.split(":")[1])).toBeCloseTo(0.425);
    player.update(0.05);
    expect(target.requests).toEqual(["win:0,0"]);
    target.completeRequestedState();
    expect(player.update(0.1)).toEqual({ completed: true });
    expect(target.releases).toEqual([]);
    expect(target.dimming.at(-1)).toBe("clear");
  });
});

function group(
  resultIndex: number,
  positions: readonly { readonly x: number; readonly y: number }[],
  removePositions: readonly { readonly x: number; readonly y: number }[],
  amount: number,
): SymbolCascadeGroup {
  return Object.freeze({
    componentName: "bg-win",
    stepIndex: 0,
    resultIndex,
    result: {} as never,
    positions,
    removePositions,
    amount,
  });
}

function createPlayer(target: FakeTarget) {
  return createSymbolCascadePlayer({
    target,
    formatAmount: String,
    amountText: {
      fontSize: 20,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 1,
      yOffsetRatioFromCellCenter: 0,
    },
    emphasisSeconds: 0,
    dimmingInSeconds: 0,
    dimmingOutSeconds: 0,
    nonWinningDimmingAlpha: 0.82,
  });
}

class FakeTarget {
  readonly requests: string[] = [];
  readonly releases: string[] = [];
  readonly dimming: string[] = [];
  winCapability = true;
  removeCapability = true;
  private active: {
    positions: readonly { readonly x: number; readonly y: number }[];
    state: string;
  } | null = null;
  private complete = false;

  requestVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: string,
  ): void {
    this.active = { positions, state };
    this.complete = false;
    this.requests.push(
      `${state}:${positions.map(({ x, y }) => `${x},${y}`).join("|")}`,
    );
  }
  getVisibleSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ) {
    return positions.map((position) => ({
      ...position,
      code: 1,
      kind: "textured" as const,
      requestedState: this.complete
        ? "normal"
        : (this.active?.state ?? "normal"),
      resolvedState: this.complete
        ? "normal"
        : (this.active?.state ?? "normal"),
      isOnce: !this.complete,
    }));
  }
  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ) {
    return positions.map((position) => ({
      ...position,
      code: 1,
      kind: "textured" as const,
      centerX: 50,
      centerY: 50,
      cellWidth: 100,
      cellHeight: 100,
    }));
  }
  hasVisibleSymbolStateCapability(
    _x: number,
    _y: number,
    state: string,
  ): boolean {
    if (state === "win") return this.winCapability;
    return state !== "remove" || this.removeCapability;
  }
  releaseVisibleSymbols(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void {
    this.releases.push(positions.map(({ x, y }) => `${x},${y}`).join("|"));
  }
  setVisibleSymbolDimming(
    positions: readonly { readonly x: number; readonly y: number }[],
    dimmingAlpha: number,
  ): void {
    this.dimming.push(
      `${positions.map(({ x, y }) => `${x},${y}`).join("|")}:${dimmingAlpha}`,
    );
  }
  clearVisibleSymbolDimming(): void {
    this.dimming.push("clear");
  }
  update(): any {
    return {
      completed: false,
      spinning: false,
      startedCells: [],
      landedCells: [],
    };
  }
  completeRequestedState(): void {
    this.complete = true;
  }
}
