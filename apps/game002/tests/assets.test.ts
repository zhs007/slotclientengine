import { Assets, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createGame002SymbolAssetMapFromModules,
  createGame002SymbolRenderPriorityMapFromManifest,
  createGame002SymbolScaleMapFromManifest,
  getGame002DisplaySymbolsFromManifest,
  loadGame002SymbolTextures,
} from "../src/assets.js";
import {
  GAME002_SUPPORTED_SKINS,
  getGame002SkinConfig,
  parseGame002SkinId,
} from "../src/skin-config.js";

const EXPECTED_SYMBOLS = [
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
  "BN",
] as const;
const SPINE_SYMBOLS = EXPECTED_SYMBOLS.filter((symbol) => symbol !== "CN");

describe("game002-s3 assets", () => {
  it("exposes only explicit skin=1 and derives the 13 display symbols", () => {
    const skin = getGame002SkinConfig("1");

    expect(GAME002_SUPPORTED_SKINS).toEqual(["1"]);
    expect(parseGame002SkinId("1")).toBe("1");
    for (const invalid of ["", "01", "2", "3", "4", "5", "game002-s3"]) {
      expect(() => parseGame002SkinId(invalid)).toThrow(/exactly "1"/);
    }
    expect(
      getGame002DisplaySymbolsFromManifest(skin.stateTextureManifest),
    ).toEqual(EXPECTED_SYMBOLS);
    expect(skin.displaySymbols).toEqual(EXPECTED_SYMBOLS);
    expect(skin.emptySymbols).toEqual([]);
    expect(skin.backgroundUrl).toMatch(/bg\.jpg/);
    expect(skin.focusRegion).toEqual({
      x: 577.5,
      y: 270,
      width: 840,
      height: 1200,
    });
  });

  it("keeps PNG, Spine, scale and priority maps in one manifest-driven closure", () => {
    const skin = getGame002SkinConfig("1");
    const assets = createGame002SymbolAssetMapFromModules({
      modules: skin.symbolModules,
      stateTextureManifest: skin.stateTextureManifest,
      displaySymbols: skin.displaySymbols,
    });

    expect(Object.keys(assets)).toEqual(EXPECTED_SYMBOLS);
    expect(Object.keys(skin.symbolModules)).toHaveLength(39);
    expect(Object.keys(skin.spineSkeletonModules)).toHaveLength(12);
    expect(Object.keys(skin.spineSkeletonModules)).toEqual(
      expect.arrayContaining(
        SPINE_SYMBOLS.map((symbol) =>
          expect.stringContaining(`${symbol}.json`),
        ),
      ),
    );
    for (const banned of [
      "CN_1",
      "CN_2",
      "CN_3",
      "CN_4",
      "Nearwin1",
      "Nearwin2",
      "Nearwin3",
      "WM_Fx",
      "Symbol.png",
      "bg.jpg",
    ]) {
      expect(JSON.stringify(Object.keys(skin.symbolModules))).not.toContain(
        banned,
      );
      expect(
        JSON.stringify(Object.keys(skin.spineSkeletonModules)),
      ).not.toContain(banned);
    }
    expect(skin.symbolScales).toEqual(
      Object.fromEntries(EXPECTED_SYMBOLS.map((symbol) => [symbol, 1])),
    );
    expect(skin.symbolRenderPriorities).toEqual(
      Object.fromEntries(EXPECTED_SYMBOLS.map((symbol) => [symbol, 0])),
    );
  });

  it("validates the exact display set and explicit manifest values", () => {
    const skin = getGame002SkinConfig("1");
    const manifest = structuredClone(skin.stateTextureManifest) as {
      symbols: Record<string, Record<string, unknown>>;
    };

    delete manifest.symbols.BN;
    expect(() => getGame002DisplaySymbolsFromManifest(manifest)).toThrow(
      /manifest symbols must be/,
    );

    const invalidScale = structuredClone(skin.stateTextureManifest) as {
      symbols: Record<string, Record<string, unknown>>;
    };
    invalidScale.symbols.WL.scale = 0;
    expect(() =>
      createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: invalidScale,
        displaySymbols: EXPECTED_SYMBOLS,
        requireExplicitScale: true,
      }),
    ).toThrow(/WL.*scale/);

    const invalidPriority = structuredClone(skin.stateTextureManifest) as {
      symbols: Record<string, Record<string, unknown>>;
    };
    invalidPriority.symbols.WL.renderPriority = -1;
    expect(() =>
      createGame002SymbolRenderPriorityMapFromManifest({
        stateTextureManifest: invalidPriority,
        displaySymbols: EXPECTED_SYMBOLS,
      }),
    ).toThrow(/WL.*renderPriority/);

    expect(
      createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: skin.stateTextureManifest,
      }),
    ).toEqual(skin.symbolScales);
    expect(
      createGame002SymbolRenderPriorityMapFromManifest({
        stateTextureManifest: skin.stateTextureManifest,
      }),
    ).toEqual(skin.symbolRenderPriorities);
    expect(
      Object.keys(
        createGame002SymbolAssetMapFromModules({
          modules: skin.symbolModules,
          stateTextureManifest: skin.stateTextureManifest,
        }),
      ),
    ).toEqual(EXPECTED_SYMBOLS);
  });

  it("loads string, single, transparent and layered texture inputs", async () => {
    const loadedTexture = Texture.WHITE;
    const load = vi
      .spyOn(Assets, "load")
      .mockImplementation(async () => loadedTexture as never);
    const transparent = {
      kind: "transparent",
      width: 130,
      height: 130,
    } as const;
    const directTexture = Texture.EMPTY;

    const loaded = await loadGame002SymbolTextures({
      directUrl: "/direct.png",
      directTexture,
      set: {
        normal: "/normal.png",
        states: { spinBlur: "/blur.png", disabled: directTexture },
      },
      single: {
        normal: { kind: "single", texture: "/single.png" },
        states: {},
      },
      transparent: { normal: transparent, states: {} },
      layered: {
        normal: {
          kind: "layered",
          layers: [
            {
              index: 0,
              texture: "/layer.png",
              keyframes: ["/keyframe.png", directTexture],
            },
            { index: 1, texture: directTexture },
          ],
        },
        states: {},
      },
    } as any);

    expect(loaded.directUrl).toBe(loadedTexture);
    expect(loaded.directTexture).toBe(directTexture);
    expect((loaded.set as any).normal).toBe(loadedTexture);
    expect((loaded.set as any).states).toEqual({
      spinBlur: loadedTexture,
      disabled: directTexture,
    });
    expect((loaded.single as any).normal).toEqual({
      kind: "single",
      texture: loadedTexture,
    });
    expect((loaded.transparent as any).normal).toBe(transparent);
    expect((loaded.layered as any).normal.layers).toEqual([
      {
        index: 0,
        texture: loadedTexture,
        keyframes: [loadedTexture, directTexture],
      },
      { index: 1, texture: directTexture },
    ]);
    expect(load).toHaveBeenCalledTimes(6);
    load.mockRestore();
  });

  it("maps only exact Spine animations and leaves CN/effects out", () => {
    const skin = getGame002SkinConfig("1");
    const symbols = (
      skin.stateTextureManifest as {
        symbols: Record<
          string,
          {
            animations?: Record<
              string,
              { playback: { animationName: string } }
            >;
          }
        >;
      }
    ).symbols;

    for (const symbol of ["WL", "H1", "H2", "L1", "L2", "L3", "L4"]) {
      expect(Object.keys(symbols[symbol].animations ?? {})).toEqual([
        "normal",
        "appear",
        "win",
      ]);
      expect(symbols[symbol].animations?.normal.playback.animationName).toBe(
        "Idle",
      );
      expect(symbols[symbol].animations?.appear.playback.animationName).toBe(
        "Start",
      );
      expect(symbols[symbol].animations?.win.playback.animationName).toBe(
        "Win",
      );
    }
    expect(Object.keys(symbols.WM.animations ?? {})).toEqual([
      "normal",
      "appear",
    ]);
    expect(Object.keys(symbols.BN.animations ?? {})).toEqual(["normal"]);
    expect(symbols.CN.animations).toBeUndefined();
  });
});
