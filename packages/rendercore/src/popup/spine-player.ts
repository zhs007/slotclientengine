import { Container } from "pixi.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import type {
  PopupPackageResource,
  SpinePopupPlayer,
  SpinePopupSnapshot,
} from "./types.js";

export function createSpinePopupPlayer(options: {
  readonly resource: PopupPackageResource;
  readonly playerFactory?: () => RendercoreSpinePlayer;
}): SpinePopupPlayer {
  if (options.resource.manifest.type !== "spine")
    throw new Error("Spine popup player requires a spine popup package.");
  const manifest = options.resource.manifest;
  const prepared = options.resource.resources[manifest.spine.resource];
  if (prepared?.kind !== "spine")
    throw new Error("Spine popup prepared resource mismatch.");
  const player = options.playerFactory
    ? options.playerFactory()
    : createOfficialSpinePlayer({ resource: prepared.resource });
  return new DefaultSpinePopupPlayer(manifest, player);
}

class DefaultSpinePopupPlayer implements SpinePopupPlayer {
  readonly container = new Container();
  readonly #manifest: Extract<
    PopupPackageResource["manifest"],
    { readonly type: "spine" }
  >;
  readonly #player: RendercoreSpinePlayer;
  #phase: SpinePopupSnapshot["phase"] = "idle";
  #dismissRequested = false;
  #initialized = false;
  #destroyed = false;

  constructor(
    manifest: Extract<
      PopupPackageResource["manifest"],
      { readonly type: "spine" }
    >,
    player: RendercoreSpinePlayer,
  ) {
    this.#manifest = manifest;
    this.#player = player;
    this.container.position.set(
      manifest.spine.transform.x,
      manifest.spine.transform.y,
    );
    this.container.scale.set(manifest.spine.transform.scale);
    this.container.visible = false;
    this.container.addChild(player.view);
  }

  async init(): Promise<void> {
    this.assertUsable();
    if (this.#initialized) return;
    await this.#player.init();
    this.assertUsable();
    this.#initialized = true;
  }

  start(): void {
    this.assertReady();
    if (this.isPlaying()) throw new Error("Spine popup is already playing.");
    this.#dismissRequested = false;
    this.#phase = "start";
    this.container.visible = true;
    this.#player.play({
      animationName: this.#manifest.spine.playback.startAnimation,
      loop: false,
    });
  }

  update(deltaSeconds: number): SpinePopupSnapshot {
    this.assertReady();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative.");
    if (!this.isPlaying()) return this.getSnapshot();
    const result = this.#player.update(deltaSeconds);
    if (this.#phase === "start" && result.completed) {
      this.#phase = "loop";
      this.#player.play({
        animationName: this.#manifest.spine.playback.loopAnimation,
        loop: true,
      });
    } else if (
      this.#phase === "loop" &&
      this.#dismissRequested &&
      result.loopCompleted
    ) {
      this.#phase = "end";
      this.#player.play({
        animationName: this.#manifest.spine.playback.endAnimation,
        loop: false,
      });
    } else if (this.#phase === "end" && result.completed) {
      this.complete();
    }
    return this.getSnapshot();
  }

  requestDismiss(): void {
    this.assertReady();
    if (this.isPlaying()) this.#dismissRequested = true;
  }

  dismissImmediately(): void {
    this.assertReady();
    if (this.isPlaying()) this.complete();
  }

  getSnapshot(): SpinePopupSnapshot {
    this.assertUsable();
    return Object.freeze({
      phase: this.#phase,
      dismissRequested: this.#dismissRequested,
    });
  }

  isPlaying(): boolean {
    return ["start", "loop", "end"].includes(this.#phase);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#player.destroy();
    this.container.destroy({ children: false });
  }

  private complete(): void {
    this.#player.reset();
    this.#phase = "complete";
    this.container.visible = false;
  }

  private assertReady(): void {
    this.assertUsable();
    if (!this.#initialized)
      throw new Error("Spine popup player.init() must complete before use.");
  }

  private assertUsable(): void {
    if (this.#destroyed) throw new Error("Spine popup player was destroyed.");
  }
}
