import { Container } from "pixi.js";
import {
  VNIPlayer,
  type VNIPlayerOptions,
} from "@slotclientengine/vnicore/pixi";
import {
  assertValidDeltaSeconds,
  createAppearSymbolAni,
  createStaticSymbolAni,
  createWinSymbolAni,
  ManualSymbolAni,
  resetBaseDisplay,
} from "./ani.js";
import { SymbolAnimationError } from "./errors.js";
import {
  createSymbolVniAnimationResourcesFromManifest,
  createSymbolSpineAnimationResourcesFromManifest,
  parseSymbolStateTextureManifest,
  type ParseSymbolStateTextureManifestOptions,
  type SymbolManifestAnimationSpec,
  type SymbolSpineAnimationResourceMap,
  type SymbolVniAnimationResource,
  type SymbolVniAnimationResourceMap,
} from "./manifest.js";
import {
  SpineNormalFallbackAni,
  SpineSymbolAni,
  type SpineSymbolAniPlayerFactory,
} from "./spine-animation.js";
import type {
  SymbolAni,
  SymbolAniUpdateResult,
  SymbolAnimationContext,
  SymbolAnimationResolver,
  SymbolPlaybackKind,
} from "./types.js";

export interface VniSymbolAniPlayer {
  init(): Promise<void>;
  getDisplayObject(): Container;
  playRange(options: {
    readonly range: {
      readonly unit: "time";
      readonly start: number;
      readonly end: number;
    };
    readonly loop: false;
  }): void;
  update(deltaSeconds: number): void;
  onPlaybackComplete(listener: () => void): () => void;
  pause?(): void;
  destroy(): void;
}

export type VniSymbolAniPlayerFactory = (
  options: VNIPlayerOptions,
) => VniSymbolAniPlayer;

export interface VniSymbolAniOptions {
  readonly context: SymbolAnimationContext;
  readonly resource: SymbolVniAnimationResource;
  readonly playerFactory?: VniSymbolAniPlayerFactory;
}

export interface CreateSymbolManifestAnimationResolverOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly vniProjectModules?: Readonly<Record<string, unknown>>;
  readonly vniAssetModules?: Readonly<Record<string, string>>;
  readonly spineSkeletonModules?: Readonly<Record<string, unknown>>;
  readonly spineAtlasModules?: Readonly<Record<string, string>>;
  readonly spineTextureModules?: Readonly<Record<string, string>>;
  readonly fallback?: SymbolAnimationResolver;
  readonly playerFactory?: VniSymbolAniPlayerFactory;
  readonly spinePlayerFactory?: SpineSymbolAniPlayerFactory;
}

const EMPTY_UPDATE_RESULT: SymbolAniUpdateResult = Object.freeze({
  loopCompleted: false,
  onceCompleted: false,
});

interface CachedVniSymbolPlayer {
  readonly key: string;
  readonly player: VniSymbolAniPlayer;
  initPromise: Promise<void>;
  initialized: boolean;
}

const cachedVniSymbolPlayers = new WeakMap<
  Container,
  Map<string, CachedVniSymbolPlayer>
>();

export class VniSymbolAni implements SymbolAni {
  readonly stateId: string;
  readonly playback: SymbolPlaybackKind = "once";
  readonly continuityKey: string;
  readonly #context: SymbolAnimationContext;
  readonly #resource: SymbolVniAnimationResource;
  readonly #playerFactory: VniSymbolAniPlayerFactory;
  #cacheEntry: CachedVniSymbolPlayer | null = null;
  #disposePlaybackComplete: (() => void) | null = null;
  #initError: unknown = null;
  #initialized = false;
  #completed = false;
  #reportedComplete = false;
  #destroyed = false;
  #playRequestId = 0;

  constructor(options: VniSymbolAniOptions) {
    this.#context = options.context;
    this.#resource = options.resource;
    this.stateId = options.context.resolvedState;
    this.continuityKey = createVniAnimationContinuityKey(options.resource);
    this.#playerFactory =
      options.playerFactory ??
      ((playerOptions) => new VNIPlayer(playerOptions));
  }

  reset(): void {
    this.assertNotDestroyed();
    this.detachCacheEntry();
    resetBaseDisplay(this.#context);
    this.#context.baseLayer.visible = false;
    this.#context.stateSprite.visible = false;
    this.#context.overlayLayer.removeChildren();
    this.#completed = false;
    this.#reportedComplete = false;
    this.#initError = null;
    this.#initialized = false;
    const entry = getOrCreateCachedVniSymbolPlayer({
      context: this.#context,
      resource: this.#resource,
      playerFactory: this.#playerFactory,
    });
    this.#cacheEntry = entry;
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
    if (!this.#initialized) {
      return EMPTY_UPDATE_RESULT;
    }
    this.#cacheEntry?.player.update(deltaSeconds);
    if (this.#completed && !this.#reportedComplete) {
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
    this.detachCacheEntry();
  }

  private async initializeAndPlay(
    entry: CachedVniSymbolPlayer,
    requestId: number,
  ): Promise<void> {
    try {
      await entry.initPromise;
      this.playCachedPlayer(entry, requestId);
    } catch (error) {
      if (this.#cacheEntry === entry && this.#playRequestId === requestId) {
        dropCachedVniSymbolPlayer(this.#context.root, entry);
        this.#cacheEntry = null;
        this.#initError = error;
      }
    }
  }

  private playCachedPlayer(
    entry: CachedVniSymbolPlayer,
    requestId: number,
  ): void {
    try {
      if (
        this.#destroyed ||
        this.#cacheEntry !== entry ||
        this.#playRequestId !== requestId
      ) {
        entry.player
          .getDisplayObject()
          .parent?.removeChild(entry.player.getDisplayObject());
        return;
      }
      const player = entry.player;
      const view = player.getDisplayObject();
      player.pause?.();
      alignVniRootToProjectStage(view, this.#resource.project);
      this.#disposePlaybackComplete?.();
      this.#disposePlaybackComplete = player.onPlaybackComplete(() => {
        this.#completed = true;
      });
      if (view.parent !== this.#context.overlayLayer) {
        resetBaseDisplay(this.#context);
        this.#context.baseLayer.visible = false;
        this.#context.stateSprite.visible = false;
        this.#context.overlayLayer.removeChildren();
        this.#context.overlayLayer.addChild(view);
      } else {
        this.#context.baseLayer.visible = false;
        this.#context.stateSprite.visible = false;
      }
      player.playRange({
        range: {
          unit: "time",
          start: this.#resource.spec.playback.startTime,
          end: this.#resource.spec.playback.endTime,
        },
        loop: false,
      });
      this.#initialized = true;
    } catch (error) {
      if (this.#cacheEntry === entry && this.#playRequestId === requestId) {
        this.#initError = error;
      }
    }
  }

  private detachCacheEntry(): void {
    this.#disposePlaybackComplete?.();
    this.#disposePlaybackComplete = null;
    this.#cacheEntry?.player.pause?.();
    this.#cacheEntry?.player
      .getDisplayObject()
      .parent?.removeChild(this.#cacheEntry.player.getDisplayObject());
    this.#cacheEntry = null;
    this.#initialized = false;
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError(
        `VNI symbol animation for "${this.#context.symbol}" was destroyed.`,
      );
    }
  }
}

export function destroyVniSymbolAnimationCache(root: Container): void {
  const rootCache = cachedVniSymbolPlayers.get(root);
  if (!rootCache) {
    return;
  }
  cachedVniSymbolPlayers.delete(root);
  for (const entry of rootCache.values()) {
    entry.player
      .getDisplayObject()
      .parent?.removeChild(entry.player.getDisplayObject());
    entry.player.destroy();
  }
  rootCache.clear();
}

function getOrCreateCachedVniSymbolPlayer(options: {
  readonly context: SymbolAnimationContext;
  readonly resource: SymbolVniAnimationResource;
  readonly playerFactory: VniSymbolAniPlayerFactory;
}): CachedVniSymbolPlayer {
  const key = createVniSymbolPlayerCacheKey(options.resource);
  let rootCache = cachedVniSymbolPlayers.get(options.context.root);
  if (!rootCache) {
    rootCache = new Map();
    cachedVniSymbolPlayers.set(options.context.root, rootCache);
  }
  const existing = rootCache.get(key);
  if (existing) {
    return existing;
  }

  const player = options.playerFactory({
    parent: options.context.overlayLayer,
    projectId: `${options.context.symbol}-${options.context.resolvedState}`,
    bundleId: "symbol-manifest",
    profileId: "symbol-vni",
    profilePurpose: "symbol-animation",
    assetScale: 1,
    project: options.resource.project,
    assetUrls: options.resource.assetUrls,
    autoTick: false,
    fitPadding: 0,
  });
  const entry: CachedVniSymbolPlayer = {
    key,
    player,
    initPromise: Promise.resolve(),
    initialized: false,
  };
  entry.initPromise = Promise.resolve(player.init()).then(() => {
    entry.initialized = true;
  });
  rootCache.set(key, entry);
  return entry;
}

function dropCachedVniSymbolPlayer(
  root: Container,
  entry: CachedVniSymbolPlayer,
): void {
  const rootCache = cachedVniSymbolPlayers.get(root);
  if (rootCache?.get(entry.key) === entry) {
    rootCache.delete(entry.key);
  }
  entry.player
    .getDisplayObject()
    .parent?.removeChild(entry.player.getDisplayObject());
  entry.player.destroy();
}

function createVniSymbolPlayerCacheKey(
  resource: SymbolVniAnimationResource,
): string {
  return [
    resource.symbol,
    resource.state,
    resource.spec.project,
    resource.spec.playback.startTime,
    resource.spec.playback.endTime,
    resource.spec.playback.loop,
    resource.project.name,
    resource.project.stage.width,
    resource.project.stage.height,
    resource.project.stage.duration,
    stableAssetUrlKey(resource.assetUrls),
  ].join("\u0000");
}

function createVniAnimationContinuityKey(
  resource: SymbolVniAnimationResource,
): string {
  return `vni:${JSON.stringify({
    symbol: resource.symbol,
    project: resource.spec.project,
    playback: resource.spec.playback,
    projectName: resource.project.name,
    stage: resource.project.stage,
    assetUrls: stableAssetUrlKey(resource.assetUrls),
  })}`;
}

function stableAssetUrlKey(assetUrls: SymbolVniAnimationResource["assetUrls"]) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(assetUrls).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

export function createSymbolManifestAnimationResolver(
  options: CreateSymbolManifestAnimationResolverOptions,
): SymbolAnimationResolver {
  const resources = createSymbolVniAnimationResourcesFromManifest({
    ...options,
    vniProjectModules: options.vniProjectModules ?? {},
    vniAssetModules: options.vniAssetModules ?? {},
  });
  const spineResources = createSymbolSpineAnimationResourcesFromManifest({
    ...options,
    spineSkeletonModules: options.spineSkeletonModules ?? {},
    spineAtlasModules: options.spineAtlasModules ?? {},
    spineTextureModules: options.spineTextureModules ?? {},
  });
  const manifestAnimationSpecs = createManifestAnimationSpecMap(options);
  return createSymbolVniAnimationResolver({
    resources,
    spineResources,
    manifestAnimationSpecs,
    fallback: options.fallback,
    playerFactory: options.playerFactory,
    spinePlayerFactory: options.spinePlayerFactory,
  });
}

export function createSymbolVniAnimationResolver(options: {
  readonly resources: SymbolVniAnimationResourceMap;
  readonly spineResources?: SymbolSpineAnimationResourceMap;
  readonly manifestAnimationSpecs?: SymbolManifestAnimationSpecMap;
  readonly fallback?: SymbolAnimationResolver;
  readonly playerFactory?: VniSymbolAniPlayerFactory;
  readonly spinePlayerFactory?: SpineSymbolAniPlayerFactory;
}): SymbolAnimationResolver {
  return (context) => {
    if (shouldUseRequestedStateTexture(context)) {
      return createStaticSymbolAni(context);
    }
    const spineResource =
      options.spineResources?.[context.symbol]?.[context.resolvedState];
    if (spineResource) {
      return new SpineSymbolAni({
        context,
        resource: spineResource,
        playerFactory: options.spinePlayerFactory,
      });
    }
    const resource = options.resources[context.symbol]?.[context.resolvedState];
    if (resource) {
      return new VniSymbolAni({
        context,
        resource,
        playerFactory: options.playerFactory,
      });
    }
    const spec =
      options.manifestAnimationSpecs?.[context.symbol]?.[context.resolvedState];
    if (spec) {
      return createManifestSymbolAni(context, spec);
    }
    const normalSpineResource =
      options.spineResources?.[context.symbol]?.normal;
    if (
      normalSpineResource &&
      context.resolvedState !== "normal" &&
      context.state.playback === "once"
    ) {
      return new SpineNormalFallbackAni({
        context,
        resource: normalSpineResource,
        playerFactory: options.spinePlayerFactory,
      });
    }
    if (options.fallback) {
      return options.fallback(context);
    }
    throw new SymbolAnimationError(
      `No manifest symbol animation is registered for "${context.symbol}" state "${context.resolvedState}".`,
    );
  };
}

function shouldUseRequestedStateTexture(
  context: SymbolAnimationContext,
): boolean {
  return (
    context.requestedState !== context.resolvedState &&
    (context.stateTextures[context.requestedState] !== undefined ||
      context.requiredStateTextures.includes(context.requestedState))
  );
}

type SymbolManifestAnimationSpecMap = Readonly<
  Record<string, Readonly<Partial<Record<string, SymbolManifestAnimationSpec>>>>
>;

function createManifestAnimationSpecMap(
  options: CreateSymbolManifestAnimationResolverOptions,
): SymbolManifestAnimationSpecMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(manifest.symbols)
        .filter(([, symbol]) => Object.keys(symbol.animations).length > 0)
        .map(([symbol, manifestSymbol]) => [
          symbol,
          Object.freeze({ ...manifestSymbol.animations }),
        ]),
    ),
  );
}

function createManifestSymbolAni(
  context: SymbolAnimationContext,
  spec: SymbolManifestAnimationSpec,
): SymbolAni {
  if (spec.kind === "activeSpine") {
    const active = context.createActiveSpineAnimation?.(spec.playback);
    if (!active) {
      throw new SymbolAnimationError(
        `Symbol "${context.symbol}" state "${context.resolvedState}" has no active Spine provider.`,
      );
    }
    return active;
  }
  if (spec.kind === "builtin") {
    if (context.resolvedState === "appear") {
      return createAppearSymbolAni(context, {
        durationSeconds: spec.durationSeconds,
      });
    }
    if (context.resolvedState === "win") {
      return createWinSymbolAni(context, {
        durationSeconds: spec.durationSeconds,
      });
    }
    throw new SymbolAnimationError(
      `No builtin manifest animation implementation for "${context.resolvedState}".`,
    );
  }
  if (spec.kind === "static") {
    return new ManualSymbolAni({
      stateId: context.resolvedState,
      playback: context.state.playback,
      durationSeconds: spec.durationSeconds,
      onReset: () => {
        resetBaseDisplay(context);
      },
    });
  }
  if (spec.kind === "empty") {
    return new ManualSymbolAni({
      stateId: context.resolvedState,
      playback: context.state.playback,
      durationSeconds: spec.durationSeconds,
      onReset: () => {
        resetBaseDisplay(context);
        context.baseLayer.visible = false;
        context.stateSprite.visible = false;
        context.underlayLayer.visible = false;
        context.overlayLayer.visible = false;
      },
    });
  }
  if (spec.kind === "spine") {
    throw new SymbolAnimationError(
      `No Spine resource was registered for "${context.symbol}" state "${context.resolvedState}".`,
    );
  }
  throw new SymbolAnimationError(
    `No VNI resource was registered for "${context.symbol}" state "${context.resolvedState}".`,
  );
}

function alignVniRootToProjectStage(
  root: Container,
  project: SymbolVniAnimationResource["project"],
): void {
  root.pivot.set(project.stage.width / 2, project.stage.height / 2);
  root.position.set(0, 0);
  root.scale.set(1);
}
