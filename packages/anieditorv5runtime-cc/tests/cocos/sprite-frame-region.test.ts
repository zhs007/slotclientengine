import { describe, expect, it } from "vitest";
import { Rect, Size, SpriteFrame, Vec2 } from "cc";
import { createCocosNodeDriver } from "../../src/cocos/cocos-node-driver";
import { createCocosNodeDriver as createStandaloneCocosNodeDriver } from "../../standalone/anieditorv5runtime-cc";

function createAtlasFrame(rotated: boolean): SpriteFrame {
  const frame = new SpriteFrame();
  frame.reset({
    texture: { name: "atlas" },
    rect: new Rect(100, 200, 80, 40),
    originalSize: new Size(160, 80),
    offset: new Vec2(0, 0),
    isRotate: rotated,
  });
  return frame;
}

function createRegion(
  source: SpriteFrame,
  region: { x: number; y: number; width: number; height: number },
): SpriteFrame {
  const createSpriteFrameRegion =
    createCocosNodeDriver().createSpriteFrameRegion;
  if (!createSpriteFrameRegion) {
    throw new Error("Cocos node driver did not provide region slicing.");
  }
  return createSpriteFrameRegion(source, region);
}

describe("Cocos SpriteFrame region slicing", () => {
  it("maps an unrotated logical region into the atlas rect", () => {
    const source = createAtlasFrame(false);
    const region = createRegion(source, {
      x: 20,
      y: 10,
      width: 40,
      height: 20,
    });

    expect(region.texture).toBe(source.texture);
    expect(region.rect).toEqual({ x: 110, y: 205, width: 20, height: 10 });
    expect(region.originalSize).toEqual({ width: 40, height: 20 });
    expect(region.rotated).toBe(false);
  });

  it("maps a rotated logical region using the rotated atlas axes", () => {
    const source = createAtlasFrame(true);
    const region = createRegion(source, {
      x: 20,
      y: 10,
      width: 40,
      height: 20,
    });

    expect(region.texture).toBe(source.texture);
    expect(region.rect).toEqual({ x: 125, y: 210, width: 20, height: 10 });
    expect(region.originalSize).toEqual({ width: 40, height: 20 });
    expect(region.rotated).toBe(true);
  });

  it("preserves the full rotated atlas rect", () => {
    const source = createAtlasFrame(true);
    const region = createRegion(source, {
      x: 0,
      y: 0,
      width: 160,
      height: 80,
    });

    expect(region.rect).toEqual(source.rect);
    expect(region.rotated).toBe(true);
  });

  it("keeps standalone rotated slicing in parity", () => {
    const source = createAtlasFrame(true);
    const createSpriteFrameRegion =
      createStandaloneCocosNodeDriver().createSpriteFrameRegion;
    if (!createSpriteFrameRegion) {
      throw new Error(
        "Standalone Cocos driver did not provide region slicing.",
      );
    }

    const region = createSpriteFrameRegion(source, {
      x: 20,
      y: 10,
      width: 40,
      height: 20,
    });

    expect(region.rect).toEqual({ x: 125, y: 210, width: 20, height: 10 });
    expect(region.rotated).toBe(true);
  });
});
