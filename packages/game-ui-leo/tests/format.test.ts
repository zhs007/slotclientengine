import { createLeoMoneyFormatter } from "../src/format.js";

describe("Leo money formatter", () => {
  it("uses explicit currency and locale with a deterministic USD fallback", () => {
    expect(
      createLeoMoneyFormatter({ currency: "EUR", locale: "de-DE" })(12.5),
    ).toBe("12,50 €");
    expect(createLeoMoneyFormatter({ locale: "en-US" })(12.5)).toBe("$12.50");
    expect(
      createLeoMoneyFormatter({ currency: "", locale: "en-US" })(12.5),
    ).toBe("$12.50");
  });
});
