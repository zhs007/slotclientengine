import { describe, expect, it } from "vitest";
import {
  GAME002_SYMBOL_RENDER_PRIORITIES,
  GAME002_SYMBOL_SCALES,
} from "../src/symbol-animation-config.js";
import { getGame002SkinConfig } from "../src/skin-config.js";

describe("game002 symbol animation config", () => {
  it("derives 100 percent scale and WL-highest priority from game002-s3 manifest", () => {
    const displaySymbols = getGame002SkinConfig("1").displaySymbols;
    expect(Object.keys(GAME002_SYMBOL_SCALES).sort()).toEqual(
      [...displaySymbols].sort(),
    );

    for (const symbol of displaySymbols) {
      expect(GAME002_SYMBOL_SCALES[symbol]).toBe(1);
      expect(GAME002_SYMBOL_RENDER_PRIORITIES[symbol]).toBe(
        symbol === "WL" ? 1 : 0,
      );
    }
  });
});
