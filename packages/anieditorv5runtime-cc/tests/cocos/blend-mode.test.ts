import { describe, expect, it } from "vitest";
import { Sprite, SpriteFrame } from "cc";
import { getCocosBlendModeConfig } from "../../src/cocos/blend-mode";
import { createCocosNodeDriver } from "../../src/cocos/cocos-node-driver";
import type { V5GBlendMode } from "../../src/core/types";

const blendModes: readonly V5GBlendMode[] = [
  "normal",
  "add",
  "screen",
  "multiply",
  "lighten",
];

describe("cocos blend mode", () => {
  it("normalizes all known V5G blend modes to Cocos default rendering", () => {
    for (const blendMode of blendModes) {
      expect(getCocosBlendModeConfig(blendMode)).toEqual({ mode: "normal" });
    }
  });

  it("leaves Sprite blend factors untouched for non-normal exports", () => {
    const driver = createCocosNodeDriver();
    const node = driver.createImageNode("Layer", new SpriteFrame());
    const sprite = node.getComponent(Sprite);
    if (!sprite) throw new Error("test Sprite component is missing.");
    sprite.srcBlendFactor = 123;
    sprite.dstBlendFactor = 456;

    expect(() =>
      driver.applyBlendMode(node, getCocosBlendModeConfig("add")),
    ).not.toThrow();
    expect(sprite.srcBlendFactor).toBe(123);
    expect(sprite.dstBlendFactor).toBe(456);
  });

  it("does not require Sprite blend factor fields", () => {
    const driver = createCocosNodeDriver();
    const node = driver.createImageNode("Layer", new SpriteFrame());
    const sprite = node.getComponent(Sprite);
    if (!sprite) throw new Error("test Sprite component is missing.");
    delete (sprite as { srcBlendFactor?: number }).srcBlendFactor;
    delete (sprite as { dstBlendFactor?: number }).dstBlendFactor;

    expect(() =>
      driver.applyBlendMode(node, getCocosBlendModeConfig("screen")),
    ).not.toThrow();
  });
});
