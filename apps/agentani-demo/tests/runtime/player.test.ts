import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import { bgProject } from "../../src/animations/bg.js";
import { createProjectScene } from "../../src/runtime/player.js";

describe("project scene", () => {
  it("builds every bg layer instance", () => {
    const textures = new Map(
      bgProject.layers.map((layer) => [layer.id, Texture.EMPTY] as const),
    );
    const scene = createProjectScene(bgProject, textures);

    expect(scene.layers).toHaveLength(15);
    expect(scene.root.children).toHaveLength(15);
  });
});
