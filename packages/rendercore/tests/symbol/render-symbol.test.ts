import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  ManualSymbolAni,
  RenderSymbol,
  SymbolAnimationError,
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createSymbolDefinitionFromPreset
} from "../../src/symbol/index.js";
import type { SymbolAnimationResolver } from "../../src/symbol/index.js";

const createDefinition = () =>
  createSymbolDefinitionFromPreset({
    code: 1,
    symbol: "S00",
    pays: [0, 2, 4],
    preset: createDefaultSymbolStatePreset()
  });

const createDistinctTexture = () => new Texture({ source: Texture.WHITE.source });

describe("RenderSymbol", () => {
  it("keeps paytable data and reuses one main sprite texture across states", () => {
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createDefaultSymbolAnimationResolver()
    });

    const sprite = renderSymbol.getMainSprite();
    expect(renderSymbol.code).toBe(1);
    expect(renderSymbol.symbol).toBe("S00");
    expect(renderSymbol.pays).toEqual([0, 2, 4]);
    expect(sprite.texture).toBe(Texture.WHITE);

    renderSymbol.requestState("appear");
    renderSymbol.update(0.2);
    expect(renderSymbol.getMainSprite()).toBe(sprite);
    expect(sprite.texture).toBe(Texture.WHITE);

    renderSymbol.update(1);
    renderSymbol.requestState("win");
    renderSymbol.update(0.2);
    expect(renderSymbol.getMainSprite()).toBe(sprite);
    expect(sprite.texture).toBe(Texture.WHITE);
  });

  it("reports once completion as an edge event and returns to default", () => {
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createDefaultSymbolAnimationResolver()
    });

    renderSymbol.requestState("appear");
    expect(renderSymbol.update(0.41).onceCompleted).toBe(false);
    const completed = renderSymbol.update(0.02);
    expect(completed.onceCompleted).toBe(true);
    expect(completed.stateChanged).toBe(true);
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal"
    });
    expect(renderSymbol.update(1).onceCompleted).toBe(false);
  });

  it("resolves spinBlur and disabled to normal while retaining requested state", () => {
    const spinBlurTexture = createDistinctTexture();
    const disabledTexture = createDistinctTexture();
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      stateTextures: {
        spinBlur: spinBlurTexture,
        disabled: disabledTexture
      },
      requiredStateTextures: ["spinBlur", "disabled"],
      animationResolver: createDefaultSymbolAnimationResolver()
    });

    renderSymbol.requestState("spinBlur");
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal"
    });
    expect(renderSymbol.sprite.texture).toBe(spinBlurTexture);

    renderSymbol.requestState("disabled");
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "disabled",
      resolvedState: "normal"
    });
    expect(renderSymbol.sprite.texture).toBe(disabledTexture);

    renderSymbol.requestState("normal");
    expect(renderSymbol.sprite.texture).toBe(Texture.WHITE);
  });

  it("restores the configured default state texture after once animations complete", () => {
    const spinBlurTexture = createDistinctTexture();
    const disabledTexture = createDistinctTexture();
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      stateTextures: {
        spinBlur: spinBlurTexture,
        disabled: disabledTexture
      },
      animationResolver: createDefaultSymbolAnimationResolver()
    });

    renderSymbol.setDefaultState("spinBlur");
    renderSymbol.requestState("appear");
    expect(renderSymbol.sprite.texture).toBe(Texture.WHITE);
    expect(renderSymbol.update(1).onceCompleted).toBe(true);
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal"
    });
    expect(renderSymbol.sprite.texture).toBe(spinBlurTexture);

    renderSymbol.setDefaultState("disabled");
    renderSymbol.requestState("win");
    expect(renderSymbol.sprite.texture).toBe(Texture.WHITE);
    expect(renderSymbol.update(1).onceCompleted).toBe(true);
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "disabled",
      resolvedState: "normal"
    });
    expect(renderSymbol.sprite.texture).toBe(disabledTexture);
  });

  it("allows custom resolver differences for the same state on different symbols", () => {
    const calls: string[] = [];
    const resolver: SymbolAnimationResolver = (context) => {
      calls.push(`${context.symbol}:${context.resolvedState}`);
      return new ManualSymbolAni({
        stateId: context.resolvedState,
        playback: context.state.playback,
        durationSeconds: 0.1
      });
    };
    const first = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: resolver
    });
    const second = new RenderSymbol({
      definition: { ...createDefinition(), code: 5, symbol: "S10" },
      texture: Texture.WHITE,
      animationResolver: resolver
    });

    first.requestState("win");
    second.requestState("win");

    expect(calls).toContain("S00:win");
    expect(calls).toContain("S10:win");
  });

  it("cleans appear scale, win overlay and pending state on reset", () => {
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createDefaultSymbolAnimationResolver()
    });

    renderSymbol.requestState("appear");
    renderSymbol.update(0.2);
    expect(renderSymbol.sprite.scale.x).toBeGreaterThan(1);
    renderSymbol.reset();
    expect(renderSymbol.sprite.scale.x).toBe(1);
    expect(renderSymbol.overlayLayer.children.length).toBe(0);
    expect(renderSymbol.getStateSnapshot().pendingState).toBeNull();

    renderSymbol.requestState("win");
    renderSymbol.update(0.2);
    expect(renderSymbol.overlayLayer.children.length).toBe(2);
    expect(renderSymbol.sprite.mask ?? null).toBeNull();
    expect(renderSymbol.overlayLayer.children[0]?.mask).toBe(renderSymbol.overlayLayer.children[1]);
    expect(renderSymbol.sprite.scale.x).toBeGreaterThan(1);
    expect(renderSymbol.overlayLayer.scale.x).toBeGreaterThan(1);
    renderSymbol.reset();
    expect(renderSymbol.sprite.scale.x).toBe(1);
    expect(renderSymbol.overlayLayer.scale.x).toBe(1);
    expect(renderSymbol.overlayLayer.children.length).toBe(0);
  });

  it("rejects resolver playback mismatches", () => {
    expect(
      () =>
        new RenderSymbol({
          definition: createDefinition(),
          texture: Texture.WHITE,
          animationResolver: (context) =>
            new ManualSymbolAni({
              stateId: context.resolvedState,
              playback: "loop",
              durationSeconds: 1
            })
        })
    ).toThrow(SymbolAnimationError);
  });
});
