import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { ImageStringResource } from "../../src/image-string/core/index.js";
import { getRenderObjectAdapter } from "../../src/presentation/render-object.js";
import { createRenderObjectMotionRuntime } from "../../src/presentation/render-object-motion.js";
import { attachRenderObjectToSpineSlot } from "../../src/presentation/spine-slot-attachment.js";
import { createSceneLayoutRenderObjectFactory } from "../../src/scene-layout/render-object-factory.js";
import type {
  SceneLayoutPackageResource,
  SceneLayoutRuntimeResource,
} from "../../src/scene-layout/types.js";
import type { RendercoreSpineSlotPlayer } from "../../src/spine/runtime-player.js";

function imageStringResource(): ImageStringResource {
  return {
    manifest: {
      version: 1,
      kind: "image-string",
      id: "digits",
      metrics: { lineHeight: 1, letterSpacing: 0 },
      glyphs: {
        "1": {
          path: "1.png",
          size: { width: 1, height: 1 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    },
    textures: { "1.png": Texture.WHITE },
    destroyed: false,
    assertUsable() {},
    async destroy() {},
  };
}

function createResource(options?: {
  readonly lazyRuntimeResources?: boolean;
  readonly coordinateOrigin?: "top-left" | "center";
}): SceneLayoutPackageResource {
  const resources = {
    nearwin1: {
      kind: "spine" as const,
      skeleton: {},
      atlasText: "nearwin.png",
      textureUrls: { "nearwin.png": "blob:nearwin" },
    },
    badge: {
      kind: "image" as const,
      url: "blob:badge",
      size: { width: 1, height: 1 },
    },
    winAmount: {
      kind: "image-string" as const,
      resource: imageStringResource(),
    },
    sparkle: {
      kind: "vni" as const,
      project: {
        stage: { duration: 0.2 },
        exportProfile: { id: "runtime", purpose: "runtime", assetScale: 1 },
      } as never,
      assetUrls: {},
    },
    intro: {
      kind: "video" as const,
      url: "blob:intro",
      mimeType: "video/mp4" as const,
    },
  } satisfies Readonly<Record<string, SceneLayoutRuntimeResource>>;
  const runtimeManifest = {
    id: "factory-test",
    coordinateOrigin: options?.coordinateOrigin ?? "top-left",
    runtimeResources: {
      nearwin1: {
        kind: "spine",
        skeleton: "nearwin.json",
        atlas: "nearwin.atlas",
        textures: { "nearwin.png": "nearwin.png" },
      },
      badge: {
        kind: "image",
        path: "badge.png",
        size: { width: 1, height: 1 },
      },
      winAmount: { kind: "image-string", manifest: "digits.json" },
      sparkle: { kind: "vni", project: "sparkle.json" },
      intro: {
        kind: "video",
        path: "intro.mp4",
        mimeType: "video/mp4",
      },
    },
  } as unknown as SceneLayoutPackageResource["runtimeManifest"];
  return {
    manifest: (options?.lazyRuntimeResources
      ? { id: "factory-test" }
      : runtimeManifest) as SceneLayoutPackageResource["manifest"],
    runtimeManifest,
    runtimeResources: resources,
    loadRuntimeResource: async (
      key: string,
      kind: SceneLayoutRuntimeResource["kind"],
    ) => {
      const resource = resources[key as keyof typeof resources];
      if (!resource) throw new Error(`missing ${key}`);
      if (resource.kind !== kind) throw new Error(`kind mismatch ${key}`);
      return resource as never;
    },
    getLoadedRuntimeResource: (
      key: string,
      kind: SceneLayoutRuntimeResource["kind"],
    ) => {
      const resource = resources[key as keyof typeof resources];
      return resource?.kind === kind ? (resource as never) : null;
    },
    destroy() {},
  } as unknown as SceneLayoutPackageResource;
}

class ManualSpinePlayer implements RendercoreSpineSlotPlayer {
  readonly view = new Container();
  readonly plays: string[] = [];
  readonly loops: boolean[] = [];
  readonly slots = new Map<Container, string>();
  updates = 0;
  resets = 0;
  destroyed = false;
  loop = false;
  init() {}
  play(options: { readonly animationName: string; readonly loop: boolean }) {
    if (options.animationName !== "Nearwin")
      throw new Error("unknown animation");
    this.plays.push(options.animationName);
    this.loops.push(options.loop);
    this.loop = options.loop;
    this.updates = 0;
  }
  update() {
    this.updates += 1;
    return {
      completed: !this.loop && this.updates === 2,
      ...(this.loop && this.updates === 2 ? { loopCompleted: true } : {}),
      events: [],
    };
  }
  reset() {
    this.resets += 1;
  }
  destroy() {
    this.destroyed = true;
  }
  attachSlotObject(options: {
    readonly slot: string;
    readonly object: Container;
  }) {
    if (options.slot !== "amount") throw new Error("unknown slot");
    this.view.addChild(options.object);
    this.slots.set(options.object, options.slot);
  }
  removeSlotObject(object: Container) {
    object.parent?.removeChild(object);
    this.slots.delete(object);
  }
}

class ManualVniPlayer {
  readonly listeners = new Set<() => void>();
  updates = 0;
  loops: boolean[] = [];
  destroyed = false;
  init() {
    return Promise.resolve();
  }
  setLoop(loop: boolean) {
    this.loops.push(loop);
  }
  play() {}
  pause() {}
  restart() {}
  update() {
    this.updates += 1;
    if (this.updates === 1) for (const listener of this.listeners) listener();
  }
  destroy() {
    this.destroyed = true;
  }
  onPlaybackComplete(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

describe("Scene Layout named RenderObject factory", () => {
  it("resolves lazy runtime resource specs from the canonical manifest", async () => {
    const resource = createResource({ lazyRuntimeResources: true });
    expect(resource.manifest.runtimeResources).toBeUndefined();

    const factory = createSceneLayoutRenderObjectFactory({
      resource,
      dependencies: { createSpinePlayer: () => new ManualSpinePlayer() },
    });
    const object = await factory.createRenderObject("nearwin1");
    expect(getRenderObjectAdapter(object).view.parent).toBeNull();

    object.destroy();
    factory.destroy();
  });

  it("uses exact names, typed image-string dispatch, and detached ownership", async () => {
    const resource = createResource();
    const factory = createSceneLayoutRenderObjectFactory({
      resource,
      dependencies: { loadTexture: async () => Texture.WHITE },
    });
    const image = await factory.createRenderObject("badge");
    expect(getRenderObjectAdapter(image).view.parent).toBeNull();
    await expect(factory.createRenderObject("Badge")).rejects.toThrow(
      /Unknown/,
    );
    await expect(factory.createRenderObject("winAmount")).rejects.toThrow(
      /createImgNumberRenderObject/,
    );
    await expect(factory.createRenderObject("intro")).rejects.toThrow(/video/);
    await expect(
      factory.createImgNumberRenderObject("badge", { text: "1" }),
    ).rejects.toThrow(/not image-string/);

    const amount = await factory.createImgNumberRenderObject("winAmount", {
      text: "1",
    });
    amount.setPosition({ x: 3, y: 4 });
    expect(amount.getText()).toBe("1");
    factory.destroy();
    expect(() => amount.getText()).toThrow(/destroyed|已销毁/u);
  });

  it("aligns runtime images to the package coordinate origin", async () => {
    const topLeftFactory = createSceneLayoutRenderObjectFactory({
      resource: createResource({ coordinateOrigin: "top-left" }),
      dependencies: { loadTexture: async () => Texture.WHITE },
    });
    const centeredFactory = createSceneLayoutRenderObjectFactory({
      resource: createResource({ coordinateOrigin: "center" }),
      dependencies: { loadTexture: async () => Texture.WHITE },
    });

    const topLeft = await topLeftFactory.createRenderObject("badge");
    const centered = await centeredFactory.createRenderObject("badge");
    const topLeftView = getRenderObjectAdapter(topLeft).view;
    const centeredView = getRenderObjectAdapter(centered).view;
    expect(topLeftView).toBeInstanceOf(Sprite);
    expect(centeredView).toBeInstanceOf(Sprite);
    expect((topLeftView as Sprite).anchor.x).toBe(0);
    expect((topLeftView as Sprite).anchor.y).toBe(0);
    expect((centeredView as Sprite).anchor.x).toBe(0.5);
    expect((centeredView as Sprite).anchor.y).toBe(0.5);

    topLeftFactory.destroy();
    centeredFactory.destroy();
  });

  it("advances Spine playback only through mounted owner-clock updates", async () => {
    const player = new ManualSpinePlayer();
    const factory = createSceneLayoutRenderObjectFactory({
      resource: createResource(),
      dependencies: { createSpinePlayer: () => player },
    });
    const object = await factory.createRenderObject("nearwin1");
    const clock = createRenderObjectMotionRuntime();
    const playback = object.play("Nearwin");
    let completed = false;
    void playback.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    clock.update(0.1);
    await Promise.resolve();
    expect(completed).toBe(false);
    const mount = clock.attach(object);
    clock.update(0.1);
    await Promise.resolve();
    expect(completed).toBe(false);
    clock.update(0.1);
    await expect(playback).resolves.toBeUndefined();
    expect(player.plays).toEqual(["Nearwin"]);

    object.destroy();
    expect(player.destroyed).toBe(true);
    mount.detach();
    clock.destroy();
  });

  it("resolves looping playback at the first loop edge and keeps it running", async () => {
    const player = new ManualSpinePlayer();
    const lifecycle: unknown[] = [];
    const factory = createSceneLayoutRenderObjectFactory({
      resource: createResource(),
      dependencies: {
        createSpinePlayer: () => player,
        observeSpinePlayback: (event) => lifecycle.push(event),
      },
    });
    const object = await factory.createRenderObject("nearwin1");
    const clock = createRenderObjectMotionRuntime();
    clock.attach(object);
    const playback = object.play("Nearwin", { loop: true });
    clock.update(0.1);
    let completed = false;
    void playback.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    clock.update(0.1);
    await expect(playback).resolves.toBeUndefined();
    expect(player.loops).toEqual([true]);

    clock.update(0.1);
    expect(player.updates).toBe(3);
    object.stop();
    expect(player.resets).toBe(1);
    expect(lifecycle).toEqual([
      expect.objectContaining({
        resourceKey: "nearwin1",
        animation: "Nearwin",
        loop: true,
        phase: "started",
      }),
      expect.objectContaining({ phase: "ended", outcome: "stopped" }),
    ]);
    object.destroy();
    clock.destroy();
    factory.destroy();
  });

  it("attaches an ImgNumber RenderObject to an exact program Spine slot", async () => {
    const player = new ManualSpinePlayer();
    const factory = createSceneLayoutRenderObjectFactory({
      resource: createResource(),
      dependencies: { createSpinePlayer: () => player },
    });
    const spine = await factory.createRenderObject("nearwin1");
    const amount = await factory.createImgNumberRenderObject("winAmount", {
      text: "1",
      anchor: { x: 0.5, y: 0.5 },
    });
    amount.setPosition({ x: 3, y: 4 });
    const amountView = getRenderObjectAdapter(amount).view;

    const attachment = attachRenderObjectToSpineSlot({
      spine,
      child: amount,
      slot: "amount",
    });
    expect(player.slots.get(amountView)).toBe("amount");
    expect(amountView.position).toMatchObject({ x: 3, y: 4 });
    amount.setText("11");
    expect(amount.getText()).toBe("11");
    attachment.detach();
    attachment.detach();
    expect(amountView.parent).toBeNull();

    expect(() =>
      attachRenderObjectToSpineSlot({
        spine,
        child: amount,
        slot: "missing",
      }),
    ).toThrow(/unknown slot/);
    const automatic = attachRenderObjectToSpineSlot({
      spine,
      child: amount,
      slot: "amount",
    });
    amount.destroy();
    expect(player.slots.size).toBe(0);
    automatic.detach();
    spine.destroy();
    factory.destroy();
  });

  it("advances VNI authored playback and rejects named animation input", async () => {
    const player = new ManualVniPlayer();
    const factory = createSceneLayoutRenderObjectFactory({
      resource: createResource(),
      dependencies: { createVniPlayer: () => player },
    });
    const object = await factory.createRenderObject("sparkle");
    const clock = createRenderObjectMotionRuntime();
    clock.attach(object);
    await expect(object.play("named")).rejects.toThrow(
      /does not accept an animation name/,
    );
    const playback = object.play();
    clock.update(0.1);
    await expect(playback).resolves.toBeUndefined();
    object.destroy();
    expect(player.destroyed).toBe(true);
    clock.destroy();
  });

  it("resolves VNI looping playback at the authored first-cycle duration", async () => {
    const player = new ManualVniPlayer();
    const factory = createSceneLayoutRenderObjectFactory({
      resource: createResource(),
      dependencies: { createVniPlayer: () => player },
    });
    const object = await factory.createRenderObject("sparkle");
    const clock = createRenderObjectMotionRuntime();
    clock.attach(object);
    const playback = object.play(undefined, { loop: true });
    clock.update(0.1);
    let completed = false;
    void playback.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    clock.update(0.1);
    await expect(playback).resolves.toBeUndefined();
    expect(player.loops).toEqual([true]);
    object.stop();
    object.destroy();
    clock.destroy();
    factory.destroy();
  });

  it("settles pending playback on abort and factory destroy", async () => {
    const firstPlayer = new ManualSpinePlayer();
    const factory = createSceneLayoutRenderObjectFactory({
      resource: createResource(),
      dependencies: { createSpinePlayer: () => firstPlayer },
    });
    const first = await factory.createRenderObject("nearwin1");
    const controller = new AbortController();
    const aborted = first.play("Nearwin", { signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toThrow(/aborted/);
    expect(firstPlayer.resets).toBe(1);

    const pending = first.play("Nearwin");
    factory.destroy();
    await expect(pending).rejects.toThrow(/destroyed during playback/);
    expect(firstPlayer.destroyed).toBe(true);
  });

  it("rolls back a dynamic object when initialization fails", async () => {
    const player = new ManualSpinePlayer();
    player.init = vi.fn(() => {
      throw new Error("init failed");
    });
    const factory = createSceneLayoutRenderObjectFactory({
      resource: createResource(),
      dependencies: { createSpinePlayer: () => player },
    });
    await expect(factory.createRenderObject("nearwin1")).rejects.toThrow(
      /init failed/,
    );
    expect(player.destroyed).toBe(true);
  });
});
