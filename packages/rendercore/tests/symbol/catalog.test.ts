import { createGameConfig } from "@slotclientengine/logiccore";
import game2Config from "../../../../assets/gamecfg/game2.json";
import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  SymbolAssetError,
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createSymbolCatalog,
} from "../../src/symbol/index.js";

const createCatalog = () =>
  createSymbolCatalog({
    gameConfig: createGameConfig(game2Config),
    assets: {
      S00: "S00.png",
      S0: "S0.png",
      S1: "S1.png",
      S5: "S5.png",
      S10: "S10.png",
      SX: "SX.png",
    },
    statePreset: createDefaultSymbolStatePreset(),
    animationResolver: createDefaultSymbolAnimationResolver(),
  });

const createTestTexture = (width = 16, height = 18) => {
  const texture = new Texture({ source: Texture.WHITE.source });
  Object.defineProperty(texture, "width", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(texture, "height", {
    configurable: true,
    value: height,
  });
  return texture;
};

describe("createSymbolCatalog", () => {
  it("builds displayable symbols from the current game2 paytable and symbol assets", () => {
    const catalog = createCatalog();

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: ["S00", "S0", "S1", "S5", "S10"],
      ignoredPaytableSymbolsWithoutAssets: [
        "BN",
        "SC",
        "RS",
        "X2",
        "X5",
        "X10",
      ],
      ignoredAssetsWithoutPaytable: ["SX"],
    });
    expect(catalog.getDisplayableSymbols()).toEqual([
      "S00",
      "S0",
      "S1",
      "S5",
      "S10",
    ]);
  });

  it("normalizes legacy assets into texture sets while keeping getAsset compatible", () => {
    const catalog = createCatalog();

    expect(catalog.getAsset("S00")).toBe("S00.png");
    expect(catalog.getTextureSet("S00")).toEqual({
      normal: {
        kind: "single",
        texture: "S00.png",
      },
      states: {},
    });
    expect(catalog.getNormalTextureSource("S00")).toEqual({
      kind: "single",
      texture: "S00.png",
    });
  });

  it("accepts loaded state texture sets and passes them into render symbols", () => {
    const spinBlurTexture = new Texture({ source: Texture.WHITE.source });
    const disabledTexture = new Texture({ source: Texture.WHITE.source });
    const catalog = createSymbolCatalog({
      gameConfig: createGameConfig(game2Config),
      assets: {
        S00: {
          normal: Texture.WHITE,
          states: {
            spinBlur: spinBlurTexture,
            disabled: disabledTexture,
          },
        },
      },
      texturePolicy: {
        requiredStateTextures: ["spinBlur", "disabled"],
      },
    });

    expect(catalog.getTextureSet("S00")).toEqual({
      normal: {
        kind: "single",
        texture: Texture.WHITE,
      },
      states: {
        spinBlur: spinBlurTexture,
        disabled: disabledTexture,
      },
    });
    const renderSymbol = catalog.createRenderSymbol("S00");
    expect(renderSymbol.stateTextures.spinBlur).toBe(spinBlurTexture);
    expect(renderSymbol.stateTextures.disabled).toBe(disabledTexture);
    expect(renderSymbol.requiredStateTextures).toEqual([
      "spinBlur",
      "disabled",
    ]);
  });

  it("accepts layered normal texture sources without treating layer 0 as a legacy asset", () => {
    const bottom = createTestTexture(20, 24);
    const top = createTestTexture(20, 24);
    const openFrame = createTestTexture(20, 24);
    const catalog = createSymbolCatalog({
      gameConfig: createGameConfig(game2Config),
      assets: {
        SC: {
          normal: {
            kind: "layered",
            layers: [
              { index: 1, texture: top },
              { index: 0, texture: bottom, keyframes: [bottom, openFrame] },
            ],
          },
          states: {
            spinBlur: createTestTexture(20, 24),
            disabled: createTestTexture(20, 24),
          },
        },
      },
      texturePolicy: {
        requiredStateTextures: ["spinBlur", "disabled"],
      },
    });

    expect(() => catalog.getAsset("SC")).toThrow(/layered/);
    expect(catalog.getNormalTextureSource("SC")).toMatchObject({
      kind: "layered",
      layers: [
        { index: 0, texture: bottom },
        { index: 1, texture: top },
      ],
    });
    const renderSymbol = catalog.createRenderSymbol("SC");
    expect(renderSymbol.getLayerSprites().map((layer) => layer.index)).toEqual([
      0, 1,
    ]);
    expect(renderSymbol.getLayerSprites()[0].sprite.texture).toBe(bottom);
    expect(renderSymbol.getLayerSprites()[0].keyframes).toEqual([
      bottom,
      openFrame,
    ]);
  });

  it("rejects malformed layered normal texture sources", () => {
    expect(() =>
      createSymbolCatalog({
        gameConfig: createGameConfig(game2Config),
        assets: {
          SC: {
            normal: {
              kind: "layered",
              layers: [],
            },
          },
        },
      }),
    ).toThrow(/layers/);

    expect(() =>
      createSymbolCatalog({
        gameConfig: createGameConfig(game2Config),
        assets: {
          SC: {
            normal: {
              kind: "layered",
              layers: [
                { index: 0, texture: createTestTexture() },
                { index: 0, texture: createTestTexture() },
              ],
            },
          },
        },
      }),
    ).toThrow(/duplicate/);

    expect(() =>
      createSymbolCatalog({
        gameConfig: createGameConfig(game2Config),
        assets: {
          SC: {
            normal: {
              kind: "layered",
              layers: [
                { index: 0, texture: createTestTexture(20, 24) },
                { index: 1, texture: createTestTexture(21, 24) },
              ],
            },
          },
        },
      }),
    ).toThrow(/identical dimensions/);

    expect(() =>
      createSymbolCatalog({
        gameConfig: createGameConfig(game2Config),
        assets: {
          SC: {
            normal: {
              kind: "layered",
              layers: [
                {
                  index: 0,
                  texture: createTestTexture(20, 24),
                  keyframes: [],
                },
              ],
            },
          },
        },
      }),
    ).toThrow(/keyframes/);

    expect(() => {
      const texture = createTestTexture(20, 24);
      return createSymbolCatalog({
        gameConfig: createGameConfig(game2Config),
        assets: {
          SC: {
            normal: {
              kind: "layered",
              layers: [
                {
                  index: 0,
                  texture,
                  keyframes: [createTestTexture(20, 24), texture],
                },
              ],
            },
          },
        },
      });
    }).toThrow(/start with the layer texture/);

    expect(() => {
      const texture = createTestTexture(20, 24);
      return createSymbolCatalog({
        gameConfig: createGameConfig(game2Config),
        assets: {
          SC: {
            normal: {
              kind: "layered",
              layers: [
                {
                  index: 0,
                  texture,
                  keyframes: [texture, createTestTexture(21, 24)],
                },
              ],
            },
          },
        },
      });
    }).toThrow(/keyframe textures/);
  });

  it("requires configured state textures only for displayable symbols", () => {
    const spinBlurTexture = new Texture({ source: Texture.WHITE.source });
    const disabledTexture = new Texture({ source: Texture.WHITE.source });
    const catalog = createSymbolCatalog({
      gameConfig: createGameConfig(game2Config),
      assets: {
        S00: {
          normal: Texture.WHITE,
          states: {
            spinBlur: spinBlurTexture,
            disabled: disabledTexture,
          },
        },
        SX: "SX.png",
      },
      texturePolicy: {
        requiredStateTextures: ["spinBlur", "disabled"],
      },
    });

    expect(catalog.getValidation()).toMatchObject({
      displayableSymbols: ["S00"],
      ignoredAssetsWithoutPaytable: ["SX"],
    });
  });

  it("rejects missing required state textures and unknown state texture ids", () => {
    expect(() =>
      createSymbolCatalog({
        gameConfig: createGameConfig(game2Config),
        assets: {
          S00: {
            normal: Texture.WHITE,
            states: {
              disabled: Texture.WHITE,
            },
          },
        },
        texturePolicy: {
          requiredStateTextures: ["spinBlur", "disabled"],
        },
      }),
    ).toThrow(SymbolAssetError);

    expect(() =>
      createSymbolCatalog({
        gameConfig: createGameConfig(game2Config),
        assets: {
          S00: {
            normal: Texture.WHITE,
            states: {
              blurred: Texture.WHITE,
            },
          },
        },
      }),
    ).toThrow(SymbolAssetError);
  });

  it("keeps paytable data on definitions and rejects non-displayable symbols", () => {
    const catalog = createCatalog();
    const definition = catalog.getDefinition("S10");

    expect(definition).toMatchObject({
      code: 5,
      symbol: "S10",
      defaultState: "normal",
    });
    expect(definition.pays).toEqual([0, 0, 0, 0, 0]);
    expect(catalog.getPaytableEntry("S10").code).toBe(5);
    expect(() => catalog.getDefinition("BN")).toThrow(SymbolAssetError);
    expect(() => catalog.getDefinition("SX")).toThrow(SymbolAssetError);
    expect(() => catalog.getPaytableEntry("SX")).toThrow(SymbolAssetError);
  });

  it("does not create render symbols from unloaded URL assets", () => {
    const catalog = createCatalog();

    expect(() => catalog.createRenderSymbol("S00")).toThrow(SymbolAssetError);
  });

  it("does not create render symbols from unloaded state texture URL assets", () => {
    const catalog = createSymbolCatalog({
      gameConfig: createGameConfig(game2Config),
      assets: {
        S00: {
          normal: Texture.WHITE,
          states: {
            spinBlur: "S00.spinBlur.png",
            disabled: Texture.WHITE,
          },
        },
      },
    });

    expect(() => catalog.createRenderSymbol("S00")).toThrow(SymbolAssetError);
  });

  it("does not create render symbols from unloaded layer keyframe URL assets", () => {
    const texture = createTestTexture(20, 24);
    const catalog = createSymbolCatalog({
      gameConfig: createGameConfig(game2Config),
      assets: {
        SC: {
          normal: {
            kind: "layered",
            layers: [
              {
                index: 0,
                texture,
                keyframes: [texture, "/assets/SC-0-1.png"],
              },
            ],
          },
        },
      },
    });

    expect(() => catalog.createRenderSymbol("SC")).toThrow(
      /keyframe texture is a URL string/,
    );
  });

  it("rejects malformed LogicGameConfig-like objects at the catalog boundary", () => {
    expect(() =>
      createSymbolCatalog({
        gameConfig: {
          getRawConfig: () => null,
          getPaytableEntry: () => undefined,
          getSymbolCode: () => undefined,
          getReelNames: () => [],
          getReels: () => {
            throw new Error("unused");
          },
          getStopYCoordinates: () => [],
          getSpinStartYCoordinates: () => [],
        },
        assets: {},
      }),
    ).toThrow(SymbolAssetError);
  });
});
