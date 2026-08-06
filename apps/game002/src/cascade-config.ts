import type { GridCellCascadeMotionOptions } from "@slotclientengine/rendercore/reel";

export const GAME002_CASCADE_COMPONENTS = Object.freeze({
  spin: "bg-spin",
  gencoins: "bg-gencoins",
  win: "bg-win",
  triggerco: "bg-triggerco",
  co: "bg-co",
  cogencn: "bg-cogencn",
  win2: "bg-win2",
  bn: "bg-bn",
  remove: "bg-remove",
  respin: "bg-respin",
  dropdown: "bg-dropdown",
  refill: "bg-refill",
  genwilds: "bg-genwilds",
  posincwl: "bg-pos-incwl",
  genwm: "bg-genwm",
  genco: "bg-genco",
  setwm: "bg-setwm",
  incwl: "bg-incwl",
  updwl: "bg-updwl",
  wm2cn: "bg-wm2cn",
  genwmcn: "bg-genwmcn",
  gencm: "bg-gencm",
  setcm: "bg-setcm",
  updcn: "bg-updcn",
  cm2cn: "bg-cm2cn",
  gencmcn: "bg-gencmcn",
});

export const GAME002_CASCADE_MOTION = Object.freeze({
  columnStartStaggerSeconds: 0.045,
  startStaggerSeconds: 0.018,
  baseFallSeconds: 0.11,
  perRowFallSeconds: 0.04,
  maxFallSeconds: 0.36,
  overshootCellRatio: 0.16,
  settleSeconds: 0.09,
}) satisfies GridCellCascadeMotionOptions;

export const GAME002_CASCADE_PRESENTATION = Object.freeze({
  emphasisSeconds: 1,
  dimmingInSeconds: 0.1,
  dimmingOutSeconds: 0.1,
  nonWinningDimmingAlpha: 0.5,
  startPresentationsWithEmphasis: true,
});

const GAME002_REMOVE_EXCLUDED_SYMBOLS = new Set(["WL"]);
const GAME002_DROP_HELD_SYMBOLS = new Set(["WL"]);
const GAME002_SEQUENTIAL_WIN_COMPANION_SYMBOLS = new Set(["WL"]);

export function canGame002CascadeRemoveSymbol(symbol: string): boolean {
  return !GAME002_REMOVE_EXCLUDED_SYMBOLS.has(symbol);
}

export function canGame002CascadeDropSymbol(symbol: string): boolean {
  return !GAME002_DROP_HELD_SYMBOLS.has(symbol);
}

export function isGame002SequentialWinCompanionSymbol(symbol: string): boolean {
  return GAME002_SEQUENTIAL_WIN_COMPANION_SYMBOLS.has(symbol);
}
