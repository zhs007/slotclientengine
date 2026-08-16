import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { ImageStringResource } from "../../src/image-string/core/index.js";
import { createImgNumberRenderObject } from "../../src/presentation/imgnumber-render-object.js";
import { getRenderObjectAdapter } from "../../src/presentation/render-object.js";

function createDigitsResource(): ImageStringResource {
  let destroyed = false;
  return {
    manifest: {
      version: 1,
      kind: "image-string",
      id: "digits",
      metrics: { lineHeight: 10, letterSpacing: 1 },
      glyphs: {
        "0": {
          path: "0.png",
          size: { width: 8, height: 10 },
          offset: { x: 0, y: 0 },
        },
        "1": {
          path: "1.png",
          size: { width: 6, height: 10 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    },
    textures: { "0.png": Texture.WHITE, "1.png": Texture.WHITE },
    get destroyed() {
      return destroyed;
    },
    assertUsable() {
      if (destroyed) throw new Error("digits resource was destroyed");
    },
    async destroy() {
      destroyed = true;
    },
  };
}

describe("ImgNumberRenderObject", () => {
  it("keeps position separate from dynamic image-string anchoring", () => {
    const resource = createDigitsResource();
    const object = createImgNumberRenderObject({
      resource,
      text: "10",
      anchor: { x: 0.5, y: 0.5 },
    });
    const view = getRenderObjectAdapter(object).view;
    object.setPosition({ x: 12, y: 34 });
    const firstPivot = { x: view.pivot.x, y: view.pivot.y };

    object.setText("111");

    expect(object.getText()).toBe("111");
    expect(view.position).toMatchObject({ x: 12, y: 34 });
    expect({ x: view.pivot.x, y: view.pivot.y }).not.toEqual(firstPivot);
    object.destroy();
  });

  it("updates atomically, clones independently, and does not own the resource", () => {
    const resource = createDigitsResource();
    const object = createImgNumberRenderObject({ resource, text: "10" });
    expect(() => object.setText("12")).toThrow(/缺少 glyph/);
    expect(object.getText()).toBe("10");

    const clone = object.clone();
    object.setText("01");
    expect(clone.getText()).toBe("10");
    clone.destroy();
    object.destroy();
    object.destroy();
    expect(resource.destroyed).toBe(false);
  });
});
