import { describe, expect, it } from "vitest";
import { selectSymbolAnimation } from "../src/symbols.js";

describe("selectSymbolAnimation", () => {
  it("distributes all three clips across the symbol grid", () => {
    const selected = new Set<string>();
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        selected.add(selectSymbolAnimation({ column, row }));
      }
    }

    expect(selected).toEqual(new Set(["idle", "win", "land"]));
  });
});
