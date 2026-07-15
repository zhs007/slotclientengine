import type { Container } from "pixi.js";
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
  | "complete"
  | "destroyed";

export interface SymbolCascadeSnapshot {
  readonly phase: SymbolCascadePhase;
  readonly currentIndex: number | null;
  readonly componentName: string | null;
  readonly resultIndex: number | null;
  readonly amountVisible: boolean;
  readonly amountText: string;
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
