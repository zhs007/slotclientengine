import { describe, expect, it } from "vitest";
import { GAME003_SUPPORTED_SKINS, parseGame003SkinId } from "../src/skin-id.js";

describe("game003 skin id", () => {
  it("accepts exactly skin 2", () => {
    expect(GAME003_SUPPORTED_SKINS).toEqual(["2"]);
    expect(parseGame003SkinId("2")).toBe("2");
    for (const value of ["", "1", "02", "3"]) {
      expect(() => parseGame003SkinId(value)).toThrow(/exactly "2"/);
    }
  });
});
