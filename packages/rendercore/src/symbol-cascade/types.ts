import type { Container } from "pixi.js";
import type { SymbolCascadeWinPresentationMap } from "../symbol/index.js";
import type { VisibleSymbolPresentationTarget } from "../reel/index.js";
import type {
  SymbolWinAmountTextOptions,
  SymbolWinCarouselGroup,
} from "../symbol-win-carousel/index.js";

export interface SymbolCascadeTarget extends VisibleSymbolPresentationTarget {
  hasVisibleSymbolStateCapability(x: number, y: number, state: string): boolean;
  releaseVisibleSymbols(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void;
  setVisibleSymbolDimming(
    highlightedPositions: readonly { readonly x: number; readonly y: number }[],
    dimmingAlpha: number,
  ): void;
  clearVisibleSymbolDimming(): void;
}

export interface SymbolCascadeGroup extends SymbolWinCarouselGroup {
  readonly removePositions: readonly {
    readonly x: number;
    readonly y: number;
  }[];
}

export interface CreateSymbolCascadePlayerOptions {
  readonly target: SymbolCascadeTarget;
  readonly formatAmount: (amount: number) => string;
  readonly amountText: SymbolWinAmountTextOptions;
  readonly emphasisSeconds: number;
  readonly dimmingInSeconds: number;
  readonly dimmingOutSeconds: number;
  readonly nonWinningDimmingAlpha: number;
  readonly startPresentationsWithEmphasis?: boolean;
  readonly winSummaryCollect?: WinSummaryCollectOptions;
}

export interface SymbolCascadeGroupContext {
  readonly group: SymbolCascadeGroup;
  readonly groupIndex: number;
}

export interface SymbolCascadeGroupPositionContext extends SymbolCascadeGroupContext {
  readonly position: Readonly<{ readonly x: number; readonly y: number }>;
  readonly positionIndex: number;
}

export interface SymbolCascadeResolvedPositionContext extends SymbolCascadeGroupPositionContext {
  readonly groupSymbol: string;
  readonly symbol: string;
}

export interface SymbolWinSummaryTextStyle {
  readonly fontSize: number;
  readonly fontWeight: "900" | 900;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

export interface WinSummaryCollectOptions {
  readonly presentations: SymbolCascadeWinPresentationMap;
  readonly resolveGroupSymbol: (context: SymbolCascadeGroupContext) => string;
  readonly resolveSymbol: (
    context: SymbolCascadeGroupPositionContext,
  ) => string;
  readonly allowCompanionPosition?: (
    context: SymbolCascadeResolvedPositionContext,
  ) => boolean;
  readonly resolveGroupAmount: (context: SymbolCascadeGroupContext) => number;
  readonly resolveItemAmount: (
    context: SymbolCascadeGroupPositionContext,
  ) => number;
  readonly sortItems: (
    items: readonly SymbolCascadeGroupPositionContext[],
  ) => readonly SymbolCascadeGroupPositionContext[];
  readonly formatter: (value: number) => string;
  readonly countDurationSeconds: number;
  readonly sequentialCollectStartIntervalSeconds?: number;
  readonly position: Readonly<{ readonly x: number; readonly y: number }>;
  readonly textStyle: SymbolWinSummaryTextStyle;
}

export interface PreparedSymbolCascade {
  readonly groups: readonly SymbolCascadeGroup[];
  readonly groupCount: number;
}

export type SymbolCascadePhase =
  | "idle"
  | "emphasis"
  | "win"
  | "remove"
  | "collect-start"
  | "collect-loop"
  | "collect-item"
  | "collect-remove"
  | "complete"
  | "destroyed";

export interface SymbolCascadeSnapshot {
  readonly phase: SymbolCascadePhase;
  readonly currentIndex: number | null;
  readonly componentName: string | null;
  readonly resultIndex: number | null;
  readonly amountVisible: boolean;
  readonly amountText: string;
  readonly currentItemIndex: number | null;
  readonly currentItemPosition: Readonly<{
    readonly x: number;
    readonly y: number;
  }> | null;
  readonly summaryCurrentValue: number;
  readonly summaryTargetValue: number;
  readonly summaryVisible: boolean;
  readonly summaryCounting: boolean;
}

export interface SymbolCascadePlayer {
  readonly container: Container;
  prepare(groups: readonly SymbolCascadeGroup[]): PreparedSymbolCascade;
  start(prepared: PreparedSymbolCascade): void;
  update(deltaSeconds: number): { readonly completed: boolean };
  clear(): void;
  getSnapshot(): SymbolCascadeSnapshot;
  destroy(): void;
}
