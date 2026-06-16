import type { V5GBlendMode } from "../v5g/types";

export function toPixiBlendMode(blendMode: V5GBlendMode): V5GBlendMode {
  if (
    blendMode === "normal" ||
    blendMode === "add" ||
    blendMode === "screen" ||
    blendMode === "multiply" ||
    blendMode === "lighten"
  ) {
    return blendMode;
  }
  throw new Error(`Unsupported V5G blendMode: ${String(blendMode)}.`);
}
