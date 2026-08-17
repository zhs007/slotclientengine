import type { GridCellReelSpinPlan } from "@slotclientengine/rendercore";
import type { SceneLayoutGridCellSpinPlanStage } from "@slotclientengine/rendercore/scene-layout/core";
import { describe, expect, it, vi } from "vitest";
import {
  buildGame002v2FreeGameSpinPlan,
  buildGame002v2InitialSpinPlan,
  createGame002v2ContinuousSpinInput,
} from "../src/spin-presentation.js";

describe("game002v2 spin presentation", () => {
  it("selects only non-WL/CN input occurrences for FreeGame spin", () => {
    const createPlan = vi.fn((options) => options as GridCellReelSpinPlan);
    const stage = {
      targetScene: [
        [7, 4, 3],
        [2, 7, 5],
      ],
      order: [
        { x: 0, y: 0, orderIndex: 0 },
        { x: 0, y: 1, orderIndex: 1 },
        { x: 0, y: 2, orderIndex: 2 },
        { x: 1, y: 0, orderIndex: 3 },
        { x: 1, y: 1, orderIndex: 4 },
        { x: 1, y: 2, orderIndex: 5 },
      ],
      createPlan,
    } as unknown as SceneLayoutGridCellSpinPlanStage;

    buildGame002v2FreeGameSpinPlan(
      stage,
      [
        [7, 1, 3],
        [2, 7, 6],
      ],
      { wild: 7, coin: 3, normalBright: new Set() },
    );

    expect(createPlan).toHaveBeenCalledWith({
      positions: [
        { x: 0, y: 1, orderIndex: 1 },
        { x: 1, y: 0, orderIndex: 3 },
        { x: 1, y: 2, orderIndex: 5 },
      ],
    });
  });

  it("keeps special symbols bright before Nearwin and only WL bright after it", () => {
    const createPlan = vi.fn((options) => options as GridCellReelSpinPlan);
    const stage = {
      targetScene: [
        [1, 7, 3],
        [8, 2, 7],
      ],
      order: [
        { x: 0, y: 0, orderIndex: 0, startGroupIndex: 0 },
        { x: 0, y: 1, orderIndex: 1, startGroupIndex: 1 },
        { x: 0, y: 2, orderIndex: 2, startGroupIndex: 2 },
        { x: 1, y: 0, orderIndex: 3, startGroupIndex: 3 },
        { x: 1, y: 1, orderIndex: 4, startGroupIndex: 4 },
        { x: 1, y: 2, orderIndex: 5, startGroupIndex: 5 },
      ],
      createPlan,
    } as unknown as SceneLayoutGridCellSpinPlanStage;
    const result = buildGame002v2InitialSpinPlan(stage, {
      wild: 7,
      coin: 3,
      normalBright: new Set([3, 7, 8, 9, 10]),
    });
    const options = createPlan.mock.calls[0]![0]!;
    const dim = options.dimming!.resolveDimmingAlpha;

    expect(result.nearwin?.activationGate).toEqual({ x: 1, y: 2 });
    expect(options.activation).toMatchObject({
      activationGate: { x: 1, y: 2 },
    });
    expect(dim(3, false)).toBe(0);
    expect(dim(8, false)).toBe(0);
    expect(dim(1, false)).toBe(0.5);
    expect(dim(7, true)).toBe(0);
    expect(dim(3, true)).toBe(0.5);
    expect(dim(8, true)).toBe(0.5);
  });

  it("pre-rolls the full base board but holds WL/CN for a first FreeGame spin", () => {
    const presentation = {
      manifest: { spin: { dimmingAlpha: 0.5 } },
    } as Parameters<typeof createGame002v2ContinuousSpinInput>[2];
    const codes = {
      wild: 7,
      coin: 3,
      normalBright: new Set([3, 7, 8]),
    };
    const scene = [
      [7, 1, 3],
      [2, 7, 6],
    ];

    const base = createGame002v2ContinuousSpinInput(
      scene,
      codes,
      presentation,
      false,
    );
    const freeGame = createGame002v2ContinuousSpinInput(
      scene,
      codes,
      presentation,
      true,
    );

    expect(base).not.toHaveProperty("positions");
    expect(freeGame.positions).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 1, y: 2 },
    ]);
    expect(freeGame.dimming.resolveDimmingAlpha(7, false)).toBe(0);
    expect(freeGame.dimming.resolveDimmingAlpha(1, false)).toBe(0.5);
  });
});
