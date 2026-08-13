import { Container, Graphics } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { assertLayoutMatchesReels } from "./layout.js";
import { RenderReel } from "./render-reel.js";
import { createRenderSymbolPool } from "./render-symbol-pool.js";
import { startSymbolStatePlaybackBatch } from "./symbol-state-playback.js";
import { getRenderNodeAdapter } from "../symbol/render-node.js";
import {
  createContainerRenderAnchor,
  resolveRenderAnchor,
  type RenderAnchor,
} from "../presentation/render-anchor.js";
import {
  getPresentationMountTargetAdapter,
  registerPresentationMountTarget,
  type PresentationNodeMountOptions,
  type PresentationScopeContext,
} from "../presentation/presentation-scope.js";
import { prepareVisibleOccurrenceMotion } from "./visible-occurrence-transfer.js";
import type { RenderNode } from "../symbol/index.js";
import type { RenderPoint } from "../symbol/index.js";
import type {
  ReelRender,
  ReelRollOptions,
  ReelRollStartOptions,
  ReelRollTarget,
  ReelSpin,
} from "./reel-spin.js";
import {
  defaultAreaSpinFunction,
  type AreaSpinFunction,
  type AreaSpinLandOptions,
  type AreaSpinTarget,
  type ReelArea,
  type SymbolAreaLayer,
  type SymbolAreaLayerId,
} from "./reel-area.js";
import {
  createReelSpinSessionController,
  type ReelSpinSessionController,
} from "./spin-session.js";
import type {
  ReelSpinPlan,
  RenderReelSetOptions,
  RenderReelSpinOptions,
  RenderReelSetContinuousSpinOptions,
  VisibleSymbolStatePlaybackBatchOptions,
  VisibleSymbolStatePlaybackRequest,
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
  PreparedVisibleOccurrenceReplacement,
} from "./types.js";
import type {
  RenderSymbol,
  SymbolStateId,
  SymbolStatePlaybackOptions,
  SymbolStateTransitionMode,
} from "../symbol/index.js";
import {
  createEmptySymbolRender,
  createSymbolRender,
  type SymbolRender,
} from "../symbol/symbol-render.js";
import { createSymbolGroup } from "../symbol/symbol-group.js";
import type {
  SymbolPosition,
  SymbolReplacement,
  SymbolReplacementTarget,
} from "./symbol-area.js";

interface ActiveAtomicReel {
  readonly x: number;
  readonly mode: "roll" | "continuous" | "settle";
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  readonly resolve?: () => void;
  readonly reject?: (error: Error) => void;
}

const MAX_UPDATE_SLICE_SECONDS = 1 / 60;

interface PresentationDelayWaiter {
  remainingSeconds: number;
  readonly signal: AbortSignal;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly abortListener: () => void;
}

interface PresentationMountedNode {
  readonly target: SymbolAreaLayer;
  readonly node: RenderNode;
  readonly ownership: PresentationNodeMountOptions["ownership"];
}

interface PresentationMotion {
  readonly node: RenderNode;
  readonly prepared: ReturnType<typeof prepareVisibleOccurrenceMotion>;
  readonly signal: AbortSignal;
  readonly abortListener: () => void;
  elapsedSeconds: number;
  resolve(): void;
  reject(error: Error): void;
}

export class RenderReelSet extends Container implements ReelSpin {
  readonly reels: readonly RenderReel[];
  readonly #symbolPool: RenderSymbolPool | null;
  readonly #slotLayer: Container;
  readonly #cascadeMask: Graphics;
  readonly #occurrenceGenerations = new WeakMap<RenderSymbol, number>();
  readonly #atomicActive = new Map<number, ActiveAtomicReel>();
  readonly #reelAttachments: readonly {
    readonly layer: Container;
    readonly mounted: Set<RenderNode>;
  }[];
  readonly #reelSpinDefaults: Required<
    NonNullable<RenderReelSetOptions["reelSpin"]>
  >;
  readonly #areaLayers: ReadonlyMap<SymbolAreaLayerId, Container>;
  readonly #areaMounted = new Map<SymbolAreaLayerId, Set<RenderNode>>();
  readonly #areaSpinFunction: AreaSpinFunction;
  readonly #spinSessionController: ReelSpinSessionController;
  readonly #presentationDelayWaiters = new Set<PresentationDelayWaiter>();
  readonly #presentationMotions = new Set<PresentationMotion>();
  #presentationAbort: AbortController | null = null;
  #presentationFailure: Error | null = null;
  #areaSpinStarted = false;
  readonly #areaSpinController: ReelArea["spin"];
  readonly #areaFacade: ReelArea;
  #spinPlan: ReelSpinPlan | null = null;
  #spinOptions: RenderReelSetSpinOptions | null = null;
  #elapsedMs = 0;
  #startedAxes = new Set<number>();
  #continuousSpinActive = false;
  #settlingContinuous = false;
  #activeDrop: {
    readonly plan: GridCellCascadeDropPlan;
    readonly movements: readonly {
      readonly movement: GridCellCascadeDropPlan["movements"][number];
      readonly occurrence: RenderReelVisibleOccurrence;
    }[];
    elapsedSeconds: number;
  } | null = null;
  #destroyed = false;

  constructor(options: RenderReelSetOptions) {
    super();
    this.sortableChildren = true;
    assertLayoutMatchesReels(options.layout, options.reels.getReelCount());
    this.#symbolPool = createRenderSymbolPool(options.symbolPool);
    const reelSpinDirection = options.reelSpin?.direction ?? "forward";
    if (reelSpinDirection !== "forward" && reelSpinDirection !== "backward")
      throw new ReelError(
        'reelSpin.direction must be "forward" or "backward".',
      );
    this.#reelSpinDefaults = {
      direction: reelSpinDirection,
      durationMs: normalizePositiveFinite(
        options.reelSpin?.durationMs ?? 900,
        "reelSpin.durationMs",
      ),
      speedSymbolsPerSecond: normalizePositiveFinite(
        options.reelSpin?.speedSymbolsPerSecond ?? 24,
        "reelSpin.speedSymbolsPerSecond",
      ),
      minimumSpinCycles: normalizePositiveInteger(
        options.reelSpin?.minimumSpinCycles ?? 3,
        "reelSpin.minimumSpinCycles",
      ),
    };
    this.#areaSpinFunction =
      options.areaSpinFunction ?? defaultAreaSpinFunction;
    const bottomLayer = new Container();
    const topLayer = new Container();
    const winLayer = new Container();
    bottomLayer.sortableChildren = true;
    topLayer.sortableChildren = true;
    winLayer.sortableChildren = true;
    bottomLayer.zIndex = -1_000_000;
    topLayer.zIndex = 1_000_000;
    winLayer.zIndex = 2_000_000;
    this.#areaLayers = new Map([
      ["bottom", bottomLayer],
      ["top", topLayer],
      ["win", winLayer],
    ]);
    for (const id of this.#areaLayers.keys())
      this.#areaMounted.set(id, new Set());
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
    this.addChild(bottomLayer);
    this.addChild(this.#slotLayer);
    this.#reelAttachments = Object.freeze(
      this.reels.map((reel) => {
        const layer = new Container();
        layer.x = reel.x;
        layer.sortableChildren = true;
        this.addChild(layer);
        return { layer, mounted: new Set<RenderNode>() };
      }),
    );
    this.addChild(topLayer);
    this.addChild(winLayer);
    this.addChild(this.#cascadeMask);
    this.#areaSpinController = Object.freeze({
      start: () => this.startAreaSpin(),
      land: (target: AreaSpinTarget, options?: AreaSpinLandOptions) =>
        this.landAreaSpin(target, options),
      cancel: () => this.cancelAreaSpin(),
    });
    this.#areaFacade = Object.freeze({
      spin: this.#areaSpinController,
      getSymbol: (position: SymbolPosition) => this.getSymbol(position),
      getSymbols: (positions: readonly SymbolPosition[]) =>
        this.getSymbols(positions),
      replaceSymbol: (
        position: SymbolPosition,
        target: SymbolReplacementTarget,
      ) => this.replaceSymbol(position, target),
      replaceSymbols: (replacements: readonly SymbolReplacement[]) =>
        this.replaceSymbols(replacements),
      getAnchor: (point: RenderPoint) =>
        createContainerRenderAnchor(this, () => point),
      resolveAnchor: (anchor: RenderAnchor) => {
        this.assertAlive();
        return resolveRenderAnchor(anchor, this);
      },
      getLayer: (id: SymbolAreaLayerId) => this.getLayer(id),
      present: (
        presentation: Parameters<ReelArea["present"]>[0],
        options?: Parameters<ReelArea["present"]>[1],
      ) => this.present(presentation, options),
    });
    this.#spinSessionController = createReelSpinSessionController({
      reels: this,
      columns: options.layout.reelCount,
      rows: options.layout.visibleRows,
      beforeStart: () => this.interruptPresentation(),
    });
  }

  getSpinSessionController(): ReelSpinSessionController {
    return this.#spinSessionController;
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this.#destroyed) return;
    this.bumpVisibleOccurrenceGenerations();
    this.#destroyed = true;
    this.interruptPresentation();
    for (const active of [...this.#atomicActive.values()])
      this.failAtomic(active, new ReelError("ReelSpin was destroyed."));
    for (const attachment of this.#reelAttachments) {
      for (const node of attachment.mounted)
        getRenderNodeAdapter(node).view.parent?.removeChild(
          getRenderNodeAdapter(node).view,
        );
      attachment.mounted.clear();
    }
    for (const [id, nodes] of this.#areaMounted) {
      for (const node of nodes)
        getRenderNodeAdapter(node).view.parent?.removeChild(
          getRenderNodeAdapter(node).view,
        );
      nodes.clear();
      this.#areaLayers.get(id)?.removeChildren();
    }
    this.cancelContinuous();
    this.cancelActiveDrop();
    this.#symbolPool?.destroy();
    super.destroy(options);
  }

  spin(plan: ReelSpinPlan, options: RenderReelSetSpinOptions = {}): void {
    if (
      this.#spinPlan ||
      this.#continuousSpinActive ||
      this.#atomicActive.size
    ) {
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
    this.assertTargetVisibleMatrix(
      options.targetVisiblePresentationValues,
      "targetVisiblePresentationValues",
    );
    this.assertTargetVisibleMatrix(
      options.targetVisibleStates,
      "targetVisibleStates",
    );

    this.bumpVisibleOccurrenceGenerations();
    this.#spinPlan = plan;
    this.#spinOptions = options;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
    this.#settlingContinuous = false;
  }

  startContinuous(options: RenderReelSetContinuousSpinOptions): void {
    if (this.#spinPlan || this.#continuousSpinActive || this.#atomicActive.size)
      throw new ReelError(
        "Cannot start a continuous reel spin while another spin is active.",
      );
    if (this.#activeDrop)
      throw new ReelError(
        "Cannot start a continuous reel spin while cascade dropdown is active.",
      );
    const previousSymbols = this.getVisibleOccurrenceSymbols();
    const started: RenderReel[] = [];
    try {
      for (const reel of this.reels) {
        reel.startContinuous(options);
        started.push(reel);
      }
    } catch (error) {
      for (const reel of started) reel.cancelContinuous();
      for (const symbol of previousSymbols)
        this.bumpOccurrenceGeneration(symbol);
      throw error;
    }
    this.#spinPlan = null;
    this.#spinOptions = null;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set(this.reels.map((reel) => reel.xIndex));
    this.#continuousSpinActive = true;
    this.#settlingContinuous = false;
    for (const symbol of previousSymbols) this.bumpOccurrenceGeneration(symbol);
  }

  settleContinuous(
    plan: ReelSpinPlan,
    options: RenderReelSetSpinOptions = {},
  ): void {
    if (!this.#continuousSpinActive)
      throw new ReelError(
        "Cannot settle standard reels without an active continuous spin.",
      );
    if (plan.axes.length !== this.reels.length)
      throw new ReelError(
        `spin plan axes length ${plan.axes.length} does not match reel count.`,
      );
    this.assertTargetVisibleScene(options.targetVisibleScene);
    this.assertTargetVisibleMatrix(
      options.targetVisiblePresentationValues,
      "targetVisiblePresentationValues",
    );
    this.assertTargetVisibleMatrix(
      options.targetVisibleStates,
      "targetVisibleStates",
    );
    const axesByX = new Map(plan.axes.map((axis) => [axis.x, axis] as const));
    for (const reel of this.reels) {
      const axis = axesByX.get(reel.xIndex);
      if (!axis)
        throw new ReelError(`spin plan is missing axis ${reel.xIndex}.`);
      if (!reel.isContinuousSpinning())
        throw new ReelError(
          `Cannot settle reel ${reel.xIndex} without an active continuous spin.`,
        );
    }
    for (const axis of plan.axes) {
      this.reels[axis.x]!.settleContinuous(axis, {
        targetVisibleSymbols: options.targetVisibleScene?.[axis.x],
        targetVisiblePresentationValues:
          options.targetVisiblePresentationValues?.[axis.x],
        targetVisibleStates: options.targetVisibleStates?.[axis.x],
      });
    }
    this.#spinPlan = plan;
    this.#spinOptions = options;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set(plan.axes.map((axis) => axis.x));
    this.#continuousSpinActive = false;
    this.#settlingContinuous = true;
  }

  cancelContinuous(): void {
    if (!this.#continuousSpinActive && !this.#settlingContinuous) return;
    for (const reel of this.reels) {
      if (this.#continuousSpinActive) reel.cancelContinuous();
      else {
        const snapshot = reel.getSnapshot();
        reel.resetToVisibleSymbols(
          reel.getVisibleScene(),
          Math.floor(snapshot.currentY),
          reel.getVisiblePresentationValues(),
        );
      }
    }
    this.#spinPlan = null;
    this.#spinOptions = null;
    this.#continuousSpinActive = false;
    this.#settlingContinuous = false;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
  }

  isContinuousSpinning(): boolean {
    return this.#continuousSpinActive;
  }

  update(deltaSeconds: number): RenderReelSetUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    if (this.#presentationFailure) {
      const failure = this.#presentationFailure;
      this.#presentationFailure = null;
      throw failure;
    }

    let remaining = deltaSeconds;
    let first = true;
    let completed = false;
    const startedAxes = new Set<number>();
    const stoppedAxes = new Set<number>();
    while (first || remaining > 0) {
      first = false;
      const slice = Math.min(remaining, MAX_UPDATE_SLICE_SECONDS);
      remaining = Math.max(0, remaining - slice);
      const result = this.updateSlice(slice);
      completed ||= result.completed;
      for (const x of result.startedAxes) startedAxes.add(x);
      for (const x of result.stoppedAxes) stoppedAxes.add(x);
    }
    return Object.freeze({
      completed,
      spinning: this.getSnapshot().spinning,
      startedAxes: Object.freeze([...startedAxes].sort((a, b) => a - b)),
      stoppedAxes: Object.freeze([...stoppedAxes].sort((a, b) => a - b)),
    });
  }

  private updateSlice(deltaSeconds: number): RenderReelSetUpdateResult {
    this.updatePresentationDelays(deltaSeconds);
    this.updatePresentationMotions(deltaSeconds);
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
      if (
        axisPlan &&
        this.#startedAxes.has(reel.xIndex) &&
        !this.#settlingContinuous
      ) {
        const activeStart = Math.max(previousElapsedMs, axisPlan.startDelayMs);
        const activeEnd = Math.min(this.#elapsedMs, axisPlan.stopAtMs);
        reelDeltaSeconds = Math.max(0, activeEnd - activeStart) / 1000;
      }
      const result = reel.update(reelDeltaSeconds);
      const atomic = this.#atomicActive.get(reel.xIndex);
      if (atomic && atomic.mode !== "continuous" && result.landed) {
        this.detachAtomic(atomic);
        atomic.resolve?.();
      }
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
      this.#settlingContinuous = false;
    }

    return Object.freeze({
      completed,
      spinning:
        this.#spinPlan !== null ||
        this.#continuousSpinActive ||
        this.#atomicActive.size > 0 ||
        this.#activeDrop !== null,
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
    this.cancelAllAtomic();
    this.bumpVisibleOccurrenceGenerations();
    this.#spinPlan = null;
    this.#spinOptions = null;
    this.#continuousSpinActive = false;
    this.#settlingContinuous = false;
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
    this.cancelAllAtomic();
    this.bumpVisibleOccurrenceGenerations();
    this.#spinPlan = null;
    this.#spinOptions = null;
    this.#continuousSpinActive = false;
    this.#settlingContinuous = false;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
    for (const [x, column] of visibleScene.entries()) {
      this.reels[x].resetToVisibleSymbols(column, finalYs?.[x] ?? 0);
    }
  }

  getVisibleScene(): readonly (readonly number[])[] {
    return Object.freeze(this.reels.map((reel) => reel.getVisibleScene()));
  }

  getSymbol(position: SymbolPosition): SymbolRender {
    const reel = this.getReelAt(position.x);
    if (
      !Number.isInteger(position.y) ||
      position.y < 0 ||
      position.y >= reel.layout.visibleRows
    )
      throw new ReelError(`visible symbol y ${position.y} is out of range.`);
    if (
      reel.getSnapshot().phase !== "stopped" ||
      this.#atomicActive.has(position.x) ||
      (this.#spinPlan !== null && !this.#startedAxes.has(position.x))
    )
      throw new ReelError(
        `Cannot get symbol at (${position.x},${position.y}) before its reel has landed.`,
      );
    const occurrence = reel
      .getSlotSnapshots()
      .find((slot) => slot.windowY === position.y);
    if (!occurrence)
      throw new ReelError(
        `Cannot resolve standard reel cell (${position.x},${position.y}).`,
      );
    const getPosition = () =>
      Object.freeze({
        x: reel.x + reel.layout.cellWidth / 2,
        y:
          reel.y +
          reel.layout.getCellY(position.y) +
          reel.layout.cellHeight / 2,
      });
    if (occurrence.code === -1) {
      const capturedContainer = occurrence.container;
      const capturedLayer = occurrence.emptySymbolLayer;
      return createEmptySymbolRender({
        view: capturedLayer,
        owned: false,
        assertUsable: () => {
          const current = reel
            .getSlotSnapshots()
            .find((slot) => slot.windowY === position.y);
          if (
            this.#destroyed ||
            current?.container !== capturedContainer ||
            current.emptySymbolLayer !== capturedLayer ||
            current.code !== -1 ||
            current.kind !== "empty"
          )
            throw new ReelError("SymbolRender is stale.");
        },
        getPosition,
        getAnchor: () =>
          createContainerRenderAnchor(this, () => {
            const current = reel
              .getSlotSnapshots()
              .find((slot) => slot.windowY === position.y);
            if (
              this.#destroyed ||
              current?.container !== capturedContainer ||
              current.emptySymbolLayer !== capturedLayer ||
              current.code !== -1
            )
              throw new ReelError("SymbolRender is stale.");
            return getPosition();
          }),
      });
    }
    if (!occurrence.symbol || occurrence.kind === "empty")
      throw new ReelError(
        `Configured symbol code ${occurrence.code} at standard reel cell (${position.x},${position.y}) has no renderable occurrence.`,
      );
    const captured = occurrence.symbol;
    const generation = this.getOccurrenceGeneration(captured);
    const createOwnedSource = (
      symbolOccurrence: RenderReelVisibleOccurrence,
    ) => {
      let released = false;
      return {
        symbol: symbolOccurrence.symbol,
        owned: true,
        assertUsable: () => {
          if (released) throw new ReelError("Owned SymbolRender is stale.");
        },
        clone: () =>
          createOwnedSource(
            reel.createDetachedOccurrence(
              symbolOccurrence.code,
              symbolOccurrence.symbol.getPresentationValue(),
            ),
          ),
        release: () => {
          if (released) return;
          released = true;
          reel.releaseDetachedOccurrence(symbolOccurrence);
        },
      };
    };
    return createSymbolRender({
      symbol: captured,
      owned: false,
      assertUsable: () => {
        if (
          this.#destroyed ||
          this.getOccurrenceGeneration(captured) !== generation ||
          !this.isOccurrenceOwned(captured)
        )
          throw new ReelError("SymbolRender is stale.");
      },
      clone: () =>
        createOwnedSource(
          reel.createDetachedOccurrence(
            captured.code,
            captured.getPresentationValue(),
          ),
        ),
      getPosition,
      getAnchor: () =>
        createContainerRenderAnchor(this, () => {
          if (
            this.#destroyed ||
            this.getOccurrenceGeneration(captured) !== generation ||
            !this.isOccurrenceOwned(captured)
          )
            throw new ReelError("SymbolRender is stale.");
          return {
            x: reel.x + reel.layout.cellWidth / 2,
            y:
              reel.y +
              reel.layout.getCellY(position.y) +
              reel.layout.cellHeight / 2,
          };
        }),
      getPresentationSignal: () => this.#presentationAbort?.signal,
    });
  }

  getSymbols(positions: readonly SymbolPosition[]) {
    const keys = new Set<string>();
    const symbols = positions.map((position) => {
      const key = `${position.x}:${position.y}`;
      if (keys.has(key))
        throw new ReelError(`Duplicate SymbolGroup position (${key}).`);
      keys.add(key);
      return this.getSymbol(position);
    });
    return createSymbolGroup(symbols);
  }

  replaceSymbol(
    position: SymbolPosition,
    target: SymbolReplacementTarget,
  ): SymbolRender {
    return this.replaceSymbols([{ position, target }]).symbols[0]!;
  }

  replaceSymbols(replacements: readonly SymbolReplacement[]) {
    if (replacements.length === 0)
      throw new ReelError("Symbol replacement batch must not be empty.");
    const keys = new Set<string>();
    const prepared: PreparedVisibleOccurrenceReplacement[] = [];
    try {
      for (const { position, target } of replacements) {
        const key = `${position.x}:${position.y}`;
        if (keys.has(key))
          throw new ReelError(
            `Duplicate symbol replacement position (${key}).`,
          );
        keys.add(key);
        prepared.push(
          this.prepareVisibleOccurrenceReplacement({
            x: position.x,
            y: position.y,
            outputCode: target.code,
            outputPresentationValue: target.value ?? null,
          }),
        );
      }
      for (const replacement of prepared) replacement.commit();
    } catch (error) {
      for (const replacement of prepared) replacement.destroy();
      throw error;
    }
    return this.getSymbols(replacements.map(({ position }) => position));
  }

  setVisibleSymbolPresentationValue(
    x: number,
    y: number,
    value: number | null,
  ): void {
    this.assertStopped("set visible symbol presentation value");
    this.getReelAt(x).setVisibleSymbolPresentationValue(y, value);
  }

  prepareVisibleOccurrenceReplacement(options: {
    readonly x: number;
    readonly y: number;
    readonly outputCode: number;
    readonly outputPresentationValue: number | null;
  }): PreparedVisibleOccurrenceReplacement {
    this.assertStopped("prepare visible occurrence replacement");
    const reel = this.getReelAt(options.x);
    if (options.outputCode === -1 && options.outputPresentationValue !== null)
      throw new ReelError(
        "Empty symbol replacement must have a null presentation value.",
      );
    const input = reel
      .getSlotSnapshots()
      .find((candidate) => candidate.windowY === options.y);
    if (!input)
      throw new ReelError(
        `Cannot replace missing occurrence at standard reel cell (${options.x},${options.y}).`,
      );
    const inputSymbol = input.symbol;
    const output =
      options.outputCode === -1
        ? null
        : reel.createDetachedOccurrence(
            options.outputCode,
            options.outputPresentationValue,
          );
    let state: "prepared" | "committed" | "rolled-back" = "prepared";
    const rollback = (): void => {
      if (state !== "prepared") return;
      if (output) reel.releaseDetachedOccurrence(output);
      state = "rolled-back";
    };
    return Object.freeze({
      x: options.x,
      y: options.y,
      outputCode: options.outputCode,
      commit: (): void => {
        if (state === "committed") return;
        if (state !== "prepared")
          throw new ReelError(
            `Cannot commit rolled-back replacement at standard reel cell (${options.x},${options.y}).`,
          );
        this.assertStopped("commit visible occurrence replacement");
        const currentSymbol = reel
          .getSlotSnapshots()
          .find((candidate) => candidate.windowY === options.y)?.symbol;
        const currentCode = reel
          .getSlotSnapshots()
          .find((candidate) => candidate.windowY === options.y)?.code;
        if (currentSymbol !== inputSymbol || currentCode !== input.code)
          throw new ReelError(
            `Cannot commit replacement at standard reel cell (${options.x},${options.y}): occurrence ownership changed.`,
          );
        const previous = inputSymbol
          ? reel.takeVisibleOccurrence(options.y)
          : null;
        if (!previous) reel.openVisibleEmptySlot(options.y);
        try {
          if (output) reel.placeVisibleOccurrence(output, options.y);
          else reel.placeVisibleEmptySlot(options.y);
        } catch (error) {
          if (previous) reel.placeVisibleOccurrence(previous, options.y);
          else reel.placeVisibleEmptySlot(options.y);
          throw error;
        }
        if (previous) {
          this.bumpOccurrenceGeneration(previous.symbol);
          reel.releaseDetachedOccurrence(previous);
        }
        state = "committed";
      },
      rollback,
      destroy: rollback,
    });
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
    )) {
      const reel = this.getReelAt(position.x);
      const symbol = reel
        .getSlotSnapshots()
        .find((slot) => slot.windowY === position.y)?.symbol;
      if (symbol) this.bumpOccurrenceGeneration(symbol);
      reel.releaseVisibleOccurrence(position.y);
    }
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
    const prepared: Array<{
      readonly movement: GridCellCascadeDropPlan["movements"][number];
      readonly reel: RenderReel;
      readonly occurrence: RenderReelVisibleOccurrence | null;
    }> = [];
    try {
      for (const movement of plan.movements) {
        const reel = this.getReelAt(movement.x);
        if (movement.kind === "existing") {
          const symbol = reel
            .getSlotSnapshots()
            .find(
              (candidate) => candidate.windowY === movement.sourceY,
            )?.symbol;
          if (!symbol)
            throw new ReelError(
              `Cascade source occurrence is missing at (${movement.x},${movement.sourceY}).`,
            );
          if (!symbol.hasAnimationCapability("dropdown"))
            throw new ReelError(
              `Dropdown animation is unavailable at (${movement.x},${movement.sourceY}).`,
            );
          symbol.requestState("dropdown");
          prepared.push({ movement, reel, occurrence: null });
          continue;
        }
        const occurrence = reel.createDetachedOccurrence(
          movement.outputCode,
          movement.outputPresentationValue,
        );
        if (!occurrence.symbol.hasAnimationCapability("dropdown")) {
          reel.releaseDetachedOccurrence(occurrence);
          throw new ReelError(
            `Dropdown animation is unavailable for refill at (${movement.x},${movement.targetY}).`,
          );
        }
        try {
          occurrence.symbol.requestState("dropdown");
        } catch (error) {
          reel.releaseDetachedOccurrence(occurrence);
          throw error;
        }
        prepared.push({ movement, reel, occurrence });
      }
    } catch (error) {
      for (const item of prepared) {
        if (item.occurrence) {
          item.occurrence.symbol.requestState("normal");
          item.reel.releaseDetachedOccurrence(item.occurrence);
        } else {
          item.reel
            .getSlotSnapshots()
            .find((candidate) => candidate.windowY === item.movement.sourceY)
            ?.symbol?.requestState("normal");
        }
      }
      throw error;
    }
    const active = prepared.map(
      ({ movement, reel, occurrence: preparedOccurrence }) => {
        const occurrence =
          movement.kind === "existing"
            ? reel.takeVisibleOccurrence(movement.sourceY)
            : preparedOccurrence;
        if (!occurrence)
          throw new ReelError("Prepared refill occurrence is missing.");
        occurrence.symbol.position.set(
          reel.layout.getReelX(movement.x) + reel.layout.cellWidth / 2,
          reel.layout.getCellY(movement.sourceY) + reel.layout.cellHeight / 2,
        );
        this.#slotLayer.addChild(occurrence.symbol);
        return Object.freeze({ movement, occurrence });
      },
    );
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
    if (
      this.#spinPlan ||
      this.#continuousSpinActive ||
      this.#atomicActive.size
    ) {
      throw new ReelError(
        "Cannot request visible symbol state while reel set is spinning.",
      );
    }
    this.getReelAt(x).requestVisibleSymbolState(y, state, transitionMode);
  }

  requestLandedVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    for (const position of positions) {
      const reel = this.getReelAt(position.x);
      if (reel.getSnapshot().phase !== "stopped")
        throw new ReelError(
          `Cannot request landed symbol state while reel ${position.x} is spinning.`,
        );
      reel.requestVisibleSymbolState(position.y, state, transitionMode);
    }
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

  playVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): Promise<void> {
    return this.playVisibleSymbolStateBatch(
      [
        {
          positions,
          state,
          options: {
            completion: options.completion,
            ...(options.transitionMode
              ? { transitionMode: options.transitionMode }
              : {}),
          },
        },
      ],
      options.signal ? { signal: options.signal } : undefined,
    );
  }

  playVisibleSymbolStateBatch(
    requests: readonly VisibleSymbolStatePlaybackRequest[],
    options?: VisibleSymbolStatePlaybackBatchOptions,
  ): Promise<void> {
    this.assertStopped("play visible symbol states");
    if (requests.length === 0) {
      throw new ReelError(
        "Visible symbol state playback batch must not be empty.",
      );
    }
    const prepared = requests.flatMap((request) => {
      if (request.positions.length === 0) {
        throw new ReelError(
          "Visible symbol playback positions must not be empty.",
        );
      }
      return normalizeCascadePositions(
        request.positions,
        this.reels.length,
        this.reels[0]?.layout.visibleRows ?? 0,
        "coalesce",
      ).map((position) => {
        const reel = this.getReelAt(position.x);
        const playbackOptions: SymbolStatePlaybackOptions = {
          ...request.options,
          ...(options?.signal ? { signal: options.signal } : {}),
        };
        reel.validateVisibleSymbolStatePlayback(
          position.y,
          request.state,
          playbackOptions,
        );
        return { position, reel, request };
      });
    });
    return startSymbolStatePlaybackBatch(
      prepared.map(
        ({ position, reel, request }) =>
          (signal) =>
            reel.playVisibleSymbolState(position.y, request.state, {
              ...request.options,
              signal,
            }),
      ),
      options?.signal,
    );
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
    if (this.#spinPlan || this.#continuousSpinActive) {
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
      spinning:
        this.#spinPlan !== null ||
        this.#continuousSpinActive ||
        this.#atomicActive.size > 0 ||
        this.#activeDrop !== null,
      elapsedMs: this.#elapsedMs,
      visibleScene: this.getVisibleScene(),
      reels: Object.freeze(this.reels.map((reel) => reel.getSnapshot())),
    });
  }

  getSymbolPoolStats(): RenderSymbolPoolStats | null {
    return this.#symbolPool?.getStats() ?? null;
  }

  getLayer(id: SymbolAreaLayerId): SymbolAreaLayer {
    this.assertAlive();
    const layer = this.#areaLayers.get(id);
    const mounted = this.#areaMounted.get(id);
    if (!layer || !mounted)
      throw new ReelError(`Unknown symbol area layer "${String(id)}".`);
    const target = Object.freeze({
      add: (node: RenderNode, order = 0) => {
        this.assertAlive();
        if (!Number.isSafeInteger(order))
          throw new ReelError("Area node order must be an integer.");
        if (mounted.has(node))
          throw new ReelError(`RenderNode is already attached to ${id} layer.`);
        const adapter = getRenderNodeAdapter(node);
        if (adapter.view.parent)
          throw new ReelError(
            "RenderNode is already attached to another parent.",
          );
        adapter.view.zIndex = order;
        layer.addChild(adapter.view);
        mounted.add(node);
      },
      remove: (node: RenderNode) => {
        this.assertAlive();
        if (!mounted.delete(node)) return;
        getRenderNodeAdapter(node).view.parent?.removeChild(
          getRenderNodeAdapter(node).view,
        );
      },
    });
    registerPresentationMountTarget(target, { view: layer });
    return target;
  }

  getArea(): ReelArea {
    this.assertAlive();
    return this.#areaFacade;
  }

  async present(
    presentation: Parameters<ReelArea["present"]>[0],
    options: Parameters<ReelArea["present"]>[1] = {},
  ): Promise<void> {
    this.assertAlive();
    if (this.#presentationAbort)
      throw new ReelError("Symbol area already has an active presentation.");
    if (options.repeat !== undefined && typeof options.repeat !== "boolean")
      throw new ReelError("Symbol area presentation repeat must be boolean.");
    const controller = new AbortController();
    this.#presentationAbort = controller;
    if (!options.repeat) {
      const scope = this.createPresentationScope(controller.signal);
      try {
        await presentation(scope.context);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        scope.cleanup();
        if (this.#presentationAbort === controller)
          this.#presentationAbort = null;
      }
      return;
    }

    let firstCycleSettled = false;
    let resolveFirstCycle!: () => void;
    let rejectFirstCycle!: (error: unknown) => void;
    const firstCycle = new Promise<void>((resolve, reject) => {
      resolveFirstCycle = resolve;
      rejectFirstCycle = reject;
    });
    void (async () => {
      try {
        while (!controller.signal.aborted) {
          const scope = this.createPresentationScope(controller.signal);
          try {
            await presentation(scope.context);
          } finally {
            scope.cleanup();
          }
          if (!firstCycleSettled) {
            firstCycleSettled = true;
            resolveFirstCycle();
          }
        }
      } catch (error) {
        if (!controller.signal.aborted && !firstCycleSettled) {
          firstCycleSettled = true;
          rejectFirstCycle(error);
        } else if (!controller.signal.aborted) {
          this.#presentationFailure =
            error instanceof Error
              ? error
              : new ReelError("Symbol area presentation failed.");
        }
      } finally {
        if (!firstCycleSettled) {
          firstCycleSettled = true;
          resolveFirstCycle();
        }
        if (this.#presentationAbort === controller)
          this.#presentationAbort = null;
      }
    })();
    await firstCycle;
  }

  private createPresentationScope(signal: AbortSignal): {
    readonly context: PresentationScopeContext;
    cleanup(): void;
  } {
    const mounted = new Map<RenderNode, PresentationMountedNode>();
    const cleanupNode = (entry: PresentationMountedNode): void => {
      mounted.delete(entry.node);
      this.cancelPresentationMotionsForNode(entry.node);
      try {
        entry.target.remove(entry.node);
      } catch (error) {
        if (!this.#destroyed) throw error;
        getRenderNodeAdapter(entry.node).view.parent?.removeChild(
          getRenderNodeAdapter(entry.node).view,
        );
      }
      if (entry.ownership === "destroy") entry.node.destroy();
    };
    const mount = (
      target: SymbolAreaLayer,
      node: RenderNode,
      options: PresentationNodeMountOptions,
    ): void => {
      if (mounted.has(node))
        throw new ReelError("RenderNode is already mounted in this scope.");
      if (options.ownership !== "detach" && options.ownership !== "destroy")
        throw new ReelError(
          `Unknown presentation node ownership "${String(options.ownership)}".`,
        );
      const adapter = getPresentationMountTargetAdapter(target);
      if (options.anchor) {
        const point = resolveRenderAnchor(options.anchor, adapter.view);
        const offset = options.offset ?? { x: 0, y: 0 };
        if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y))
          throw new ReelError(
            "Presentation node offset must contain finite coordinates.",
          );
        node.setPosition({ x: point.x + offset.x, y: point.y + offset.y });
      }
      target.add(node, options.order);
      mounted.set(node, { target, node, ownership: options.ownership });
    };
    const unmount = (node: RenderNode): void => {
      const entry = mounted.get(node);
      if (!entry)
        throw new ReelError("RenderNode is not mounted in this scope.");
      cleanupNode(entry);
    };
    const move = (
      node: RenderNode,
      options: Parameters<PresentationScopeContext["move"]>[1],
    ): Promise<void> => {
      const entry = mounted.get(node);
      if (!entry)
        return Promise.reject(
          new ReelError("Presentation motion node is not mounted."),
        );
      const targetView = getPresentationMountTargetAdapter(entry.target).view;
      const from = getRenderNodeAdapter(node).view.position;
      const to = resolveRenderAnchor(options.to, targetView);
      const prepared = prepareVisibleOccurrenceMotion(
        {
          durationMs: options.durationSeconds * 1000,
          path: options.path ?? { kind: "line" },
          easing: options.easing ?? { kind: "linear" },
          stacking: { layer: "above-effects", order: 0 },
        },
        { x: from.x, y: from.y },
        to,
      );
      return new Promise<void>((resolve, reject) => {
        let motion!: PresentationMotion;
        const abortListener = () => {
          if (!this.#presentationMotions.delete(motion)) return;
          reject(new ReelError("Symbol area presentation was interrupted."));
        };
        motion = {
          node,
          prepared,
          signal,
          abortListener,
          elapsedSeconds: 0,
          resolve,
          reject,
        };
        signal.addEventListener("abort", abortListener, { once: true });
        this.#presentationMotions.add(motion);
      });
    };
    const context: PresentationScopeContext = Object.freeze({
      delay: (seconds: number) =>
        this.waitForPresentationDelay(seconds, signal),
      mount,
      unmount,
      withNode: async <T>(
        target: Parameters<PresentationScopeContext["withNode"]>[0],
        node: RenderNode,
        options: PresentationNodeMountOptions,
        playback: () => Promise<T>,
      ) => {
        mount(target as SymbolAreaLayer, node, options);
        try {
          return await playback();
        } finally {
          const entry = mounted.get(node);
          if (entry) cleanupNode(entry);
        }
      },
      move,
      transfer: async (
        target: Parameters<PresentationScopeContext["transfer"]>[0],
        node: RenderNode,
        options: Parameters<PresentationScopeContext["transfer"]>[2],
      ) => {
        const adapter = getPresentationMountTargetAdapter(target);
        node.setPosition(resolveRenderAnchor(options.from, adapter.view));
        mount(target as SymbolAreaLayer, node, options);
        try {
          await move(node, options);
        } finally {
          const entry = mounted.get(node);
          if (entry) cleanupNode(entry);
        }
      },
    });
    return {
      context,
      cleanup: () => {
        for (const entry of [...mounted.values()]) cleanupNode(entry);
      },
    };
  }

  private startAreaSpin(): void {
    this.assertAlive();
    if (this.#areaSpinStarted)
      throw new ReelError("Symbol area spin is already started.");
    this.interruptPresentation();
    this.clearAreaLayer("win");
    const context = this.createAreaSpinContext(false);
    this.#areaSpinFunction.start(context);
    this.#areaSpinStarted = true;
  }

  private async landAreaSpin(
    target: AreaSpinTarget,
    options: AreaSpinLandOptions = {},
  ): Promise<void> {
    this.assertAlive();
    this.interruptPresentation();
    this.clearAreaLayer("win");
    const wasStarted = this.#areaSpinStarted;
    this.#areaSpinStarted = false;
    try {
      await this.#areaSpinFunction.land(
        this.createAreaSpinContext(wasStarted, options.delay),
        target,
      );
    } catch (error) {
      this.cancelAllAtomic();
      throw error;
    }
  }

  private cancelAreaSpin(): void {
    this.assertAlive();
    this.#areaSpinFunction.cancel(
      this.createAreaSpinContext(this.#areaSpinStarted),
    );
    this.#areaSpinStarted = false;
  }

  private createAreaSpinContext(
    wasStarted: boolean,
    delay: ((seconds: number) => Promise<void>) | undefined = undefined,
  ): import("./reel-area.js").AreaSpinFunctionContext {
    return Object.freeze({
      reels: this,
      columns: this.reels.length,
      wasStarted,
      delay:
        delay ??
        ((seconds) =>
          Promise.resolve().then(() => {
            if (seconds !== 0)
              throw new ReelError(
                "Area spin delay requires a host frame delay.",
              );
          })),
    });
  }

  private interruptPresentation(): void {
    const controller = this.#presentationAbort;
    if (!controller) return;
    this.#presentationAbort = null;
    controller.abort(
      new ReelError("Symbol area presentation was interrupted."),
    );
  }

  private waitForPresentationDelay(
    seconds: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0)
      return Promise.reject(
        new ReelError("Symbol area delay must be finite and non-negative."),
      );
    if (seconds === 0) return Promise.resolve();
    if (signal.aborted)
      return Promise.reject(
        new ReelError("Symbol area presentation was interrupted."),
      );
    return new Promise<void>((resolve, reject) => {
      let waiter!: PresentationDelayWaiter;
      const abortListener = () => {
        this.#presentationDelayWaiters.delete(waiter);
        reject(new ReelError("Symbol area presentation was interrupted."));
      };
      waiter = {
        remainingSeconds: seconds,
        signal,
        resolve,
        reject,
        abortListener,
      };
      signal.addEventListener("abort", abortListener, { once: true });
      this.#presentationDelayWaiters.add(waiter);
    });
  }

  private updatePresentationDelays(deltaSeconds: number): void {
    for (const waiter of [...this.#presentationDelayWaiters]) {
      waiter.remainingSeconds -= deltaSeconds;
      if (waiter.remainingSeconds > 0) continue;
      this.#presentationDelayWaiters.delete(waiter);
      waiter.signal.removeEventListener("abort", waiter.abortListener);
      waiter.resolve();
    }
  }

  private updatePresentationMotions(deltaSeconds: number): void {
    for (const motion of [...this.#presentationMotions]) {
      if (motion.signal.aborted) {
        this.#presentationMotions.delete(motion);
        motion.signal.removeEventListener("abort", motion.abortListener);
        motion.reject(
          new ReelError("Symbol area presentation was interrupted."),
        );
        continue;
      }
      motion.elapsedSeconds = Math.min(
        motion.elapsedSeconds + deltaSeconds,
        motion.prepared.durationMs / 1000,
      );
      motion.node.setPosition(
        motion.prepared.sample(
          motion.elapsedSeconds / (motion.prepared.durationMs / 1000),
        ),
      );
      if (motion.elapsedSeconds < motion.prepared.durationMs / 1000) continue;
      this.#presentationMotions.delete(motion);
      motion.signal.removeEventListener("abort", motion.abortListener);
      motion.resolve();
    }
  }

  private cancelPresentationMotionsForNode(node: RenderNode): void {
    for (const motion of [...this.#presentationMotions]) {
      if (motion.node !== node) continue;
      this.#presentationMotions.delete(motion);
      motion.signal.removeEventListener("abort", motion.abortListener);
      motion.reject(new ReelError("Presentation motion node was unmounted."));
    }
  }

  private clearAreaLayer(id: SymbolAreaLayerId): void {
    const mounted = this.#areaMounted.get(id)!;
    for (const node of mounted)
      getRenderNodeAdapter(node).view.parent?.removeChild(
        getRenderNodeAdapter(node).view,
      );
    mounted.clear();
  }

  roll(
    x: number,
    target: ReelRollTarget,
    options: ReelRollOptions = {},
  ): Promise<void> {
    const reel = this.prepareAtomicReel(x, options.signal);
    const parsed = this.parseAtomicTarget(reel, target);
    const promise = this.createAtomicCompletion(x, "roll", options.signal);
    try {
      this.bumpReelOccurrenceGenerations(reel);
      reel.start(this.createAtomicAxisPlan(reel, options), parsed);
    } catch (error) {
      this.failAtomic(this.#atomicActive.get(x)!, toReelError(error));
    }
    return promise;
  }

  start(x: number, options: ReelRollStartOptions = {}): void {
    const reel = this.prepareAtomicReel(x, options.signal);
    const active = this.createAtomic(x, "continuous", options.signal);
    try {
      this.bumpReelOccurrenceGenerations(reel);
      reel.startContinuous({
        direction: this.#reelSpinDefaults.direction,
        speedSymbolsPerSecond: normalizePositiveFinite(
          options.speedSymbolsPerSecond ??
            this.#reelSpinDefaults.speedSymbolsPerSecond,
          "speedSymbolsPerSecond",
        ),
      });
    } catch (error) {
      this.detachAtomic(active);
      throw error;
    }
  }

  settle(
    x: number,
    target: ReelRollTarget,
    options: ReelRollOptions = {},
  ): Promise<void> {
    const reel = this.getReelAt(x);
    const current = this.#atomicActive.get(x);
    if (!current || current.mode !== "continuous")
      return Promise.reject(
        new ReelError(`Cannot settle reel ${x} without targetless rolling.`),
      );
    if (options.signal?.aborted)
      return Promise.reject(new ReelError("Reel settle was already aborted."));
    const parsed = this.parseAtomicTarget(reel, target);
    this.detachAtomic(current);
    const promise = this.createAtomicCompletion(x, "settle", options.signal);
    try {
      reel.settleContinuous(this.createAtomicAxisPlan(reel, options), parsed);
    } catch (error) {
      if (reel.isContinuousSpinning()) reel.cancelContinuous();
      this.failAtomic(this.#atomicActive.get(x)!, toReelError(error));
    }
    return promise;
  }

  cancel(x: number): void {
    const reel = this.getReelAt(x);
    const active = this.#atomicActive.get(x);
    if (!active) return;
    if (active.mode === "continuous") reel.cancelContinuous();
    else
      reel.resetToVisibleSymbols(
        reel.getVisibleScene(),
        Math.floor(reel.getSnapshot().currentY),
        reel.getVisiblePresentationValues(),
      );
    this.failAtomic(active, new ReelError(`Reel spin ${x} was cancelled.`));
  }

  getReel(x: number): ReelRender {
    this.getReelAt(x);
    const attachment = this.#reelAttachments[x]!;
    return Object.freeze({
      add: (node: RenderNode, order = 0) => {
        this.assertAlive();
        if (!Number.isSafeInteger(order))
          throw new ReelError("Reel node order must be an integer.");
        if (attachment.mounted.has(node))
          throw new ReelError("RenderNode is already attached to this reel.");
        const adapter = getRenderNodeAdapter(node);
        if (adapter.view.parent)
          throw new ReelError(
            "RenderNode is already attached to another parent.",
          );
        adapter.view.zIndex = order;
        attachment.layer.addChild(adapter.view);
        attachment.mounted.add(node);
      },
      remove: (node: RenderNode) => {
        this.assertAlive();
        if (!attachment.mounted.delete(node))
          throw new ReelError("RenderNode is not attached to this reel.");
        getRenderNodeAdapter(node).view.parent?.removeChild(
          getRenderNodeAdapter(node).view,
        );
      },
    });
  }

  private getReelAt(x: number): RenderReel {
    if (!Number.isInteger(x) || x < 0 || x >= this.reels.length) {
      throw new ReelError(`visible symbol x ${x} is out of range.`);
    }
    return this.reels[x];
  }

  private assertAlive(): void {
    if (this.#destroyed) throw new ReelError("ReelSpin was destroyed.");
  }

  private prepareAtomicReel(x: number, signal?: AbortSignal): RenderReel {
    this.assertAlive();
    const reel = this.getReelAt(x);
    if (this.#spinPlan || this.#continuousSpinActive || this.#activeDrop)
      throw new ReelError(
        "Cannot start a reel while legacy reel motion is active.",
      );
    if (this.#atomicActive.has(x))
      throw new ReelError(`Reel ${x} already has an active spin.`);
    if (signal?.aborted) throw new ReelError("Reel spin was already aborted.");
    return reel;
  }

  private parseAtomicTarget(
    reel: RenderReel,
    target: ReelRollTarget,
  ): RenderReelSpinOptions {
    if (!target || typeof target !== "object")
      throw new ReelError("Reel target must be an object.");
    const rows = reel.layout.visibleRows;
    if (!Array.isArray(target.symbols) || target.symbols.length !== rows)
      throw new ReelError(`Reel target symbols length must be ${rows}.`);
    if (target.values && target.values.length !== rows)
      throw new ReelError(`Reel target values length must be ${rows}.`);
    if (target.states && target.states.length !== rows)
      throw new ReelError(`Reel target states length must be ${rows}.`);
    return {
      targetVisibleSymbols: target.symbols,
      ...(target.values
        ? { targetVisiblePresentationValues: target.values }
        : {}),
      ...(target.states ? { targetVisibleStates: target.states } : {}),
    };
  }

  private createAtomicAxisPlan(
    reel: RenderReel,
    options: ReelRollOptions,
  ): import("./types.js").ReelAxisSpinPlan {
    const durationMs = normalizePositiveFinite(
      options.durationMs ?? this.#reelSpinDefaults.durationMs,
      "durationMs",
    );
    const speed = normalizePositiveFinite(
      options.speedSymbolsPerSecond ??
        this.#reelSpinDefaults.speedSymbolsPerSecond,
      "speedSymbolsPerSecond",
    );
    const cycles = normalizePositiveInteger(
      options.minimumSpinCycles ?? this.#reelSpinDefaults.minimumSpinCycles,
      "minimumSpinCycles",
    );
    const travelSymbols = Math.max(
      cycles * reel.layout.visibleRows,
      Math.ceil((durationMs / 1000) * speed),
    );
    const startY = Math.floor(reel.getSnapshot().currentY);
    const finalY =
      startY +
      (this.#reelSpinDefaults.direction === "forward"
        ? travelSymbols
        : -travelSymbols);
    return Object.freeze({
      x: reel.xIndex,
      startY,
      finalY,
      direction: this.#reelSpinDefaults.direction,
      travelSymbols,
      startDelayMs: 0,
      durationMs,
      stopAtMs: durationMs,
    });
  }

  private createAtomicCompletion(
    x: number,
    mode: "roll" | "settle",
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.createAtomic(x, mode, signal, resolve, reject);
    });
  }

  private createAtomic(
    x: number,
    mode: ActiveAtomicReel["mode"],
    signal?: AbortSignal,
    resolve?: () => void,
    reject?: (error: Error) => void,
  ): ActiveAtomicReel {
    let active!: ActiveAtomicReel;
    const abortListener = signal ? () => this.cancel(x) : undefined;
    active = {
      x,
      mode,
      ...(signal ? { signal } : {}),
      ...(abortListener ? { abortListener } : {}),
      ...(resolve ? { resolve } : {}),
      ...(reject ? { reject } : {}),
    };
    this.#atomicActive.set(x, active);
    signal?.addEventListener("abort", abortListener!, { once: true });
    return active;
  }

  private detachAtomic(active: ActiveAtomicReel): void {
    this.#atomicActive.delete(active.x);
    if (active.signal && active.abortListener)
      active.signal.removeEventListener("abort", active.abortListener);
  }

  private failAtomic(active: ActiveAtomicReel, error: Error): void {
    this.detachAtomic(active);
    active.reject?.(error);
  }

  private cancelAllAtomic(): void {
    for (const x of [...this.#atomicActive.keys()]) this.cancel(x);
  }

  private bumpReelOccurrenceGenerations(reel: RenderReel): void {
    for (const slot of reel.getSlotSnapshots())
      if (slot.symbol) this.bumpOccurrenceGeneration(slot.symbol);
  }

  private isOccurrenceOwned(symbol: RenderSymbol): boolean {
    if (
      this.reels.some((candidate) =>
        candidate.getSlotSnapshots().some((slot) => slot.symbol === symbol),
      )
    )
      return true;
    return (
      this.#activeDrop?.movements.some(
        ({ occurrence }) => occurrence.symbol === symbol,
      ) ?? false
    );
  }

  private getOccurrenceGeneration(symbol: RenderSymbol): number {
    return this.#occurrenceGenerations.get(symbol) ?? 0;
  }

  private bumpOccurrenceGeneration(symbol: RenderSymbol): void {
    this.#occurrenceGenerations.set(
      symbol,
      this.getOccurrenceGeneration(symbol) + 1,
    );
  }

  private bumpVisibleOccurrenceGenerations(): void {
    for (const symbol of this.getVisibleOccurrenceSymbols())
      this.bumpOccurrenceGeneration(symbol);
  }

  private getVisibleOccurrenceSymbols(): ReadonlySet<RenderSymbol> {
    const symbols = new Set<RenderSymbol>();
    for (const reel of this.reels)
      for (const slot of reel.getSlotSnapshots())
        if (slot.symbol) symbols.add(slot.symbol);
    return symbols;
  }

  private assertStopped(action: string): void {
    if (
      this.#spinPlan ||
      this.#continuousSpinActive ||
      this.#atomicActive.size ||
      this.#activeDrop
    )
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
    for (const commit of active.plan.valueCommits)
      this.getReelAt(commit.x).setVisibleSymbolPresentationValue(
        commit.y,
        commit.presentationValue,
      );
    this.#activeDrop = null;
    this.#slotLayer.mask = null;
    this.#cascadeMask.visible = false;
    this.#cascadeMask.renderable = false;
  }

  private cancelActiveDrop(): void {
    const active = this.#activeDrop;
    if (!active) return;
    for (const { occurrence } of active.movements) {
      this.bumpOccurrenceGeneration(occurrence.symbol);
      this.getReelAt(0).releaseDetachedOccurrence(occurrence);
    }
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
        targetVisiblePresentationValues:
          this.#spinOptions?.targetVisiblePresentationValues?.[axis.x],
        targetVisibleStates: this.#spinOptions?.targetVisibleStates?.[axis.x],
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

  private assertTargetVisibleMatrix(
    matrix: readonly (readonly unknown[])[] | undefined,
    label: string,
  ): void {
    if (matrix === undefined) return;
    if (!Array.isArray(matrix) || matrix.length !== this.reels.length)
      throw new ReelError(
        `${label} column count must be ${this.reels.length}.`,
      );
    for (const [x, column] of matrix.entries()) {
      if (!Array.isArray(column))
        throw new ReelError(`${label}[${x}] must be an array.`);
      if (column.length !== this.reels[x]!.layout.visibleRows)
        throw new ReelError(
          `${label}[${x}] length must be ${this.reels[x]!.layout.visibleRows}.`,
        );
    }
  }
}

function normalizeCascadePositions(
  positions: readonly { readonly x: number; readonly y: number }[],
  columns: number,
  rows: number,
  duplicateMode: "reject" | "coalesce" = "reject",
): readonly { readonly x: number; readonly y: number }[] {
  const seen = new Set<string>();
  const normalized = positions.map((position, index) => {
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
    if (seen.has(key)) {
      if (duplicateMode === "coalesce") return null;
      throw new ReelError(`positions contains duplicate ${key}.`);
    }
    seen.add(key);
    return Object.freeze({ x: position.x, y: position.y });
  });
  return Object.freeze(
    normalized.filter(
      (position): position is { readonly x: number; readonly y: number } =>
        position !== null,
    ),
  );
}

function createBrightnessTint(brightness: number): number {
  const channel = Math.max(0, Math.min(255, Math.round(brightness * 255)));
  return (channel << 16) | (channel << 8) | channel;
}

function calculateSlotCount(layout: RenderReelSetOptions["layout"]): number {
  return layout.visibleRows + layout.bufferRowsBefore + layout.bufferRowsAfter;
}

function normalizePositiveFinite(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0)
    throw new ReelError(`${label} must be a positive finite number.`);
  return value as number;
}

function normalizePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    throw new ReelError(`${label} must be a positive integer.`);
  return value as number;
}

function toReelError(error: unknown): Error {
  return error instanceof Error ? error : new ReelError(String(error));
}
