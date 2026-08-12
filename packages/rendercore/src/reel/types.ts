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
  SymbolStatePlaybackOptions,
  SymbolStatePreset,
  SymbolStateTransitionMode,
  SymbolTexturePolicy,
} from "../symbol/index.js";
import type { SymbolValuePresentationResourceMap } from "../symbol-value-presentation/types.js";
import type {
  GridCellEffectController,
  GridCellEffectSnapshot,
} from "./grid-cell-effect-player.js";

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
  readonly rowGap?: number;
  readonly bufferRowsBefore?: number;
  readonly bufferRowsAfter?: number;
}

export interface ReelLayout {
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
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

export interface GridCellSpinPosition {
  readonly x: number;
  readonly y: number;
  readonly startGroupIndex?: number;
}

export type GridCellReelOffsetMatrix = readonly (readonly number[])[];

export interface GridCellReelOffsetMatrixOptions {
  readonly columns: number;
  readonly rows: number;
  readonly rowOffsetStep?: number;
  readonly columnOffsetStep?: number;
  readonly originOffset?: number;
}

export interface ShuffledGridCellReelOffsetMatrixOptions {
  readonly reels: LogicReels;
  readonly columns: number;
  readonly rows: number;
  readonly random: () => number;
}

export type GridCellOrderMode = "top-down-left-right";

export interface GridCellReelSpinTiming {
  readonly startStepMs: number;
  readonly stopStepMs: number;
  readonly settleAfterLastStartMs: number;
  readonly minimumSpinCycles: number;
  readonly speedSymbolsPerSecond: number;
}

export interface GridCellContinuousSpinOptions {
  readonly direction: ReelSpinDirection;
  readonly speedSymbolsPerSecond: number;
  /** Delay between stable position start groups. */
  readonly startStepMs?: number;
  readonly positions?: readonly GridCellSpinPosition[];
  readonly dimming?: GridCellDimmingPattern;
  readonly dimmingActivatedAtStart?: boolean;
}

export interface GridCellDimmingPattern {
  readonly resolveDimmingAlpha: (code: number, activated: boolean) => number;
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
  readonly startGroupIndex: number;
  readonly reelOffsetY: number;
  readonly startAtMs: number;
  readonly stopAtMs: number;
  readonly durationMs: number;
  readonly axisPlan: ReelAxisSpinPlan;
  readonly targetVisibleSymbols: readonly [number];
  readonly dimmingAlpha: number;
  readonly effect: GridCellScheduledEffect | null;
}

export interface GridCellScheduledEffect {
  readonly effectId: string;
  readonly startAtMs: number;
  readonly loopCount: number;
  readonly finishBeforeStopMs: number;
  readonly activationGate?: Readonly<{ x: number; y: number }>;
}

export interface GridCellEffectPlanSpec {
  readonly effectId: string;
  readonly durationMs: number;
  readonly loopCount: number;
  readonly finishBeforeStopMs: number;
}

export interface GridCellReelEffectPlanOptions {
  readonly normal?: GridCellEffectPlanSpec;
  readonly activated?: GridCellEffectPlanSpec;
  readonly activationGate?: Readonly<{ x: number; y: number }>;
  readonly firstFollowingStopDelayMs?: number;
  readonly activatedStopStepMs?: number;
}

export interface GridCellReelActivationPlanOptions {
  readonly activationGate: Readonly<{ x: number; y: number }>;
  readonly firstFollowingStopDelayMs: number;
  readonly activatedStopStepMs: number;
}

export interface GridCellReelSpinPlan {
  readonly direction: ReelSpinDirection;
  readonly columns: number;
  readonly rows: number;
  readonly dimming: GridCellDimmingPattern;
  readonly cells: readonly GridCellReelPlanCell[];
  readonly lastStopAtMs: number;
  readonly selective: boolean;
  readonly activationGate: Readonly<{ x: number; y: number }> | null;
  readonly dimmingActivatedAtStart: boolean;
}

export interface GridCellEffectSweepPlan {
  readonly effectId: string;
  readonly loopCount: 1;
  readonly startStepMs: number;
  readonly positions: readonly Readonly<{ x: number; y: number }>[];
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
  readonly bounceStrength?: number;
}

export interface RenderReelSpinOptions {
  readonly targetVisibleSymbols?: readonly number[];
  readonly targetVisiblePresentationValues?: readonly (number | null)[];
  /** Requested immediately after the target occurrence is committed at land. */
  readonly targetVisibleStates?: readonly SymbolStateId[];
}

export interface RenderReelContinuousSpinOptions {
  readonly direction: ReelSpinDirection;
  readonly speedSymbolsPerSecond: number;
}

export type RenderReelSetContinuousSpinOptions =
  RenderReelContinuousSpinOptions;

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
  readonly loopCompletionCount?: number;
  readonly onceCompletionCount?: number;
}

export interface PreparedVisibleOccurrenceReplacement {
  readonly x: number;
  readonly y: number;
  readonly outputCode: number;
  commit(): void;
  rollback(): void;
  destroy(): void;
}

export interface GridCellVisibleOccurrenceTransfer {
  readonly source: { readonly x: number; readonly y: number };
  readonly target: { readonly x: number; readonly y: number };
  readonly sourceReplacementCode: number;
  readonly sourceReplacementPresentationValue: number | null;
}

export interface VisibleOccurrencePoint {
  readonly x: number;
  readonly y: number;
}

export type VisibleOccurrenceMotionPath =
  | { readonly kind: "line" }
  | {
      readonly kind: "cubic-bezier-path";
      readonly segments: readonly {
        readonly control1: VisibleOccurrencePoint;
        readonly control2: VisibleOccurrencePoint;
        readonly end: VisibleOccurrencePoint;
      }[];
    };

export type VisibleOccurrenceTimeEasing =
  | { readonly kind: "linear" }
  | {
      readonly kind: "cubic-bezier";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    };

export interface VisibleOccurrenceStacking {
  readonly layer: "above-symbols" | "above-effects";
  readonly order: number;
}

export interface VisibleOccurrenceMotion {
  readonly durationMs: number;
  readonly path: VisibleOccurrenceMotionPath;
  readonly easing: VisibleOccurrenceTimeEasing;
  readonly stacking: VisibleOccurrenceStacking;
}

export interface VisibleOccurrenceEffectAttachmentOptions {
  readonly key: string;
  readonly kind: "spine" | "vni";
  readonly transform?: {
    readonly x?: number;
    readonly y?: number;
    readonly scaleX?: number;
    readonly scaleY?: number;
    readonly rotation?: number;
  };
  readonly stacking?: VisibleOccurrenceStacking;
}

export type VisibleOccurrenceEffectPlaybackOptions =
  | {
      readonly kind: "spine";
      readonly animationName: string;
      readonly loop?: boolean;
    }
  | {
      readonly kind: "vni";
      readonly loop?: boolean;
    };

export interface VisibleOccurrenceEffectHandle {
  play(options: VisibleOccurrenceEffectPlaybackOptions): Promise<void>;
  stop(): void;
  detach(): void;
}

export interface VisibleOccurrenceEffectPlayer {
  play(options: VisibleOccurrenceEffectPlaybackOptions): Promise<void>;
  update(deltaSeconds: number): void;
  stop(): void;
  destroy(): void;
}

export type VisibleOccurrenceEffectPlayerFactory = (options: {
  readonly parent: Container;
  readonly attachment: VisibleOccurrenceEffectAttachmentOptions;
}) => Promise<VisibleOccurrenceEffectPlayer>;

export interface VisibleOccurrenceHandle {
  getSnapshot(): RenderVisibleSymbolStateSnapshot;
  getGeometrySnapshot(): RenderVisibleSymbolGeometrySnapshot;
  setPresentationValue(value: number | null): void;
  playState(
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): Promise<void>;
  attachEffect(
    options: VisibleOccurrenceEffectAttachmentOptions,
  ): Promise<VisibleOccurrenceEffectHandle>;
}

export interface VisibleOccurrenceTransferInput extends GridCellVisibleOccurrenceTransfer {
  readonly signal?: AbortSignal;
}

export interface VisibleOccurrenceTransferScope {
  readonly moving: VisibleOccurrenceHandle;
  readonly target: VisibleOccurrenceHandle;
  delay(durationMs: number, signal?: AbortSignal): Promise<void>;
  move(motion: VisibleOccurrenceMotion): Promise<void>;
  commit(): Promise<void>;
}

export interface PreparedGridCellVisibleOccurrenceTransferBatch {
  readonly transfers: readonly GridCellVisibleOccurrenceTransfer[];
  start(): void;
  setProgress(progress: number): void;
  commit(): void;
  rollback(): void;
  destroy(): void;
}

export interface DirectVisibleOccurrenceTransferBatchInput {
  readonly transfers: readonly GridCellVisibleOccurrenceTransfer[];
  readonly durationMs: number;
  readonly signal?: AbortSignal;
}

export interface DirectGridCellCascadeDropInput {
  readonly movements: readonly GridCellCascadeDropMovement[];
  readonly valueCommits?: readonly GridCellCascadeValueCommit[];
  readonly signal?: AbortSignal;
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
    transitionMode?: SymbolStateTransitionMode,
  ): void;
  getVisibleSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolStateSnapshot[];
  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[];
  update(deltaSeconds: number): unknown;
}

export interface AwaitableVisibleSymbolPresentationTarget extends VisibleSymbolPresentationTarget {
  playVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): Promise<void>;
  playVisibleSymbolStateBatch(
    requests: readonly VisibleSymbolStatePlaybackRequest[],
    options?: VisibleSymbolStatePlaybackBatchOptions,
  ): Promise<void>;
}

export interface VisibleSymbolStatePlaybackRequest {
  readonly positions: readonly { readonly x: number; readonly y: number }[];
  readonly state: SymbolStateId;
  readonly options: Omit<SymbolStatePlaybackOptions, "signal">;
}

export interface VisibleSymbolStatePlaybackBatchOptions {
  readonly signal?: AbortSignal;
}

export interface GridCellTerminalRemoveOptions {
  readonly positions: readonly { readonly x: number; readonly y: number }[];
  readonly state: SymbolStateId;
  readonly playback: Omit<SymbolStatePlaybackOptions, "signal">;
  readonly signal?: AbortSignal;
  readonly onComplete?: () => void;
}

export interface RenderReelSetOptions {
  readonly reels: LogicReels;
  readonly layout: ReelLayout;
  readonly registry: ReelSymbolRegistry;
  readonly symbolPool?: RenderSymbolPoolOptions;
  readonly bounceStrength?: number;
  readonly reelSpin?: import("./reel-spin.js").ReelSpinDefaults;
  readonly areaSpinFunction?: import("./reel-area.js").AreaSpinFunction;
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
  readonly targetVisiblePresentationValues?: SymbolPresentationValueMatrix;
  /** X-first state matrix committed per stopped axis, not after the full set. */
  readonly targetVisibleStates?: readonly (readonly SymbolStateId[])[];
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
  readonly emptySymbolLayer: Container;
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
  readonly columnGap?: number;
  readonly rowGap?: number;
  readonly order: readonly GridCellCoordinate[];
  readonly presentationValueResolver?: GridCellSymbolPresentationValueResolver;
  readonly bounceStrength?: number;
  readonly effectController?: GridCellEffectController;
  readonly occurrenceEffectPlayerFactory?: VisibleOccurrenceEffectPlayerFactory;
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

/** Shared empty-symbol code for every RenderCore symbol area and spin model. */
export const EMPTY_SYMBOL_CODE = -1;
/** @deprecated Use EMPTY_SYMBOL_CODE. */
export const CASCADE_EMPTY_CELL = EMPTY_SYMBOL_CODE;
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

interface GridCellCascadeDropMovementBase {
  readonly x: number;
  readonly sourceY: number;
  readonly targetY: number;
  readonly startSeconds: number;
  readonly fallSeconds: number;
  readonly settleSeconds: number;
  readonly overshootPixels: number;
}

export type GridCellCascadeDropMovement =
  | (GridCellCascadeDropMovementBase & {
      readonly kind: "existing";
    })
  | (GridCellCascadeDropMovementBase & {
      readonly kind: "refill";
      readonly outputCode: number;
      readonly outputPresentationValue: number | null;
    });

export interface GridCellCascadeValueCommit {
  readonly x: number;
  readonly y: number;
  readonly presentationValue: number | null;
}

export interface GridCellCascadeDropPlan {
  readonly columns: number;
  readonly rows: number;
  readonly movements: readonly GridCellCascadeDropMovement[];
  readonly valueCommits: readonly GridCellCascadeValueCommit[];
  readonly totalSeconds: number;
}

export interface RenderGridCellReelSetSpinOptions {
  readonly targetPresentationValues?: SymbolPresentationValueMatrix;
  /** X-first state matrix committed independently at each cell landing. */
  readonly targetLandingStates?: readonly (readonly SymbolStateId[])[];
}

export interface RenderGridCellReelSetUpdateResult {
  readonly spinning: boolean;
  readonly completed: boolean;
  readonly activity?: "spin" | "dropdown" | "effect-sweep" | null;
  readonly startedCells: readonly GridCellCoordinate[];
  readonly landedCells: readonly GridCellCoordinate[];
  readonly activationCells: readonly GridCellCoordinate[];
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
  readonly dimmingOverlayRenderable: boolean;
  readonly dimmingAlpha: number;
  readonly symbolDimmingAlpha: number;
  readonly requestedState: string | null;
  readonly resolvedState: string | null;
  readonly isOnce: boolean;
  readonly onceCompletionCount: number | null;
  readonly visibleSymbol: number;
  readonly presentationValue: number | null;
  readonly occupied: boolean;
}

export interface RenderGridCellReelSetSnapshot {
  readonly spinning: boolean;
  readonly completed: boolean;
  readonly visibleScene: SceneMatrix;
  readonly cells: readonly RenderGridCellReelCellSnapshot[];
  readonly effects: GridCellEffectSnapshot | null;
}
