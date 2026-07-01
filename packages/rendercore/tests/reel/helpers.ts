import {
  createGameConfig,
  LogicReelsModel,
  type LogicReels,
} from "@slotclientengine/logiccore";
import { Texture } from "pixi.js";
import {
  createReelLayout,
  createReelSymbolRegistry,
  type ReelLayout,
  type ReelSymbolRegistry,
} from "../../src/reel/index.js";
import {
  createAppearSymbolAni,
  createDefaultSymbolAnimationResolver,
  createWinSymbolAni,
  type SymbolAnimationResolver,
  type SymbolAssetMap,
} from "../../src/symbol/index.js";

export const basicGameConfig = Object.freeze({
  paytable: Object.freeze({
    "0": Object.freeze({
      code: 0,
      symbol: "BN",
      pays: Object.freeze([0, 0, 0]),
    }),
    "1": Object.freeze({
      code: 1,
      symbol: "A",
      pays: Object.freeze([1, 2, 3]),
    }),
    "2": Object.freeze({
      code: 2,
      symbol: "B",
      pays: Object.freeze([2, 3, 4]),
    }),
    "3": Object.freeze({
      code: 3,
      symbol: "C",
      pays: Object.freeze([3, 4, 5]),
    }),
  }),
  symbolCodes: Object.freeze({
    BN: 0,
    A: 1,
    B: 2,
    C: 3,
  }),
  reels: Object.freeze({
    reels01: Object.freeze([
      Object.freeze([1, 0, 2, 3, 1, 2, 0, 3]),
      Object.freeze([2, 1, 0, 3, 2, 1, 0, 3]),
    ]),
  }),
});

export function createTestTexture(width = 10, height = 12): Texture {
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

export function createTextureSet(width: number, height: number) {
  return Object.freeze({
    normal: createTestTexture(width, height),
    states: Object.freeze({
      spinBlur: createTestTexture(width, height),
      disabled: createTestTexture(width, height),
    }),
  });
}

export function createBasicAssets(
  overrides: Partial<SymbolAssetMap> = {},
): SymbolAssetMap {
  return Object.freeze({
    A: createTextureSet(10, 12),
    B: createTextureSet(15, 8),
    ORPHAN: createTextureSet(4, 4),
    ...overrides,
  });
}

export function createBasicReels(): LogicReels {
  return new LogicReelsModel("test", [
    [1, 0, 2, 3, 1, 2, 0, 3],
    [2, 1, 0, 3, 2, 1, 0, 3],
  ]);
}

export function createBasicLayout(): ReelLayout {
  return createReelLayout({
    reelCount: 2,
    visibleRows: 3,
    cellWidth: 15,
    cellHeight: 12,
    columnGap: 2,
  });
}

export function createBasicRegistry(): ReelSymbolRegistry {
  return createReelSymbolRegistry({
    gameConfig: createGameConfig(basicGameConfig),
    assets: createBasicAssets(),
    emptySymbols: ["BN"],
    animationResolver: createTestSymbolAnimationResolver(),
    texturePolicy: {
      requiredStateTextures: ["spinBlur"],
    },
  });
}

export function createTestSymbolAnimationResolver(): SymbolAnimationResolver {
  const normalResolver = createDefaultSymbolAnimationResolver();
  return (context) => {
    if (context.resolvedState === "appear") {
      return createAppearSymbolAni(context, { durationSeconds: 0.42 });
    }
    if (context.resolvedState === "win") {
      return createWinSymbolAni(context, { durationSeconds: 0.58 });
    }
    return normalResolver(context);
  };
}
