import type { SymbolGroup, SymbolHandle } from "../symbol/index.js";
import { ReelError } from "./errors.js";
import type {
  CellRollOptions,
  CellRollStartOptions,
  CellRollTarget,
  CellSpin,
} from "./render-cell-spin.js";
import type {
  ReelRender,
  ReelRollOptions,
  ReelRollStartOptions,
  ReelRollTarget,
  ReelSpin,
} from "./reel-spin.js";
import type { SymbolPosition } from "./symbol-area.js";

export interface SpinningReel {
  readonly x: number;
  readonly overlay: ReelRender;
  land(target: ReelRollTarget, options?: ReelRollOptions): Promise<SymbolGroup>;
  cancel(): void;
}

export interface ReelSpinSession {
  readonly reels: readonly SpinningReel[];
  getReel(x: number): SpinningReel;
  getPendingReels(): readonly SpinningReel[];
  land(
    targets: readonly ReelRollTarget[],
    options?: ReelRollOptions,
  ): Promise<readonly SymbolGroup[]>;
  cancel(): void;
}

export interface ReelSpinSessionController {
  start(options?: {
    readonly columns?: readonly number[];
    readonly roll?: ReelRollStartOptions;
  }): ReelSpinSession;
  getActive(): ReelSpinSession | null;
}

export interface SpinningCell {
  readonly position: SymbolPosition;
  readonly overlay: ReturnType<CellSpin["getCell"]>;
  land(
    target: CellRollTarget,
    options?: CellRollOptions,
  ): Promise<SymbolHandle>;
  cancel(): void;
}

export interface CellSpinSession {
  readonly cells: readonly SpinningCell[];
  getCell(position: SymbolPosition): SpinningCell;
  getPendingCells(): readonly SpinningCell[];
  cancel(): void;
}

export interface CellSpinSessionController {
  start(
    positions: readonly SymbolPosition[],
    options?: CellRollStartOptions,
  ): CellSpinSession;
  getActive(): CellSpinSession | null;
}

export function createReelSpinSessionController(options: {
  readonly reels: ReelSpin;
  readonly columns: number;
  readonly rows: number;
  readonly beforeStart?: () => void;
}): ReelSpinSessionController {
  let active: ReelSpinSession | null = null;
  type StartInput = Parameters<ReelSpinSessionController["start"]>[0];
  return Object.freeze({
    start: (input: StartInput = {}) => {
      if (active) throw new ReelError("A reel spin session is already active.");
      options.beforeStart?.();
      const columns = normalizeColumns(input.columns, options.columns);
      const pending = new Map<number, SpinningReel>();
      let session!: ReelSpinSession;
      const started: number[] = [];
      try {
        for (const x of columns) {
          options.reels.start(x, input.roll);
          started.push(x);
          const spinning = Object.freeze({
            x,
            overlay: options.reels.getReel(x),
            land: async (
              target: ReelRollTarget,
              landOptions?: ReelRollOptions,
            ) => {
              if (active !== session || pending.get(x) !== spinning)
                throw new ReelError(`Spinning reel ${x} is stale.`);
              await options.reels.settle(x, target, landOptions);
              pending.delete(x);
              const symbols = options.reels.getSymbols(
                Array.from({ length: options.rows }, (_, y) => ({ x, y })),
              );
              if (pending.size === 0) active = null;
              return symbols;
            },
            cancel: () => {
              if (active !== session || !pending.delete(x)) return;
              options.reels.cancel(x);
              if (pending.size === 0) active = null;
            },
          }) satisfies SpinningReel;
          pending.set(x, spinning);
        }
      } catch (error) {
        for (const x of started.reverse()) options.reels.cancel(x);
        throw error;
      }
      const spinningReels = Object.freeze(columns.map((x) => pending.get(x)!));
      session = Object.freeze({
        reels: spinningReels,
        getReel: (x: number) => {
          const reel = pending.get(x);
          if (active !== session || !reel)
            throw new ReelError(`Spinning reel ${x} is not pending.`);
          return reel;
        },
        getPendingReels: () => Object.freeze([...pending.values()]),
        land: async (
          targets: readonly ReelRollTarget[],
          landOptions?: ReelRollOptions,
        ) => {
          if (targets.length !== options.columns)
            throw new ReelError(
              `Reel spin session target has ${targets.length} columns, expected ${options.columns}.`,
            );
          return Promise.all(
            spinningReels.map((reel) =>
              reel.land(targets[reel.x]!, landOptions),
            ),
          );
        },
        cancel: () => {
          if (active !== session) return;
          for (const reel of [...pending.values()]) reel.cancel();
        },
      });
      active = session;
      return session;
    },
    getActive: () => active,
  });
}

export function createCellSpinSessionController(
  cells: CellSpin,
): CellSpinSessionController {
  let active: CellSpinSession | null = null;
  return Object.freeze({
    start: (
      positions: readonly SymbolPosition[],
      options?: CellRollStartOptions,
    ) => {
      if (active) throw new ReelError("A cell spin session is already active.");
      const normalized = normalizePositions(positions);
      const pending = new Map<string, SpinningCell>();
      let session!: CellSpinSession;
      const started: SymbolPosition[] = [];
      try {
        for (const position of normalized) {
          cells.start(position, options);
          started.push(position);
          const key = keyOf(position);
          const spinning = Object.freeze({
            position,
            overlay: cells.getCell(position),
            land: async (
              target: CellRollTarget,
              landOptions?: CellRollOptions,
            ) => {
              if (active !== session || pending.get(key) !== spinning)
                throw new ReelError(`Spinning cell ${key} is stale.`);
              await cells.settle(position, target, landOptions);
              pending.delete(key);
              const symbol = cells.getSymbol(position);
              if (pending.size === 0) active = null;
              return symbol;
            },
            cancel: () => {
              if (active !== session || !pending.delete(key)) return;
              cells.cancel(position);
              if (pending.size === 0) active = null;
            },
          }) satisfies SpinningCell;
          pending.set(key, spinning);
        }
      } catch (error) {
        for (const position of started.reverse()) cells.cancel(position);
        throw error;
      }
      const spinningCells = Object.freeze(
        normalized.map((position) => pending.get(keyOf(position))!),
      );
      session = Object.freeze({
        cells: spinningCells,
        getCell: (position: SymbolPosition) => {
          const cell = pending.get(keyOf(position));
          if (active !== session || !cell)
            throw new ReelError(
              `Spinning cell ${keyOf(position)} is not pending.`,
            );
          return cell;
        },
        getPendingCells: () => Object.freeze([...pending.values()]),
        cancel: () => {
          if (active !== session) return;
          for (const cell of [...pending.values()]) cell.cancel();
        },
      });
      active = session;
      return session;
    },
    getActive: () => active,
  });
}

function normalizeColumns(
  columns: readonly number[] | undefined,
  count: number,
): readonly number[] {
  const result = columns
    ? [...columns]
    : Array.from({ length: count }, (_, x) => x);
  if (result.length === 0)
    throw new ReelError("Spin session must contain reels.");
  const seen = new Set<number>();
  for (const x of result) {
    if (!Number.isInteger(x) || x < 0 || x >= count)
      throw new ReelError(`Spin session reel ${x} is out of range.`);
    if (seen.has(x)) throw new ReelError(`Duplicate spin session reel ${x}.`);
    seen.add(x);
  }
  return Object.freeze(result);
}

function normalizePositions(
  positions: readonly SymbolPosition[],
): readonly SymbolPosition[] {
  if (positions.length === 0)
    throw new ReelError("Spin session must contain cells.");
  const seen = new Set<string>();
  return Object.freeze(
    positions.map((position) => {
      if (!Number.isInteger(position.x) || !Number.isInteger(position.y))
        throw new ReelError("Spin session cell coordinates must be integers.");
      const key = keyOf(position);
      if (seen.has(key))
        throw new ReelError(`Duplicate spin session cell ${key}.`);
      seen.add(key);
      return Object.freeze({ x: position.x, y: position.y });
    }),
  );
}

function keyOf(position: SymbolPosition): string {
  return `${position.x},${position.y}`;
}
