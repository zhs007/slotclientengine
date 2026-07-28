import { clampNumber } from "../core/coordinates.js";
import type { V5GTransformConfig } from "../core/types.js";

export interface CocosPoint2D {
  x: number;
  y: number;
}

export interface CocosRelativeTransform2D {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
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

export function getCocosRelativeTransform2D(
  child: V5GTransformConfig,
  parent: V5GTransformConfig,
): CocosRelativeTransform2D {
  const deltaX = child.x - parent.x;
  const deltaY = child.y - parent.y;
  const radians = (parent.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const unrotatedX = cosine * deltaX + sine * deltaY;
  const unrotatedY = -sine * deltaX + cosine * deltaY;
  return {
    x: divideByParentScale(unrotatedX, parent.scaleX),
    y: divideByParentScale(unrotatedY, parent.scaleY),
    scaleX: divideByParentScale(child.scaleX, parent.scaleX),
    scaleY: divideByParentScale(child.scaleY, parent.scaleY),
    rotation: child.rotation - parent.rotation,
  };
}

function divideByParentScale(value: number, parentScale: number): number {
  return Math.abs(parentScale) > 1e-8 ? value / parentScale : 0;
}
