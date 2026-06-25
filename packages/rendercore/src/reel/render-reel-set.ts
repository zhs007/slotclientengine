import { Container } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { assertLayoutMatchesReels } from "./layout.js";
import { RenderReel } from "./render-reel.js";
import type {
  ReelSpinPlan,
  RenderReelSetOptions,
  RenderReelSetSnapshot,
  RenderReelSetUpdateResult,
} from "./types.js";

export class RenderReelSet extends Container {
  readonly reels: readonly RenderReel[];
  #spinPlan: ReelSpinPlan | null = null;
  #elapsedMs = 0;
  #startedAxes = new Set<number>();

  constructor(options: RenderReelSetOptions) {
    super();
    assertLayoutMatchesReels(options.layout, options.reels.getReelCount());

    this.reels = Object.freeze(
      Array.from({ length: options.reels.getReelCount() }, (_, x) => {
        const reel = new RenderReel({
          reels: options.reels,
          x,
          layout: options.layout,
          registry: options.registry,
        });
        this.addChild(reel);
        return reel;
      }),
    );
  }

  spin(plan: ReelSpinPlan): void {
    if (this.#spinPlan) {
      throw new ReelError(
        "Cannot start a new reel spin while another spin is active.",
      );
    }
    if (plan.axes.length !== this.reels.length) {
      throw new ReelError(
        `spin plan axes length ${plan.axes.length} does not match reel count.`,
      );
    }

    this.#spinPlan = plan;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
  }

  update(deltaSeconds: number): RenderReelSetUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);

    const previousElapsedMs = this.#elapsedMs;
    if (this.#spinPlan) {
      this.#elapsedMs = Math.min(
        this.#elapsedMs + deltaSeconds * 1000,
        this.#spinPlan.totalDurationMs,
      );
      this.startDueAxes();
    }

    const stoppedAxes: number[] = [];
    for (const reel of this.reels) {
      const axisPlan = this.#spinPlan?.axes[reel.xIndex];
      let reelDeltaSeconds = deltaSeconds;
      if (axisPlan && this.#startedAxes.has(reel.xIndex)) {
        const activeStart = Math.max(previousElapsedMs, axisPlan.startDelayMs);
        const activeEnd = Math.min(this.#elapsedMs, axisPlan.stopAtMs);
        reelDeltaSeconds = Math.max(0, activeEnd - activeStart) / 1000;
      }
      const result = reel.update(reelDeltaSeconds);
      if (result.completed) {
        stoppedAxes.push(reel.xIndex);
      }
    }

    const completed = Boolean(
      this.#spinPlan &&
      this.#spinPlan.axes.every((axis) => this.#startedAxes.has(axis.x)) &&
      this.reels.every((reel) => reel.getSnapshot().phase === "stopped"),
    );

    if (completed) {
      this.#spinPlan = null;
    }

    return Object.freeze({
      completed,
      spinning: this.#spinPlan !== null,
      startedAxes: Object.freeze(
        [...this.#startedAxes].sort((left, right) => left - right),
      ),
      stoppedAxes: Object.freeze(stoppedAxes),
    });
  }

  resetToFinalYs(finalYs: readonly number[]): void {
    if (finalYs.length !== this.reels.length) {
      throw new ReelError(
        `finalYs length ${finalYs.length} does not match reel count ${this.reels.length}.`,
      );
    }
    this.#spinPlan = null;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
    for (const [x, y] of finalYs.entries()) {
      this.reels[x].resetToY(y);
    }
  }

  getVisibleScene(): readonly (readonly number[])[] {
    return Object.freeze(this.reels.map((reel) => reel.getVisibleScene()));
  }

  getSnapshot(): RenderReelSetSnapshot {
    return Object.freeze({
      spinning: this.#spinPlan !== null,
      elapsedMs: this.#elapsedMs,
      visibleScene: this.getVisibleScene(),
      reels: Object.freeze(this.reels.map((reel) => reel.getSnapshot())),
    });
  }

  private startDueAxes(): void {
    const plan = this.#spinPlan;
    if (!plan) {
      return;
    }

    for (const axis of plan.axes) {
      if (
        this.#startedAxes.has(axis.x) ||
        this.#elapsedMs < axis.startDelayMs
      ) {
        continue;
      }
      this.reels[axis.x].start(axis);
      this.#startedAxes.add(axis.x);
    }
  }
}
