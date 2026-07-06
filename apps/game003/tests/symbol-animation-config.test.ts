import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  GAME003_SYMBOL_RENDER_PRIORITIES,
  GAME003_SYMBOL_SCALES,
} from "../src/symbol-animation-config.js";
import { getGame003SkinConfig } from "../src/skin-config.js";
import {
  SpineNormalFallbackAni,
  SpineSymbolAni,
  type SymbolAnimationContext,
} from "@slotclientengine/rendercore";

describe("game003 symbol animation config", () => {
  it("derives all symbol scales from the manifest", () => {
    const skin = getGame003SkinConfig("1");

    expect(GAME003_SYMBOL_SCALES).toEqual(
      Object.fromEntries(skin.displaySymbols.map((symbol) => [symbol, 1])),
    );
  });

  it("derives render priorities from the manifest", () => {
    const skin = getGame003SkinConfig("1");

    expect(GAME003_SYMBOL_RENDER_PRIORITIES).toEqual(
      skin.symbolRenderPriorities,
    );
    expect(GAME003_SYMBOL_RENDER_PRIORITIES).toMatchObject({
      WL: 1,
      CL: 1,
      SC: 1,
      H1: 0,
    });
  });

  it("keeps VNI-only appear static and maps configured Spine states through rendercore", () => {
    const skin = getGame003SkinConfig("1");

    for (const symbol of ["L1", "L2", "L3", "L4", "L5"]) {
      const context = createSymbolContext(symbol, "appear");
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

    for (const symbol of ["H2", "H3", "H4", "H5"]) {
      const context = createSymbolContext(symbol, "appear");
      const ani = skin.symbolAnimationResolver(context);

      expect(ani).toBeInstanceOf(SpineNormalFallbackAni);
      expect(ani.playback).toBe("once");
    }

    for (const symbol of ["WL", "H1", "CL", "SC"]) {
      const context = createSymbolContext(symbol, "appear");
      const ani = skin.symbolAnimationResolver(context);

      expect(ani).toBeInstanceOf(SpineSymbolAni);
      expect(ani.playback).toBe("once");
    }

    for (const symbol of ["WL", "H1", "H2", "H3", "H4", "H5", "CL", "SC"]) {
      const context = createSymbolContext(symbol, "normal");
      const ani = skin.symbolAnimationResolver(context);

      expect(ani).toBeInstanceOf(SpineSymbolAni);
      expect(ani.playback).toBe("static");
    }

    for (const symbol of ["WL", "H1", "H2", "H3", "H4", "H5", "CL", "SC"]) {
      const context = createSymbolContext(symbol, "win");
      const ani = skin.symbolAnimationResolver(context);

      expect(ani).toBeInstanceOf(SpineSymbolAni);
      expect(ani.playback).toBe("once");
    }

    for (const symbol of ["WL", "H1", "H2", "H3", "H4", "H5", "CL", "SC"]) {
      const context = createSymbolContext(symbol, "spinBlur");
      const ani = skin.symbolAnimationResolver(context);

      ani.reset();

      expect(ani).not.toBeInstanceOf(SpineSymbolAni);
      expect(ani.playback).toBe("static");
      expect(context.baseLayer.visible).toBe(false);
      expect(context.stateSprite.visible).toBe(true);
    }
  });
});

function createSymbolContext(
  symbol: string,
  stateId: "normal" | "appear" | "spinBlur" | "win",
): SymbolAnimationContext {
  const resolvedState = stateId === "spinBlur" ? "normal" : stateId;
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
    requestedState: stateId,
    resolvedState,
    state: {
      id: resolvedState,
      phase: resolvedState === "normal" ? "stable" : "once",
      playback: resolvedState === "normal" ? "static" : "once",
    },
    texture: Texture.WHITE,
    stateTextures: stateId === "spinBlur" ? { spinBlur: Texture.WHITE } : {},
    requiredStateTextures: stateId === "spinBlur" ? ["spinBlur"] : [],
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
