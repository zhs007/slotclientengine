import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import { bgProject } from "../../src/animations/bg.js";
import { createLayer } from "../../src/runtime/layer-factory.js";
import { bindLayerMasks } from "../../src/runtime/mask-manager.js";

describe("mask manager", () => {
  it("binds the brush light to its copied invisible frame mask", () => {
    const layers = bgProject.layers
      .slice(0, 2)
      .map((layer) => createLayer(layer, Texture.EMPTY));
    bindLayerMasks(layers);

    expect(layers[0].container.mask).toBe(layers[1].sprite);
  });
});
