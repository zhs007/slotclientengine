import type { RenderNode, SymbolStateId } from "../symbol/index.js";
import type { SymbolArea } from "./symbol-area.js";
import type { ReelSpinDirection } from "./types.js";

export interface ReelRollTarget {
  readonly symbols: readonly number[];
  readonly values?: readonly (number | null)[];
  readonly states?: readonly SymbolStateId[];
}

export interface ReelRollOptions {
  readonly durationMs?: number;
  readonly minimumSpinCycles?: number;
  readonly speedSymbolsPerSecond?: number;
  readonly signal?: AbortSignal;
}

export interface ReelRollStartOptions {
  readonly speedSymbolsPerSecond?: number;
  readonly signal?: AbortSignal;
}

export interface ReelRender {
  add(node: RenderNode, order?: number): void;
  remove(node: RenderNode): void;
}

export interface ReelSpin extends SymbolArea {
  roll(
    x: number,
    target: ReelRollTarget,
    options?: ReelRollOptions,
  ): Promise<void>;
  start(x: number, options?: ReelRollStartOptions): void;
  settle(
    x: number,
    target: ReelRollTarget,
    options?: ReelRollOptions,
  ): Promise<void>;
  cancel(x: number): void;
  getReel(x: number): ReelRender;
}

export interface ReelSpinDefaults {
  readonly direction?: ReelSpinDirection;
  readonly durationMs?: number;
  readonly speedSymbolsPerSecond?: number;
  readonly minimumSpinCycles?: number;
}
