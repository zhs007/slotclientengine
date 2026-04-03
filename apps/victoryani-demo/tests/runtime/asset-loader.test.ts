import { normalizeProjectConfig } from "../../src/config/victory-project.js";
import { collectProjectAssetPaths, createProjectAssetResolver } from "../../src/runtime/asset-loader.js";

describe("asset loader", () => {
  it("normalizes exported project config with defaults and resolved assets", () => {
    const resolver = createProjectAssetResolver({
      "./assets/demo.png": "/demo.png"
    });

    const project = normalizeProjectConfig(
      {
        name: "Demo",
        layers: [
          {
            id: "hero",
            type: "pic",
            asset: "./assets/demo.png",
            x: 10,
            y: 20,
            scale: 1.5,
            animations: [{ type: "fadeIn", duration: 1 }]
          }
        ]
      },
      resolver
    );

    expect(project.name).toBe("Demo");
    expect(project.layers[0].asset).toBe("/demo.png");
    expect(project.layers[0].scaleX).toBe(1.5);
    expect(project.layers[0].scaleY).toBe(1.5);
    expect(project.layers[0].blendMode).toBe("normal");
    expect(project.layers[0].visible).toBe(true);
    expect(project.layers[0].animations[0].params).toEqual({});
  });

  it("collects unique picture asset paths", () => {
    const project = normalizeProjectConfig(
      {
        layers: [
          { id: "a", type: "pic", asset: "./assets/a.png" },
          { id: "b", type: "pic", asset: "./assets/a.png" },
          { id: "c", type: "font", text: "Hello" }
        ]
      },
      (value) => value
    );

    expect(collectProjectAssetPaths(project)).toEqual(["./assets/a.png"]);
  });
});