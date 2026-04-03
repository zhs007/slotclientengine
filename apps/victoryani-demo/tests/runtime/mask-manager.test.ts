import { normalizeProjectConfig } from "../../src/config/victory-project.js";
import { createLayerInstances } from "../../src/runtime/layer-factory.js";
import { applyMasks } from "../../src/runtime/mask-manager.js";

describe("mask manager", () => {
  it("assigns source layer masks using target layer display objects", () => {
    const project = normalizeProjectConfig(
      {
        layers: [
          { id: "source", type: "pic", asset: "./assets/source.png", maskId: "mask" },
          { id: "mask", type: "pic", asset: "./assets/mask.png", blendMode: "screen" }
        ]
      },
      (value) => value
    );

    const instances = createLayerInstances(project.layers, new Map());
    applyMasks(project.layers, instances);

    expect(instances.get("source")?.container.mask).toBe(instances.get("mask")?.target);
    expect(instances.get("mask")?.target.blendMode).toBe(0);
  });
});