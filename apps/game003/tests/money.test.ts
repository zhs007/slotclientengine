import { describe, expect, it } from "vitest";
import {
  formatServerUsdAmount,
  SERVER_USD_AMOUNT_SCALE,
} from "../src/money.js";

describe("game003 money formatting", () => {
  it("formats server minor-unit USD amounts", () => {
    expect(SERVER_USD_AMOUNT_SCALE).toBe(100);
    expect(formatServerUsdAmount(0)).toBe("$0.00");
    expect(formatServerUsdAmount(12345)).toBe("$123.45");
    expect(() => formatServerUsdAmount(Number.NaN)).toThrow(/finite/);
  });
});
