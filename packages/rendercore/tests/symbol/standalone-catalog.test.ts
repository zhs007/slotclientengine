import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  SymbolAssetError,
  createStandaloneSymbolCatalog,
  createWinSymbolAni,
  createDefaultSymbolAnimationResolver,
  type SymbolAnimationResolver,
} from "../../src/symbol/index.js";

describe("standalone symbol catalog", () => {
  it("creates display symbols without a paytable and keeps orphan assets in validation", () => {
    const catalog = createStandaloneSymbolCatalog({
      displaySymbols: ["empty", "bonus", "boost"],
      assets: {
        empty: { normal: { kind: "transparent", width: 172, height: 158 } },
        bonus: { normal: createTexture(172, 158) },
        boost: { normal: createTexture(172, 130) },
        unused: { normal: createTexture(8, 8) },
      },
      symbolScales: { boost: 0.5 },
      symbolRenderPriorities: { boost: 3 },
      animationResolver: createTestResolver(),
    });

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: ["empty", "bonus", "boost"],
      ignoredPaytableSymbolsWithoutAssets: [],
      ignoredAssetsWithoutPaytable: ["unused"],
    });
    expect(catalog.getDefinition("bonus")).toMatchObject({
      code: 1,
      symbol: "bonus",
      pays: [],
    });
    expect(catalog.getTextureSet("empty").normal).toEqual({
      kind: "transparent",
      width: 172,
      height: 158,
    });
    expect(() => catalog.getAsset("empty")).toThrow(/transparent/);

    const boost = catalog.createRenderSymbol("boost");
    expect(boost.scale.x).toBe(0.5);
    expect(boost.scale.y).toBe(0.5);
    expect(boost.renderPriority).toBe(3);
    expect(
      catalog.createRenderSymbol("boost", { renderPriority: 5 }).renderPriority,
    ).toBe(5);

    const empty = catalog.createRenderSymbol("empty");
    empty.requestState("win");
    empty.update(1);
    expect(empty.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
    });
  });

  it("fails fast for missing display assets and invalid scales", () => {
    expect(() =>
      createStandaloneSymbolCatalog({
        displaySymbols: ["empty"],
        assets: {},
      }),
    ).toThrow(/empty/);

    expect(() =>
      createStandaloneSymbolCatalog({
        displaySymbols: ["empty"],
        assets: {
          empty: { normal: { kind: "transparent", width: 1, height: 1 } },
        },
        symbolScales: { bonus: 1 },
      }),
    ).toThrow(SymbolAssetError);
    expect(() =>
      createStandaloneSymbolCatalog({
        displaySymbols: ["empty"],
        assets: {
          empty: { normal: { kind: "transparent", width: 1, height: 1 } },
        },
        symbolRenderPriorities: { bonus: 1 },
      }),
    ).toThrow(/bonus.*displaySymbols/);
    expect(() =>
      createStandaloneSymbolCatalog({
        displaySymbols: ["empty"],
        assets: {
          empty: { normal: { kind: "transparent", width: 1, height: 1 } },
        },
        symbolRenderPriorities: { empty: -1 },
      }),
    ).toThrow(/empty.*renderPriority/);
  });
});

function createTexture(width: number, height: number): Texture {
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
}

function createTestResolver(): SymbolAnimationResolver {
  const normalResolver = createDefaultSymbolAnimationResolver();
  return (context) => {
    if (context.resolvedState === "win") {
      return createWinSymbolAni(context, { durationSeconds: 0.58 });
    }
    return normalResolver(context);
  };
}
