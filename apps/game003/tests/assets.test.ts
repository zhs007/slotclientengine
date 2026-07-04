import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import bgBarManifest from "../../../assets/game003-s1/bg-bar-symbol-state-textures.manifest.json";
import manifest from "../../../assets/game003-s1/symbol-state-textures.manifest.json";
import {
  GAME003_BG_BAR_DISPLAY_SYMBOLS,
  GAME003_DISPLAY_SYMBOLS,
  createGame003BgBarSymbolAssetMapFromModules,
  createGame003BgBarSymbolScaleMapFromManifest,
  createGame003SymbolAssetMapFromModules,
  createGame003SymbolScaleMapFromManifest,
  loadGame003BgBarSymbolTextures,
  loadGame003SymbolTextures,
} from "../src/assets.js";
import { getGame003GeneratedLoadingResourceUrl } from "../src/generated-loading-url.js";
import { createTestTexture } from "../../../packages/rendercore/tests/reel/helpers.js";

describe("game003 symbol assets", () => {
  it("builds a symbol asset map from PNG normal and required state textures", () => {
    const assets = createGame003SymbolAssetMapFromModules({
      modules: createModules(GAME003_DISPLAY_SYMBOLS),
      stateTextureManifest: manifest,
    });

    expect(Object.keys(assets).sort()).toEqual(
      [...GAME003_DISPLAY_SYMBOLS].sort(),
    );
    expect(assets.H1).toMatchObject({
      normal: "/assets/game003-s1/H1.png",
      states: {
        spinBlur: "/assets/game003-s1/H1.spinBlur.png",
        disabled: "/assets/game003-s1/H1.disabled.png",
      },
    });
    expect(assets).not.toHaveProperty("bg1");
    expect(assets).not.toHaveProperty("mainreelbg");
    expect(assets).not.toHaveProperty("Symbol");
  });

  it("requires explicit scale 1 from the manifest and PNG normals for H symbols", () => {
    expect(
      createGame003SymbolScaleMapFromManifest({
        stateTextureManifest: manifest,
        requireExplicitScale: true,
      }),
    ).toEqual(
      Object.fromEntries(GAME003_DISPLAY_SYMBOLS.map((symbol) => [symbol, 1])),
    );

    const symbols = manifest.symbols as Record<
      string,
      {
        normal: string;
        scale: number;
        animations: Record<string, unknown>;
      }
    >;
    for (const symbol of ["H1", "H2", "H3", "H4", "H5"]) {
      expect(symbols[symbol].normal).toBe(`./${symbol}.png`);
      expect(symbols[symbol].normal).not.toMatch(/\.jpg$/);
      expect(symbols[symbol].scale).toBe(1);
    }
    expect(symbols.H1.animations.normal).toMatchObject({
      kind: "spine",
      skeleton: "./H1.json",
      atlas: "./Symbol.atlas",
      texture: "./Symbol.png",
      playback: { mode: "animation", animationName: "Idle", loop: true },
    });
    expect(symbols.H1.animations.appear).toMatchObject({
      kind: "spine",
      playback: { mode: "animation", animationName: "Start", loop: false },
    });
    expect(symbols.H2.animations).not.toHaveProperty("appear");
    for (const symbol of ["CL", "SC"]) {
      expect(symbols[symbol].animations.normal).toMatchObject({
        kind: "spine",
        skeleton: `./${symbol}.json`,
        playback: { mode: "animation", animationName: "Idle", loop: true },
      });
      expect(symbols[symbol].animations.appear).toMatchObject({
        kind: "spine",
        skeleton: `./${symbol}.json`,
        playback: { mode: "animation", animationName: "Start", loop: false },
      });
      expect(symbols[symbol].animations.win).toMatchObject({
        kind: "spine",
        skeleton: `./${symbol}.json`,
        playback: { mode: "animation", animationName: "Win", loop: false },
      });
    }
  });

  it("fails when required state textures are missing or manifest fields drift", () => {
    const modules = createModules(GAME003_DISPLAY_SYMBOLS);
    delete modules["../../../assets/game003-s1/H1.spinBlur.png"];
    expect(() =>
      createGame003SymbolAssetMapFromModules({
        modules,
        stateTextureManifest: manifest,
      }),
    ).toThrow(/H1.*spinBlur/);

    expect(() =>
      createGame003SymbolAssetMapFromModules({
        modules: createModules(GAME003_DISPLAY_SYMBOLS),
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur", "disabled"],
          symbols: {
            H1: {
              normal: "./H1.jpg",
              spinBlur: "./H1.spinBlur.png",
              disabled: "./H1.disabled.png",
              scale: 1,
            },
          },
        },
        displaySymbols: ["H1"],
      }),
    ).toThrow(/normal texture must be ".\/H1.png"/);
  });

  it("rejects malformed manifests and invalid explicit scales", () => {
    expect(() =>
      createGame003SymbolScaleMapFromManifest({
        stateTextureManifest: {
          version: 2,
          states: ["spinBlur", "disabled"],
          symbols: {},
        },
      }),
    ).toThrow(/version/);
    expect(() =>
      createGame003SymbolScaleMapFromManifest({
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur"],
          symbols: {},
        },
      }),
    ).toThrow(/disabled/);
    expect(() =>
      createGame003SymbolScaleMapFromManifest({
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur", "disabled", "other"],
          symbols: {},
        },
      }),
    ).toThrow(/unknown state/);
    expect(() =>
      createGame003SymbolScaleMapFromManifest({
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur", "disabled"],
          symbols: {
            H1: {
              normal: "./H1.png",
              spinBlur: "./H1.spinBlur.png",
              disabled: "./H1.disabled.png",
              scale: 0,
            },
          },
        },
        displaySymbols: ["H1"],
      }),
    ).toThrow(/scale/);
  });

  it("loads string, single-source and layered symbol texture inputs", async () => {
    const loaded = await loadGame003SymbolTextures({
      H1: createTestTexture(10, 10),
      H2: {
        normal: {
          kind: "single",
          texture: createTestTexture(11, 11),
        },
        states: {
          spinBlur: createTestTexture(11, 11),
        },
      },
      H3: {
        normal: {
          kind: "layered",
          layers: [
            {
              index: 0,
              texture: createTestTexture(12, 12),
              keyframes: [createTestTexture(12, 12)],
            },
          ],
        },
      },
    });

    expect(loaded.H1).toBeInstanceOf(Texture);
    expect(loaded.H2).toMatchObject({ normal: { kind: "single" } });
    expect(loaded.H3).toMatchObject({ normal: { kind: "layered" } });
  });

  it("builds bg-bar assets from transparent normal plus wild/up PNGs", () => {
    const assets = createGame003BgBarSymbolAssetMapFromModules({
      modules: {
        "../../../assets/game003-s1/wild.png": "/assets/game003-s1/wild.png",
        "../../../assets/game003-s1/up.png": "/assets/game003-s1/up.png",
      },
      stateTextureManifest: bgBarManifest,
    });

    expect(Object.keys(assets).sort()).toEqual(
      [...GAME003_BG_BAR_DISPLAY_SYMBOLS].sort(),
    );
    expect(assets.normal).toEqual({
      normal: { kind: "transparent", width: 172, height: 158 },
      states: {},
    });
    expect(assets.wild).toMatchObject({
      normal: "/assets/game003-s1/wild.png",
      states: {},
    });
    expect(assets.up).toMatchObject({
      normal: "/assets/game003-s1/up.png",
      states: {},
    });
    expect(JSON.stringify(assets)).not.toMatch(/normal\.png/);
  });

  it("requires explicit bg-bar symbol scale and validates real texture sizes", async () => {
    expect(
      createGame003BgBarSymbolScaleMapFromManifest({
        stateTextureManifest: bgBarManifest,
        requireExplicitScale: true,
      }),
    ).toEqual({
      normal: 1,
      wild: 1,
      up: 1,
    });

    await expect(
      loadGame003BgBarSymbolTextures({
        normal: {
          normal: { kind: "transparent", width: 172, height: 158 },
          states: {},
        },
        wild: {
          normal: createTestTexture(172, 158),
          states: {},
        },
        up: {
          normal: createTestTexture(172, 130),
          states: {},
        },
      }),
    ).resolves.toMatchObject({
      normal: { normal: { kind: "transparent", width: 172, height: 158 } },
    });

    await expect(
      loadGame003BgBarSymbolTextures({
        normal: {
          normal: { kind: "transparent", width: 172, height: 158 },
          states: {},
        },
        wild: {
          normal: createTestTexture(172, 130),
          states: {},
        },
        up: {
          normal: createTestTexture(172, 130),
          states: {},
        },
      }),
    ).rejects.toThrow(/wild size must be 172 x 158/);
  });

  it("looks up the generated minecart loading URL without fallback", () => {
    expect(getGame003GeneratedLoadingResourceUrl("game003-minecart")).toMatch(
      /minecart/,
    );
    expect(() =>
      getGame003GeneratedLoadingResourceUrl("game003-missing"),
    ).toThrow(/was not generated/);
  });
});

function createModules(symbols: readonly string[]): Record<string, string> {
  const modules: Record<string, string> = {
    "../../../assets/game003-s1/bg1.png": "/assets/game003-s1/bg1.png",
    "../../../assets/game003-s1/mainreelbg.png":
      "/assets/game003-s1/mainreelbg.png",
  };
  for (const symbol of symbols) {
    modules[`../../../assets/game003-s1/${symbol}.png`] =
      `/assets/game003-s1/${symbol}.png`;
    modules[`../../../assets/game003-s1/${symbol}.spinBlur.png`] =
      `/assets/game003-s1/${symbol}.spinBlur.png`;
    modules[`../../../assets/game003-s1/${symbol}.disabled.png`] =
      `/assets/game003-s1/${symbol}.disabled.png`;
  }
  return modules;
}
