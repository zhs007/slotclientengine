import { Container, Graphics } from "pixi.js";
import {
  VNIPlayer,
  type VNIPlayerOptions,
} from "@slotclientengine/vnicore/pixi";
import { assertValidDeltaSeconds, resetBaseDisplay } from "./ani.js";
import { SymbolAnimationError } from "./errors.js";
import {
  createSymbolVniAnimationResourcesFromManifest,
  type CreateSymbolVniAnimationResourcesOptions,
  type SymbolManifestStageRect,
  type SymbolVniAnimationResource,
  type SymbolVniAnimationResourceMap,
} from "./manifest.js";
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

export interface CreateSymbolManifestAnimationResolverOptions extends CreateSymbolVniAnimationResourcesOptions {
  readonly fallback?: SymbolAnimationResolver;
  readonly playerFactory?: VniSymbolAniPlayerFactory;
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
  #viewport: Container | null = null;
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
    const { viewport, content } = createVniViewport(
      this.#resource.spec.stageRect,
    );
    this.#context.overlayLayer.addChild(viewport);
    const player = this.#playerFactory({
      parent: content,
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
    this.#viewport = viewport;
    this.#player = player;
    await player.init();
    if (this.#destroyed) {
      return;
    }
    alignVniRootToStageRect(
      player.getDisplayObject(),
      this.#resource.spec.stageRect,
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
    this.detachViewport();
    this.#initialized = false;
  }

  private detachViewport(): void {
    const viewport = this.#viewport;
    this.#viewport = null;
    if (!viewport) {
      return;
    }
    viewport.parent?.removeChild(viewport);
    viewport.destroy({ children: true });
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
  const resources = createSymbolVniAnimationResourcesFromManifest(options);
  return createSymbolVniAnimationResolver({
    resources,
    fallback: options.fallback,
    playerFactory: options.playerFactory,
  });
}

export function createSymbolVniAnimationResolver(options: {
  readonly resources: SymbolVniAnimationResourceMap;
  readonly fallback?: SymbolAnimationResolver;
  readonly playerFactory?: VniSymbolAniPlayerFactory;
}): SymbolAnimationResolver {
  return (context) => {
    const resource = options.resources[context.symbol]?.[context.resolvedState];
    if (resource) {
      return new VniSymbolAni({
        context,
        resource,
        playerFactory: options.playerFactory,
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

function createVniViewport(rect: SymbolManifestStageRect): {
  readonly viewport: Container;
  readonly content: Container;
} {
  const viewport = new Container();
  const content = new Container();
  const mask = new Graphics();
  mask
    .rect(-rect.width / 2, -rect.height / 2, rect.width, rect.height)
    .fill(0xffffff);
  content.mask = mask;
  viewport.addChild(content, mask);
  return { viewport, content };
}

function alignVniRootToStageRect(
  root: Container,
  rect: SymbolManifestStageRect,
): void {
  root.pivot.set(rect.x + rect.width / 2, rect.y + rect.height / 2);
  root.position.set(0, 0);
  root.scale.set(1);
}
