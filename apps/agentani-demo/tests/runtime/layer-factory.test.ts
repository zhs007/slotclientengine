import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import { bgProject } from "../../src/animations/bg.js";
import { mapBlendMode } from "../../src/runtime/blend-mode.js";
import { createLayer, resetLayer } from "../../src/runtime/layer-factory.js";

describe("layer factory", () => {
  it("builds sprite layers and keeps mirrored scale during reset", () => {
    const config = bgProject.layers.find((layer) => layer.id === "光_copy_9");
    expect(config).toBeDefined();

    const layer = createLayer(config!, Texture.EMPTY);
    layer.container.scale.set(2, 2);
    resetLayer(layer);

    expect(layer.container.scale.x).toBe(config!.scaleX);
    expect(layer.container.scale.y).toBe(config!.scaleY);
  });

  it("maps additive blend mode", () => {
    expect(mapBlendMode("add")).toBe("add");
  });
});
