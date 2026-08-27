import { VNIRuntime } from "@slotclientengine/vnicore/core";
import { Assets, Cache, Container, Sprite, type Texture } from "pixi.js";
import { createManagedImgNumberRenderObject } from "../presentation/imgnumber-render-object.js";
import {
  createRenderObjectChildLayer,
  type RenderObjectChildLayerController,
} from "../presentation/render-object-child-layer.js";
import {
  createRenderObject,
  type RenderObject,
  type RenderObjectChildLayerRef,
  type RenderObjectPlayOptions,
} from "../presentation/render-object.js";
import {
  createParticleTrailRenderObject,
  type ParticleTrailConfig,
  type ParticleTrailRenderObject,
} from "../presentation/particle-trail-render-object.js";
import type { RenderAnchor } from "../presentation/render-anchor.js";
import type { ImgNumberRenderObject } from "../presentation/imgnumber-render-object.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
  type RendercoreSpineSlotPlayer,
} from "../spine/runtime-player.js";
import { SceneLayoutError } from "./errors.js";
import type {
  SceneLayoutPackageResource,
  SceneLayoutRuntimeResource,
} from "./types.js";

interface NamedVniPlayer {
  init(): Promise<void>;
  setLoop(loop: boolean): void;
  play(): void;
  pause(): void;
  restart(): void;
  update(deltaSeconds: number): void;
  destroy(): void;
  onPlaybackComplete(listener: () => void): () => void;
  attachNodeToTextLayer?(options: {
    readonly id: string;
    readonly layerId: string;
    readonly node: Container;
    readonly destroyOnDetach?: boolean;
    readonly hideOriginal?: boolean;
  }): () => void;
}

let nextVniChildLayerId = 1;

export interface SceneLayoutRenderObjectFactoryDependencies {
  readonly loadTexture?: (url: string) => Promise<Texture>;
  readonly createSpinePlayer?: (
    resource: Extract<SceneLayoutRuntimeResource, { readonly kind: "spine" }>,
  ) => RendercoreSpinePlayer;
  readonly createVniPlayer?: (options: {
    readonly name: string;
    readonly parent: Container;
    readonly resource: Extract<
      SceneLayoutRuntimeResource,
      { readonly kind: "vni" }
    >;
  }) => NamedVniPlayer;
  /** @internal Package runtime instrumentation; not a RenderObject hook. */
  readonly observeSpinePlayback?: (
    event: SceneLayoutRuntimeSpinePlaybackEvent,
  ) => void;
}

export interface SceneLayoutRuntimeSpinePlaybackEvent {
  readonly resourceKey: string;
  readonly animation: string;
  readonly loop: boolean;
  readonly phase: "started" | "ended";
  readonly outcome?:
    | "completed"
    | "stopped"
    | "superseded"
    | "aborted"
    | "failed"
    | "destroyed";
}

export interface SceneLayoutRenderObjectFactory {
  createRenderObject(name: string): Promise<RenderObject>;
  createParticleTrailRenderObject(
    name: string,
    options: {
      readonly emitter: RenderAnchor;
      readonly config: ParticleTrailConfig;
    },
  ): Promise<ParticleTrailRenderObject>;
  createImgNumberRenderObject(
    name: string,
    options: {
      readonly text: string;
      readonly anchor?: { readonly x: number; readonly y: number };
    },
  ): Promise<ImgNumberRenderObject>;
  destroy(): void;
}

interface ManagedRenderObject {
  readonly object: RenderObject;
}

export function createSceneLayoutRenderObjectFactory(options: {
  readonly resource: SceneLayoutPackageResource;
  readonly dependencies?: SceneLayoutRenderObjectFactoryDependencies;
}): SceneLayoutRenderObjectFactory {
  return new DefaultSceneLayoutRenderObjectFactory(
    options.resource,
    options.dependencies,
  );
}

class DefaultSceneLayoutRenderObjectFactory implements SceneLayoutRenderObjectFactory {
  readonly #resource: SceneLayoutPackageResource;
  readonly #loadTexture: (url: string) => Promise<Texture>;
  readonly #createSpinePlayer: NonNullable<
    SceneLayoutRenderObjectFactoryDependencies["createSpinePlayer"]
  >;
  readonly #createVniPlayer: NonNullable<
    SceneLayoutRenderObjectFactoryDependencies["createVniPlayer"]
  >;
  readonly #observeSpinePlayback?: (
    event: SceneLayoutRuntimeSpinePlaybackEvent,
  ) => void;
  readonly #objects = new Map<RenderObject, ManagedRenderObject>();
  #destroyed = false;

  constructor(
    resource: SceneLayoutPackageResource,
    dependencies: SceneLayoutRenderObjectFactoryDependencies = {},
  ) {
    this.#resource = resource;
    this.#loadTexture = dependencies.loadTexture ?? loadRenderObjectTexture;
    this.#createSpinePlayer =
      dependencies.createSpinePlayer ??
      ((resource) =>
        createOfficialSpinePlayer({
          resource,
          createError: (message) => new SceneLayoutError(message),
        }));
    this.#createVniPlayer =
      dependencies.createVniPlayer ??
      ((playerOptions) => {
        const profile = playerOptions.resource.project.exportProfile;
        if (!profile || profile.purpose !== "runtime")
          throw new SceneLayoutError(
            `Scene layout VNI runtime resource "${playerOptions.name}" is missing a runtime exportProfile.`,
          );
        return new VNIRuntime({
          parent: playerOptions.parent,
          project: playerOptions.resource.project,
          assetUrls: playerOptions.resource.assetUrls,
        });
      });
    this.#observeSpinePlayback = dependencies.observeSpinePlayback;
  }

  async createRenderObject(name: string): Promise<RenderObject> {
    this.assertAlive();
    const spec = this.requireSpec(name);
    if (spec.kind === "image-string")
      throw new SceneLayoutError(
        `Scene layout runtime resource "${name}" is image-string; use createImgNumberRenderObject().`,
      );
    if (spec.kind === "video")
      throw new SceneLayoutError(
        `Scene layout runtime resource "${name}" is video and cannot create a RenderObject.`,
      );
    if (spec.kind === "json")
      throw new SceneLayoutError(
        `Scene layout runtime resource "${name}" is JSON data; use loadJsonData().`,
      );
    const resource = await this.#resource.loadRuntimeResource(name, spec.kind);
    this.assertAlive();
    switch (resource.kind) {
      case "image":
        return this.createImage(name, resource);
      case "spine":
        return this.createSpine(name, resource);
      case "vni":
        return this.createVni(name, resource);
      default:
        return assertNever(resource);
    }
  }

  async createImgNumberRenderObject(
    name: string,
    options: {
      readonly text: string;
      readonly anchor?: { readonly x: number; readonly y: number };
    },
  ): Promise<ImgNumberRenderObject> {
    this.assertAlive();
    const spec = this.requireSpec(name);
    if (spec.kind !== "image-string")
      throw new SceneLayoutError(
        `Scene layout runtime resource "${name}" is ${spec.kind}, not image-string.`,
      );
    const loaded = await this.#resource.loadRuntimeResource(
      name,
      "image-string",
    );
    this.assertAlive();
    return createManagedImgNumberRenderObject(
      { resource: loaded.resource, ...options },
      {
        onCreate: (object) => this.register({ object }),
        onDestroy: (object) => this.#objects.delete(object),
      },
    );
  }

  async createParticleTrailRenderObject(
    name: string,
    options: {
      readonly emitter: RenderAnchor;
      readonly config: ParticleTrailConfig;
    },
  ): Promise<ParticleTrailRenderObject> {
    this.assertAlive();
    const spec = this.requireSpec(name);
    if (spec.kind !== "image")
      throw new SceneLayoutError(
        `Scene layout particle trail resource "${name}" is ${spec.kind}, not image.`,
      );
    const resource = await this.#resource.loadRuntimeResource(name, "image");
    const texture = await this.#loadTexture(resource.url);
    this.assertAlive();
    if (!texture?.source)
      throw new SceneLayoutError(
        `Scene layout runtime image "${name}" failed to load a valid Pixi texture.`,
      );
    if (
      texture.width !== resource.size.width ||
      texture.height !== resource.size.height
    )
      throw new SceneLayoutError(
        `Scene layout runtime image "${name}" size mismatch: expected ${resource.size.width}x${resource.size.height}, actual ${texture.width}x${texture.height}.`,
      );
    let object!: ParticleTrailRenderObject;
    object = createParticleTrailRenderObject({
      texture,
      emitter: options.emitter,
      config: options.config,
      label: `scene-layout-particle-trail:${name}`,
      onDestroy: () => this.#objects.delete(object),
    });
    this.register({ object });
    return object;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    const objects = [...this.#objects.keys()];
    this.#objects.clear();
    for (const object of objects) object.destroy();
  }

  private async createImage(
    name: string,
    resource: Extract<SceneLayoutRuntimeResource, { readonly kind: "image" }>,
  ): Promise<RenderObject> {
    const texture = await this.#loadTexture(resource.url);
    this.assertAlive();
    if (!texture?.source)
      throw new SceneLayoutError(
        `Scene layout runtime image "${name}" failed to load a valid Pixi texture.`,
      );
    if (
      texture.width !== resource.size.width ||
      texture.height !== resource.size.height
    )
      throw new SceneLayoutError(
        `Scene layout runtime image "${name}" size mismatch: expected ${resource.size.width}x${resource.size.height}, actual ${texture.width}x${texture.height}.`,
      );
    const sprite = new Sprite(texture);
    sprite.anchor.set(
      (this.#resource.manifest.coordinateOrigin ?? "top-left") === "center"
        ? 0.5
        : 0,
    );
    sprite.label = `scene-layout-runtime-image:${name}`;
    let object!: RenderObject;
    object = createRenderObject({
      view: sprite,
      destroy: () => {
        this.#objects.delete(object);
        sprite.destroy({
          children: false,
          texture: false,
          textureSource: false,
        });
      },
    });
    this.register({ object });
    return object;
  }

  private async createSpine(
    name: string,
    resource: Extract<SceneLayoutRuntimeResource, { readonly kind: "spine" }>,
  ): Promise<RenderObject> {
    const player = this.#createSpinePlayer(resource);
    try {
      await player.init();
      this.assertAlive();
    } catch (error) {
      player.destroy();
      throw error;
    }
    let active = createPendingPlayback();
    let looping = false;
    let lifecycle: {
      readonly animation: string;
      readonly loop: boolean;
    } | null = null;
    let object!: RenderObject;
    const endLifecycle = (
      outcome: NonNullable<SceneLayoutRuntimeSpinePlaybackEvent["outcome"]>,
    ): void => {
      if (!lifecycle) return;
      const ended = lifecycle;
      lifecycle = null;
      this.#observeSpinePlayback?.({
        resourceKey: name,
        animation: ended.animation,
        loop: ended.loop,
        phase: "ended",
        outcome,
      });
    };
    const stop = (
      reason: string,
      outcome: NonNullable<SceneLayoutRuntimeSpinePlaybackEvent["outcome"]>,
    ): void => {
      player.reset();
      looping = false;
      active = rejectPendingPlayback(active, reason);
      endLifecycle(outcome);
    };
    const slotPlayer = isSpineSlotPlayer(player) ? player : null;
    const childLayers = new Map<string, RenderObjectChildLayerController>();
    const getChildLayer = (ref: RenderObjectChildLayerRef) => {
      if (ref.kind !== "spine-slot" || !slotPlayer)
        throw new SceneLayoutError(
          `Scene layout Spine runtime resource "${name}" only exposes exact Spine slot child layers.`,
        );
      if (typeof ref.slot !== "string" || ref.slot.length === 0)
        throw new SceneLayoutError(
          "Spine slot name must be a non-empty exact name.",
        );
      const followSlotColor = ref.followSlotColor ?? true;
      const key = `${ref.slot}\u0000${followSlotColor ? "color" : "plain"}`;
      const existing = childLayers.get(key);
      if (existing) return existing.layer;
      for (const existingKey of childLayers.keys())
        if (existingKey.startsWith(`${ref.slot}\u0000`))
          throw new SceneLayoutError(
            `Spine slot child layer "${ref.slot}" already uses a different followSlotColor value.`,
          );
      let controller!: RenderObjectChildLayerController;
      controller = createRenderObjectChildLayer({
        owner: object,
        label: `scene-layout-runtime-spine:${name}:slot:${ref.slot}`,
        attach: (view) =>
          slotPlayer.attachSlotObject({
            slot: ref.slot,
            object: view,
            followSlotColor,
          }),
        detach: (view) => slotPlayer.removeSlotObject(view),
        createError: (message) => new SceneLayoutError(message),
      });
      childLayers.set(key, controller);
      return controller.layer;
    };
    object = createRenderObject({
      view: player.view,
      update: (deltaSeconds) => {
        try {
          const result = player.update(deltaSeconds);
          if (
            (looping && result.loopCompleted) ||
            (!looping && result.completed)
          ) {
            active = resolvePendingPlayback(active);
            if (!looping) endLifecycle("completed");
          }
        } catch (error) {
          active = rejectPendingPlayback(
            active,
            error instanceof Error ? error.message : String(error),
          );
          endLifecycle("failed");
          throw error;
        }
      },
      play: (animationName, playOptions) => {
        if (!animationName?.trim())
          return Promise.reject(
            new SceneLayoutError(
              `Scene layout Spine runtime resource "${name}" requires an exact animation name.`,
            ),
          );
        if (playOptions?.signal?.aborted)
          return Promise.reject(
            new SceneLayoutError(
              `Scene layout Spine runtime resource "${name}" playback was aborted.`,
            ),
          );
        active = rejectPendingPlayback(
          active,
          `Scene layout Spine runtime resource "${name}" playback was superseded.`,
        );
        endLifecycle("superseded");
        looping = playOptions?.loop ?? false;
        player.play({ animationName, loop: looping });
        lifecycle = { animation: animationName, loop: looping };
        this.#observeSpinePlayback?.({
          resourceKey: name,
          animation: animationName,
          loop: looping,
          phase: "started",
        });
        active = startPendingPlayback(playOptions, () => {
          player.reset();
          looping = false;
          active = createPendingPlayback();
          endLifecycle("aborted");
        });
        return active.promise!;
      },
      stop: () =>
        stop(
          `Scene layout Spine runtime resource "${name}" playback was stopped.`,
          "stopped",
        ),
      destroy: () => {
        this.#objects.delete(object);
        active = rejectPendingPlayback(
          active,
          `Scene layout Spine runtime resource "${name}" was destroyed during playback.`,
        );
        looping = false;
        endLifecycle("destroyed");
        player.destroy();
      },
      getChildLayer,
      ...(slotPlayer
        ? {
            spineSlots: {
              attach: (attachment) =>
                slotPlayer.attachSlotObject({
                  slot: attachment.slot,
                  object: attachment.object,
                  ...(attachment.followSlotColor === undefined
                    ? {}
                    : { followSlotColor: attachment.followSlotColor }),
                }),
              remove: (child) => slotPlayer.removeSlotObject(child),
            },
          }
        : {}),
    });
    this.register({ object });
    return object;
  }

  private async createVni(
    name: string,
    resource: Extract<SceneLayoutRuntimeResource, { readonly kind: "vni" }>,
  ): Promise<RenderObject> {
    const host = new Container();
    host.label = `scene-layout-runtime-vni:${name}`;
    let player: NamedVniPlayer | null = null;
    try {
      player = this.#createVniPlayer({ name, parent: host, resource });
      await player.init();
      this.assertAlive();
    } catch (error) {
      player?.destroy();
      host.destroy({ children: true });
      throw error;
    }
    const initializedPlayer = player;
    const textLayerIds = new Set(
      (resource.project.layers ?? [])
        .filter((layer) => layer.type === "text")
        .map((layer) => layer.id),
    );
    const childLayers = new Map<string, RenderObjectChildLayerController>();
    let active = createPendingPlayback();
    let loopFirstCycleRemaining: number | null = null;
    const disposeComplete = initializedPlayer.onPlaybackComplete(() => {
      if (loopFirstCycleRemaining === null)
        active = resolvePendingPlayback(active);
    });
    let object!: RenderObject;
    const stop = (reason: string): void => {
      initializedPlayer.pause();
      initializedPlayer.restart();
      loopFirstCycleRemaining = null;
      active = rejectPendingPlayback(active, reason);
    };
    const getChildLayer = (ref: RenderObjectChildLayerRef) => {
      if (ref.kind !== "vni-text-layer")
        throw new SceneLayoutError(
          `Scene layout VNI runtime resource "${name}" only exposes exact VNI text-layer child layers.`,
        );
      if (!textLayerIds.has(ref.layerId))
        throw new SceneLayoutError(
          `Unknown VNI text layer "${ref.layerId}" for runtime resource "${name}".`,
        );
      if (!initializedPlayer.attachNodeToTextLayer)
        throw new SceneLayoutError(
          `Scene layout VNI runtime resource "${name}" does not support text-layer attachment.`,
        );
      const existing = childLayers.get(ref.layerId);
      if (existing) return existing.layer;
      const mountedId = `rendercore-child-layer-${nextVniChildLayerId++}`;
      let dispose = () => {};
      const controller = createRenderObjectChildLayer({
        owner: object,
        label: `scene-layout-runtime-vni:${name}:text-layer:${ref.layerId}`,
        attach: (view) => {
          dispose = initializedPlayer.attachNodeToTextLayer!({
            id: mountedId,
            layerId: ref.layerId,
            node: view,
            destroyOnDetach: false,
            hideOriginal: true,
          });
        },
        detach: () => dispose(),
        createError: (message) => new SceneLayoutError(message),
      });
      childLayers.set(ref.layerId, controller);
      return controller.layer;
    };
    object = createRenderObject({
      view: host,
      update: (deltaSeconds) => {
        initializedPlayer.update(deltaSeconds);
        if (loopFirstCycleRemaining === null) return;
        loopFirstCycleRemaining -= deltaSeconds;
        if (loopFirstCycleRemaining <= 0) {
          loopFirstCycleRemaining = null;
          active = resolvePendingPlayback(active);
        }
      },
      play: (timelineName, playOptions) => {
        if (timelineName !== undefined)
          return Promise.reject(
            new SceneLayoutError(
              `Scene layout VNI runtime resource "${name}" plays its authored timeline and does not accept an animation name.`,
            ),
          );
        active = rejectPendingPlayback(
          active,
          `Scene layout VNI runtime resource "${name}" playback was superseded.`,
        );
        const loop = playOptions?.loop ?? false;
        initializedPlayer.setLoop(loop);
        loopFirstCycleRemaining = loop ? resource.project.stage.duration : null;
        initializedPlayer.restart();
        initializedPlayer.play();
        active = startPendingPlayback(playOptions, () => {
          initializedPlayer.pause();
          initializedPlayer.restart();
          loopFirstCycleRemaining = null;
          active = createPendingPlayback();
        });
        return active.promise!;
      },
      stop: () =>
        stop(
          `Scene layout VNI runtime resource "${name}" playback was stopped.`,
        ),
      getChildLayer,
      destroy: () => {
        this.#objects.delete(object);
        active = rejectPendingPlayback(
          active,
          `Scene layout VNI runtime resource "${name}" was destroyed during playback.`,
        );
        disposeComplete();
        loopFirstCycleRemaining = null;
        initializedPlayer.destroy();
        host.destroy({ children: true });
      },
    });
    this.register({ object });
    return object;
  }

  private requireSpec(name: string) {
    if (typeof name !== "string" || name.length === 0)
      throw new SceneLayoutError(
        "Scene layout runtime resource name must be a non-empty exact manifest key.",
      );
    const spec = this.#resource.runtimeManifest.runtimeResources?.[name];
    if (!spec)
      throw new SceneLayoutError(
        `Unknown scene layout runtime resource: ${name}.`,
      );
    return spec;
  }

  private register(record: ManagedRenderObject): void {
    this.assertAlive();
    this.#objects.set(record.object, record);
  }

  private assertAlive(): void {
    if (this.#destroyed)
      throw new SceneLayoutError(
        "Scene layout render object factory was destroyed.",
      );
  }
}

interface PendingPlayback {
  readonly promise: Promise<void> | null;
  readonly resolve: (() => void) | null;
  readonly reject: ((error: Error) => void) | null;
  readonly signal: AbortSignal | null;
  readonly abortListener: (() => void) | null;
}

function createPendingPlayback(): PendingPlayback {
  return {
    promise: null,
    resolve: null,
    reject: null,
    signal: null,
    abortListener: null,
  };
}

function startPendingPlayback(
  options: RenderObjectPlayOptions | undefined,
  onAbort: () => void,
): PendingPlayback {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  const signal = options?.signal ?? null;
  const active: PendingPlayback = {
    promise,
    resolve,
    reject,
    signal,
    abortListener: null,
  };
  if (!signal) return active;
  const abortListener = () => {
    reject(new SceneLayoutError("RenderObject playback was aborted."));
    onAbort();
  };
  signal.addEventListener("abort", abortListener, { once: true });
  return { ...active, abortListener };
}

function resolvePendingPlayback(active: PendingPlayback): PendingPlayback {
  if (!active.promise) return active;
  active.signal?.removeEventListener("abort", active.abortListener!);
  active.resolve!();
  return createPendingPlayback();
}

function rejectPendingPlayback(
  active: PendingPlayback,
  message: string,
): PendingPlayback {
  if (!active.promise) return active;
  active.signal?.removeEventListener("abort", active.abortListener!);
  active.reject!(new SceneLayoutError(message));
  return createPendingPlayback();
}

function isSpineSlotPlayer(
  player: RendercoreSpinePlayer,
): player is RendercoreSpineSlotPlayer {
  const candidate = player as Partial<RendercoreSpineSlotPlayer>;
  return (
    typeof candidate.attachSlotObject === "function" &&
    typeof candidate.removeSlotObject === "function"
  );
}

async function loadRenderObjectTexture(url: string): Promise<Texture> {
  const texture =
    url.startsWith("scene-layout-delivery:") && Cache.has(url)
      ? Cache.get<Texture>(url)
      : ((await Assets.load({
          src: url,
          parser: "loadTextures",
        })) as Texture | null | undefined);
  if (!texture?.source)
    throw new SceneLayoutError(
      "Scene layout runtime image failed to load a valid Pixi texture.",
    );
  return texture;
}

function assertNever(value: never): never {
  throw new SceneLayoutError(
    `Unsupported scene layout runtime resource: ${JSON.stringify(value)}.`,
  );
}
