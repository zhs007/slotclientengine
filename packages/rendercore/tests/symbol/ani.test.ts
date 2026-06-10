import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  ManualSymbolAni,
  SymbolAnimationError,
  createAppearSymbolAni,
  createLoopSymbolAni,
  createStaticSymbolAni,
  createWinSymbolAni
} from "../../src/symbol/index.js";
import type { SymbolAnimationContext } from "../../src/symbol/index.js";

function createContext(state = "normal"): SymbolAnimationContext {
  const root = new Container();
  const sprite = new Sprite(Texture.WHITE);
  const overlayLayer = new Container();
  root.addChild(sprite, overlayLayer);
  return {
    code: 1,
    symbol: "S00",
    pays: [0],
    requestedState: state,
    resolvedState: state,
    state: {
      id: state,
      phase: state === "normal" ? "stable" : "once",
      playback: state === "normal" ? "static" : "once"
    },
    texture: Texture.WHITE,
    root,
    sprite,
    overlayLayer
  };
}

describe("ManualSymbolAni", () => {
  it("rejects invalid deltaSeconds and duration", () => {
    expect(() => new ManualSymbolAni({ stateId: "bad", playback: "once", durationSeconds: 0 })).toThrow(
      SymbolAnimationError
    );
    const ani = new ManualSymbolAni({ stateId: "once", playback: "once", durationSeconds: 1 });
    expect(() => ani.update(-1)).toThrow(SymbolAnimationError);
    expect(() => ani.update(Number.NaN)).toThrow(SymbolAnimationError);
  });

  it("reports loop and once completion as edge events", () => {
    const loop = createLoopSymbolAni({ stateId: "loop", durationSeconds: 1 });
    expect(loop.update(0.5)).toEqual({ loopCompleted: false, onceCompleted: false });
    expect(loop.update(0.5)).toEqual({ loopCompleted: true, onceCompleted: false });
    expect(loop.update(0.1)).toEqual({ loopCompleted: false, onceCompleted: false });

    const once = new ManualSymbolAni({ stateId: "once", playback: "once", durationSeconds: 1 });
    expect(once.update(0.99)).toEqual({ loopCompleted: false, onceCompleted: false });
    expect(once.update(0.02)).toEqual({ loopCompleted: false, onceCompleted: true });
    expect(once.update(1)).toEqual({ loopCompleted: false, onceCompleted: false });
  });

  it("keeps static ani at a loop boundary", () => {
    const ani = createStaticSymbolAni(createContext());
    expect(ani.update(0)).toEqual({ loopCompleted: true, onceCompleted: false });
  });

  it("handles large deltaSeconds without repeated once completion", () => {
    const once = new ManualSymbolAni({ stateId: "once", playback: "once", durationSeconds: 0.25 });
    expect(once.update(5)).toEqual({ loopCompleted: false, onceCompleted: true });
    expect(once.update(5)).toEqual({ loopCompleted: false, onceCompleted: false });
  });
});

describe("default viewer ani factories", () => {
  it("scales appear to about 1.5 and resets at completion", () => {
    const context = createContext("appear");
    const ani = createAppearSymbolAni(context);
    ani.reset();

    ani.update(0.21);
    expect(context.sprite.scale.x).toBeGreaterThan(1.45);

    const result = ani.update(0.21);
    expect(result.onceCompleted).toBe(true);
    expect(context.sprite.scale.x).toBe(1);
  });

  it("creates and clears a win shine overlay", () => {
    const context = createContext("win");
    const ani = createWinSymbolAni(context);
    ani.reset();

    expect(context.overlayLayer.children.length).toBe(2);
    const shineSprite = context.overlayLayer.children[0];
    const shineMask = context.overlayLayer.children[1];
    expect(context.sprite.mask ?? null).toBeNull();
    expect(shineSprite).toBeInstanceOf(Sprite);
    expect((shineSprite as Sprite).texture).toBe(context.texture);
    expect(shineSprite?.mask).toBe(shineMask);
    expect(shineSprite?.blendMode).toBe("screen");
    expect(ani.update(0.29).onceCompleted).toBe(false);
    expect(shineSprite?.alpha ?? 0).toBeGreaterThan(0.9);
    expect(context.sprite.scale.x).toBeGreaterThan(1.19);
    expect(context.overlayLayer.scale.x).toBeGreaterThan(1.19);

    const result = ani.update(1);
    expect(result.onceCompleted).toBe(true);
    expect(context.sprite.scale.x).toBe(1);
    expect(context.overlayLayer.scale.x).toBe(1);
    expect(shineSprite?.mask ?? null).toBeNull();
    expect(context.overlayLayer.children.length).toBe(0);
  });
});
