import { Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createAppearSymbolAni,
  ManualSymbolAni,
  SymbolPlayer,
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
    if (context.resolvedState === "win" || context.resolvedState === "remove") {
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

describe("SymbolPlayer", () => {
  it("reuses snapshot and update results while the state is unchanged", () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    expect(symbolPlayer.getStateSnapshot()).toBe(
      symbolPlayer.getStateSnapshot(),
    );
    expect(symbolPlayer.update(0)).toBe(symbolPlayer.update(0));
  });

  it("can enter landing appear immediately from an active stable loop", () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: (context) =>
        new ManualSymbolAni({
          stateId: context.resolvedState,
          playback: context.state.playback,
          durationSeconds: 1,
        }),
      landingAppearEnabled: true,
    });
    symbolPlayer.requestState("dropdown", "immediate");

    expect(symbolPlayer.requestLandingAppear("immediate")).toBe(true);

    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "appear",
      resolvedState: "appear",
      pendingState: null,
    });
  });

  it("awaits entered and real once completion while update remains the time source", async () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    await symbolPlayer.playState("spinBlur", {
      transitionMode: "immediate",
      completion: "entered",
    });
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal",
    });

    let completed = false;
    const playback = symbolPlayer
      .playState("appear", {
        transitionMode: "immediate",
        completion: "once-complete",
      })
      .then(() => {
        completed = true;
      });
    symbolPlayer.update(0.41);
    await Promise.resolve();
    expect(completed).toBe(false);
    symbolPlayer.update(0.02);
    await playback;
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
    });
  });

  it("does not count an outgoing loop as the requested target loop", async () => {
    const preset = createDefaultSymbolStatePreset();
    const symbolPlayer = new SymbolPlayer({
      definition: createSymbolDefinitionFromPreset({
        code: 1,
        symbol: "S00",
        pays: [0, 2, 4],
        preset: {
          ...preset,
          states: [
            ...preset.states,
            { id: "loop2", phase: "stable", playback: "loop" },
          ],
        },
      }),
      texture: Texture.WHITE,
      animationResolver: (context) =>
        new ManualSymbolAni({
          stateId: context.resolvedState,
          playback: context.state.playback,
          durationSeconds: 0.5,
        }),
    });
    symbolPlayer.requestState("dropdown", "immediate");
    let completed = false;
    const playback = symbolPlayer
      .playState("loop2", {
        transitionMode: "boundary",
        completion: "next-loop-complete",
      })
      .then(() => {
        completed = true;
      });

    symbolPlayer.update(0.5);
    await Promise.resolve();
    expect(symbolPlayer.getStateSnapshot().requestedState).toBe("loop2");
    expect(completed).toBe(false);

    symbolPlayer.update(0.5);
    await playback;
    expect(completed).toBe(true);
  });

  it("rejects incompatible completion modes before changing state", () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    expect(() =>
      symbolPlayer.playState("appear", {
        transitionMode: "immediate",
        completion: "next-loop-complete",
      }),
    ).toThrow(/expected "loop"/);
    expect(symbolPlayer.getStateSnapshot().requestedState).toBe("normal");
  });

  it("rejects pending playback on abort, reset, pool release and destroy", async () => {
    const createSymbol = () =>
      new SymbolPlayer({
        definition: createDefinition(),
        texture: Texture.WHITE,
        animationResolver: createTestDefaultSymbolAnimationResolver(),
      });

    const aborted = createSymbol();
    const controller = new AbortController();
    const abortPlayback = aborted.playState("appear", {
      transitionMode: "immediate",
      completion: "once-complete",
      signal: controller.signal,
    });
    const abortAssertion = expect(abortPlayback).rejects.toThrow("cancelled");
    controller.abort(new Error("cancelled"));
    await abortAssertion;

    const reset = createSymbol();
    const resetPlayback = reset.playState("appear", {
      transitionMode: "immediate",
      completion: "once-complete",
    });
    const resetAssertion = expect(resetPlayback).rejects.toThrow(/reset/);
    reset.reset();
    await resetAssertion;

    const released = createSymbol();
    const releasePlayback = released.playState("appear", {
      transitionMode: "immediate",
      completion: "once-complete",
    });
    const releaseAssertion =
      expect(releasePlayback).rejects.toThrow(/pool release/);
    released.resetForPoolRelease();
    await releaseAssertion;

    const destroyed = createSymbol();
    const destroyPlayback = destroyed.playState("appear", {
      transitionMode: "immediate",
      completion: "once-complete",
    });
    const destroyAssertion = expect(destroyPlayback).rejects.toThrow(/destroy/);
    destroyed.destroy();
    await destroyAssertion;
  });

  it("owns presentation values without a visual value controller and clears them on pool release", () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    expect(symbolPlayer.getPresentationValue()).toBeNull();
    symbolPlayer.setPresentationValue(1);
    expect(symbolPlayer.getPresentationValue()).toBe(1);

    symbolPlayer.reset();
    expect(symbolPlayer.getPresentationValue()).toBe(1);

    symbolPlayer.resetForPoolRelease();
    expect(symbolPlayer.getPresentationValue()).toBeNull();
    expect(() => symbolPlayer.setPresentationValue(0)).toThrow(
      /positive safe integer or null/,
    );
  });

  it("keeps an equivalent live animation timeline across semantic state changes", () => {
    let resets = 0;
    let destroys = 0;
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: (context) => ({
        stateId: context.resolvedState,
        playback: context.state.playback,
        continuityKey:
          context.resolvedState === "normal" ||
          context.resolvedState === "dropdown"
            ? "same-loop"
            : context.resolvedState,
        reset: () => {
          resets += 1;
        },
        update: () => ({ loopCompleted: false, onceCompleted: false }),
        destroy: () => {
          destroys += 1;
        },
      }),
    });

    expect(resets).toBe(1);
    symbolPlayer.requestState("dropdown");

    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "dropdown",
      resolvedState: "dropdown",
    });
    expect(resets).toBe(1);
    expect(destroys).toBe(1);
    symbolPlayer.returnToDefaultState();
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
    });
    expect(resets).toBe(1);
    expect(destroys).toBe(2);
    symbolPlayer.destroy();
    expect(destroys).toBe(3);
  });

  it("synchronizes image-string state before adopting an equivalent live animation", () => {
    let synchronizedState = "";
    let stateObservedByContinuation = "";
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: (context) => ({
        stateId: context.resolvedState,
        playback: context.state.playback,
        continuityKey:
          context.resolvedState === "normal" ||
          context.resolvedState === "dropdown"
            ? "same-spine-loop"
            : context.resolvedState,
        reset: () => undefined,
        update: () => ({ loopCompleted: false, onceCompleted: false }),
        adoptContinuation: () => {
          stateObservedByContinuation = synchronizedState;
        },
      }),
      imageStringControllerFactory: () => ({
        getNodeNames: () => Object.freeze([]),
        setText: () => undefined,
        getText: () => "",
        cloneText: () => {
          throw new Error("not used");
        },
        getTextView: () => {
          throw new Error("not used");
        },
        syncState: (state) => {
          synchronizedState = state;
        },
        resetForPoolRelease: () => undefined,
        destroy: () => undefined,
      }),
    });

    expect(synchronizedState).toBe("normal");
    symbolPlayer.requestState("dropdown");

    expect(stateObservedByContinuation).toBe("dropdown");
    expect(synchronizedState).toBe("dropdown");
    symbolPlayer.destroy();
  });

  it("keeps paytable data and reuses one main sprite texture across states", () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    const sprite = symbolPlayer.getMainSprite();
    expect(symbolPlayer.code).toBe(1);
    expect(symbolPlayer.symbol).toBe("S00");
    expect(symbolPlayer.pays).toEqual([0, 2, 4]);
    expect(sprite.texture).toBe(Texture.WHITE);
    expect(symbolPlayer.children).toEqual([
      symbolPlayer.underlayLayer,
      symbolPlayer.gameUnderlayLayer,
      symbolPlayer.baseLayer,
      symbolPlayer.stateSprite,
      symbolPlayer.overlayLayer,
      symbolPlayer.imageStringOverlayLayer,
      symbolPlayer.gameOverlayLayer,
    ]);

    symbolPlayer.requestState("appear");
    symbolPlayer.update(0.2);
    expect(symbolPlayer.getMainSprite()).toBe(sprite);
    expect(sprite.texture).toBe(Texture.WHITE);

    symbolPlayer.update(1);
    symbolPlayer.requestState("win");
    symbolPlayer.update(0.2);
    expect(symbolPlayer.getMainSprite()).toBe(sprite);
    expect(sprite.texture).toBe(Texture.WHITE);
  });

  it("reports once completion as an edge event and returns to default", () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    symbolPlayer.requestState("appear");
    expect(symbolPlayer.update(0.41).onceCompleted).toBe(false);
    const completed = symbolPlayer.update(0.02);
    expect(completed.onceCompleted).toBe(true);
    expect(completed.stateChanged).toBe(true);
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
    });
    expect(symbolPlayer.update(1).onceCompleted).toBe(false);
  });

  it("holds terminal completion and can replay the same terminal state", async () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });
    let completionCount = 0;
    const play = () =>
      symbolPlayer.playTerminalState(
        "remove",
        { transitionMode: "immediate", completion: "once-complete" },
        () => {
          completionCount += 1;
        },
      );

    const first = play();
    symbolPlayer.update(0.59);
    await first;
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "remove",
      resolvedState: "remove",
    });

    const replay = play();
    expect(symbolPlayer.update(0.57).onceCompleted).toBe(false);
    expect(symbolPlayer.update(0.02).onceCompleted).toBe(true);
    await replay;
    expect(completionCount).toBe(2);
  });

  it("resolves spinBlur and disabled to normal while retaining requested state", () => {
    const spinBlurTexture = createDistinctTexture();
    const disabledTexture = createDistinctTexture();
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      stateTextures: {
        spinBlur: spinBlurTexture,
        disabled: disabledTexture,
      },
      requiredStateTextures: ["spinBlur", "disabled"],
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    symbolPlayer.requestState("spinBlur");
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal",
    });
    expect(symbolPlayer.sprite.texture).toBe(spinBlurTexture);

    symbolPlayer.requestState("disabled");
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "disabled",
      resolvedState: "normal",
    });
    expect(symbolPlayer.sprite.texture).toBe(disabledTexture);

    symbolPlayer.requestState("normal");
    expect(symbolPlayer.sprite.texture).toBe(Texture.WHITE);
  });

  it("creates ordered layered sprites and swaps to stateSprite for generated states", () => {
    const bottom = createSizedTexture(24, 24);
    const top = createSizedTexture(24, 24);
    const spinBlurTexture = createSizedTexture(24, 24);
    const symbolPlayer = new SymbolPlayer({
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

    expect(symbolPlayer.texture).toBe(bottom);
    expect(symbolPlayer.getBaseLayer().children).toEqual([
      symbolPlayer.getLayerSprites()[0].sprite,
      symbolPlayer.getLayerSprites()[1].sprite,
    ]);
    expect(
      symbolPlayer.getLayerSprites().map((layer) => layer.texture),
    ).toEqual([bottom, top]);

    symbolPlayer.requestState("spinBlur");
    expect(symbolPlayer.getBaseLayer().visible).toBe(false);
    expect(symbolPlayer.getStateSprite().visible).toBe(true);
    expect(symbolPlayer.getStateSprite().texture).toBe(spinBlurTexture);

    symbolPlayer.requestState("normal");
    expect(symbolPlayer.getBaseLayer().visible).toBe(true);
    expect(symbolPlayer.getStateSprite().visible).toBe(false);
    expect(symbolPlayer.getLayerSprites()[0].sprite.texture).toBe(bottom);
    expect(symbolPlayer.getLayerSprites()[1].sprite.texture).toBe(top);
  });

  it("creates transparent symbols with stable dimensions and no visible base pixels", () => {
    const symbolPlayer = new SymbolPlayer({
      definition: { ...createDefinition(), symbol: "normal" },
      texture: { kind: "transparent", width: 172, height: 158 },
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    expect(symbolPlayer.texture).toBe(Texture.EMPTY);
    expect(symbolPlayer.normalSource).toEqual({
      kind: "transparent",
      width: 172,
      height: 158,
    });
    expect(symbolPlayer.sprite.alpha).toBe(0);
    expect(symbolPlayer.sprite.width).toBe(172);
    expect(symbolPlayer.sprite.height).toBe(158);

    symbolPlayer.requestState("win");
    symbolPlayer.update(0.3);
    symbolPlayer.update(1);

    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
    });
    expect(symbolPlayer.sprite.alpha).toBe(0);
    expect(symbolPlayer.sprite.width).toBe(172);
    expect(symbolPlayer.sprite.height).toBe(158);
  });

  it("resets all layered sprite transforms and masks", () => {
    const staticTexture = createSizedTexture(24, 24);
    const keyframeTexture = createSizedTexture(24, 24);
    const symbolPlayer = new SymbolPlayer({
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
    const [, topLayer] = symbolPlayer.getLayerSprites();
    symbolPlayer.underlayLayer.addChild(new Sprite(Texture.WHITE));
    topLayer.sprite.texture = keyframeTexture;
    topLayer.sprite.position.set(4, 5);
    topLayer.sprite.scale.set(2);
    topLayer.sprite.rotation = 0.4;
    topLayer.sprite.alpha = 0.2;
    topLayer.sprite.mask = symbolPlayer.overlayLayer;

    symbolPlayer.reset();

    expect(symbolPlayer.underlayLayer.children.length).toBe(0);
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
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      stateTextures: {
        spinBlur: spinBlurTexture,
        disabled: disabledTexture,
      },
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    symbolPlayer.setDefaultState("spinBlur");
    symbolPlayer.requestState("appear");
    expect(symbolPlayer.sprite.texture).toBe(Texture.WHITE);
    expect(symbolPlayer.update(1).onceCompleted).toBe(true);
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal",
    });
    expect(symbolPlayer.sprite.texture).toBe(spinBlurTexture);

    symbolPlayer.setDefaultState("disabled");
    symbolPlayer.requestState("win");
    expect(symbolPlayer.sprite.texture).toBe(Texture.WHITE);
    expect(symbolPlayer.update(1).onceCompleted).toBe(true);
    expect(symbolPlayer.getStateSnapshot()).toMatchObject({
      requestedState: "disabled",
      resolvedState: "normal",
    });
    expect(symbolPlayer.sprite.texture).toBe(disabledTexture);
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
    const first = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: resolver,
    });
    const second = new SymbolPlayer({
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
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: trackedResolver,
    });

    symbolPlayer.requestState("win");
    expect(destroyed).toEqual(["normal"]);
    symbolPlayer.update(1);
    expect(destroyed).toEqual(["normal", "win"]);

    symbolPlayer.destroy();

    expect(destroyed).toEqual(["normal", "win", "normal"]);
  });

  it("cleans appear scale, win overlay and pending state on reset", () => {
    const symbolPlayer = new SymbolPlayer({
      definition: createDefinition(),
      texture: Texture.WHITE,
      animationResolver: createTestDefaultSymbolAnimationResolver(),
    });

    symbolPlayer.requestState("appear");
    symbolPlayer.update(0.2);
    expect(symbolPlayer.sprite.scale.x).toBeGreaterThan(1);
    symbolPlayer.reset();
    expect(symbolPlayer.sprite.scale.x).toBe(1);
    expect(symbolPlayer.overlayLayer.children.length).toBe(0);
    expect(symbolPlayer.getStateSnapshot().pendingState).toBeNull();

    symbolPlayer.requestState("win");
    symbolPlayer.update(0.2);
    expect(symbolPlayer.overlayLayer.children.length).toBe(2);
    expect(symbolPlayer.sprite.mask ?? null).toBeNull();
    expect(symbolPlayer.overlayLayer.children[0]?.mask).toBe(
      symbolPlayer.overlayLayer.children[1],
    );
    expect(symbolPlayer.sprite.scale.x).toBeGreaterThan(1);
    expect(symbolPlayer.overlayLayer.scale.x).toBeGreaterThan(1);
    symbolPlayer.reset();
    expect(symbolPlayer.sprite.scale.x).toBe(1);
    expect(symbolPlayer.overlayLayer.scale.x).toBe(1);
    expect(symbolPlayer.overlayLayer.children.length).toBe(0);
  });

  it("rejects resolver playback mismatches", () => {
    expect(
      () =>
        new SymbolPlayer({
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
