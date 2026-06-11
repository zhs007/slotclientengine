import type { ReelSpinDirection, ReelSymbolScaleMap } from "@slotclientengine/rendercore/reel";

export const REELS_VIEWER_REQUIRED_STATE_TEXTURES = ["spinBlur"] as const;

export const REELS_VIEWER_SYMBOL_SCALES = Object.freeze({
  SC: 1.5,
  RS: 1.5,
  X2: 1.5,
  X5: 1.5,
  X10: 1.5
} satisfies ReelSymbolScaleMap);

export interface ReelsViewerConfig {
  readonly reelsName: string;
  readonly visibleRows: number;
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly direction: ReelSpinDirection;
  readonly minimumSpinCycles: number;
  readonly baseDurationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
}

export const DEFAULT_REELS_VIEWER_CONFIG: ReelsViewerConfig = Object.freeze({
  reelsName: "reels01",
  visibleRows: 5,
  emptySymbols: Object.freeze(["BN"]),
  symbolScales: REELS_VIEWER_SYMBOL_SCALES,
  direction: "forward",
  minimumSpinCycles: 10,
  baseDurationMs: 1600,
  speedSymbolsPerSecond: 42,
  startDelayMs: 90,
  stopDelayMs: 180
});
