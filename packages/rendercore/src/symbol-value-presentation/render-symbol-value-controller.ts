import { assertValidDeltaSeconds } from "../symbol/ani.js";
import type {
  RenderSymbol,
  SymbolAni,
  SymbolAnimationContext,
  SymbolAniUpdateResult,
  RenderSymbolValueController,
} from "../symbol/index.js";
import type { SymbolManifestAnimationPlaybackSpec } from "../symbol/manifest.js";
import { createOfficialSpinePlayer } from "../spine/runtime-player.js";
import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import type {
  SymbolValueDisplayHandle,
  SymbolValuePresentationResource,
} from "./types.js";
import {
  assertSymbolValueDisplayResource,
  createSymbolValueDisplay,
} from "./value-display.js";
import {
  notifySymbolImageStringSpineActive,
  notifySymbolImageStringSpineInactive,
} from "../symbol-image-string/controller.js";
import { Container } from "pixi.js";
import {
  createCloneableRenderObject,
  type CloneableRenderObject,
} from "../presentation/render-object.js";

export function createRenderSymbolValueController(options: {
  readonly root: RenderSymbol;
  readonly resource: SymbolValuePresentationResource;
  readonly playerFactory?: RenderSymbolValuePlayerFactory;
}): RenderSymbolValueController {
  return new RenderSymbolValueControllerModel(options);
}

export type RenderSymbolValuePlayerFactory = (options: {
  readonly tier: SymbolValuePresentationResource["tiers"][number];
}) => RendercoreSpineSlotPlayer;

interface CachedValuePlayer {
  readonly key: string;
  readonly player: RendercoreSpineSlotPlayer;
  readonly initPromise: Promise<void>;
}

function createValuePlayerKey(
  tier: SymbolValuePresentationResource["tiers"][number],
): string {
  return JSON.stringify({
    skeleton: tier.spec.skeleton,
    atlas: tier.spec.atlas,
    texture: tier.spec.texture,
  });
}

class RenderSymbolValueControllerModel implements RenderSymbolValueController {
  readonly #root: RenderSymbol;
  readonly #resource: SymbolValuePresentationResource;
  readonly #playerFactory: RenderSymbolValuePlayerFactory;
  readonly #displayRoot = new Container();
  readonly #players = new Map<string, CachedValuePlayer>();
  #value: number | null = null;
  #player: ReturnType<typeof createOfficialSpinePlayer> | null = null;
  #tier: SymbolValuePresentationResource["tiers"][number] | null = null;
  #tierIndex: number | null = null;
  #display: SymbolValueDisplayHandle | null = null;
  #presentationState = "normal";
  #attachedToPlayer = false;
  #initializationError: unknown = null;
  #requestId = 0;
  #initialized = false;
  #activeAnimation: ActiveSpineValueAni | null = null;
  #activePlayback: SymbolManifestAnimationPlaybackSpec | null = null;
  #continuityGeneration = 0;
  #destroyed = false;

  constructor(options: {
    readonly root: RenderSymbol;
    readonly resource: SymbolValuePresentationResource;
    readonly playerFactory?: RenderSymbolValuePlayerFactory;
  }) {
    this.#root = options.root;
    this.#resource = options.resource;
    this.#playerFactory =
      options.playerFactory ??
      (({ tier }) =>
        createOfficialSpinePlayer({
          resource: {
            skeleton: tier.skeleton,
            atlasText: tier.atlasText,
            textureUrls: { [tier.atlasPage]: tier.textureUrl },
          },
        }));
    this.#displayRoot.visible = false;
    this.#displayRoot.renderable = false;
  }

  validateValue(value: number | null): void {
    this.assertNotDestroyed();
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(
        "Render symbol presentation value must be a positive safe integer or null.",
      );
    }
    if (value === null) return;
    const tierIndex = this.resolveTierIndex(value);
    assertSymbolValueDisplayResource({
      value,
      tierIndex,
      resource: this.#resource,
    });
  }

  setValue(value: number | null): void {
    this.validateValue(value);
    if (value === this.#value) return;
    if (value === null) {
      this.#continuityGeneration += 1;
      this.clearActive();
      this.#value = null;
      return;
    }

    const tierIndex = this.resolveTierIndex(value);
    const tier = this.#resource.tiers[tierIndex];
    if (!tier) throw new Error(`No valuePresentation tier covers ${value}.`);
    if (
      tierIndex === this.#tierIndex &&
      this.#display?.type === "image-string"
    ) {
      this.#display.setText(String(value));
      this.#value = value;
      return;
    }
    const cached = this.getOrCreatePlayer(tier);
    this.#continuityGeneration += 1;
    this.clearActive();
    this.#value = null;
    const requestId = ++this.#requestId;
    this.#value = value;
    this.#player = cached.player;
    this.#tier = tier;
    this.#tierIndex = tierIndex;
    if (this.#display?.type === "image-string") {
      this.#display.setTier?.(tierIndex, value);
      this.prepareImageStringDisplayRoot(this.#display);
    } else {
      this.#display?.destroy();
      this.#display = null;
    }
    const transform = tier.spec.transform;
    cached.player.view.position.set(transform?.x ?? 0, transform?.y ?? 0);
    cached.player.view.scale.set(transform?.scale ?? 1);
    void this.initializePlayer({ cached, requestId, value, tierIndex });
  }

  private resolveTierIndex(value: number): number {
    const tierIndex = this.#resource.tiers.findIndex(
      (candidate) =>
        candidate.maxExclusive === undefined || value < candidate.maxExclusive,
    );
    if (tierIndex < 0)
      throw new Error(`No valuePresentation tier covers ${value}.`);
    return tierIndex;
  }

  private async initializePlayer(options: {
    readonly cached: CachedValuePlayer;
    readonly requestId: number;
    readonly value: number;
    readonly tierIndex: number;
  }): Promise<void> {
    const { cached, requestId, value, tierIndex } = options;
    const player = cached.player;
    let display: SymbolValueDisplayHandle | null = null;
    try {
      await cached.initPromise;
      if (this.#display?.type === "image-string") {
        display = this.#display;
      } else {
        display = await createSymbolValueDisplay({
          value,
          tierIndex,
          resource: this.#resource,
        });
      }
      if (
        this.#destroyed ||
        this.#requestId !== requestId ||
        this.#player !== player
      ) {
        if (display !== this.#display) display.destroy();
        return;
      }
      this.#display = display;
      if (display.type === "image-string") {
        this.prepareImageStringDisplayRoot(display);
      }
      this.#initialized = true;
      this.playActiveAnimation();
      this.syncPresentationView();
    } catch (error) {
      if (display && display !== this.#display) display.destroy();
      if (this.#requestId === requestId && this.#player === player) {
        this.#initializationError = error;
      }
    }
  }

  private getOrCreatePlayer(
    tier: SymbolValuePresentationResource["tiers"][number],
  ): CachedValuePlayer {
    const key = createValuePlayerKey(tier);
    const existing = this.#players.get(key);
    if (existing) return existing;
    const player = this.#playerFactory({ tier });
    const cached: CachedValuePlayer = {
      key,
      player,
      initPromise: Promise.resolve(player.init()),
    };
    this.#players.set(key, cached);
    return cached;
  }

  getValue(): number | null {
    return this.#value;
  }

  getReadiness(): Readonly<{
    status: "ready" | "pending" | "failed";
    error: unknown;
  }> {
    this.assertNotDestroyed();
    if (this.#initializationError) {
      return Object.freeze({
        status: "failed" as const,
        error: this.#initializationError,
      });
    }
    if (this.#value === null || this.#initialized) {
      return Object.freeze({ status: "ready" as const, error: null });
    }
    return Object.freeze({ status: "pending" as const, error: null });
  }

  cloneValue(): CloneableRenderObject {
    this.assertNotDestroyed();
    if (!this.#initialized || !this.#display)
      throw new Error(
        "Render symbol presentation value is not ready to clone.",
      );
    return this.createValueClone(this.#display.clone());
  }

  private createValueClone(
    display: SymbolValueDisplayHandle,
  ): CloneableRenderObject {
    const root = new Container();
    root.addChild(display.container);
    return createCloneableRenderObject({
      view: root,
      clone: () => this.createValueClone(display.clone()),
      destroy: () => {
        display.destroy();
        root.destroy({ children: false });
      },
    });
  }

  getValueView(): Container {
    this.assertNotDestroyed();
    if (!this.#initialized || !this.#display)
      throw new Error("Render symbol presentation value has no ready display.");
    return this.#display.container;
  }

  syncState(state: string): void {
    this.assertNotDestroyed();
    this.#presentationState = state;
    this.syncPresentationView();
  }

  createActiveSpineAnimation(
    context: SymbolAnimationContext,
    playback?: SymbolManifestAnimationPlaybackSpec,
  ): SymbolAni | null {
    this.assertNotDestroyed();
    if (this.#value === null || !this.#tier || !this.#player) return null;
    if (
      context.requestedState !== context.resolvedState &&
      context.stateTextures[context.requestedState]
    ) {
      return null;
    }
    const resolvedPlayback =
      playback ??
      (context.resolvedState === "normal"
        ? this.#tier.spec.playback
        : this.#resource.activeSpineAnimations?.[context.resolvedState]);
    if (!resolvedPlayback) return null;
    return new ActiveSpineValueAni({
      controller: this,
      context,
      playback: resolvedPlayback,
    });
  }

  createActiveAnimationContinuityKey(
    playback: SymbolManifestAnimationPlaybackSpec,
  ): string {
    const tier = this.#tier;
    if (!tier) {
      throw new Error("Active Spine continuity requires a selected tier.");
    }
    return `active-spine:${this.#continuityGeneration}:${JSON.stringify({
      skeleton: tier.spec.skeleton,
      atlas: tier.spec.atlas,
      texture: tier.spec.texture,
      playback,
      transform: tier.spec.transform ?? null,
    })}`;
  }

  resetForPoolRelease(): void {
    this.assertNotDestroyed();
    this.clearActive();
    this.#presentationState = "normal";
    this.#display?.setProfile?.("normal");
    this.#value = null;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.clearActive();
    this.#display?.destroy();
    this.#display = null;
    for (const cached of this.#players.values()) cached.player.destroy();
    this.#players.clear();
    this.#displayRoot.destroy({ children: false });
    this.#destroyed = true;
  }

  private syncVisibility(): void {
    const player = this.#player;
    const showActiveSpine =
      this.#initialized &&
      player !== null &&
      this.#activeAnimation !== null &&
      this.#activePlayback !== null;
    if (player) player.view.visible = showActiveSpine;
    if (showActiveSpine) {
      this.#root.baseLayer.visible = false;
      this.#root.stateSprite.visible = false;
    }
  }

  private syncPresentationView(): void {
    const player = this.#player;
    if (!this.#initialized || !player) return;
    if (player.view.parent !== this.#root.overlayLayer) {
      this.#root.overlayLayer.addChild(player.view);
    }
    notifySymbolImageStringSpineActive(
      this.#root,
      this.#root.getStateSnapshot().resolvedState,
      player,
      this,
    );
    this.syncValueAttachment();
    this.syncVisibility();
  }

  private syncValueAttachment(): void {
    const player = this.#player;
    const display = this.#display;
    const tierIndex = this.#tierIndex;
    if (!player || !display || tierIndex === null) return;
    const binding = this.#resource.imageStringTierBindings?.[tierIndex];
    const directSpinBlur =
      display.type === "image-string" &&
      this.#presentationState === "spinBlur" &&
      binding?.spinBlurProfile !== undefined;
    if (directSpinBlur) {
      display.setProfile?.("spinBlur");
      this.detachDisplayFromPlayer();
      if (this.#displayRoot.parent !== this.#root.imageStringOverlayLayer) {
        this.#root.imageStringOverlayLayer.addChild(this.#displayRoot);
      }
      this.#displayRoot.visible = true;
      this.#displayRoot.renderable = true;
      return;
    }
    display.setProfile?.("normal");
    if (this.#displayRoot.parent === this.#root.imageStringOverlayLayer) {
      this.#root.imageStringOverlayLayer.removeChild(this.#displayRoot);
    }
    const attachToSpine =
      this.#activeAnimation !== null && this.#activePlayback !== null;
    if (attachToSpine && !this.#attachedToPlayer) {
      const text = this.#resource.text;
      player.attachSlotObject({
        slot: binding?.slot ?? (text.type === "image-string" ? "" : text.slot),
        object:
          display.type === "image-string"
            ? this.#displayRoot
            : display.container,
        followSlotColor: binding?.followSlotColor ?? true,
      });
      this.#attachedToPlayer = true;
    } else if (!attachToSpine) {
      this.detachDisplayFromPlayer();
      if (display.type === "image-string") {
        this.#displayRoot.visible = false;
        this.#displayRoot.renderable = false;
      }
    }
  }

  private detachDisplayFromPlayer(): void {
    if (!this.#attachedToPlayer || !this.#player || !this.#display) return;
    this.#player.removeSlotObject(
      this.#display.type === "image-string"
        ? this.#displayRoot
        : this.#display.container,
    );
    this.#attachedToPlayer = false;
  }

  activate(
    animation: ActiveSpineValueAni,
    playback: SymbolManifestAnimationPlaybackSpec,
  ): void {
    this.assertNotDestroyed();
    this.#activeAnimation = animation;
    this.#activePlayback = playback;
    this.playActiveAnimation();
    this.syncPresentationView();
  }

  updateActive(
    animation: ActiveSpineValueAni,
    deltaSeconds: number,
  ): Readonly<{ completed: boolean; loopCompleted: boolean }> {
    assertValidDeltaSeconds(deltaSeconds);
    this.assertNotDestroyed();
    if (this.#initializationError) throw this.#initializationError;
    if (
      this.#activeAnimation !== animation ||
      !this.#initialized ||
      !this.#player
    ) {
      return Object.freeze({ completed: false, loopCompleted: false });
    }
    const result = this.#player.update(deltaSeconds);
    this.syncPresentationView();
    return Object.freeze({
      completed: result.completed,
      loopCompleted: result.loopCompleted === true,
    });
  }

  deactivate(animation: ActiveSpineValueAni): void {
    if (this.#activeAnimation !== animation) return;
    this.#activeAnimation = null;
    this.#activePlayback = null;
    this.syncValueAttachment();
    this.syncVisibility();
  }

  private playActiveAnimation(): void {
    const player = this.#player;
    const playback = this.#activePlayback;
    if (!player || !playback || !this.#initialized) return;
    player.play({
      animationName: playback.animationName,
      loop: playback.loop,
    });
  }

  private clearActive(): void {
    this.#requestId += 1;
    const wasInitialized = this.#initialized;
    this.#initialized = false;
    this.#initializationError = null;
    this.#activeAnimation = null;
    this.#activePlayback = null;
    const player = this.#player;
    if (wasInitialized && player && this.#display)
      this.detachDisplayFromPlayer();
    this.#player = null;
    this.#tier = null;
    this.#tierIndex = null;
    this.#root.baseLayer.visible = true;
    if (player) {
      notifySymbolImageStringSpineInactive(this.#root, player, this);
      player.view.parent?.removeChild(player.view);
      if (wasInitialized) player.reset();
    }
    if (this.#displayRoot.parent === this.#root.imageStringOverlayLayer) {
      this.#root.imageStringOverlayLayer.removeChild(this.#displayRoot);
    }
    this.#displayRoot.visible = false;
    this.#displayRoot.renderable = false;
  }

  private prepareImageStringDisplayRoot(
    display: SymbolValueDisplayHandle,
  ): Container {
    this.#displayRoot.removeChildren();
    this.#displayRoot.addChild(display.container);
    this.#displayRoot.visible = true;
    this.#displayRoot.renderable = true;
    return this.#displayRoot;
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error("Render symbol value controller was destroyed.");
    }
  }
}

class ActiveSpineValueAni implements SymbolAni {
  stateId: string;
  playback: SymbolAni["playback"];
  readonly continuityKey: string;
  readonly #controller: RenderSymbolValueControllerModel;
  readonly #playbackSpec: SymbolManifestAnimationPlaybackSpec;
  #reportedComplete = false;
  #destroyed = false;

  constructor(options: {
    readonly controller: RenderSymbolValueControllerModel;
    readonly context: SymbolAnimationContext;
    readonly playback: SymbolManifestAnimationPlaybackSpec;
  }) {
    this.#controller = options.controller;
    this.stateId = options.context.resolvedState;
    this.playback = options.context.state.playback;
    this.#playbackSpec = options.playback;
    this.continuityKey = this.#controller.createActiveAnimationContinuityKey(
      options.playback,
    );
  }

  reset(): void {
    if (this.#destroyed)
      throw new Error("Active Spine animation was destroyed.");
    this.#reportedComplete = false;
    this.#controller.activate(this, this.#playbackSpec);
  }

  adoptContinuation(next: SymbolAni): void {
    if (!(next instanceof ActiveSpineValueAni)) {
      throw new Error(
        "Active Spine continuation requires another active Spine animation.",
      );
    }
    this.stateId = next.stateId;
    this.playback = next.playback;
    this.#reportedComplete = false;
  }

  update(deltaSeconds: number): SymbolAniUpdateResult {
    if (this.#destroyed)
      throw new Error("Active Spine animation was destroyed.");
    const result = this.#controller.updateActive(this, deltaSeconds);
    if (this.playback === "loop" && result.loopCompleted) {
      return Object.freeze({ loopCompleted: true, onceCompleted: false });
    }
    if (
      this.playback !== "once" ||
      !result.completed ||
      this.#reportedComplete
    ) {
      return EMPTY_ANI_UPDATE_RESULT;
    }
    this.#reportedComplete = true;
    return Object.freeze({ loopCompleted: false, onceCompleted: true });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#controller.deactivate(this);
  }
}

const EMPTY_ANI_UPDATE_RESULT: SymbolAniUpdateResult = Object.freeze({
  loopCompleted: false,
  onceCompleted: false,
});
