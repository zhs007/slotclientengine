import type {
  RenderObject,
  RenderPoint,
} from "../presentation/render-object.js";
import type { RenderAnchor } from "../presentation/render-anchor.js";
import type {
  PresentationMountTarget,
  PresentationScopeContext,
} from "../presentation/presentation-scope.js";
import type { ReelRollTarget, ReelSpin } from "./reel-spin.js";
import type { SymbolArea } from "./symbol-area.js";

export type SymbolAreaLayerId = "bottom" | "top" | "win";

export interface SymbolAreaLayer extends PresentationMountTarget {
  add(node: RenderObject, order?: number): void;
  remove(node: RenderObject): void;
}

export interface SymbolAreaPresentationContext extends PresentationScopeContext {}

export interface SymbolAreaPresentationOptions {
  readonly repeat?: boolean;
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

export interface AreaSpinFunctionOptions {
  readonly startOrder?: "together" | "left-to-right" | "right-to-left";
  readonly landOrder?: "together" | "left-to-right" | "right-to-left";
  readonly startStaggerSeconds?: number;
  readonly landStaggerSeconds?: number;
}

export interface ReelArea extends SymbolArea {
  readonly spin: AreaSpinController;
  getAnchor(point: RenderPoint): RenderAnchor;
  getLayer(id: SymbolAreaLayerId): SymbolAreaLayer;
  present(
    presentation: (context: SymbolAreaPresentationContext) => Promise<void>,
    options?: SymbolAreaPresentationOptions,
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

export function createAreaSpinFunction(
  options: AreaSpinFunctionOptions = {},
): AreaSpinFunction {
  const startOrder = options.startOrder ?? "together";
  const landOrder = options.landOrder ?? "together";
  const startStaggerSeconds = normalizeStagger(
    options.startStaggerSeconds ?? 0,
    "startStaggerSeconds",
  );
  const landStaggerSeconds = normalizeStagger(
    options.landStaggerSeconds ?? 0,
    "landStaggerSeconds",
  );
  if (startStaggerSeconds !== 0)
    throw new Error(
      "Area spin start stagger requires an asynchronous start contract.",
    );
  return Object.freeze({
    start: (context: AreaSpinFunctionContext) => {
      const started: number[] = [];
      try {
        for (const x of columnsFor(context.columns, startOrder)) {
          context.reels.start(x);
          started.push(x);
        }
      } catch (error) {
        for (const x of started.reverse()) context.reels.cancel(x);
        throw error;
      }
    },
    land: async (context: AreaSpinFunctionContext, target: AreaSpinTarget) => {
      assertAreaTargetColumns(target, context.columns);
      const jobs: Promise<void>[] = [];
      const columns = columnsFor(context.columns, landOrder);
      for (const [index, x] of columns.entries()) {
        if (index > 0 && landStaggerSeconds > 0)
          await context.delay(landStaggerSeconds);
        const reelTarget: ReelRollTarget = {
          symbols: target.scene[x]!,
          ...(target.values ? { values: target.values[x] } : {}),
          ...(target.states ? { states: target.states[x] } : {}),
        };
        jobs.push(
          context.wasStarted
            ? context.reels.settle(x, reelTarget)
            : context.reels.roll(x, reelTarget),
        );
      }
      await Promise.all(jobs);
    },
    cancel: defaultAreaSpinFunction.cancel,
  });
}

function columnsFor(
  columns: number,
  order: NonNullable<AreaSpinFunctionOptions["startOrder" | "landOrder"]>,
): readonly number[] {
  if (
    order !== "together" &&
    order !== "left-to-right" &&
    order !== "right-to-left"
  )
    throw new Error(`Unknown area spin column order "${String(order)}".`);
  const result = Array.from({ length: columns }, (_, x) => x);
  return Object.freeze(order === "right-to-left" ? result.reverse() : result);
}

function normalizeStagger(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`Area spin ${label} must be finite and non-negative.`);
  return value;
}

function assertAreaTargetColumns(
  target: AreaSpinTarget,
  columns: number,
): void {
  if (target.scene.length !== columns)
    throw new Error(
      `Area spin target has ${target.scene.length} columns, expected ${columns}.`,
    );
  if (target.values && target.values.length !== columns)
    throw new Error("Area spin value target column count does not match.");
  if (target.states && target.states.length !== columns)
    throw new Error("Area spin state target column count does not match.");
}
