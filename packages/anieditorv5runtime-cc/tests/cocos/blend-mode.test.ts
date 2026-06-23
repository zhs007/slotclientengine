import { describe, expect, it } from "vitest";
import { BlendFactor, BlendOp, Sprite, SpriteFrame } from "cc";
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

  it("applies native Sprite blend factors and pass blend state", () => {
    const driver = createCocosNodeDriver();
    const cases: Array<{
      mode: V5GBlendMode;
      src: BlendFactor;
      dst: BlendFactor;
      op: BlendOp;
    }> = [
      {
        mode: "normal",
        src: BlendFactor.SRC_ALPHA,
        dst: BlendFactor.ONE_MINUS_SRC_ALPHA,
        op: BlendOp.ADD,
      },
      {
        mode: "add",
        src: BlendFactor.SRC_ALPHA,
        dst: BlendFactor.ONE,
        op: BlendOp.ADD,
      },
      {
        mode: "screen",
        src: BlendFactor.SRC_ALPHA,
        dst: BlendFactor.ONE_MINUS_SRC_COLOR,
        op: BlendOp.ADD,
      },
      {
        mode: "multiply",
        src: BlendFactor.DST_COLOR,
        dst: BlendFactor.ONE_MINUS_SRC_ALPHA,
        op: BlendOp.ADD,
      },
      {
        mode: "lighten",
        src: BlendFactor.SRC_ALPHA,
        dst: BlendFactor.ONE,
        op: BlendOp.MAX,
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
      expect(target?.blendSrcAlpha).toBe(BlendFactor.SRC_ALPHA);
      expect(target?.blendDstAlpha).toBe(BlendFactor.ONE_MINUS_SRC_ALPHA);
      expect(target?.blendAlphaEq).toBe(BlendOp.ADD);
      expect(
        (pass as typeof pass & { passHashUpdates: number }).passHashUpdates,
      ).toBe(2);
    }
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
