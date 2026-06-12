import { createMoneyFormatter } from "../src/index.js";
import { assertFiniteMoneyAmount } from "../src/format.js";

describe("format", () => {
  it("formats money with default decimal style", () => {
    expect(createMoneyFormatter()(1234.5)).toBe("1,234.50");
  });

  it("formats money with currency and locale", () => {
    expect(createMoneyFormatter({ currency: "USD", locale: "en-US" })(12)).toBe("$12.00");
  });

  it("uses explicit custom formatter", () => {
    const formatter = createMoneyFormatter({
      formatMoney: (amount) => `coin ${amount.toFixed(1)}`
    });
    expect(formatter(3.25)).toBe("coin 3.3");
  });

  it("rejects invalid values and invalid formatter output", () => {
    expect(() => assertFiniteMoneyAmount(Number.NaN, "balance")).toThrow(/balance/);
    const formatter = createMoneyFormatter({ formatMoney: () => "" });
    expect(() => formatter(1)).toThrow(/non-empty/);
  });
});
