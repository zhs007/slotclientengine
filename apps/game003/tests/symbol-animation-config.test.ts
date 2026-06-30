import { describe, expect, it } from "vitest";
import { GAME003_SYMBOL_SCALES } from "../src/symbol-animation-config.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 symbol animation config", () => {
  it("derives all symbol scales from the manifest", () => {
    const skin = getGame003SkinConfig("1");

    expect(GAME003_SYMBOL_SCALES).toEqual(
      Object.fromEntries(skin.displaySymbols.map((symbol) => [symbol, 1])),
    );
  });
});
