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

  it("adds exported top layers last so background stays behind", () => {
    const textures = new Map(
      bgProject.layers.map((layer) => [layer.id, Texture.EMPTY] as const),
    );
    const scene = createProjectScene(bgProject, textures);

    expect(scene.layers[0].config.id).toBe("刷光");
    expect(scene.root.children[0]).toBe(scene.layers[14].container);
    expect(scene.root.children.at(-1)).toBe(scene.layers[0].container);
  });
});
