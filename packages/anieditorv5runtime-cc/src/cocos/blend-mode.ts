import type { V5GBlendMode } from "../core/types.js";

export type SupportedCocosBlendMode = "normal";

export interface CocosBlendModeConfig {
  mode: SupportedCocosBlendMode;
}

export function getCocosBlendModeConfig(
  _blendMode: V5GBlendMode,
): CocosBlendModeConfig {
  return { mode: "normal" };
}
