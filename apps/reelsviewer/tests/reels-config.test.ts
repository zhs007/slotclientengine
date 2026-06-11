import { describe, expect, it } from "vitest";
import {
  DEFAULT_REELS_VIEWER_CONFIG,
  REELS_VIEWER_REQUIRED_STATE_TEXTURES
} from "../src/reels-config.js";

describe("reelsviewer config", () => {
  it("keeps demo-specific choices outside rendercore", () => {
    expect(DEFAULT_REELS_VIEWER_CONFIG).toMatchObject({
      reelsName: "reels01",
      visibleRows: 5,
      emptySymbols: ["BN"],
      minimumSpinCycles: 10,
      baseDurationMs: 1600,
      speedSymbolsPerSecond: 42,
      startDelayMs: 90,
      stopDelayMs: 180
    });
    expect(REELS_VIEWER_REQUIRED_STATE_TEXTURES).toEqual(["spinBlur"]);
  });
});
