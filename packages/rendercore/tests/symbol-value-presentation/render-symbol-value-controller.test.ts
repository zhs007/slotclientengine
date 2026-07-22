import { Assets, Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { RendercoreSpineSlotPlayer } from "../../src/spine/runtime-player.js";
import {
  createDefaultSymbolAnimationResolver,
  RenderSymbol,
} from "../../src/symbol/index.js";
import {
  createRenderSymbolValueController,
  type SymbolValuePresentationResource,
} from "../../src/symbol-value-presentation/index.js";

describe("render symbol value controller", () => {
  it("selects tiers, binds text to the configured slot and cleans up on value changes", async () => {
    const players: FakeSlotPlayer[] = [];
    const symbol = createSymbol((tier) => {
      const player = new FakeSlotPlayer();
      player.tierSkeleton = tier.spec.skeleton;
      players.push(player);
      return player;
    });

    symbol.init();
    symbol.setPresentationValue(5);
    expect(symbol.getPresentationValue()).toBe(5);
    expect(symbol.baseLayer.visible).toBe(true);
    await flushPromises();
    expect(players).toHaveLength(1);
    expect(players[0].tierSkeleton).toBe("./low.json");
    expect(players[0].plays).toEqual([{ animationName: "Loop", loop: true }]);
    expect(players[0].attached[0]).toMatchObject({ slot: "Num" });
    expect((players[0].attached[0]?.object as any).text).toBe("5");
    expect(symbol.overlayLayer.children).toEqual([players[0].view]);
    expect(symbol.baseLayer.visible).toBe(false);

    expect(symbol.requestLandingAppear()).toBe(true);
    expect(symbol.isLandingAppearActive()).toBe(true);
    expect(players[0].plays.at(-1)).toEqual({
      animationName: "Start",
      loop: false,
    });
    players[0].completeNextUpdate = true;
    symbol.update(0.1);
    expect(symbol.isLandingAppearActive()).toBe(false);
    expect(players[0].plays.at(-1)).toEqual({
      animationName: "Loop",
      loop: true,
    });

    symbol.requestState("win");
    expect(players[0].plays.at(-1)).toEqual({
      animationName: "Win",
      loop: false,
    });
    players[0].completeNextUpdate = true;
    symbol.update(0.1);
    expect(players[0].plays.at(-1)).toEqual({
      animationName: "Loop",
      loop: true,
    });
    symbol.requestState("remove");
    expect(players[0].plays.at(-1)).toEqual({
      animationName: "End",
      loop: false,
    });
    players[0].completeNextUpdate = true;
    symbol.update(0.1);
    const playCountBeforeDropdown = players[0].plays.length;
    symbol.requestState("dropdown");
    expect(players[0].plays.at(-1)).toEqual({
      animationName: "Loop",
      loop: true,
    });
    expect(players[0].plays).toHaveLength(playCountBeforeDropdown);
    symbol.returnToDefaultState();
    expect(symbol.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
    });
    expect(players[0].plays).toHaveLength(playCountBeforeDropdown);
    expect(players).toHaveLength(1);
    expect(players[0].attached).toHaveLength(1);
    symbol.reset();

    symbol.update(0.1);
    expect(players[0].updates).toEqual([0.1, 0.1, 0.1, 0.1]);
    symbol.setPresentationValue(25);
    expect(players[0].removed).toHaveLength(1);
    expect(players[0].destroyed).toBe(true);
    expect(symbol.baseLayer.visible).toBe(true);
    await flushPromises();
    expect(players[1].tierSkeleton).toBe("./high.json");
    expect((players[1].attached[0]?.object as any).text).toBe("25");

    symbol.setPresentationValue(null);
    expect(symbol.getPresentationValue()).toBeNull();
    expect(players[1].destroyed).toBe(true);
    symbol.resetForPoolRelease();
    symbol.destroy();
  });

  it("rejects invalid values and reports async player initialization failures", async () => {
    const error = new Error("tier init failed");
    const symbol = createSymbol(() => new FakeSlotPlayer(error));
    symbol.init();

    expect(() => symbol.setPresentationValue(0)).toThrow(
      /positive safe integer/,
    );
    symbol.setPresentationValue(1);
    await flushPromises();
    expect(() => symbol.update(0.01)).toThrow(error);
    symbol.destroy();
    expect(() => symbol.setPresentationValue(1)).toThrow(/destroyed/);
  });

  it("ignores a late initialization after the value has been cleared", async () => {
    let finish!: () => void;
    const player = new FakeSlotPlayer(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const symbol = createSymbol(() => player);
    symbol.init();
    symbol.setPresentationValue(1);
    symbol.setPresentationValue(null);
    finish();
    await flushPromises();

    expect(player.attached).toEqual([]);
    expect(player.destroyed).toBe(true);
    expect(symbol.overlayLayer.children).toEqual([]);
    symbol.destroy();
  });

  it("keeps a requested reel-state texture visible across late value-player initialization", async () => {
    const player = new FakeSlotPlayer();
    const symbol = createSymbol(() => player);
    symbol.init();
    symbol.setPresentationValue(1);
    symbol.requestState("spinBlur");
    expect(symbol.baseLayer.visible).toBe(false);
    expect(symbol.stateSprite.visible).toBe(true);

    await flushPromises();
    expect(symbol.baseLayer.visible).toBe(false);
    expect(symbol.stateSprite.visible).toBe(true);
    expect(player.view.visible).toBe(false);

    symbol.returnToDefaultState();
    expect(player.view.visible).toBe(true);
    expect(symbol.baseLayer.visible).toBe(false);
    expect(symbol.stateSprite.visible).toBe(false);

    symbol.requestState("spinBlur");
    expect(player.view.visible).toBe(false);
    expect(symbol.stateSprite.visible).toBe(true);
    symbol.destroy();
  });

  it("reports active Spine loop boundaries so a pending collect can start", async () => {
    const player = new FakeSlotPlayer();
    const symbol = createSymbol(() => player);
    symbol.init();
    symbol.setPresentationValue(1);
    await flushPromises();

    symbol.requestState("dropdown");
    symbol.requestState("collect");
    expect(symbol.getStateSnapshot()).toMatchObject({
      requestedState: "dropdown",
      resolvedState: "dropdown",
      pendingState: "collect",
    });
    player.completeNextUpdate = true;
    symbol.update(0.1);
    expect(symbol.getStateSnapshot()).toMatchObject({
      requestedState: "collect",
      resolvedState: "collect",
      pendingState: null,
    });
    expect(player.plays.at(-1)).toEqual({
      animationName: "Collect",
      loop: false,
    });
    symbol.destroy();
  });

  it("uses an exact value image and fails without a matching image", async () => {
    const loadTexture = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const players: FakeSlotPlayer[] = [];
    const resource = Object.freeze({
      ...createResource(),
      textImageUrls: Object.freeze({ 5: "/5.png" }),
      text: Object.freeze({
        type: "image" as const,
        slot: "Num",
        x: 2,
        y: -3,
        prefix: "./",
      }),
    });
    const symbol = createSymbol((tier) => {
      const player = new FakeSlotPlayer();
      player.tierSkeleton = tier.spec.skeleton;
      players.push(player);
      return player;
    }, resource);
    symbol.init();
    symbol.setPresentationValue(5);
    await flushPromises();

    expect(loadTexture).toHaveBeenCalledWith("/5.png");
    const image = players[0].attached[0]?.object;
    expect(image).toBeInstanceOf(Sprite);
    expect(image?.position).toMatchObject({ x: 2, y: -3 });

    symbol.reset();
    expect(symbol.overlayLayer.children).toEqual([players[0].view]);
    expect(symbol.requestLandingAppear()).toBe(true);
    expect(symbol.overlayLayer.children).toEqual([players[0].view]);
    expect(players[0].attached).toHaveLength(1);
    expect(players[0].attached[0]).toMatchObject({
      slot: "Num",
      object: image,
    });
    expect(players[0].removed).toEqual([]);
    players[0].completeNextUpdate = true;
    symbol.update(0.1);
    expect(symbol.overlayLayer.children).toEqual([players[0].view]);
    expect(players[0].attached).toHaveLength(1);
    expect(players[0].removed).toEqual([]);

    expect(() => symbol.setPresentationValue(25)).toThrow(
      /value 25 has no configured image resource/,
    );
    expect(symbol.getPresentationValue()).toBeNull();
    expect(players).toHaveLength(1);
    symbol.destroy();
    loadTexture.mockRestore();
  });

  it("uses the selected tier ImgNumber dependency, slot and glyph closure", async () => {
    const players: FakeSlotPlayer[] = [];
    const resource = createImageStringResource();
    const symbol = createSymbol(() => {
      const player = new FakeSlotPlayer();
      players.push(player);
      return player;
    }, resource);
    symbol.init();
    symbol.setPresentationValue(1);
    await flushPromises();
    expect(players[0].attached[0]).toMatchObject({
      slot: "LowNum",
      followSlotColor: false,
    });
    const lowDisplay = players[0].attached[0]!.object;
    expect(lowDisplay.children).toHaveLength(1);
    expect(lowDisplay.position).toMatchObject({ x: 2, y: 3 });
    expect(lowDisplay.scale).toMatchObject({ x: 0.5, y: 0.5 });
    expect(lowDisplay.pivot).toMatchObject({ x: 0.5, y: 0.5 });

    symbol.setPresentationValue(25);
    await flushPromises();
    expect(players[1].attached[0]).toMatchObject({
      slot: "HighNum",
      followSlotColor: true,
    });
    const highDisplay = players[1].attached[0]!.object;
    expect(highDisplay.children).toHaveLength(2);
    expect(highDisplay.position).toMatchObject({ x: -2, y: -3 });
    expect(highDisplay.scale).toMatchObject({ x: 2, y: 2 });
    expect(highDisplay.pivot).toMatchObject({ x: 2, y: 1 });
    expect(players[0].destroyed).toBe(true);

    expect(() => symbol.setPresentationValue(13)).toThrow(/缺少 glyph/);
    expect(symbol.getPresentationValue()).toBeNull();
    symbol.destroy();
  });

  it("keeps two ImgNumber occurrences independent while sharing resources", async () => {
    const resource = createImageStringResource();
    const players: FakeSlotPlayer[] = [];
    const create = () =>
      createSymbol(() => {
        const player = new FakeSlotPlayer();
        players.push(player);
        return player;
      }, resource);
    const first = create();
    const second = create();
    first.init();
    second.init();
    first.setPresentationValue(1);
    second.setPresentationValue(11);
    await flushPromises();
    expect(players[0].attached[0]?.object.children).toHaveLength(1);
    expect(players[1].attached[0]?.object.children).toHaveLength(2);
    expect(resource.imageStringTierBindings?.[0]?.resource).toBe(
      resource.imageStringTierBindings?.[1]?.resource,
    );
    first.destroy();
    second.destroy();
  });
});

function createSymbol(
  createPlayer: (
    tier: SymbolValuePresentationResource["tiers"][number],
  ) => RendercoreSpineSlotPlayer,
  resource: SymbolValuePresentationResource = createResource(),
): RenderSymbol {
  let symbol!: RenderSymbol;
  symbol = new RenderSymbol({
    definition: {
      code: 8,
      symbol: "GOLD",
      pays: [],
      defaultState: "normal",
      states: [
        { id: "normal", phase: "stable", playback: "static" },
        { id: "spinBlur", phase: "stable", playback: "static" },
        { id: "appear", phase: "once", playback: "once" },
        { id: "win", phase: "once", playback: "once" },
        { id: "remove", phase: "once", playback: "once" },
        { id: "collect", phase: "once", playback: "once" },
        { id: "dropdown", phase: "stable", playback: "loop" },
      ],
      equivalences: [{ from: "spinBlur", to: "normal" }],
    },
    texture: {
      kind: "transparent",
      width: 200,
      height: 200,
    },
    stateTextures: { spinBlur: Texture.WHITE },
    animationResolver: createDefaultSymbolAnimationResolver(),
    animationCapabilities: ["appear", "win", "remove", "collect", "dropdown"],
    landingAppearEnabled: true,
    valueControllerFactory: (root) =>
      createRenderSymbolValueController({
        root,
        resource,
        playerFactory: ({ tier }) => createPlayer(tier),
      }),
  });
  return symbol;
}

function createResource(): SymbolValuePresentationResource {
  const createTier = (skeleton: string, maxExclusive?: number) =>
    Object.freeze({
      ...(maxExclusive === undefined ? {} : { maxExclusive }),
      spec: Object.freeze({
        kind: "spine" as const,
        skeleton,
        atlas: "./Symbol.atlas",
        texture: "./Symbol.png",
        playback: Object.freeze({
          mode: "animation" as const,
          animationName: "Loop",
          loop: true,
        }),
      }),
      skeleton: {},
      atlasText: "Symbol.png\n",
      textureUrl: "/Symbol.png",
      atlasPage: "Symbol.png",
    });
  return Object.freeze({
    symbol: "GOLD",
    defaultValues: Object.freeze([1, 5, 25]),
    activeSpineAnimations: Object.freeze({
      appear: Object.freeze({
        mode: "animation" as const,
        animationName: "Start",
        loop: false,
      }),
      win: Object.freeze({
        mode: "animation" as const,
        animationName: "Win",
        loop: false,
      }),
      remove: Object.freeze({
        mode: "animation" as const,
        animationName: "End",
        loop: false,
      }),
      collect: Object.freeze({
        mode: "animation" as const,
        animationName: "Collect",
        loop: false,
      }),
      dropdown: Object.freeze({
        mode: "animation" as const,
        animationName: "Loop",
        loop: true,
      }),
    }),
    tiers: Object.freeze([
      createTier("./low.json", 10),
      createTier("./high.json"),
    ]),
    textImageUrls: Object.freeze({}),
    text: Object.freeze({
      type: "font",
      slot: "Num",
      x: 2,
      y: -3,
      fontFamily: "Arial",
      fontSize: 32,
      fontWeight: "900",
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 4,
    }),
  });
}

function createImageStringResource(): SymbolValuePresentationResource {
  const base = createResource();
  const digits = Object.freeze({
    manifest: Object.freeze({
      version: 1 as const,
      kind: "image-string" as const,
      id: "digits",
      metrics: Object.freeze({ lineHeight: 1, letterSpacing: 0 }),
      glyphs: Object.freeze({
        "1": Object.freeze({
          path: "assets/1.png",
          size: Object.freeze({ width: 1, height: 1 }),
          offset: Object.freeze({ x: 0, y: 0 }),
        }),
        "2": Object.freeze({
          path: "assets/2.png",
          size: Object.freeze({ width: 1, height: 1 }),
          offset: Object.freeze({ x: 0, y: 0 }),
        }),
        "5": Object.freeze({
          path: "assets/5.png",
          size: Object.freeze({ width: 1, height: 1 }),
          offset: Object.freeze({ x: 0, y: 0 }),
        }),
      }),
      fixedAdvanceGroups: Object.freeze([]),
    }),
    textures: Object.freeze({
      "assets/1.png": Texture.WHITE,
      "assets/2.png": Texture.WHITE,
      "assets/5.png": Texture.WHITE,
    }),
    destroyed: false,
    assertUsable: () => undefined,
    destroy: async () => undefined,
  });
  return Object.freeze({
    ...base,
    text: Object.freeze({
      type: "image-string" as const,
      tiers: Object.freeze([
        Object.freeze({
          resource: "./low/image-string.manifest.json",
          slot: "LowNum",
          anchor: Object.freeze({ x: 0.5, y: 0.5 }),
          transform: Object.freeze({ x: 2, y: 3, scale: 0.5 }),
          followSlotColor: false,
        }),
        Object.freeze({
          resource: "./high/image-string.manifest.json",
          slot: "HighNum",
          anchor: Object.freeze({ x: 1, y: 1 }),
          transform: Object.freeze({ x: -2, y: -3, scale: 2 }),
          followSlotColor: true,
        }),
      ]),
    }),
    imageStringTierBindings: Object.freeze([
      Object.freeze({
        resourcePath: "./low/image-string.manifest.json",
        resource: digits,
        slot: "LowNum",
        anchor: Object.freeze({ x: 0.5, y: 0.5 }),
        transform: Object.freeze({ x: 2, y: 3, scale: 0.5 }),
        followSlotColor: false,
      }),
      Object.freeze({
        resourcePath: "./high/image-string.manifest.json",
        resource: digits,
        slot: "HighNum",
        anchor: Object.freeze({ x: 1, y: 1 }),
        transform: Object.freeze({ x: -2, y: -3, scale: 2 }),
        followSlotColor: true,
      }),
    ]),
  });
}

class FakeSlotPlayer implements RendercoreSpineSlotPlayer {
  readonly view = new Container();
  readonly plays: Array<{ animationName: string; loop: boolean }> = [];
  readonly attached: Array<{
    slot: string;
    object: Container;
    followSlotColor?: boolean;
  }> = [];
  readonly removed: Container[] = [];
  readonly updates: number[] = [];
  tierSkeleton = "";
  destroyed = false;
  completeNextUpdate = false;
  #currentLoop = false;
  readonly #initResult: Error | Promise<void> | undefined;

  constructor(initResult?: Error | Promise<void>) {
    this.#initResult = initResult;
  }

  init(): Promise<void> | void {
    if (this.#initResult instanceof Error)
      return Promise.reject(this.#initResult);
    return this.#initResult;
  }

  play(options: { animationName: string; loop: boolean }): void {
    this.plays.push(options);
    this.#currentLoop = options.loop;
  }

  update(deltaSeconds: number): {
    completed: boolean;
    loopCompleted?: boolean;
    events: readonly [];
  } {
    this.updates.push(deltaSeconds);
    const completed = this.completeNextUpdate && !this.#currentLoop;
    const loopCompleted = this.completeNextUpdate && this.#currentLoop;
    this.completeNextUpdate = false;
    return {
      completed,
      ...(loopCompleted ? { loopCompleted: true } : {}),
      events: [],
    };
  }

  attachSlotObject(options: {
    slot: string;
    object: Container;
    followSlotColor?: boolean;
  }): void {
    this.attached.push(options);
  }

  removeSlotObject(object: Container): void {
    this.removed.push(object);
  }

  reset(): void {}

  destroy(): void {
    this.destroyed = true;
    this.view.parent?.removeChild(this.view);
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
