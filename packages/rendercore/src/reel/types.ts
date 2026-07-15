import type {
  LogicGameConfig,
  LogicReels,
  SceneMatrix,
} from "@slotclientengine/logiccore";
import type { Container, Texture } from "pixi.js";
import type {
  RenderSymbol,
  SymbolAnimationResolver,
  SymbolAssetMap,
  SymbolStateId,
  SymbolStatePreset,
  SymbolTexturePolicy,
} from "../symbol/index.js";
import type { SymbolValuePresentationResourceMap } from "../symbol-value-presentation/types.js";

export type ReelSymbolKind = "textured" | "empty";
export type ReelSpinDirection = "forward" | "backward";
export type RenderReelPhase =
  | "idle"
  | "starting"
  | "spinning"
  | "settling"
  | "stopped";

export interface ReelCellSize {
  readonly width: number;
  readonly height: number;
}

export type ReelSymbolScaleMap = Readonly<Record<string, number>>;
export type ReelSymbolRenderPriorityMap = Readonly<Record<string, number>>;
export type ReelSymbolAnimationCapabilityMap = Readonly<
  Record<string, readonly SymbolStateId[]>
>;

export interface ReelSymbolRegistryOptions {
  readonly gameConfig: LogicGameConfig;
  readonly assets: SymbolAssetMap;
  readonly emptySymbols?: readonly string[];
  readonly symbolScales?: ReelSymbolScaleMap;
  readonly symbolRenderPriorities?: ReelSymbolRenderPriorityMap;
  readonly symbolAnimationCapabilities?: ReelSymbolAnimationCapabilityMap;
  readonly landingAppearSymbols?: readonly string[];
  readonly statePreset?: SymbolStatePreset;
  readonly animationResolver?: SymbolAnimationResolver;
  readonly texturePolicy?: SymbolTexturePolicy;
  readonly valuePresentationResources?: SymbolValuePresentationResourceMap;
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

export interface GridCellCoordinate {
  readonly x: number;
  readonly y: number;
  readonly orderIndex: number;
}

export type GridCellReelOffsetMatrix = readonly (readonly number[])[];

export interface GridCellReelOffsetMatrixOptions {
  readonly columns: number;
  readonly rows: number;
  readonly rowOffsetStep?: number;
  readonly columnOffsetStep?: number;
  readonly originOffset?: number;
}

export type GridCellOrderMode = "top-down-left-right";

export interface GridCellReelSpinTiming {
  readonly startStepMs: number;
  readonly stopStepMs: number;
  readonly settleAfterLastStartMs: number;
  readonly minimumSpinCycles: number;
  readonly speedSymbolsPerSecond: number;
}

export interface GridCellDimmingPattern {
  readonly evenAlpha: number;
  readonly oddAlpha: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

export type GridCellReelPhase =
  | "idle"
  | "waiting"
  | "spinning"
  | "landed"
  | "completed";

export interface GridCellReelPlanCell {
  readonly x: number;
  readonly y: number;
  readonly orderIndex: number;
  readonly sequenceIndex: number;
  readonly reelOffsetY: number;
  readonly startAtMs: number;
  readonly stopAtMs: number;
  readonly durationMs: number;
  readonly axisPlan: ReelAxisSpinPlan;
  readonly targetVisibleSymbols: readonly [number];
  readonly dimmingAlpha: number;
}

export interface GridCellReelSpinPlan {
  readonly direction: ReelSpinDirection;
  readonly columns: number;
  readonly rows: number;
  readonly dimming: GridCellDimmingPattern;
  readonly cells: readonly GridCellReelPlanCell[];
  readonly lastStopAtMs: number;
  readonly selective: boolean;
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
  readonly symbolPool?: RenderSymbolPool;
  readonly slotParent?: Container;
  readonly slotRenderOrderOffset?: number;
  readonly slotRenderOrderStride?: number;
  readonly presentationValueResolver?: ReelSymbolPresentationValueResolver;
}

export interface RenderReelSpinOptions {
  readonly targetVisibleSymbols?: readonly number[];
  readonly targetVisiblePresentationValues?: readonly (number | null)[];
}

export interface ReelSymbolPresentationValueContext {
  readonly x: number;
  readonly symbolY: number;
  readonly code: number;
}

export type ReelSymbolPresentationValueResolver = (
  context: ReelSymbolPresentationValueContext,
) => number | null;

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

export interface RenderVisibleSymbolStateSnapshot {
  readonly x: number;
  readonly y: number;
  readonly code: number;
  readonly kind: ReelSymbolKind;
  readonly requestedState: SymbolStateId | null;
  readonly resolvedState: SymbolStateId | null;
  readonly isOnce: boolean;
}

export interface RenderVisibleSymbolGeometrySnapshot {
  readonly x: number;
  readonly y: number;
  readonly code: number;
  readonly kind: ReelSymbolKind;
  readonly centerX: number;
  readonly centerY: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export interface VisibleSymbolPresentationTarget {
  requestVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
  ): void;
  getVisibleSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolStateSnapshot[];
  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[];
  update(deltaSeconds: number): unknown;
}

export interface RenderReelSetOptions {
  readonly reels: LogicReels;
  readonly layout: ReelLayout;
  readonly registry: ReelSymbolRegistry;
  readonly symbolPool?: RenderSymbolPoolOptions;
}

export interface RenderSymbolPoolOptions {
  readonly enabled?: boolean;
  readonly targetIdlePerCode?: number;
  readonly maxIdlePerCode?: number;
  readonly maxIdleTotal?: number;
}

export interface RenderSymbolPoolStats {
  readonly totalIdle: number;
  readonly idlePerCode: Readonly<Record<number, number>>;
}

export interface RenderSymbolPool {
  acquire(code: number, create: () => RenderSymbol | null): RenderSymbol | null;
  release(code: number, symbol: RenderSymbol): void;
  trimCode(code: number): void;
  trimTotal(): void;
  destroy(): void;
  getStats(): RenderSymbolPoolStats;
}

export interface RenderReelSetSpinOptions {
  readonly targetVisibleScene?: SceneMatrix;
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
  readonly windowY: number;
  readonly code: number;
  readonly kind: ReelSymbolKind;
  readonly symbol: RenderSymbol | null;
  readonly container: Container;
  readonly requestedState: SymbolStateId | null;
  readonly resolvedState: SymbolStateId | null;
  readonly isOnce: boolean;
  readonly presentationValue: number | null;
}

export interface RenderReelVisibleOccurrence {
  readonly code: number;
  readonly kind: Exclude<ReelSymbolKind, "empty">;
  readonly symbol: RenderSymbol;
  readonly presentationValue: number | null;
}

export interface RenderGridCellReelSetOptions {
  readonly reels: LogicReels;
  readonly registry: ReelSymbolRegistry;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly order: readonly GridCellCoordinate[];
  readonly presentationValueResolver?: GridCellSymbolPresentationValueResolver;
}

export interface GridCellSymbolPresentationValueContext {
  readonly x: number;
  readonly y: number;
  readonly symbolY: number;
  readonly code: number;
}

export type GridCellSymbolPresentationValueResolver = (
  context: GridCellSymbolPresentationValueContext,
) => number | null;

export type SymbolPresentationValueMatrix = readonly (readonly (
  | number
  | null
)[])[];

export const CASCADE_EMPTY_CELL = -1;
export type GridCellCascadeScene = readonly (readonly number[])[];
export type GridCellCascadeValue = number | null | typeof CASCADE_EMPTY_CELL;
export type GridCellCascadeValueMatrix =
  readonly (readonly GridCellCascadeValue[])[];

export interface GridCellCascadeMotionOptions {
  readonly columnStartStaggerSeconds: number;
  readonly startStaggerSeconds: number;
  readonly baseFallSeconds: number;
  readonly perRowFallSeconds: number;
  readonly maxFallSeconds: number;
  readonly overshootCellRatio: number;
  readonly settleSeconds: number;
}

export interface GridCellCascadeDropMovement {
  readonly kind: "existing" | "refill";
  readonly x: number;
  readonly sourceY: number;
  readonly targetY: number;
  readonly code: number;
  readonly presentationValue: number | null;
  readonly startSeconds: number;
  readonly fallSeconds: number;
  readonly settleSeconds: number;
  readonly overshootPixels: number;
}

export interface GridCellCascadeDropPlan {
  readonly columns: number;
  readonly rows: number;
  readonly sourceScene: GridCellCascadeScene;
  readonly sourceValues: GridCellCascadeValueMatrix;
  readonly settledScene: GridCellCascadeScene;
  readonly settledValues: GridCellCascadeValueMatrix;
  readonly targetScene: GridCellCascadeScene;
  readonly targetValues: GridCellCascadeValueMatrix;
  readonly refillPositions: readonly {
    readonly x: number;
    readonly y: number;
  }[];
  readonly movements: readonly GridCellCascadeDropMovement[];
  readonly totalSeconds: number;
}

export interface GridCellCascadeDropOccurrenceContext {
  readonly x: number;
  readonly sourceY: number;
  readonly code: number;
  readonly presentationValue: number | null;
}

export interface RenderGridCellReelSetSpinOptions {
  readonly targetPresentationValues?: SymbolPresentationValueMatrix;
}

export interface RenderGridCellReelSetUpdateResult {
  readonly spinning: boolean;
  readonly completed: boolean;
  readonly activity?: "spin" | "dropdown" | null;
  readonly startedCells: readonly GridCellCoordinate[];
  readonly landedCells: readonly GridCellCoordinate[];
}

export interface RenderGridCellReelCellSnapshot {
  readonly x: number;
  readonly y: number;
  readonly orderIndex: number;
  readonly phase: GridCellReelPhase;
  readonly hasClipMask: boolean;
  readonly cellX: number;
  readonly cellY: number;
  readonly reelX: number;
  readonly reelY: number;
  readonly dimmingOnReel: boolean;
  readonly dimmingAlpha: number;
  readonly requestedState: string | null;
  readonly visibleSymbol: number;
  readonly presentationValue: number | null;
  readonly occupied: boolean;
}

export interface RenderGridCellReelSetSnapshot {
  readonly spinning: boolean;
  readonly completed: boolean;
  readonly visibleScene: SceneMatrix;
  readonly cells: readonly RenderGridCellReelCellSnapshot[];
}
