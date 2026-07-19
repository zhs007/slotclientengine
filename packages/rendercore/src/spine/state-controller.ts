import type { RendercoreSpinePlayer } from "./runtime-player.js";

export interface SpineStateControllerSpec {
  readonly initialState: string;
  readonly states: Readonly<Record<string, { readonly animation: string }>>;
  readonly transitions: readonly {
    readonly from: string;
    readonly to: string;
    readonly animation: string;
  }[];
}

type SpineStateTransition = SpineStateControllerSpec["transitions"][number];

export interface SpineStateControllerSnapshot {
  readonly stableState: string;
  readonly targetState: string | null;
  readonly phase: "stable" | "transitioning";
}

/**
 * Owns only semantic Spine playback. Player init/update/view ownership remains
 * with the composing runtime so background and scene-layout share one state
 * transition implementation without sharing presentation policy.
 */
export class SpineStateController {
  readonly #player: RendercoreSpinePlayer;
  readonly #spec: SpineStateControllerSpec;
  readonly #createError: (message: string) => Error;
  readonly #transitions: ReadonlyMap<string, SpineStateTransition>;
  #stableState: string;
  #targetState: string | null = null;
  #resolve: (() => void) | null = null;
  #reject: ((error: Error) => void) | null = null;
  #started = false;
  #destroyed = false;

  constructor(options: {
    readonly player: RendercoreSpinePlayer;
    readonly spec: SpineStateControllerSpec;
    readonly createError: (message: string) => Error;
  }) {
    this.#player = options.player;
    this.#spec = options.spec;
    this.#createError = options.createError;
    this.#stableState = options.spec.initialState;
    this.#transitions = new Map(
      options.spec.transitions.map((transition) => [
        key(transition.from, transition.to),
        transition,
      ]),
    );
  }

  start(): void {
    this.assertAlive();
    if (this.#started)
      throw this.error("Spine state controller already started.");
    this.#started = true;
    this.#player.play({
      animationName: this.stateAnimation(this.#stableState),
      loop: true,
    });
  }

  updateCompleted(completed: boolean): void {
    this.assertReady();
    if (!this.#targetState || !completed) return;
    const target = this.#targetState;
    try {
      this.#player.play({
        animationName: this.stateAnimation(target),
        loop: true,
      });
      this.#stableState = target;
      this.#targetState = null;
      const resolve = this.#resolve;
      this.#resolve = null;
      this.#reject = null;
      resolve?.();
    } catch (error) {
      const failure = this.asError(error);
      this.rejectPending(failure);
      throw failure;
    }
  }

  request(state: string): Promise<void> {
    this.assertReady();
    if (!this.#spec.states[state]) {
      throw this.error(`Unknown Spine state "${state}".`);
    }
    if (this.#targetState) {
      throw this.error(
        `Spine transition to "${this.#targetState}" is already in progress.`,
      );
    }
    if (state === this.#stableState) return Promise.resolve();
    const transition = this.#transitions.get(key(this.#stableState, state));
    if (!transition) {
      throw this.error(
        `No direct Spine transition exists from "${this.#stableState}" to "${state}".`,
      );
    }
    this.#player.play({ animationName: transition.animation, loop: false });
    this.#targetState = state;
    return new Promise<void>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  snapshot(): SpineStateControllerSnapshot {
    this.assertReady();
    return Object.freeze({
      stableState: this.#stableState,
      targetState: this.#targetState,
      phase: this.#targetState ? "transitioning" : "stable",
    });
  }

  destroy(message = "Spine state controller was destroyed."): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.rejectPending(this.error(message));
  }

  private stateAnimation(state: string): string {
    const spec = this.#spec.states[state];
    if (!spec) throw this.error(`Unknown Spine state "${state}".`);
    return spec.animation;
  }

  private rejectPending(error: Error): void {
    const reject = this.#reject;
    this.#targetState = null;
    this.#resolve = null;
    this.#reject = null;
    reject?.(error);
  }

  private assertReady(): void {
    this.assertAlive();
    if (!this.#started)
      throw this.error("Spine state controller has not started.");
  }

  private assertAlive(): void {
    if (this.#destroyed)
      throw this.error("Spine state controller was destroyed.");
  }

  private error(message: string): Error {
    return this.#createError(message);
  }

  private asError(error: unknown): Error {
    return error instanceof Error ? error : this.error(String(error));
  }
}

function key(from: string, to: string): string {
  return `${from}\u0000${to}`;
}
