import { describe, expect, it } from "vitest";
import { formatServerUsdAmount } from "../src/money.js";

describe("game002 money formatting", () => {
  it("formats server USD minor units as dollars", () => {
    expect(formatServerUsdAmount(100)).toBe("$1.00");
    expect(formatServerUsdAmount(1575)).toBe("$15.75");
    expect(formatServerUsdAmount(199900)).toBe("$1,999.00");
  });

  it("rejects non-finite amounts", () => {
    expect(() => formatServerUsdAmount(Number.NaN)).toThrow(/finite/);
  });
});
