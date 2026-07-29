import { describe, expect, it } from "vitest";
import { formatServerAmount, SERVER_AMOUNT_SCALE } from "../src/money.js";

describe("game003 money formatting", () => {
  it("formats server minor-unit amounts without a currency symbol", () => {
    expect(SERVER_AMOUNT_SCALE).toBe(100);
    expect(formatServerAmount(0)).toBe("0.00");
    expect(formatServerAmount(12345)).toBe("123.45");
    expect(() => formatServerAmount(Number.NaN)).toThrow(/finite/);
  });
});
