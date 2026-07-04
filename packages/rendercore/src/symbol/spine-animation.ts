import {
  AtlasAttachmentLoader,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import { Assets, Container, type Texture } from "pixi.js";
import { assertValidDeltaSeconds, resetBaseDisplay } from "./ani.js";
import { SymbolAnimationError } from "./errors.js";
import { Spine38SymbolPlayer, isSpine38Skeleton } from "./spine38-runtime.js";
import type {
  SymbolSpineAnimationResource,
  SymbolSpineAnimationResourceMap,
} from "./manifest.js";
import type {
  SymbolAni,
  SymbolAniUpdateResult,
  SymbolAnimationContext,
  SymbolAnimationResolver,
  SymbolPlaybackKind,
} from "./types.js";

export interface RendercoreSpineSymbolPlayer {
  readonly view: Container;
  init(): Promise<void> | void;
  play(options: {
    readonly animationName: string;
    readonly loop: boolean;
  }): void;
  update(deltaSeconds: number): { readonly completed: boolean };
  reset(): void;
  destroy(): void;
}

export type SpineSymbolAniPlayerFactory = (options: {
  readonly resource: SymbolSpineAnimationResource;
}) => RendercoreSpineSymbolPlayer;

export interface SpineSymbolAniOptions {
  readonly context: SymbolAnimationContext;
  readonly resource: SymbolSpineAnimationResource;
  readonly playerFactory?: SpineSymbolAniPlayerFactory;
}

const EMPTY_UPDATE_RESULT: SymbolAniUpdateResult = Object.freeze({
  loopCompleted: false,
  onceCompleted: false,
});

interface CachedSpineSymbolPlayer {
  readonly key: string;
  readonly player: RendercoreSpineSymbolPlayer;
  initPromise: Promise<void>;
  initialized: boolean;
  owners: number;
}

const cachedSpineSymbolPlayers = new WeakMap<
  Container,
  Map<string, CachedSpineSymbolPlayer>
>();

export class SpineSymbolAni implements SymbolAni {
  readonly stateId: string;
  readonly playback: SymbolPlaybackKind;
  readonly #context: SymbolAnimationContext;
  readonly #resource: SymbolSpineAnimationResource;
  readonly #playerFactory: SpineSymbolAniPlayerFactory;
  #cacheEntry: CachedSpineSymbolPlayer | null = null;
  #initError: unknown = null;
  #initialized = false;
  #reportedComplete = false;
  #destroyed = false;
  #playRequestId = 0;

  constructor(options: SpineSymbolAniOptions) {
    this.#context = options.context;
    this.#resource = options.resource;
    this.stateId = options.context.resolvedState;
    this.playback = options.context.state.playback;
    this.#playerFactory =
      options.playerFactory ?? createDefaultSpineSymbolPlayer;
  }

  reset(): void {
    this.assertNotDestroyed();
    this.#reportedComplete = false;
    this.#initError = null;
    this.#initialized = false;
    const entry = getOrCreateCachedSpineSymbolPlayer({
      context: this.#context,
      resource: this.#resource,
      playerFactory: this.#playerFactory,
    });
    if (this.#cacheEntry !== entry) {
      this.releaseCacheEntry();
      entry.owners += 1;
      this.#cacheEntry = entry;
    }
    const requestId = (this.#playRequestId += 1);
    if (entry.initialized) {
      this.playCachedPlayer(entry, requestId);
      return;
    }
    void this.initializeAndPlay(entry, requestId).catch(() => undefined);
  }

  update(deltaSeconds: number): SymbolAniUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    this.assertNotDestroyed();
    if (this.#initError) {
      throw this.#initError;
    }
    if (!this.#initialized || !this.#cacheEntry) {
      return EMPTY_UPDATE_RESULT;
    }
    const result = this.#cacheEntry.player.update(deltaSeconds);
    if (
      this.playback === "once" &&
      result.completed &&
      !this.#reportedComplete
    ) {
      this.#reportedComplete = true;
      return Object.freeze({
        loopCompleted: false,
        onceCompleted: true,
      });
    }
    return EMPTY_UPDATE_RESULT;
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.releaseCacheEntry();
  }

  private async initializeAndPlay(
    entry: CachedSpineSymbolPlayer,
    requestId: number,
  ): Promise<void> {
    try {
      await entry.initPromise;
      this.playCachedPlayer(entry, requestId);
    } catch (error) {
      if (this.#cacheEntry === entry && this.#playRequestId === requestId) {
        this.#initError = error;
      }
    }
  }

  private playCachedPlayer(
    entry: CachedSpineSymbolPlayer,
    requestId: number,
  ): void {
    try {
      if (
        this.#destroyed ||
        this.#cacheEntry !== entry ||
        this.#playRequestId !== requestId
      ) {
        return;
      }
      const player = entry.player;
      applySpineTransform(player.view, this.#resource);
      player.play({
        animationName: this.#resource.spec.playback.animationName,
        loop: this.#resource.spec.playback.loop,
      });
      if (player.view.parent !== this.#context.overlayLayer) {
        resetBaseDisplay(this.#context);
        this.#context.baseLayer.visible = false;
        this.#context.stateSprite.visible = false;
        this.#context.overlayLayer.removeChildren();
        this.#context.overlayLayer.addChild(player.view);
      } else {
        this.#context.baseLayer.visible = false;
        this.#context.stateSprite.visible = false;
      }
      this.#initialized = true;
    } catch (error) {
      if (this.#cacheEntry === entry && this.#playRequestId === requestId) {
        this.#initError = error;
      }
    }
  }

  private releaseCacheEntry(): void {
    const entry = this.#cacheEntry;
    if (!entry) {
      return;
    }
    this.#cacheEntry = null;
    this.#initialized = false;
    entry.owners = Math.max(0, entry.owners - 1);
    if (entry.owners > 0) {
      return;
    }
    const rootCache = cachedSpineSymbolPlayers.get(this.#context.root);
    if (rootCache?.get(entry.key) === entry) {
      rootCache.delete(entry.key);
    }
    entry.player.view.parent?.removeChild(entry.player.view);
    entry.player.destroy();
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError(
        `Spine symbol animation for "${this.#context.symbol}" was destroyed.`,
      );
    }
  }
}

export class SpineNormalFallbackAni implements SymbolAni {
  readonly stateId: string;
  readonly playback: SymbolPlaybackKind;
  readonly #context: SymbolAnimationContext;
  readonly #inner: SpineSymbolAni;
  readonly #durationSeconds: number;
  #elapsedSeconds = 0;
  #reportedComplete = false;
  #destroyed = false;

  constructor(options: SpineSymbolAniOptions) {
    this.#context = options.context;
    this.stateId = options.context.resolvedState;
    this.playback = options.context.state.playback;
    this.#inner = new SpineSymbolAni(options);
    this.#durationSeconds =
      options.context.state.frameDurationSeconds ?? 1 / 60;
  }

  reset(): void {
    this.assertNotDestroyed();
    this.#elapsedSeconds = 0;
    this.#reportedComplete = false;
    this.#inner.reset();
  }

  update(deltaSeconds: number): SymbolAniUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    this.assertNotDestroyed();
    const innerResult = this.#inner.update(deltaSeconds);
    if (this.playback !== "once") {
      return innerResult;
    }
    if (
      this.#reportedComplete ||
      this.#context.overlayLayer.children.length === 0
    ) {
      return EMPTY_UPDATE_RESULT;
    }
    this.#elapsedSeconds += deltaSeconds;
    if (this.#elapsedSeconds < this.#durationSeconds) {
      return EMPTY_UPDATE_RESULT;
    }
    this.#reportedComplete = true;
    return Object.freeze({
      loopCompleted: false,
      onceCompleted: true,
    });
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#inner.destroy();
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError(
        `Spine normal fallback animation for "${this.#context.symbol}" was destroyed.`,
      );
    }
  }
}

function getOrCreateCachedSpineSymbolPlayer(options: {
  readonly context: SymbolAnimationContext;
  readonly resource: SymbolSpineAnimationResource;
  readonly playerFactory: SpineSymbolAniPlayerFactory;
}): CachedSpineSymbolPlayer {
  const key = createSpineSymbolPlayerCacheKey(options.resource);
  let rootCache = cachedSpineSymbolPlayers.get(options.context.root);
  if (!rootCache) {
    rootCache = new Map();
    cachedSpineSymbolPlayers.set(options.context.root, rootCache);
  }
  const existing = rootCache.get(key);
  if (existing) {
    return existing;
  }
  const player = options.playerFactory({ resource: options.resource });
  const entry: CachedSpineSymbolPlayer = {
    key,
    player,
    initPromise: Promise.resolve(),
    initialized: false,
    owners: 0,
  };
  entry.initPromise = Promise.resolve()
    .then(() => player.init())
    .then(() => {
      entry.initialized = true;
    });
  rootCache.set(key, entry);
  return entry;
}

function createSpineSymbolPlayerCacheKey(
  resource: SymbolSpineAnimationResource,
): string {
  return [
    resource.symbol,
    resource.spec.skeleton,
    resource.spec.atlas,
    resource.spec.texture,
    resource.atlasPage,
  ].join("\u0000");
}

function createDefaultSpineSymbolPlayer(options: {
  readonly resource: SymbolSpineAnimationResource;
}): RendercoreSpineSymbolPlayer {
  if (shouldUseSpine38Player(options.resource)) {
    return new Spine38SymbolPlayer(options);
  }
  return new OfficialSpineSymbolPlayer(options);
}

function shouldUseSpine38Player(
  resource: SymbolSpineAnimationResource,
): boolean {
  try {
    return isSpine38Skeleton(resource.skeleton);
  } catch {
    return false;
  }
}

export function createSymbolSpineAnimationResolver(options: {
  readonly resources: SymbolSpineAnimationResourceMap;
  readonly fallback?: SymbolAnimationResolver;
  readonly playerFactory?: SpineSymbolAniPlayerFactory;
}): SymbolAnimationResolver {
  return (context) => {
    const resource = options.resources[context.symbol]?.[context.resolvedState];
    if (resource) {
      return new SpineSymbolAni({
        context,
        resource,
        playerFactory: options.playerFactory,
      });
    }
    if (options.fallback) {
      return options.fallback(context);
    }
    throw new SymbolAnimationError(
      `No Spine symbol animation is registered for "${context.symbol}" state "${context.resolvedState}".`,
    );
  };
}

class OfficialSpineSymbolPlayer implements RendercoreSpineSymbolPlayer {
  readonly view = new Container();
  readonly #resource: SymbolSpineAnimationResource;
  #spine: Spine | null = null;
  #completed = false;
  #destroyed = false;

  constructor(options: { readonly resource: SymbolSpineAnimationResource }) {
    this.#resource = options.resource;
  }

  async init(): Promise<void> {
    this.assertNotDestroyed();
    const texture = await Assets.load<Texture>(this.#resource.textureUrl);
    this.assertNotDestroyed();
    const atlas = createRuntimeTextureAtlas(this.#resource, texture);
    const skeletonData = new SkeletonJson(
      new AtlasAttachmentLoader(atlas),
    ).readSkeletonData(this.#resource.skeleton);
    const spine = new Spine({
      skeletonData,
      autoUpdate: false,
      darkTint: false,
    });
    spine.autoUpdate = false;
    this.#spine = spine;
    this.view.addChild(spine);
  }

  play(options: { readonly animationName: string; readonly loop: boolean }) {
    this.assertNotDestroyed();
    const spine = this.getSpine();
    const animation = spine.skeleton.data.findAnimation(options.animationName);
    if (!animation) {
      throw new SymbolAnimationError(
        `Spine animation "${options.animationName}" was not found.`,
      );
    }
    this.#completed = false;
    spine.state.clearTracks();
    spine.state.clearListeners();
    spine.skeleton.setupPose();
    const entry = spine.state.setAnimation(0, animation, options.loop);
    entry.listener = {
      complete: (completedEntry) => {
        if (completedEntry === entry && !options.loop) {
          this.#completed = true;
        }
      },
    };
    spine.update(0);
  }

  update(deltaSeconds: number): { readonly completed: boolean } {
    assertValidDeltaSeconds(deltaSeconds);
    this.assertNotDestroyed();
    this.getSpine().update(deltaSeconds);
    return Object.freeze({ completed: this.#completed });
  }

  reset(): void {
    this.assertNotDestroyed();
    this.#completed = false;
    if (this.#spine) {
      this.#spine.state.clearTracks();
      this.#spine.state.clearListeners();
      this.#spine.skeleton.setupPose();
      this.#spine.update(0);
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#spine?.state.clearListeners();
    this.#spine?.destroy();
    this.#spine = null;
    this.view.removeChildren();
    this.view.parent?.removeChild(this.view);
  }

  private getSpine(): Spine {
    if (!this.#spine) {
      throw new SymbolAnimationError("Spine player has not initialized.");
    }
    return this.#spine;
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError("Spine player was destroyed.");
    }
  }
}

function createRuntimeTextureAtlas(
  resource: SymbolSpineAnimationResource,
  texture: Texture,
): TextureAtlas {
  const atlas = new TextureAtlas(resource.atlasText);
  if (atlas.pages.length !== 1 || atlas.pages[0]?.name !== resource.atlasPage) {
    throw new SymbolAnimationError(
      `Spine atlas page contract changed for "${resource.symbol}" state "${resource.state}".`,
    );
  }
  atlas.pages[0].setTexture(SpineTexture.from(texture.source));
  return atlas;
}

function applySpineTransform(
  view: Container,
  resource: SymbolSpineAnimationResource,
): void {
  const transform = resource.spec.transform;
  view.position.set(transform?.x ?? 0, transform?.y ?? 0);
  view.scale.set(transform?.scale ?? 1);
}
