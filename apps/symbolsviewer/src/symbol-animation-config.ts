import type { SymbolAnimationProfileMap } from "@slotclientengine/rendercore";

const createThreeLayerBonusProfiles = () =>
  Object.freeze({
    appear: Object.freeze({
      playback: "once",
      durationSeconds: 0.46,
      effects: Object.freeze([
        Object.freeze({
          name: "layerBounceScale",
          params: Object.freeze({ layer: 1, maxScale: 1.2, offsetY: -12 })
        }),
        Object.freeze({
          name: "layerShineScale",
          params: Object.freeze({ layer: 2, maxScale: 1.2 })
        })
      ])
    }),
    win: Object.freeze({
      playback: "once",
      durationSeconds: 0.72,
      effects: Object.freeze([
        Object.freeze({
          name: "layerStaggeredShineScale",
          params: Object.freeze({
            layers: Object.freeze([0, 1, 2]),
            maxScale: 1.2,
            staggerSeconds: 0.08
          })
        })
      ])
    })
  });

const createTwoLayerMultiplierProfiles = () =>
  Object.freeze({
    appear: Object.freeze({
      playback: "once",
      durationSeconds: 0.42,
      effects: Object.freeze([
        Object.freeze({
          name: "layerShineScale",
          params: Object.freeze({ layer: 1, maxScale: 1.2 })
        })
      ])
    }),
    win: Object.freeze({
      playback: "once",
      durationSeconds: 0.62,
      effects: Object.freeze([
        Object.freeze({
          name: "layerStaggeredShineScale",
          params: Object.freeze({
            layers: Object.freeze([0, 1]),
            maxScale: 1.2,
            staggerSeconds: 0.1
          })
        })
      ])
    })
  });

export const SYMBOL_VIEWER_ANIMATION_PROFILES = Object.freeze({
  SC: createThreeLayerBonusProfiles(),
  RS: createThreeLayerBonusProfiles(),
  X2: createTwoLayerMultiplierProfiles(),
  X5: createTwoLayerMultiplierProfiles(),
  X10: createTwoLayerMultiplierProfiles()
}) satisfies SymbolAnimationProfileMap;
