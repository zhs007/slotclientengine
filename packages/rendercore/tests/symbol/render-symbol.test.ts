import { Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createAppearSymbolAni,
  ManualSymbolAni,
  RenderSymbol,
  SymbolAnimationError,
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createSymbolDefinitionFromPreset,
  createWinSymbolAni,
} from "../../src/symbol/index.js";
import type { SymbolAnimationResolver } from "../../src/symbol/index.js";

const createDefinition = () =>
  createSymbolDefinitionFromPreset({
    code: 1,
    symbol: "S00",
    pays: [0, 2, 4],
    preset: createDefaultSymbolStatePreset(),
  });

const createTestDefaultSymbolAnimationResolver = () =>
  ((context) => {
    if (context.resolvedState === "appear") {
      return createAppearSymbolAni(context, { durationSeconds: 0.42 });
    }
    if (context.resolvedState === "win") {
      return createWinSymbolAni(context, { durationSeconds: 0.58 });
    }
    return createDefaultSymbolAnimationResolver()(context);
  }) satisfies SymbolAnimationResolver;

const createDistinctTexture = () =>
  new Texture({ source: Texture.WHITE.source });

const createSizedTexture = (width: number, height: number) => {
  const texture = createDistinctTexture();
  Object.defineProperty(texture, "width", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(texture, "height", {
    configurable: true,
    value: height,
  });
  return texture;
};

describe("RenderSymbol", () => {
  it("keeps paytable data and reuses one main sprite texture across states", () => {
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    const sprite = renderSymbol.getMainSprite();
    expect(renderSymbol.code).toBe(1);
    expect(renderSymbol.symbol).toBe("S00");
    expect(renderSymbol.pays).toEqual([0, 2, 4]);
    expect(sprite.texture).toBe(Texture.WHITE);
    expect(renderSymbol.children).toEqual([
      renderSymbol.underlayLayer,
      renderSymbol.baseLayer,
      renderSymbol.stateSprite,
      renderSymbol.overlayLayer,
    ]);

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
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    renderSymbol.requestState("appear");
    expect(renderSymbol.update(0.41).onceCompleted).toBe(false);
    const completed = renderSymbol.update(0.02);
    expect(completed.onceCompleted).toBe(true);
    expect(completed.stateChanged).toBe(true);
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
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
        disabled: disabledTexture,
      },
      requiredStateTextures: ["spinBlur", "disabled"],
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    renderSymbol.requestState("spinBlur");
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal",
    });
    expect(renderSymbol.sprite.texture).toBe(spinBlurTexture);

    renderSymbol.requestState("disabled");
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "disabled",
      resolvedState: "normal",
    });
    expect(renderSymbol.sprite.texture).toBe(disabledTexture);

    renderSymbol.requestState("normal");
    expect(renderSymbol.sprite.texture).toBe(Texture.WHITE);
  });

  it("creates ordered layered sprites and swaps to stateSprite for generated states", () => {
    const bottom = createSizedTexture(24, 24);
    const top = createSizedTexture(24, 24);
    const spinBlurTexture = createSizedTexture(24, 24);
    const renderSymbol = new RenderSymbol({
      definition: { ...createDefinition(), symbol: "SC" },
      texture: {
        kind: "layered",
        layers: [
          { index: 0, texture: bottom },
          { index: 1, texture: top },
        ],
      },
      stateTextures: {
        spinBlur: spinBlurTexture,
      },
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    expect(renderSymbol.texture).toBe(bottom);
    expect(renderSymbol.getBaseLayer().children).toEqual([
      renderSymbol.getLayerSprites()[0].sprite,
      renderSymbol.getLayerSprites()[1].sprite,
    ]);
    expect(
      renderSymbol.getLayerSprites().map((layer) => layer.texture),
    ).toEqual([bottom, top]);

    renderSymbol.requestState("spinBlur");
    expect(renderSymbol.getBaseLayer().visible).toBe(false);
    expect(renderSymbol.getStateSprite().visible).toBe(true);
    expect(renderSymbol.getStateSprite().texture).toBe(spinBlurTexture);

    renderSymbol.requestState("normal");
    expect(renderSymbol.getBaseLayer().visible).toBe(true);
    expect(renderSymbol.getStateSprite().visible).toBe(false);
    expect(renderSymbol.getLayerSprites()[0].sprite.texture).toBe(bottom);
    expect(renderSymbol.getLayerSprites()[1].sprite.texture).toBe(top);
  });

  it("creates transparent symbols with stable dimensions and no visible base pixels", () => {
    const renderSymbol = new RenderSymbol({
      definition: { ...createDefinition(), symbol: "normal" },
      texture: { kind: "transparent", width: 172, height: 158 },
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    expect(renderSymbol.texture).toBe(Texture.EMPTY);
    expect(renderSymbol.normalSource).toEqual({
      kind: "transparent",
      width: 172,
      height: 158,
    });
    expect(renderSymbol.sprite.alpha).toBe(0);
    expect(renderSymbol.sprite.width).toBe(172);
    expect(renderSymbol.sprite.height).toBe(158);

    renderSymbol.requestState("win");
    renderSymbol.update(0.3);
    renderSymbol.update(1);

    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
    });
    expect(renderSymbol.sprite.alpha).toBe(0);
    expect(renderSymbol.sprite.width).toBe(172);
    expect(renderSymbol.sprite.height).toBe(158);
  });

  it("resets all layered sprite transforms and masks", () => {
    const staticTexture = createSizedTexture(24, 24);
    const keyframeTexture = createSizedTexture(24, 24);
    const renderSymbol = new RenderSymbol({
      definition: { ...createDefinition(), symbol: "SC" },
      texture: {
        kind: "layered",
        layers: [
          { index: 0, texture: createSizedTexture(24, 24) },
          {
            index: 1,
            texture: staticTexture,
            keyframes: [staticTexture, keyframeTexture],
          },
        ],
      },
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });
    const [, topLayer] = renderSymbol.getLayerSprites();
    renderSymbol.underlayLayer.addChild(new Sprite(Texture.WHITE));
    topLayer.sprite.texture = keyframeTexture;
    topLayer.sprite.position.set(4, 5);
    topLayer.sprite.scale.set(2);
    topLayer.sprite.rotation = 0.4;
    topLayer.sprite.alpha = 0.2;
    topLayer.sprite.mask = renderSymbol.overlayLayer;

    renderSymbol.reset();

    expect(renderSymbol.underlayLayer.children.length).toBe(0);
    expect(topLayer.keyframes).toEqual([staticTexture, keyframeTexture]);
    expect(topLayer.sprite.texture).toBe(staticTexture);
    expect(topLayer.sprite.position.x).toBe(0);
    expect(topLayer.sprite.position.y).toBe(0);
    expect(topLayer.sprite.scale.x).toBe(1);
    expect(topLayer.sprite.rotation).toBe(0);
    expect(topLayer.sprite.alpha).toBe(1);
    expect(topLayer.sprite.mask ?? null).toBeNull();
  });

  it("restores the configured default state texture after once animations complete", () => {
    const spinBlurTexture = createDistinctTexture();
    const disabledTexture = createDistinctTexture();
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      stateTextures: {
        spinBlur: spinBlurTexture,
        disabled: disabledTexture,
      },
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    renderSymbol.setDefaultState("spinBlur");
    renderSymbol.requestState("appear");
    expect(renderSymbol.sprite.texture).toBe(Texture.WHITE);
    expect(renderSymbol.update(1).onceCompleted).toBe(true);
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal",
    });
    expect(renderSymbol.sprite.texture).toBe(spinBlurTexture);

    renderSymbol.setDefaultState("disabled");
    renderSymbol.requestState("win");
    expect(renderSymbol.sprite.texture).toBe(Texture.WHITE);
    expect(renderSymbol.update(1).onceCompleted).toBe(true);
    expect(renderSymbol.getStateSnapshot()).toMatchObject({
      requestedState: "disabled",
      resolvedState: "normal",
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
        durationSeconds: 0.1,
      });
    };
    const first = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: resolver,
    });
    const second = new RenderSymbol({
      definition: { ...createDefinition(), code: 5, symbol: "S10" },
      texture: Texture.WHITE,
      animationResolver: resolver,
    });

    first.requestState("win");
    second.requestState("win");

    expect(calls).toContain("S00:win");
    expect(calls).toContain("S10:win");
  });

  it("destroys old animation instances when state changes and symbol is destroyed", () => {
    const destroyed: string[] = [];
    const resolver: SymbolAnimationResolver = (context) =>
      new ManualSymbolAni({
        stateId: context.resolvedState,
        playback: context.state.playback,
        durationSeconds: 0.1,
        onReset: () => {
          return undefined;
        },
      }) as ManualSymbolAni & { destroy(): void };
    const trackedResolver: SymbolAnimationResolver = (context) => {
      const ani = resolver(context) as ManualSymbolAni & { destroy(): void };
      ani.destroy = () => destroyed.push(context.resolvedState);
      return ani;
    };
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: trackedResolver,
    });

    renderSymbol.requestState("win");
    expect(destroyed).toEqual(["normal"]);
    renderSymbol.update(1);
    expect(destroyed).toEqual(["normal", "win"]);

    renderSymbol.destroy();

    expect(destroyed).toEqual(["normal", "win", "normal"]);
  });

  it("cleans appear scale, win overlay and pending state on reset", () => {
    const renderSymbol = new RenderSymbol({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
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
    expect(renderSymbol.overlayLayer.children[0]?.mask).toBe(
      renderSymbol.overlayLayer.children[1],
    );
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
              durationSeconds: 1,
            }),
        }),
    ).toThrow(SymbolAnimationError);
  });
});
