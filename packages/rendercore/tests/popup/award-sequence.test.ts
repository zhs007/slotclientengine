import { describe, expect, it } from "vitest";
import {
  compareThreshold,
  createAwardCountStages,
} from "../../src/popup/index.js";
import { popupFixture } from "./fixtures.js";

describe("award celebration sequence", () => {
  it.each([
    [0, []],
    [50, ["base"]],
    [100, ["base"]],
    [101, ["base", "standard"]],
    [1499, ["base", "standard"]],
    [1500, ["base", "standard", "bigwin"]],
    [3000, ["base", "standard", "bigwin", "superwin"]],
    [5000, ["base", "standard", "bigwin", "superwin", "megawin"]],
    [9000, ["base", "standard", "bigwin", "superwin", "megawin"]],
  ] as const)("maps win=%s to exact reached tiers", (win, ids) => {
    expect(
      createAwardCountStages(popupFixture(), {
        betAmountRaw: 100,
        winAmountRaw: win,
      }).map((stage) => stage.tierId),
    ).toEqual(ids);
  });
  it("compares thresholds without floating point multiplication", () => {
    expect(
      compareThreshold(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1),
    ).toBe(0);
    expect(
      compareThreshold(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 2),
    ).toBe(-1);
  });

  it("rejects invalid business input and unsafe reached thresholds", () => {
    expect(() =>
      createAwardCountStages(popupFixture(), {
        betAmountRaw: 0,
        winAmountRaw: 1,
      }),
    ).toThrow(/betAmountRaw/);
    expect(() =>
      createAwardCountStages(popupFixture(), {
        betAmountRaw: 1,
        winAmountRaw: -1,
      }),
    ).toThrow(/winAmountRaw/);
    expect(() =>
      createAwardCountStages(popupFixture(), {
        betAmountRaw: Number.MAX_SAFE_INTEGER - 1,
        winAmountRaw: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(/threshold exceeds/);
  });
});
