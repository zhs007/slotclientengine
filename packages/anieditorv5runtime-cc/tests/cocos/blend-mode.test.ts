import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Material, Sprite, SpriteFrame } from "cc";
import {
  getCocosBlendModeConfig,
  VNI_SCREEN_ALPHA_EFFECT_NAME,
} from "../../src/cocos/blend-mode";
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
  it("ships an alpha-correct screen effect whose transparent pixels preserve the destination", () => {
    const effect = readFileSync(
      new URL(
        "../../standalone/effects/vni-screen-alpha.effect",
        import.meta.url,
      ),
      "utf8",
    );
    expect(effect).toContain("blendSrc: one");
    expect(effect).toContain("blendDst: one_minus_src_color");
    expect(effect).toContain(
      "CCSampleWithAlphaSeparated(cc_spriteTexture, uv0)",
    );
    expect(effect).not.toContain("#if USE_TEXTURE");
    expect(effect).toContain("o.rgb *= o.a");

    const destination = [0.2, 0.4, 0.6] as const;
    const hiddenSource = [1, 0.5, 0.25] as const;
    const transparent = compositeAlphaCorrectScreen(
      hiddenSource,
      0,
      destination,
    );
    expect(transparent).toEqual(destination);

    const legacyTransparent = compositeLegacyStraightScreen(
      hiddenSource,
      0,
      destination,
    );
    expect(legacyTransparent).not.toEqual(destination);
  });

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
        sourceFactor: "ONE",
        destinationFactor: "ONE_MINUS_SRC_ALPHA",
      },
    });

    const signatures = new Set(
      blendModes.map((blendMode) =>
        JSON.stringify(getCocosBlendModeConfig(blendMode)),
      ),
    );
    expect(signatures.size).toBe(blendModes.length);
    expect(getCocosBlendModeConfig("screen")).toEqual({
      mode: "screen",
      strategy: "alpha-correct-screen-material",
      effectName: VNI_SCREEN_ALPHA_EFFECT_NAME,
    });
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
      expect(target?.blendSrcAlpha).toBe(COCOS_BLEND_FACTOR.ONE);
      expect(target?.blendDstAlpha).toBe(
        COCOS_BLEND_FACTOR.ONE_MINUS_SRC_ALPHA,
      );
      expect(target?.blendAlphaEq).toBe(COCOS_BLEND_OP.ADD);
      expect(
        (pass as typeof pass & { passHashUpdates: number }).passHashUpdates,
      ).toBe(2);
    }
  });

  it("uses a premultiplying material for alpha-correct screen blending", () => {
    const driver = createCocosNodeDriver();
    const node = driver.createImageNode("screen", new SpriteFrame());
    const sprite = requireSprite(node) as Sprite & {
      customMaterial: Material | null;
      materialUpdates: number;
    };

    driver.applyBlendMode(node, getCocosBlendModeConfig("screen"));

    const material = sprite.customMaterial as Material & {
      effectName: string;
      destroyed: boolean;
    };
    const target = material.passes[0].blendState.targets[0];
    expect(material.effectName).toBe(VNI_SCREEN_ALPHA_EFFECT_NAME);
    expect(target.blend).toBe(true);
    expect(target.blendSrc).toBe(COCOS_BLEND_FACTOR.ONE);
    expect(target.blendDst).toBe(COCOS_BLEND_FACTOR.ONE_MINUS_SRC_COLOR);
    expect(target.blendSrcAlpha).toBe(COCOS_BLEND_FACTOR.ONE);
    expect(target.blendDstAlpha).toBe(COCOS_BLEND_FACTOR.ONE_MINUS_SRC_ALPHA);
    expect(sprite.materialUpdates).toBe(1);

    driver.applyBlendMode(node, getCocosBlendModeConfig("screen"));
    expect(sprite.customMaterial).toBe(material);
    expect(sprite.materialUpdates).toBe(1);

    driver.applyBlendMode(node, getCocosBlendModeConfig("add"));
    expect(sprite.customMaterial).toBeNull();
    expect(material.destroyed).toBe(false);

    driver.destroyNode(node);
    expect(sprite.customMaterial).toBeNull();
    expect(material.destroyed).toBe(true);
  });

  it("shares a host-provided screen Material without taking ownership", () => {
    const screenMaterial = new Material() as Material & {
      destroyed: boolean;
    };
    screenMaterial.initialize({
      effectName: VNI_SCREEN_ALPHA_EFFECT_NAME,
    });
    const driver = createCocosNodeDriver({ screenMaterial });
    const firstNode = driver.createImageNode("first-screen", new SpriteFrame());
    const secondNode = driver.createImageNode(
      "second-screen",
      new SpriteFrame(),
    );
    const firstSprite = requireSprite(firstNode);
    const secondSprite = requireSprite(secondNode);

    driver.applyBlendMode(firstNode, getCocosBlendModeConfig("screen"));
    driver.applyBlendMode(secondNode, getCocosBlendModeConfig("screen"));

    expect(firstSprite.customMaterial).toBe(screenMaterial);
    expect(secondSprite.customMaterial).toBe(screenMaterial);

    driver.destroyNode(firstNode);
    driver.destroyNode(secondNode);
    expect(firstSprite.customMaterial).toBeNull();
    expect(secondSprite.customMaterial).toBeNull();
    expect(screenMaterial.destroyed).toBe(false);
  });

  it("rejects a host Material that does not use the screen Effect", () => {
    const wrongMaterial = new Material() as Material & {
      destroyed: boolean;
    };
    wrongMaterial.initialize({ effectName: "builtin-sprite" });
    const driver = createCocosNodeDriver({
      screenMaterial: wrongMaterial,
    });
    const node = driver.createImageNode("wrong-screen", new SpriteFrame());

    expect(() =>
      driver.applyBlendMode(node, getCocosBlendModeConfig("screen")),
    ).toThrow("pass it as createV5GCocosPlayer({ screenMaterial })");
    expect(wrongMaterial.destroyed).toBe(false);
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
      driver.applyBlendMode(node, getCocosBlendModeConfig("add")),
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

function compositeAlphaCorrectScreen(
  source: readonly [number, number, number],
  alpha: number,
  destination: readonly [number, number, number],
): [number, number, number] {
  return source.map((channel, index) => {
    const premultiplied = channel * alpha;
    return (
      premultiplied + destination[index as 0 | 1 | 2] * (1 - premultiplied)
    );
  }) as [number, number, number];
}

function compositeLegacyStraightScreen(
  source: readonly [number, number, number],
  alpha: number,
  destination: readonly [number, number, number],
): [number, number, number] {
  return source.map(
    (channel, index) =>
      channel * alpha + destination[index as 0 | 1 | 2] * (1 - channel),
  ) as [number, number, number];
}
