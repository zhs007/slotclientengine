import { formatServerUsdAmount } from "../src/money.js";

describe("money formatting", () => {
  it("formats server USD minor units as dollars", () => {
    expect(formatServerUsdAmount(10)).toBe("$0.10");
    expect(formatServerUsdAmount(100)).toBe("$1.00");
    expect(formatServerUsdAmount(199900)).toBe("$1,999.00");
  });

  it("rejects non-finite amounts", () => {
    expect(() => formatServerUsdAmount(Number.NaN)).toThrow(/finite/);
  });
});
