import type {
  GameLogic,
  GameLogicStep,
  LogicComponent,
  SceneMatrix,
  WinResult,
  WinResultPosition,
} from "@slotclientengine/logiccore";
import type { Container } from "pixi.js";
import type { VisibleSymbolPresentationTarget } from "../reel/index.js";

export interface SymbolWinAmountResolverContext {
  readonly componentName: string;
  readonly stepIndex: number;
  readonly resultIndex: number;
  readonly result: WinResult;
}

export type SymbolWinAmountResolver = (
  context: SymbolWinAmountResolverContext,
) => number;

export interface SymbolWinCarouselGroup extends SymbolWinAmountResolverContext {
  readonly positions: readonly WinResultPosition[];
  readonly amount: number;
}

export interface SymbolWinComponentValidationContext {
  readonly logic: GameLogic;
  readonly step: GameLogicStep;
  readonly componentName: string;
  readonly component: LogicComponent;
  readonly groups: readonly SymbolWinCarouselGroup[];
}

export type SymbolWinComponentValidator = (
  context: SymbolWinComponentValidationContext,
) => void;

export interface SymbolWinAmountTextOptions {
  readonly yOffsetRatioFromCellCenter: number;
  readonly fontSize: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

export interface CreateSymbolWinCarouselOptions {
  readonly target: VisibleSymbolPresentationTarget;
  readonly resolveAmount: SymbolWinAmountResolver;
  readonly validateComponent?: SymbolWinComponentValidator;
  readonly formatAmount: (amount: number) => string;
  readonly cyclePauseSeconds: number;
  readonly amountText: SymbolWinAmountTextOptions;
}

export interface SymbolWinCarouselStartInput {
  readonly logic: GameLogic;
  readonly stepIndex: number;
  readonly scene: SceneMatrix;
  readonly componentNames: readonly string[];
}

export interface PreparedSymbolWinCarousel {
  readonly groupCount: number;
  readonly groups: readonly SymbolWinCarouselGroup[];
}

export type SymbolWinCarouselPhase =
  | "idle"
  | "playing"
  | "cycle-pause"
  | "destroyed";

export interface SymbolWinCarouselSnapshot {
  readonly phase: SymbolWinCarouselPhase;
  readonly firstCycleComplete: boolean;
  readonly currentIndex: number | null;
  readonly componentName: string | null;
  readonly resultIndex: number | null;
  readonly amountVisible: boolean;
  readonly amountText: string;
  readonly amountPosition: { readonly x: number; readonly y: number } | null;
}

export interface SymbolWinCarouselStartResult {
  readonly started: boolean;
}

export interface SymbolWinCarouselUpdateResult {
  readonly firstCycleComplete: boolean;
}

export interface SymbolWinCarousel {
  readonly container: Container;
  readonly firstCycleComplete: boolean;
  prepare(input: SymbolWinCarouselStartInput): PreparedSymbolWinCarousel;
  start(prepared: PreparedSymbolWinCarousel): SymbolWinCarouselStartResult;
  clear(): void;
  update(deltaSeconds: number): SymbolWinCarouselUpdateResult;
  getSnapshot(): SymbolWinCarouselSnapshot;
  destroy(): void;
}
