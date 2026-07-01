import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { GAME003_SYMBOL_SCALES } from "../src/symbol-animation-config.js";
import { getGame003SkinConfig } from "../src/skin-config.js";
import type { SymbolAnimationContext } from "@slotclientengine/rendercore";

describe("game003 symbol animation config", () => {
  it("derives all symbol scales from the manifest", () => {
    const skin = getGame003SkinConfig("1");

    expect(GAME003_SYMBOL_SCALES).toEqual(
      Object.fromEntries(skin.displaySymbols.map((symbol) => [symbol, 1])),
    );
  });

  it("keeps L1-L5 appear static while other symbols use manifest builtin appear", () => {
    const skin = getGame003SkinConfig("1");

    for (const symbol of ["L1", "L2", "L3", "L4", "L5"]) {
      const context = createAppearContext(symbol);
      const ani = skin.symbolAnimationResolver(context);

      ani.reset();
      ani.update(0.01);

      expect(ani.playback).toBe("once");
      expect(context.sprite.scale).toMatchObject({ x: 1, y: 1 });
      expect(context.underlayLayer.children).toEqual([]);
      expect(context.overlayLayer.children).toEqual([]);
      expect(context.baseLayer.visible).toBe(true);
      expect(context.stateSprite.visible).toBe(false);
    }

    const builtinContext = createAppearContext("H1");
    const builtinAni = skin.symbolAnimationResolver(builtinContext);
    builtinAni.reset();
    builtinAni.update(0.2);

    expect(builtinContext.sprite.scale.x).toBeGreaterThan(1);
  });
});

function createAppearContext(symbol: string): SymbolAnimationContext {
  const root = new Container();
  const sprite = new Sprite(Texture.WHITE);
  const underlayLayer = new Container();
  const baseLayer = new Container();
  const stateSprite = new Sprite(Texture.WHITE);
  const overlayLayer = new Container();
  baseLayer.addChild(sprite);
  root.addChild(underlayLayer, baseLayer, stateSprite, overlayLayer);
  return {
    code: 1,
    symbol,
    pays: [0],
    requestedState: "appear",
    resolvedState: "appear",
    state: {
      id: "appear",
      phase: "once",
      playback: "once",
    },
    texture: Texture.WHITE,
    stateTextures: {},
    requiredStateTextures: [],
    root,
    underlayLayer,
    baseLayer,
    sprite,
    layers: [
      {
        index: 0,
        texture: Texture.WHITE,
        keyframes: [],
        sprite,
      },
    ],
    stateSprite,
    overlayLayer,
  };
}
