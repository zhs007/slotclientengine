import { describe, expect, it } from "vitest";
import { createNearwinLandingState } from "../src/nearwin.js";

describe("game002v2 nearwin", () => {
  it("keeps the decision in the app but drives the Symbols state", () => {
    const state = createNearwinLandingState(
      [
        [7, 1, 7],
        [2, 7, 7],
      ],
      7,
    );
    expect(state?.positions).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]);
    expect(state?.matrix).toEqual([
      ["normal", "normal", "normal"],
      ["normal", "Reel_NearWin", "Reel_NearWin"],
    ]);
  });

  it("does not create a nearwin program before the third WL", () => {
    expect(createNearwinLandingState([[7, 1, 7]], 7)).toBeNull();
  });
});
