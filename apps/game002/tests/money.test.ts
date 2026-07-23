import { describe, expect, it } from "vitest";
import {
  createServerCurrencyAmountFormatter,
  formatServerUsdAmount,
} from "../src/money.js";

describe("game002 money formatting", () => {
  it("formats server USD minor units as dollars", () => {
    expect(formatServerUsdAmount(100)).toBe("$1.00");
    expect(formatServerUsdAmount(1575)).toBe("$15.75");
    expect(formatServerUsdAmount(199900)).toBe("$1,999.00");
  });

  it("rejects non-finite amounts", () => {
    expect(() => formatServerUsdAmount(Number.NaN)).toThrow(/finite/);
  });

  it("keeps server minor units while applying platform currency and locale", () => {
    const format = createServerCurrencyAmountFormatter({
      currency: "EUR",
      locale: "de-DE",
    });
    expect(format(1575)).toBe(
      new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(15.75),
    );
  });
});
