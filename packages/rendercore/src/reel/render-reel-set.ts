import { Container } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { assertLayoutMatchesReels } from "./layout.js";
import { RenderReel } from "./render-reel.js";
import type {
  ReelSpinPlan,
  RenderReelSetOptions,
  RenderReelSetSpinOptions,
  RenderReelSetSnapshot,
  RenderReelSetUpdateResult,
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
} from "./types.js";
import type { SymbolStateId } from "../symbol/index.js";

export class RenderReelSet extends Container {
  readonly reels: readonly RenderReel[];
  #spinPlan: ReelSpinPlan | null = null;
  #spinOptions: RenderReelSetSpinOptions | null = null;
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

  spin(plan: ReelSpinPlan, options: RenderReelSetSpinOptions = {}): void {
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
    this.assertTargetVisibleScene(options.targetVisibleScene);

    this.#spinPlan = plan;
    this.#spinOptions = options;
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
      this.#spinOptions = null;
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
    this.#spinOptions = null;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
    for (const [x, y] of finalYs.entries()) {
      this.reels[x].resetToY(y);
    }
  }

  resetToVisibleScene(
    visibleScene: readonly (readonly number[])[],
    finalYs?: readonly number[],
  ): void {
    this.assertTargetVisibleScene(visibleScene);
    if (finalYs !== undefined && finalYs.length !== this.reels.length) {
      throw new ReelError(
        `finalYs length ${finalYs.length} does not match reel count ${this.reels.length}.`,
      );
    }
    this.#spinPlan = null;
    this.#spinOptions = null;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
    for (const [x, column] of visibleScene.entries()) {
      this.reels[x].resetToVisibleSymbols(column, finalYs?.[x] ?? 0);
    }
  }

  getVisibleScene(): readonly (readonly number[])[] {
    return Object.freeze(this.reels.map((reel) => reel.getVisibleScene()));
  }

  requestVisibleSymbolState(x: number, y: number, state: SymbolStateId): void {
    if (this.#spinPlan) {
      throw new ReelError(
        "Cannot request visible symbol state while reel set is spinning.",
      );
    }
    this.getReelAt(x).requestVisibleSymbolState(y, state);
  }

  requestVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
  ): void {
    for (const position of positions) {
      this.requestVisibleSymbolState(position.x, position.y, state);
    }
  }

  getVisibleSymbolStateSnapshot(
    x: number,
    y: number,
  ): RenderVisibleSymbolStateSnapshot {
    return this.getReelAt(x).getVisibleSymbolStateSnapshot(y);
  }

  getVisibleSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolStateSnapshot[] {
    return Object.freeze(
      positions.map((position) =>
        this.getVisibleSymbolStateSnapshot(position.x, position.y),
      ),
    );
  }

  getVisibleSymbolGeometrySnapshot(
    x: number,
    y: number,
  ): RenderVisibleSymbolGeometrySnapshot {
    if (this.#spinPlan) {
      throw new ReelError(
        "Cannot read visible symbol geometry while reel set is spinning.",
      );
    }
    return this.getReelAt(x).getVisibleSymbolGeometrySnapshot(y);
  }

  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[] {
    return Object.freeze(
      positions.map((position) =>
        this.getVisibleSymbolGeometrySnapshot(position.x, position.y),
      ),
    );
  }

  getSnapshot(): RenderReelSetSnapshot {
    return Object.freeze({
      spinning: this.#spinPlan !== null,
      elapsedMs: this.#elapsedMs,
      visibleScene: this.getVisibleScene(),
      reels: Object.freeze(this.reels.map((reel) => reel.getSnapshot())),
    });
  }

  private getReelAt(x: number): RenderReel {
    if (!Number.isInteger(x) || x < 0 || x >= this.reels.length) {
      throw new ReelError(`visible symbol x ${x} is out of range.`);
    }
    return this.reels[x];
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
      this.reels[axis.x].start(axis, {
        targetVisibleSymbols: this.#spinOptions?.targetVisibleScene?.[axis.x],
      });
      this.#startedAxes.add(axis.x);
    }
  }

  private assertTargetVisibleScene(
    targetVisibleScene: RenderReelSetSpinOptions["targetVisibleScene"],
  ): void {
    if (targetVisibleScene === undefined) {
      return;
    }
    if (targetVisibleScene.length !== this.reels.length) {
      throw new ReelError(
        `targetVisibleScene column count ${targetVisibleScene.length} does not match reel count ${this.reels.length}.`,
      );
    }
    for (const [x, column] of targetVisibleScene.entries()) {
      if (!Array.isArray(column)) {
        throw new ReelError(`targetVisibleScene[${x}] must be an array.`);
      }
      if (column.length !== this.reels[x].layout.visibleRows) {
        throw new ReelError(
          `targetVisibleScene[${x}] length must be ${this.reels[x].layout.visibleRows}.`,
        );
      }
    }
  }
}
