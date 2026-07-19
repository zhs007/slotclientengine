import { Container, Graphics } from "pixi.js";
import {
  assertValidSpineDeltaSeconds,
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import { SpineStateController } from "../spine/state-controller.js";
import { SpineBackgroundError } from "./errors.js";
import type {
  SpineBackgroundPlayer,
  SpineBackgroundResource,
  SpineBackgroundSnapshot,
} from "./types.js";

export type SpineBackgroundLowLevelPlayerFactory = (options: {
  readonly resource: SpineBackgroundResource;
}) => RendercoreSpinePlayer;

export function createSpineBackgroundPlayer(options: {
  readonly resource: SpineBackgroundResource;
  readonly playerFactory?: SpineBackgroundLowLevelPlayerFactory;
}): SpineBackgroundPlayer {
  return new DefaultSpineBackgroundPlayer(options);
}

class DefaultSpineBackgroundPlayer implements SpineBackgroundPlayer {
  readonly container = new Container();
  readonly #resource: SpineBackgroundResource;
  readonly #playerFactory: SpineBackgroundLowLevelPlayerFactory;
  #player: RendercoreSpinePlayer | null = null;
  #stateController: SpineStateController | null = null;
  #clipMask: Graphics | null = null;
  #initializing = false;
  #initialized = false;
  #destroyed = false;

  constructor(options: {
    readonly resource: SpineBackgroundResource;
    readonly playerFactory?: SpineBackgroundLowLevelPlayerFactory;
  }) {
    this.#resource = options.resource;
    this.#playerFactory =
      options.playerFactory ?? createDefaultBackgroundLowLevelPlayer;
  }

  async init(): Promise<void> {
    this.assertNotDestroyed();
    if (this.#initializing || this.#initialized) {
      throw new SpineBackgroundError(
        "Spine background player is already initializing or initialized.",
      );
    }
    this.#initializing = true;
    const player = this.#playerFactory({ resource: this.#resource });
    this.#player = player;
    try {
      await player.init();
      this.assertNotDestroyed();
      const { transform } = this.#resource.manifest.resource;
      player.view.position.set(transform.x, transform.y);
      player.view.scale.set(transform.scale);
      const { width, height } = this.#resource.manifest.artSize;
      const clipMask = new Graphics()
        .rect(0, 0, width, height)
        .fill({ color: 0xffffff, alpha: 1 });
      this.#clipMask = clipMask;
      this.container.addChild(player.view, clipMask);
      this.container.mask = clipMask;
      this.#stateController = new SpineStateController({
        player,
        spec: this.#resource.manifest,
        createError: (message) => new SpineBackgroundError(message),
      });
      this.#stateController.start();
      this.#initialized = true;
    } catch (error) {
      player.destroy();
      this.#player = null;
      this.#stateController?.destroy(
        "Spine background player initialization failed.",
      );
      this.#stateController = null;
      this.#clipMask?.destroy();
      this.#clipMask = null;
      this.container.mask = null;
      this.container.removeChildren();
      throw asBackgroundError(error);
    } finally {
      this.#initializing = false;
    }
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    try {
      assertValidSpineDeltaSeconds(deltaSeconds);
    } catch (error) {
      throw asBackgroundError(error);
    }
    const result = this.getPlayer().update(deltaSeconds);
    this.getStateController().updateCompleted(result.completed);
  }

  requestState(state: string): Promise<void> {
    this.assertReady();
    return this.getStateController().request(state);
  }

  getSnapshot(): SpineBackgroundSnapshot {
    this.assertReady();
    return this.getStateController().snapshot();
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#stateController?.destroy("Spine background player was destroyed.");
    this.#stateController = null;
    this.container.mask = null;
    this.#clipMask?.destroy();
    this.#clipMask = null;
    this.#player?.destroy();
    this.#player = null;
    this.container.removeChildren();
    this.container.parent?.removeChild(this.container);
    this.#initialized = false;
  }

  private getPlayer(): RendercoreSpinePlayer {
    if (!this.#player) {
      throw new SpineBackgroundError(
        "Spine background player has not initialized.",
      );
    }
    return this.#player;
  }

  private getStateController(): SpineStateController {
    if (!this.#stateController) {
      throw new SpineBackgroundError(
        "Spine background state controller has not initialized.",
      );
    }
    return this.#stateController;
  }

  private assertReady(): void {
    this.assertNotDestroyed();
    if (!this.#initialized) {
      throw new SpineBackgroundError(
        "Spine background player has not initialized.",
      );
    }
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SpineBackgroundError("Spine background player was destroyed.");
    }
  }
}

function createDefaultBackgroundLowLevelPlayer(options: {
  readonly resource: SpineBackgroundResource;
}): RendercoreSpinePlayer {
  return createOfficialSpinePlayer({
    resource: {
      skeleton: options.resource.skeleton,
      atlasText: options.resource.atlasText,
      textureUrls: options.resource.textureUrls,
    },
    createError: (message) => new SpineBackgroundError(message),
  });
}

function asBackgroundError(error: unknown): SpineBackgroundError {
  return error instanceof SpineBackgroundError
    ? error
    : new SpineBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
}
