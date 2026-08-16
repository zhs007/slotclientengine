import { VNIRuntime } from "@slotclientengine/vnicore/core";
import type { Container } from "pixi.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import type {
  VisibleOccurrenceEffectPlaybackOptions,
  VisibleOccurrenceEffectPlayer,
  VisibleOccurrenceEffectPlayerFactory,
} from "../reel/index.js";
import { SceneLayoutError } from "./errors.js";
import type { SceneLayoutPackageResource } from "./types.js";

export function createSceneLayoutOccurrenceEffectPlayerFactory(
  resource: SceneLayoutPackageResource,
): VisibleOccurrenceEffectPlayerFactory {
  return async ({ parent, attachment }) => {
    const loaded = await resource.loadRuntimeResource(
      attachment.key,
      attachment.kind,
    );
    if (loaded.kind === "spine") {
      const player = createOfficialSpinePlayer({
        resource: loaded,
        createError: (message) => new SceneLayoutError(message),
      });
      parent.addChild(player.view);
      await player.init();
      return new SpineOccurrenceEffectPlayer(player);
    }
    const profile = loaded.project.exportProfile;
    if (!profile || profile.purpose !== "runtime")
      throw new SceneLayoutError(
        `VNI occurrence effect "${attachment.key}" must have a runtime exportProfile.`,
      );
    const player = new VNIRuntime({
      parent,
      project: loaded.project,
      assetUrls: loaded.assetUrls,
    });
    await player.init();
    return new VniOccurrenceEffectPlayer(player, loaded.project.stage.duration);
  };
}

class SpineOccurrenceEffectPlayer implements VisibleOccurrenceEffectPlayer {
  readonly #player: RendercoreSpinePlayer;
  #resolve: (() => void) | null = null;
  #reject: ((error: Error) => void) | null = null;

  constructor(player: RendercoreSpinePlayer) {
    this.#player = player;
  }

  play(options: VisibleOccurrenceEffectPlaybackOptions): Promise<void> {
    if (options.kind !== "spine")
      return Promise.reject(
        new SceneLayoutError(
          "Spine occurrence effect requires spine playback options.",
        ),
      );
    if (this.#resolve)
      return Promise.reject(
        new SceneLayoutError("Occurrence effect already has active playback."),
      );
    this.#player.play({
      animationName: options.animationName,
      loop: options.loop ?? false,
    });
    return new Promise<void>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  update(deltaSeconds: number): void {
    const result = this.#player.update(deltaSeconds);
    if (!result.completed || !this.#resolve) return;
    const resolve = this.#resolve;
    this.#resolve = null;
    this.#reject = null;
    resolve();
  }

  stop(): void {
    this.#player.reset();
    const resolve = this.#resolve;
    this.#resolve = null;
    this.#reject = null;
    resolve?.();
  }

  destroy(): void {
    this.#reject?.(
      new SceneLayoutError("Occurrence effect was destroyed during playback."),
    );
    this.#resolve = null;
    this.#reject = null;
    this.#player.destroy();
  }
}

class VniOccurrenceEffectPlayer implements VisibleOccurrenceEffectPlayer {
  readonly #player: VNIRuntime;
  readonly #duration: number;
  #disposeCompletion: (() => void) | null = null;
  #resolve: (() => void) | null = null;
  #reject: ((error: Error) => void) | null = null;

  constructor(player: VNIRuntime, duration: number) {
    this.#player = player;
    this.#duration = duration;
  }

  play(options: VisibleOccurrenceEffectPlaybackOptions): Promise<void> {
    if (options.kind !== "vni")
      return Promise.reject(
        new SceneLayoutError(
          "VNI occurrence effect requires vni playback options.",
        ),
      );
    if (this.#resolve)
      return Promise.reject(
        new SceneLayoutError("Occurrence effect already has active playback."),
      );
    return new Promise<void>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
      this.#disposeCompletion = this.#player.onPlaybackComplete(() => {
        const complete = this.#resolve;
        this.#disposeCompletion?.();
        this.#disposeCompletion = null;
        this.#resolve = null;
        this.#reject = null;
        complete?.();
      });
      try {
        this.#player.playRange({
          range: { unit: "time", start: 0, end: this.#duration },
          loop: options.loop ?? false,
        });
      } catch (error) {
        this.#disposeCompletion?.();
        this.#disposeCompletion = null;
        this.#resolve = null;
        this.#reject = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  update(deltaSeconds: number): void {
    this.#player.update(deltaSeconds);
  }

  stop(): void {
    this.#player.pause();
    this.#disposeCompletion?.();
    this.#disposeCompletion = null;
    const resolve = this.#resolve;
    this.#resolve = null;
    this.#reject = null;
    resolve?.();
  }

  destroy(): void {
    this.#disposeCompletion?.();
    this.#disposeCompletion = null;
    this.#reject?.(
      new SceneLayoutError("Occurrence effect was destroyed during playback."),
    );
    this.#resolve = null;
    this.#reject = null;
    this.#player.destroy();
  }
}
