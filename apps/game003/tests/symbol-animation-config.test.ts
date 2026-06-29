import { describe, expect, it } from "vitest";
import { GAME003_DISPLAY_SYMBOLS } from "../src/assets.js";
import { GAME003_SYMBOL_SCALES } from "../src/symbol-animation-config.js";

describe("game003 symbol animation config", () => {
  it("derives all symbol scales from the manifest", () => {
    expect(GAME003_SYMBOL_SCALES).toEqual(
      Object.fromEntries(GAME003_DISPLAY_SYMBOLS.map((symbol) => [symbol, 1])),
    );
  });
});
