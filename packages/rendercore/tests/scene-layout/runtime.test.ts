import { Assets, Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
  parseSceneLayoutManifest,
} from "../../src/scene-layout/index.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import type { ImageStringResource } from "../../src/image-string/index.js";
import type { SceneLayoutVniPlayer } from "../../src/scene-layout/runtime.js";
import { game002LayoutFixture, game003LayoutFixture } from "./fixtures.js";

describe("scene layout runtime", () => {
  it("creates an independent manual VNI player and only advances it while renderable", async () => {
    const manifest = parseSceneLayoutManifest({
      ...game002LayoutFixture,
      nodes: [
        ...game002LayoutFixture.nodes,
        {
          id: "vni-fx",
          order: 2,
          resource: {
            kind: "vni",
            project: "runtime.json",
            loop: false,
          },
          placements: {
            default: {
              x: 100,
              y: 200,
              scale: 0.75,
              rotation: 90,
              center: { x: 0.5, y: 0.5 },
            },
          },
        },
      ],
    });
    const display = new Container();
    const player: SceneLayoutVniPlayer = {
      init: vi.fn(async () => undefined),
      setLoop: vi.fn(),
      play: vi.fn(),
      update: vi.fn(),
      destroy: vi.fn(),
      getDisplayObject: () => display,
    };
    const runtime = createSceneLayoutRuntime({
      resource: {
        manifest,
        imageUrls: { "assets/bg.png": "background.png" },
        imageStringResources: {},
        vniResources: {
          "runtime.json": {
            project: {
              stage: { width: 400, height: 300 },
              exportProfile: {
                id: "runtime",
                purpose: "runtime",
                assetScale: 1,
              },
            } as never,
            assetUrls: {},
          },
        },
        videoUrls: {},
        runtimeResources: {},
        spineResources: {},
        destroy: vi.fn(),
      },
      loadTexture: async () => Texture.EMPTY,
      unloadTexture: async () => undefined,
      createVniPlayer: () => player,
    });
    await runtime.init();
    expect(runtime.applyGeometryManifest(manifest)).toBeNull();
    runtime.applyViewport({ width: 2000, height: 2000 });
    expect(display.pivot).toMatchObject({ x: 0, y: 0 });
    expect(runtime.getNode("vni-fx").parent).toMatchObject({
      angle: 90,
      pivot: { x: 200, y: 150 },
      position: { x: 250, y: 312.5 },
    });
    expect(player.setLoop).toHaveBeenCalledWith(false);
    expect(player.play).toHaveBeenCalledOnce();
    const vniObject = runtime.getRenderObject("vni-fx");
    expect(vniObject).toMatchObject({ kind: "vni" });
    if (vniObject?.kind === "vni") vniObject.play();
    expect(player.play).toHaveBeenCalledTimes(2);
    runtime.update(1 / 60);
    expect(player.update).toHaveBeenCalledOnce();
    const centered = structuredClone(manifest) as any;
    centered.coordinateOrigin = "center";
    centered.nodes[0].placements.default = {
      x: -999.5,
      y: -999.5,
      scale: 1,
    };
    centered.reels.main.placements.default = { x: 0, y: -123 };
    runtime.applyGeometryManifest(centered);
    expect(display.pivot).toMatchObject({ x: 200, y: 150 });
    runtime.setNodeActive("vni-fx", false);
    runtime.update(1 / 60);
    expect(player.update).toHaveBeenCalledOnce();
    runtime.destroy();
    expect(player.destroy).toHaveBeenCalledOnce();
  });

  it("rejects missing VNI resources and non-runtime default player profiles", async () => {
    const manifest = parseSceneLayoutManifest({
      ...game002LayoutFixture,
      nodes: [
        ...game002LayoutFixture.nodes,
        {
          id: "vni-fx",
          order: 2,
          resource: {
            kind: "vni",
            project: "runtime.json",
            loop: true,
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
    });
    const base = {
      manifest,
      imageUrls: { "assets/bg.png": "background.png" },
      imageStringResources: {},
      videoUrls: {},
      runtimeResources: {},
      spineResources: {},
      destroy: vi.fn(),
    };
    const missing = createSceneLayoutRuntime({
      resource: { ...base, vniResources: {} },
      loadTexture: async () => Texture.EMPTY,
      unloadTexture: async () => undefined,
    });
    await expect(missing.init()).rejects.toThrow(
      /VNI resource is missing for node/,
    );
    missing.destroy();

    const invalidProfile = createSceneLayoutRuntime({
      resource: {
        ...base,
        vniResources: {
          "runtime.json": {
            project: {
              stage: { width: 100, height: 200 },
            } as never,
            assetUrls: {},
          },
        },
      },
      loadTexture: async () => Texture.EMPTY,
      unloadTexture: async () => undefined,
    });
    await expect(invalidProfile.init()).rejects.toThrow(
      /missing a runtime exportProfile/,
    );
    invalidProfile.destroy();

    const defaultPlayer = createSceneLayoutRuntime({
      resource: {
        ...base,
        vniResources: {
          "runtime.json": {
            project: {
              schemaVersion: "VNI_0.020",
              editor: { name: "VNI", version: "VNI_0.020" },
              engineTarget: { name: "cocos_creator", version: "3.8.6" },
              name: "empty-fx",
              exportProfile: {
                id: "runtime",
                purpose: "runtime",
                assetScale: 1,
              },
              stage: {
                width: 100,
                height: 200,
                coordinate: "center",
                duration: 1,
                backgroundColor: "#000000",
              },
              assets: [],
              layerGroups: [],
              layers: [],
              particles: [],
            } as never,
            assetUrls: {},
          },
        },
      },
      loadTexture: async () => Texture.EMPTY,
      unloadTexture: async () => undefined,
    });
    await expect(defaultPlayer.init()).resolves.toBeUndefined();
    defaultPlayer.destroy();
  });

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
        vniResources: {},
        videoUrls: {},
        runtimeResources: {},
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
    const stateObject = runtime.getRenderObject("bg");
    expect(stateObject).toMatchObject({ kind: "spine", playback: "state" });
    if (stateObject?.kind === "spine" && stateObject.playback === "state")
      expect(stateObject.getStateSnapshot().stableState).toBe("BG");
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
          placements: {
            default: {
              x: 10,
              y: 20,
              scale: 1,
              rotation: -90,
              center: { x: 0.5, y: 0.5 },
            },
          },
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
    expect(runtime.getNode("first").parent).toMatchObject({
      angle: -90,
      pivot: { x: 1.5, y: 0.5 },
      position: { x: 11.5, y: 20.5 },
    });
    expect(runtime.getImageStringText("first")).toBe("001");
    expect(runtime.getImageStringText("second")).toBe("1");
    const stringObject = runtime.getRenderObject("first");
    expect(stringObject).toMatchObject({ kind: "image-string" });
    if (stringObject?.kind === "image-string") {
      stringObject.setText("101");
      expect(stringObject.getText()).toBe("101");
    }
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
    const preparedUrls = [
      ...new Set(game003LayoutFixture.nodes.map((node) => `memory:${node.id}`)),
    ];
    expect(unloadTexture).toHaveBeenCalledTimes(preparedUrls.length);
    for (const url of preparedUrls)
      expect(unloadTexture).toHaveBeenCalledWith(url);
    runtime.destroy();
    expect(unloadTexture).toHaveBeenCalledTimes(preparedUrls.length);
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

  it("loads one shared image texture for exact same-resource nodes and retains it across visibility changes", async () => {
    const manifest = parseSceneLayoutManifest({
      ...game002LayoutFixture,
      nodes: [
        game002LayoutFixture.nodes[0],
        {
          ...game002LayoutFixture.nodes[0],
          id: "free-bg",
          order: 1,
        },
      ],
    });
    const resource = createSceneLayoutResource({
      manifest,
      imageModules: { "assets/bg.png": "memory:shared-bg" },
    });
    const loadTexture = vi.fn(async () => Texture.WHITE);
    const unloadTexture = vi.fn(async () => undefined);
    const runtime = createSceneLayoutRuntime({
      resource,
      loadTexture,
      unloadTexture,
    });

    await runtime.init();
    runtime.applyViewport({ width: 1920, height: 1080 });
    const baseSprite = runtime.getNode("bg").children[0] as Sprite;
    const freeSprite = runtime.getNode("free-bg").children[0] as Sprite;
    expect(loadTexture).toHaveBeenCalledOnce();
    expect(baseSprite).not.toBe(freeSprite);
    expect(baseSprite.texture).toBe(freeSprite.texture);

    runtime.setNodeActive("bg", false);
    runtime.setNodeActive("free-bg", true);
    expect(unloadTexture).not.toHaveBeenCalled();
    runtime.destroy();
    expect(unloadTexture).toHaveBeenCalledOnce();
    expect(unloadTexture).toHaveBeenCalledWith("memory:shared-bg");
  });

  it("applies geometry-only manifests without rebuilding named nodes or textures", async () => {
    const resource = createSceneLayoutResource({
      manifest: game002LayoutFixture,
      imageModules: { "assets/bg.png": "memory:bg" },
    });
    const loadTexture = vi.fn(async () => Texture.WHITE);
    const runtime = createSceneLayoutRuntime({ resource, loadTexture });
    await runtime.init();
    runtime.applyViewport({ width: 2000, height: 2000 });
    const node = runtime.getNode("bg");
    const sprite = node.children[0] as Sprite;

    const rotated = structuredClone(game002LayoutFixture) as any;
    rotated.nodes[0].placements.default = {
      x: 10,
      y: 20,
      scale: 2,
      rotation: 90,
      center: { x: 0.5, y: 0.5 },
    };
    runtime.applyGeometryManifest(rotated);
    expect(node.parent).toMatchObject({
      angle: 90,
      position: { x: 11, y: 21 },
      pivot: { x: 0.5, y: 0.5 },
      scale: { x: 2, y: 2 },
    });
    expect(loadTexture).toHaveBeenCalledOnce();

    const centered = structuredClone(game002LayoutFixture) as any;
    centered.coordinateOrigin = "center";
    centered.nodes[0].placements.default = {
      x: -989.5,
      y: -979.5,
      scale: 1,
    };
    centered.reels.main.placements.default = { x: 0, y: -123 };
    const snapshot = runtime.applyGeometryManifest(centered);

    expect(snapshot?.reels.main.artRect).toEqual({
      x: 640,
      y: 337,
      width: 720,
      height: 1080,
    });
    expect(runtime.getNode("bg")).toBe(node);
    expect(sprite.anchor.x).toBe(0.5);
    expect(node.parent?.position).toMatchObject({ x: 10.5, y: 20.5 });
    expect(loadTexture).toHaveBeenCalledOnce();

    const structural = structuredClone(centered);
    structural.nodes[0].resource.path = "assets/other.png";
    expect(() => runtime.applyGeometryManifest(structural)).toThrow(
      /immutable structure/,
    );
    expect(runtime.getNode("bg")).toBe(node);
    runtime.destroy();
  });

  it("retains independent same-resource Spine players until runtime destruction", async () => {
    const spineSpec = {
      kind: "spine" as const,
      skeleton: "assets/shared.json",
      atlas: "assets/shared.atlas",
      textures: { "shared.png": "assets/shared.png" },
      defaultAnimation: "Idle",
      loop: true as const,
    };
    const manifest = parseSceneLayoutManifest({
      ...game002LayoutFixture,
      nodes: [
        {
          id: "base-bg",
          order: 0,
          resource: spineSpec,
          placements: {
            default: {
              x: 0,
              y: 0,
              scale: 1,
              rotation: 90,
              center: { x: 0.5, y: 0.5 },
            },
          },
        },
        {
          id: "free-bg",
          order: 1,
          resource: { ...spineSpec, defaultAnimation: "Win" },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
      adaptation: {
        ...game002LayoutFixture.adaptation,
        backgroundNode: "base-bg",
      },
    });
    const players: RendercoreSpinePlayer[] = [];
    const createPlayer = vi.fn(() => {
      const player: RendercoreSpinePlayer = {
        view: new Container(),
        init: vi.fn(),
        play: vi.fn(),
        update: vi.fn(() => ({ completed: false, events: [] })),
        reset: vi.fn(),
        destroy: vi.fn(),
      };
      players.push(player);
      return player;
    });
    const sharedResource = {
      skeleton: {},
      atlasText: "shared",
      textureUrls: { "shared.png": "memory:shared" },
    };
    const runtime = createSceneLayoutRuntime({
      resource: {
        manifest,
        imageUrls: {},
        imageStringResources: {},
        vniResources: {},
        videoUrls: {},
        runtimeResources: {},
        spineResources: {
          "base-bg": sharedResource,
          "free-bg": sharedResource,
        },
        destroy: vi.fn(),
      },
      createSpinePlayer: createPlayer,
    });

    await runtime.init();
    runtime.applyViewport({ width: 1920, height: 1080 });
    expect(runtime.getNode("base-bg").parent).toMatchObject({
      angle: 90,
      pivot: { x: 0, y: 0 },
    });
    const loopObject = runtime.getRenderObject("base-bg");
    expect(loopObject).toMatchObject({ kind: "spine", playback: "loop" });
    if (loopObject?.kind === "spine" && loopObject.playback === "loop")
      loopObject.play();
    expect(players[0]!.play).toHaveBeenCalledTimes(2);
    runtime.setNodeActive("free-bg", false);
    runtime.setNodeActive("base-bg", false);
    runtime.setNodeActive("free-bg", true);
    expect(createPlayer).toHaveBeenCalledTimes(2);
    expect(
      players.every(
        (player) =>
          !(player.destroy as ReturnType<typeof vi.fn>).mock.calls.length,
      ),
    ).toBe(true);

    runtime.destroy();
    expect(
      players.every(
        (player) =>
          (player.destroy as ReturnType<typeof vi.fn>).mock.calls.length === 1,
      ),
    ).toBe(true);
  });
});
