import { Assets, Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
  parseSceneLayoutManifest,
} from "../../src/scene-layout/index.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import type { ImageStringResource } from "../../src/image-string/index.js";
import { game002LayoutFixture, game003LayoutFixture } from "./fixtures.js";

describe("scene layout runtime", () => {
  it("drives direct Spine transitions at the real completion boundary", async () => {
    const manifest = parseSceneLayoutManifest({
      ...game002LayoutFixture,
      nodes: [
        {
          id: "bg",
          order: 0,
          resource: {
            kind: "spine",
            skeleton: "assets/bg/bg.json",
            atlas: "assets/bg/bg.atlas",
            textures: { "bg.png": "assets/bg/bg.png" },
            stateMachine: {
              initialState: "BG",
              states: {
                BG: { animation: "BG" },
                FG: { animation: "FG" },
              },
              transitions: [
                { from: "BG", to: "FG", animation: "BG_FG" },
                { from: "FG", to: "BG", animation: "FG_BG" },
              ],
            },
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
    });
    const play = vi.fn();
    let completed = false;
    const player: RendercoreSpinePlayer = {
      view: new Container(),
      init: vi.fn(),
      play,
      update: vi.fn(() => {
        const result = { completed, events: [] };
        completed = false;
        return result;
      }),
      reset: vi.fn(),
      destroy: vi.fn(),
    };
    const destroyResource = vi.fn();
    const runtime = createSceneLayoutRuntime({
      resource: {
        manifest,
        imageUrls: {},
        imageStringResources: {},
        spineResources: {
          bg: { skeleton: {}, atlasText: "", textureUrls: {} },
        },
        destroy: destroyResource,
      },
      createSpinePlayer: () => player,
    });
    await runtime.init();
    runtime.applyViewport({ width: 1920, height: 1080 });
    expect(play).toHaveBeenLastCalledWith({ animationName: "BG", loop: true });
    expect(runtime.getNodeStateSnapshot("bg")).toEqual({
      stableState: "BG",
      targetState: null,
      phase: "stable",
    });
    await runtime.requestNodeState("bg", "BG");
    expect(runtime.canRequestNodeState("bg", "BG")).toBe(true);
    expect(runtime.canRequestNodeState("bg", "FG")).toBe(true);
    expect(runtime.canRequestNodeState("bg", "Missing")).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
    const toFg = runtime.requestNodeState("bg", "FG");
    expect(play).toHaveBeenLastCalledWith({
      animationName: "BG_FG",
      loop: false,
    });
    expect(runtime.getNodeStateSnapshot("bg")).toMatchObject({
      stableState: "BG",
      targetState: "FG",
      phase: "transitioning",
    });
    expect(runtime.canRequestNodeState("bg", "BG")).toBe(false);
    expect(() => runtime.requestNodeState("bg", "BG")).toThrow(
      /already in progress/,
    );
    runtime.update(1 / 60);
    expect(runtime.getNodeStateSnapshot("bg").stableState).toBe("BG");
    completed = true;
    runtime.update(1 / 60);
    await expect(toFg).resolves.toBeUndefined();
    expect(play).toHaveBeenLastCalledWith({ animationName: "FG", loop: true });
    const toBg = runtime.requestNodeState("bg", "BG");
    completed = true;
    runtime.update(1 / 60);
    await expect(toBg).resolves.toBeUndefined();
    expect(play).toHaveBeenLastCalledWith({ animationName: "BG", loop: true });

    const pending = runtime.requestNodeState("bg", "FG");
    runtime.destroy();
    await expect(pending).rejects.toThrow(/destroyed/);
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(destroyResource).toHaveBeenCalledOnce();
  });

  it("renders independent image-string nodes and keeps setText atomic", async () => {
    const imageStringManifest = {
      version: 1 as const,
      kind: "image-string" as const,
      id: "digits",
      metrics: { lineHeight: 1, letterSpacing: 0 },
      glyphs: {
        "0": {
          path: "assets/0.png",
          size: { width: 1, height: 1 },
          offset: { x: 0, y: 0 },
        },
        "1": {
          path: "assets/1.png",
          size: { width: 1, height: 1 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    };
    const nestedDestroy = vi.fn(async () => undefined);
    const nested: ImageStringResource = {
      manifest: imageStringManifest,
      textures: {
        "assets/0.png": Texture.WHITE,
        "assets/1.png": Texture.WHITE,
      },
      destroyed: false,
      assertUsable: vi.fn(),
      destroy: nestedDestroy,
    };
    const dependencyPath =
      "dependencies/image-strings/digits/image-string.manifest.json";
    const manifest = {
      ...game002LayoutFixture,
      nodes: [
        game002LayoutFixture.nodes[0],
        {
          id: "first",
          order: 1,
          resource: {
            kind: "image-string" as const,
            manifest: dependencyPath,
            text: "001",
            anchor: { x: 0, y: 0 },
          },
          placements: { default: { x: 10, y: 20, scale: 1 } },
        },
        {
          id: "second",
          order: 2,
          resource: {
            kind: "image-string" as const,
            manifest: dependencyPath,
            text: "1",
            anchor: { x: 1, y: 1 },
          },
          placements: { default: { x: 30, y: 40, scale: 2 } },
        },
      ],
    };
    const resource = createSceneLayoutResource({
      manifest,
      imageModules: { "assets/bg.png": "memory:bg" },
      imageStringResources: { [dependencyPath]: nested },
    });
    const runtime = createSceneLayoutRuntime({
      resource,
      loadTexture: vi.fn(async () => Texture.WHITE),
    });
    await runtime.init();
    runtime.applyViewport({ width: 1920, height: 1080 });
    expect(runtime.getImageStringNodeNames()).toEqual(["first", "second"]);
    expect(runtime.getImageStringText("first")).toBe("001");
    expect(runtime.getImageStringText("second")).toBe("1");
    runtime.setImageStringText("first", "010");
    expect(runtime.getImageStringText("first")).toBe("010");
    expect(runtime.getImageStringText("second")).toBe("1");
    expect(() => runtime.setImageStringText("first", "2")).toThrow(
      /缺少 glyph/,
    );
    expect(runtime.getImageStringText("first")).toBe("010");
    expect(() => runtime.setImageStringText("bg", "0")).toThrow(
      /not an image-string/,
    );
    runtime.destroy();
    expect(nestedDestroy).toHaveBeenCalledOnce();
  });

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
    const unloadTexture = vi.fn(async () => undefined);
    const runtime = createSceneLayoutRuntime({
      resource,
      loadTexture: async () => Texture.EMPTY,
      unloadTexture,
    });
    await expect(runtime.init()).rejects.toThrow(/size mismatch/);
    expect(unloadTexture).toHaveBeenCalledOnce();
    expect(unloadTexture).toHaveBeenCalledWith("memory:bg1");
    runtime.destroy();
    expect(unloadTexture).toHaveBeenCalledOnce();
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
      parser: "loadTextures",
    });
    runtime.destroy();
    load.mockRestore();
  });

  it("unloads each Assets-managed texture instead of destroying it directly", async () => {
    const resource = createSceneLayoutResource({
      manifest: game002LayoutFixture,
      imageModules: { "assets/bg.png": "blob:layout-background" },
    });
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValueOnce(Texture.EMPTY as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValueOnce(undefined);
    const destroyTexture = vi.spyOn(Texture.EMPTY, "destroy");
    try {
      const runtime = createSceneLayoutRuntime({ resource });
      await runtime.init();
      runtime.destroy();
      expect(unload).toHaveBeenCalledOnce();
      expect(unload).toHaveBeenCalledWith("blob:layout-background");
      expect(destroyTexture).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
      unload.mockRestore();
      destroyTexture.mockRestore();
    }
  });
});
