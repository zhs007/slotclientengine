import { describe, expect, it } from "vitest";
import {
  DEFAULT_REELS_VIEWER_CONFIG,
  REELS_VIEWER_REQUIRED_STATE_TEXTURES,
  REELS_VIEWER_SYMBOL_SCALES
} from "../src/reels-config.js";

describe("reelsviewer config", () => {
  it("keeps demo-specific choices outside rendercore", () => {
    expect(DEFAULT_REELS_VIEWER_CONFIG).toMatchObject({
      reelsName: "reels01",
      visibleRows: 5,
      emptySymbols: ["BN"],
      symbolScales: {
        SC: 1.5,
        RS: 1.5,
        X2: 1.5,
        X5: 1.5,
        X10: 1.5
      },
      minimumSpinCycles: 10,
      baseDurationMs: 1600,
      speedSymbolsPerSecond: 42,
      startDelayMs: 90,
      stopDelayMs: 180
    });
    expect(REELS_VIEWER_REQUIRED_STATE_TEXTURES).toEqual(["spinBlur"]);
    expect(REELS_VIEWER_SYMBOL_SCALES).toEqual({
      SC: 1.5,
      RS: 1.5,
      X2: 1.5,
      X5: 1.5,
      X10: 1.5
    });
  });
});
