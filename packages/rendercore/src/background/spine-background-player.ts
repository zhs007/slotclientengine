import { Container, Graphics } from "pixi.js";
import {
  assertValidSpineDeltaSeconds,
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import { SpineBackgroundError } from "./errors.js";
import type {
  SpineBackgroundPlayer,
  SpineBackgroundResource,
  SpineBackgroundSnapshot,
  SpineBackgroundTransitionSpec,
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
  readonly #transitions: ReadonlyMap<string, SpineBackgroundTransitionSpec>;
  #player: RendercoreSpinePlayer | null = null;
  #clipMask: Graphics | null = null;
  #stableState: string;
  #targetState: string | null = null;
  #transitionResolve: (() => void) | null = null;
  #transitionReject: ((error: Error) => void) | null = null;
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
    this.#stableState = options.resource.manifest.initialState;
    this.#transitions = new Map(
      options.resource.manifest.transitions.map((transition) => [
        transitionKey(transition.from, transition.to),
        transition,
      ]),
    );
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
      player.play({
        animationName: this.getStateAnimation(this.#stableState),
        loop: true,
      });
      this.#initialized = true;
    } catch (error) {
      player.destroy();
      this.#player = null;
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
    if (!this.#targetState || !result.completed) {
      return;
    }
    const targetState = this.#targetState;
    try {
      this.getPlayer().play({
        animationName: this.getStateAnimation(targetState),
        loop: true,
      });
      this.#stableState = targetState;
      this.#targetState = null;
      const resolve = this.#transitionResolve;
      this.#transitionResolve = null;
      this.#transitionReject = null;
      resolve?.();
    } catch (error) {
      const failure = asBackgroundError(error);
      this.rejectTransition(failure);
      throw failure;
    }
  }

  requestState(state: string): Promise<void> {
    this.assertReady();
    if (!this.#resource.manifest.states[state]) {
      throw new SpineBackgroundError(
        `Unknown Spine background state "${state}".`,
      );
    }
    if (this.#targetState) {
      throw new SpineBackgroundError(
        `Spine background transition to "${this.#targetState}" is already in progress.`,
      );
    }
    if (state === this.#stableState) {
      return Promise.resolve();
    }
    const transition = this.#transitions.get(
      transitionKey(this.#stableState, state),
    );
    if (!transition) {
      throw new SpineBackgroundError(
        `No direct Spine background transition exists from "${this.#stableState}" to "${state}".`,
      );
    }
    this.getPlayer().play({
      animationName: transition.animation,
      loop: false,
    });
    this.#targetState = state;
    return new Promise<void>((resolve, reject) => {
      this.#transitionResolve = resolve;
      this.#transitionReject = reject;
    });
  }

  getSnapshot(): SpineBackgroundSnapshot {
    this.assertReady();
    return Object.freeze({
      stableState: this.#stableState,
      targetState: this.#targetState,
      phase: this.#targetState ? "transitioning" : "stable",
    });
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.rejectTransition(
      new SpineBackgroundError("Spine background player was destroyed."),
    );
    this.container.mask = null;
    this.#clipMask?.destroy();
    this.#clipMask = null;
    this.#player?.destroy();
    this.#player = null;
    this.container.removeChildren();
    this.container.parent?.removeChild(this.container);
    this.#initialized = false;
  }

  private getStateAnimation(state: string): string {
    const spec = this.#resource.manifest.states[state];
    if (!spec) {
      throw new SpineBackgroundError(
        `Unknown Spine background state "${state}".`,
      );
    }
    return spec.animation;
  }

  private getPlayer(): RendercoreSpinePlayer {
    if (!this.#player) {
      throw new SpineBackgroundError(
        "Spine background player has not initialized.",
      );
    }
    return this.#player;
  }

  private rejectTransition(error: Error): void {
    const reject = this.#transitionReject;
    this.#targetState = null;
    this.#transitionResolve = null;
    this.#transitionReject = null;
    reject?.(error);
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

function transitionKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function asBackgroundError(error: unknown): SpineBackgroundError {
  return error instanceof SpineBackgroundError
    ? error
    : new SpineBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
}
