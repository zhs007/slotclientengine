import { createGameConfig } from "@slotclientengine/logiccore";
import {
  SymbolStateSequenceController,
  createDefaultSymbolStatePreset,
  createSymbolCatalog,
} from "@slotclientengine/rendercore";
import game2Config from "../../../assets/gamecfg/game2.json";
import { describe, expect, it } from "vitest";
import {
  SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
  createSymbolAssetMapFromModules,
  createSymbolScaleMapFromManifest,
  createStatefulSymbolAssetMapFromModules,
  createSymbolsViewerCatalog,
  createSymbolsViewerStandaloneCatalog,
  getSymbolNameFromPath,
} from "../src/symbol-assets.js";
import {
  DEFAULT_VIEWER_SEQUENCE,
  moveSequenceStep,
  removeSequenceStep,
  replaceSequenceStep,
} from "../src/viewer-sequence.js";

const blankSymbol = ["B", "N"].join("");
const redSymbol = ["R", "S"].join("");
const symbolModulePath = (symbol: string, suffix = "") =>
  `../../../assets/symbols/${symbol}${suffix}.png`;
const symbolUrl = (symbol: string, suffix = "") =>
  `/assets/${symbol}${suffix}.png`;

describe("symbolsviewer assets", () => {
  it("parses game2 config and converts asset glob modules into a symbol asset map", () => {
    const assets = createSymbolAssetMapFromModules({
      "../../../assets/symbols/S00.png": "/assets/S00.png",
      "../../../assets/symbols/SX.png": "/assets/SX.png",
    });

    expect(getSymbolNameFromPath("../../../assets/symbols/S10.png")).toBe(
      "S10",
    );
    expect(assets).toEqual({
      S00: "/assets/S00.png",
      SX: "/assets/SX.png",
    });
    expect(createGameConfig(game2Config).getSymbolCode("S00")).toBe(1);
  });

  it("splits normal and generated state PNGs into a stateful asset map", () => {
    const assets = createStatefulSymbolAssetMapFromModules({
      modules: {
        "../../../assets/symbols/S00.png": "/assets/S00.png",
        "../../../assets/symbols/S00.spinBlur.png": "/assets/S00.spinBlur.png",
        "../../../assets/symbols/S00.disabled.png": "/assets/S00.disabled.png",
        "../../../assets/symbols/SX.png": "/assets/SX.png",
      },
      manifest: createManifest(["S00"]),
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    });

    expect(Object.keys(assets)).toEqual(["S00"]);
    expect(Object.keys(assets)).not.toContain("S00.spinBlur");
    expect(assets).toEqual({
      S00: {
        normal: "/assets/S00.png",
        states: {
          spinBlur: "/assets/S00.spinBlur.png",
          disabled: "/assets/S00.disabled.png",
        },
      },
    });
  });

  it("creates symbol scale maps from manifest data with explicit-scale enforcement", () => {
    expect(
      createSymbolScaleMapFromManifest({
        manifest: createManifest(["S00"]),
        displaySymbols: ["S00"],
      }),
    ).toEqual({ S00: 1 });

    expect(
      createSymbolScaleMapFromManifest({
        manifest: createManifest(["WL", blankSymbol], 0.8),
        displaySymbols: ["WL", blankSymbol],
        requireExplicitScale: true,
      }),
    ).toEqual({ WL: 0.8, [blankSymbol]: 0.8 });

    expect(() =>
      createSymbolScaleMapFromManifest({
        manifest: createManifest(["S00"]),
        displaySymbols: ["S00"],
        requireExplicitScale: true,
      }),
    ).toThrow(/S00.*scale/);

    expect(() =>
      createSymbolScaleMapFromManifest({
        manifest: createManifest(["S00"], 0),
        displaySymbols: ["S00"],
      }),
    ).toThrow(/S00.*scale/);
  });

  it("assembles manifest layered normals without exposing layer files as symbols", () => {
    const assets = createStatefulSymbolAssetMapFromModules({
      modules: {
        [symbolModulePath(redSymbol)]: symbolUrl(redSymbol),
        [symbolModulePath(redSymbol, "-0")]: symbolUrl(redSymbol, "-0"),
        [symbolModulePath(redSymbol, "-1")]: symbolUrl(redSymbol, "-1"),
        [symbolModulePath(redSymbol, "-2")]: symbolUrl(redSymbol, "-2"),
        [symbolModulePath(redSymbol, ".spinBlur")]: symbolUrl(
          redSymbol,
          ".spinBlur",
        ),
        [symbolModulePath(redSymbol, ".disabled")]: symbolUrl(
          redSymbol,
          ".disabled",
        ),
      },
      manifest: createManifest([redSymbol]),
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    });

    expect(Object.keys(assets)).toEqual([redSymbol]);
    expect(Object.keys(assets)).not.toContain(`${redSymbol}-0`);
    expect(assets[redSymbol]).toMatchObject({
      normal: {
        kind: "layered",
        layers: [
          { index: 0, texture: symbolUrl(redSymbol, "-0") },
          { index: 1, texture: symbolUrl(redSymbol, "-1") },
          { index: 2, texture: symbolUrl(redSymbol, "-2") },
        ],
      },
      states: {
        spinBlur: symbolUrl(redSymbol, ".spinBlur"),
        disabled: symbolUrl(redSymbol, ".disabled"),
      },
    });
  });

  it("parses SC keyframe layers without exposing keyframe files as symbols", () => {
    const modules = createViewerModules(["SC"], []);
    const assets = createStatefulSymbolAssetMapFromModules({
      modules,
      manifest: createManifest(["SC"]),
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    });

    expect(Object.keys(assets)).toEqual(["SC"]);
    expect(Object.keys(assets)).not.toContain("SC-1-0");
    expect(assets.SC).toMatchObject({
      normal: {
        kind: "layered",
        layers: [
          { index: 0, texture: "/assets/SC-0.png" },
          {
            index: 1,
            texture: "/assets/SC-1-0.png",
            keyframes: [
              "/assets/SC-1-0.png",
              "/assets/SC-1-1.png",
              "/assets/SC-1-2.png",
              "/assets/SC-1-3.png",
              "/assets/SC-1-4.png",
            ],
          },
          { index: 2, texture: "/assets/SC-2.png" },
        ],
      },
    });
  });

  it("rejects missing state texture files and unknown state declarations", () => {
    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.disabled.png":
            "/assets/S00.disabled.png",
        },
        manifest: createManifest(["S00"]),
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      }),
    ).toThrow(/spinBlur/);

    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.spinBlur.png":
            "/assets/S00.spinBlur.png",
          "../../../assets/symbols/S00.disabled.png":
            "/assets/S00.disabled.png",
          "../../../assets/symbols/S00.blurred.png": "/assets/S00.blurred.png",
        },
        manifest: createManifest(["S00"]),
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      }),
    ).toThrow(/unknown state "blurred"/);

    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.spinBlur.png":
            "/assets/S00.spinBlur.png",
          "../../../assets/symbols/S00.disabled.png":
            "/assets/S00.disabled.png",
        },
        manifest: {
          ...createManifest(["S00"], 1),
          symbols: {
            S00: {
              ...createManifest(["S00"], 1).symbols.S00,
              unexpected: "./S00.unexpected.png",
            },
          },
        },
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      }),
    ).toThrow(/unknown field "unexpected"/);

    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.spinBlur.png":
            "/assets/S00.spinBlur.png",
          "../../../assets/symbols/S00.disabled.png":
            "/assets/S00.disabled.png",
        },
        manifest: {
          ...createManifest(["S00"]),
          states: ["spinBlur", "disabled", "blurred"],
        },
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      }),
    ).toThrow(/unknown state "blurred"/);

    const missingKeyframeModules = createViewerModules(["SC"], []);
    delete missingKeyframeModules["../../../assets/symbols/SC-1-3.png"];
    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: missingKeyframeModules,
        manifest: createManifest(["SC"]),
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      }),
    ).toThrow(/SC-1-3/);

    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: createViewerModules(["SC"], []),
        manifest: {
          ...createManifest(["SC"]),
          symbols: {
            SC: {
              normal: {
                kind: "layered",
                layers: [
                  "./SC-0.png",
                  {
                    index: 1,
                    texture: "./SC-1-0.png",
                    keyframes: ["./SC-1-1.png", "./SC-1-0.png"],
                  },
                  "./SC-2.png",
                ],
              },
              spinBlur: "./SC.spinBlur.png",
              disabled: "./SC.disabled.png",
            },
          },
        },
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      }),
    ).toThrow(/start with the layer texture/);
  });

  it("keeps only the paytable and image intersection for display with required state textures", () => {
    const catalog = createSymbolsViewerCatalog(
      game2Config,
      createViewerStatefulAssets(),
    );

    expect(catalog.getValidation()).toMatchObject({
      displayableSymbols: [
        "S00",
        "S0",
        "S1",
        "S5",
        "S10",
        "SC",
        redSymbol,
        "X2",
        "X5",
        "X10",
      ],
      ignoredPaytableSymbolsWithoutAssets: [blankSymbol],
      ignoredAssetsWithoutPaytable: [],
    });
    expect(catalog.getTextureSet("SC").normal).toMatchObject({
      kind: "layered",
      layers: [
        { index: 0, texture: "/assets/SC-0.png" },
        {
          index: 1,
          texture: "/assets/SC-1-0.png",
          keyframes: [
            "/assets/SC-1-0.png",
            "/assets/SC-1-1.png",
            "/assets/SC-1-2.png",
            "/assets/SC-1-3.png",
            "/assets/SC-1-4.png",
          ],
        },
        { index: 2, texture: "/assets/SC-2.png" },
      ],
    });
    expect(catalog.getTextureSet(redSymbol).normal).toMatchObject({
      kind: "layered",
      layers: [
        { index: 0, texture: symbolUrl(redSymbol, "-0") },
        { index: 1, texture: symbolUrl(redSymbol, "-1") },
        { index: 2, texture: symbolUrl(redSymbol, "-2") },
      ],
    });
  });

  it("matches rendercore catalog behavior for the default viewer fixture", () => {
    const catalog = createSymbolCatalog({
      gameConfig: createGameConfig(game2Config),
      assets: {
        S00: "/assets/S00.png",
        S0: "/assets/S0.png",
        S1: "/assets/S1.png",
        S5: "/assets/S5.png",
        S10: "/assets/S10.png",
        SC: "/assets/SC.png",
        [redSymbol]: symbolUrl(redSymbol),
        X2: "/assets/X2.png",
        X5: "/assets/X5.png",
        X10: "/assets/X10.png",
        CO: "/assets/CO.png",
        SX: "/assets/SX.png",
      },
    });

    expect(catalog.getDisplayableSymbols()).toEqual([
      "S00",
      "S0",
      "S1",
      "S5",
      "S10",
      "SC",
      redSymbol,
      "X2",
      "X5",
      "X10",
    ]);
  });

  it("creates a standalone viewer catalog for paytable-free transparent symbols", () => {
    const catalog = createSymbolsViewerStandaloneCatalog({
      symbolAssets: {
        normal: {
          normal: { kind: "transparent", width: 172, height: 158 },
          states: {},
        },
        wild: {
          normal: "/assets/game003-s1/wild.png",
          states: {},
        },
        up: {
          normal: "/assets/game003-s1/up.png",
          states: {},
        },
      },
      displaySymbols: ["normal", "wild", "up"],
      symbolScales: { normal: 1, wild: 1, up: 1 },
      requiredStateTextures: [],
    });

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: ["normal", "wild", "up"],
      ignoredPaytableSymbolsWithoutAssets: [],
      ignoredAssetsWithoutPaytable: [],
    });
    const transparentSymbol = catalog.createRenderSymbol("normal");
    const transparentLayer = transparentSymbol.getLayerSprites()[0];
    expect(transparentLayer).toMatchObject({
      transparent: true,
      width: 172,
      height: 158,
    });
    expect(transparentLayer?.sprite.alpha).toBe(0);
    transparentSymbol.destroy({ children: true });
  });
});

function createViewerStatefulAssets() {
  const displayableSymbols = [
    "S00",
    "S0",
    "S1",
    "S5",
    "S10",
    "SC",
    redSymbol,
    "X2",
    "X5",
    "X10",
  ];
  return createStatefulSymbolAssetMapFromModules({
    modules: createViewerModules(displayableSymbols, ["CO", "SX"]),
    manifest: createManifest(displayableSymbols),
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
  });
}

function createViewerModules(
  symbols: readonly string[],
  orphanSymbols: readonly string[],
) {
  const compositeLayerCounts: Record<string, number> = {
    SC: 3,
    [redSymbol]: 3,
    X2: 2,
    X5: 2,
    X10: 2,
  };

  return Object.fromEntries(
    [...symbols, ...orphanSymbols].flatMap((symbol) => {
      const normal = [
        `../../../assets/symbols/${symbol}.png`,
        `/assets/${symbol}.png`,
      ] as const;
      const layers =
        symbol === "SC"
          ? createScLayerModules()
          : Array.from(
              { length: compositeLayerCounts[symbol] ?? 0 },
              (_unused, index) =>
                [
                  `../../../assets/symbols/${symbol}-${index}.png`,
                  `/assets/${symbol}-${index}.png`,
                ] as const,
            );
      if (orphanSymbols.includes(symbol)) {
        return [normal];
      }
      return [
        normal,
        ...layers,
        [
          `../../../assets/symbols/${symbol}.spinBlur.png`,
          `/assets/${symbol}.spinBlur.png`,
        ] as const,
        [
          `../../../assets/symbols/${symbol}.disabled.png`,
          `/assets/${symbol}.disabled.png`,
        ] as const,
      ];
    }),
  );
}

function createScLayerModules() {
  return [
    ["../../../assets/symbols/SC-0.png", "/assets/SC-0.png"] as const,
    ["../../../assets/symbols/SC-1-0.png", "/assets/SC-1-0.png"] as const,
    ["../../../assets/symbols/SC-1-1.png", "/assets/SC-1-1.png"] as const,
    ["../../../assets/symbols/SC-1-2.png", "/assets/SC-1-2.png"] as const,
    ["../../../assets/symbols/SC-1-3.png", "/assets/SC-1-3.png"] as const,
    ["../../../assets/symbols/SC-1-4.png", "/assets/SC-1-4.png"] as const,
    ["../../../assets/symbols/SC-2.png", "/assets/SC-2.png"] as const,
  ];
}

function createManifest(symbols: readonly string[], scale?: number) {
  const compositeLayers: Record<string, readonly unknown[]> = {
    SC: [
      "./SC-0.png",
      {
        index: 1,
        texture: "./SC-1-0.png",
        keyframes: [
          "./SC-1-0.png",
          "./SC-1-1.png",
          "./SC-1-2.png",
          "./SC-1-3.png",
          "./SC-1-4.png",
        ],
      },
      "./SC-2.png",
    ],
    [redSymbol]: [
      `./${redSymbol}-0.png`,
      `./${redSymbol}-1.png`,
      `./${redSymbol}-2.png`,
    ],
    X2: ["./X2-0.png", "./X2-1.png"],
    X5: ["./X5-0.png", "./X5-1.png"],
    X10: ["./X10-0.png", "./X10-1.png"],
  };

  return {
    version: 1,
    states: ["spinBlur", "disabled"],
    symbols: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        {
          normal: compositeLayers[symbol]
            ? {
                kind: "layered",
                layers: compositeLayers[symbol],
              }
            : `./${symbol}.png`,
          spinBlur: `./${symbol}.spinBlur.png`,
          disabled: `./${symbol}.disabled.png`,
          ...(scale === undefined ? {} : { scale }),
        },
      ]),
    ),
  };
}

describe("symbolsviewer sequence helpers", () => {
  it("provides the default global sequence and supports edit operations", () => {
    expect(DEFAULT_VIEWER_SEQUENCE.map((step) => step.state)).toEqual([
      "normal",
      "appear",
      "win",
      "spinBlur",
      "disabled",
    ]);

    const removed = removeSequenceStep(DEFAULT_VIEWER_SEQUENCE, 1);
    expect(removed.map((step) => step.state)).not.toContain("appear");

    const moved = moveSequenceStep(removed, 0, removed.length - 1);
    expect(moved.at(-1)?.state).toBe("normal");

    const replaced = replaceSequenceStep(moved, 0, { state: "appear" });
    expect(replaced[0]).toEqual({ state: "appear" });
  });

  it("feeds rendercore sequence controller after add, remove and reorder changes", () => {
    const controller = new SymbolStateSequenceController({
      statePreset: createDefaultSymbolStatePreset(),
      steps: DEFAULT_VIEWER_SEQUENCE,
    });

    controller.removeStep(1);
    controller.moveStep(0, 1);
    controller.addStep({ state: "appear" }, 1);

    expect(controller.getSteps().map((step) => step.state)).toEqual([
      "win",
      "appear",
      "normal",
      "spinBlur",
      "disabled",
    ]);
  });
});
