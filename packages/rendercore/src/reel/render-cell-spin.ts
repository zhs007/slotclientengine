import { Container } from "pixi.js";
import type { LogicReels } from "@slotclientengine/logiccore";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import type { RenderObject } from "../presentation/render-object.js";
import type { SymbolStateId } from "../symbol/index.js";
import { getRenderObjectAdapter } from "../presentation/render-object.js";
import { createContainerRenderAnchor } from "../presentation/render-anchor.js";
import {
  createEmptySymbolRender,
  createSymbolRender,
  type SymbolRender,
} from "../symbol/symbol-render.js";
import { createSymbolGroup } from "../symbol/symbol-group.js";
import { ReelError } from "./errors.js";
import { createReelLayout } from "./layout.js";
import { RenderReel } from "./render-reel.js";
import { createRenderSymbolPool } from "./render-symbol-pool.js";
import type {
  SymbolArea,
  SymbolPosition,
  SymbolReplacement,
  SymbolReplacementTarget,
} from "./symbol-area.js";
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
  /** Integer local public-strip phase applied atomically when this cell starts. */
  readonly localPhaseY?: number;
  readonly signal?: AbortSignal;
}

export interface CellRender {
  add(node: RenderObject, order?: number): void;
  remove(node: RenderObject): void;
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
  transferSymbols(input: CellSymbolTransferInput): Promise<void>;
  dropOccurrences(input: CellOccurrenceDropInput): Promise<void>;
  update(deltaSeconds: number): void;
  destroy(): void;
}

export interface CellSymbolTransfer {
  readonly source: SymbolPosition;
  readonly target: SymbolPosition;
  /** `null` leaves a hole at source. */
  readonly sourceReplacement: CellRollTarget | null;
}

export interface CellSymbolTransferInput {
  readonly transfers: readonly CellSymbolTransfer[];
  readonly durationMs: number;
  readonly signal?: AbortSignal;
}

export type CellOccurrenceDropMovement =
  | {
      readonly kind: "existing";
      readonly source: SymbolPosition;
      readonly target: SymbolPosition;
      readonly startSeconds?: number;
      readonly durationSeconds: number;
    }
  | {
      readonly kind: "refill";
      readonly target: SymbolPosition;
      readonly symbol: CellRollTarget;
      readonly startSeconds?: number;
      readonly durationSeconds: number;
    };

export interface CellOccurrenceDropInput {
  readonly movements: readonly CellOccurrenceDropMovement[];
  readonly values?: readonly {
    readonly position: SymbolPosition;
    readonly value: number | null;
  }[];
  readonly signal?: AbortSignal;
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
  readonly mounted: Set<RenderObject>;
}

interface ActiveCell {
  readonly cell: RuntimeCell;
  readonly mode: "roll" | "continuous" | "settle";
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  readonly resolve?: () => void;
  readonly reject?: (error: Error) => void;
}

interface CellMotionItem {
  readonly occurrence: RenderReelVisibleOccurrence;
  readonly source: RuntimeCell | null;
  readonly target: RuntimeCell;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

interface ActiveCellMotion {
  readonly items: readonly CellMotionItem[];
  readonly totalSeconds: number;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  readonly commit: () => void;
  readonly rollback: () => void;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  elapsedSeconds: number;
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
  readonly #motionLayer = new Container();
  #activeMotion: ActiveCellMotion | null = null;
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
    this.#motionLayer.sortableChildren = true;
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
    this.addChild(this.#motionLayer);
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
    if (!slot)
      throw new ReelError(`Cannot resolve cell (${position.x},${position.y}).`);
    const getPosition = () => ({
      x: cell.root.x + cell.reel.layout.cellWidth / 2,
      y: cell.root.y + cell.reel.layout.cellHeight / 2,
    });
    if (slot.code === -1) {
      const capturedContainer = slot.container;
      const capturedLayer = slot.emptySymbolLayer;
      return createEmptySymbolRender({
        view: capturedLayer,
        owned: false,
        assertUsable: () => {
          const current = cell.reel
            .getSlotSnapshots()
            .find((item) => item.windowY === 0);
          if (
            this.#destroyed ||
            this.#active.has(keyOf(position)) ||
            current?.container !== capturedContainer ||
            current.emptySymbolLayer !== capturedLayer ||
            current.code !== -1
          )
            throw new ReelError("SymbolRender is stale.");
        },
        getPosition,
        getAnchor: () =>
          createContainerRenderAnchor(this, () => {
            const current = cell.reel
              .getSlotSnapshots()
              .find((item) => item.windowY === 0);
            if (
              this.#destroyed ||
              this.#active.has(keyOf(position)) ||
              current?.container !== capturedContainer ||
              current.emptySymbolLayer !== capturedLayer ||
              current.code !== -1
            )
              throw new ReelError("SymbolRender is stale.");
            return getPosition();
          }),
      });
    }
    if (!slot.symbol || slot.kind === "empty")
      throw new ReelError(
        `Configured symbol code ${slot.code} at cell (${position.x},${position.y}) has no renderable occurrence.`,
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
      getPosition,
      getAnchor: () =>
        createContainerRenderAnchor(this, () => {
          if (
            this.#destroyed ||
            this.#active.has(keyOf(position)) ||
            this.getOccurrenceGeneration(captured) !== generation
          )
            throw new ReelError("SymbolRender is stale.");
          return {
            x: cell.root.x + cell.reel.layout.cellWidth / 2,
            y: cell.root.y + cell.reel.layout.cellHeight / 2,
          };
        }),
    });
  }

  getSymbols(positions: readonly SymbolPosition[]) {
    const keys = new Set<string>();
    const symbols = positions.map((position) => {
      const key = keyOf(position);
      if (keys.has(key))
        throw new ReelError(`Duplicate SymbolGroup position (${key}).`);
      keys.add(key);
      return this.getSymbol(position);
    });
    return createSymbolGroup(symbols, {
      getCellRect: (index) => {
        const point = symbols[index]!.getPosition();
        return Object.freeze({
          x: point.x - this.#options.cellWidth / 2,
          y: point.y - this.#options.cellHeight / 2,
          width: this.#options.cellWidth,
          height: this.#options.cellHeight,
        });
      },
    });
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
    const prepared: Array<{
      readonly cell: RuntimeCell;
      readonly previousSymbol: RenderReelVisibleOccurrence["symbol"] | null;
      readonly previousCode: number;
      readonly output: RenderReelVisibleOccurrence | null;
    }> = [];
    try {
      for (const { position, target } of replacements) {
        const key = keyOf(position);
        if (keys.has(key))
          throw new ReelError(
            `Duplicate symbol replacement position (${key}).`,
          );
        keys.add(key);
        const cell = this.getRuntimeCell(position);
        if (
          this.#active.has(key) ||
          cell.reel.getSnapshot().phase !== "stopped"
        )
          throw new ReelError(
            `Cannot replace symbol at (${position.x},${position.y}) before the cell has landed.`,
          );
        const previous = cell.reel
          .getSlotSnapshots()
          .find((slot) => slot.windowY === 0);
        if (!previous)
          throw new ReelError(
            `Cannot resolve cell (${position.x},${position.y}).`,
          );
        if (target.code === -1 && (target.value ?? null) !== null)
          throw new ReelError(
            "Empty symbol replacement must have a null presentation value.",
          );
        prepared.push({
          cell,
          previousSymbol: previous.symbol,
          previousCode: previous.code,
          output:
            target.code === -1
              ? null
              : cell.reel.createDetachedOccurrence(
                  target.code,
                  target.value ?? null,
                ),
        });
      }
    } catch (error) {
      for (const item of prepared)
        if (item.output) item.cell.reel.releaseDetachedOccurrence(item.output);
      throw error;
    }
    for (const item of prepared) {
      const current = item.cell.reel
        .getSlotSnapshots()
        .find((slot) => slot.windowY === 0);
      if (
        current?.symbol !== item.previousSymbol ||
        current.code !== item.previousCode
      ) {
        for (const candidate of prepared)
          if (candidate.output)
            candidate.cell.reel.releaseDetachedOccurrence(candidate.output);
        throw new ReelError("Cell symbol replacement ownership changed.");
      }
    }
    for (const item of prepared) {
      const previous = item.previousSymbol
        ? item.cell.reel.takeVisibleOccurrence()
        : null;
      if (!previous) item.cell.reel.openVisibleEmptySlot();
      if (item.output) item.cell.reel.placeVisibleOccurrence(item.output);
      else item.cell.reel.placeVisibleEmptySlot();
      if (previous) {
        this.bumpOccurrenceGeneration(previous.symbol);
        item.cell.reel.releaseDetachedOccurrence(previous);
      }
    }
    return this.getSymbols(replacements.map(({ position }) => position));
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
        ...(options.localPhaseY === undefined
          ? {}
          : { localPhaseY: options.localPhaseY }),
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
      add: (node: RenderObject, order = 0) => {
        this.assertAlive();
        if (!Number.isSafeInteger(order))
          throw new ReelError("Cell node order must be an integer.");
        if (cell.mounted.has(node))
          throw new ReelError("RenderObject is already attached to this cell.");
        const adapter = getRenderObjectAdapter(node);
        if (adapter.view.parent)
          throw new ReelError(
            "RenderObject is already attached to another parent.",
          );
        adapter.view.zIndex = order;
        cell.attachmentLayer.addChild(adapter.view);
        cell.mounted.add(node);
      },
      remove: (node: RenderObject) => {
        this.assertAlive();
        if (!cell.mounted.delete(node))
          throw new ReelError("RenderObject is not attached to this cell.");
        getRenderObjectAdapter(node).view.parent?.removeChild(
          getRenderObjectAdapter(node).view,
        );
      },
    });
  }

  transferSymbols(input: CellSymbolTransferInput): Promise<void> {
    if (!Number.isFinite(input.durationMs) || input.durationMs <= 0)
      return Promise.reject(
        new ReelError("Cell transfer durationMs must be finite and positive."),
      );
    const used = new Set<string>();
    const replacements: Array<{
      readonly cell: RuntimeCell;
      readonly occurrence: RenderReelVisibleOccurrence | null;
    }> = [];
    let items: CellMotionItem[] = [];
    try {
      this.assertCanStartMotion(input.signal);
      if (input.transfers.length === 0)
        throw new ReelError("Cell transfer must contain transfers.");
      const validated = input.transfers.map((transfer, index) => {
        const source = this.getRuntimeCell(transfer.source);
        const target = this.getRuntimeCell(transfer.target);
        const sourceKey = keyOf(transfer.source);
        const targetKey = keyOf(transfer.target);
        if (sourceKey === targetKey)
          throw new ReelError(
            `Cell transfer[${index}] source and target must differ.`,
          );
        if (used.has(sourceKey) || used.has(targetKey))
          throw new ReelError(`Cell transfer[${index}] positions collide.`);
        used.add(sourceKey);
        used.add(targetKey);
        this.getSymbol(transfer.source);
        this.getSymbol(transfer.target);
        const replacement = transfer.sourceReplacement
          ? source.reel.createDetachedOccurrence(
              transfer.sourceReplacement.code,
              transfer.sourceReplacement.value ?? null,
            )
          : null;
        replacements.push({ cell: source, occurrence: replacement });
        return { transfer, source, target };
      });
      for (const { source, target } of validated) {
        const occurrence = source.reel.takeVisibleOccurrence();
        const from = cellCenter(source, this.#options);
        const to = cellCenter(target, this.#options);
        this.#motionLayer.addChild(occurrence.symbol);
        occurrence.symbol.position.set(from.x, from.y);
        items.push({
          occurrence,
          source,
          target,
          startSeconds: 0,
          durationSeconds: input.durationMs / 1000,
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
        });
      }
    } catch (error) {
      for (const item of items) {
        item.occurrence.symbol.parent?.removeChild(item.occurrence.symbol);
        item.source!.reel.placeVisibleOccurrence(item.occurrence);
      }
      for (const replacement of replacements)
        if (replacement.occurrence)
          replacement.cell.reel.releaseDetachedOccurrence(
            replacement.occurrence,
          );
      return Promise.reject(error);
    }
    return this.startMotion(
      items,
      input.signal,
      () => {
        for (const [index, item] of items.entries()) {
          const overwritten = item.target.reel.takeVisibleOccurrence();
          item.occurrence.symbol.parent?.removeChild(item.occurrence.symbol);
          item.target.reel.placeVisibleOccurrence(item.occurrence);
          const replacement = replacements[index]!.occurrence;
          if (replacement)
            item.source!.reel.placeVisibleOccurrence(replacement);
          this.bumpOccurrenceGeneration(overwritten.symbol);
          item.target.reel.releaseDetachedOccurrence(overwritten);
        }
      },
      () => {
        for (const item of items) {
          item.occurrence.symbol.parent?.removeChild(item.occurrence.symbol);
          item.source!.reel.placeVisibleOccurrence(item.occurrence);
        }
        for (const replacement of replacements)
          if (replacement.occurrence)
            replacement.cell.reel.releaseDetachedOccurrence(
              replacement.occurrence,
            );
      },
    );
  }

  dropOccurrences(input: CellOccurrenceDropInput): Promise<void> {
    let items: CellMotionItem[] = [];
    const targetKeys = new Set<string>();
    const sourceKeys = new Set<string>();
    try {
      this.assertCanStartMotion(input.signal);
      if (input.movements.length === 0)
        throw new ReelError("Cell occurrence drop must contain movements.");
      const validated = input.movements.map((movement, index) => {
        const target = this.getRuntimeCell(movement.target);
        const targetKey = keyOf(movement.target);
        if (targetKeys.has(targetKey))
          throw new ReelError(`Cell drop[${index}] has a duplicate target.`);
        targetKeys.add(targetKey);
        const durationSeconds = normalizePositive(
          movement.durationSeconds,
          `drop[${index}].durationSeconds`,
        );
        const startSeconds = normalizeNonNegative(
          movement.startSeconds ?? 0,
          `drop[${index}].startSeconds`,
        );
        const source =
          movement.kind === "existing"
            ? this.getRuntimeCell(movement.source)
            : null;
        if (source) {
          const sourceKey = keyOf(source.position);
          if (sourceKeys.has(sourceKey))
            throw new ReelError(`Cell drop[${index}] has a duplicate source.`);
          sourceKeys.add(sourceKey);
          this.getSymbol(source.position);
        }
        return {
          movement,
          source,
          target,
          targetKey,
          startSeconds,
          durationSeconds,
        };
      });
      for (const [index, entry] of validated.entries()) {
        const targetSlot = entry.target.reel
          .getSlotSnapshots()
          .find((slot) => slot.windowY === 0);
        if (targetSlot?.kind !== "empty" && !sourceKeys.has(entry.targetKey))
          throw new ReelError(
            `Cell drop[${index}] target must be -1 or another movement source.`,
          );
      }
      for (const [index, commit] of (input.values ?? []).entries()) {
        this.getRuntimeCell(commit.position);
        if (
          commit.value !== null &&
          (!Number.isSafeInteger(commit.value) || commit.value <= 0)
        )
          throw new ReelError(
            `Cell drop value[${index}] must be a positive safe integer or null.`,
          );
      }
      for (const entry of validated) {
        const { movement, source, target, startSeconds, durationSeconds } =
          entry;
        const occurrence =
          movement.kind === "existing"
            ? source!.reel.takeVisibleOccurrence()
            : target.reel.createDetachedOccurrence(
                movement.symbol.code,
                movement.symbol.value ?? null,
              );
        const to = cellCenter(target, this.#options);
        const from = source
          ? cellCenter(source, this.#options)
          : { x: to.x, y: to.y - this.#options.cellHeight };
        this.#motionLayer.addChild(occurrence.symbol);
        occurrence.symbol.position.set(from.x, from.y);
        items.push({
          occurrence,
          source,
          target,
          startSeconds,
          durationSeconds,
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
        });
      }
    } catch (error) {
      this.rollbackPreparedMotion(items);
      return Promise.reject(error);
    }
    return this.startMotion(
      items,
      input.signal,
      () => {
        for (const item of items) {
          item.occurrence.symbol.parent?.removeChild(item.occurrence.symbol);
          const targetSlot = item.target.reel
            .getSlotSnapshots()
            .find((slot) => slot.windowY === 0);
          if (targetSlot?.kind === "empty")
            item.target.reel.openVisibleEmptySlot();
          item.target.reel.placeVisibleOccurrence(item.occurrence);
        }
        for (const commit of input.values ?? [])
          this.getRuntimeCell(
            commit.position,
          ).reel.setVisibleSymbolPresentationValue(0, commit.value);
      },
      () => this.rollbackPreparedMotion(items),
    );
  }

  update(deltaSeconds: number): void {
    this.assertAlive();
    assertValidDeltaSeconds(deltaSeconds);
    this.updateMotion(deltaSeconds);
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
    this.cancelMotion(new ReelError("Cell occurrence motion was destroyed."));
    for (const active of [...this.#active.values()]) {
      this.detachActive(active);
      active.reject?.(new ReelError("CellSpin was destroyed."));
    }
    for (const cell of this.#cells) {
      for (const node of cell.mounted)
        getRenderObjectAdapter(node).view.parent?.removeChild(
          getRenderObjectAdapter(node).view,
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
    if (this.#activeMotion)
      throw new ReelError(
        "Cannot spin a cell while occurrence motion is active.",
      );
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

  private assertCanStartMotion(signal?: AbortSignal): void {
    this.assertAlive();
    if (this.#activeMotion)
      throw new ReelError("A cell occurrence motion is already active.");
    if (this.#active.size > 0)
      throw new ReelError("Cannot move occurrences while cells are spinning.");
    if (signal?.aborted)
      throw new ReelError("Cell occurrence motion was already aborted.");
  }

  private startMotion(
    items: readonly CellMotionItem[],
    signal: AbortSignal | undefined,
    commit: () => void,
    rollback: () => void,
  ): Promise<void> {
    const totalSeconds = items.reduce(
      (maximum, item) =>
        Math.max(maximum, item.startSeconds + item.durationSeconds),
      0,
    );
    return new Promise<void>((resolve, reject) => {
      const active: ActiveCellMotion = {
        items: Object.freeze([...items]),
        totalSeconds,
        ...(signal ? { signal } : {}),
        commit,
        rollback,
        resolve,
        reject,
        elapsedSeconds: 0,
      };
      if (signal) {
        const abortListener = (): void =>
          this.cancelMotion(
            new ReelError("Cell occurrence motion was aborted."),
          );
        (active as { abortListener?: () => void }).abortListener =
          abortListener;
        signal.addEventListener("abort", abortListener, { once: true });
      }
      this.#activeMotion = active;
    });
  }

  private updateMotion(deltaSeconds: number): void {
    const active = this.#activeMotion;
    if (!active) return;
    active.elapsedSeconds = Math.min(
      active.elapsedSeconds + deltaSeconds,
      active.totalSeconds,
    );
    for (const item of active.items) {
      item.occurrence.symbol.update(deltaSeconds);
      const progress = Math.max(
        0,
        Math.min(
          1,
          (active.elapsedSeconds - item.startSeconds) / item.durationSeconds,
        ),
      );
      const eased = 1 - Math.pow(1 - progress, 3);
      item.occurrence.symbol.position.set(
        item.fromX + (item.toX - item.fromX) * eased,
        item.fromY + (item.toY - item.fromY) * eased,
      );
    }
    if (active.elapsedSeconds < active.totalSeconds) return;
    try {
      active.commit();
      active.signal?.removeEventListener("abort", active.abortListener!);
      this.#activeMotion = null;
      active.resolve();
    } catch (error) {
      this.cancelMotion(toError(error));
    }
  }

  private cancelMotion(error: Error): void {
    const active = this.#activeMotion;
    if (!active) return;
    this.#activeMotion = null;
    active.signal?.removeEventListener("abort", active.abortListener!);
    try {
      active.rollback();
    } catch {
      // Preserve the original motion failure after best-effort ownership restore.
    }
    active.reject(error);
  }

  private rollbackPreparedMotion(items: readonly CellMotionItem[]): void {
    for (const item of items) {
      item.occurrence.symbol.parent?.removeChild(item.occurrence.symbol);
      if (item.source) item.source.reel.placeVisibleOccurrence(item.occurrence);
      else item.target.reel.releaseDetachedOccurrence(item.occurrence);
    }
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
    this.bumpOccurrenceGeneration(symbol);
  }

  private bumpOccurrenceGeneration(
    symbol: RenderReelVisibleOccurrence["symbol"],
  ): void {
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

function cellCenter(
  cell: RuntimeCell,
  options: Pick<RenderCellSpinOptions, "cellWidth" | "cellHeight">,
): { readonly x: number; readonly y: number } {
  return {
    x: cell.root.x + options.cellWidth / 2,
    y: cell.root.y + options.cellHeight / 2,
  };
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
  for (const [x, column] of options.initialScene.entries()) {
    for (const [y, code] of column.entries()) {
      if (!Number.isSafeInteger(code) || code < -1)
        throw new ReelError(
          `CellSpin initialScene[${x}][${y}] must be -1 or a non-negative safe integer.`,
        );
      const value = options.initialPresentationValues?.[x]?.[y] ?? null;
      if (code === -1 && value !== null)
        throw new ReelError(
          `CellSpin hole (${x},${y}) must have null presentation value.`,
        );
    }
  }
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
