import { Container, Graphics } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { assertLayoutMatchesReels } from "./layout.js";
import { RenderReel } from "./render-reel.js";
import { createRenderSymbolPool } from "./render-symbol-pool.js";
import type {
  ReelSpinPlan,
  RenderReelSetOptions,
  RenderReelSetSpinOptions,
  RenderReelSetSnapshot,
  RenderReelSetUpdateResult,
  RenderSymbolPoolStats,
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
  RenderSymbolPool,
  GridCellCascadeDropPlan,
  GridCellCascadeValueMatrix,
  RenderReelVisibleOccurrence,
} from "./types.js";
import type {
  SymbolStateId,
  SymbolStateTransitionMode,
} from "../symbol/index.js";

export class RenderReelSet extends Container {
  readonly reels: readonly RenderReel[];
  readonly #symbolPool: RenderSymbolPool | null;
  readonly #slotLayer: Container;
  readonly #cascadeMask: Graphics;
  #spinPlan: ReelSpinPlan | null = null;
  #spinOptions: RenderReelSetSpinOptions | null = null;
  #elapsedMs = 0;
  #startedAxes = new Set<number>();
  #activeDrop: {
    readonly plan: GridCellCascadeDropPlan;
    readonly movements: readonly {
      readonly movement: GridCellCascadeDropPlan["movements"][number];
      readonly occurrence: RenderReelVisibleOccurrence;
    }[];
    elapsedSeconds: number;
  } | null = null;

  constructor(options: RenderReelSetOptions) {
    super();
    assertLayoutMatchesReels(options.layout, options.reels.getReelCount());
    this.#symbolPool = createRenderSymbolPool(options.symbolPool);
    this.#slotLayer = new Container();
    this.#slotLayer.sortableChildren = true;
    this.#cascadeMask = new Graphics()
      .rect(
        0,
        0,
        options.layout.getReelX(options.reels.getReelCount() - 1) +
          options.layout.cellWidth,
        options.layout.getCellY(options.layout.visibleRows - 1) +
          options.layout.cellHeight,
      )
      .fill({ color: 0xffffff, alpha: 1 });
    this.#cascadeMask.visible = false;
    this.#cascadeMask.renderable = false;

    const slotCount = calculateSlotCount(options.layout);
    const slotRenderOrderStride = options.reels.getReelCount() * slotCount + 1;
    this.reels = Object.freeze(
      Array.from({ length: options.reels.getReelCount() }, (_, x) => {
        const reel = new RenderReel({
          reels: options.reels,
          x,
          layout: options.layout,
          registry: options.registry,
          symbolPool: this.#symbolPool ?? undefined,
          slotParent: this.#slotLayer,
          slotRenderOrderOffset: x * slotCount,
          slotRenderOrderStride,
          ...(options.bounceStrength === undefined
            ? {}
            : { bounceStrength: options.bounceStrength }),
        });
        this.addChild(reel);
        return reel;
      }),
    );
    this.addChild(this.#slotLayer);
    this.addChild(this.#cascadeMask);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.cancelActiveDrop();
    this.#symbolPool?.destroy();
    super.destroy(options);
  }

  spin(plan: ReelSpinPlan, options: RenderReelSetSpinOptions = {}): void {
    if (this.#spinPlan) {
      throw new ReelError(
        "Cannot start a new reel spin while another spin is active.",
      );
    }
    if (this.#activeDrop) {
      throw new ReelError("Cannot spin while cascade dropdown is active.");
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

    if (this.#activeDrop) this.updateActiveDrop(deltaSeconds);

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
      spinning: this.#spinPlan !== null || this.#activeDrop !== null,
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
    this.cancelActiveDrop();
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
    this.cancelActiveDrop();
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

  hasVisibleSymbolStateCapability(
    x: number,
    y: number,
    state: SymbolStateId,
  ): boolean {
    const slot = this.getReelAt(x)
      .getSlotSnapshots()
      .find((candidate) => candidate.windowY === y);
    return slot?.symbol?.hasAnimationCapability(state) ?? false;
  }

  releaseVisibleSymbols(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void {
    this.assertStopped("release visible symbols");
    for (const position of normalizeCascadePositions(
      positions,
      this.reels.length,
      this.reels[0]?.layout.visibleRows ?? 0,
    ))
      this.getReelAt(position.x).releaseVisibleOccurrence(position.y);
  }

  setVisibleSymbolDimming(
    highlightedPositions: readonly { readonly x: number; readonly y: number }[],
    dimmingAlpha: number,
  ): void {
    this.assertStopped("set visible symbol dimming");
    if (!Number.isFinite(dimmingAlpha) || dimmingAlpha < 0 || dimmingAlpha > 1)
      throw new ReelError("dimmingAlpha must be finite and between 0 and 1.");
    const highlighted = new Set(
      normalizeCascadePositions(
        highlightedPositions,
        this.reels.length,
        this.reels[0]?.layout.visibleRows ?? 0,
      ).map(({ x, y }) => `${x},${y}`),
    );
    for (const reel of this.reels)
      for (const slot of reel.getSlotSnapshots()) {
        if (
          slot.windowY < 0 ||
          slot.windowY >= reel.layout.visibleRows ||
          !slot.symbol
        )
          continue;
        const bright = highlighted.has(`${reel.xIndex},${slot.windowY}`);
        slot.symbol.alpha = 1;
        slot.symbol.tint = createBrightnessTint(bright ? 1 : 1 - dimmingAlpha);
      }
  }

  clearVisibleSymbolDimming(): void {
    for (const reel of this.reels)
      for (const slot of reel.getSlotSnapshots())
        if (slot.symbol) {
          slot.symbol.alpha = 1;
          slot.symbol.tint = 0xffffff;
        }
  }

  getCascadeValues(): GridCellCascadeValueMatrix {
    return Object.freeze(
      this.reels.map((reel) =>
        Object.freeze(
          reel
            .getSlotSnapshots()
            .filter(
              (slot) =>
                slot.windowY >= 0 && slot.windowY < reel.layout.visibleRows,
            )
            .sort((left, right) => left.windowY - right.windowY)
            .map((slot) => (slot.code === -1 ? -1 : slot.presentationValue)),
        ),
      ),
    );
  }

  startCascadeDrop(plan: GridCellCascadeDropPlan): void {
    this.assertStopped("start cascade dropdown");
    if (this.#activeDrop)
      throw new ReelError("Cascade dropdown is already active.");
    if (
      plan.columns !== this.reels.length ||
      plan.rows !== this.reels[0]?.layout.visibleRows
    )
      throw new ReelError(
        `Cascade dropdown dimensions ${plan.columns}x${plan.rows} do not match standard reel runtime.`,
      );
    assertCascadeMatrix(this.getVisibleScene(), plan.sourceScene, "scene");
    assertCascadeMatrix(this.getCascadeValues(), plan.sourceValues, "values");
    const active = plan.movements.map((movement) => {
      const reel = this.getReelAt(movement.x);
      const occurrence =
        movement.kind === "existing"
          ? reel.takeVisibleOccurrence(movement.sourceY)
          : reel.createDetachedOccurrence(
              movement.code,
              movement.presentationValue,
            );
      if (
        occurrence.code !== movement.code ||
        occurrence.presentationValue !== movement.presentationValue
      )
        throw new ReelError(
          `Cascade occurrence changed at (${movement.x},${movement.sourceY}).`,
        );
      if (occurrence.symbol.hasAnimationCapability("dropdown"))
        occurrence.symbol.requestState("dropdown");
      else occurrence.symbol.requestState("normal");
      occurrence.symbol.position.set(
        reel.layout.getReelX(movement.x) + reel.layout.cellWidth / 2,
        reel.layout.getCellY(movement.sourceY) + reel.layout.cellHeight / 2,
      );
      this.#slotLayer.addChild(occurrence.symbol);
      return Object.freeze({ movement, occurrence });
    });
    this.#activeDrop = {
      plan,
      movements: Object.freeze(active),
      elapsedSeconds: 0,
    };
    if (active.length === 0) this.completeActiveDrop();
    else {
      this.#cascadeMask.visible = true;
      this.#cascadeMask.renderable = true;
      this.#slotLayer.mask = this.#cascadeMask;
    }
  }

  requestVisibleSymbolState(
    x: number,
    y: number,
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    if (this.#spinPlan) {
      throw new ReelError(
        "Cannot request visible symbol state while reel set is spinning.",
      );
    }
    this.getReelAt(x).requestVisibleSymbolState(y, state, transitionMode);
  }

  requestVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    for (const position of positions) {
      this.requestVisibleSymbolState(
        position.x,
        position.y,
        state,
        transitionMode,
      );
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
      spinning: this.#spinPlan !== null || this.#activeDrop !== null,
      elapsedMs: this.#elapsedMs,
      visibleScene: this.getVisibleScene(),
      reels: Object.freeze(this.reels.map((reel) => reel.getSnapshot())),
    });
  }

  getSymbolPoolStats(): RenderSymbolPoolStats | null {
    return this.#symbolPool?.getStats() ?? null;
  }

  private getReelAt(x: number): RenderReel {
    if (!Number.isInteger(x) || x < 0 || x >= this.reels.length) {
      throw new ReelError(`visible symbol x ${x} is out of range.`);
    }
    return this.reels[x];
  }

  private assertStopped(action: string): void {
    if (this.#spinPlan || this.#activeDrop)
      throw new ReelError(`Cannot ${action} while standard reels are active.`);
  }

  private updateActiveDrop(deltaSeconds: number): void {
    const active = this.#activeDrop;
    if (!active) return;
    active.elapsedSeconds = Math.min(
      active.elapsedSeconds + deltaSeconds,
      active.plan.totalSeconds,
    );
    for (const item of active.movements) {
      const { movement, occurrence } = item;
      const local = Math.max(0, active.elapsedSeconds - movement.startSeconds);
      const duration = movement.fallSeconds + movement.settleSeconds;
      const progress = duration === 0 ? 1 : Math.min(1, local / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const layout = this.getReelAt(movement.x).layout;
      const rowStride = layout.getCellY(1) - layout.getCellY(0);
      occurrence.symbol.position.y =
        layout.getCellY(0) +
        (movement.sourceY + (movement.targetY - movement.sourceY) * eased) *
          rowStride +
        layout.cellHeight / 2;
      occurrence.symbol.update(deltaSeconds);
    }
    if (active.elapsedSeconds >= active.plan.totalSeconds)
      this.completeActiveDrop();
  }

  private completeActiveDrop(): void {
    const active = this.#activeDrop;
    if (!active) return;
    for (const { movement, occurrence } of active.movements) {
      occurrence.symbol.requestState("normal");
      occurrence.symbol.parent?.removeChild(occurrence.symbol);
      this.getReelAt(movement.x).placeVisibleOccurrence(
        occurrence,
        movement.targetY,
      );
    }
    this.#activeDrop = null;
    this.#slotLayer.mask = null;
    this.#cascadeMask.visible = false;
    this.#cascadeMask.renderable = false;
    assertCascadeMatrix(
      this.getVisibleScene(),
      active.plan.targetScene,
      "target scene",
    );
    assertCascadeMatrix(
      this.getCascadeValues(),
      active.plan.targetValues,
      "target values",
    );
  }

  private cancelActiveDrop(): void {
    const active = this.#activeDrop;
    if (!active) return;
    for (const { occurrence } of active.movements)
      this.getReelAt(0).releaseDetachedOccurrence(occurrence);
    this.#activeDrop = null;
    this.#slotLayer.mask = null;
    this.#cascadeMask.visible = false;
    this.#cascadeMask.renderable = false;
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

function normalizeCascadePositions(
  positions: readonly { readonly x: number; readonly y: number }[],
  columns: number,
  rows: number,
): readonly { readonly x: number; readonly y: number }[] {
  const seen = new Set<string>();
  return Object.freeze(
    positions.map((position, index) => {
      if (
        !Number.isSafeInteger(position.x) ||
        !Number.isSafeInteger(position.y) ||
        position.x < 0 ||
        position.x >= columns ||
        position.y < 0 ||
        position.y >= rows
      )
        throw new ReelError(`positions[${index}] is out of range.`);
      const key = `${position.x},${position.y}`;
      if (seen.has(key))
        throw new ReelError(`positions contains duplicate ${key}.`);
      seen.add(key);
      return Object.freeze({ x: position.x, y: position.y });
    }),
  );
}

function assertCascadeMatrix(
  actual: readonly (readonly unknown[])[],
  expected: readonly (readonly unknown[])[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some(
      (column, x) =>
        column.length !== expected[x]?.length ||
        column.some((value, y) => value !== expected[x]?.[y]),
    )
  )
    throw new ReelError(`Cascade ${label} does not match compiled plan.`);
}

function createBrightnessTint(brightness: number): number {
  const channel = Math.max(0, Math.min(255, Math.round(brightness * 255)));
  return (channel << 16) | (channel << 8) | channel;
}

function calculateSlotCount(layout: RenderReelSetOptions["layout"]): number {
  return layout.visibleRows + layout.bufferRowsBefore + layout.bufferRowsAfter;
}
