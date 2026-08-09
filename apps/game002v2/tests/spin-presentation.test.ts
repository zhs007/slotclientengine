import type {
  GridCellReelSpinPlan,
  SceneLayoutGridCellSpinPlanStage,
} from "@slotclientengine/rendercore";
import { describe, expect, it, vi } from "vitest";
import { buildGame002v2InitialSpinPlan } from "../src/spin-presentation.js";

describe("game002v2 spin presentation", () => {
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
});
