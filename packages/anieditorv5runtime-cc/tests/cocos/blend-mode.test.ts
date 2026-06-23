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

const COCOS_BLEND_FACTOR = {
  ONE: 1,
  SRC_ALPHA: 2,
  ONE_MINUS_SRC_ALPHA: 4,
  DST_COLOR: 7,
  ONE_MINUS_SRC_COLOR: 8,
} as const;

const COCOS_BLEND_OP = {
  ADD: 0,
  MAX: 4,
} as const;

describe("cocos blend mode", () => {
  it("maps every known V5G blend mode to a distinct Cocos blend-state config", () => {
    expect(getCocosBlendModeConfig("normal")).toEqual({
      mode: "normal",
      strategy: "sprite-blend-state",
      color: {
        operation: "ADD",
        sourceFactor: "SRC_ALPHA",
        destinationFactor: "ONE_MINUS_SRC_ALPHA",
      },
      alpha: {
        operation: "ADD",
        sourceFactor: "SRC_ALPHA",
        destinationFactor: "ONE_MINUS_SRC_ALPHA",
      },
    });

    const signatures = new Set(
      blendModes.map((blendMode) =>
        JSON.stringify(getCocosBlendModeConfig(blendMode).color),
      ),
    );
    expect(signatures.size).toBe(blendModes.length);
    for (const blendMode of blendModes.slice(1)) {
      expect(getCocosBlendModeConfig(blendMode)).toMatchObject({
        mode: blendMode,
        strategy: "sprite-blend-state",
      });
      expect(getCocosBlendModeConfig(blendMode).color).not.toEqual(
        getCocosBlendModeConfig("normal").color,
      );
    }
  });

  it("keeps normal mode on default Sprite rendering without blend APIs", () => {
    const driver = createCocosNodeDriver();
    const node = driver.createImageNode("normal", new SpriteFrame());
    const sprite = requireSprite(node);
    delete (sprite as Partial<Sprite>).srcBlendFactor;
    delete (sprite as Partial<Sprite>).dstBlendFactor;
    sprite.getMaterialInstance = undefined as never;

    expect(() =>
      driver.applyBlendMode(node, getCocosBlendModeConfig("normal")),
    ).not.toThrow();
  });

  it("applies native Sprite blend factors and pass blend state", () => {
    const driver = createCocosNodeDriver();
    const cases: Array<{
      mode: Exclude<V5GBlendMode, "normal">;
      src: number;
      dst: number;
      op: number;
    }> = [
      {
        mode: "add",
        src: COCOS_BLEND_FACTOR.SRC_ALPHA,
        dst: COCOS_BLEND_FACTOR.ONE,
        op: COCOS_BLEND_OP.ADD,
      },
      {
        mode: "screen",
        src: COCOS_BLEND_FACTOR.SRC_ALPHA,
        dst: COCOS_BLEND_FACTOR.ONE_MINUS_SRC_COLOR,
        op: COCOS_BLEND_OP.ADD,
      },
      {
        mode: "multiply",
        src: COCOS_BLEND_FACTOR.DST_COLOR,
        dst: COCOS_BLEND_FACTOR.ONE_MINUS_SRC_ALPHA,
        op: COCOS_BLEND_OP.ADD,
      },
      {
        mode: "lighten",
        src: COCOS_BLEND_FACTOR.SRC_ALPHA,
        dst: COCOS_BLEND_FACTOR.ONE,
        op: COCOS_BLEND_OP.MAX,
      },
    ];

    for (const { mode, src, dst, op } of cases) {
      const node = driver.createImageNode(mode, new SpriteFrame());
      driver.applyBlendMode(node, getCocosBlendModeConfig(mode));
      const sprite = requireSprite(node);
      const pass = sprite.getMaterialInstance(0)?.passes[0];
      const target = pass?.blendState.targets[0];
      expect(sprite.srcBlendFactor).toBe(src);
      expect(sprite.dstBlendFactor).toBe(dst);
      expect(
        (sprite as Sprite & { materialUpdates: number }).materialUpdates,
      ).toBe(1);
      expect(target?.blend).toBe(true);
      expect(target?.blendSrc).toBe(src);
      expect(target?.blendDst).toBe(dst);
      expect(target?.blendEq).toBe(op);
      expect(target?.blendSrcAlpha).toBe(COCOS_BLEND_FACTOR.SRC_ALPHA);
      expect(target?.blendDstAlpha).toBe(
        COCOS_BLEND_FACTOR.ONE_MINUS_SRC_ALPHA,
      );
      expect(target?.blendAlphaEq).toBe(COCOS_BLEND_OP.ADD);
      expect(
        (pass as typeof pass & { passHashUpdates: number }).passHashUpdates,
      ).toBe(2);
    }
  });

  it("uses Cocos protected blend factor storage when public accessors are unavailable", () => {
    const driver = createCocosNodeDriver();
    const node = driver.createImageNode("PrivateBlend", new SpriteFrame());
    const sprite = requireSprite(node) as Sprite & {
      _srcBlendFactor?: number;
      _dstBlendFactor?: number;
    };
    delete (sprite as Partial<Sprite>).srcBlendFactor;
    delete (sprite as Partial<Sprite>).dstBlendFactor;
    sprite._srcBlendFactor = COCOS_BLEND_FACTOR.SRC_ALPHA;
    sprite._dstBlendFactor = COCOS_BLEND_FACTOR.ONE_MINUS_SRC_ALPHA;

    driver.applyBlendMode(node, getCocosBlendModeConfig("add"));

    expect(sprite._srcBlendFactor).toBe(COCOS_BLEND_FACTOR.SRC_ALPHA);
    expect(sprite._dstBlendFactor).toBe(COCOS_BLEND_FACTOR.ONE);
  });

  it("fails instead of falling back to normal when Cocos blend APIs are missing", () => {
    const driver = createCocosNodeDriver();
    const node = driver.createImageNode("Layer", new SpriteFrame());
    const sprite = requireSprite(node);
    delete (sprite as Partial<Sprite>).srcBlendFactor;
    delete (sprite as Partial<Sprite>).dstBlendFactor;

    expect(() =>
      driver.applyBlendMode(node, getCocosBlendModeConfig("screen")),
    ).toThrow("does not expose blend factor fields");

    const noMaterial = driver.createImageNode("NoMaterial", new SpriteFrame());
    const noMaterialSprite = requireSprite(noMaterial);
    noMaterialSprite.getMaterialInstance = undefined as never;
    expect(() =>
      driver.applyBlendMode(noMaterial, getCocosBlendModeConfig("lighten")),
    ).toThrow("cannot provide a material instance");
  });
});

function requireSprite(node: {
  getComponent(component: typeof Sprite): Sprite | null;
}): Sprite {
  const sprite = node.getComponent(Sprite);
  if (!sprite) throw new Error("test Sprite component is missing.");
  return sprite;
}
