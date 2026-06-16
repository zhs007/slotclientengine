import { describe, expect, it } from "vitest";
import {
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
});
