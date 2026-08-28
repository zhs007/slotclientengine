import { Container, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createSymbolValuePresenter,
  type SymbolValuePresentationPlayer,
  type SymbolValuePresentationResourceMap,
} from "../../src/index.js";

describe("generic symbol value presenter", () => {
  it("selects arbitrary tiers, shows independent views/raw text and clears lifecycle", async () => {
    const players: FakePlayer[] = [];
    const presenter = createSymbolValuePresenter({
      resources: createResources(),
      target: createTarget(),
      playerFactory: () => {
        const player = new FakePlayer();
        players.push(player);
        return player;
      },
    });
    const prepared = await presenter.prepare([
      { x: 0, y: 0, symbol: "GOLD", symbolCode: 7, value: 9 },
      { x: 1, y: 2, symbol: "GOLD", symbolCode: 7, value: 10 },
      { x: 2, y: 1, symbol: "GOLD", symbolCode: 7, value: 100 },
    ]);
    expect(players).toHaveLength(3);
    expect(players.every((player) => player.initialized)).toBe(true);
    presenter.show(prepared);
    expect(presenter.getSnapshot()).toMatchObject({
      phase: "visible",
      activeCount: 3,
      items: [
        { tierIndex: 0, text: "9", skeleton: "./bronze.json" },
        { tierIndex: 1, text: "10", skeleton: "./ruby.json" },
        { tierIndex: 2, text: "100", skeleton: "./ultra.json" },
      ],
    });
    expect(presenter.container.children).toHaveLength(3);
    expect(players.map((player) => player.slotNames)).toEqual([
      ["ValueSlot"],
      ["ValueSlot"],
      ["ValueSlot"],
    ]);
    presenter.update(0.25);
    expect(players.map((player) => player.updates)).toEqual([
      [0.25],
      [0.25],
      [0.25],
    ]);
    presenter.clear();
    expect(presenter.getSnapshot()).toMatchObject({
      phase: "idle",
      activeCount: 0,
    });
    expect(players.every((player) => player.destroyed)).toBe(true);
    presenter.destroy();
    presenter.destroy();
    expect(presenter.getSnapshot().phase).toBe("destroyed");
  });

  it("formats intrinsic ImgNumber text after resolving tiers from raw values", async () => {
    const presenter = createSymbolValuePresenter({
      resources: createImageStringResources(),
      valueTextFormatters: { GOLD: (value) => String(value / 5) },
      target: createTarget(),
      playerFactory: () => new FakePlayer(),
    });

    const prepared = await presenter.prepare([
      { x: 0, y: 0, symbol: "GOLD", symbolCode: 7, value: 5 },
      { x: 1, y: 0, symbol: "GOLD", symbolCode: 7, value: 25 },
    ]);
    presenter.show(prepared);

    expect(presenter.getSnapshot()).toMatchObject({
      items: [
        { tierIndex: 0, text: "1", skeleton: "./bronze.json" },
        { tierIndex: 1, text: "5", skeleton: "./ruby.json" },
      ],
    });
    presenter.destroy();
  });

  it("fails for invalid inputs, foreign prepared data and geometry drift", async () => {
    const presenter = createSymbolValuePresenter({
      resources: createResources(),
      target: createTarget(),
      playerFactory: () => new FakePlayer(),
    });
    await expect(
      presenter.prepare([
        { x: 0, y: 0, symbol: "GOLD", symbolCode: 7, value: 0 },
      ]),
    ).rejects.toThrow(/positive safe integer/);
    const fontResources = createResources();
    const imageResources = Object.freeze({
      GOLD: Object.freeze({
        ...fontResources.GOLD,
        textImageUrls: Object.freeze({ 1: "/1.png" }),
        text: Object.freeze({
          type: "image" as const,
          slot: "ValueSlot",
          x: 0,
          y: 0,
          prefix: "./",
        }),
      }),
    });
    let imagePlayerCreated = false;
    const imagePresenter = createSymbolValuePresenter({
      resources: imageResources,
      target: createTarget(),
      playerFactory: () => {
        imagePlayerCreated = true;
        return new FakePlayer();
      },
    });
    await expect(
      imagePresenter.prepare([
        { x: 0, y: 0, symbol: "GOLD", symbolCode: 7, value: 10 },
      ]),
    ).rejects.toThrow(/value 10 has no configured image resource/);
    expect(imagePlayerCreated).toBe(false);
    imagePresenter.destroy();
    expect(() => presenter.update(Number.NaN)).toThrow(/finite non-negative/);
    expect(() => presenter.show({ itemCount: 0, items: [] })).toThrow(
      /foreign/,
    );

    const drifted = createSymbolValuePresenter({
      resources: createResources(),
      target: {
        getVisibleSymbolGeometrySnapshots: (positions) =>
          positions.map((position) => ({
            ...position,
            code: 99,
            kind: "textured" as const,
            centerX: 0,
            centerY: 0,
            cellWidth: 120,
            cellHeight: 120,
          })),
      },
      playerFactory: () => new FakePlayer(),
    });
    const prepared = await drifted.prepare([
      { x: 0, y: 0, symbol: "GOLD", symbolCode: 7, value: 1 },
    ]);
    expect(() => drifted.show(prepared)).toThrow(/geometry mismatch/);

    const disposablePlayer = new FakePlayer();
    const disposable = createSymbolValuePresenter({
      resources: createResources(),
      target: createTarget(),
      playerFactory: () => disposablePlayer,
    });
    const disposablePrepared = await disposable.prepare([
      { x: 0, y: 0, symbol: "GOLD", symbolCode: 7, value: 1 },
    ]);
    disposable.discard(disposablePrepared);
    expect(disposablePlayer.destroyed).toBe(true);
    expect(() => disposable.discard(disposablePrepared)).toThrow(/consumed/);
    expect(() => disposable.show(disposablePrepared)).toThrow(/consumed/);

    const destroyPendingPlayer = new FakePlayer();
    const destroyPending = createSymbolValuePresenter({
      resources: createResources(),
      target: createTarget(),
      playerFactory: () => destroyPendingPlayer,
    });
    await destroyPending.prepare([
      { x: 0, y: 0, symbol: "GOLD", symbolCode: 7, value: 1 },
    ]);
    destroyPending.destroy();
    expect(destroyPendingPlayer.destroyed).toBe(true);
  });
});

class FakePlayer implements SymbolValuePresentationPlayer {
  readonly view = new Container();
  readonly updates: number[] = [];
  initialized = false;
  destroyed = false;
  readonly slotNames: string[] = [];
  async init() {
    this.initialized = true;
  }
  play() {}
  update(deltaSeconds: number) {
    this.updates.push(deltaSeconds);
    return { completed: false, events: [] };
  }
  attachSlotObject(options: { slot: string; object: Container }) {
    this.slotNames.push(options.slot);
    this.view.addChild(options.object);
  }
  removeSlotObject(object: Container) {
    object.parent?.removeChild(object);
  }
  reset() {}
  destroy() {
    this.destroyed = true;
    this.view.parent?.removeChild(this.view);
  }
}

function createResources(): SymbolValuePresentationResourceMap {
  const createTier = (skeleton: string, maxExclusive?: number) =>
    Object.freeze({
      ...(maxExclusive === undefined ? {} : { maxExclusive }),
      spec: Object.freeze({
        kind: "spine" as const,
        skeleton,
        atlas: "./shared.atlas",
        texture: "./shared.png",
        playback: Object.freeze({
          mode: "animation" as const,
          animationName: "Idle",
          loop: true,
        }),
      }),
      skeleton: {},
      atlasText: "shared.png\n",
      textureUrl: "/shared.png",
      atlasPage: "shared.png",
    });
  return Object.freeze({
    GOLD: Object.freeze({
      symbol: "GOLD",
      defaultValues: Object.freeze([1, 10, 100]),
      activeSpineAnimations: Object.freeze({}),
      tiers: Object.freeze([
        createTier("./bronze.json", 10),
        createTier("./ruby.json", 100),
        createTier("./ultra.json"),
      ]),
      textImageUrls: Object.freeze({}),
      text: Object.freeze({
        type: "font",
        slot: "ValueSlot",
        x: 0,
        y: 0,
        fontFamily: "Arial",
        fontSize: 32,
        fontWeight: "900",
        fill: "#fff",
        stroke: "#000",
        strokeWidth: 4,
      }),
    }),
  });
}

function createImageStringResources(): SymbolValuePresentationResourceMap {
  const base = createResources().GOLD!;
  const imageStringResource = Object.freeze({
    manifest: Object.freeze({
      version: 1 as const,
      kind: "image-string" as const,
      id: "digits",
      metrics: Object.freeze({ lineHeight: 1, letterSpacing: 0 }),
      glyphs: Object.freeze({
        "1": Object.freeze({
          path: "1.png",
          size: Object.freeze({ width: 1, height: 1 }),
          offset: Object.freeze({ x: 0, y: 0 }),
        }),
        "2": Object.freeze({
          path: "2.png",
          size: Object.freeze({ width: 1, height: 1 }),
          offset: Object.freeze({ x: 0, y: 0 }),
        }),
        "5": Object.freeze({
          path: "5.png",
          size: Object.freeze({ width: 1, height: 1 }),
          offset: Object.freeze({ x: 0, y: 0 }),
        }),
      }),
      fixedAdvanceGroups: Object.freeze([]),
    }),
    textures: Object.freeze({
      "1.png": Texture.WHITE,
      "2.png": Texture.WHITE,
      "5.png": Texture.WHITE,
    }),
    destroyed: false,
    assertUsable: () => undefined,
    destroy: async () => undefined,
  });
  const createBinding = () =>
    Object.freeze({
      resourcePath: "digits.json",
      resource: imageStringResource,
      slot: "ValueSlot",
      anchor: Object.freeze({ x: 0.5, y: 0.5 }),
      transform: Object.freeze({ x: 0, y: 0, scale: 1 }),
      followSlotColor: true,
      specialValueImages: Object.freeze({}),
    });
  return Object.freeze({
    GOLD: Object.freeze({
      ...base,
      defaultValues: Object.freeze([5, 25]),
      text: Object.freeze({
        type: "image-string" as const,
        tiers: Object.freeze([
          Object.freeze({
            resource: "digits.json",
            slot: "ValueSlot",
            anchor: Object.freeze({ x: 0.5, y: 0.5 }),
            transform: Object.freeze({ x: 0, y: 0, scale: 1 }),
            followSlotColor: true,
          }),
          Object.freeze({
            resource: "digits.json",
            slot: "ValueSlot",
            anchor: Object.freeze({ x: 0.5, y: 0.5 }),
            transform: Object.freeze({ x: 0, y: 0, scale: 1 }),
            followSlotColor: true,
          }),
          Object.freeze({
            resource: "digits.json",
            slot: "ValueSlot",
            anchor: Object.freeze({ x: 0.5, y: 0.5 }),
            transform: Object.freeze({ x: 0, y: 0, scale: 1 }),
            followSlotColor: true,
          }),
        ]),
      }),
      imageStringTierBindings: Object.freeze([
        createBinding(),
        createBinding(),
        createBinding(),
      ]),
    }),
  });
}

function createTarget() {
  return {
    getVisibleSymbolGeometrySnapshots: (
      positions: readonly { readonly x: number; readonly y: number }[],
    ) =>
      positions.map((position) => ({
        ...position,
        code: 7,
        kind: "textured" as const,
        centerX: position.x * 120 + 60,
        centerY: position.y * 120 + 60,
        cellWidth: 120,
        cellHeight: 120,
      })),
  };
}
