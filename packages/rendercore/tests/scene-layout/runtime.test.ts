import { Assets, Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture, game003LayoutFixture } from "./fixtures.js";

describe("scene layout runtime", () => {
  it("keeps named nodes stable and supports child and relative attachments", async () => {
    const urls = Object.fromEntries(
      game003LayoutFixture.nodes.map((node) => [
        node.resource.path,
        `memory:${node.id}`,
      ]),
    );
    const resource = createSceneLayoutResource({
      manifest: game003LayoutFixture,
      imageModules: urls,
    });
    const runtime = createSceneLayoutRuntime({
      resource,
      loadTexture: vi.fn(async () => Texture.WHITE),
    });
    await runtime.init();
    await expect(runtime.init()).rejects.toThrow(/already/);
    expect(() => runtime.getSnapshot()).toThrow(/not been applied/);
    const firstNode = runtime.getNode("minibk");
    const child = new Container();
    const amount = new Container();
    const disposeChild = runtime.attachChild({
      nodeId: "minibk",
      object: child,
    });
    const disposeAmount = runtime.attachRelative({
      nodeId: "minibk",
      placement: "after",
      object: amount,
    });
    const landscape = runtime.applyViewport({ width: 1424, height: 1125 });
    expect(landscape.variantId).toBe("landscape");
    expect(runtime.getNode("minibk")).toBe(firstNode);
    expect(child.parent).toBe(firstNode);
    expect(amount.parent?.label).toBe("scene-layout-after:minibk");
    const portrait = runtime.applyViewport({ width: 1174, height: 1200 });
    expect(portrait.variantId).toBe("portrait");
    expect(runtime.getNode("minibk")).toBe(firstNode);
    expect(runtime.getReelGrid("main").variantId).toBe("portrait");
    expect(() => runtime.update(-1)).toThrow(/non-negative/);
    expect(() => runtime.getNode("missing")).toThrow(/Unknown/);
    expect(() =>
      runtime.attachChild({ nodeId: "minibk", object: firstNode }),
    ).toThrow(/already has a parent/);
    disposeChild();
    disposeAmount();
    expect(child.parent).toBeNull();
    expect(amount.parent).toBeNull();
    runtime.destroy();
    runtime.destroy();
    expect(() => runtime.getNode("minibk")).toThrow(/destroyed/);
  });

  it("rolls back a decoded image dimension mismatch", async () => {
    const manifest = {
      ...game003LayoutFixture,
      nodes: game003LayoutFixture.nodes.map((node, index) =>
        index === 0
          ? {
              ...node,
              resource: { ...node.resource, size: { width: 2, height: 2 } },
            }
          : node,
      ),
    };
    const resource = createSceneLayoutResource({
      manifest,
      imageModules: Object.fromEntries(
        game003LayoutFixture.nodes.map((node) => [
          node.resource.path,
          `memory:${node.id}`,
        ]),
      ),
    });
    const runtime = createSceneLayoutRuntime({
      resource,
      loadTexture: async () => Texture.EMPTY,
    });
    await expect(runtime.init()).rejects.toThrow(/size mismatch/);
    runtime.destroy();
  });

  it("forces the Pixi texture parser for extensionless Blob URLs and rejects null textures", async () => {
    const resource = createSceneLayoutResource({
      manifest: game002LayoutFixture,
      imageModules: { "assets/bg.png": "blob:layout-background" },
    });
    const load = vi.spyOn(Assets, "load").mockResolvedValueOnce(null as never);
    const runtime = createSceneLayoutRuntime({ resource });
    await expect(runtime.init()).rejects.toThrow(/valid Pixi texture/);
    expect(load).toHaveBeenCalledWith({
      src: "blob:layout-background",
      loadParser: "loadTextures",
    });
    runtime.destroy();
    load.mockRestore();
  });
});
