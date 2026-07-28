import { describe, expect, it } from "vitest";
import { Mask, SpriteFrame } from "cc";
import { createCocosNodeDriver } from "../../src/cocos/cocos-node-driver";

describe("cocos legacy alpha mask", () => {
  it("uses the Cocos 3.8.6 sprite stencil and reparents the moving target", () => {
    const driver = createCocosNodeDriver();
    const firstFrame = new SpriteFrame();
    const secondFrame = new SpriteFrame();
    const source = driver.createImageNode("source", firstFrame);
    const target = driver.createImageNode("target", new SpriteFrame());
    const maskNode = driver.createAlphaMaskNode?.("mask", source, target);

    if (!maskNode) throw new Error("Cocos mask node was not created.");
    const mask = maskNode.getComponent(Mask);
    if (!mask) throw new Error("Cocos Mask component was not created.");

    expect(mask.type).toBe(Mask.Type.SPRITE_STENCIL);
    expect(mask.spriteFrame).toBe(firstFrame);
    expect(target.parent).toBe(maskNode);

    driver.setImageSpriteFrame?.(source, secondFrame);
    driver.updateAlphaMaskNode?.(maskNode, source, target);
    expect(mask.spriteFrame).toBe(secondFrame);
  });
});
