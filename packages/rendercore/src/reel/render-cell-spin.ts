import { Container } from "pixi.js";
import type { LogicReels } from "@slotclientengine/logiccore";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { type RenderNode, type SymbolStateId } from "../symbol/index.js";
import { getRenderNodeAdapter } from "../symbol/render-node.js";
import {
  createSymbolRender,
  type SymbolRender,
} from "../symbol/symbol-render.js";
import { ReelError } from "./errors.js";
import { createReelLayout } from "./layout.js";
import { RenderReel } from "./render-reel.js";
import { createRenderSymbolPool } from "./render-symbol-pool.js";
import type { SymbolArea, SymbolPosition } from "./symbol-area.js";
import type {
  ReelAxisSpinPlan,
  ReelSpinDirection,
  ReelSymbolRegistry,
  RenderReelUpdateResult,
  RenderReelVisibleOccurrence,
  RenderSymbolPool,
  RenderSymbolPoolOptions,
} from "./types.js";

export interface CellRollTarget {
  readonly code: number;
  readonly value?: number | null;
  readonly state?: SymbolStateId;
}

export interface CellRollOptions {
  readonly durationMs?: number;
  readonly minimumSpinCycles?: number;
  readonly signal?: AbortSignal;
}

export interface CellRollStartOptions {
  readonly speedSymbolsPerSecond?: number;
  readonly signal?: AbortSignal;
}

export interface CellRender {
  add(node: RenderNode, order?: number): void;
  remove(node: RenderNode): void;
}

export interface CellSpin extends SymbolArea {
  roll(
    position: SymbolPosition,
    target: CellRollTarget,
    options?: CellRollOptions,
  ): Promise<void>;
  start(position: SymbolPosition, options?: CellRollStartOptions): void;
  settle(
    position: SymbolPosition,
    target: CellRollTarget,
    options?: CellRollOptions,
  ): Promise<void>;
  cancel(position: SymbolPosition): void;
  getCell(position: SymbolPosition): CellRender;
  update(deltaSeconds: number): void;
  destroy(): void;
}

export interface RenderCellSpinOptions {
  readonly reels: LogicReels;
  readonly registry: ReelSymbolRegistry;
  /** X-first initial scene. Use an empty-symbol code for a refill hole. */
  readonly initialScene: readonly (readonly number[])[];
  readonly initialPresentationValues?: readonly (readonly (number | null)[])[];
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap?: number;
  readonly rowGap?: number;
  readonly direction?: ReelSpinDirection;
  readonly durationMs?: number;
  readonly speedSymbolsPerSecond?: number;
  readonly minimumSpinCycles?: number;
  readonly bounceStrength?: number;
  readonly symbolPool?: RenderSymbolPoolOptions;
}

interface RuntimeCell {
  readonly position: SymbolPosition;
  readonly root: Container;
  readonly attachmentLayer: Container;
  readonly reel: RenderReel;
  readonly mounted: Set<RenderNode>;
}

interface ActiveCell {
  readonly cell: RuntimeCell;
  readonly mode: "roll" | "continuous" | "settle";
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  readonly resolve?: () => void;
  readonly reject?: (error: Error) => void;
}

export class RenderCellSpin extends Container implements CellSpin {
  readonly #options: Required<
    Pick<
      RenderCellSpinOptions,
      | "direction"
      | "durationMs"
      | "speedSymbolsPerSecond"
      | "minimumSpinCycles"
      | "columnGap"
      | "rowGap"
    >
  > &
    RenderCellSpinOptions;
  readonly #pool: RenderSymbolPool | null;
  readonly #cells: readonly RuntimeCell[];
  readonly #active = new Map<string, ActiveCell>();
  readonly #occurrenceGenerations = new WeakMap<
    RenderReelVisibleOccurrence["symbol"],
    number
  >();
  #destroyed = false;

  constructor(options: RenderCellSpinOptions) {
    super();
    validateInitialScene(options);
    this.#options = {
      ...options,
      direction: options.direction ?? "forward",
      durationMs: normalizePositive(options.durationMs ?? 650, "durationMs"),
      speedSymbolsPerSecond: normalizePositive(
        options.speedSymbolsPerSecond ?? 18,
        "speedSymbolsPerSecond",
      ),
      minimumSpinCycles: normalizePositiveInteger(
        options.minimumSpinCycles ?? 2,
        "minimumSpinCycles",
      ),
      columnGap: normalizeNonNegative(options.columnGap ?? 0, "columnGap"),
      rowGap: normalizeNonNegative(options.rowGap ?? 0, "rowGap"),
    };
    this.#pool = createRenderSymbolPool(options.symbolPool);
    const cells: RuntimeCell[] = [];
    for (const [x, column] of options.initialScene.entries()) {
      for (const [y, code] of column.entries()) {
        const root = new Container();
        root.position.set(
          x * (options.cellWidth + this.#options.columnGap),
          y * (options.cellHeight + this.#options.rowGap),
        );
        const attachmentLayer = new Container();
        attachmentLayer.sortableChildren = true;
        const reel = new RenderReel({
          reels: options.reels,
          x,
          layout: createReelLayout({
            reelCount: options.reels.getReelCount(),
            visibleRows: 1,
            cellWidth: options.cellWidth,
            cellHeight: options.cellHeight,
          }),
          registry: options.registry,
          ...(this.#pool ? { symbolPool: this.#pool } : {}),
          ...(options.bounceStrength === undefined
            ? {}
            : { bounceStrength: options.bounceStrength }),
        });
        reel.x = 0;
        reel.resetToVisibleSymbols([code], 0, [
          options.initialPresentationValues?.[x]?.[y] ?? null,
        ]);
        root.addChild(reel, attachmentLayer);
        this.addChild(root);
        cells.push({
          position: Object.freeze({ x, y }),
          root,
          attachmentLayer,
          reel,
          mounted: new Set(),
        });
      }
    }
    this.#cells = Object.freeze(cells);
  }

  getSymbol(position: SymbolPosition): SymbolRender {
    const cell = this.getRuntimeCell(position);
    if (
      this.#active.has(keyOf(position)) ||
      cell.reel.getSnapshot().phase !== "stopped"
    )
      throw new ReelError(
        `Cannot get symbol at (${position.x},${position.y}) before the cell has landed.`,
      );
    const slot = cell.reel
      .getSlotSnapshots()
      .find((item) => item.windowY === 0);
    if (!slot?.symbol || slot.kind !== "textured")
      throw new ReelError(
        `Cannot get symbol for empty cell (${position.x},${position.y}).`,
      );
    const captured = slot.symbol;
    const generation = this.getOccurrenceGeneration(captured);
    const createOwnedSource = (occurrence: RenderReelVisibleOccurrence) => {
      let released = false;
      return {
        symbol: occurrence.symbol,
        owned: true,
        assertUsable: () => {
          if (released) throw new ReelError("Owned SymbolRender is stale.");
        },
        clone: () =>
          createOwnedSource(
            cell.reel.createDetachedOccurrence(
              occurrence.code,
              occurrence.symbol.getPresentationValue(),
            ),
          ),
        release: () => {
          if (released) return;
          released = true;
          cell.reel.releaseDetachedOccurrence(occurrence);
        },
      };
    };
    return createSymbolRender({
      symbol: captured,
      owned: false,
      assertUsable: () => {
        if (
          this.#destroyed ||
          this.#active.has(keyOf(position)) ||
          this.getOccurrenceGeneration(captured) !== generation ||
          cell.reel.getSlotSnapshots().find((item) => item.windowY === 0)
            ?.symbol !== captured
        )
          throw new ReelError("SymbolRender is stale.");
      },
      clone: () =>
        createOwnedSource(
          cell.reel.createDetachedOccurrence(
            captured.code,
            captured.getPresentationValue(),
          ),
        ),
    });
  }

  roll(
    position: SymbolPosition,
    target: CellRollTarget,
    options: CellRollOptions = {},
  ): Promise<void> {
    const cell = this.prepareCell(position, options.signal);
    const promise = this.createCompletion(cell, "roll", options.signal);
    try {
      this.bumpCellOccurrenceGeneration(cell);
      cell.reel.start(this.createAxisPlan(cell, options), {
        targetVisibleSymbols: [target.code],
        targetVisiblePresentationValues: [target.value ?? null],
        ...(target.state ? { targetVisibleStates: [target.state] } : {}),
      });
    } catch (error) {
      this.failActive(cell, toError(error));
    }
    return promise;
  }

  start(position: SymbolPosition, options: CellRollStartOptions = {}): void {
    const cell = this.prepareCell(position, options.signal);
    const active = this.createActive(cell, "continuous", options.signal);
    try {
      this.bumpCellOccurrenceGeneration(cell);
      cell.reel.startContinuous({
        direction: this.#options.direction,
        speedSymbolsPerSecond: normalizePositive(
          options.speedSymbolsPerSecond ?? this.#options.speedSymbolsPerSecond,
          "speedSymbolsPerSecond",
        ),
      });
    } catch (error) {
      this.detachActive(active);
      throw error;
    }
  }

  settle(
    position: SymbolPosition,
    target: CellRollTarget,
    options: CellRollOptions = {},
  ): Promise<void> {
    const cell = this.getRuntimeCell(position);
    const current = this.#active.get(keyOf(position));
    if (!current || current.mode !== "continuous")
      return Promise.reject(
        new ReelError(
          `Cannot settle cell (${position.x},${position.y}) without targetless rolling.`,
        ),
      );
    if (options.signal?.aborted)
      return Promise.reject(new ReelError("Cell settle was already aborted."));
    this.detachActive(current);
    const promise = this.createCompletion(cell, "settle", options.signal);
    try {
      cell.reel.settleContinuous(this.createAxisPlan(cell, options), {
        targetVisibleSymbols: [target.code],
        targetVisiblePresentationValues: [target.value ?? null],
        ...(target.state ? { targetVisibleStates: [target.state] } : {}),
      });
    } catch (error) {
      if (cell.reel.isContinuousSpinning()) cell.reel.cancelContinuous();
      this.failActive(cell, toError(error));
    }
    return promise;
  }

  cancel(position: SymbolPosition): void {
    const cell = this.getRuntimeCell(position);
    const active = this.#active.get(keyOf(position));
    if (!active) return;
    if (active.mode === "continuous") cell.reel.cancelContinuous();
    else
      cell.reel.resetToVisibleSymbols(
        cell.reel.getVisibleScene(),
        Math.floor(cell.reel.getSnapshot().currentY),
        cell.reel.getVisiblePresentationValues(),
      );
    this.failActive(
      cell,
      new ReelError(
        `Cell spin at (${position.x},${position.y}) was cancelled.`,
      ),
    );
  }

  getCell(position: SymbolPosition): CellRender {
    const cell = this.getRuntimeCell(position);
    return Object.freeze({
      add: (node: RenderNode, order = 0) => {
        this.assertAlive();
        if (!Number.isSafeInteger(order))
          throw new ReelError("Cell node order must be an integer.");
        if (cell.mounted.has(node))
          throw new ReelError("RenderNode is already attached to this cell.");
        const adapter = getRenderNodeAdapter(node);
        if (adapter.view.parent)
          throw new ReelError(
            "RenderNode is already attached to another parent.",
          );
        adapter.view.zIndex = order;
        cell.attachmentLayer.addChild(adapter.view);
        cell.mounted.add(node);
      },
      remove: (node: RenderNode) => {
        this.assertAlive();
        if (!cell.mounted.delete(node))
          throw new ReelError("RenderNode is not attached to this cell.");
        getRenderNodeAdapter(node).view.parent?.removeChild(
          getRenderNodeAdapter(node).view,
        );
      },
    });
  }

  update(deltaSeconds: number): void {
    this.assertAlive();
    assertValidDeltaSeconds(deltaSeconds);
    for (const cell of this.#cells) {
      const active = this.#active.get(keyOf(cell.position));
      let result: RenderReelUpdateResult;
      try {
        result = cell.reel.update(deltaSeconds);
      } catch (error) {
        if (active) this.failActive(cell, toError(error));
        throw error;
      }
      if (active && active.mode !== "continuous" && result.landed) {
        this.detachActive(active);
        active.resolve?.();
      }
    }
  }

  override destroy(): void {
    if (this.#destroyed) return;
    for (const active of [...this.#active.values()]) {
      this.detachActive(active);
      active.reject?.(new ReelError("CellSpin was destroyed."));
    }
    for (const cell of this.#cells) {
      for (const node of cell.mounted)
        getRenderNodeAdapter(node).view.parent?.removeChild(
          getRenderNodeAdapter(node).view,
        );
      cell.mounted.clear();
    }
    this.#destroyed = true;
    super.destroy({ children: true });
    this.#pool?.destroy();
  }

  private prepareCell(
    position: SymbolPosition,
    signal?: AbortSignal,
  ): RuntimeCell {
    this.assertAlive();
    const cell = this.getRuntimeCell(position);
    if (this.#active.has(keyOf(position)))
      throw new ReelError(
        `Cell (${position.x},${position.y}) already has an active spin.`,
      );
    if (signal?.aborted) throw new ReelError("Cell spin was already aborted.");
    return cell;
  }

  private createCompletion(
    cell: RuntimeCell,
    mode: "roll" | "settle",
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.createActive(cell, mode, signal, resolve, reject);
    });
  }

  private createActive(
    cell: RuntimeCell,
    mode: ActiveCell["mode"],
    signal?: AbortSignal,
    resolve?: () => void,
    reject?: (error: Error) => void,
  ): ActiveCell {
    let active!: ActiveCell;
    const abortListener = signal ? () => this.cancel(cell.position) : undefined;
    active = {
      cell,
      mode,
      ...(signal ? { signal } : {}),
      ...(abortListener ? { abortListener } : {}),
      ...(resolve ? { resolve } : {}),
      ...(reject ? { reject } : {}),
    };
    this.#active.set(keyOf(cell.position), active);
    signal?.addEventListener("abort", abortListener!, { once: true });
    return active;
  }

  private createAxisPlan(
    cell: RuntimeCell,
    options: CellRollOptions,
  ): ReelAxisSpinPlan {
    const snapshot = cell.reel.getSnapshot();
    const cycles = normalizePositiveInteger(
      options.minimumSpinCycles ?? this.#options.minimumSpinCycles,
      "minimumSpinCycles",
    );
    const travelSymbols =
      cycles * this.#options.reels.getLength(positionX(cell));
    const durationMs = normalizePositive(
      options.durationMs ?? this.#options.durationMs,
      "durationMs",
    );
    const startY = Math.floor(snapshot.currentY);
    return Object.freeze({
      x: positionX(cell),
      startY,
      finalY:
        startY +
        (this.#options.direction === "forward"
          ? travelSymbols
          : -travelSymbols),
      direction: this.#options.direction,
      travelSymbols,
      startDelayMs: 0,
      durationMs,
      stopAtMs: durationMs,
    });
  }

  private failActive(cell: RuntimeCell, error: Error): void {
    const active = this.#active.get(keyOf(cell.position));
    if (!active) return;
    this.detachActive(active);
    active.reject?.(error);
  }

  private detachActive(active: ActiveCell): void {
    this.#active.delete(keyOf(active.cell.position));
    if (active.signal && active.abortListener)
      active.signal.removeEventListener("abort", active.abortListener);
  }

  private getRuntimeCell(position: SymbolPosition): RuntimeCell {
    this.assertAlive();
    if (!Number.isInteger(position.x) || !Number.isInteger(position.y))
      throw new ReelError("Cell position coordinates must be integers.");
    const cell = this.#cells.find(
      (candidate) =>
        candidate.position.x === position.x &&
        candidate.position.y === position.y,
    );
    if (!cell)
      throw new ReelError(
        `Cell position (${position.x},${position.y}) is out of range.`,
      );
    return cell;
  }

  private assertAlive(): void {
    if (this.#destroyed) throw new ReelError("CellSpin was destroyed.");
  }

  private getOccurrenceGeneration(
    symbol: RenderReelVisibleOccurrence["symbol"],
  ): number {
    return this.#occurrenceGenerations.get(symbol) ?? 0;
  }

  private bumpCellOccurrenceGeneration(cell: RuntimeCell): void {
    const symbol = cell.reel
      .getSlotSnapshots()
      .find((slot) => slot.windowY === 0)?.symbol;
    if (!symbol) return;
    this.#occurrenceGenerations.set(
      symbol,
      this.getOccurrenceGeneration(symbol) + 1,
    );
  }
}

export function createRenderCellSpin(
  options: RenderCellSpinOptions,
): RenderCellSpin {
  return new RenderCellSpin(options);
}

function keyOf(position: SymbolPosition): string {
  return `${position.x},${position.y}`;
}

function positionX(cell: RuntimeCell): number {
  return cell.position.x;
}

function validateInitialScene(options: RenderCellSpinOptions): void {
  if (options.initialScene.length !== options.reels.getReelCount())
    throw new ReelError(
      "CellSpin initialScene columns must match the public reel count.",
    );
  const rows = options.initialScene[0]?.length ?? 0;
  if (
    rows === 0 ||
    options.initialScene.some((column) => column.length !== rows)
  )
    throw new ReelError("CellSpin initialScene must be a non-empty rectangle.");
  if (
    options.initialPresentationValues &&
    (options.initialPresentationValues.length !== options.initialScene.length ||
      options.initialPresentationValues.some(
        (column) => column.length !== rows,
      ))
  )
    throw new ReelError(
      "CellSpin initialPresentationValues must match initialScene.",
    );
}

function normalizePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new ReelError(`${name} must be finite and positive.`);
  return value;
}

function normalizeNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new ReelError(`${name} must be finite and non-negative.`);
  return value;
}

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new ReelError(`${name} must be a positive safe integer.`);
  return value;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new ReelError(String(value));
}
