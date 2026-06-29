import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import manifest from "../../../assets/game003-s1/symbol-state-textures.manifest.json";
import {
  GAME003_DISPLAY_SYMBOLS,
  createGame003SymbolAssetMapFromModules,
  createGame003SymbolScaleMapFromManifest,
  loadGame003SymbolTextures,
} from "../src/assets.js";
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
      { normal: string; scale: number }
    >;
    for (const symbol of ["H1", "H2", "H3", "H4", "H5"]) {
      expect(symbols[symbol].normal).toBe(`./${symbol}.png`);
      expect(symbols[symbol].normal).not.toMatch(/\.jpg$/);
      expect(symbols[symbol].scale).toBe(1);
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
