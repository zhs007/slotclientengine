import { clampNumber } from "../core/coordinates.js";
import type { V5GTransformConfig } from "../core/types.js";

export interface CocosPoint2D {
  x: number;
  y: number;
}

export function v5gTransformToCocosPosition(
  transform: V5GTransformConfig,
): CocosPoint2D {
  return {
    x: transform.x,
    y: transform.y,
  };
}

export function opacityToCocosOpacity(opacity: number): number {
  return Math.round(clampNumber(opacity, 0, 1) * 255);
}
