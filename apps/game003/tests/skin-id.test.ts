import { describe, expect, it } from "vitest";
import { GAME003_SUPPORTED_SKINS, parseGame003SkinId } from "../src/skin-id.js";

describe("game003 skin id", () => {
  it("accepts exactly skin 1 or 2", () => {
    expect(GAME003_SUPPORTED_SKINS).toEqual(["1", "2"]);
    expect(parseGame003SkinId("1")).toBe("1");
    expect(parseGame003SkinId("2")).toBe("2");
    for (const value of ["", "01", "3"]) {
      expect(() => parseGame003SkinId(value)).toThrow(/exactly "1" or "2"/);
    }
  });
});
