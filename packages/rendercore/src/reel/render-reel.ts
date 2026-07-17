import { Container, Graphics } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { createReelWindowSnapshot } from "./reel-window.js";
import {
  createTemporaryReelStrip,
  type TemporaryReelStrip,
} from "./spin-strip.js";
import type {
  ReelAxisSpinPlan,
  ReelLayout,
  ReelSymbolKind,
  ReelSymbolRegistry,
  RenderReelOptions,
  RenderReelPhase,
  RenderReelSpinOptions,
  RenderReelSlotSnapshot,
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
  ReelWindowSnapshot,
  RenderReelSnapshot,
  RenderReelUpdateResult,
  RenderReelVisibleOccurrence,
} from "./types.js";
import type { LogicReels } from "@slotclientengine/logiccore";
import type {
  RenderSymbol,
  SymbolStateId,
  SymbolStateTransitionMode,
} from "../symbol/index.js";

interface ReelSlot {
  readonly windowY: number;
  readonly renderOrder: number;
  readonly container: Container;
  code: number | null;
  kind: ReelSymbolKind | null;
  symbol: RenderSymbol | null;
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
  readonly #bounceStrength: number;
  readonly #slots: readonly ReelSlot[];
  readonly #clipMask: Graphics;
  #phase: RenderReelPhase = "idle";
  #plan: ReelAxisSpinPlan | null = null;
  #spinStrip: TemporaryReelStrip | null = null;
  #spinLocalY = 0;
  #elapsedMs = 0;
  #currentY = 0;
  #staticVisibleSymbols: readonly number[] | null = null;
  #targetVisibleSymbols: readonly number[] | null = null;
  #staticVisiblePresentationValues: readonly (number | null)[] | null = null;
  #targetVisiblePresentationValues: readonly (number | null)[] | null = null;
  #landed = false;

  constructor(options: RenderReelOptions) {
    super();
    this.#reels = options.reels;
    this.xIndex = options.x;
    this.layout = options.layout;
    this.#registry = options.registry;
    this.#symbolPool = options.symbolPool;
    this.#presentationValueResolver = options.presentationValueResolver;
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

    this.#plan = plan;
    this.#spinStrip = createTemporaryReelStrip({
      reels: this.#reels,
      x: this.xIndex,
      layout: this.layout,
      plan,
      currentVisibleSymbols: this.getVisibleScene(),
      currentVisiblePresentationValues: this.getVisiblePresentationValues(),
      targetVisibleSymbols,
      targetVisiblePresentationValues,
      presentationValueResolver: this.#presentationValueResolver,
    });
    this.#staticVisibleSymbols = null;
    this.#staticVisiblePresentationValues = null;
    this.#targetVisibleSymbols = targetVisibleSymbols ?? null;
    this.#targetVisiblePresentationValues =
      targetVisiblePresentationValues ?? null;
    this.#spinLocalY = 0;
    this.#elapsedMs = 0;
    this.#phase = "starting";
    this.#landed = false;
    this.syncClippingForPhase();
    this.renderAtY(this.#spinLocalY, "spinBlur");
  }

  update(deltaSeconds: number): RenderReelUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    const wasLanded = this.#landed;
    let landedThisUpdate = false;

    if (this.#plan && !this.#landed) {
      this.#elapsedMs = Math.min(
        this.#elapsedMs + deltaSeconds * 1000,
        this.#plan.durationMs,
      );
      const progress =
        this.#plan.durationMs === 0
          ? 1
          : this.#elapsedMs / this.#plan.durationMs;

      if (progress >= 1) {
        this.land();
        landedThisUpdate = true;
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

    return Object.freeze({
      phase: this.#phase,
      completed: this.#phase === "stopped",
      landed: !wasLanded && this.#landed,
    });
  }

  resetToY(y: number): void {
    this.#plan = null;
    this.#spinStrip = null;
    this.#spinLocalY = 0;
    this.#elapsedMs = 0;
    this.#currentY = y;
    this.#staticVisibleSymbols = null;
    this.#targetVisibleSymbols = null;
    this.#staticVisiblePresentationValues = null;
    this.#targetVisiblePresentationValues = null;
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
    this.#plan = null;
    this.#spinStrip = null;
    this.#spinLocalY = 0;
    this.#elapsedMs = 0;
    this.#currentY = y;
    this.#staticVisibleSymbols = parsedVisibleSymbols;
    this.#staticVisiblePresentationValues =
      parsedPresentationValues ??
      Object.freeze(
        parsedVisibleSymbols.map((code, windowY) =>
          this.resolvePresentationValue(y + windowY, code),
        ),
      );
    this.#targetVisibleSymbols = null;
    this.#targetVisiblePresentationValues = null;
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

  getSlotSnapshots(): readonly RenderReelSlotSnapshot[] {
    return Object.freeze(
      this.#slots.map((slot) => this.createSlotSnapshot(slot)),
    );
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
    slot.container.removeChild(slot.symbol);
    slot.code = null;
    slot.kind = null;
    slot.symbol = null;
    this.setStaticVisibleSlot(windowY, -1, null);
    return occurrence;
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
    slot.container.addChild(occurrence.symbol);
    occurrence.symbol.position.set(0);
    occurrence.symbol.visible = true;
    occurrence.symbol.renderable = true;
    occurrence.symbol.reset();
    this.setStaticVisibleSlot(
      windowY,
      occurrence.code,
      occurrence.presentationValue,
    );
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

    slot.symbol.requestState(state, transitionMode);
  }

  getVisibleSymbolStateSnapshot(
    windowY: number,
  ): RenderVisibleSymbolStateSnapshot {
    const slot = this.getVisibleSlot(windowY);
    const snapshot = this.createSlotSnapshot(slot);
    return Object.freeze({
      x: this.xIndex,
      y: windowY,
      code: snapshot.code,
      kind: snapshot.kind,
      requestedState: snapshot.requestedState,
      resolvedState: snapshot.resolvedState,
      isOnce: snapshot.isOnce,
    });
  }

  getVisibleSymbolGeometrySnapshot(
    windowY: number,
  ): RenderVisibleSymbolGeometrySnapshot {
    const slot = this.getVisibleSlot(windowY);
    const snapshot = this.createSlotSnapshot(slot);
    return Object.freeze({
      x: this.xIndex,
      y: windowY,
      code: snapshot.code,
      kind: snapshot.kind,
      centerX: this.x + this.layout.cellWidth / 2,
      centerY:
        this.y + this.layout.getCellY(windowY) + this.layout.cellHeight / 2,
      cellWidth: this.layout.cellWidth,
      cellHeight: this.layout.cellHeight,
    });
  }

  getSnapshot(): RenderReelSnapshot {
    return Object.freeze({
      x: this.xIndex,
      phase: this.#phase,
      currentY: this.#spinStrip ? this.#spinLocalY : this.#currentY,
      finalY: this.#plan?.finalY ?? null,
      startY: this.#plan?.startY ?? null,
      elapsedMs: this.#elapsedMs,
      visibleScene: this.getVisibleScene(),
    });
  }

  private createSlotSnapshot(slot: ReelSlot): RenderReelSlotSnapshot {
    const stateSnapshot = slot.symbol?.getStateSnapshot();
    return Object.freeze({
      windowY: slot.windowY,
      code: slot.code ?? -1,
      kind: slot.kind ?? "empty",
      symbol: slot.symbol,
      container: slot.container,
      requestedState: stateSnapshot?.requestedState ?? null,
      resolvedState: stateSnapshot?.resolvedState ?? null,
      isOnce: stateSnapshot?.isOnce ?? false,
      presentationValue: slot.symbol?.getPresentationValue() ?? null,
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

    const slot = this.#slots.find((candidate) => candidate.windowY === windowY);
    if (!slot) {
      throw new ReelError(
        `Missing visible reel slot for reel ${this.xIndex}, y ${windowY}.`,
      );
    }

    return slot;
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
      const renderOrder = this.#slotRenderOrderOffset + orderIndex;
      container.x = this.getSlotContainerX();
      container.y = this.getSlotContainerY(windowY, 0);
      container.zIndex = renderOrder;
      this.#slotParent.addChild(container);
      slots.push({
        windowY,
        renderOrder,
        container,
        code: null,
        kind: null,
        symbol: null,
      });
      orderIndex += 1;
    }
    return slots;
  }

  private renderAtY(y: number, state: SymbolStateId): void {
    const snapshot = this.createWindowSnapshot(y);

    for (const slotData of snapshot.slots) {
      const slot = this.#slots.find(
        (candidate) => candidate.windowY === slotData.windowY,
      );
      if (!slot) {
        throw new ReelError(
          `Missing reel slot for windowY ${slotData.windowY}.`,
        );
      }
      slot.container.x = this.getSlotContainerX();
      slot.container.y = this.getSlotContainerY(
        slotData.windowY,
        snapshot.pixelOffsetY,
      );
      slot.container.visible = this.shouldShowSlot(slotData.windowY);
      this.syncSlot(
        slot,
        slotData.code,
        this.getPresentationValue(slotData.symbolY, slotData.code, y),
      );
      slot.symbol?.requestState(state);
    }
  }

  private createWindowSnapshot(y: number): ReelWindowSnapshot {
    const spinStrip = this.#spinStrip;
    const staticVisibleSymbols = spinStrip ? null : this.#staticVisibleSymbols;
    const staticBaseY = Math.floor(y);

    return createReelWindowSnapshot({
      reels: this.#reels,
      x: this.xIndex,
      y,
      layout: this.layout,
      codeAt: spinStrip
        ? (symbolY) => spinStrip.get(symbolY)
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

  private syncSlot(
    slot: ReelSlot,
    code: number,
    presentationValue: number | null,
  ): void {
    if (slot.code === code) {
      slot.symbol?.setPresentationValue(presentationValue);
      this.syncSlotRenderOrder(slot);
      return;
    }

    if (slot.symbol && slot.code !== null && slot.kind !== "empty") {
      if (this.#symbolPool) {
        this.#symbolPool.release(slot.code, slot.symbol);
      } else {
        slot.symbol.destroy({ children: true });
      }
    } else {
      slot.symbol?.destroy({ children: true });
    }
    slot.container.removeChildren();
    slot.code = code;
    const entry = this.#registry.getEntryByCode(code);
    slot.kind = entry.kind;
    slot.symbol =
      entry.kind === "empty" ? null : this.acquireTexturedSymbol(code);
    if (slot.symbol) {
      slot.container.addChild(slot.symbol);
      slot.symbol.init();
      slot.symbol.setPresentationValue(presentationValue);
    }
    this.syncSlotRenderOrder(slot);
  }

  private syncSlotRenderOrder(slot: ReelSlot): void {
    const renderPriority = slot.symbol?.renderPriority ?? 0;
    slot.container.zIndex =
      renderPriority * this.#slotRenderOrderStride + slot.renderOrder;
  }

  private acquireTexturedSymbol(code: number): RenderSymbol {
    const symbol = this.#symbolPool
      ? this.#symbolPool.acquire(code, () =>
          this.#registry.createRenderSymbolByCode(code),
        )
      : this.#registry.createRenderSymbolByCode(code);
    if (!symbol) {
      throw new ReelError(`Textured symbol code ${code} created no symbol.`);
    }
    return symbol;
  }

  private updateVisibleSymbols(deltaSeconds: number): void {
    for (const slot of this.#slots) {
      slot.symbol?.update(deltaSeconds);
    }
  }

  private land(): void {
    const plan = this.#plan;
    if (!plan) {
      return;
    }

    this.#elapsedMs = plan.durationMs;
    this.#currentY = plan.finalY;
    this.#staticVisibleSymbols = this.#targetVisibleSymbols;
    this.#staticVisiblePresentationValues =
      this.#targetVisiblePresentationValues;
    this.#targetVisibleSymbols = null;
    this.#targetVisiblePresentationValues = null;
    this.#spinStrip = null;
    this.#spinLocalY = 0;
    this.#phase = "stopped";
    this.#landed = true;
    this.y = 0;
    this.syncClippingForPhase();
    this.renderAtY(plan.finalY, "normal");
  }

  private calculateSpinLocalY(progress: number): number {
    const plan = this.#plan;
    if (!plan) {
      return this.#spinLocalY;
    }

    const eased = easeSpinTravel(progress);
    return plan.direction === "forward"
      ? plan.travelSymbols * eased
      : -plan.travelSymbols * eased;
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
      if (!Number.isInteger(code) || code < 0) {
        throw new ReelError(
          `${label}[${index}] must be a non-negative integer.`,
        );
      }
      return code;
    }),
  );
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

function normalizePositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ReelError(`${label} must be a positive safe integer.`);
  }
  return value;
}
