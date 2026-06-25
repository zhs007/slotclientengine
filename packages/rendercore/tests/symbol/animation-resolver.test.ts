import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  ManualSymbolAni,
  SymbolAnimationError,
  assertResolvedSymbolAni,
  createDefaultSymbolAnimationResolver,
} from "../../src/symbol/index.js";
import type {
  SymbolAnimationContext,
  SymbolAnimationResolver,
} from "../../src/symbol/index.js";

const createContext = (
  requestedState: string,
  resolvedState = requestedState,
): SymbolAnimationContext => {
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
    symbol: "S00",
    pays: [0],
    requestedState,
    resolvedState,
    state: {
      id: resolvedState,
      phase: resolvedState === "normal" ? "stable" : "once",
      playback: resolvedState === "normal" ? "static" : "once",
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
};

describe("createDefaultSymbolAnimationResolver", () => {
  it("resolves normal, appear and win without binding effects to state definitions", () => {
    const resolver = createDefaultSymbolAnimationResolver();

    expect(resolver(createContext("normal")).playback).toBe("static");
    expect(resolver(createContext("appear")).playback).toBe("once");
    expect(resolver(createContext("win")).playback).toBe("once");
  });

  it("receives requested and resolved states for equivalent states", () => {
    const seen: string[] = [];
    const resolver: SymbolAnimationResolver = (context) => {
      seen.push(`${context.requestedState}->${context.resolvedState}`);
      return new ManualSymbolAni({
        stateId: context.resolvedState,
        playback: "static",
      });
    };

    resolver(createContext("spinBlur", "normal"));

    expect(seen).toEqual(["spinBlur->normal"]);
  });

  it("supports per-symbol custom animation selection", () => {
    const resolver: SymbolAnimationResolver = (context) =>
      new ManualSymbolAni({
        stateId: `${context.symbol}-${context.resolvedState}`,
        playback: context.symbol === "S10" ? "loop" : "once",
        durationSeconds: 1,
      });

    expect(resolver({ ...createContext("win"), symbol: "S00" }).playback).toBe(
      "once",
    );
    expect(resolver({ ...createContext("win"), symbol: "S10" }).playback).toBe(
      "loop",
    );
  });

  it("throws when no animation exists or resolver returns an invalid value", () => {
    const resolver = createDefaultSymbolAnimationResolver();

    expect(() =>
      resolver({
        ...createContext("custom"),
        state: { id: "custom", phase: "stable", playback: "static" },
      }),
    ).toThrow(SymbolAnimationError);
    expect(() => assertResolvedSymbolAni(undefined, "custom")).toThrow(
      SymbolAnimationError,
    );
  });
});
