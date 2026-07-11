import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Assets } from "pixi.js";
import symbols001StateTextureManifest from "../../../assets/symbols001/symbol-state-textures.manifest.json";
import stateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import symbols003StateTextureManifest from "../../../assets/symbols003/symbol-state-textures.manifest.json";
import game002S2StateTextureManifest from "../../../assets/game002-s2/symbol-state-textures.manifest.json";
import game002S3StateTextureManifest from "../../../assets/game002-s3/symbol-state-textures.manifest.json";
import { createTestTexture } from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  GAME002_DISPLAY_SYMBOLS,
  GAME002_EMPTY_SYMBOLS,
  GAME002_REQUIRED_STATE_TEXTURES,
  createGame002SymbolScaleMapFromManifest,
  createGame002SymbolAssetMapFromModules,
  loadGame002SymbolTextures,
} from "../src/assets.js";
import {
  GAME002_SKIN1_DISPLAY_SYMBOLS,
  GAME002_SKIN3_DISPLAY_SYMBOLS,
  GAME002_SKIN4_DISPLAY_SYMBOLS,
  GAME002_SKIN5_DISPLAY_SYMBOLS,
  getGame002SkinConfig,
} from "../src/skin-config.js";
import {
  GAME002_ART_SIZE,
  GAME002_SKIN1_FOCUS_REGION,
  GAME002_SKIN1_GRID_LAYOUT,
  GAME002_SKIN2_FOCUS_REGION,
  GAME002_SKIN3_FOCUS_REGION,
  GAME002_SKIN4_FOCUS_REGION,
  GAME002_SKIN4_GRID_LAYOUT,
  GAME002_SKIN5_FOCUS_REGION,
  GAME002_SKIN5_GRID_LAYOUT,
  validateGame002FocusRegion,
} from "../src/game-layout.js";

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
        normal: `/assets/symbols002/${symbol}.png`,
        states: {
          spinBlur: `/assets/symbols002/${symbol}.spinBlur.png`,
          disabled: `/assets/symbols002/${symbol}.disabled.png`,
        },
      });
    }
  });

  it("declares explicit skin configs without sharing symbol directories", () => {
    const skin1 = getGame002SkinConfig("1");
    const skin2 = getGame002SkinConfig("2");
    const skin3 = getGame002SkinConfig("3");
    const skin4 = getGame002SkinConfig("4");
    const skin5 = getGame002SkinConfig("5");

    expect(skin1).toMatchObject({
      id: "1",
      label: "skin 1",
      backgroundLabel: "skin 1 bg.jpg",
      displaySymbols: GAME002_SKIN1_DISPLAY_SYMBOLS,
      emptySymbols: [],
    });
    expect(skin2).toMatchObject({
      id: "2",
      label: "skin 2",
      backgroundLabel: "skin 2 bgfull.jpg",
      displaySymbols: GAME002_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
    });
    expect(skin3).toMatchObject({
      id: "3",
      label: "skin 3",
      backgroundLabel: "skin 3 bg.jpg",
      displaySymbols: GAME002_SKIN3_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
    });
    expect(skin4).toMatchObject({
      id: "4",
      label: "skin 4",
      backgroundLabel: "skin 4 bg.png",
      displaySymbols: GAME002_SKIN4_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
    });
    expect(skin5).toMatchObject({
      id: "5",
      label: "skin 5",
      backgroundLabel: "skin 5 bg.jpg",
      displaySymbols: GAME002_SKIN5_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
    });
    expect(skin1.backgroundUrl).toContain("bg");
    expect(skin2.backgroundUrl).toContain("bgfull");
    expect(skin3.backgroundUrl).toContain("bg");
    expect(skin4.backgroundUrl).toContain("bg");
    expect(skin5.backgroundUrl).toContain("bg");
    expect(skin1.gridLayout.boardFrame).toEqual({
      x: 620,
      y: 465,
      width: 750,
      height: 1200,
    });
    expect(skin1.gridLayout).toBe(GAME002_SKIN1_GRID_LAYOUT);
    expect(skin4.gridLayout).toBe(GAME002_SKIN4_GRID_LAYOUT);
    expect(skin5.gridLayout).toBe(GAME002_SKIN5_GRID_LAYOUT);
    expect(skin4.gridLayout).toEqual(skin2.gridLayout);
    expect(skin5.gridLayout).toEqual(skin3.gridLayout);
    expect(skin1.focusRegion).toEqual(GAME002_SKIN1_FOCUS_REGION);
    expect(skin2.focusRegion).toEqual(GAME002_SKIN2_FOCUS_REGION);
    expect(skin3.focusRegion).toEqual(GAME002_SKIN3_FOCUS_REGION);
    expect(skin4.focusRegion).toEqual(GAME002_SKIN4_FOCUS_REGION);
    expect(skin5.focusRegion).toEqual(GAME002_SKIN5_FOCUS_REGION);
    expect(skin4.focusRegion).toEqual(skin2.focusRegion);
    expect(skin5.focusRegion).toEqual(skin3.focusRegion);
    for (const skin of [skin1, skin2, skin3, skin4, skin5]) {
      expect(() =>
        validateGame002FocusRegion(skin.focusRegion, GAME002_ART_SIZE),
      ).not.toThrow();
    }
    expect(
      Object.keys(skin1.symbolModules).every((key) =>
        key.includes("symbols001"),
      ),
    ).toBe(true);
    expect(
      Object.keys(skin2.symbolModules).every((key) =>
        key.includes("symbols002"),
      ),
    ).toBe(true);
    expect(
      Object.keys(skin3.symbolModules).every((key) =>
        key.includes("symbols003"),
      ),
    ).toBe(true);
    expect(
      Object.keys(skin4.symbolModules).every((key) =>
        key.includes("game002-s2"),
      ),
    ).toBe(true);
    expect(
      Object.keys(skin5.symbolModules).every((key) =>
        key.includes("game002-s3"),
      ),
    ).toBe(true);
    expect(Object.keys(skin4.symbolModules)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("/bg.png")]),
    );
    expect(skin1.symbolModules).not.toBe(skin2.symbolModules);
    expect(skin1.symbolModules).not.toBe(skin3.symbolModules);
    expect(skin3.symbolModules).not.toBe(skin2.symbolModules);
    expect(skin4.symbolModules).not.toBe(skin2.symbolModules);
    expect(skin5.symbolModules).not.toBe(skin3.symbolModules);
    expect(skin1.stateTextureManifest).toBe(symbols001StateTextureManifest);
    expect(skin3.stateTextureManifest).toBe(symbols003StateTextureManifest);
    expect(skin4.stateTextureManifest).toBe(game002S2StateTextureManifest);
    expect(skin5.stateTextureManifest).toBe(game002S3StateTextureManifest);
    expect(skin1.symbolScales).toEqual(
      Object.fromEntries(
        GAME002_SKIN1_DISPLAY_SYMBOLS.map((symbol) => [symbol, 0.8]),
      ),
    );
    expect(skin2.symbolScales).toEqual(
      Object.fromEntries(GAME002_DISPLAY_SYMBOLS.map((symbol) => [symbol, 1])),
    );
    expect(skin3.symbolScales).toEqual(
      Object.fromEntries(
        GAME002_SKIN3_DISPLAY_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
    expect(skin4.symbolScales).toEqual(
      Object.fromEntries(
        GAME002_SKIN4_DISPLAY_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
    expect(skin5.symbolScales).toEqual(
      Object.fromEntries(
        GAME002_SKIN5_DISPLAY_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
  });

  it("creates skin scale maps from manifest data with explicit-scale enforcement", () => {
    expect(
      createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: symbols001StateTextureManifest,
        displaySymbols: GAME002_SKIN1_DISPLAY_SYMBOLS,
        requireExplicitScale: true,
      }),
    ).toEqual(
      Object.fromEntries(
        GAME002_SKIN1_DISPLAY_SYMBOLS.map((symbol) => [symbol, 0.8]),
      ),
    );

    expect(
      createGame002SymbolScaleMapFromManifest({
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
    ).toEqual({ WL: 1 });

    expect(() =>
      createGame002SymbolScaleMapFromManifest({
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
        requireExplicitScale: true,
      }),
    ).toThrow(/WL.*scale/);

    expect(() =>
      createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur", "disabled"],
          symbols: {
            WL: {
              normal: "./WL.png",
              spinBlur: "./WL.spinBlur.png",
              disabled: "./WL.disabled.png",
              scale: -1,
            },
          },
        },
        displaySymbols: ["WL"],
      }),
    ).toThrow(/WL.*scale/);
  });

  it("builds the symbols001 asset map including the transparent BN texture", () => {
    const assets = createGame002SymbolAssetMapFromModules({
      modules: createModules(GAME002_SKIN1_DISPLAY_SYMBOLS, "symbols001"),
      stateTextureManifest: symbols001StateTextureManifest,
      displaySymbols: GAME002_SKIN1_DISPLAY_SYMBOLS,
      emptySymbols: [],
    });

    expect(Object.keys(assets)).toEqual(GAME002_SKIN1_DISPLAY_SYMBOLS);
    expect(Object.keys(assets)).not.toEqual(
      expect.arrayContaining(["WM", "CM", "CO", "AF"]),
    );
    expect(assets.BN).toMatchObject({
      normal: "/assets/symbols001/BN.png",
      states: {
        spinBlur: "/assets/symbols001/BN.spinBlur.png",
        disabled: "/assets/symbols001/BN.disabled.png",
      },
    });
    for (const symbol of GAME002_SKIN1_DISPLAY_SYMBOLS) {
      expect(assets[symbol]).toMatchObject({
        normal: `/assets/symbols001/${symbol}.png`,
        states: {
          spinBlur: `/assets/symbols001/${symbol}.spinBlur.png`,
          disabled: `/assets/symbols001/${symbol}.disabled.png`,
        },
      });
    }
  });

  it("builds the symbols003 asset map from its own manifest and required states", () => {
    const assets = createGame002SymbolAssetMapFromModules({
      modules: createModules(GAME002_SKIN3_DISPLAY_SYMBOLS, "symbols003"),
      stateTextureManifest: symbols003StateTextureManifest,
      displaySymbols: GAME002_SKIN3_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
    });

    expect(Object.keys(assets)).toEqual(GAME002_SKIN3_DISPLAY_SYMBOLS);
    expect(Object.keys(assets)).not.toEqual(
      expect.arrayContaining(["WM", "CM", "AF", "BN"]),
    );
    for (const symbol of GAME002_SKIN3_DISPLAY_SYMBOLS) {
      expect(assets[symbol]).toMatchObject({
        normal: `/assets/symbols003/${symbol}.png`,
        states: {
          spinBlur: `/assets/symbols003/${symbol}.spinBlur.png`,
          disabled: `/assets/symbols003/${symbol}.disabled.png`,
        },
      });
    }
  });

  it("builds the game002-s2 asset map from its own manifest and excludes bg.png", () => {
    const assets = createGame002SymbolAssetMapFromModules({
      modules: {
        ...createModules(GAME002_SKIN4_DISPLAY_SYMBOLS, "game002-s2"),
        "../../../assets/game002-s2/bg.png": "/assets/game002-s2/bg.png",
      },
      stateTextureManifest: game002S2StateTextureManifest,
      displaySymbols: GAME002_SKIN4_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
    });

    expect(Object.keys(assets)).toEqual(GAME002_SKIN4_DISPLAY_SYMBOLS);
    expect(Object.keys(assets)).not.toEqual(
      expect.arrayContaining(["WM", "CM", "AF", "BN", "bg"]),
    );
    for (const symbol of GAME002_SKIN4_DISPLAY_SYMBOLS) {
      expect(assets[symbol]).toMatchObject({
        normal: `/assets/game002-s2/${symbol}.png`,
        states: {
          spinBlur: `/assets/game002-s2/${symbol}.spinBlur.png`,
          disabled: `/assets/game002-s2/${symbol}.disabled.png`,
        },
      });
    }
  });

  it("builds the game002-s3 asset map from its own manifest and required states", () => {
    const assets = createGame002SymbolAssetMapFromModules({
      modules: createModules(GAME002_SKIN5_DISPLAY_SYMBOLS, "game002-s3"),
      stateTextureManifest: game002S3StateTextureManifest,
      displaySymbols: GAME002_SKIN5_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
    });

    expect(Object.keys(assets)).toEqual(GAME002_SKIN5_DISPLAY_SYMBOLS);
    expect(Object.keys(assets)).not.toContain("BN");
    for (const symbol of GAME002_SKIN5_DISPLAY_SYMBOLS) {
      expect(assets[symbol]).toMatchObject({
        normal: `/assets/game002-s3/${symbol}.png`,
        states: {
          spinBlur: `/assets/game002-s3/${symbol}.spinBlur.png`,
          disabled: `/assets/game002-s3/${symbol}.disabled.png`,
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
        modules: createModules(GAME002_SKIN3_DISPLAY_SYMBOLS, "symbols003"),
        stateTextureManifest: symbols003StateTextureManifest,
        displaySymbols: GAME002_SKIN3_DISPLAY_SYMBOLS,
        emptySymbols: GAME002_EMPTY_SYMBOLS,
      }),
    ).not.toThrow();

    const missingSkin3StateModules = createModules(
      GAME002_SKIN3_DISPLAY_SYMBOLS,
      "symbols003",
    );
    delete missingSkin3StateModules[
      "../../../assets/symbols003/WL.disabled.png"
    ];
    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: missingSkin3StateModules,
        stateTextureManifest: symbols003StateTextureManifest,
        displaySymbols: GAME002_SKIN3_DISPLAY_SYMBOLS,
        emptySymbols: GAME002_EMPTY_SYMBOLS,
      }),
    ).toThrow(/WL\.disabled/);

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
    ).toThrow(/unknown state "foo"/);

    expect(() =>
      createGame002SymbolAssetMapFromModules({
        modules: createModules(["WL"]),
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur", "disabled"],
          symbols: {
            WL: {
              normal: "./WL.png",
              spinBlur: "./WL.spinBlur.png",
              disabled: "./WL.disabled.png",
              scale: 1,
              unexpected: "./WL.unexpected.png",
            },
          },
        },
        displaySymbols: ["WL"],
      }),
    ).toThrow(/unknown field "unexpected"/);
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
      E: {
        normal: { kind: "transparent", width: 172, height: 158 },
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
    expect(textures.E).toEqual({
      normal: { kind: "transparent", width: 172, height: 158 },
      states: {},
    });
  });

  it("locks runtime and legacy background image dimensions", () => {
    expect(
      readJpegSize(resolve(__dirname, "../../../assets/game002/bg.jpg")),
    ).toEqual({
      width: 1125,
      height: 2000,
    });
    expect(
      readJpegSize(resolve(__dirname, "../../../assets/game002-s1/bg.jpg")),
    ).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(
      readJpegSize(resolve(__dirname, "../../../assets/game002/bgfull.jpg")),
    ).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(
      readJpegSize(resolve(__dirname, "../../../assets/game003/bg.jpg")),
    ).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(
      readPngSize(resolve(__dirname, "../../../assets/game002-s2/bg.png")),
    ).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(
      readJpegSize(resolve(__dirname, "../../../assets/game002-s3/bg.jpg")),
    ).toEqual({
      width: 2000,
      height: 2000,
    });
  });
});

function createModules(
  symbols: readonly string[],
  directory = "symbols002",
): Record<string, string> {
  return Object.fromEntries(
    symbols.flatMap((symbol) => [
      [
        `../../../assets/${directory}/${symbol}.png`,
        `/assets/${directory}/${symbol}.png`,
      ],
      [
        `../../../assets/${directory}/${symbol}.spinBlur.png`,
        `/assets/${directory}/${symbol}.spinBlur.png`,
      ],
      [
        `../../../assets/${directory}/${symbol}.disabled.png`,
        `/assets/${directory}/${symbol}.disabled.png`,
      ],
    ]),
  );
}

function readJpegSize(file: string): {
  readonly width: number;
  readonly height: number;
} {
  const bytes = readFileSync(file);
  let offset = 2;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`${file} is not a JPEG file.`);
  }

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return Object.freeze({
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      });
    }
    offset += 2 + length;
  }

  throw new Error(`${file} does not contain a JPEG size marker.`);
}

function readPngSize(file: string): {
  readonly width: number;
  readonly height: number;
} {
  const bytes = readFileSync(file);
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    throw new Error(`${file} is not a PNG file.`);
  }
  return Object.freeze({
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  });
}
