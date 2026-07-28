import { describe, expect, it } from "vitest";
import {
  getCocosRelativeTransform2D,
  opacityToCocosOpacity,
  v5gTransformToCocosPosition,
} from "../../src/cocos/coordinates";

describe("cocos coordinates", () => {
  it("uses center coordinates without applying Pixi top-left conversion", () => {
    expect(
      v5gTransformToCocosPosition({
        x: 100,
        y: 50,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    ).toEqual({ x: 100, y: 50 });
  });

  it("converts opacity from 0..1 to Cocos 0..255", () => {
    expect(opacityToCocosOpacity(0)).toBe(0);
    expect(opacityToCocosOpacity(0.5)).toBe(128);
    expect(opacityToCocosOpacity(2)).toBe(255);
  });

  it("converts a masked child transform into its source-mask coordinates", () => {
    const relative = getCocosRelativeTransform2D(
      {
        x: -400,
        y: 150,
        scaleX: 2,
        scaleY: 2,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      },
      {
        x: 100,
        y: 50,
        scaleX: -1,
        scaleY: 2,
        rotation: 30,
        anchorX: 0.25,
        anchorY: 0.75,
      },
    );

    expect(relative.x).toBeCloseTo(383.012702, 6);
    expect(relative.y).toBeCloseTo(168.30127, 6);
    expect(relative.scaleX).toBe(-2);
    expect(relative.scaleY).toBe(1);
    expect(relative.rotation).toBe(-30);
  });
});
