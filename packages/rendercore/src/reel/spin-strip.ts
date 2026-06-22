import type { LogicReels } from "@slotclientengine/logiccore";
import { ReelError } from "./errors.js";
import type { ReelAxisSpinPlan, ReelLayout } from "./types.js";

export interface TemporaryReelStrip {
  readonly x: number;
  readonly minSymbolY: number;
  readonly maxSymbolY: number;
  readonly codes: readonly number[];
  get(symbolY: number): number;
}

export function createTemporaryReelStrip(options: {
  readonly reels: LogicReels;
  readonly x: number;
  readonly layout: ReelLayout;
  readonly plan: ReelAxisSpinPlan;
  readonly currentVisibleSymbols?: readonly number[];
  readonly targetVisibleSymbols?: readonly number[];
}): TemporaryReelStrip {
  if (options.plan.x !== options.x) {
    throw new ReelError(
      `Cannot create temporary reel strip for x ${options.x} with axis plan ${options.plan.x}.`,
    );
  }
  if (
    options.currentVisibleSymbols !== undefined &&
    options.currentVisibleSymbols.length !== options.layout.visibleRows
  ) {
    throw new ReelError(
      `currentVisibleSymbols length ${options.currentVisibleSymbols.length} does not match visibleRows ${options.layout.visibleRows}.`,
    );
  }
  const currentVisibleSymbols = parseVisibleSymbols(
    options.currentVisibleSymbols,
    "currentVisibleSymbols",
  );
  if (
    options.targetVisibleSymbols !== undefined &&
    options.targetVisibleSymbols.length !== options.layout.visibleRows
  ) {
    throw new ReelError(
      `targetVisibleSymbols length ${options.targetVisibleSymbols.length} does not match visibleRows ${options.layout.visibleRows}.`,
    );
  }
  const targetVisibleSymbols = parseVisibleSymbols(
    options.targetVisibleSymbols,
    "targetVisibleSymbols",
  );

  const minSymbolY =
    options.plan.direction === "forward"
      ? -options.layout.bufferRowsBefore
      : -options.plan.travelSymbols - options.layout.bufferRowsBefore;
  const maxSymbolY =
    options.plan.direction === "forward"
      ? options.plan.travelSymbols +
        options.layout.visibleRows +
        options.layout.bufferRowsAfter -
        1
      : options.layout.visibleRows + options.layout.bufferRowsAfter - 1;
  const codes = Array.from(
    { length: maxSymbolY - minSymbolY + 1 },
    (_, index) => {
      const symbolY = minSymbolY + index;
      return options.reels.get(
        options.x,
        getPlanPhysicalY(options.plan, symbolY),
      );
    },
  );

  for (let visibleY = 0; visibleY < options.layout.visibleRows; visibleY += 1) {
    const currentVisibleSymbol = currentVisibleSymbols?.[visibleY];
    if (currentVisibleSymbol === undefined) {
      continue;
    }
    codes[visibleY - minSymbolY] = currentVisibleSymbol;
  }
  const targetBaseY =
    options.plan.direction === "forward"
      ? options.plan.travelSymbols
      : -options.plan.travelSymbols;
  for (let visibleY = 0; visibleY < options.layout.visibleRows; visibleY += 1) {
    const targetVisibleSymbol = targetVisibleSymbols?.[visibleY];
    if (targetVisibleSymbol === undefined) {
      continue;
    }
    const symbolY = targetBaseY + visibleY;
    codes[symbolY - minSymbolY] = targetVisibleSymbol;
  }

  return Object.freeze({
    x: options.x,
    minSymbolY,
    maxSymbolY,
    codes: Object.freeze(codes),
    get(symbolY: number): number {
      if (!Number.isInteger(symbolY)) {
        throw new ReelError(
          `temporary reel strip symbolY ${symbolY} must be an integer.`,
        );
      }
      if (symbolY < minSymbolY || symbolY > maxSymbolY) {
        return options.reels.get(
          options.x,
          getPlanPhysicalY(options.plan, symbolY),
        );
      }
      return codes[symbolY - minSymbolY];
    },
  });
}

function getPlanPhysicalY(plan: ReelAxisSpinPlan, symbolY: number): number {
  return plan.startY + symbolY;
}

function parseVisibleSymbols(
  value: readonly number[] | undefined,
  label: string,
): readonly number[] | undefined {
  if (value === undefined) {
    return undefined;
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
