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
  ReelWindowSnapshot,
  RenderReelSnapshot,
  RenderReelUpdateResult,
} from "./types.js";
import type { LogicReels } from "@slotclientengine/logiccore";
import type { RenderSymbol, SymbolStateId } from "../symbol/index.js";

interface ReelSlot {
  readonly windowY: number;
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
  #landed = false;

  constructor(options: RenderReelOptions) {
    super();
    this.#reels = options.reels;
    this.xIndex = options.x;
    this.layout = options.layout;
    this.#registry = options.registry;
    this.#clipMask = new Graphics()
      .rect(
        0,
        0,
        options.layout.cellWidth,
        options.layout.visibleRows * options.layout.cellHeight,
      )
      .fill({ color: 0xffffff, alpha: 1 });
    this.#clipMask.visible = false;
    this.#clipMask.renderable = false;
    this.#slots = Object.freeze(this.createSlots());
    this.x = options.layout.getReelX(options.x);
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

    this.#plan = plan;
    this.#spinStrip = createTemporaryReelStrip({
      reels: this.#reels,
      x: this.xIndex,
      layout: this.layout,
      plan,
      currentVisibleSymbols: this.getVisibleScene(),
      targetVisibleSymbols,
    });
    this.#staticVisibleSymbols = null;
    this.#targetVisibleSymbols = targetVisibleSymbols ?? null;
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
        this.y = calculateBounceOffset(progress, this.layout.cellHeight);
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
    this.#phase = "stopped";
    this.#landed = true;
    this.y = 0;
    this.syncClippingForPhase();
    this.renderAtY(y, "normal");
    this.updateVisibleSymbols(0);
  }

  resetToVisibleSymbols(visibleSymbols: readonly number[], y = 0): void {
    const parsedVisibleSymbols = parseVisibleSymbols(
      visibleSymbols,
      this.layout.visibleRows,
      "visibleSymbols",
    )!;
    this.#plan = null;
    this.#spinStrip = null;
    this.#spinLocalY = 0;
    this.#elapsedMs = 0;
    this.#currentY = y;
    this.#staticVisibleSymbols = parsedVisibleSymbols;
    this.#targetVisibleSymbols = null;
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

  getSlotSnapshots(): readonly RenderReelSlotSnapshot[] {
    return Object.freeze(
      this.#slots.map((slot) =>
        Object.freeze({
          code: slot.code ?? -1,
          kind: slot.kind ?? "empty",
          symbol: slot.symbol,
          container: slot.container,
          requestedState:
            slot.symbol?.getStateSnapshot().requestedState ?? null,
        }),
      ),
    );
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

  private createSlots(): ReelSlot[] {
    const slots: ReelSlot[] = [];
    for (
      let windowY = -this.layout.bufferRowsBefore;
      windowY < this.layout.visibleRows + this.layout.bufferRowsAfter;
      windowY += 1
    ) {
      const container = new Container();
      container.x = this.layout.cellWidth / 2;
      container.y = this.layout.getCellY(windowY) + this.layout.cellHeight / 2;
      this.addChild(container);
      slots.push({
        windowY,
        container,
        code: null,
        kind: null,
        symbol: null,
      });
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
      slot.container.y =
        this.layout.getCellY(slotData.windowY) +
        this.layout.cellHeight / 2 +
        snapshot.pixelOffsetY;
      slot.container.visible = this.shouldShowSlot(slotData.windowY);
      this.syncSlot(slot, slotData.code);
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

  private syncSlot(slot: ReelSlot, code: number): void {
    if (slot.code === code) {
      return;
    }

    slot.container.removeChildren();
    slot.code = code;
    const entry = this.#registry.getEntryByCode(code);
    slot.kind = entry.kind;
    slot.symbol = this.#registry.createRenderSymbolByCode(code);
    if (slot.symbol) {
      slot.container.addChild(slot.symbol);
      slot.symbol.init();
    }
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
    this.#targetVisibleSymbols = null;
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
      this.#clipMask.visible = false;
      this.#clipMask.renderable = false;
      this.#clipMask.includeInBuild = false;
      this.#clipMask.measurable = false;
      return;
    }

    this.mask = this.#clipMask;
    this.#clipMask.visible = true;
    this.#clipMask.renderable = true;
    this.#clipMask.includeInBuild = false;
    this.#clipMask.measurable = false;
  }

  private shouldShowSlot(windowY: number): boolean {
    if (this.#phase !== "stopped") {
      return true;
    }
    return windowY >= 0 && windowY < this.layout.visibleRows;
  }
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

function calculateBounceOffset(progress: number, cellHeight: number): number {
  if (progress < 0.1) {
    return -Math.sin(Math.PI * (progress / 0.1)) * cellHeight * 0.08;
  }
  if (progress > 0.9) {
    return Math.sin(Math.PI * ((progress - 0.9) / 0.1)) * cellHeight * 0.1;
  }
  return 0;
}
