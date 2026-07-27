import type { V5GBlendMode } from "../core/types.js";

export type SupportedCocosBlendMode = V5GBlendMode;

export type CocosBlendModeStrategy =
  | "sprite-blend-state"
  | "alpha-correct-screen-material";

export type CocosBlendFactorName =
  | "ZERO"
  | "ONE"
  | "SRC_ALPHA"
  | "ONE_MINUS_SRC_ALPHA"
  | "SRC_COLOR"
  | "DST_COLOR"
  | "ONE_MINUS_SRC_COLOR";

export type CocosBlendOperationName = "ADD" | "MAX";

export interface CocosBlendChannelConfig {
  operation: CocosBlendOperationName;
  sourceFactor: CocosBlendFactorName;
  destinationFactor: CocosBlendFactorName;
}

export interface CocosSpriteBlendStateConfig {
  mode: SupportedCocosBlendMode;
  strategy: "sprite-blend-state";
  color: CocosBlendChannelConfig;
  alpha: CocosBlendChannelConfig;
}

export interface CocosAlphaCorrectScreenMaterialConfig {
  mode: "screen";
  strategy: "alpha-correct-screen-material";
  effectName: typeof VNI_SCREEN_ALPHA_EFFECT_NAME;
}

export type CocosBlendModeConfig =
  | CocosSpriteBlendStateConfig
  | CocosAlphaCorrectScreenMaterialConfig;

export const VNI_SCREEN_ALPHA_EFFECT_NAME = "vni-screen-alpha";

const NORMAL_COLOR_BLEND: CocosBlendChannelConfig = {
  operation: "ADD",
  sourceFactor: "SRC_ALPHA",
  destinationFactor: "ONE_MINUS_SRC_ALPHA",
};

const SOURCE_OVER_ALPHA_BLEND: CocosBlendChannelConfig = {
  operation: "ADD",
  sourceFactor: "ONE",
  destinationFactor: "ONE_MINUS_SRC_ALPHA",
};

const BLEND_MODE_CONFIGS: Record<V5GBlendMode, CocosBlendModeConfig> = {
  normal: {
    mode: "normal",
    strategy: "sprite-blend-state",
    color: NORMAL_COLOR_BLEND,
    alpha: SOURCE_OVER_ALPHA_BLEND,
  },
  add: {
    mode: "add",
    strategy: "sprite-blend-state",
    color: {
      operation: "ADD",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE",
    },
    alpha: SOURCE_OVER_ALPHA_BLEND,
  },
  screen: {
    mode: "screen",
    strategy: "alpha-correct-screen-material",
    effectName: VNI_SCREEN_ALPHA_EFFECT_NAME,
  },
  multiply: {
    mode: "multiply",
    strategy: "sprite-blend-state",
    color: {
      operation: "ADD",
      sourceFactor: "DST_COLOR",
      destinationFactor: "ONE_MINUS_SRC_ALPHA",
    },
    alpha: SOURCE_OVER_ALPHA_BLEND,
  },
  lighten: {
    mode: "lighten",
    strategy: "sprite-blend-state",
    color: {
      operation: "MAX",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE",
    },
    alpha: SOURCE_OVER_ALPHA_BLEND,
  },
};

export function getCocosBlendModeConfig(
  blendMode: V5GBlendMode,
): CocosBlendModeConfig {
  return BLEND_MODE_CONFIGS[blendMode];
}
