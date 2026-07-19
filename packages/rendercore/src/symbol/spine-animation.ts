import { Container } from "pixi.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import {
  hasSymbolImageStringController,
  notifySymbolImageStringSpineActive,
  notifySymbolImageStringSpineInactive,
} from "../symbol-image-string/controller.js";
import { assertValidDeltaSeconds, resetBaseDisplay } from "./ani.js";
import { SymbolAnimationError } from "./errors.js";
import { readSupportedSpineSkeletonVersion } from "./spine-version.js";
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

export interface RendercoreSpineSymbolPlayer extends RendercoreSpinePlayer {
  init(): Promise<void> | void;
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
  stateId: string;
  playback: SymbolPlaybackKind;
  readonly continuityKey: string;
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
    this.continuityKey = createSpineAnimationContinuityKey(options.resource);
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
    if (this.playback === "loop" && result.loopCompleted) {
      return Object.freeze({
        loopCompleted: true,
        onceCompleted: false,
      });
    }
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

  adoptContinuation(next: SymbolAni): void {
    if (!(next instanceof SpineSymbolAni)) {
      throw new SymbolAnimationError(
        "Spine continuation requires another Spine symbol animation.",
      );
    }
    this.stateId = next.stateId;
    this.playback = next.playback;
    this.#reportedComplete = false;
    const player = this.#cacheEntry?.player;
    if (
      player &&
      this.#initialized &&
      hasSymbolImageStringController(this.#context.root)
    ) {
      const slotPlayer = requireSlotPlayer(player, this.#context.symbol);
      notifySymbolImageStringSpineActive(
        this.#context.root,
        next.#context.resolvedState,
        slotPlayer,
      );
    }
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
      if (hasSymbolImageStringController(this.#context.root)) {
        notifySymbolImageStringSpineActive(
          this.#context.root,
          this.#context.resolvedState,
          requireSlotPlayer(player, this.#context.symbol),
        );
      }
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
    if (hasSymbolImageStringController(this.#context.root)) {
      notifySymbolImageStringSpineInactive(
        this.#context.root,
        requireSlotPlayer(entry.player, this.#context.symbol),
      );
    }
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

function requireSlotPlayer(
  player: RendercoreSpinePlayer,
  symbol: string,
): RendercoreSpineSlotPlayer {
  const candidate = player as Partial<RendercoreSpineSlotPlayer>;
  if (
    typeof candidate.attachSlotObject !== "function" ||
    typeof candidate.removeSlotObject !== "function"
  ) {
    throw new SymbolAnimationError(
      `Spine player for symbol "${symbol}" does not support slot objects.`,
    );
  }
  return candidate as RendercoreSpineSlotPlayer;
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

function createSpineAnimationContinuityKey(
  resource: SymbolSpineAnimationResource,
): string {
  return `spine:${JSON.stringify({
    symbol: resource.symbol,
    skeleton: resource.spec.skeleton,
    atlas: resource.spec.atlas,
    texture: resource.spec.texture,
    playback: resource.spec.playback,
    transform: resource.spec.transform ?? null,
  })}`;
}

function createDefaultSpineSymbolPlayer(options: {
  readonly resource: SymbolSpineAnimationResource;
}): RendercoreSpineSymbolPlayer {
  readSupportedSpineSkeletonVersion(options.resource.skeleton);
  return createOfficialSpinePlayer({
    resource: {
      skeleton: options.resource.skeleton,
      atlasText: options.resource.atlasText,
      textureUrls: Object.freeze({
        [options.resource.atlasPage]: options.resource.textureUrl,
      }),
    },
    createError: (message) => new SymbolAnimationError(message),
  });
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

function applySpineTransform(
  view: Container,
  resource: SymbolSpineAnimationResource,
): void {
  const transform = resource.spec.transform;
  view.position.set(transform?.x ?? 0, transform?.y ?? 0);
  view.scale.set(transform?.scale ?? 1);
}
