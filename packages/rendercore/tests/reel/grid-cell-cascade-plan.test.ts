import { describe, expect, it } from "vitest";
import {
  createGridCellCascadeDropPlan,
  createGridCellCascadeDropdownPlan,
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
  it("adds renderer timing to trusted movement and value facts", () => {
    const plan = createGridCellCascadeDropPlan({
      columns: 2,
      rows: 4,
      movements: [
        {
          kind: "existing",
          source: { x: 0, y: 0 },
          target: { x: 0, y: 3 },
        },
        {
          kind: "refill",
          source: { x: 0, y: -1 },
          target: { x: 0, y: 1 },
          outputCode: 5,
          outputValue: 25,
        },
        {
          kind: "existing",
          source: { x: 1, y: 0 },
          target: { x: 1, y: 2 },
        },
      ],
      valueCommits: [
        { position: { x: 0, y: 1 }, value: 25 },
        { position: { x: 0, y: 3 }, value: 50 },
      ],
      cellHeight: 100,
      motion,
    });

    expect(plan.movements).toMatchObject([
      {
        kind: "existing",
        x: 0,
        sourceY: 0,
        targetY: 3,
        startSeconds: 0,
        fallSeconds: 0.25,
        overshootPixels: 10,
      },
      {
        kind: "refill",
        x: 0,
        sourceY: -1,
        targetY: 1,
        startSeconds: 0.02,
        outputCode: 5,
        outputPresentationValue: 25,
      },
      {
        kind: "existing",
        x: 1,
        sourceY: 0,
        targetY: 2,
        startSeconds: 0.1,
      },
    ]);
    expect(plan.valueCommits).toEqual([
      { x: 0, y: 1, presentationValue: 25 },
      { x: 0, y: 3, presentationValue: 50 },
    ]);
    expect(plan.totalSeconds).toBeCloseTo(0.34);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("keeps logical facts opaque and validates renderer-owned motion", () => {
    const options = {
      columns: 1,
      rows: 2,
      movements: [
        {
          kind: "existing" as const,
          source: { x: 0, y: 0 },
          target: { x: 0, y: 1 },
        },
      ],
      valueCommits: [{ position: { x: 0, y: 1 }, value: null }],
      cellHeight: 100,
      motion,
    };
    expect(createGridCellCascadeDropdownPlan(options).movements).toHaveLength(
      1,
    );
    expect(() =>
      createGridCellCascadeDropPlan({
        ...options,
        motion: { ...motion, settleSeconds: 0 },
      }),
    ).toThrow(/settleSeconds/);
  });
});
