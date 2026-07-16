import type { Container } from "pixi.js";
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
import type { SymbolValuePresentationResource } from "./types.js";
import {
  assertSymbolValueDisplayResource,
  createSymbolValueDisplay,
} from "./value-display.js";

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

class RenderSymbolValueControllerModel implements RenderSymbolValueController {
  readonly #root: RenderSymbol;
  readonly #resource: SymbolValuePresentationResource;
  readonly #playerFactory: RenderSymbolValuePlayerFactory;
  #value: number | null = null;
  #player: ReturnType<typeof createOfficialSpinePlayer> | null = null;
  #tier: SymbolValuePresentationResource["tiers"][number] | null = null;
  #label: Container | null = null;
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
  }

  setValue(value: number | null): void {
    this.assertNotDestroyed();
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(
        "Render symbol presentation value must be a positive safe integer or null.",
      );
    }
    if (value === this.#value) return;
    this.#continuityGeneration += 1;
    this.clearActive();
    this.#value = null;
    if (value === null) return;

    const tier = this.#resource.tiers.find(
      (candidate) =>
        candidate.maxExclusive === undefined || value < candidate.maxExclusive,
    );
    if (!tier) {
      throw new Error(`No valuePresentation tier covers ${value}.`);
    }
    assertSymbolValueDisplayResource({ value, resource: this.#resource });
    let player: RendercoreSpineSlotPlayer | null = null;
    try {
      player = this.#playerFactory({ tier });
    } catch (error) {
      player?.destroy();
      throw error;
    }
    const requestId = ++this.#requestId;
    this.#value = value;
    this.#player = player;
    this.#tier = tier;
    this.#label = null;
    const transform = tier.spec.transform;
    player.view.position.set(transform?.x ?? 0, transform?.y ?? 0);
    player.view.scale.set(transform?.scale ?? 1);
    void this.initializePlayer({ player, requestId, value });
  }

  private async initializePlayer(options: {
    readonly player: RendercoreSpineSlotPlayer;
    readonly requestId: number;
    readonly value: number;
  }): Promise<void> {
    const { player, requestId, value } = options;
    let label: Container | null = null;
    try {
      await player.init();
      label = await createSymbolValueDisplay({
        value,
        resource: this.#resource,
      });
      if (
        this.#destroyed ||
        this.#requestId !== requestId ||
        this.#player !== player
      ) {
        label.destroy();
        return;
      }
      this.#label = label;
      player.attachSlotObject({
        slot: this.#resource.text.slot,
        object: label,
        followSlotColor: true,
      });
      this.#root.overlayLayer.addChild(player.view);
      this.#initialized = true;
      this.playActiveAnimation();
      this.syncVisibility();
    } catch (error) {
      label?.destroy();
      if (this.#requestId === requestId && this.#player === player) {
        this.#initializationError = error;
      }
    }
  }

  getValue(): number | null {
    return this.#value;
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
    this.#value = null;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.clearActive();
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
    this.syncVisibility();
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
    const label = this.#label;
    this.#player = null;
    this.#tier = null;
    this.#label = null;
    this.#root.baseLayer.visible = true;
    if (wasInitialized && player && label) player.removeSlotObject(label);
    label?.destroy();
    player?.destroy();
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
