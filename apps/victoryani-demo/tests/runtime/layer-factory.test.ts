import { Texture } from "pixi.js";
import { normalizeProjectConfig } from "../../src/config/victory-project.js";
import { createLayerInstances } from "../../src/runtime/layer-factory.js";

describe("layer factory", () => {
  it("builds layer instances and applies filter-aware blend mode placement", () => {
    const project = normalizeProjectConfig(
      {
        layers: [
          {
            id: "fire",
            type: "pic",
            asset: "./assets/fire.png",
            x: 100,
            y: 120,
            blendMode: "screen",
            animations: [{ type: "fireDistortion", duration: 1 }]
          },
          {
            id: "title",
            type: "font",
            text: "SUPER WIN"
          }
        ]
      },
      (value) => value
    );

    const textures = new Map([["./assets/fire.png", Texture.WHITE]]);
    const instances = createLayerInstances(project.layers, textures);

    const fire = instances.get("fire");
    const title = instances.get("title");

    expect(fire?.container.blendMode).toBe(3);
    expect(fire?.target.blendMode).toBe(0);
    expect(fire?.target.x).toBe(100);
    expect(fire?.target.y).toBe(120);
    expect(title?.target).toBeDefined();
  });
});