import { LogicReelsModel, type LogicReels } from "@slotclientengine/logiccore";
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
  readonly currentY: number;
}): TemporaryReelStrip {
  if (options.plan.x !== options.x) {
    throw new ReelError(
      `Cannot create temporary reel strip for x ${options.x} with axis plan ${options.plan.x}.`
    );
  }

  const minSymbolY =
    options.plan.direction === "forward"
      ? -options.layout.bufferRowsBefore
      : -options.plan.travelSymbols - options.layout.bufferRowsBefore;
  const maxSymbolY =
    options.plan.direction === "forward"
      ? options.plan.travelSymbols + options.layout.visibleRows + options.layout.bufferRowsAfter - 1
      : options.layout.visibleRows + options.layout.bufferRowsAfter - 1;
  const codes = Array.from({ length: maxSymbolY - minSymbolY + 1 }, (_, index) => {
    const symbolY = minSymbolY + index;
    return options.reels.get(options.x, getPlanPhysicalY(options.plan, symbolY));
  });
  const currentBaseY = Math.floor(options.currentY);

  for (
    let symbolY = -options.layout.bufferRowsBefore;
    symbolY < options.layout.visibleRows + options.layout.bufferRowsAfter;
    symbolY += 1
  ) {
    codes[symbolY - minSymbolY] = options.reels.get(options.x, currentBaseY + symbolY);
  }

  const stripReels = new LogicReelsModel(`${options.reels.getName()}:spin:${options.x}`, [codes]);

  return Object.freeze({
    x: options.x,
    minSymbolY,
    maxSymbolY,
    codes: Object.freeze(codes),
    get(symbolY: number): number {
      if (!Number.isInteger(symbolY)) {
        throw new ReelError(`temporary reel strip symbolY ${symbolY} must be an integer.`);
      }
      if (symbolY < minSymbolY || symbolY > maxSymbolY) {
        return options.reels.get(options.x, getPlanPhysicalY(options.plan, symbolY));
      }
      return stripReels.get(0, symbolY - minSymbolY);
    }
  });
}

function getPlanPhysicalY(plan: ReelAxisSpinPlan, symbolY: number): number {
  return plan.startY + symbolY;
}
