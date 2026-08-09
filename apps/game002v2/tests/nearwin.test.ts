import { describe, expect, it, vi } from "vitest";
import {
  createNearwinLandingState,
  Game002v2NearwinController,
} from "../src/nearwin.js";

describe("game002v2 nearwin", () => {
  const order = [
    { x: 0, y: 0, orderIndex: 0, startGroupIndex: 0 },
    { x: 0, y: 1, orderIndex: 1, startGroupIndex: 1 },
    { x: 0, y: 2, orderIndex: 2, startGroupIndex: 2 },
    { x: 1, y: 0, orderIndex: 3, startGroupIndex: 3 },
    { x: 1, y: 1, orderIndex: 4, startGroupIndex: 4 },
    { x: 1, y: 2, orderIndex: 5, startGroupIndex: 5 },
  ];

  it("uses the second WL in the real landing order as its gate", () => {
    const state = createNearwinLandingState(
      [
        [7, 1, 7],
        [2, 7, 7],
      ],
      7,
      order,
    );
    expect(state?.activationGate).toEqual({ x: 0, y: 2 });
    expect(state?.wildPositions).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 2 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it("activates with exactly two WL and stays inactive with one", () => {
    expect(
      createNearwinLandingState(
        [
          [7, 1, 1],
          [2, 7, 2],
        ],
        7,
        order,
      )?.activationGate,
    ).toEqual({ x: 1, y: 1 });
    expect(
      createNearwinLandingState(
        [
          [7, 1, 1],
          [2, 1, 2],
        ],
        7,
        order,
      ),
    ).toBeNull();
  });

  it("requests landed and later WL at the activation edge, then restores them", () => {
    const state = createNearwinLandingState(
      [
        [7, 1, 7],
        [2, 1, 7],
      ],
      7,
      order,
    )!;
    const request = vi.fn();
    const controller = new Game002v2NearwinController(state, {
      hasMainReelSymbolStateCapability: () => true,
      requestMainReelSymbolStates: request,
    });
    controller.update([{ x: 0, y: 0 }], []);
    controller.update([{ x: 0, y: 2 }], [{ x: 0, y: 2 }]);
    controller.update([{ x: 1, y: 2 }], []);
    controller.finish();

    expect(request.mock.calls).toEqual([
      [
        [
          { x: 0, y: 0 },
          { x: 0, y: 2 },
        ],
        "Reel_NearWin",
        "immediate",
      ],
      [[{ x: 1, y: 2 }], "Reel_NearWin", "immediate"],
      [
        [
          { x: 0, y: 0 },
          { x: 0, y: 2 },
          { x: 1, y: 2 },
        ],
        "normal",
        "immediate",
      ],
    ]);
  });
});
