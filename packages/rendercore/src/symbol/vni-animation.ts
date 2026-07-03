import { Container } from "pixi.js";
import {
  VNIPlayer,
  type VNIPlayerOptions,
} from "@slotclientengine/vnicore/pixi";
import {
  assertValidDeltaSeconds,
  createAppearSymbolAni,
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

export class VniSymbolAni implements SymbolAni {
  readonly stateId: string;
  readonly playback: SymbolPlaybackKind = "once";
  readonly #context: SymbolAnimationContext;
  readonly #resource: SymbolVniAnimationResource;
  readonly #playerFactory: VniSymbolAniPlayerFactory;
  #player: VniSymbolAniPlayer | null = null;
  #disposePlaybackComplete: (() => void) | null = null;
  #initError: unknown = null;
  #initialized = false;
  #completed = false;
  #reportedComplete = false;
  #destroyed = false;

  constructor(options: VniSymbolAniOptions) {
    this.#context = options.context;
    this.#resource = options.resource;
    this.stateId = options.context.resolvedState;
    this.#playerFactory =
      options.playerFactory ??
      ((playerOptions) => new VNIPlayer(playerOptions));
  }

  reset(): void {
    this.assertNotDestroyed();
    this.disposePlayer();
    resetBaseDisplay(this.#context);
    this.#context.baseLayer.visible = false;
    this.#context.stateSprite.visible = false;
    this.#context.overlayLayer.removeChildren();
    this.#completed = false;
    this.#reportedComplete = false;
    this.#initError = null;
    void this.initializeAndPlay();
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
    this.#player?.update(deltaSeconds);
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
    this.disposePlayer();
  }

  private async initializeAndPlay(): Promise<void> {
    try {
      await this.ensureInitialized();
      if (this.#destroyed) {
        return;
      }
      this.#player?.playRange({
        range: {
          unit: "time",
          start: this.#resource.spec.playback.startTime,
          end: this.#resource.spec.playback.endTime,
        },
        loop: false,
      });
    } catch (error) {
      this.disposePlayer();
      this.#initError = error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.#initialized) {
      return;
    }
    const player = this.#playerFactory({
      parent: this.#context.overlayLayer,
      projectId: `${this.#context.symbol}-${this.#context.resolvedState}`,
      bundleId: "symbol-manifest",
      profileId: "symbol-vni",
      profilePurpose: "symbol-animation",
      assetScale: 1,
      project: this.#resource.project,
      assetUrls: this.#resource.assetUrls,
      autoTick: false,
      fitPadding: 0,
    });
    this.#player = player;
    await player.init();
    if (this.#destroyed) {
      return;
    }
    alignVniRootToProjectStage(
      player.getDisplayObject(),
      this.#resource.project,
    );
    this.#disposePlaybackComplete = player.onPlaybackComplete(() => {
      this.#completed = true;
    });
    this.#initialized = true;
  }

  private disposePlayer(): void {
    this.#disposePlaybackComplete?.();
    this.#disposePlaybackComplete = null;
    this.#player?.pause?.();
    this.#player?.destroy();
    this.#player = null;
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
    if (options.fallback) {
      return options.fallback(context);
    }
    throw new SymbolAnimationError(
      `No manifest symbol animation is registered for "${context.symbol}" state "${context.resolvedState}".`,
    );
  };
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
