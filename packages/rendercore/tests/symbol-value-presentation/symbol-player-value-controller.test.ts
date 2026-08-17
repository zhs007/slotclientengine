import { Assets, Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { RendercoreSpineSlotPlayer } from "../../src/spine/runtime-player.js";
import {
  createDefaultSymbolAnimationResolver,
  SymbolPlayer,
} from "../../src/symbol/index.js";
import { createSymbolHandle } from "../../src/symbol/symbol-handle.js";
import {
  createSymbolPlayerValueController,
  type SymbolValuePresentationResource,
} from "../../src/symbol-value-presentation/index.js";
import { SymbolImageStringController } from "../../src/symbol-image-string/index.js";
import {
  createContainerRenderAnchor,
  resolveRenderAnchor,
} from "../../src/presentation/render-anchor.js";
import { getRenderObjectAdapter } from "../../src/presentation/render-object.js";

describe("render symbol value controller", () => {
  it("atomically formats one value into multiple named ImgNumber nodes", () => {
    const primaryResource = createNamedImageStringResource();
    const primaryManifest = Object.freeze({
      ...primaryResource.manifest,
      glyphs: Object.freeze({
        ...primaryResource.manifest.glyphs,
        "5": Object.freeze({
          path: "assets/5.png",
          size: Object.freeze({ width: 1, height: 1 }),
          offset: Object.freeze({ x: 0, y: 0 }),
        }),
      }),
    });
    const primary = Object.freeze({
      ...primaryResource,
      manifest: Object.freeze(primaryManifest),
      textures: Object.freeze({
        ...primaryResource.textures,
        "assets/5.png": Texture.WHITE,
      }),
    });
    const secondary = createNamedImageStringResource();
    const calls: number[] = [];
    const symbol = createSymbol(
      () => new FakeSlotPlayer(),
      createResource(),
      (root) =>
        new SymbolImageStringController({
          root,
          nodes: [
            createNamedNode("primary", primary),
            createNamedNode("secondary", secondary),
          ],
        }),
      {
        primary: (value) => String(value),
        secondary: (value) => {
          calls.push(value);
          return String(value);
        },
      },
    );
    symbol.init();

    symbol.validatePresentationValue(1);
    expect(calls).toEqual([1]);
    symbol.setPresentationValue(1);
    expect(symbol.getPresentationValue()).toBe(1);
    expect(symbol.getImageStringText("primary")).toBe("1");
    expect(symbol.getImageStringText("secondary")).toBe("1");
    expect(calls).toEqual([1]);
    symbol.requestState("spinBlur", "immediate");
    expect(symbol.getImageStringText("primary")).toBe("1");
    expect(symbol.getImageStringText("secondary")).toBe("1");
    symbol.returnToDefaultState();
    expect(calls).toEqual([1]);
    symbol.setPresentationValue(1);
    expect(calls).toEqual([1]);

    expect(() => symbol.setPresentationValue(5)).toThrow(/缺少 glyph/);
    expect(symbol.getPresentationValue()).toBe(1);
    expect(symbol.getImageStringText("primary")).toBe("1");
    expect(symbol.getImageStringText("secondary")).toBe("1");

    symbol.setImageStringText("primary", "5");
    symbol.setPresentationValue(1);
    expect(symbol.getImageStringText("primary")).toBe("1");
    expect(calls).toEqual([1, 5, 1]);

    symbol.setPresentationValue(null);
    expect(symbol.getPresentationValue()).toBeNull();
    expect(symbol.getImageStringText("primary")).toBe("");
    expect(symbol.getImageStringText("secondary")).toBe("");
    expect(calls).toEqual([1, 5, 1]);
    symbol.destroy();
  });

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
    expect(symbol.getPresentationReadiness()).toEqual({
      status: "pending",
      error: null,
    });
    expect(symbol.baseLayer.visible).toBe(true);
    await flushPromises();
    expect(symbol.getPresentationReadiness()).toEqual({
      status: "ready",
      error: null,
    });
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
    expect(players[0].destroyed).toBe(false);
    expect(symbol.baseLayer.visible).toBe(true);
    await flushPromises();
    expect(players[1].tierSkeleton).toBe("./high.json");
    expect((players[1].attached[0]?.object as any).text).toBe("25");

    symbol.setPresentationValue(null);
    expect(symbol.getPresentationValue()).toBeNull();
    expect(players[1].destroyed).toBe(false);
    symbol.resetForPoolRelease();
    symbol.destroy();
    expect(players.every((player) => player.destroyed)).toBe(true);
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
    expect(symbol.getPresentationReadiness()).toEqual({
      status: "failed",
      error,
    });
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
    expect(player.destroyed).toBe(false);
    expect(symbol.overlayLayer.children).toEqual([]);
    symbol.destroy();
    expect(player.destroyed).toBe(true);
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

  it("does not let late value-player init steal a direct ImgNumber overlay", async () => {
    let finish!: () => void;
    const player = new FakeSlotPlayer(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const imageString = createNamedImageStringResource();
    const symbol = createSymbol(
      () => player,
      createResource(),
      (root) =>
        new SymbolImageStringController({
          root,
          nodes: [
            {
              spec: {
                name: "coin-value",
                resource: "./digits.image-string.manifest.json",
                spineSlot: "Num",
                targets: [{ state: "spinBlur" }, { state: "disabled" }],
                initialText: "1",
                anchor: { x: 0.5, y: 0.5 },
                transform: { x: 0, y: 0, scale: 1 },
                followSlotColor: true,
              },
              spineStates: new Set([
                "normal",
                "appear",
                "win",
                "remove",
                "collect",
                "dropdown",
              ]),
              resource: imageString,
            },
          ],
        }),
    );
    symbol.init();
    symbol.setPresentationValue(1);
    symbol.requestState("spinBlur");
    const display = symbol.imageStringOverlayLayer.children[0]!;
    expect(display.visible).toBe(true);
    let usable = true;
    const render = createFacade(symbol, () => usable);
    render.setText("coin-value", "1");
    const textPart = render.getPart({ kind: "text", name: "coin-value" });
    const textClone = textPart.clone();
    expect(getRenderObjectAdapter(textClone).view.children).toHaveLength(1);
    expect(() => textPart.destroy()).toThrow(/Borrowed RenderObject/);
    textClone.destroy();
    expect(() =>
      render.getPart({ kind: "text", name: "missing" }).getAnchor(),
    ).toThrow(/no image-string node named "missing"/);
    expect(() => render.getPart({ kind: "unknown" } as never)).toThrow(
      /Unknown SymbolHandle part kind/,
    );
    usable = false;
    expect(() => textPart.clone()).toThrow(/Test SymbolHandle is stale/);

    finish();
    await flushPromises();
    expect(symbol.imageStringOverlayLayer.children).toEqual([display]);
    expect(player.attached.some(({ object }) => object === display)).toBe(
      false,
    );

    symbol.requestState("disabled");
    expect(symbol.imageStringOverlayLayer.children).toEqual([display]);
    symbol.returnToDefaultState();
    expect(player.attached.some(({ object }) => object === display)).toBe(true);
    expect(symbol.imageStringOverlayLayer.children).toEqual([]);
    symbol.destroy();
  });

  it("moves one value ImgNumber display between the tier slot and spinBlur overlay", async () => {
    const player = new FakeSlotPlayer();
    const symbol = createSymbol(
      () => player,
      createImageStringResource(false, true),
    );
    symbol.init();
    symbol.setPresentationValue(1);
    await flushPromises();
    const displayRoot = player.attached[0]!.object;
    expect((displayRoot.children[0]!.children[0] as Sprite).texture).toBe(
      Texture.WHITE,
    );

    symbol.requestState("spinBlur");
    expect(player.removed).toEqual([displayRoot]);
    expect(symbol.imageStringOverlayLayer.children).toEqual([displayRoot]);
    expect((displayRoot.children[0]!.children[0] as Sprite).texture).toBe(
      Texture.EMPTY,
    );

    symbol.returnToDefaultState();
    expect(symbol.imageStringOverlayLayer.children).toEqual([]);
    expect(player.attached.at(-1)?.object).toBe(displayRoot);
    expect((displayRoot.children[0]!.children[0] as Sprite).texture).toBe(
      Texture.WHITE,
    );
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
    expect(symbol.getPresentationValue()).toBe(5);
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
    const render = createFacade(symbol);
    const valuePart = render.getPart({ kind: "value" });
    const target = new Container();
    symbol.addChild(target);
    const valueAnchor = valuePart.getAnchor();
    const lowAnchor = resolveRenderAnchor(valueAnchor, target);
    expect(players[0].attached[0]).toMatchObject({
      slot: "LowNum",
      followSlotColor: false,
    });
    const lowDisplay = players[0].attached[0]!.object;
    expect(lowDisplay.children).toHaveLength(1);
    const lowContent = lowDisplay.children[0]!;
    expect(lowContent.position).toMatchObject({ x: 2, y: 3 });
    expect(lowContent.scale).toMatchObject({ x: 0.5, y: 0.5 });
    expect(lowContent.pivot).toMatchObject({ x: 0.5, y: 0.5 });

    symbol.setPresentationValue(2);
    expect(players).toHaveLength(1);
    expect(players[0].attached[0]!.object).toBe(lowDisplay);
    expect(lowDisplay.children[0]?.children).toHaveLength(1);

    symbol.setPresentationValue(25);
    await flushPromises();
    const highAnchor = resolveRenderAnchor(valueAnchor, target);
    expect(highAnchor).not.toEqual(lowAnchor);
    expect(players[1].attached[0]).toMatchObject({
      slot: "HighNum",
      followSlotColor: true,
    });
    const highDisplay = players[1].attached[0]!.object;
    expect(highDisplay).toBe(lowDisplay);
    expect(highDisplay.children).toHaveLength(1);
    const highContent = highDisplay.children[0]!;
    expect(highContent).toBe(lowContent);
    expect(highContent.children).toHaveLength(2);
    expect(highContent.position).toMatchObject({ x: -2, y: -3 });
    expect(highContent.scale).toMatchObject({ x: 2, y: 2 });
    expect(highContent.pivot).toMatchObject({ x: 2, y: 1 });
    expect(players[0].destroyed).toBe(false);

    const clone = symbol.clonePresentationValue();
    const cloneView = getRenderObjectAdapter(clone).view;
    expect(cloneView.children[0]?.children).toHaveLength(2);
    const anchor = resolveRenderAnchor(
      createContainerRenderAnchor(symbol.getPresentationValueView()),
      target,
    );
    expect(Number.isFinite(anchor.x) && Number.isFinite(anchor.y)).toBe(true);
    symbol.setPresentationValue(25);
    expect(cloneView.children[0]?.children).toHaveLength(2);
    clone.destroy();

    const partClone = valuePart.clone();
    expect(
      getRenderObjectAdapter(partClone).view.children[0]?.children,
    ).toHaveLength(2);
    const secondPartClone = partClone.clone();
    expect(
      getRenderObjectAdapter(secondPartClone).view.children[0]?.children,
    ).toHaveLength(2);
    secondPartClone.destroy();
    partClone.destroy();

    expect(() => symbol.setPresentationValue(13)).toThrow(/缺少 glyph/);
    expect(symbol.getPresentationValue()).toBe(25);
    symbol.resetForPoolRelease();
    symbol.init();
    symbol.setPresentationValue(1);
    await flushPromises();
    expect(players).toHaveLength(2);
    expect(players[0].destroyed).toBe(false);
    expect(players[0].attached.at(-1)?.object).toBe(lowDisplay);
    expect(lowDisplay.children[0]).toBe(lowContent);
    symbol.destroy();
    expect(players.every((player) => player.destroyed)).toBe(true);
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
    expect(players[0].attached[0]?.object.children[0]?.children).toHaveLength(
      1,
    );
    expect(players[1].attached[0]?.object.children[0]?.children).toHaveLength(
      2,
    );
    expect(resource.imageStringTierBindings?.[0]?.resource).toBe(
      resource.imageStringTierBindings?.[1]?.resource,
    );
    first.destroy();
    second.destroy();
  });

  it("reuses one Spine player when different value tiers bind the same assets", async () => {
    const base = createImageStringResource();
    const low = base.tiers[0]!;
    const resource = Object.freeze({
      ...base,
      tiers: Object.freeze([
        low,
        Object.freeze({
          spec: low.spec,
          skeleton: low.skeleton,
          atlasText: low.atlasText,
          textureUrl: low.textureUrl,
          atlasPage: low.atlasPage,
        }),
      ]),
    });
    const players: FakeSlotPlayer[] = [];
    const symbol = createSymbol(() => {
      const player = new FakeSlotPlayer();
      players.push(player);
      return player;
    }, resource);
    symbol.init();
    symbol.setPresentationValue(1);
    await flushPromises();
    const display = players[0].attached[0]!.object;

    symbol.setPresentationValue(25);
    await flushPromises();

    expect(players).toHaveLength(1);
    expect(players[0].attached.at(-1)?.object).toBe(display);
    expect(symbol.getPresentationValue()).toBe(25);
    symbol.destroy();
    expect(players[0].destroyed).toBe(true);
  });

  it("uses only the selected tier special-value image map", async () => {
    const players: FakeSlotPlayer[] = [];
    const symbol = createSymbol(() => {
      const player = new FakeSlotPlayer();
      players.push(player);
      return player;
    }, createImageStringResource(true));
    symbol.init();

    symbol.setPresentationValue(1);
    await flushPromises();
    const lowSpecial = players[0].attached[0]!.object.children[0]!
      .children[0] as Sprite;
    expect(lowSpecial.texture).toBe(Texture.EMPTY);

    symbol.setPresentationValue(25);
    await flushPromises();
    const highDisplay = players[1].attached[0]!.object;
    expect(highDisplay.children).toHaveLength(1);
    expect((highDisplay.children[0]!.children[0] as Sprite).texture).toBe(
      Texture.WHITE,
    );
    symbol.destroy();
  });
});

function createFacade(
  symbol: SymbolPlayer,
  isUsable: () => boolean = () => true,
) {
  return createSymbolHandle({
    symbol,
    owned: false,
    assertUsable: () => {
      if (!isUsable()) throw new Error("Test SymbolHandle is stale.");
    },
    clone: () => {
      throw new Error("Test facade clone is not configured.");
    },
    getAnchor: () => createContainerRenderAnchor(symbol),
  });
}

function createSymbol(
  createPlayer: (
    tier: SymbolValuePresentationResource["tiers"][number],
  ) => RendercoreSpineSlotPlayer,
  resource: SymbolValuePresentationResource = createResource(),
  imageStringControllerFactory?: (
    root: SymbolPlayer,
  ) => SymbolImageStringController,
  valueTextBindings?: Readonly<Record<string, (value: number) => string>>,
): SymbolPlayer {
  let symbol!: SymbolPlayer;
  symbol = new SymbolPlayer({
    definition: {
      code: 8,
      symbol: "GOLD",
      pays: [],
      defaultState: "normal",
      states: [
        { id: "normal", phase: "stable", playback: "static" },
        { id: "spinBlur", phase: "stable", playback: "static" },
        { id: "disabled", phase: "stable", playback: "static" },
        {
          id: "appear",
          phase: "once",
          playback: "once",
          afterComplete: "return-to-default",
        },
        {
          id: "win",
          phase: "once",
          playback: "once",
          afterComplete: "return-to-default",
        },
        {
          id: "remove",
          phase: "once",
          playback: "once",
          afterComplete: "return-to-default",
        },
        {
          id: "collect",
          phase: "once",
          playback: "once",
          afterComplete: "return-to-default",
        },
        { id: "dropdown", phase: "stable", playback: "loop" },
      ],
      equivalences: [
        { from: "spinBlur", to: "normal" },
        { from: "disabled", to: "normal" },
      ],
    },
    texture: {
      kind: "transparent",
      width: 200,
      height: 200,
    },
    stateTextures: { spinBlur: Texture.WHITE, disabled: Texture.EMPTY },
    animationResolver: createDefaultSymbolAnimationResolver(),
    animationCapabilities: ["appear", "win", "remove", "collect", "dropdown"],
    landingAppearEnabled: true,
    valueControllerFactory: (root) =>
      createSymbolPlayerValueController({
        root,
        resource,
        playerFactory: ({ tier }) => createPlayer(tier),
      }),
    imageStringControllerFactory,
    valueTextBindings,
  });
  return symbol;
}

function createNamedNode(
  name: string,
  resource: ReturnType<typeof createNamedImageStringResource>,
) {
  return Object.freeze({
    spec: Object.freeze({
      name,
      resource: "./digits.image-string.manifest.json",
      targets: Object.freeze([{ state: "spinBlur" }]),
      initialText: "1",
      anchor: Object.freeze({ x: 0.5, y: 0.5 }),
      transform: Object.freeze({ x: 0, y: 0, scale: 1 }),
      followSlotColor: true,
    }),
    resource,
  });
}

function createNamedImageStringResource() {
  return Object.freeze({
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
      }),
      fixedAdvanceGroups: Object.freeze([]),
    }),
    textures: Object.freeze({ "assets/1.png": Texture.WHITE }),
    destroyed: false,
    assertUsable: () => undefined,
    destroy: async () => undefined,
  });
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

function createImageStringResource(
  withTierSpecials = false,
  withSpinBlur = false,
): SymbolValuePresentationResource {
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
  const lowSpecialValueImages: Readonly<
    Record<string, { readonly path: string; readonly texture: Texture }>
  > = withTierSpecials
    ? Object.freeze({
        "1": Object.freeze({
          path: "./low-1.png",
          texture: Texture.EMPTY,
        }),
      })
    : Object.freeze({});
  const highSpecialValueImages: Readonly<
    Record<string, { readonly path: string; readonly texture: Texture }>
  > = withTierSpecials
    ? Object.freeze({
        "25": Object.freeze({
          path: "./high-25.png",
          texture: Texture.WHITE,
        }),
      })
    : Object.freeze({});
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
        specialValueImages: lowSpecialValueImages,
        ...(withSpinBlur
          ? {
              spinBlurProfile: Object.freeze({
                resourcePath: "./low-blur/image-string.manifest.json",
                resource: Object.freeze({
                  ...digits,
                  textures: Object.freeze({
                    "assets/1.png": Texture.EMPTY,
                    "assets/2.png": Texture.EMPTY,
                    "assets/5.png": Texture.EMPTY,
                  }),
                }),
                specialValueImages: Object.freeze({}),
              }),
            }
          : {}),
      }),
      Object.freeze({
        resourcePath: "./high/image-string.manifest.json",
        resource: digits,
        slot: "HighNum",
        anchor: Object.freeze({ x: 1, y: 1 }),
        transform: Object.freeze({ x: -2, y: -3, scale: 2 }),
        followSlotColor: true,
        specialValueImages: highSpecialValueImages,
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
