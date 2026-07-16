import { describe, expect, it } from "vitest";
import {
  createGridCellCascadeDropPlan,
  deriveGridCellCascadeSettledValues,
} from "../../src/reel/index.js";

const motion = Object.freeze({
  columnStartStaggerSeconds: 0.1,
  baseFallSeconds: 0.1,
  perRowFallSeconds: 0.05,
  maxFallSeconds: 0.5,
  startStaggerSeconds: 0.02,
  settleSeconds: 0.04,
  overshootCellRatio: 0.1,
});

describe("grid cell cascade plan", () => {
  it("derives carried values when an unchanged auxiliary otherScene is omitted", () => {
    expect(
      deriveGridCellCascadeSettledValues({
        sourceScene: [
          [8, -1, 0, -1],
          [2, -1, -1, 3],
        ],
        sourceValues: [
          [25, -1, null, -1],
          [null, -1, -1, null],
        ],
        settledScene: [
          [-1, -1, 0, 8],
          [-1, -1, 2, 3],
        ],
        canDropOccurrence: ({ code }) => code !== 0,
      }),
    ).toEqual([
      [-1, -1, null, 25],
      [-1, -1, null, null],
    ]);
  });

  it("rejects invalid inferred occurrence movement", () => {
    expect(() =>
      deriveGridCellCascadeSettledValues({
        sourceScene: [[8, -1]],
        sourceValues: [[25, -1]],
        settledScene: [[7, -1]],
      }),
    ).toThrow(/code changed/);
    expect(() =>
      deriveGridCellCascadeSettledValues({
        sourceScene: [[0, -1]],
        sourceValues: [[null, -1]],
        settledScene: [[-1, 0]],
        canDropOccurrence: () => false,
      }),
    ).toThrow(/fixed occurrence changed/);
  });

  it("combines existing and refill falls, keeps fixed symbols in place and staggers columns", () => {
    const plan = createGridCellCascadeDropPlan({
      sourceScene: [
        [1, -1, 0, -1],
        [2, -1, -1, 3],
      ],
      sourceValues: [
        [25, -1, null, -1],
        [null, -1, -1, null],
      ],
      settledScene: [
        [-1, -1, 0, 1],
        [-1, -1, 2, 3],
      ],
      settledValues: [
        [-1, -1, null, 25],
        [-1, -1, null, null],
      ],
      targetScene: [
        [4, 5, 0, 1],
        [6, 7, 2, 3],
      ],
      targetValues: [
        [null, null, null, 25],
        [null, null, null, null],
      ],
      refillPositions: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      canDropOccurrence: ({ code }) => code !== 0,
      cellHeight: 100,
      motion,
    });

    expect(
      plan.movements.map(
        ({ kind, x, sourceY, targetY, code, presentationValue }) => ({
          kind,
          x,
          sourceY,
          targetY,
          code,
          presentationValue,
        }),
      ),
    ).toEqual([
      {
        kind: "existing",
        x: 0,
        sourceY: 0,
        targetY: 3,
        code: 1,
        presentationValue: 25,
      },
      {
        kind: "refill",
        x: 0,
        sourceY: -1,
        targetY: 1,
        code: 5,
        presentationValue: null,
      },
      {
        kind: "refill",
        x: 0,
        sourceY: -2,
        targetY: 0,
        code: 4,
        presentationValue: null,
      },
      {
        kind: "existing",
        x: 1,
        sourceY: 0,
        targetY: 2,
        code: 2,
        presentationValue: null,
      },
      {
        kind: "refill",
        x: 1,
        sourceY: -1,
        targetY: 1,
        code: 7,
        presentationValue: null,
      },
      {
        kind: "refill",
        x: 1,
        sourceY: -2,
        targetY: 0,
        code: 6,
        presentationValue: null,
      },
    ]);
    expect(plan.movements[0].startSeconds).toBe(0);
    expect(plan.movements[0].fallSeconds).toBeCloseTo(0.25);
    expect(plan.movements[0].settleSeconds).toBe(0.04);
    expect(plan.movements[0].overshootPixels).toBe(10);
    expect(plan.movements[1].startSeconds).toBe(0.02);
    expect(plan.movements[3].startSeconds).toBe(0.1);
    expect(plan.totalSeconds).toBeCloseTo(0.38);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it.each([
    {
      label: "occurrence count drift",
      sourceScene: [[-1, 1, 2]],
      sourceValues: [[-1, null, null]],
      targetScene: [[-1, 1]],
      targetValues: [[-1, null]],
    },
    {
      label: "code order drift",
      sourceScene: [[1, 2, -1]],
      sourceValues: [[null, null, -1]],
      targetScene: [[2, 1, -1]],
      targetValues: [[null, null, -1]],
    },
    {
      label: "value drift",
      sourceScene: [[8, -1]],
      sourceValues: [[25, -1]],
      targetScene: [[-1, 8]],
      targetValues: [[-1, 50]],
    },
    {
      label: "upward move",
      sourceScene: [[-1, 1]],
      sourceValues: [[-1, null]],
      targetScene: [[1, -1]],
      targetValues: [[null, -1]],
    },
  ])(
    "rejects $label",
    ({ sourceScene, sourceValues, targetScene, targetValues }) => {
      expect(() =>
        createGridCellCascadeDropPlan({
          sourceScene,
          sourceValues,
          settledScene: targetScene,
          settledValues: targetValues,
          targetScene,
          targetValues,
          refillPositions: [],
          cellHeight: 100,
          motion,
        }),
      ).toThrow();
    },
  );

  it("strictly validates fixed occurrences and the refill closure", () => {
    const base = {
      sourceScene: [[1, -1]],
      sourceValues: [[null, -1]],
      settledScene: [[-1, 1]],
      settledValues: [[-1, null]],
      targetScene: [[2, 1]],
      targetValues: [[null, null]],
      refillPositions: [{ x: 0, y: 0 }],
      cellHeight: 100,
      motion,
    } as const;
    expect(createGridCellCascadeDropPlan(base).movements).toHaveLength(2);
    expect(() =>
      createGridCellCascadeDropPlan({
        ...base,
        canDropOccurrence: () => false,
      }),
    ).toThrow(/fixed occurrence changed/);
    expect(() =>
      createGridCellCascadeDropPlan({ ...base, refillPositions: [] }),
    ).toThrow(/match settledScene holes exactly/);
    expect(() =>
      createGridCellCascadeDropPlan({
        ...base,
        targetScene: [[2, 3]],
      }),
    ).toThrow(/changed carried occurrence/);
    expect(() =>
      createGridCellCascadeDropPlan({
        ...base,
        refillPositions: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      }),
    ).toThrow(/duplicate/);
  });
});
