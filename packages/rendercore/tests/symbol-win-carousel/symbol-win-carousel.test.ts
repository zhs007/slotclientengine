import { describe, expect, it } from "vitest";
import type {
  GameLogic,
  GameLogicStep,
  LogicComponent,
  SceneMatrix,
  WinResult,
} from "@slotclientengine/logiccore";
import {
  createSymbolWinCarousel,
  type VisibleSymbolPresentationTarget,
} from "../../src/index.js";

const SCENE = Object.freeze([
  Object.freeze([1, 1, 1, 1, 1]),
  Object.freeze([1, 1, 1, 1, 1]),
  Object.freeze([1, 1, 1, 1, 1]),
  Object.freeze([1, 1, 1, 1, 1]),
]);

describe("createSymbolWinCarousel", () => {
  it("adopts compiler-produced plain groups without retaining GameLogic", () => {
    const carousel = createCarousel();
    const winResult = result([0, 0, 1, 1], 100);
    const prepared = carousel.prepareGroups([
      {
        componentName: "line-win",
        stepIndex: 0,
        resultIndex: 0,
        result: winResult,
        positions: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        amount: 100,
      },
    ]);

    expect(prepared.groupCount).toBe(1);
    expect(carousel.start(prepared)).toEqual({ started: true });
    expect(() => carousel.start(prepared)).toThrow(/cannot start from playing/);
    expect(() =>
      carousel.prepareGroups([
        {
          ...prepared.groups[0]!,
          positions: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      ]),
    ).toThrow(/duplicate position/);

    const multi = createCarousel();
    const multiPrepared = multi.prepareGroups([
      prepared.groups[0]!,
      { ...prepared.groups[0]!, resultIndex: 1, amount: 200 },
    ]);
    multi.start(multiPrepared);
    multi.update(0.1);
    expect(multi.getSnapshot().resultIndex).toBe(1);
  });

  it("rejects malformed compiler-produced groups", () => {
    const carousel = createCarousel();
    expect(carousel.update(0)).toEqual({ firstCycleComplete: false });
    carousel.clear();
    const valid = {
      componentName: "line-win",
      stepIndex: 0,
      resultIndex: 0,
      result: result([0, 0], 100),
      positions: [{ x: 0, y: 0 }],
      amount: 100,
    };
    const invalidGroups: readonly unknown[] = [
      null,
      [{ ...valid, stepIndex: 0.5 }],
      [{ ...valid, stepIndex: -1 }],
      [{ ...valid, resultIndex: 0.5 }],
      [{ ...valid, resultIndex: -1 }],
      [{ ...valid, componentName: null }],
      [{ ...valid, componentName: " " }],
      [{ ...valid, amount: Number.NaN }],
      [{ ...valid, amount: 0 }],
      [{ ...valid, positions: null }],
      [{ ...valid, positions: [] }],
      [{ ...valid, positions: [{ x: 0.5, y: 0 }] }],
      [{ ...valid, positions: [{ x: -1, y: 0 }] }],
      [{ ...valid, positions: [{ x: 0, y: -1 }] }],
      [{ ...valid, positions: [{ x: 0, y: 0.5 }] }],
    ];

    for (const groups of invalidGroups) {
      expect(() => carousel.prepareGroups(groups as never)).toThrow();
    }
  });

  it("prepares components and results in caller and usedResults order", () => {
    const carousel = createCarousel();
    const logic = createLogic({
      results: [result([0, 0], 100), result([1, 1], 200)],
      components: {
        "line-win": component([1, 0]),
        "scatter-win": component([0]),
      },
    });
    const prepared = carousel.prepare({
      logic,
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win", "scatter-win"],
    });

    expect(
      prepared.groups.map((group) => [group.componentName, group.resultIndex]),
    ).toEqual([
      ["line-win", 1],
      ["line-win", 0],
      ["scatter-win", 0],
    ]);
    expect(Object.isFrozen(prepared.groups)).toBe(true);
  });

  it("skips untriggered components and does not fall back to all results", () => {
    const carousel = createCarousel();
    const logic = createLogic({
      results: [result([0, 0], 100)],
      components: {},
    });
    const prepared = carousel.prepare({
      logic,
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win"],
    });

    expect(prepared.groupCount).toBe(0);
    expect(carousel.start(prepared)).toEqual({ started: false });
    expect(carousel.getSnapshot().phase).toBe("idle");
  });

  it("keeps duplicate result references component-scoped and skips only absent names", () => {
    const carousel = createCarousel();
    const prepared = carousel.prepare({
      logic: createLogic({
        results: [result([0, 0], 100)],
        components: {
          "scatter-win": component([0]),
          "bonus-win": component([0]),
        },
      }),
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win", "scatter-win", "bonus-win"],
    });

    expect(
      prepared.groups.map(({ componentName, resultIndex }) => ({
        componentName,
        resultIndex,
      })),
    ).toEqual([
      { componentName: "scatter-win", resultIndex: 0 },
      { componentName: "bonus-win", resultIndex: 0 },
    ]);
  });

  it("plays all cells together, anchors on the nearest real cell, and lingers", () => {
    const target = new FakeTarget();
    const carousel = createCarousel(target);
    const positions = [0, 2, 0, 3, 1, 3, 1, 4, 2, 3, 2, 2, 3, 2, 3, 3];
    const prepared = carousel.prepare({
      logic: createLogic({
        results: [result(positions, 300)],
        components: { "line-win": component([0]) },
      }),
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win"],
    });

    expect(carousel.start(prepared)).toEqual({ started: true });
    expect(target.requests[0]).toMatchObject({ state: "win" });
    expect(target.requests[0]?.positions).toHaveLength(8);
    expect(carousel.getSnapshot()).toMatchObject({
      phase: "playing",
      componentName: "line-win",
      resultIndex: 0,
      amountText: "$3.00",
      amountPosition: { x: 180, y: 446.4 },
    });

    expect(carousel.update(0.5).firstCycleComplete).toBe(true);
    expect(carousel.getSnapshot()).toMatchObject({
      phase: "cycle-pause",
      amountVisible: false,
    });
    carousel.update(0.5);
    expect(carousel.getSnapshot().phase).toBe("cycle-pause");
    carousel.update(0.5);
    expect(carousel.getSnapshot().phase).toBe("playing");
  });

  it("uses x then y as a stable anchor tie-break and clears the current group", () => {
    const target = new FakeTarget();
    const carousel = createCarousel(target);
    const prepared = carousel.prepare({
      logic: createLogic({
        results: [result([1, 1, 0, 0], 100)],
        components: { "line-win": component([0]) },
      }),
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win"],
    });
    carousel.start(prepared);
    expect(carousel.getSnapshot().amountPosition?.x).toBe(60);

    carousel.clear();
    expect(target.requests.at(-1)).toMatchObject({ state: "normal" });
    expect(carousel.getSnapshot()).toMatchObject({
      phase: "idle",
      amountVisible: false,
      firstCycleComplete: false,
    });

    const vertical = createCarousel();
    const verticalPrepared = vertical.prepare({
      logic: createLogic({
        results: [result([0, 0, 0, 2], 100)],
        components: { "line-win": component([0]) },
      }),
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win"],
    });
    vertical.start(verticalPrepared);
    expect(vertical.getSnapshot().amountPosition?.y).toBe(86.4);
  });

  it("fails fast for invalid configuration, data, callback output, and ownership", () => {
    const carousel = createCarousel();
    const validAmountText = {
      yOffsetRatioFromCellCenter: 0.22,
      fontSize: 38,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 5,
    };
    for (const invalid of [
      { cyclePauseSeconds: Number.NaN, amountText: validAmountText },
      { cyclePauseSeconds: 0, amountText: validAmountText },
      {
        cyclePauseSeconds: 1,
        amountText: { ...validAmountText, strokeWidth: Number.NaN },
      },
      {
        cyclePauseSeconds: 1,
        amountText: { ...validAmountText, strokeWidth: -1 },
      },
      {
        cyclePauseSeconds: 1,
        amountText: { ...validAmountText, fontSize: Number.NaN },
      },
      {
        cyclePauseSeconds: 1,
        amountText: { ...validAmountText, fontSize: 0 },
      },
      {
        cyclePauseSeconds: 1,
        amountText: {
          ...validAmountText,
          yOffsetRatioFromCellCenter: Number.POSITIVE_INFINITY,
        },
      },
      {
        cyclePauseSeconds: 1,
        amountText: { ...validAmountText, fill: null },
      },
      {
        cyclePauseSeconds: 1,
        amountText: { ...validAmountText, fill: " " },
      },
      {
        cyclePauseSeconds: 1,
        amountText: { ...validAmountText, stroke: null },
      },
      {
        cyclePauseSeconds: 1,
        amountText: { ...validAmountText, stroke: " " },
      },
    ]) {
      expect(() =>
        createSymbolWinCarousel({
          target: new FakeTarget(),
          resolveAmount: () => 1,
          formatAmount: String,
          ...invalid,
        } as never),
      ).toThrow();
    }
    const logic = createLogic({
      results: [result([0, 0], 100)],
      components: { "line-win": component([0]) },
    });
    for (const names of [[], [""], ["line-win", "line-win"]]) {
      expect(() =>
        carousel.prepare({
          logic,
          stepIndex: 0,
          scene: SCENE,
          componentNames: names,
        }),
      ).toThrow();
    }
    const zeroAmount = createCarousel(new FakeTarget(), () => 0);
    expect(() =>
      zeroAmount.prepare({
        logic,
        stepIndex: 0,
        scene: SCENE,
        componentNames: ["line-win"],
      }),
    ).toThrow(/positive/);
    const other = createCarousel();
    expect(() =>
      other.start(
        carousel.prepare({
          logic,
          stepIndex: 0,
          scene: SCENE,
          componentNames: ["line-win"],
        }),
      ),
    ).toThrow(/owned/);
    carousel.destroy();
    carousel.destroy();
    expect(() => carousel.clear()).toThrow(/destroyed/);
  });

  it("rejects malformed component, positions, geometry, formatter, state count, and delta", () => {
    const invalidComponent = {
      ...component([0]),
      hasBasicComponentData: false,
    };
    const invalidLogic = createLogic({
      results: [result([0, 0], 100)],
      components: { "line-win": invalidComponent },
    });
    expect(() =>
      createCarousel().prepare({
        logic: invalidLogic,
        stepIndex: 0,
        scene: SCENE,
        componentNames: ["line-win"],
      }),
    ).toThrow(/basicComponentData/);

    for (const pos of [[], [0], [-1, 0], [0, 0, 0, 0], [9, 0]]) {
      expect(() =>
        createCarousel().prepare({
          logic: createLogic({
            results: [result(pos, 100)],
            components: { "line-win": component([0]) },
          }),
          stepIndex: 0,
          scene: SCENE,
          componentNames: ["line-win"],
        }),
      ).toThrow();
    }

    const geometryTarget = new FakeTarget();
    geometryTarget.geometryCountOffset = -1;
    const geometryCarousel = createCarousel(geometryTarget);
    const prepared = geometryCarousel.prepare({
      logic: createLogic({
        results: [result([0, 0], 100)],
        components: { "line-win": component([0]) },
      }),
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win"],
    });
    expect(() => geometryCarousel.start(prepared)).toThrow(/geometry count/);

    const badFormatter = createSymbolWinCarousel({
      target: new FakeTarget(),
      resolveAmount: ({ result: winResult }) => winResult.cashWin as number,
      formatAmount: () => "",
      cyclePauseSeconds: 1,
      amountText: {
        yOffsetRatioFromCellCenter: 0,
        fontSize: 1,
        fill: "#fff",
        stroke: "#000",
        strokeWidth: 0,
      },
    });
    const badPrepared = badFormatter.prepare({
      logic: createLogic({
        results: [result([0, 0], 100)],
        components: { "line-win": component([0]) },
      }),
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win"],
    });
    expect(() => badFormatter.start(badPrepared)).toThrow(/formatter/);
    const stateTarget = new FakeTarget();
    stateTarget.stateCountOffset = -1;
    const stateCarousel = createCarousel(stateTarget);
    const statePrepared = stateCarousel.prepare({
      logic: createLogic({
        results: [result([0, 0], 100)],
        components: { "line-win": component([0]) },
      }),
      stepIndex: 0,
      scene: SCENE,
      componentNames: ["line-win"],
    });
    stateCarousel.start(statePrepared);
    expect(() => stateCarousel.update(0.1)).toThrow(/state count/);
    expect(() => createCarousel().update(-1)).toThrow(/deltaSeconds/);
  });
});

class FakeTarget implements VisibleSymbolPresentationTarget {
  readonly requests: Array<{
    readonly positions: readonly { readonly x: number; readonly y: number }[];
    readonly state: string;
  }> = [];
  readonly states = new Map<string, string>();
  geometryCountOffset = 0;
  stateCountOffset = 0;

  requestVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: any,
  ): void {
    this.requests.push({ positions, state });
    for (const position of positions) this.states.set(key(position), state);
  }
  getVisibleSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): any[] {
    return positions
      .slice(0, positions.length + this.stateCountOffset)
      .map((position) => ({
        x: position.x,
        y: position.y,
        code: 1,
        kind: "textured",
        requestedState: this.states.get(key(position)) ?? "normal",
        resolvedState: this.states.get(key(position)) ?? "normal",
        isOnce: false,
      }));
  }
  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): any[] {
    return positions
      .slice(0, positions.length + this.geometryCountOffset)
      .map((position) => ({
        x: position.x,
        y: position.y,
        code: 1,
        kind: "textured",
        centerX: position.x * 120 + 60,
        centerY: position.y * 120 + 60,
        cellWidth: 120,
        cellHeight: 120,
      }));
  }
  update(): void {
    for (const coordinate of this.states.keys())
      this.states.set(coordinate, "normal");
  }
}

function createCarousel(
  target: VisibleSymbolPresentationTarget = new FakeTarget(),
  resolveAmount: (context: any) => number = ({ result: winResult }) =>
    winResult.cashWin,
) {
  return createSymbolWinCarousel({
    target,
    resolveAmount,
    formatAmount: (amount) => `$${(amount / 100).toFixed(2)}`,
    cyclePauseSeconds: 1,
    amountText: {
      yOffsetRatioFromCellCenter: 0.22,
      fontSize: 38,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 5,
    },
  });
}

function result(pos: readonly number[], cashWin: number): WinResult {
  return Object.freeze({ pos: Object.freeze([...pos]), cashWin });
}

function component(usedResults: readonly number[]): LogicComponent {
  const basicComponentData = Object.freeze({
    usedScenes: Object.freeze([]),
    usedOtherScenes: Object.freeze([]),
    usedResults: Object.freeze([...usedResults]),
  });
  return Object.freeze({
    name: "component",
    raw: Object.freeze({ basicComponentData }),
    hasBasicComponentData: true,
    basicComponentData,
    usedSceneIndexes: Object.freeze([]),
    usedOtherSceneIndexes: Object.freeze([]),
    usedResultIndexes: basicComponentData.usedResults,
  });
}

function createLogic(options: {
  readonly results: readonly WinResult[];
  readonly components: Readonly<Record<string, LogicComponent>>;
}): GameLogic {
  const step = {
    getIndex: () => 0,
    getResult: (index: number) => {
      const winResult = options.results[index];
      if (!winResult) throw new Error(`result ${index} is out of bounds`);
      return winResult;
    },
    hasComponent: (name: string) => options.components[name] !== undefined,
    getComponent: (name: string) => options.components[name],
  } as GameLogicStep;
  return {
    getStep: (index: number) => {
      if (index !== 0) throw new Error(`step ${index} is out of bounds`);
      return step;
    },
  } as GameLogic;
}

function key(position: { readonly x: number; readonly y: number }): string {
  return `${position.x},${position.y}`;
}
