import { afterEach, describe, expect, it, vi } from "vitest";
import { Assets } from "pixi.js";
import stateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import { createTestTexture } from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  GAME002_DISPLAY_SYMBOLS,
  GAME002_EMPTY_SYMBOLS,
  GAME002_REQUIRED_STATE_TEXTURES,
  createGame002SymbolAssetMapFromModules,
  loadGame002SymbolTextures,
} from "../src/assets.js";

describe("game002 assets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the symbols002 asset map with normal, spinBlur and disabled textures", () => {
    const assets = createGame002SymbolAssetMapFromModules({
      modules: createModules(GAME002_DISPLAY_SYMBOLS),
      stateTextureManifest,
    });

    expect(Object.keys(assets)).toEqual(GAME002_DISPLAY_SYMBOLS);
    expect(Object.keys(assets)).not.toContain(GAME002_EMPTY_SYMBOLS[0]);
    for (const symbol of GAME002_DISPLAY_SYMBOLS) {
      expect(assets[symbol]).toMatchObject({
        normal: `/assets/${symbol}.png`,
        states: {
          spinBlur: `/assets/${symbol}.spinBlur.png`,
          disabled: `/assets/${symbol}.disabled.png`,
        },
      });
    }
  });

  it("rejects missing required state files and manifest references", () => {
    const missingStateModules = createModules(GAME002_DISPLAY_SYMBOLS);
    delete missingStateModules["../../../assets/symbols002/WL.spinBlur.png"];

    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: missingStateModules,
        stateTextureManifest,
      }),
    ).toThrow(/WL\.spinBlur/);

    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: createModules(GAME002_DISPLAY_SYMBOLS),
        stateTextureManifest: {
          ...stateTextureManifest,
          symbols: {
            ...stateTextureManifest.symbols,
            WL: {
              ...stateTextureManifest.symbols.WL,
              disabled: "./WL.disabled-missing.png",
            },
          },
        },
      }),
    ).toThrow(/WL\.disabled\.png/);

    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: createModules(GAME002_DISPLAY_SYMBOLS),
        stateTextureManifest: {
          ...stateTextureManifest,
          states: ["spinBlur"],
        },
      }),
    ).toThrow(/disabled/);
  });

  it("rejects unknown PNG state files and empty symbols in the display set", () => {
    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: {
          ...createModules(["WL"]),
          "../../../assets/symbols002/WL.blurred.png": "/assets/WL.blurred.png",
        },
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur", "disabled"],
          symbols: {
            WL: {
              normal: "./WL.png",
              spinBlur: "./WL.spinBlur.png",
              disabled: "./WL.disabled.png",
            },
          },
        },
        displaySymbols: ["WL"],
      }),
    ).toThrow(/unknown state "blurred"/);

    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: createModules(["BN"]),
        stateTextureManifest,
        displaySymbols: ["BN"],
      }),
    ).toThrow(/must not be empty/);
  });

  it("rejects malformed manifest and texture filenames", () => {
    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: createModules(["WL"]),
        stateTextureManifest: { ...stateTextureManifest, version: 2 },
        displaySymbols: ["WL"],
      }),
    ).toThrow(/version/);
    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: createModules(["WL"]),
        stateTextureManifest: { ...stateTextureManifest, states: "spinBlur" },
        displaySymbols: ["WL"],
      }),
    ).toThrow(/states/);
    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: createModules(["WL"]),
        stateTextureManifest: { ...stateTextureManifest, symbols: null },
        displaySymbols: ["WL"],
      }),
    ).toThrow(/symbols/);
    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: createModules(["WL"]),
        stateTextureManifest: {
          ...stateTextureManifest,
          symbols: {
            WL: {
              normal: "",
              spinBlur: "./WL.spinBlur.png",
              disabled: "./WL.disabled.png",
            },
          },
        },
        displaySymbols: ["WL"],
      }),
    ).toThrow(/normal texture/);
    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: {
          ...createModules(["WL"]),
          "../../../assets/symbols002/WL.foo.bar.png": "/assets/WL.foo.bar.png",
        },
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur", "disabled", "foo"],
          symbols: {
            WL: {
              normal: "./WL.png",
              spinBlur: "./WL.spinBlur.png",
              disabled: "./WL.disabled.png",
            },
          },
        },
        displaySymbols: ["WL"],
      }),
    ).toThrow(/Cannot parse/);
  });

  it("loads string, single, layered and already-loaded texture assets", async () => {
    const loaded = createTestTexture(12, 14);
    const existing = createTestTexture(20, 22);
    vi.spyOn(Assets, "load").mockImplementation(async () => loaded as any);

    const textures = await loadGame002SymbolTextures({
      A: "/assets/A.png",
      B: {
        normal: existing,
        states: {
          spinBlur: "/assets/B.spinBlur.png",
          disabled: existing,
        },
      },
      C: {
        normal: { kind: "single", texture: "/assets/C.png" },
        states: {},
      },
      D: {
        normal: {
          kind: "layered",
          layers: [
            {
              index: 0,
              texture: "/assets/D-0.png",
              keyframes: ["/assets/D-0.png", existing],
            },
          ],
        },
        states: {},
      },
    });

    expect(textures.A).toBe(loaded);
    expect(textures.B).toMatchObject({
      normal: existing,
      states: {
        spinBlur: loaded,
        disabled: existing,
      },
    });
    expect(textures.C).toMatchObject({
      normal: { kind: "single", texture: loaded },
    });
    expect(textures.D).toMatchObject({
      normal: {
        kind: "layered",
        layers: [
          {
            index: 0,
            texture: loaded,
            keyframes: [loaded, existing],
          },
        ],
      },
    });
  });
});

function createModules(symbols: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    symbols.flatMap((symbol) => [
      [`../../../assets/symbols002/${symbol}.png`, `/assets/${symbol}.png`],
      [
        `../../../assets/symbols002/${symbol}.spinBlur.png`,
        `/assets/${symbol}.spinBlur.png`,
      ],
      [
        `../../../assets/symbols002/${symbol}.disabled.png`,
        `/assets/${symbol}.disabled.png`,
      ],
    ]),
  );
}
