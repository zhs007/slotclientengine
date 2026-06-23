import type { V5GBlendMode } from "../core/types.js";

export type SupportedCocosBlendMode = V5GBlendMode;

export type CocosBlendModeStrategy = "sprite-blend-state";

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

export interface CocosBlendModeConfig {
  mode: SupportedCocosBlendMode;
  strategy: CocosBlendModeStrategy;
  color: CocosBlendChannelConfig;
  alpha: CocosBlendChannelConfig;
}

const NORMAL_ALPHA_BLEND: CocosBlendChannelConfig = {
  operation: "ADD",
  sourceFactor: "SRC_ALPHA",
  destinationFactor: "ONE_MINUS_SRC_ALPHA",
};

const BLEND_MODE_CONFIGS: Record<V5GBlendMode, CocosBlendModeConfig> = {
  normal: {
    mode: "normal",
    strategy: "sprite-blend-state",
    color: NORMAL_ALPHA_BLEND,
    alpha: NORMAL_ALPHA_BLEND,
  },
  add: {
    mode: "add",
    strategy: "sprite-blend-state",
    color: {
      operation: "ADD",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE",
    },
    alpha: NORMAL_ALPHA_BLEND,
  },
  screen: {
    mode: "screen",
    strategy: "sprite-blend-state",
    color: {
      operation: "ADD",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE_MINUS_SRC_COLOR",
    },
    alpha: NORMAL_ALPHA_BLEND,
  },
  multiply: {
    mode: "multiply",
    strategy: "sprite-blend-state",
    color: {
      operation: "ADD",
      sourceFactor: "DST_COLOR",
      destinationFactor: "ONE_MINUS_SRC_ALPHA",
    },
    alpha: NORMAL_ALPHA_BLEND,
  },
  lighten: {
    mode: "lighten",
    strategy: "sprite-blend-state",
    color: {
      operation: "MAX",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE",
    },
    alpha: NORMAL_ALPHA_BLEND,
  },
};

export function getCocosBlendModeConfig(
  blendMode: V5GBlendMode,
): CocosBlendModeConfig {
  return BLEND_MODE_CONFIGS[blendMode];
}
