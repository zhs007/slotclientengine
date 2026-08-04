import { Assets, Container, Texture } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SymbolImageStringController,
  createSymbolImageStringResourcePool,
  createSymbolImageStringResources,
  notifySymbolImageStringSpineActive,
  notifySymbolImageStringSpineInactive,
} from "../../src/symbol-image-string/index.js";
import { RenderSymbol } from "../../src/symbol/render-symbol.js";
import { createDefaultSymbolStatePreset } from "../../src/symbol/state-machine.js";
import type { RendercoreSpineSlotPlayer } from "../../src/spine/runtime-player.js";

const manifest = {
  version: 1 as const,
  kind: "image-string" as const,
  id: "digits",
  metrics: { lineHeight: 10, letterSpacing: 0 },
  glyphs: {
    "0": {
      path: "assets/0.png",
      size: { width: 5, height: 10 },
      offset: { x: 0, y: 0 },
    },
    "1": {
      path: "assets/1.png",
      size: { width: 5, height: 10 },
      offset: { x: 0, y: 0 },
    },
  },
  fixedAdvanceGroups: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SymbolImageStringController", () => {
  it("renders exact special values as one image and attaches non-Spine states directly", () => {
    const symbol = createSymbol();
    const controller = new SymbolImageStringController({
      root: symbol,
      nodes: [
        {
          spec: {
            name: "coin-value",
            resource:
              "./dependencies/image-strings/digits/image-string.manifest.json",
            targets: [{ state: "normal" }],
            initialText: "200",
            specialValueImages: [
              { value: 200, image: "./mini.png" },
              { value: 500, image: "./maxi.png" },
            ],
            anchor: { x: 0.5, y: 0.5 },
            transform: { x: 2, y: 3, scale: 0.5 },
            followSlotColor: true,
          },
          resource: {
            manifest,
            textures: {
              "assets/0.png": Texture.EMPTY,
              "assets/1.png": Texture.EMPTY,
            },
            destroyed: false,
            assertUsable: () => undefined,
            destroy: async () => undefined,
          },
          specialValueImages: {
            "200": { path: "mini.png", texture: Texture.WHITE },
            "500": { path: "maxi.png", texture: Texture.EMPTY },
          },
        },
      ],
    });

    controller.syncState("normal");
    const display = symbol.imageStringOverlayLayer.children[0] as Container;
    expect(display.children).toHaveLength(1);
    expect(
      (display.children[0] as unknown as { texture: Texture }).texture,
    ).toBe(Texture.WHITE);
    controller.setText("coin-value", "500");
    expect(
      (display.children[0] as unknown as { texture: Texture }).texture,
    ).toBe(Texture.EMPTY);
    controller.setText("coin-value", "10");
    expect(display.children).toHaveLength(2);
    controller.setText("coin-value", "200");
    expect(display.children).toHaveLength(1);
    controller.syncState("win");
    expect(symbol.imageStringOverlayLayer.children).toHaveLength(0);
    controller.destroy();
    symbol.destroy();
  });

  it("preserves strings, validates atomically, attaches by state and resets for pool", () => {
    const symbol = createSymbol();
    const controller = new SymbolImageStringController({
      root: symbol,
      nodes: [
        {
          spec: {
            name: "coin-value",
            resource:
              "./dependencies/image-strings/digits/image-string.manifest.json",
            targets: [
              { state: "normal", slot: "Num" },
              { state: "win", slot: "WinNum" },
            ],
            initialText: "01",
            anchor: { x: 0.5, y: 0.5 },
            transform: { x: 2, y: 3, scale: 0.5 },
            followSlotColor: false,
          },
          resource: {
            manifest,
            textures: {
              "assets/0.png": Texture.EMPTY,
              "assets/1.png": Texture.EMPTY,
            },
            destroyed: false,
            assertUsable: () => undefined,
            destroy: async () => undefined,
          },
        },
      ],
    });
    const player = createPlayer();

    expect(controller.getNodeNames()).toEqual(["coin-value"]);
    expect(controller.getText("coin-value")).toBe("01");
    controller.setText("coin-value", "001");
    expect(controller.getText("coin-value")).toBe("001");
    controller.setText("coin-value", "");
    expect(controller.getText("coin-value")).toBe("");
    controller.setText("coin-value", "001");
    expect(() => controller.setText("coin-value", "2")).toThrow(/缺少 glyph/);
    expect(controller.getText("coin-value")).toBe("001");
    expect(() => controller.getText("missing")).toThrow(/symbol "A".*missing/);
    expect(() => controller.setText("missing", "0")).toThrow(
      /symbol "A".*missing/,
    );

    notifySymbolImageStringSpineActive(symbol, "win", player);
    expect(player.attachSlotObject).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "WinNum", followSlotColor: false }),
    );
    vi.mocked(player.attachSlotObject).mockClear();
    notifySymbolImageStringSpineActive(symbol, "normal", player);
    expect(player.attachSlotObject).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "Num", followSlotColor: false }),
    );
    vi.mocked(player.removeSlotObject).mockClear();
    notifySymbolImageStringSpineInactive(symbol, createPlayer());
    expect(player.removeSlotObject).not.toHaveBeenCalled();
    notifySymbolImageStringSpineInactive(symbol, player);
    expect(player.removeSlotObject).toHaveBeenCalled();

    const previousOwner = {};
    const currentOwner = {};
    notifySymbolImageStringSpineActive(symbol, "normal", player, previousOwner);
    notifySymbolImageStringSpineActive(symbol, "win", player, currentOwner);
    vi.mocked(player.removeSlotObject).mockClear();
    notifySymbolImageStringSpineInactive(symbol, player, previousOwner);
    expect(player.removeSlotObject).not.toHaveBeenCalled();
    notifySymbolImageStringSpineInactive(symbol, player, currentOwner);
    expect(player.removeSlotObject).toHaveBeenCalled();

    vi.mocked(player.attachSlotObject).mockClear();
    notifySymbolImageStringSpineActive(symbol, "normal", player, currentOwner);
    controller.syncState("normal");
    expect(player.attachSlotObject).toHaveBeenCalledTimes(2);

    controller.resetForPoolRelease();
    expect(controller.getText("coin-value")).toBe("01");
    controller.destroy();
    controller.destroy();
    expect(() => controller.getNodeNames()).toThrow(/destroyed/);
    expect(() =>
      notifySymbolImageStringSpineActive(symbol, "normal", player),
    ).not.toThrow();
    expect(() =>
      notifySymbolImageStringSpineInactive(symbol, player),
    ).not.toThrow();
    symbol.destroy();
  });

  it("builds an empty resource map and reports a missing nested manifest", async () => {
    await expect(
      createSymbolImageStringResources({
        manifest: { symbols: { A: { imageStringNodes: [] } } } as never,
        symbolManifestPath: "symbol-state-textures.manifest.json",
        imageStringManifests: {},
        imageModules: {},
      }),
    ).resolves.toEqual({ resources: {}, sharedResources: [] });

    await expect(
      createSymbolImageStringResources({
        manifest: {
          symbols: {
            A: {
              imageStringNodes: [
                {
                  name: "coin-value",
                  resource:
                    "./dependencies/image-strings/digits/image-string.manifest.json",
                  target: { state: "normal", slot: "Num" },
                  initialText: "0",
                  anchor: { x: 0.5, y: 0.5 },
                  transform: { x: 0, y: 0, scale: 1 },
                  followSlotColor: true,
                },
              ],
            },
          },
        } as never,
        symbolManifestPath: "symbol-state-textures.manifest.json",
        imageStringManifests: {},
        imageModules: {},
      }),
    ).rejects.toThrow(/manifest is missing/);
  });

  it("loads one canonical nested resource once and validates glyphs atomically", async () => {
    const load = vi.spyOn(Assets, "load").mockImplementation(
      async () =>
        ({
          width: 5,
          height: 10,
        }) as never,
    );
    const path =
      "./dependencies/image-strings/digits/image-string.manifest.json";
    const pool = await createSymbolImageStringResourcePool({
      symbolManifestPath: "symbol-state-textures.manifest.json",
      resourcePaths: [path, path],
      imageStringManifests: {
        "dependencies/image-strings/digits/image-string.manifest.json":
          manifest,
      },
      imageModules: {
        "dependencies/image-strings/digits/assets/0.png": "/0.png",
        "dependencies/image-strings/digits/assets/1.png": "/1.png",
      },
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(pool.get(path)).toBe(pool.get(path));
    await pool.destroy();
    await pool.destroy();
    expect(() => pool.get(path)).toThrow(/destroyed/);
    load.mockRestore();

    vi.spyOn(Assets, "load").mockResolvedValue({
      width: 6,
      height: 10,
    } as never);
    await expect(
      createSymbolImageStringResourcePool({
        symbolManifestPath: "symbol-state-textures.manifest.json",
        resourcePaths: [path],
        imageStringManifests: {
          "dependencies/image-strings/digits/image-string.manifest.json":
            manifest,
        },
        imageModules: {
          "dependencies/image-strings/digits/assets/0.png": "/0.png",
          "dependencies/image-strings/digits/assets/1.png": "/1.png",
        },
      }),
    ).rejects.toThrow(/size mismatch/);
  });

  it("prepares special value images once and fails explicitly for missing images", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.EMPTY as never);
    const pool = await createSymbolImageStringResourcePool({
      symbolManifestPath: "symbol-state-textures.manifest.json",
      resourcePaths: [],
      imageStringManifests: {},
      imageModules: { "mini.png": "/mini.png" },
      specialImagePaths: ["./mini.png", "./mini.png"],
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(pool.getSpecialImage("./mini.png")).toBe(Texture.EMPTY);
    expect(() => pool.getSpecialImage("./missing.png")).toThrow(/not prepared/);
    await pool.destroy();
    await pool.destroy();
    expect(() => pool.getSpecialImage("./mini.png")).toThrow(/destroyed/);

    await expect(
      createSymbolImageStringResourcePool({
        symbolManifestPath: "symbol-state-textures.manifest.json",
        resourcePaths: [],
        imageStringManifests: {},
        imageModules: {},
        specialImagePaths: ["./missing.png"],
      }),
    ).rejects.toThrow(/special value image is missing/);

    load.mockResolvedValueOnce(null as never);
    await expect(
      createSymbolImageStringResourcePool({
        symbolManifestPath: "symbol-state-textures.manifest.json",
        resourcePaths: [],
        imageStringManifests: {},
        imageModules: { "broken.png": "/broken.png" },
        specialImagePaths: ["./broken.png"],
      }),
    ).rejects.toThrow(/failed to load/);
  });

  it("fails before use when a nested glyph module or initial glyph is missing", async () => {
    const path =
      "./dependencies/image-strings/digits/image-string.manifest.json";
    await expect(
      createSymbolImageStringResourcePool({
        symbolManifestPath: "symbol-state-textures.manifest.json",
        resourcePaths: [path],
        imageStringManifests: {
          "dependencies/image-strings/digits/image-string.manifest.json":
            manifest,
        },
        imageModules: {
          "dependencies/image-strings/digits/assets/0.png": "/0.png",
        },
      }),
    ).rejects.toThrow(/glyph is missing/);

    vi.spyOn(Assets, "load").mockResolvedValue({
      width: 5,
      height: 10,
    } as never);
    await expect(
      createSymbolImageStringResources({
        manifest: {
          symbols: {
            A: {
              imageStringNodes: [
                {
                  name: "bad-value",
                  resource: path,
                  target: { state: "normal", slot: "Num" },
                  initialText: "2",
                  anchor: { x: 0.5, y: 0.5 },
                  transform: { x: 0, y: 0, scale: 1 },
                  followSlotColor: true,
                },
              ],
            },
          },
        } as never,
        symbolManifestPath: "symbol-state-textures.manifest.json",
        imageStringManifests: {
          "dependencies/image-strings/digits/image-string.manifest.json":
            manifest,
        },
        imageModules: {
          "dependencies/image-strings/digits/assets/0.png": "/0.png",
          "dependencies/image-strings/digits/assets/1.png": "/1.png",
        },
      }),
    ).rejects.toThrow(/initialText is invalid/);
  });
});

function createSymbol(): RenderSymbol {
  const preset = createDefaultSymbolStatePreset();
  return new RenderSymbol({
    definition: {
      code: 0,
      symbol: "A",
      pays: [0],
      defaultState: preset.defaultState,
      states: preset.states,
      equivalences: preset.equivalences,
    },
    texture: Texture.EMPTY,
    animationResolver: (context) => ({
      stateId: context.resolvedState,
      playback: context.state.playback,
      reset: () => undefined,
      update: () => ({ loopCompleted: false, onceCompleted: false }),
    }),
  });
}

function createPlayer(): RendercoreSpineSlotPlayer {
  return {
    view: new Container(),
    init: () => undefined,
    play: () => undefined,
    update: () => ({ completed: false, events: [] }),
    reset: () => undefined,
    destroy: () => undefined,
    attachSlotObject: vi.fn(),
    removeSlotObject: vi.fn(),
  };
}
