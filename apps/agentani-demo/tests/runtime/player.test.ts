import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import { bgProject } from "../../src/animations/bg.js";
import {
  AgentAnimationPlayer,
  createProjectScene,
} from "../../src/runtime/player.js";

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

  it("pans and zooms the player viewport without touching scene layers", () => {
    const player = new AgentAnimationPlayer({
      stage: { addChild: () => undefined },
    } as never);

    player.panBy(20, -10);
    expect(player.root.x).toBe(20);
    expect(player.root.y).toBe(-10);

    const scale = player.zoomAt(600, 300, 2);
    expect(scale).toBe(2);
    expect(player.root.scale.x).toBe(2);
    expect(player.root.scale.y).toBe(2);

    player.resetViewport();
    expect(player.root.x).toBe(0);
    expect(player.root.y).toBe(0);
    expect(player.root.scale.x).toBe(1);
  });
});
