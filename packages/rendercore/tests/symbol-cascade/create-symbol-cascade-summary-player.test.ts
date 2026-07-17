import { describe, expect, it } from "vitest";
import {
  createSymbolCascadePlayer,
  type CreateSymbolCascadePlayerOptions,
  type SymbolCascadeGroup,
  type SymbolCascadeWinPresentationMap,
} from "../../src/index.js";

describe("symbol cascade win summary collect", () => {
  it("starts every win presentation with emphasis before sequential removal", () => {
    const target = new StatefulTarget();
    const player = createPlayer(
      target,
      {},
      {
        emphasisSeconds: 1,
        nonWinningDimmingAlpha: 0.4,
        startPresentationsWithEmphasis: true,
      },
    );

    player.start(player.prepare(createGroups()));
    expect(target.requests).toEqual([
      "burst:0,0",
      "burst:1,0",
      "prepare:4,1|5,0|4,0",
      "burst:2,0",
    ]);
    expect(player.getSnapshot()).toMatchObject({
      phase: "emphasis",
      summaryTargetValue: 21,
    });

    target.completeOnceStates();
    player.update(0);
    expect(target.requests.at(-1)).toBe("hover:4,1|5,0|4,0");
    expect(player.getSnapshot().phase).toBe("emphasis");

    player.update(1);
    expect(player.getSnapshot().phase).toBe("win");
    player.update(0);
    expect(target.requests.at(-1)).toBe("fade:0,0");
    expect(
      target.requests.filter((request) => request === "burst:0,0"),
    ).toHaveLength(1);
    expect(
      target.requests.filter((request) => request === "prepare:4,1|5,0|4,0"),
    ).toHaveLength(1);
  });

  it("stable-sorts groups and performs generic start-loop-item-remove choreography", () => {
    const target = new StatefulTarget();
    const player = createPlayer(target);
    const groups = createGroups();
    const prepared = player.prepare(groups);
    expect(prepared.groups.map((group) => group.resultIndex)).toEqual([
      0, 1, 2,
    ]);

    player.start(prepared);
    expect(target.requests.at(-1)).toBe("burst:0,0");
    expect(player.getSnapshot()).toMatchObject({
      phase: "win",
      summaryCurrentValue: 0,
      summaryTargetValue: 18,
      summaryVisible: false,
      summaryCounting: true,
    });
    target.completeOnceStates();
    player.update(0.35);
    expect(target.requests.at(-1)).toBe("fade:0,0");
    target.completeOnceStates();
    player.update(0);
    expect(target.requests.at(-1)).toBe("burst:1,0");
    expect(player.getSnapshot().summaryTargetValue).toBe(21);
    target.completeOnceStates();
    player.update(0.35);
    target.completeOnceStates();
    player.update(0);

    expect(target.requests.slice(-2)).toEqual([
      "prepare:4,1|5,0|4,0",
      "burst:2,0",
    ]);
    expect(player.getSnapshot().phase).toBe("collect-start");
    target.completeOnceStates();
    player.update(0);
    expect(target.requests.at(-1)).toBe("hover:4,1|5,0|4,0");
    player.update(0);
    expect(target.requests.at(-1)).toBe("take:4,0");
    expect(player.getSnapshot()).toMatchObject({
      phase: "collect-item",
      currentItemIndex: 0,
      currentItemPosition: { x: 4, y: 0 },
      summaryCurrentValue: 21,
      summaryTargetValue: 21,
    });

    target.resolvePending({ x: 4, y: 0 });
    player.update(0);
    expect(player.getSnapshot().summaryTargetValue).toBe(22);
    target.completeOnceStates();
    player.update(0.35);
    expect(target.requests.at(-1)).toBe("vanish:4,0");
    target.completeOnceStates();
    player.update(0);
    expect(target.releases).toEqual(["0,0", "1,0", "4,0"]);
    expect(target.requests.at(-1)).toBe("take:5,0");

    collectCurrentItem(player, target, { x: 5, y: 0 }, 24);
    expect(target.requests.at(-1)).toBe("take:4,1");
    collectCurrentItem(player, target, { x: 4, y: 1 }, 29);

    expect(player.getSnapshot()).toMatchObject({
      phase: "complete",
      summaryCurrentValue: 29,
      summaryTargetValue: 29,
      summaryVisible: true,
      summaryCounting: false,
      amountVisible: false,
    });
    expect(target.releases).toEqual(["0,0", "1,0", "4,0", "5,0", "4,1"]);
    expect(target.requests).not.toContain("hover:2,0");
    expect(target.requests).not.toContain("take:2,0");
    expect(target.requests).not.toContain("vanish:2,0");
    player.clear();
    expect(player.getSnapshot()).toMatchObject({
      phase: "idle",
      summaryCurrentValue: 0,
      summaryVisible: false,
    });
  });

  it("starts sequential collect items on cadence without waiting for the previous remove", () => {
    const target = new StatefulTarget();
    const player = createPlayer(target, {
      sequentialCollectStartIntervalSeconds: 0.5,
    });

    player.start(player.prepare(createGroups()));
    target.completeOnceStates();
    player.update(0.35);
    target.completeOnceStates();
    player.update(0);
    target.completeOnceStates();
    player.update(0.35);
    target.completeOnceStates();
    player.update(0);
    target.completeOnceStates();
    player.update(0);
    player.update(0);
    expect(target.requests.at(-1)).toBe("take:4,0");
    expect(target.immediateRequests).toEqual(["take:4,0"]);

    target.resolvePending({ x: 4, y: 0 });
    player.update(0);
    target.completeOnceStates();
    player.update(0.35);
    expect(target.requests.at(-1)).toBe("vanish:4,0");
    player.update(0.14);
    expect(target.requests.at(-1)).toBe("vanish:4,0");
    player.update(0.01);
    expect(target.requests.at(-1)).toBe("take:5,0");
    expect(target.immediateRequests).toEqual(["take:4,0", "take:5,0"]);
    expect(target.releases).not.toContain("4,0");
    expect(player.getSnapshot()).toMatchObject({
      phase: "collect-item",
      currentItemIndex: 1,
      currentItemPosition: { x: 5, y: 0 },
    });

    target.resolvePending({ x: 5, y: 0 });
    player.update(0);
    target.completeOnceStates();
    player.update(0.35);
    expect(target.releases).toContain("4,0");
    expect(target.requests.at(-1)).toBe("vanish:5,0");
    player.update(0.15);
    expect(target.requests.at(-1)).toBe("take:4,1");
    expect(target.immediateRequests).toEqual([
      "take:4,0",
      "take:5,0",
      "take:4,1",
    ]);

    target.resolvePending({ x: 4, y: 1 });
    player.update(0);
    target.completeOnceStates();
    player.update(0.35);
    expect(target.releases).toContain("5,0");
    expect(target.requests.at(-1)).toBe("vanish:4,1");
    target.completeOnceStates();
    player.update(0.15);
    expect(player.getSnapshot()).toMatchObject({
      phase: "complete",
      summaryCurrentValue: 29,
      summaryTargetValue: 29,
      summaryCounting: false,
    });
    expect(target.releases.slice(-3)).toEqual(["4,0", "5,0", "4,1"]);

    player.clear();
    player.destroy();
  });

  it("rejects missing presentations, item drift, bad sorting and capabilities", () => {
    const target = new StatefulTarget();
    const groups = createGroups();
    expect(() =>
      createPlayer(target, { presentations: {} }).prepare(groups),
    ).toThrow(/no cascade win presentation/);
    expect(() =>
      createPlayer(target, { resolveItemAmount: () => 4 }).prepare(groups),
    ).toThrow(/item sum/);
    expect(() =>
      createPlayer(target, { sortItems: (items) => items.slice(1) }).prepare(
        groups,
      ),
    ).toThrow(/preserve the item set/);
    expect(() =>
      createPlayer(target, {
        resolveSymbol: ({ position }) =>
          position.x === 4 && position.y === 1
            ? "A"
            : position.x >= 4
              ? "Q"
              : position.x === 0
                ? "A"
                : "B",
      }).prepare(groups),
    ).toThrow(/mixes incompatible presentations/);
    target.missingCapability = "hover";
    expect(() => createPlayer(target).prepare(groups)).toThrow(
      /no hover capability/,
    );
    expect(() =>
      createPlayer(target, {
        sequentialCollectStartIntervalSeconds: 0,
      }),
    ).toThrow(/sequentialCollectStartIntervalSeconds/);
  });
});

function collectCurrentItem(
  player: ReturnType<typeof createSymbolCascadePlayer>,
  target: StatefulTarget,
  position: Position,
  expectedTarget: number,
) {
  target.resolvePending(position);
  player.update(0);
  expect(player.getSnapshot().summaryTargetValue).toBe(expectedTarget);
  target.completeOnceStates();
  player.update(0.35);
  target.completeOnceStates();
  player.update(0);
}

const groupPresentation = Object.freeze({
  order: 0,
  playback: Object.freeze({
    mode: "group" as const,
    winState: "burst",
    removeState: "fade",
  }),
  summary: Object.freeze({ mode: "groupAmount" as const }),
});
const collectPresentation = Object.freeze({
  order: 1,
  playback: Object.freeze({
    mode: "sequentialCollect" as const,
    startState: "prepare",
    loopState: "hover",
    collectState: "take",
    removeState: "vanish",
  }),
  summary: Object.freeze({ mode: "itemAmount" as const }),
});
const presentations = Object.freeze({
  A: groupPresentation,
  B: Object.freeze({ ...groupPresentation }),
  W: Object.freeze({ ...groupPresentation }),
  Q: collectPresentation,
}) satisfies SymbolCascadeWinPresentationMap;

function createPlayer(
  target: StatefulTarget,
  overrides: Partial<
    NonNullable<CreateSymbolCascadePlayerOptions["winSummaryCollect"]>
  > = {},
  playerOverrides: Partial<
    Pick<
      CreateSymbolCascadePlayerOptions,
      | "emphasisSeconds"
      | "dimmingInSeconds"
      | "dimmingOutSeconds"
      | "nonWinningDimmingAlpha"
      | "startPresentationsWithEmphasis"
    >
  > = {},
) {
  const symbols: Record<string, string> = {
    "0,0": "A",
    "1,0": "B",
    "2,0": "W",
    "4,0": "Q",
    "5,0": "Q",
    "4,1": "Q",
  };
  const values: Record<string, number> = {
    "4,0": 1,
    "5,0": 2,
    "4,1": 5,
  };
  return createSymbolCascadePlayer({
    target,
    formatAmount: (amount) => `$${amount}`,
    amountText: {
      fontSize: 20,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 1,
      yOffsetRatioFromCellCenter: 0,
    },
    emphasisSeconds: playerOverrides.emphasisSeconds ?? 0,
    dimmingInSeconds: playerOverrides.dimmingInSeconds ?? 0,
    dimmingOutSeconds: playerOverrides.dimmingOutSeconds ?? 0,
    nonWinningDimmingAlpha: playerOverrides.nonWinningDimmingAlpha ?? 0.82,
    startPresentationsWithEmphasis:
      playerOverrides.startPresentationsWithEmphasis,
    winSummaryCollect: {
      presentations,
      resolveGroupSymbol: ({ group }) =>
        group.resultIndex === 2 ? "Q" : group.resultIndex === 0 ? "A" : "B",
      resolveSymbol: ({ position }) => symbols[key(position)],
      allowCompanionPosition: ({ symbol }) => symbol === "W",
      resolveGroupAmount: ({ group }) => group.result.coinWin64 as number,
      resolveItemAmount: ({ position }) => values[key(position)],
      sortItems: (items) =>
        [...items].sort(
          (left, right) =>
            left.position.y - right.position.y ||
            left.position.x - right.position.x,
        ),
      formatter: String,
      countDurationSeconds: 0.35,
      position: { x: 50, y: 120 },
      textStyle: {
        fontSize: 48,
        fontWeight: 900,
        fill: "#fff",
        stroke: "#000",
        strokeWidth: 6,
      },
      ...overrides,
    },
  });
}

function createGroups(): readonly SymbolCascadeGroup[] {
  return [
    group(
      2,
      [
        { x: 4, y: 1 },
        { x: 5, y: 0 },
        { x: 4, y: 0 },
        { x: 2, y: 0 },
      ],
      8,
      80,
      [
        { x: 4, y: 1 },
        { x: 5, y: 0 },
        { x: 4, y: 0 },
      ],
    ),
    group(0, [{ x: 0, y: 0 }], 18, 180),
    group(1, [{ x: 1, y: 0 }], 3, 30),
  ];
}

function group(
  resultIndex: number,
  positions: readonly Position[],
  coinWin64: number,
  amount: number,
  removePositions: readonly Position[] = positions,
): SymbolCascadeGroup {
  return Object.freeze({
    componentName: "component",
    stepIndex: 0,
    resultIndex,
    result: { coinWin64 } as never,
    positions,
    removePositions,
    amount,
  });
}

interface Position {
  readonly x: number;
  readonly y: number;
}

class StatefulTarget {
  readonly requests: string[] = [];
  readonly immediateRequests: string[] = [];
  readonly releases: string[] = [];
  readonly states = new Map<string, { requested: string; resolved: string }>();
  missingCapability: string | null = null;

  requestVisibleSymbolStates(
    positions: readonly Position[],
    state: string,
    transitionMode: "boundary" | "immediate" = "boundary",
  ) {
    const request = `${state}:${positions.map(key).join("|")}`;
    this.requests.push(request);
    if (transitionMode === "immediate") this.immediateRequests.push(request);
    for (const position of positions) {
      const current = this.state(position);
      this.states.set(key(position), {
        requested: state,
        resolved:
          transitionMode !== "immediate" &&
          current.resolved === "hover" &&
          state !== "normal"
            ? current.resolved
            : state,
      });
    }
  }

  getVisibleSymbolStateSnapshots(positions: readonly Position[]) {
    return positions.map((position) => {
      const state = this.state(position);
      return {
        ...position,
        code: 1,
        kind: "textured" as const,
        requestedState: state.requested,
        resolvedState: state.resolved,
        isOnce: !["normal", "hover"].includes(state.resolved),
      };
    });
  }

  getVisibleSymbolGeometrySnapshots(positions: readonly Position[]) {
    return positions.map((position) => ({
      ...position,
      code: 1,
      kind: "textured" as const,
      centerX: position.x * 100 + 50,
      centerY: position.y * 100 + 50,
      cellWidth: 100,
      cellHeight: 100,
    }));
  }

  hasVisibleSymbolStateCapability(_x: number, _y: number, state: string) {
    return state !== this.missingCapability;
  }

  releaseVisibleSymbols(positions: readonly Position[]) {
    this.releases.push(positions.map(key).join("|"));
  }
  setVisibleSymbolDimming() {}
  clearVisibleSymbolDimming() {}
  update() {
    return { completed: false, spinning: false };
  }

  completeOnceStates() {
    for (const [position, state] of this.states) {
      if (!["normal", "hover"].includes(state.resolved)) {
        this.states.set(position, { requested: "normal", resolved: "normal" });
      }
    }
  }

  resolvePending(position: Position) {
    const state = this.state(position);
    this.states.set(key(position), {
      requested: state.requested,
      resolved: state.requested,
    });
  }

  private state(position: Position) {
    return (
      this.states.get(key(position)) ?? {
        requested: "normal",
        resolved: "normal",
      }
    );
  }
}

function key(position: Position): string {
  return `${position.x},${position.y}`;
}
