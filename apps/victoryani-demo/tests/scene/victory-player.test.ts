import { normalizeProjectConfig } from "../../src/config/victory-project.js";
import { getRenderOrderedLayers } from "../../src/scene/victory-player.js";

describe("victory player", () => {
  it("renders the exported bottom layer first so foreground content stays visible", () => {
    const project = normalizeProjectConfig(
      {
        layers: [
          {
            id: "foreground",
            type: "pic",
            asset: "./assets/foreground.png"
          },
          {
            id: "midground",
            type: "pic",
            asset: "./assets/midground.png"
          },
          {
            id: "background",
            type: "pic",
            asset: "./assets/background.png"
          }
        ]
      },
      (value) => value
    );

    expect(getRenderOrderedLayers(project.layers).map((layer) => layer.id)).toEqual([
      "background",
      "midground",
      "foreground"
    ]);
  });
});
