import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  CompositeSymbolAni,
  type SymbolAni,
  type SymbolAnimationContext,
  type SymbolManifestCompositeAnimationSpec,
} from "../../src/symbol/index.js";

function createContext(
  playback: "static" | "loop" | "once",
): SymbolAnimationContext {
  const root = new Container();
  const underlayLayer = new Container();
  const baseLayer = new Container();
  const sprite = new Sprite(Texture.WHITE);
  const stateSprite = new Sprite(Texture.WHITE);
  const overlayLayer = new Container();
  baseLayer.addChild(sprite);
  root.addChild(underlayLayer, baseLayer, stateSprite, overlayLayer);
  return {
    code: 1,
    symbol: "A",
    pays: [],
    requestedState: playback === "static" ? "normal" : "win",
    resolvedState: playback === "static" ? "normal" : "win",
    state: {
      id: playback === "static" ? "normal" : "win",
      phase: playback === "once" ? "once" : "stable",
      playback,
    },
    texture: Texture.WHITE,
    stateTextures: playback === "static" ? {} : { win: Texture.WHITE },
    requiredStateTextures: [],
    root,
    underlayLayer,
    baseLayer,
    sprite,
    layers: [{ index: 0, texture: Texture.WHITE, keyframes: [], sprite }],
    stateSprite,
    overlayLayer,
  };
}

function spec(
  base: "normal" | "stateTexture" = "normal",
): SymbolManifestCompositeAnimationSpec {
  return {
    kind: "composite",
    base: { kind: base },
    layers: [
      {
        id: "back",
        placement: "underlay",
        animation: {
          kind: "vni",
          project: "./back.json",
          playback: {
            mode: "range",
            startTime: 0,
            endTime: 1,
            loop: false,
          },
        },
      },
      {
        id: "front-a",
        placement: "overlay",
        animation: {
          kind: "vni",
          project: "./front-a.json",
          playback: {
            mode: "range",
            startTime: 0,
            endTime: 1,
            loop: false,
          },
        },
      },
      {
        id: "front-b",
        placement: "overlay",
        animation: {
          kind: "vni",
          project: "./front-b.json",
          playback: {
            mode: "range",
            startTime: 0,
            endTime: 1,
            loop: false,
          },
        },
      },
    ],
  };
}

function fakeAni(
  playback: "static" | "loop" | "once",
  completions: readonly boolean[],
): SymbolAni & { destroy: () => void } {
  let index = 0;
  return {
    stateId: "win",
    playback,
    reset: vi.fn(() => {
      index = 0;
    }),
    update: vi.fn(() => {
      const completed = completions[index++] ?? false;
      return {
        loopCompleted: playback === "loop" && completed,
        onceCompleted: playback === "once" && completed,
      };
    }),
    destroy: vi.fn(),
  };
}

describe("CompositeSymbolAni", () => {
  it("keeps the base visible and mounts stable underlay/overlay slots", () => {
    const context = createContext("static");
    const ani = new CompositeSymbolAni({
      context,
      spec: spec(),
      createAnimation: () => fakeAni("static", []),
    });

    ani.reset();

    expect(context.baseLayer.visible).toBe(true);
    expect(context.stateSprite.visible).toBe(false);
    expect(context.underlayLayer.children.map((child) => child.label)).toEqual([
      "symbol-composite-underlay-back",
    ]);
    expect(context.overlayLayer.children.map((child) => child.label)).toEqual([
      "symbol-composite-overlay-front-a",
      "symbol-composite-overlay-front-b",
    ]);
  });

  it("reports once completion only after every child completes", () => {
    const children = [
      fakeAni("once", [true]),
      fakeAni("once", [false, true]),
      fakeAni("once", [true]),
    ];
    const ani = new CompositeSymbolAni({
      context: createContext("once"),
      spec: spec("stateTexture"),
      createAnimation: (_layer, _context) => children.shift()!,
    });
    ani.reset();

    expect(ani.update(0.1).onceCompleted).toBe(false);
    expect(ani.update(0.1).onceCompleted).toBe(true);
    expect(ani.update(0.1).onceCompleted).toBe(false);
  });

  it("uses a per-child loop barrier and destroys every owner", () => {
    const first = fakeAni("loop", [true, false, true]);
    const second = fakeAni("loop", [false, true, true]);
    const third = fakeAni("loop", [true, true, true]);
    const children = [first, second, third];
    const ani = new CompositeSymbolAni({
      context: createContext("loop"),
      spec: spec("stateTexture"),
      createAnimation: (_layer, _context) => children.shift()!,
    });
    ani.reset();

    expect(ani.update(0.1).loopCompleted).toBe(false);
    expect(ani.update(0.1).loopCompleted).toBe(true);
    expect(ani.update(0.1).loopCompleted).toBe(true);
    ani.destroy();
    ani.destroy();

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).toHaveBeenCalledTimes(1);
    expect(third.destroy).toHaveBeenCalledTimes(1);
  });

  it("rolls back every child and slot when one leaf fails", () => {
    const context = createContext("once");
    const first = fakeAni("once", [false]);
    const second = fakeAni("once", [false]);
    second.update = vi.fn(() => {
      throw new Error("leaf failed");
    });
    const children = [first, second, fakeAni("once", [false])];
    const ani = new CompositeSymbolAni({
      context,
      spec: spec("stateTexture"),
      createAnimation: () => children.shift()!,
    });
    ani.reset();

    expect(() => ani.update(0.1)).toThrow("leaf failed");
    expect(context.underlayLayer.children).toHaveLength(0);
    expect(context.overlayLayer.children).toHaveLength(0);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).toHaveBeenCalledTimes(1);
  });
});
