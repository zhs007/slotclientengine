import { describe, expect, it } from "vitest";
import {
  createGame002v2PresentationValues,
  sameGame002v2PresentationValues,
} from "../src/round-values.js";

describe("game002v2 round presentation values", () => {
  it("carries same-code values, leaves refill cells empty and applies explicit updates", () => {
    const values = createGame002v2PresentationValues({
      scene: [[7, 3, 8]],
      fallback: {
        scene: [[7, -1, 8]],
        values: [[2, -1, 5]],
      },
      overlays: [
        {
          code: 7,
          values: [[4, 0, 0]],
        },
        {
          code: 3,
          values: [[0, 50, 0]],
        },
      ],
    });

    expect(values).toEqual([[4, 50, 5]]);
    expect(sameGame002v2PresentationValues([[4, 50, 5]], values)).toBe(true);
    expect(sameGame002v2PresentationValues([[2, 50, 5]], values)).toBe(false);
  });
});
