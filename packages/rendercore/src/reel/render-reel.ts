import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { createReelWindowSnapshot } from "./reel-window.js";
import {
  createTemporaryReelStrip,
  type TemporaryReelStrip,
} from "./spin-strip.js";
import type {
  ReelAxisSpinPlan,
  ReelSpinDirection,
  ReelLayout,
  ReelSymbolKind,
  ReelSymbolRegistry,
  ReelRollingValueVisual,
  RenderReelOptions,
  RenderReelContinuousSpinOptions,
  RenderReelPhase,
  RenderReelSpinOptions,
  RenderReelSlotRenderView,
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
  ReelWindowSnapshot,
  RenderReelSnapshot,
  RenderReelUpdateResult,
  RenderReelVisibleOccurrence,
} from "./types.js";
import type { LogicReels } from "@slotclientengine/logiccore";
import type {
  SymbolPlayer,
  SymbolStateId,
  SymbolStatePlaybackOptions,
  SymbolStateTransitionMode,
} from "../symbol/index.js";
import {
  createEmptySymbolHandle,
  type EmptySymbolHandleSource,
  type SymbolHandle,
} from "../symbol/symbol-handle.js";

interface ReelSlot {
  readonly windowY: number;
  readonly renderOrder: number;
  readonly container: Container;
  readonly contentLayer: Container;
  readonly emptySymbolLayer: Container;
  readonly emptyDimmingOverlay: Graphics;
  readonly rollingSprite: Sprite;
  readonly rollingValueLayer: Container;
  readonly rollingValueVisuals: Map<string, ReelRollingValueVisual>;
  activeRollingValueKey: string | null;
  rollingPresentationValue: number | null;
  rollingValueTierIndex: number | null;
  code: number | null;
  kind: ReelSymbolKind | null;
  symbol: SymbolPlayer | null;
  renderPriority: number;
}

interface ActiveContinuousSpin {
  readonly reels: LogicReels;
  readonly direction: ReelSpinDirection;
  readonly speedSymbolsPerSecond: number;
  readonly initialCodes: ReadonlyMap<number, number>;
  readonly initialPresentationValues: ReadonlyMap<number, number | null>;
}

interface PreparedLandingSlot {
  readonly code: number;
  readonly kind: ReelSymbolKind;
  readonly presentationValue: number | null;
  readonly occurrence: RenderReelVisibleOccurrence | null;
}

export class RenderReel extends Container {
  readonly xIndex: number;
  readonly layout: ReelLayout;
  readonly #reels: LogicReels;
  readonly #registry: ReelSymbolRegistry;
  readonly #symbolPool: RenderReelOptions["symbolPool"];
  readonly #slotParent: Container;
  readonly #usesExternalSlotParent: boolean;
  readonly #slotRenderOrderOffset: number;
  readonly #slotRenderOrderStride: number;
  readonly #presentationValueResolver: RenderReelOptions["presentationValueResolver"];
  readonly #symbolStateObserver: RenderReelOptions["symbolStateObserver"];
  readonly #bounceStrength: number;
  readonly #slots: readonly ReelSlot[];
  readonly #slotRenderViews: readonly RenderReelSlotRenderView[];
  readonly #clipMask: Graphics;
  #phase: RenderReelPhase = "idle";
  #plan: ReelAxisSpinPlan | null = null;
  #continuousSpin: ActiveContinuousSpin | null = null;
  #spinStrip: TemporaryReelStrip | null = null;
  #spinLocalY = 0;
  #spinStartLocalY = 0;
  #continuousSettleInitialSlope = 1;
  #settlingFromContinuous = false;
  #elapsedMs = 0;
  #currentY = 0;
  #staticVisibleSymbols: readonly number[] | null = null;
  #targetVisibleSymbols: readonly number[] | null = null;
  #staticVisiblePresentationValues: readonly (number | null)[] | null = null;
  #targetVisiblePresentationValues: readonly (number | null)[] | null = null;
  #targetVisibleStates: readonly SymbolStateId[] | null = null;
  #preparedLanding: Map<number, PreparedLandingSlot> | null = null;
  #landed = false;

  constructor(options: RenderReelOptions) {
    super();
    this.#reels = options.reels;
    this.xIndex = options.x;
    this.layout = options.layout;
    this.#registry = options.registry;
    this.#symbolPool = options.symbolPool;
    this.#presentationValueResolver = options.presentationValueResolver;
    this.#symbolStateObserver = options.symbolStateObserver;
    this.#bounceStrength = normalizeNonNegativeFiniteNumber(
      options.bounceStrength ?? 1,
      "bounceStrength",
    );
    this.x = options.layout.getReelX(options.x);
    this.#slotParent = options.slotParent ?? this;
    this.#usesExternalSlotParent = this.#slotParent !== this;
    this.#slotParent.sortableChildren = true;
    this.#slotRenderOrderOffset = normalizeNonNegativeSafeInteger(
      options.slotRenderOrderOffset ?? 0,
      "slotRenderOrderOffset",
    );
    this.#slotRenderOrderStride = normalizePositiveSafeInteger(
      options.slotRenderOrderStride ?? calculateSlotCount(options.layout) + 1,
      "slotRenderOrderStride",
    );
    this.#clipMask = createReelClipMask(options.layout);
    this.#clipMask.visible = false;
    this.#clipMask.renderable = false;
    this.#slots = Object.freeze(this.createSlots());
    this.#slotRenderViews = this.createSlotRenderViews();
    this.addChild(this.#clipMask);
    this.resetToY(0);
  }

  start(plan: ReelAxisSpinPlan, options: RenderReelSpinOptions = {}): void {
    if (plan.x !== this.xIndex) {
      throw new ReelError(
        `Cannot start reel ${this.xIndex} with axis plan ${plan.x}.`,
      );
    }
    if (this.#phase !== "idle" && this.#phase !== "stopped") {
      throw new ReelError(
        `Cannot start reel ${this.xIndex} while phase is "${this.#phase}".`,
      );
    }
    const targetVisibleSymbols = parseVisibleSymbols(
      options.targetVisibleSymbols,
      this.layout.visibleRows,
      "targetVisibleSymbols",
    );
    const targetVisiblePresentationValues = parsePresentationValues(
      options.targetVisiblePresentationValues,
      this.layout.visibleRows,
      "targetVisiblePresentationValues",
    );
    const targetVisibleStates = parseVisibleStates(
      options.targetVisibleStates,
      this.layout.visibleRows,
      "targetVisibleStates",
    );
    validateEmptyEndpoints(
      targetVisibleSymbols,
      targetVisiblePresentationValues,
      targetVisibleStates,
      "targetVisibleSymbols",
    );
    this.validateExplicitTargetPresentationValues(
      targetVisibleSymbols,
      targetVisiblePresentationValues,
    );

    const spinStrip = createTemporaryReelStrip({
      reels: options.reels ?? this.#reels,
      x: this.xIndex,
      layout: this.layout,
      plan,
      currentVisibleSymbols: this.getVisibleScene(),
      currentVisiblePresentationValues: this.getVisiblePresentationValues(),
      targetVisibleSymbols,
      targetVisiblePresentationValues,
      presentationValueResolver: this.#presentationValueResolver,
    });
    const preparedLanding = this.prepareLanding(plan, spinStrip);
    this.discardPreparedLanding();
    this.#plan = plan;
    this.#continuousSpin = null;
    this.#spinStrip = spinStrip;
    this.#preparedLanding = preparedLanding;
    this.#staticVisibleSymbols = null;
    this.#staticVisiblePresentationValues = null;
    this.#targetVisibleSymbols = targetVisibleSymbols ?? null;
    this.#targetVisiblePresentationValues =
      targetVisiblePresentationValues ?? null;
    this.#targetVisibleStates = targetVisibleStates ?? null;
    this.#spinLocalY = 0;
    this.#spinStartLocalY = 0;
    this.#continuousSettleInitialSlope = 1;
    this.#settlingFromContinuous = false;
    this.#elapsedMs = 0;
    this.#phase = "starting";
    this.#landed = false;
    this.syncClippingForPhase();
    this.renderAtY(this.#spinLocalY, "spinBlur");
  }

  startContinuous(options: RenderReelContinuousSpinOptions): void {
    if (this.#phase !== "idle" && this.#phase !== "stopped") {
      throw new ReelError(
        `Cannot start continuous reel ${this.xIndex} while phase is "${this.#phase}".`,
      );
    }
    const speedSymbolsPerSecond = normalizePositiveFiniteNumber(
      options.speedSymbolsPerSecond,
      "speedSymbolsPerSecond",
    );
    if (options.direction !== "forward" && options.direction !== "backward") {
      throw new ReelError(
        'continuous spin direction must be "forward" or "backward".',
      );
    }
    const reels = options.reels ?? this.#reels;
    const currentY =
      options.localPhaseY === undefined
        ? this.#spinStrip
          ? this.#spinLocalY
          : this.#currentY
        : reels.normalizeY(
            this.xIndex,
            normalizeSafeInteger(options.localPhaseY, "localPhaseY"),
          );
    const currentScene = this.getVisibleScene();
    const currentValues = this.getVisiblePresentationValues();
    const baseY = Math.floor(currentY);
    this.discardPreparedLanding();
    this.#continuousSpin = {
      reels,
      direction: options.direction,
      speedSymbolsPerSecond,
      initialCodes: new Map(
        currentScene.map((code, y) => [baseY + y, code] as const),
      ),
      initialPresentationValues: new Map(
        currentValues.map((value, y) => [baseY + y, value] as const),
      ),
    };
    this.#plan = null;
    this.#spinStrip = null;
    this.#spinLocalY = 0;
    this.#spinStartLocalY = 0;
    this.#continuousSettleInitialSlope = 1;
    this.#elapsedMs = 0;
    this.#currentY = currentY;
    this.#staticVisibleSymbols = null;
    this.#staticVisiblePresentationValues = null;
    this.#targetVisibleSymbols = null;
    this.#targetVisiblePresentationValues = null;
    this.#targetVisibleStates = null;
    this.#phase = "spinning";
    this.#landed = false;
    this.#settlingFromContinuous = false;
    this.syncClippingForPhase();
    this.renderAtY(this.#currentY, "spinBlur");
  }

  settleContinuous(
    plan: ReelAxisSpinPlan,
    options: RenderReelSpinOptions = {},
  ): void {
    const continuous = this.#continuousSpin;
    if (!continuous || this.#phase !== "spinning") {
      throw new ReelError(
        `Cannot settle reel ${this.xIndex} without an active continuous spin.`,
      );
    }
    if (plan.x !== this.xIndex || plan.direction !== continuous.direction) {
      throw new ReelError(
        `Continuous reel ${this.xIndex} settle plan does not match its active direction.`,
      );
    }
    const targetVisibleSymbols = parseVisibleSymbols(
      options.targetVisibleSymbols,
      this.layout.visibleRows,
      "targetVisibleSymbols",
    );
    const targetVisiblePresentationValues = parsePresentationValues(
      options.targetVisiblePresentationValues,
      this.layout.visibleRows,
      "targetVisiblePresentationValues",
    );
    const targetVisibleStates = parseVisibleStates(
      options.targetVisibleStates,
      this.layout.visibleRows,
      "targetVisibleStates",
    );
    validateEmptyEndpoints(
      targetVisibleSymbols,
      targetVisiblePresentationValues,
      targetVisibleStates,
      "targetVisibleSymbols",
    );
    this.validateExplicitTargetPresentationValues(
      targetVisibleSymbols,
      targetVisiblePresentationValues,
    );
    const currentScene = this.getVisibleScene();
    const currentValues = this.getVisiblePresentationValues();
    const startY = Math.floor(this.#currentY);
    const startLocalY = this.#currentY - startY;
    const settlePlan = Object.freeze({ ...plan, startY });
    const spinStrip = createTemporaryReelStrip({
      reels: options.reels ?? continuous.reels,
      x: this.xIndex,
      layout: this.layout,
      plan: settlePlan,
      currentVisibleSymbols: currentScene,
      currentVisiblePresentationValues: currentValues,
      targetVisibleSymbols,
      targetVisiblePresentationValues,
      presentationValueResolver: this.#presentationValueResolver,
    });
    const preparedLanding = this.prepareLanding(settlePlan, spinStrip);
    this.discardPreparedLanding();
    this.#plan = settlePlan;
    this.#spinStrip = spinStrip;
    this.#preparedLanding = preparedLanding;
    this.#continuousSpin = null;
    this.#targetVisibleSymbols = targetVisibleSymbols ?? null;
    this.#targetVisiblePresentationValues =
      targetVisiblePresentationValues ?? null;
    this.#targetVisibleStates = targetVisibleStates ?? null;
    this.#spinStartLocalY = startLocalY;
    this.#spinLocalY = startLocalY;
    const settleDistance = Math.abs(
      (plan.direction === "forward"
        ? settlePlan.travelSymbols
        : -settlePlan.travelSymbols) - startLocalY,
    );
    this.#continuousSettleInitialSlope = Math.min(
      1,
      (continuous.speedSymbolsPerSecond * settlePlan.durationMs) /
        1000 /
        settleDistance,
    );
    this.#elapsedMs = 0;
    this.#phase = "spinning";
    this.#landed = false;
    this.#settlingFromContinuous = true;
    this.renderAtY(this.#spinLocalY, "spinBlur");
  }

  cancelContinuous(): void {
    if (!this.#continuousSpin) return;
    const scene = this.getVisibleScene();
    const values = this.getVisiblePresentationValues();
    this.resetToVisibleSymbols(scene, Math.floor(this.#currentY), values);
  }

  isContinuousSpinning(): boolean {
    return this.#continuousSpin !== null;
  }

  getPhase(): RenderReelPhase {
    return this.#phase;
  }

  update(deltaSeconds: number): RenderReelUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    const wasLanded = this.#landed;
    let landedThisUpdate = false;

    if (this.#continuousSpin) {
      const continuous = this.#continuousSpin;
      this.#elapsedMs += deltaSeconds * 1000;
      const travel = continuous.speedSymbolsPerSecond * deltaSeconds;
      this.#currentY += continuous.direction === "forward" ? travel : -travel;
      this.#phase = "spinning";
      this.syncClippingForPhase();
      this.renderAtY(this.#currentY, "spinBlur");
    } else if (this.#plan && !this.#landed) {
      this.#elapsedMs = Math.min(
        this.#elapsedMs + deltaSeconds * 1000,
        this.#plan.durationMs,
      );
      const progress =
        this.#plan.durationMs === 0
          ? 1
          : this.#elapsedMs / this.#plan.durationMs;

      if (progress >= 1) {
        landedThisUpdate = this.land();
      } else {
        this.#phase =
          progress < 0.12
            ? "starting"
            : progress < 0.86
              ? "spinning"
              : "settling";
        this.#spinLocalY = this.calculateSpinLocalY(progress);
        this.y = calculateBounceOffset(
          progress,
          this.layout.cellHeight,
          this.#bounceStrength,
        );
        this.syncClippingForPhase();
        this.renderAtY(this.#spinLocalY, "spinBlur");
      }
    }

    this.updateVisibleSymbols(landedThisUpdate ? 0 : deltaSeconds);

    return !wasLanded && this.#landed
      ? LANDED_UPDATE_RESULT
      : UPDATE_RESULTS_BY_PHASE[this.#phase];
  }

  resetToY(y: number): void {
    this.discardPreparedLanding();
    this.#plan = null;
    this.#continuousSpin = null;
    this.#spinStrip = null;
    this.#spinLocalY = 0;
    this.#spinStartLocalY = 0;
    this.#continuousSettleInitialSlope = 1;
    this.#settlingFromContinuous = false;
    this.#elapsedMs = 0;
    this.#currentY = y;
    this.#staticVisibleSymbols = null;
    this.#targetVisibleSymbols = null;
    this.#staticVisiblePresentationValues = null;
    this.#targetVisiblePresentationValues = null;
    this.#targetVisibleStates = null;
    this.#phase = "stopped";
    this.#landed = true;
    this.y = 0;
    this.syncClippingForPhase();
    this.renderAtY(y, "normal");
    this.updateVisibleSymbols(0);
  }

  resetToVisibleSymbols(
    visibleSymbols: readonly number[],
    y = 0,
    presentationValues?: readonly (number | null)[],
  ): void {
    const parsedVisibleSymbols = parseVisibleSymbols(
      visibleSymbols,
      this.layout.visibleRows,
      "visibleSymbols",
    )!;
    const parsedPresentationValues = parsePresentationValues(
      presentationValues,
      this.layout.visibleRows,
      "presentationValues",
    );
    this.discardPreparedLanding();
    this.#plan = null;
    this.#continuousSpin = null;
    this.#spinStrip = null;
    this.#spinLocalY = 0;
    this.#spinStartLocalY = 0;
    this.#continuousSettleInitialSlope = 1;
    this.#settlingFromContinuous = false;
    this.#elapsedMs = 0;
    this.#currentY = y;
    this.#staticVisibleSymbols = parsedVisibleSymbols;
    this.#staticVisiblePresentationValues =
      parsedPresentationValues ??
      Object.freeze(
        parsedVisibleSymbols.map((code, windowY) =>
          code === -1 ? null : this.resolvePresentationValue(y + windowY, code),
        ),
      );
    this.#targetVisibleSymbols = null;
    this.#targetVisiblePresentationValues = null;
    this.#targetVisibleStates = null;
    this.#phase = "stopped";
    this.#landed = true;
    this.y = 0;
    this.syncClippingForPhase();
    this.renderAtY(y, "normal");
    this.updateVisibleSymbols(0);
  }

  getVisibleScene(): readonly number[] {
    return this.createWindowSnapshot(
      this.#spinStrip ? this.#spinLocalY : this.#currentY,
    ).visibleScene;
  }

  getVisiblePresentationValues(): readonly (number | null)[] {
    const y = this.#spinStrip ? this.#spinLocalY : this.#currentY;
    const snapshot = this.createWindowSnapshot(y);
    const visibleSlots = snapshot.slots.filter(
      (slot) => slot.windowY >= 0 && slot.windowY < this.layout.visibleRows,
    );
    return Object.freeze(
      visibleSlots.map((slot) =>
        this.getPresentationValue(slot.symbolY, slot.code, y),
      ),
    );
  }

  /** Returns stable live views for allocation-sensitive render coordination. */
  getSlotRenderViews(): readonly RenderReelSlotRenderView[] {
    return this.#slotRenderViews;
  }

  getSlotRenderView(windowY: number): RenderReelSlotRenderView {
    return this.#slotRenderViews[this.getSlotIndex(windowY)]!;
  }

  setSlotBrightness(windowY: number, brightness: number): void {
    if (!Number.isFinite(brightness) || brightness < 0 || brightness > 1)
      throw new ReelError(
        "slot brightness must be finite and between 0 and 1.",
      );
    const slot = this.#slots[this.getSlotIndex(windowY)]!;
    const isEmpty =
      slot.symbol === null &&
      (slot.kind === "empty" || (slot.code === null && slot.kind === null));
    slot.container.alpha = 1;
    slot.container.tint = createBrightnessTint(isEmpty ? 1 : brightness);
    const emptyDimmingAlpha = isEmpty ? 1 - brightness : 0;
    slot.emptyDimmingOverlay.alpha = emptyDimmingAlpha;
    slot.emptyDimmingOverlay.renderable = emptyDimmingAlpha > 0;
  }

  getSlotBrightness(windowY: number): number {
    const tint = this.#slots[this.getSlotIndex(windowY)]!.container
      .tint as number;
    return ((tint >> 16) & 0xff) / 255;
  }

  getSlotEmptyDimmingAlpha(windowY: number): number {
    return this.#slots[this.getSlotIndex(windowY)]!.emptyDimmingOverlay.alpha;
  }

  resetSlotBrightness(): void {
    for (const slot of this.#slots) {
      slot.container.alpha = 1;
      slot.container.tint = 0xffffff;
      slot.emptyDimmingOverlay.alpha = 0;
      slot.emptyDimmingOverlay.renderable = false;
    }
  }

  createVisibleEmptySymbolHandle(
    windowY: number,
    source: Omit<EmptySymbolHandleSource, "view" | "owned">,
  ): SymbolHandle {
    const slot = this.getVisibleSlot(windowY);
    if (slot.symbol || slot.kind === "textured" || (slot.code ?? -1) !== -1)
      throw new ReelError(
        `Cannot create empty SymbolHandle for occupied reel ${this.xIndex}, y ${windowY}.`,
      );
    return createEmptySymbolHandle({
      view: slot.emptySymbolLayer,
      owned: false,
      assertUsable: () => {
        source.assertUsable();
        if (slot.symbol || slot.kind === "textured" || (slot.code ?? -1) !== -1)
          throw new ReelError("SymbolHandle is stale.");
      },
      ...(source.getPosition ? { getPosition: source.getPosition } : {}),
      ...(source.getAnchor ? { getAnchor: source.getAnchor } : {}),
    });
  }

  getCurrentY(): number {
    return this.#spinStrip ? this.#spinLocalY : this.#currentY;
  }

  takeVisibleOccurrence(windowY = 0): RenderReelVisibleOccurrence {
    const slot = this.getVisibleSlot(windowY);
    if (slot.kind !== "textured" || !slot.symbol || slot.code === null) {
      throw new ReelError(
        `Cannot take empty visible occurrence at reel ${this.xIndex}, y ${windowY}.`,
      );
    }
    const occurrence = Object.freeze({
      code: slot.code,
      kind: "textured" as const,
      symbol: slot.symbol,
      presentationValue: slot.symbol.getPresentationValue(),
    });
    slot.symbol.parent?.removeChild(slot.symbol);
    slot.code = null;
    slot.kind = null;
    slot.symbol = null;
    slot.renderPriority = 0;
    this.syncSlotRenderOrder(slot);
    this.setStaticVisibleSlot(windowY, -1, null);
    return occurrence;
  }

  detachVisibleOccurrenceForTransfer(windowY = 0): RenderReelVisibleOccurrence {
    const slot = this.getVisibleSlot(windowY);
    if (slot.kind !== "textured" || !slot.symbol || slot.code === null)
      throw new ReelError(
        `Cannot detach empty visible occurrence at reel ${this.xIndex}, y ${windowY}.`,
      );
    const occurrence = Object.freeze({
      code: slot.code,
      kind: "textured" as const,
      symbol: slot.symbol,
      presentationValue: slot.symbol.getPresentationValue(),
    });
    slot.symbol.parent?.removeChild(slot.symbol);
    return occurrence;
  }

  restoreDetachedVisibleOccurrence(
    occurrence: RenderReelVisibleOccurrence,
    windowY = 0,
  ): void {
    const slot = this.getVisibleSlot(windowY);
    if (slot.symbol !== occurrence.symbol || slot.code !== occurrence.code)
      throw new ReelError(
        `Cannot restore a different occurrence at reel ${this.xIndex}, y ${windowY}.`,
      );
    occurrence.symbol.parent?.removeChild(occurrence.symbol);
    slot.contentLayer.addChild(occurrence.symbol);
    occurrence.symbol.position.set(0);
  }

  createDetachedOccurrence(
    code: number,
    presentationValue: number | null,
  ): RenderReelVisibleOccurrence {
    const entry = this.#registry.getEntryByCode(code);
    if (entry.kind !== "textured") {
      throw new ReelError(
        `Cannot create detached occurrence for non-textured symbol code ${code}.`,
      );
    }
    const symbol = this.acquireTexturedSymbol(code);
    symbol.init();
    symbol.setPresentationValue(presentationValue);
    return Object.freeze({
      code,
      kind: "textured" as const,
      symbol,
      presentationValue,
    });
  }

  releaseDetachedOccurrence(occurrence: RenderReelVisibleOccurrence): void {
    occurrence.symbol.parent?.removeChild(occurrence.symbol);
    if (this.#symbolPool) {
      this.#symbolPool.release(occurrence.code, occurrence.symbol);
    } else {
      occurrence.symbol.destroy({ children: true });
    }
  }

  placeVisibleOccurrence(
    occurrence: RenderReelVisibleOccurrence,
    windowY = 0,
  ): void {
    const slot = this.getVisibleSlot(windowY);
    if (slot.symbol || slot.code !== null || slot.kind !== null) {
      throw new ReelError(
        `Cannot place occurrence into occupied reel ${this.xIndex}, y ${windowY}.`,
      );
    }
    slot.code = occurrence.code;
    slot.kind = occurrence.kind;
    slot.symbol = occurrence.symbol;
    slot.renderPriority = occurrence.symbol.renderPriority;
    slot.contentLayer.addChild(occurrence.symbol);
    occurrence.symbol.position.set(0);
    occurrence.symbol.visible = true;
    occurrence.symbol.renderable = true;
    this.setStaticVisibleSlot(
      windowY,
      occurrence.code,
      occurrence.presentationValue,
    );
    this.syncSlotRenderOrder(slot);
  }

  openVisibleEmptySlot(windowY = 0): void {
    const slot = this.getVisibleSlot(windowY);
    if (slot.symbol)
      throw new ReelError(
        `Cannot open occupied visible slot at reel ${this.xIndex}, y ${windowY}.`,
      );
    if (slot.code === null && slot.kind === null) return;
    if (slot.kind !== "empty" || slot.code === null)
      throw new ReelError(
        `Cannot open occupied visible slot at reel ${this.xIndex}, y ${windowY}.`,
      );
    slot.code = null;
    slot.kind = null;
    slot.renderPriority = 0;
    this.setStaticVisibleSlot(windowY, -1, null);
  }

  placeVisibleEmptySlot(windowY = 0): void {
    const slot = this.getVisibleSlot(windowY);
    if (slot.symbol || slot.code !== null || slot.kind !== null)
      throw new ReelError(
        `Cannot place an empty symbol into occupied reel ${this.xIndex}, y ${windowY}.`,
      );
    slot.code = -1;
    slot.kind = "empty";
    slot.renderPriority = 0;
    this.setStaticVisibleSlot(windowY, -1, null);
    this.syncSlotRenderOrder(slot);
  }

  releaseVisibleOccurrence(windowY = 0): void {
    const occurrence = this.takeVisibleOccurrence(windowY);
    if (this.#symbolPool) {
      this.#symbolPool.release(occurrence.code, occurrence.symbol);
    } else {
      occurrence.symbol.destroy({ children: true });
    }
  }

  requestVisibleSymbolState(
    windowY: number,
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    const slot = this.getVisibleSlot(windowY);
    if (slot.kind === "empty" || !slot.symbol) {
      throw new ReelError(
        `Cannot request state "${state}" for empty visible symbol at reel ${this.xIndex}, y ${windowY}.`,
      );
    }

    const shouldObserve =
      (this.#phase === "idle" || this.#phase === "stopped") &&
      !!this.#symbolStateObserver?.hasAnyInterest(slot.symbol.symbol);
    const before = shouldObserve ? slot.symbol.getStateSnapshot() : null;
    slot.symbol.requestState(state, transitionMode);
    if (before) {
      const after = slot.symbol.getStateSnapshot();
      if (before.resolvedState !== after.resolvedState)
        this.#symbolStateObserver!.observe({
          x: this.xIndex,
          y: windowY,
          code: slot.symbol.code,
          symbol: slot.symbol.symbol,
          previousRequestedState: before.requestedState,
          previousResolvedState: before.resolvedState,
          requestedState: after.requestedState,
          resolvedState: after.resolvedState,
        });
    }
  }

  resetVisibleSymbolForLanding(windowY: number, state?: SymbolStateId): void {
    const slot = this.getVisibleSlot(windowY);
    if (slot.kind === "empty" || !slot.symbol) {
      throw new ReelError(
        `Cannot reset landing state for empty visible symbol at reel ${this.xIndex}, y ${windowY}.`,
      );
    }

    slot.symbol.reset();
    const before = this.captureObservedState(slot.symbol);
    if (state) slot.symbol.requestState(state, "immediate");
    else slot.symbol.requestLandingAppear("immediate");
    this.observeCapturedState(windowY, slot.symbol, before);
  }

  validateVisibleSymbolStatePlayback(
    windowY: number,
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): void {
    this.getVisiblePlayableSymbol(windowY, state).validateStatePlayback(
      state,
      options,
    );
  }

  playVisibleSymbolState(
    windowY: number,
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): Promise<void> {
    const symbol = this.getVisiblePlayableSymbol(windowY, state);
    const before = this.captureObservedState(symbol);
    const playback = symbol.playState(state, options);
    this.observeCapturedState(windowY, symbol, before);
    return playback;
  }

  playVisibleTerminalSymbolState(
    windowY: number,
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
    terminalComplete: () => void,
  ): Promise<void> {
    const symbol = this.getVisiblePlayableSymbol(windowY, state);
    const before = this.captureObservedState(symbol);
    const playback = symbol.playTerminalState(state, options, terminalComplete);
    this.observeCapturedState(windowY, symbol, before);
    return playback;
  }

  hasVisibleTerminalSymbolState(
    windowY: number,
    state: SymbolStateId,
  ): boolean {
    return this.getVisiblePlayableSymbol(windowY, state).hasTerminalState(
      state,
    );
  }

  setVisibleSymbolPresentationValue(
    windowY: number,
    value: number | null,
  ): void {
    const slot = this.getVisibleSlot(windowY);
    if (slot.kind === "empty" || !slot.symbol || slot.code === null) {
      if (value === null) return;
      throw new ReelError(
        `Empty visible symbol at reel ${this.xIndex}, y ${windowY} only accepts a null presentation value.`,
      );
    }
    slot.symbol.setPresentationValue(value);
    this.setStaticVisibleSlot(windowY, slot.code, value);
  }

  setVisibleSymbolImageStringText(
    windowY: number,
    name: string,
    text: string,
  ): void {
    const slot = this.getVisibleSlot(windowY);
    if (slot.kind === "empty" || !slot.symbol) {
      throw new ReelError(
        `Cannot set image-string text for empty visible symbol at reel ${this.xIndex}, y ${windowY}.`,
      );
    }
    slot.symbol.setImageStringText(name, text);
  }

  getVisibleSymbolImageStringText(windowY: number, name: string): string {
    const slot = this.getVisibleSlot(windowY);
    if (slot.kind === "empty" || !slot.symbol) {
      throw new ReelError(
        `Cannot read image-string text for empty visible symbol at reel ${this.xIndex}, y ${windowY}.`,
      );
    }
    return slot.symbol.getImageStringText(name);
  }

  getVisibleSymbolStateSnapshot(
    windowY: number,
  ): RenderVisibleSymbolStateSnapshot {
    const slot = this.getVisibleSlot(windowY);
    const state = slot.symbol?.getStateSnapshot();
    const completion = slot.symbol?.getAnimationCompletionSnapshot();
    return Object.freeze({
      x: this.xIndex,
      y: windowY,
      code: slot.code ?? -1,
      kind: slot.kind ?? "empty",
      requestedState: state?.requestedState ?? null,
      resolvedState: state?.resolvedState ?? null,
      isOnce: state?.isOnce ?? false,
      loopCompletionCount: completion?.loopCompletionCount ?? 0,
      onceCompletionCount: completion?.onceCompletionCount ?? 0,
    });
  }

  getVisibleSymbolGeometrySnapshot(
    windowY: number,
  ): RenderVisibleSymbolGeometrySnapshot {
    const slot = this.getVisibleSlot(windowY);
    return Object.freeze({
      x: this.xIndex,
      y: windowY,
      code: slot.code ?? -1,
      kind: slot.kind ?? "empty",
      centerX: this.x + this.layout.cellWidth / 2,
      centerY:
        this.y + this.layout.getCellY(windowY) + this.layout.cellHeight / 2,
      cellWidth: this.layout.cellWidth,
      cellHeight: this.layout.cellHeight,
    });
  }

  private getVisiblePlayableSymbol(
    windowY: number,
    state: SymbolStateId,
  ): SymbolPlayer {
    const slot = this.getVisibleSlot(windowY);
    if (slot.kind === "empty" || !slot.symbol) {
      throw new ReelError(
        `Cannot play state "${state}" for empty visible symbol at reel ${this.xIndex}, y ${windowY}.`,
      );
    }
    return slot.symbol;
  }

  getSnapshot(): RenderReelSnapshot {
    return Object.freeze({
      x: this.xIndex,
      phase: this.#phase,
      currentY: this.getCurrentY(),
      finalY: this.#plan?.finalY ?? null,
      startY: this.#plan?.startY ?? null,
      elapsedMs: this.#elapsedMs,
      visibleScene: this.getVisibleScene(),
    });
  }

  private getVisibleSlot(windowY: number): ReelSlot {
    if (
      !Number.isInteger(windowY) ||
      windowY < 0 ||
      windowY >= this.layout.visibleRows
    ) {
      throw new ReelError(
        `visible window y ${windowY} is out of range for reel ${this.xIndex}.`,
      );
    }
    if (this.#phase !== "stopped") {
      throw new ReelError(
        `Cannot request visible symbol state while reel ${this.xIndex} phase is "${this.#phase}".`,
      );
    }

    return this.#slots[this.getSlotIndex(windowY)]!;
  }

  private getSlotIndex(windowY: number): number {
    if (!Number.isInteger(windowY))
      throw new ReelError(
        `reel slot window y ${windowY} must be an integer for reel ${this.xIndex}.`,
      );
    const index = windowY + this.layout.bufferRowsBefore;
    if (index < 0 || index >= this.#slots.length)
      throw new ReelError(
        `reel slot window y ${windowY} is out of range for reel ${this.xIndex}.`,
      );
    const slot = this.#slots[index];
    if (!slot || slot.windowY !== windowY)
      throw new ReelError(
        `Missing reel slot for reel ${this.xIndex}, y ${windowY}.`,
      );
    return index;
  }

  private setStaticVisibleSlot(
    windowY: number,
    code: number,
    presentationValue: number | null,
  ): void {
    const currentCodes = this.#staticVisibleSymbols ?? this.getVisibleScene();
    const currentValues =
      this.#staticVisiblePresentationValues ??
      this.getVisiblePresentationValues();
    this.#staticVisibleSymbols = Object.freeze(
      currentCodes.map((candidate, index) =>
        index === windowY ? code : candidate,
      ),
    );
    this.#staticVisiblePresentationValues = Object.freeze(
      currentValues.map((candidate, index) =>
        index === windowY ? presentationValue : candidate,
      ),
    );
  }

  private createSlots(): ReelSlot[] {
    const slots: ReelSlot[] = [];
    let orderIndex = 0;
    for (
      let windowY = -this.layout.bufferRowsBefore;
      windowY < this.layout.visibleRows + this.layout.bufferRowsAfter;
      windowY += 1
    ) {
      const container = new Container();
      const contentLayer = new Container();
      const emptySymbolLayer = new Container();
      const emptyDimmingOverlay = new Graphics()
        .rect(
          -this.layout.cellWidth / 2,
          -this.layout.cellHeight / 2,
          this.layout.cellWidth,
          this.layout.cellHeight,
        )
        .fill({ color: 0x000000, alpha: 1 });
      const rollingSprite = new Sprite(Texture.EMPTY);
      const rollingValueLayer = new Container();
      rollingSprite.anchor.set(0.5);
      rollingSprite.visible = false;
      rollingSprite.renderable = false;
      rollingValueLayer.visible = false;
      rollingValueLayer.renderable = false;
      emptyDimmingOverlay.alpha = 0;
      emptyDimmingOverlay.renderable = false;
      contentLayer.addChild(rollingSprite, rollingValueLayer);
      container.addChild(contentLayer, emptySymbolLayer, emptyDimmingOverlay);
      const renderOrder = this.#slotRenderOrderOffset + orderIndex;
      container.x = this.getSlotContainerX();
      container.y = this.getSlotContainerY(windowY, 0);
      container.zIndex = renderOrder;
      this.#slotParent.addChild(container);
      slots.push({
        windowY,
        renderOrder,
        container,
        contentLayer,
        emptySymbolLayer,
        emptyDimmingOverlay,
        rollingSprite,
        rollingValueLayer,
        rollingValueVisuals: new Map(),
        activeRollingValueKey: null,
        rollingPresentationValue: null,
        rollingValueTierIndex: null,
        code: null,
        kind: null,
        symbol: null,
        renderPriority: 0,
      });
      orderIndex += 1;
    }
    return slots;
  }

  private createSlotRenderViews(): readonly RenderReelSlotRenderView[] {
    return Object.freeze(
      this.#slots.map((slot) =>
        Object.freeze({
          windowY: slot.windowY,
          get code(): number {
            return slot.code ?? -1;
          },
          get kind(): ReelSymbolKind {
            return slot.kind ?? "empty";
          },
          get symbol(): SymbolPlayer | null {
            return slot.symbol;
          },
          get renderPriority(): number {
            return slot.renderPriority;
          },
          get zIndex(): number {
            return slot.container.zIndex;
          },
          get hasClipMask(): boolean {
            return slot.container.mask != null;
          },
          get presentationValue(): number | null {
            return (
              slot.symbol?.getPresentationValue() ??
              slot.rollingPresentationValue
            );
          },
        }),
      ),
    );
  }

  private renderAtY(y: number, state: SymbolStateId): void {
    const baseY = Math.floor(y);
    const pixelOffsetY =
      -(y - baseY) * (this.layout.cellHeight + this.layout.rowGap);

    for (const slot of this.#slots) {
      slot.container.x = this.getSlotContainerX();
      slot.container.y = this.getSlotContainerY(slot.windowY, pixelOffsetY);
      slot.container.visible = this.shouldShowSlot(slot.windowY);
      if (!slot.container.visible) {
        this.syncDormantSlot(slot);
        continue;
      }
      const symbolY = baseY + slot.windowY;
      const code = this.getCodeAt(symbolY, baseY);
      const isVisibleStoppedSlot =
        this.#phase === "stopped" &&
        slot.windowY >= 0 &&
        slot.windowY < this.layout.visibleRows;
      if (isVisibleStoppedSlot) {
        this.syncSettledSlot(
          slot,
          code,
          this.getPresentationValue(symbolY, code, y),
        );
        slot.symbol?.requestState(state, "boundary");
      } else {
        this.syncRollingSlot(
          slot,
          code,
          "spinBlur",
          this.getPresentationValue(symbolY, code, y),
        );
      }
    }
  }

  private syncDormantSlot(slot: ReelSlot): void {
    this.releaseSlotSymbol(slot);
    slot.emptySymbolLayer.removeChildren();
    slot.code = null;
    slot.kind = null;
    slot.renderPriority = 0;
    slot.rollingSprite.visible = false;
    slot.rollingSprite.renderable = false;
    this.hideRollingValue(slot);
    this.syncSlotRenderOrder(slot);
  }

  private createWindowSnapshot(y: number): ReelWindowSnapshot {
    const spinStrip = this.#spinStrip;
    const continuousSpin = this.#continuousSpin;
    const staticVisibleSymbols = spinStrip ? null : this.#staticVisibleSymbols;
    const staticBaseY = Math.floor(y);

    return createReelWindowSnapshot({
      reels: this.#reels,
      x: this.xIndex,
      y,
      layout: this.layout,
      codeAt: spinStrip
        ? (symbolY) => spinStrip.get(symbolY)
        : continuousSpin
          ? (symbolY) =>
              continuousSpin.initialCodes.get(symbolY) ??
              continuousSpin.reels.get(this.xIndex, symbolY)
          : staticVisibleSymbols
            ? (symbolY) => {
                const visibleY = symbolY - staticBaseY;
                if (visibleY >= 0 && visibleY < this.layout.visibleRows) {
                  return staticVisibleSymbols[visibleY];
                }
                return this.#reels.get(this.xIndex, symbolY);
              }
            : undefined,
    });
  }

  private getCodeAt(symbolY: number, renderedBaseY: number): number {
    if (this.#spinStrip) return this.#spinStrip.get(symbolY);
    if (this.#continuousSpin) {
      return (
        this.#continuousSpin.initialCodes.get(symbolY) ??
        this.#continuousSpin.reels.get(this.xIndex, symbolY)
      );
    }
    if (this.#staticVisibleSymbols) {
      const visibleY = symbolY - renderedBaseY;
      if (visibleY >= 0 && visibleY < this.layout.visibleRows) {
        return this.#staticVisibleSymbols[visibleY]!;
      }
    }
    return this.#reels.get(this.xIndex, symbolY);
  }

  private syncSettledSlot(
    slot: ReelSlot,
    code: number,
    presentationValue: number | null,
  ): void {
    slot.rollingSprite.visible = false;
    slot.rollingSprite.renderable = false;
    this.hideRollingValue(slot);
    const prepared = this.#preparedLanding?.get(slot.windowY);
    if (prepared) {
      if (
        prepared.code !== code ||
        prepared.presentationValue !== presentationValue
      ) {
        throw new ReelError(
          `Prepared landing at reel ${this.xIndex}, y ${slot.windowY} does not match the committed target.`,
        );
      }
      const preparedSymbol = prepared.occurrence?.symbol ?? null;
      if (
        preparedSymbol &&
        preparedSymbol.getPresentationValue() !== prepared.presentationValue
      ) {
        throw new ReelError(
          `Prepared landing symbol at reel ${this.xIndex}, y ${slot.windowY} does not contain the committed presentation value before attachment.`,
        );
      }
      this.#preparedLanding?.delete(slot.windowY);
      this.releaseSlotSymbol(slot);
      slot.emptySymbolLayer.removeChildren();
      slot.emptySymbolLayer.position.set(0);
      slot.emptySymbolLayer.visible = true;
      slot.emptySymbolLayer.renderable = true;
      slot.code = prepared.code;
      slot.kind = prepared.kind;
      slot.symbol = preparedSymbol;
      if (slot.symbol) {
        slot.contentLayer.addChild(slot.symbol);
        slot.symbol.position.set(0);
        slot.symbol.visible = true;
        slot.symbol.renderable = true;
        slot.renderPriority = slot.symbol.renderPriority;
      } else {
        slot.renderPriority = 0;
      }
      this.syncSlotRenderOrder(slot);
      return;
    }
    if (slot.code === code && slot.symbol) {
      slot.symbol?.setPresentationValue(presentationValue);
      slot.renderPriority = slot.symbol.renderPriority;
      this.syncSlotRenderOrder(slot);
      return;
    }

    this.releaseSlotSymbol(slot);
    slot.emptySymbolLayer.removeChildren();
    slot.emptySymbolLayer.position.set(0);
    slot.emptySymbolLayer.visible = true;
    slot.emptySymbolLayer.renderable = true;
    slot.code = code;
    if (code === -1) {
      slot.kind = "empty";
      slot.symbol = null;
      slot.renderPriority = 0;
      this.syncSlotRenderOrder(slot);
      return;
    }
    const entry = this.#registry.getEntryByCode(code);
    slot.kind = entry.kind;
    const symbol =
      entry.kind === "empty" ? null : this.acquireTexturedSymbol(code);
    if (symbol) {
      try {
        symbol.init();
        symbol.setPresentationValue(presentationValue);
        if (symbol.getPresentationValue() !== presentationValue) {
          throw new ReelError(
            `Settled symbol at reel ${this.xIndex}, y ${slot.windowY} does not contain its presentation value before attachment.`,
          );
        }
      } catch (error) {
        if (this.#symbolPool) {
          this.#symbolPool.release(code, symbol);
        } else {
          symbol.destroy({ children: true });
        }
        throw error;
      }
      slot.symbol = symbol;
      slot.contentLayer.addChild(symbol);
      slot.renderPriority = symbol.renderPriority;
    } else {
      slot.symbol = null;
      slot.renderPriority = 0;
    }
    this.syncSlotRenderOrder(slot);
  }

  private syncRollingSlot(
    slot: ReelSlot,
    code: number,
    state: SymbolStateId,
    presentationValue: number | null,
  ): void {
    const wasAlreadyRolling =
      !slot.symbol &&
      slot.code === code &&
      (code === -1 || slot.kind !== null) &&
      (code === -1 || slot.kind === "empty" || slot.rollingSprite.visible);
    if (wasAlreadyRolling) {
      this.syncRollingValue(slot, code, presentationValue);
      this.syncSlotRenderOrder(slot);
      return;
    }
    this.releaseSlotSymbol(slot);
    slot.emptySymbolLayer.removeChildren();
    slot.emptySymbolLayer.position.set(0);
    slot.emptySymbolLayer.visible = true;
    slot.emptySymbolLayer.renderable = true;
    slot.code = code;
    if (code === -1) {
      slot.kind = "empty";
      slot.renderPriority = 0;
      slot.rollingSprite.visible = false;
      slot.rollingSprite.renderable = false;
      this.hideRollingValue(slot);
      this.syncSlotRenderOrder(slot);
      return;
    }

    const entry = this.#registry.getEntryByCode(code);
    slot.kind = entry.kind;
    const visual = this.#registry.getRollingVisualByCode(code, state);
    if (!visual) {
      slot.renderPriority = 0;
      slot.rollingSprite.visible = false;
      slot.rollingSprite.renderable = false;
      this.hideRollingValue(slot);
      this.syncSlotRenderOrder(slot);
      return;
    }
    slot.rollingSprite.texture = visual.texture;
    slot.rollingSprite.scale.set(visual.scale);
    slot.rollingSprite.visible = true;
    slot.rollingSprite.renderable = true;
    slot.renderPriority = visual.renderPriority;
    this.syncRollingValue(slot, code, presentationValue);
    this.syncSlotRenderOrder(slot);
  }

  private syncRollingValue(
    slot: ReelSlot,
    code: number,
    value: number | null,
  ): void {
    if (value === null) {
      if (this.#registry.requiresPresentationValueByCode(code)) {
        throw new ReelError(
          `Rolling symbol code ${code} requires a game-configured presentation value.`,
        );
      }
      this.hideRollingValue(slot);
      return;
    }
    const tierIndex = this.#registry.resolveRollingValueTierByCode(code, value);
    if (tierIndex === null) {
      this.hideRollingValue(slot);
      return;
    }
    const key = `${code}:${tierIndex}`;
    let visual = slot.rollingValueVisuals.get(key);
    if (!visual) {
      const created = this.#registry.createRollingValueVisualByCode(
        code,
        value,
      );
      if (!created) {
        this.hideRollingValue(slot);
        return;
      }
      visual = created;
      if (visual.tierIndex !== tierIndex) {
        visual.destroy();
        throw new ReelError(
          `Rolling value visual for code ${code} returned tier ${visual.tierIndex}, expected ${tierIndex}.`,
        );
      }
      slot.rollingValueVisuals.set(key, visual);
      slot.rollingValueLayer.addChild(visual.container);
    }
    visual.setValue(value);
    for (const [candidateKey, candidate] of slot.rollingValueVisuals) {
      const active = candidateKey === key;
      candidate.container.visible = active;
      candidate.container.renderable = active;
    }
    slot.activeRollingValueKey = key;
    slot.rollingPresentationValue = value;
    slot.rollingValueTierIndex = tierIndex;
    slot.rollingValueLayer.visible = true;
    slot.rollingValueLayer.renderable = true;
  }

  private hideRollingValue(slot: ReelSlot): void {
    slot.activeRollingValueKey = null;
    slot.rollingPresentationValue = null;
    slot.rollingValueTierIndex = null;
    slot.rollingValueLayer.visible = false;
    slot.rollingValueLayer.renderable = false;
    for (const visual of slot.rollingValueVisuals.values()) {
      visual.container.visible = false;
      visual.container.renderable = false;
    }
  }

  private releaseSlotSymbol(slot: ReelSlot): void {
    const symbol = slot.symbol;
    if (!symbol) return;
    symbol.parent?.removeChild(symbol);
    if (slot.code !== null && slot.kind === "textured" && this.#symbolPool) {
      this.#symbolPool.release(slot.code, symbol);
    } else {
      symbol.destroy({ children: true });
    }
    slot.symbol = null;
  }

  private syncSlotRenderOrder(slot: ReelSlot): void {
    slot.container.zIndex =
      slot.renderPriority * this.#slotRenderOrderStride + slot.renderOrder;
  }

  private acquireTexturedSymbol(code: number): SymbolPlayer {
    const symbol = this.#symbolPool
      ? this.#symbolPool.acquire(code, () =>
          this.#registry.createSymbolPlayerByCode(code),
        )
      : this.#registry.createSymbolPlayerByCode(code);
    if (!symbol) {
      throw new ReelError(`Textured symbol code ${code} created no symbol.`);
    }
    return symbol;
  }

  private updateVisibleSymbols(deltaSeconds: number): void {
    let visible: Map<
      SymbolPlayer,
      {
        readonly y: number;
        readonly before: ReturnType<SymbolPlayer["getStateSnapshot"]>;
      }
    > | null = null;
    if (
      this.#symbolStateObserver &&
      (this.#phase === "idle" || this.#phase === "stopped")
    ) {
      for (let y = 0; y < this.layout.visibleRows; y++) {
        const symbol = this.getVisibleSlot(y).symbol;
        if (symbol && this.#symbolStateObserver.hasAnyInterest(symbol.symbol)) {
          visible ??= new Map();
          visible.set(symbol, { y, before: symbol.getStateSnapshot() });
        }
      }
    }
    for (const slot of this.#slots) {
      if (!slot.symbol) continue;
      const result = slot.symbol.update(deltaSeconds);
      const observed = visible?.get(slot.symbol);
      if (
        observed &&
        result.stateChanged &&
        observed.before.resolvedState !== result.resolvedState
      )
        this.#symbolStateObserver!.observe({
          x: this.xIndex,
          y: observed.y,
          code: slot.symbol.code,
          symbol: slot.symbol.symbol,
          previousRequestedState: observed.before.requestedState,
          previousResolvedState: observed.before.resolvedState,
          requestedState: result.requestedState,
          resolvedState: result.resolvedState,
        });
    }
  }

  private captureObservedState(symbol: SymbolPlayer) {
    return (this.#phase === "idle" || this.#phase === "stopped") &&
      this.#symbolStateObserver?.hasAnyInterest(symbol.symbol)
      ? symbol.getStateSnapshot()
      : null;
  }

  private observeCapturedState(
    windowY: number,
    symbol: SymbolPlayer,
    before: ReturnType<SymbolPlayer["getStateSnapshot"]> | null,
  ): void {
    if (!before) return;
    const after = symbol.getStateSnapshot();
    if (before.resolvedState === after.resolvedState) return;
    this.#symbolStateObserver!.observe({
      x: this.xIndex,
      y: windowY,
      code: symbol.code,
      symbol: symbol.symbol,
      previousRequestedState: before.requestedState,
      previousResolvedState: before.resolvedState,
      requestedState: after.requestedState,
      resolvedState: after.resolvedState,
    });
  }

  private prepareLanding(
    plan: ReelAxisSpinPlan,
    spinStrip: TemporaryReelStrip,
  ): Map<number, PreparedLandingSlot> {
    const prepared = new Map<number, PreparedLandingSlot>();
    const targetBaseY =
      plan.direction === "forward" ? plan.travelSymbols : -plan.travelSymbols;
    try {
      for (let windowY = 0; windowY < this.layout.visibleRows; windowY += 1) {
        const symbolY = targetBaseY + windowY;
        const code = spinStrip.get(symbolY);
        const presentationValue = spinStrip.getPresentationValue(symbolY);
        if (code === -1) {
          prepared.set(
            windowY,
            Object.freeze({
              code,
              kind: "empty" as const,
              presentationValue: null,
              occurrence: null,
            }),
          );
          continue;
        }
        const entry = this.#registry.getEntryByCode(code);
        const occurrence =
          entry.kind === "textured"
            ? this.createDetachedOccurrence(code, presentationValue)
            : null;
        prepared.set(
          windowY,
          Object.freeze({
            code,
            kind: entry.kind,
            presentationValue,
            occurrence,
          }),
        );
      }
      return prepared;
    } catch (error) {
      for (const entry of prepared.values()) {
        if (entry.occurrence) this.releaseDetachedOccurrence(entry.occurrence);
      }
      throw error;
    }
  }

  private discardPreparedLanding(releaseToPool = true): void {
    const prepared = this.#preparedLanding;
    this.#preparedLanding = null;
    if (!prepared) return;
    for (const entry of prepared.values()) {
      if (!entry.occurrence) continue;
      if (releaseToPool) {
        this.releaseDetachedOccurrence(entry.occurrence);
      } else {
        entry.occurrence.symbol.destroy({ children: true });
      }
    }
  }

  private land(): boolean {
    const plan = this.#plan;
    if (!plan) {
      return false;
    }
    const readiness = this.getPreparedLandingReadiness();
    if (readiness.status === "failed") {
      throw readiness.error;
    }
    if (readiness.status === "pending") {
      this.#elapsedMs = plan.durationMs;
      this.#phase = "settling";
      this.#spinLocalY =
        plan.direction === "forward" ? plan.travelSymbols : -plan.travelSymbols;
      this.y = 0;
      this.syncClippingForPhase();
      this.renderAtY(this.#spinLocalY, "spinBlur");
      return false;
    }

    this.#elapsedMs = plan.durationMs;
    this.#currentY = plan.finalY;
    this.#staticVisibleSymbols = this.#targetVisibleSymbols;
    this.#staticVisiblePresentationValues =
      this.#targetVisiblePresentationValues;
    this.#targetVisibleSymbols = null;
    this.#targetVisiblePresentationValues = null;
    const targetVisibleStates = this.#targetVisibleStates;
    this.#targetVisibleStates = null;
    this.#spinStrip = null;
    this.#spinLocalY = 0;
    this.#spinStartLocalY = 0;
    this.#continuousSettleInitialSlope = 1;
    this.#settlingFromContinuous = false;
    this.#phase = "stopped";
    this.#landed = true;
    this.y = 0;
    this.syncClippingForPhase();
    this.renderAtY(plan.finalY, "normal");
    this.discardPreparedLanding();
    targetVisibleStates?.forEach((state, y) =>
      this.requestVisibleSymbolState(y, state, "immediate"),
    );
    return true;
  }

  private getPreparedLandingReadiness(): Readonly<{
    status: "ready" | "pending" | "failed";
    error: unknown;
  }> {
    for (const entry of this.#preparedLanding?.values() ?? []) {
      const readiness = entry.occurrence?.symbol.getPresentationReadiness();
      if (readiness?.status === "failed") return readiness;
      if (readiness?.status === "pending") return readiness;
    }
    return Object.freeze({ status: "ready" as const, error: null });
  }

  private validateExplicitTargetPresentationValues(
    symbols: readonly number[] | undefined,
    values: readonly (number | null)[] | undefined,
  ): void {
    if (!symbols) return;
    symbols.forEach((code, windowY) => {
      if (
        code !== -1 &&
        this.#registry.requiresPresentationValueByCode(code) &&
        values?.[windowY] == null
      ) {
        throw new ReelError(
          `Target symbol code ${code} at reel ${this.xIndex}, y ${windowY} requires an explicit final presentation value.`,
        );
      }
    });
  }

  private calculateSpinLocalY(progress: number): number {
    const plan = this.#plan;
    if (!plan) {
      return this.#spinLocalY;
    }

    const eased = this.#settlingFromContinuous
      ? easeContinuousSettle(progress, this.#continuousSettleInitialSlope)
      : easeSpinTravel(progress);
    const targetLocalY =
      plan.direction === "forward" ? plan.travelSymbols : -plan.travelSymbols;
    return (
      this.#spinStartLocalY + (targetLocalY - this.#spinStartLocalY) * eased
    );
  }

  private syncClippingForPhase(): void {
    if (this.#phase === "stopped") {
      this.mask = null;
      this.syncSlotClipMasks(false);
      this.#clipMask.visible = false;
      this.#clipMask.renderable = false;
      this.#clipMask.includeInBuild = false;
      this.#clipMask.measurable = false;
      return;
    }

    this.mask = this.#clipMask;
    this.syncSlotClipMasks(this.#usesExternalSlotParent);
    this.#clipMask.visible = true;
    this.#clipMask.renderable = true;
    this.#clipMask.includeInBuild = false;
    this.#clipMask.measurable = false;
  }

  private syncSlotClipMasks(enabled: boolean): void {
    for (const slot of this.#slots) {
      slot.container.mask = enabled ? this.#clipMask : null;
    }
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.discardPreparedLanding(false);
    for (const slot of this.#slots) {
      for (const visual of slot.rollingValueVisuals.values()) visual.destroy();
      slot.rollingValueVisuals.clear();
    }
    super.destroy(options);
  }

  private getSlotContainerX(): number {
    return (
      (this.#usesExternalSlotParent ? this.x : 0) + this.layout.cellWidth / 2
    );
  }

  private getSlotContainerY(windowY: number, pixelOffsetY: number): number {
    return (
      (this.#usesExternalSlotParent ? this.y : 0) +
      this.layout.getCellY(windowY) +
      this.layout.cellHeight / 2 +
      pixelOffsetY
    );
  }

  private shouldShowSlot(windowY: number): boolean {
    if (this.#phase !== "stopped") {
      return true;
    }
    return windowY >= 0 && windowY < this.layout.visibleRows;
  }

  private getPresentationValue(
    symbolY: number,
    code: number,
    renderedY: number,
  ): number | null {
    if (this.#spinStrip) return this.#spinStrip.getPresentationValue(symbolY);
    if (this.#continuousSpin) {
      return (
        this.#continuousSpin.initialPresentationValues.get(symbolY) ??
        this.resolvePresentationValue(symbolY, code)
      );
    }
    if (this.#staticVisibleSymbols && this.#staticVisiblePresentationValues) {
      const visibleY = symbolY - Math.floor(renderedY);
      if (visibleY >= 0 && visibleY < this.layout.visibleRows) {
        return this.#staticVisiblePresentationValues[visibleY] ?? null;
      }
    }
    return this.resolvePresentationValue(symbolY, code);
  }

  private resolvePresentationValue(
    symbolY: number,
    code: number,
  ): number | null {
    return normalizePresentationValue(
      this.#presentationValueResolver?.({ x: this.xIndex, symbolY, code }) ??
        null,
      "presentationValueResolver result",
    );
  }
}

const UPDATE_RESULTS_BY_PHASE: Readonly<
  Record<RenderReelPhase, RenderReelUpdateResult>
> = Object.freeze({
  idle: Object.freeze({ phase: "idle", completed: false, landed: false }),
  starting: Object.freeze({
    phase: "starting",
    completed: false,
    landed: false,
  }),
  spinning: Object.freeze({
    phase: "spinning",
    completed: false,
    landed: false,
  }),
  settling: Object.freeze({
    phase: "settling",
    completed: false,
    landed: false,
  }),
  stopped: Object.freeze({ phase: "stopped", completed: true, landed: false }),
});

const LANDED_UPDATE_RESULT: RenderReelUpdateResult = Object.freeze({
  phase: "stopped",
  completed: true,
  landed: true,
});

function parsePresentationValues(
  value: readonly (number | null)[] | undefined,
  expectedLength: number,
  label: string,
): readonly (number | null)[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new ReelError(`${label} length must be ${expectedLength}.`);
  }
  return Object.freeze(
    value.map((candidate, index) =>
      normalizePresentationValue(candidate, `${label}[${index}]`),
    ),
  );
}

function normalizePresentationValue(
  value: unknown,
  label: string,
): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ReelError(`${label} must be a positive safe integer or null.`);
  }
  return value;
}

function parseVisibleSymbols(
  value: readonly number[] | undefined,
  expectedLength: number,
  label: string,
): readonly number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new ReelError(`${label} length must be ${expectedLength}.`);
  }
  return Object.freeze(
    value.map((code, index) => {
      if (!Number.isInteger(code) || code < -1) {
        throw new ReelError(
          `${label}[${index}] must be -1 or a non-negative integer.`,
        );
      }
      return code;
    }),
  );
}

function parseVisibleStates(
  value: readonly SymbolStateId[] | undefined,
  expectedLength: number,
  label: string,
): readonly SymbolStateId[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== expectedLength)
    throw new ReelError(`${label} length must be ${expectedLength}.`);
  return Object.freeze(
    value.map((state, index) => {
      if (typeof state !== "string" || state.length === 0)
        throw new ReelError(`${label}[${index}] must be a non-empty string.`);
      return state;
    }),
  );
}

function validateEmptyEndpoints(
  symbols: readonly number[] | undefined,
  values: readonly (number | null)[] | undefined,
  states: readonly SymbolStateId[] | undefined,
  label: string,
): void {
  symbols?.forEach((code, index) => {
    if (code !== -1) return;
    if (values?.[index] !== undefined && values[index] !== null)
      throw new ReelError(
        `${label}[${index}] empty symbol must have a null presentation value.`,
      );
    if (states?.[index] !== undefined)
      throw new ReelError(
        `${label}[${index}] empty symbol cannot have a landing state.`,
      );
  });
}

function easeSpinTravel(progress: number): number {
  if (progress < 0.16) {
    return 0.16 * easeInCubic(progress / 0.16);
  }

  if (progress < 0.78) {
    return 0.16 + (progress - 0.16);
  }

  const settledProgress = (progress - 0.78) / 0.22;
  return 0.78 + 0.22 * easeOutCubic(settledProgress);
}

function easeContinuousSettle(progress: number, initialSlope: number): number {
  const linearEnd = 0.8;
  if (progress <= linearEnd) return progress * initialSlope;
  const linearValue = linearEnd * initialSlope;
  const remainingValue = 1 - linearValue;
  const local = (progress - linearEnd) / (1 - linearEnd);
  const localInitialSlope = (initialSlope * (1 - linearEnd)) / remainingValue;
  // Cubic Hermite reaches the exact endpoint with zero final velocity. The
  // leading linear segment uses the incoming continuous velocity exactly, so
  // the response boundary neither jumps nor changes speed.
  const settled =
    (-2 + localInitialSlope) * local ** 3 +
    (3 - 2 * localInitialSlope) * local ** 2 +
    localInitialSlope * local;
  return linearValue + remainingValue * settled;
}

function easeInCubic(progress: number): number {
  return progress * progress * progress;
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function calculateBounceOffset(
  progress: number,
  cellHeight: number,
  bounceStrength: number,
): number {
  if (bounceStrength === 0) return 0;
  if (progress < 0.1) {
    return (
      -Math.sin(Math.PI * (progress / 0.1)) * cellHeight * 0.08 * bounceStrength
    );
  }
  if (progress > 0.9) {
    return (
      Math.sin(Math.PI * ((progress - 0.9) / 0.1)) *
      cellHeight *
      0.1 *
      bounceStrength
    );
  }
  return 0;
}

function createReelClipMask(layout: ReelLayout): Graphics {
  const mask = new Graphics();
  for (let visibleY = 0; visibleY < layout.visibleRows; visibleY += 1) {
    mask.rect(
      0,
      layout.getCellY(visibleY),
      layout.cellWidth,
      layout.cellHeight,
    );
  }
  return mask.fill({ color: 0xffffff, alpha: 1 });
}

function calculateSlotCount(layout: ReelLayout): number {
  return layout.visibleRows + layout.bufferRowsBefore + layout.bufferRowsAfter;
}

function createBrightnessTint(brightness: number): number {
  const channel = Math.round(brightness * 255);
  return (channel << 16) | (channel << 8) | channel;
}

function normalizeNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ReelError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function normalizeNonNegativeFiniteNumber(
  value: number,
  label: string,
): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ReelError(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function normalizePositiveFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ReelError(`${label} must be a positive finite number.`);
  }
  return value;
}

function normalizePositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ReelError(`${label} must be a positive safe integer.`);
  }
  return value;
}

function normalizeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new ReelError(`${label} must be a safe integer.`);
  }
  return value;
}
