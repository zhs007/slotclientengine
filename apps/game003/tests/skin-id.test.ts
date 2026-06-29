import { describe, expect, it } from "vitest";
import { GAME003_SUPPORTED_SKINS, parseGame003SkinId } from "../src/skin-id.js";

describe("game003 skin id", () => {
  it("only accepts skin 1", () => {
    expect(GAME003_SUPPORTED_SKINS).toEqual(["1"]);
    expect(parseGame003SkinId("1")).toBe("1");
    expect(() => parseGame003SkinId("2")).toThrow(/must be "1"/);
  });
});
