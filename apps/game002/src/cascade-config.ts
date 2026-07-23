import type { GridCellCascadeMotionOptions } from "@slotclientengine/rendercore/reel";
import type { SlotRoundFlowProfileV1 } from "@slotclientengine/gameframeworks";

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

export const GAME002_ROUND_FLOW_PROFILE = Object.freeze({
  kind: "slot-round-flow",
  version: 1,
  components: {
    spin: GAME002_CASCADE_COMPONENTS.spin,
    wins: [GAME002_CASCADE_COMPONENTS.win],
    valueUpdates: [GAME002_CASCADE_COMPONENTS.gencoins],
  },
  cascade: {
    kind: "cascade",
    version: 1,
    components: {
      remove: GAME002_CASCADE_COMPONENTS.remove,
      dropdown: GAME002_CASCADE_COMPONENTS.dropdown,
      refill: GAME002_CASCADE_COMPONENTS.refill,
      stepMarker: GAME002_CASCADE_COMPONENTS.respin,
    },
    symbols: {
      emptyCode: -1,
      removeExcludedSymbols: ["WL"],
      dropHeldSymbols: ["WL"],
      valueSymbols: ["CN"],
      sequentialWinCompanionSymbols: ["WL"],
    },
    amount: {
      coinFields: ["coinWin64", "coinWin"],
      cashFields: ["cashWin64", "cashWin"],
      cashUnit: "cents",
    },
  },
  amount: {
    coinFields: ["coinWin64", "coinWin"],
    cashFields: ["cashWin64", "cashWin"],
    cashUnit: "cents",
  },
} as const satisfies SlotRoundFlowProfileV1);

export function canGame002CascadeRemoveSymbol(symbol: string): boolean {
  return !GAME002_ROUND_FLOW_PROFILE.cascade.symbols.removeExcludedSymbols.includes(
    symbol as "WL",
  );
}

export function canGame002CascadeDropSymbol(symbol: string): boolean {
  return !GAME002_ROUND_FLOW_PROFILE.cascade.symbols.dropHeldSymbols.includes(
    symbol as "WL",
  );
}

export function isGame002SequentialWinCompanionSymbol(symbol: string): boolean {
  return GAME002_ROUND_FLOW_PROFILE.cascade.symbols.sequentialWinCompanionSymbols.includes(
    symbol as "WL",
  );
}
