import type { RenderNode } from "../symbol/index.js";
import type { ReelRollTarget, ReelSpin } from "./reel-spin.js";
import type { SymbolArea } from "./symbol-area.js";

export type SymbolAreaLayerId = "bottom" | "top" | "win";

export interface SymbolAreaLayer {
  add(node: RenderNode, order?: number): void;
  remove(node: RenderNode): void;
}

export interface SymbolAreaPresentationContext {
  delay(seconds: number): Promise<void>;
}

export interface AreaSpinTarget {
  readonly scene: readonly (readonly number[])[];
  readonly values?: readonly (readonly (number | null)[])[];
  readonly states?: readonly (readonly string[])[];
}

export interface AreaSpinLandOptions {
  readonly delay?: (seconds: number) => Promise<void>;
}

export interface AreaSpinController {
  start(): void;
  land(target: AreaSpinTarget, options?: AreaSpinLandOptions): Promise<void>;
  cancel(): void;
}

export interface AreaSpinFunctionContext {
  readonly reels: ReelSpin;
  readonly columns: number;
  readonly wasStarted: boolean;
  delay(seconds: number): Promise<void>;
}

export interface AreaSpinFunction {
  start(context: AreaSpinFunctionContext): void;
  land(context: AreaSpinFunctionContext, target: AreaSpinTarget): Promise<void>;
  cancel(context: AreaSpinFunctionContext): void;
}

export interface ReelArea extends SymbolArea {
  readonly spin: AreaSpinController;
  getLayer(id: SymbolAreaLayerId): SymbolAreaLayer;
  present(
    presentation: (context: SymbolAreaPresentationContext) => Promise<void>,
  ): Promise<void>;
}

export const defaultAreaSpinFunction: AreaSpinFunction = Object.freeze({
  start: ({ reels, columns }: AreaSpinFunctionContext) => {
    const started: number[] = [];
    try {
      for (let x = 0; x < columns; x += 1) {
        reels.start(x);
        started.push(x);
      }
    } catch (error) {
      for (const x of started.reverse()) reels.cancel(x);
      throw error;
    }
  },
  land: async (
    { reels, wasStarted }: AreaSpinFunctionContext,
    target: AreaSpinTarget,
  ) => {
    await Promise.all(
      target.scene.map((symbols, x) => {
        const reelTarget: ReelRollTarget = {
          symbols,
          ...(target.values ? { values: target.values[x] } : {}),
          ...(target.states ? { states: target.states[x] } : {}),
        };
        return wasStarted
          ? reels.settle(x, reelTarget)
          : reels.roll(x, reelTarget);
      }),
    );
  },
  cancel: ({ reels, columns }: AreaSpinFunctionContext) => {
    for (let x = 0; x < columns; x += 1) reels.cancel(x);
  },
});
