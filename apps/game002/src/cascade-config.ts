import type { GridCellCascadeMotionOptions } from "@slotclientengine/rendercore/reel";

export const GAME002_CASCADE_COMPONENTS = Object.freeze({
  spin: "bg-spin",
  gencoins: "bg-gencoins",
  win: "bg-win",
  remove: "bg-remove",
  respin: "bg-respin",
  dropdown: "bg-dropdown",
  refill: "bg-refill",
});

export const GAME002_CASCADE_MOTION = Object.freeze({
  columnStartStaggerSeconds: 0.055,
  startStaggerSeconds: 0.025,
  baseFallSeconds: 0.18,
  perRowFallSeconds: 0.055,
  maxFallSeconds: 0.48,
  overshootCellRatio: 0.08,
  settleSeconds: 0.12,
}) satisfies GridCellCascadeMotionOptions;

export const GAME002_CASCADE_PRESENTATION = Object.freeze({
  emphasisSeconds: 2,
  nonWinningDimmingAlpha: 0.82,
});

const GAME002_NON_REMOVABLE_CASCADE_SYMBOLS = new Set(["WL"]);
const GAME002_NON_DROPPABLE_CASCADE_SYMBOLS = new Set(["WL"]);

export function canGame002CascadeRemoveSymbol(symbol: string): boolean {
  return !GAME002_NON_REMOVABLE_CASCADE_SYMBOLS.has(symbol);
}

export function canGame002CascadeDropSymbol(symbol: string): boolean {
  return !GAME002_NON_DROPPABLE_CASCADE_SYMBOLS.has(symbol);
}
