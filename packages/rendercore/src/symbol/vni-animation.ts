import { Rectangle, Sprite, Texture } from "pixi.js";
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
  readonly documentFactory?: () => Document;
}

export interface CreateSymbolManifestAnimationResolverOptions extends CreateSymbolVniAnimationResourcesOptions {
  readonly fallback?: SymbolAnimationResolver;
  readonly playerFactory?: VniSymbolAniPlayerFactory;
  readonly documentFactory?: () => Document;
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
  readonly #documentFactory: () => Document;
  #container: HTMLElement | null = null;
  #player: VniSymbolAniPlayer | null = null;
  #disposePlaybackComplete: (() => void) | null = null;
  #texture: Texture | null = null;
  #sprite: Sprite | null = null;
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
    this.#documentFactory = options.documentFactory ?? getGlobalDocument;
  }

  reset(): void {
    this.assertNotDestroyed();
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
    this.refreshTexture();
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
    this.#disposePlaybackComplete?.();
    this.#disposePlaybackComplete = null;
    this.#player?.pause?.();
    this.#player?.destroy();
    this.#player = null;
    if (this.#sprite) {
      this.#sprite.texture = Texture.EMPTY;
      this.#context.overlayLayer.removeChild(this.#sprite);
      this.#sprite.destroy();
      this.#sprite = null;
    }
    this.#texture?.destroy(false);
    this.#texture = null;
    this.#container?.remove();
    this.#container = null;
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
      this.refreshTexture();
    } catch (error) {
      this.#initError = error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.#initialized) {
      return;
    }
    const document = this.#documentFactory();
    if (!document.body) {
      throw new SymbolAnimationError(
        "VNI symbol animation requires document.body.",
      );
    }
    const container = createHiddenVniContainer(document, this.#resource);
    document.body.appendChild(container);
    const player = this.#playerFactory({
      container,
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
    this.#container = container;
    this.#player = player;
    await player.init();
    if (this.#destroyed) {
      return;
    }
    this.#disposePlaybackComplete = player.onPlaybackComplete(() => {
      this.#completed = true;
    });
    const canvas = getOnlyCanvas(container);
    this.#texture = createCroppedCanvasTexture(
      canvas,
      this.#resource.spec.stageRect,
    );
    this.#sprite = new Sprite(this.#texture);
    this.#sprite.anchor.set(0.5);
    this.#context.overlayLayer.addChild(this.#sprite);
    this.#initialized = true;
  }

  private refreshTexture(): void {
    if (!this.#texture) {
      return;
    }
    this.#texture.source.update();
    this.#texture.update();
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
    documentFactory: options.documentFactory,
  });
}

export function createSymbolVniAnimationResolver(options: {
  readonly resources: SymbolVniAnimationResourceMap;
  readonly fallback?: SymbolAnimationResolver;
  readonly playerFactory?: VniSymbolAniPlayerFactory;
  readonly documentFactory?: () => Document;
}): SymbolAnimationResolver {
  return (context) => {
    const resource = options.resources[context.symbol]?.[context.resolvedState];
    if (resource) {
      return new VniSymbolAni({
        context,
        resource,
        playerFactory: options.playerFactory,
        documentFactory: options.documentFactory,
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

function createHiddenVniContainer(
  document: Document,
  resource: SymbolVniAnimationResource,
): HTMLElement {
  const container = document.createElement("div");
  const { width, height } = resource.project.stage;
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "-10000px";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.opacity = "0";
  container.dataset.rendercoreVniSymbol = resource.symbol;
  container.dataset.rendercoreVniState = resource.state;
  return container;
}

function createCroppedCanvasTexture(
  canvas: HTMLCanvasElement,
  rect: SymbolManifestStageRect,
): Texture {
  const baseTexture = Texture.from(canvas, true);
  return new Texture({
    source: baseTexture.source,
    frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
    orig: new Rectangle(0, 0, rect.width, rect.height),
    dynamic: true,
  });
}

function getOnlyCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvases = container.querySelectorAll("canvas");
  if (canvases.length !== 1) {
    throw new SymbolAnimationError(
      `VNI symbol animation expected exactly one canvas, got ${canvases.length}.`,
    );
  }
  return canvases[0] as HTMLCanvasElement;
}

function getGlobalDocument(): Document {
  if (typeof document === "undefined") {
    throw new SymbolAnimationError(
      "VNI symbol animation requires a DOM document.",
    );
  }
  return document;
}
