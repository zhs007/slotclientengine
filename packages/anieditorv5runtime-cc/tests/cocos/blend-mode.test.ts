import { describe, expect, it } from "vitest";
import { getCocosBlendModeConfig } from "../../src/cocos/blend-mode";

describe("cocos blend mode", () => {
  it("maps normal and add to explicit Cocos blend factors", () => {
    expect(getCocosBlendModeConfig("normal")).toEqual({
      mode: "normal",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE_MINUS_SRC_ALPHA",
    });
    expect(getCocosBlendModeConfig("add")).toEqual({
      mode: "add",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE",
    });
  });

  it("fails for unconfirmed blend modes instead of falling back to normal", () => {
    expect(() => getCocosBlendModeConfig("screen")).toThrow(
      "Unsupported Cocos V5G blendMode: screen",
    );
  });
});
