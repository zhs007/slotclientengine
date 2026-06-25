import { describe, expect, it } from "vitest";
import { GAME002_DISPLAY_SYMBOLS } from "../src/assets.js";
import { GAME002_SYMBOL_SCALES } from "../src/symbol-animation-config.js";

describe("game002 symbol animation config", () => {
  it("uses the symbols002 40 percent display scale for every textured symbol", () => {
    expect(Object.keys(GAME002_SYMBOL_SCALES).sort()).toEqual(
      [...GAME002_DISPLAY_SYMBOLS].sort(),
    );

    for (const symbol of GAME002_DISPLAY_SYMBOLS) {
      expect(GAME002_SYMBOL_SCALES[symbol]).toBe(0.4);
    }
  });
});
