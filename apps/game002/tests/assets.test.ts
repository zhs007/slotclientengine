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
const PAY_SYMBOLS = ["WL", "H1", "H2", "L1", "L2", "L3", "L4"] as const;

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
    expect(skin.background.manifest).toMatchObject({
      version: 1,
      kind: "spine",
      artSize: { width: 2000, height: 2000 },
      initialState: "BaseGame",
      states: {
        BaseGame: { animation: "BG" },
        FreeGame: { animation: "FG" },
      },
      transitions: [
        { from: "BaseGame", to: "FreeGame", animation: "BG_FG" },
        { from: "FreeGame", to: "BaseGame", animation: "FG_BG" },
      ],
    });
    expect(skin.background.atlasPages).toEqual([
      "BG.png",
      "BG_2.png",
      "BG_3.png",
      "BG_4.png",
      "BG_5.png",
      "BG_6.png",
      "BG_7.png",
      "BG_8.png",
    ]);
    expect(new Set(Object.values(skin.background.textureUrls)).size).toBe(8);
    for (const page of skin.background.atlasPages) {
      expect(skin.background.textureUrls[page]).toContain(
        `spineAtlasPage=${encodeURIComponent(page)}`,
      );
    }
    expect(skin.focusRegion).toEqual({
      x: 577,
      y: 272,
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
    expect(Object.keys(skin.symbolModules)).toHaveLength(38);
    expect(Object.keys(skin.spineSkeletonModules)).toHaveLength(12);
    expect(skin.reelManifest.spin).toMatchObject({
      bounceStrength: 0,
      dimmingAlpha: 0.6,
      timing: {
        startStepMs: 16,
        stopStepMs: 16,
        settleAfterLastStartMs: 180,
        minimumSpinCycles: 6,
        speedSymbolsPerSecond: 54,
      },
    });
    expect(Object.keys(skin.reelEffectSkeletonModules).sort()).toEqual([
      expect.stringContaining("Nearwin1.json"),
      expect.stringContaining("Nearwin2.json"),
    ]);
    expect(Object.values(skin.reelEffectResources)).toMatchObject([
      { animationName: "Loop", loopCount: 3 },
      { animationName: "Loop", loopCount: 1 },
    ]);
    expect(skin.reelEffectResources.anticipation!.durationSeconds).toBeCloseTo(
      0.6666667,
      6,
    );
    expect(skin.reelEffectResources.refillSweep!.durationSeconds).toBeCloseTo(
      0.4,
      6,
    );
    expect(
      skin.symbolValuePresentationResources.CN.tiers.map(
        (tier) => tier.spec.skeleton,
      ),
    ).toEqual(["./CN_1.json", "./CN_2.json", "./CN_3.json", "./CN_4.json"]);
    expect(skin.symbolValuePresentationResources.CN.defaultValues).toEqual([
      1, 2, 5, 10, 25, 50, 100, 250, 500, 1000,
    ]);
    expect(assets.CN).toMatchObject({
      normal: { kind: "transparent", width: 200, height: 200 },
      states: {
        spinBlur: expect.stringContaining("CN.spinBlur.png"),
        disabled: expect.stringContaining("CN.disabled.png"),
      },
    });
    expect(skin.stateTextureManifest).not.toHaveProperty("symbols.CN.normal");
    expect(skin.stateTextureManifest).not.toHaveProperty("symbols.CN.spinBlur");
    expect(skin.stateTextureManifest).not.toHaveProperty("symbols.CN.disabled");
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
      "BG.png",
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
      Object.fromEntries(
        EXPECTED_SYMBOLS.map((symbol) => [symbol, symbol === "WL" ? 1 : 0]),
      ),
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
    expect(skin.symbolRenderPriorities).toMatchObject({ WL: 1 });
    expect(
      Object.entries(skin.symbolRenderPriorities)
        .filter(([symbol]) => symbol !== "WL")
        .every(([, priority]) => priority === 0),
    ).toBe(true);
    expect(
      Object.keys(
        createGame002SymbolAssetMapFromModules({
          modules: skin.symbolModules,
          stateTextureManifest: skin.stateTextureManifest,
        }),
      ),
    ).toEqual(EXPECTED_SYMBOLS);
  });

  it("keeps every payable symbol on an explicit exact Spine Win once animation", () => {
    const manifest = getGame002SkinConfig("1").stateTextureManifest as {
      readonly symbols: Readonly<
        Record<
          string,
          {
            readonly animations?: Readonly<Record<string, unknown>>;
          }
        >
      >;
    };
    for (const symbol of PAY_SYMBOLS) {
      expect(manifest.symbols[symbol]?.animations?.win).toMatchObject({
        kind: "spine",
        playback: {
          mode: "animation",
          animationName: "Win",
          loop: false,
        },
      });
    }
    expect(manifest.symbols.CN?.animations?.win).toBeUndefined();
    expect(manifest.symbols.CN?.animations?.winStart).toMatchObject({
      kind: "activeSpine",
      playback: {
        mode: "animation",
        animationName: "Win_Start",
        loop: false,
      },
    });
    expect(manifest.symbols.CN?.animations?.winLoop).toMatchObject({
      kind: "activeSpine",
      playback: { mode: "animation", animationName: "Win", loop: true },
    });
    expect(manifest.symbols.CN?.animations?.collect).toMatchObject({
      kind: "activeSpine",
      playback: { mode: "animation", animationName: "Collect", loop: false },
    });
    for (const symbol of ["WM", "CM", "CO", "AF", "BN"] as const) {
      expect(manifest.symbols[symbol]?.animations?.win).toBeUndefined();
    }
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
        "remove",
        "dropdown",
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
      "remove",
      "dropdown",
    ]);
    expect(Object.keys(symbols.BN.animations ?? {})).toEqual(["normal"]);
    expect(symbols.CN.animations).toMatchObject({
      appear: {
        kind: "activeSpine",
        playback: { animationName: "Start", loop: false },
      },
      winStart: {
        kind: "activeSpine",
        playback: { animationName: "Win_Start", loop: false },
      },
      winLoop: {
        kind: "activeSpine",
        playback: { animationName: "Win", loop: true },
      },
      collect: {
        kind: "activeSpine",
        playback: { animationName: "Collect", loop: false },
      },
      remove: {
        kind: "activeSpine",
        playback: { animationName: "End", loop: false },
      },
      dropdown: {
        kind: "activeSpine",
        playback: { animationName: "Loop", loop: true },
      },
    });
    expect(skin.landingAppearSymbols).toEqual([
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
    ]);
    expect(symbols.CO.animations?.normal.playback.animationName).toBe("Loop");
    const valuePresentation = (
      skin.stateTextureManifest as {
        symbols: {
          CN: {
            animations: {
              appear: { playback: { animationName: string; loop: boolean } };
            };
            valuePresentation: {
              tiers: Array<{
                animation: {
                  playback: { animationName: string; loop: boolean };
                };
              }>;
            };
          };
        };
      }
    ).symbols.CN;
    expect(valuePresentation.animations.appear.playback).toMatchObject({
      animationName: "Start",
      loop: false,
    });
    expect(skin.symbolValuePresentationResources.CN.text).toEqual({
      type: "image",
      slot: "Num",
      x: 0,
      y: 0,
      prefix: "./",
    });
    expect(
      Object.keys(skin.symbolValuePresentationResources.CN.textImageUrls),
    ).toEqual(["1", "2", "5", "10", "25", "50", "100", "250", "500", "1000"]);
    expect(
      valuePresentation.valuePresentation.tiers.map(
        (tier) => tier.animation.playback,
      ),
    ).toEqual(
      Array.from({ length: 4 }, () => ({
        mode: "animation",
        animationName: "Loop",
        loop: true,
      })),
    );
  });
});
