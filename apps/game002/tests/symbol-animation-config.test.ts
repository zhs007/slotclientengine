import { describe, expect, it } from "vitest";
import {
  GAME002_SYMBOL_RENDER_PRIORITIES,
  GAME002_SYMBOL_SCALES,
} from "../src/symbol-animation-config.js";
import { getTestGame002SkinConfig } from "./value-resource-fixture.js";

describe("game002 symbol animation config", () => {
  it("keeps production defaults empty and derives values from the loaded Symbols package", () => {
    const skin = getTestGame002SkinConfig();
    expect(GAME002_SYMBOL_SCALES).toEqual({});
    expect(GAME002_SYMBOL_RENDER_PRIORITIES).toEqual({});

    for (const symbol of skin.displaySymbols) {
      expect(skin.symbolScales[symbol]).toBe(1);
      expect(skin.symbolRenderPriorities[symbol]).toBe(symbol === "WL" ? 1 : 0);
    }
  });
});
