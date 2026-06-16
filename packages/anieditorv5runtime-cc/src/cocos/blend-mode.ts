import type { V5GBlendMode } from "../core/types.js";

export type CocosBlendFactor = "SRC_ALPHA" | "ONE_MINUS_SRC_ALPHA" | "ONE";
export type SupportedCocosBlendMode = "normal" | "add";

export interface CocosBlendModeConfig {
  mode: SupportedCocosBlendMode;
  sourceFactor: CocosBlendFactor;
  destinationFactor: CocosBlendFactor;
}

export function getCocosBlendModeConfig(
  blendMode: V5GBlendMode,
): CocosBlendModeConfig {
  if (blendMode === "normal") {
    return {
      mode: "normal",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE_MINUS_SRC_ALPHA",
    };
  }
  if (blendMode === "add") {
    return {
      mode: "add",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE",
    };
  }
  throw new Error(`Unsupported Cocos V5G blendMode: ${blendMode}.`);
}
