import type { LogicGameConfig, LogicReels, SceneMatrix } from "@slotclientengine/logiccore";
import type { Container, Texture } from "pixi.js";
import type {
  RenderSymbol,
  SymbolAnimationResolver,
  SymbolAssetMap,
  SymbolStateId,
  SymbolStatePreset,
  SymbolTexturePolicy
} from "../symbol/index.js";

export type ReelSymbolKind = "textured" | "empty";
export type ReelSpinDirection = "forward" | "backward";
export type RenderReelPhase = "idle" | "starting" | "spinning" | "settling" | "stopped";

export interface ReelCellSize {
  readonly width: number;
  readonly height: number;
}

export interface ReelSymbolRegistryOptions {
  readonly gameConfig: LogicGameConfig;
  readonly assets: SymbolAssetMap;
  readonly emptySymbols?: readonly string[];
  readonly statePreset?: SymbolStatePreset;
  readonly animationResolver?: SymbolAnimationResolver;
  readonly texturePolicy?: SymbolTexturePolicy;
}

export interface ReelSymbolRegistryEntry {
  readonly code: number;
  readonly symbol: string;
  readonly kind: ReelSymbolKind;
}

export interface ReelSymbolRegistryValidation {
  readonly texturedSymbols: readonly string[];
  readonly configuredEmptySymbols: readonly string[];
  readonly configuredEmptySymbolsWithAssets: readonly string[];
  readonly missingAssetEmptySymbols: readonly string[];
  readonly ignoredAssetsWithoutPaytable: readonly string[];
}

export interface ReelSymbolRegistry {
  getValidation(): ReelSymbolRegistryValidation;
  getEntryByCode(code: number): ReelSymbolRegistryEntry;
  getEntryBySymbol(symbol: string): ReelSymbolRegistryEntry;
  getCellSize(): ReelCellSize;
  createRenderSymbolByCode(code: number): RenderSymbol | null;
}

export interface ReelLayoutOptions {
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap?: number;
  readonly bufferRowsBefore?: number;
  readonly bufferRowsAfter?: number;
}

export interface ReelLayout {
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap: number;
  readonly bufferRowsBefore: number;
  readonly bufferRowsAfter: number;
  getReelX(x: number): number;
  getCellY(visibleY: number): number;
}

export interface ReelSpinPlanOptions {
  readonly reels: LogicReels;
  readonly finalYs: readonly number[];
  readonly visibleRows: number;
  readonly direction?: ReelSpinDirection;
  readonly minimumSpinCycles?: number;
  readonly baseDurationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
  readonly extraTravelSymbolsPerReel?: readonly number[];
}

export interface ReelAxisSpinPlan {
  readonly x: number;
  readonly finalY: number;
  readonly startY: number;
  readonly direction: ReelSpinDirection;
  readonly travelSymbols: number;
  readonly startDelayMs: number;
  readonly durationMs: number;
  readonly stopAtMs: number;
}

export interface ReelSpinPlan {
  readonly direction: ReelSpinDirection;
  readonly axes: readonly ReelAxisSpinPlan[];
  readonly totalDurationMs: number;
}

export interface ReelWindowSlot {
  readonly windowY: number;
  readonly symbolY: number;
  readonly code: number;
}

export interface ReelWindowSnapshot {
  readonly x: number;
  readonly y: number;
  readonly baseY: number;
  readonly pixelOffsetY: number;
  readonly visibleScene: readonly number[];
  readonly slots: readonly ReelWindowSlot[];
}

export interface RenderReelOptions {
  readonly reels: LogicReels;
  readonly x: number;
  readonly layout: ReelLayout;
  readonly registry: ReelSymbolRegistry;
}

export interface RenderReelUpdateResult {
  readonly phase: RenderReelPhase;
  readonly completed: boolean;
  readonly landed: boolean;
}

export interface RenderReelSnapshot {
  readonly x: number;
  readonly phase: RenderReelPhase;
  readonly currentY: number;
  readonly finalY: number | null;
  readonly startY: number | null;
  readonly elapsedMs: number;
  readonly visibleScene: readonly number[];
}

export interface RenderReelSetOptions {
  readonly reels: LogicReels;
  readonly layout: ReelLayout;
  readonly registry: ReelSymbolRegistry;
}

export interface RenderReelSetUpdateResult {
  readonly completed: boolean;
  readonly spinning: boolean;
  readonly startedAxes: readonly number[];
  readonly stoppedAxes: readonly number[];
}

export interface RenderReelSetSnapshot {
  readonly spinning: boolean;
  readonly elapsedMs: number;
  readonly visibleScene: SceneMatrix;
  readonly reels: readonly RenderReelSnapshot[];
}

export interface RenderReelSlotSnapshot {
  readonly code: number;
  readonly kind: ReelSymbolKind;
  readonly symbol: RenderSymbol | null;
  readonly container: Container;
  readonly requestedState: SymbolStateId | null;
}
