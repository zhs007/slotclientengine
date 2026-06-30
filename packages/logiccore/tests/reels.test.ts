import { describe, expect, it } from "vitest";
import { LogicParseError, LogicReelsModel } from "../src";

describe("LogicReelsModel", () => {
  it("reads reel symbols with integer y normalization", () => {
    const reels = new LogicReelsModel("test", [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);
    const length = reels.getLength(0);

    expect(reels.get(0, 0)).toBe(0);
    expect(reels.get(0, length)).toBe(0);
    expect(reels.get(0, length + 1)).toBe(1);
    expect(reels.get(0, -1)).toBe(9);
    expect(reels.get(0, -length - 1)).toBe(9);
  });

  it("rejects invalid reel indexes and non-integer get y values", () => {
    const reels = new LogicReelsModel("test", [[0, 1, 2]]);

    expect(() => reels.get(-1, 0)).toThrow(RangeError);
    expect(() => reels.get(1, 0)).toThrow(RangeError);
    expect(() => reels.getLength(1)).toThrow(RangeError);
    expect(() => reels.get(0, 1.5)).toThrow(RangeError);
  });

  it("normalizes finite display y values without rounding", () => {
    const reels = new LogicReelsModel("test", [[0, 1, 2, 3, 4]]);

    expect(reels.normalizeY(0, 5.5)).toBe(0.5);
    expect(reels.normalizeY(0, -1.25)).toBe(3.75);
    expect(() => reels.normalizeY(0, Number.POSITIVE_INFINITY)).toThrow(
      LogicParseError,
    );
  });

  it("finds all stop y candidates and returns the first candidate", () => {
    const reels = new LogicReelsModel("repeat", [[1, 2, 1, 2]]);

    expect(reels.findStopYCandidates(0, [1, 2])).toEqual([0, 2]);
    expect(reels.getStopY(0, [1, 2])).toBe(0);
  });

  it("fails clearly when no stop y candidate exists", () => {
    const reels = new LogicReelsModel("repeat", [[1, 2, 1, 2]]);

    expect(() => reels.getStopY(0, [2, 2])).toThrow(LogicParseError);
    expect(() => reels.findStopYCandidates(0, [])).toThrow(LogicParseError);
  });

  it("calculates forward and backward spin start y values", () => {
    const reels = new LogicReelsModel("test", [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);

    expect(
      reels.calculateSpinStartY({
        x: 0,
        finalY: 3,
        speedSymbolsPerSecond: 8,
        durationMs: 250,
      }),
    ).toBe(1);

    expect(
      reels.calculateSpinStartY({
        x: 0,
        finalY: 3,
        speedSymbolsPerSecond: 8,
        durationMs: 250,
        direction: "backward",
      }),
    ).toBe(5);
  });

  it("normalizes long and fractional spin travel without rounding", () => {
    const reels = new LogicReelsModel("test", [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);

    expect(
      reels.calculateSpinStartY({
        x: 0,
        finalY: 1,
        speedSymbolsPerSecond: 15,
        durationMs: 1000,
      }),
    ).toBe(6);

    expect(
      reels.calculateSpinStartY({
        x: 0,
        finalY: 3,
        speedSymbolsPerSecond: 1,
        durationMs: 500,
      }),
    ).toBe(2.5);
  });

  it("rejects invalid spin inputs", () => {
    const reels = new LogicReelsModel("test", [[0, 1, 2]]);

    expect(() =>
      reels.calculateSpinStartY({
        x: 0,
        finalY: Number.NaN,
        speedSymbolsPerSecond: 1,
        durationMs: 100,
      }),
    ).toThrow(LogicParseError);
    expect(() =>
      reels.calculateSpinStartY({
        x: 0,
        finalY: 1,
        speedSymbolsPerSecond: -1,
        durationMs: 100,
      }),
    ).toThrow(LogicParseError);
    expect(() =>
      reels.calculateSpinStartY({
        x: 0,
        finalY: 1,
        speedSymbolsPerSecond: 1,
        durationMs: -100,
      }),
    ).toThrow(LogicParseError);
    expect(() =>
      reels.calculateSpinStartY({
        x: 0,
        finalY: 1,
        speedSymbolsPerSecond: 1,
        durationMs: 100,
        direction: "sideways" as never,
      }),
    ).toThrow(LogicParseError);
  });
});
