import type { SymbolAnimationProfileMap } from "@slotclientengine/rendercore";

const createThreeLayerBonusProfiles = () =>
  Object.freeze({
    appear: Object.freeze({
      playback: "once",
      durationSeconds: 0.46,
      effects: Object.freeze([
        Object.freeze({
          name: "layerBounceScale",
          params: Object.freeze({ layer: 1, maxScale: 1.2, offsetY: -12 }),
        }),
        Object.freeze({
          name: "layerShineScale",
          params: Object.freeze({ layer: 2, maxScale: 1.2 }),
        }),
      ]),
    }),
    win: Object.freeze({
      playback: "once",
      durationSeconds: 0.72,
      effects: Object.freeze([
        Object.freeze({
          name: "layerStaggeredShineScale",
          params: Object.freeze({
            layers: Object.freeze([1, 2]),
            maxScale: 1.2,
            staggerSeconds: 0.08,
          }),
        }),
      ]),
    }),
  });

const createTwoLayerMultiplierProfiles = () =>
  Object.freeze({
    appear: Object.freeze({
      playback: "once",
      durationSeconds: 0.42,
      effects: Object.freeze([
        Object.freeze({
          name: "layerShineScale",
          params: Object.freeze({ layer: 1, maxScale: 1.2 }),
        }),
      ]),
    }),
    win: Object.freeze({
      playback: "once",
      durationSeconds: 0.62,
      effects: Object.freeze([
        Object.freeze({
          name: "layerStaggeredShineScale",
          params: Object.freeze({
            layers: Object.freeze([1]),
            maxScale: 1.2,
            staggerSeconds: 0.1,
          }),
        }),
      ]),
    }),
  });

const createSingleImageUnderlayProfiles = () =>
  Object.freeze({
    appear: Object.freeze({
      playback: "once",
      durationSeconds: 0.48,
      effects: Object.freeze([
        Object.freeze({
          name: "singleSpriteUnderlayScale",
          params: Object.freeze({ maxScale: 1.6, maxAlpha: 0.4 }),
        }),
      ]),
    }),
  });

const createRsBonusProfiles = () =>
  Object.freeze({
    appear: Object.freeze({
      playback: "once",
      durationSeconds: 0.46,
      effects: Object.freeze([
        Object.freeze({
          name: "layerBounceScale",
          params: Object.freeze({
            layer: 1,
            maxScale: 1.2,
            offsetY: -12,
            rotationDegrees: -20,
          }),
        }),
        Object.freeze({
          name: "layerShineScale",
          params: Object.freeze({ layer: 2, maxScale: 1.2 }),
        }),
      ]),
    }),
    win: Object.freeze({
      playback: "once",
      durationSeconds: 0.72,
      effects: Object.freeze([
        Object.freeze({
          name: "layerShineScale",
          params: Object.freeze({
            layer: 1,
            maxScale: 1.2,
            durationRatio: 0.78,
            rotationDegrees: -20,
          }),
        }),
        Object.freeze({
          name: "layerShineScale",
          params: Object.freeze({
            layer: 2,
            maxScale: 1.2,
            delaySeconds: 0.08,
            durationRatio: 0.78,
          }),
        }),
      ]),
    }),
  });

const createScBonusProfiles = () => {
  const baseProfiles = createThreeLayerBonusProfiles();
  return Object.freeze({
    appear: baseProfiles.appear,
    win: Object.freeze({
      playback: "once",
      durationSeconds: 0.72,
      effects: Object.freeze([
        Object.freeze({
          name: "layerTextureSequence",
          params: Object.freeze({ layer: 1 }),
        }),
        Object.freeze({
          name: "layerStaggeredShineScale",
          params: Object.freeze({
            layers: Object.freeze([1, 2]),
            maxScale: 1.2,
            staggerSeconds: 0.08,
          }),
        }),
      ]),
    }),
  });
};

export const SYMBOL_VIEWER_ANIMATION_PROFILES = Object.freeze({
  SC: createScBonusProfiles(),
  RS: createRsBonusProfiles(),
  X2: createTwoLayerMultiplierProfiles(),
  X5: createTwoLayerMultiplierProfiles(),
  X10: createTwoLayerMultiplierProfiles(),
}) satisfies SymbolAnimationProfileMap;

export const SYMBOLS002_ANIMATION_PROFILES = Object.freeze(
  Object.fromEntries(
    [
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
    ].map((symbol) => [symbol, createSingleImageUnderlayProfiles()] as const),
  ),
) satisfies SymbolAnimationProfileMap;

export const SYMBOLS001_ANIMATION_PROFILES = Object.freeze(
  Object.fromEntries(
    ["WL", "H1", "H2", "L1", "L2", "L3", "L4", "CN", "BN"].map(
      (symbol) => [symbol, createSingleImageUnderlayProfiles()] as const,
    ),
  ),
) satisfies SymbolAnimationProfileMap;

export const SYMBOLS003_ANIMATION_PROFILES = Object.freeze(
  Object.fromEntries(
    ["WL", "H1", "H2", "L1", "L2", "L3", "L4", "CN", "CO"].map(
      (symbol) => [symbol, createSingleImageUnderlayProfiles()] as const,
    ),
  ),
) satisfies SymbolAnimationProfileMap;
