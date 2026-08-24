import type { SymbolGroup, SymbolHandle } from "../symbol/index.js";
import type { RenderAnchor } from "../presentation/render-anchor.js";
import type { RenderPoint } from "../presentation/render-object.js";

export interface SymbolPosition {
  readonly x: number;
  readonly y: number;
}

export interface SymbolReplacementTarget {
  readonly code: number;
  readonly value?: number | null;
}

export interface SymbolReplacement {
  readonly position: SymbolPosition;
  readonly target: SymbolReplacementTarget;
}

export interface SymbolArea {
  getSymbol(position: SymbolPosition): SymbolHandle;
  getSymbols(positions: readonly SymbolPosition[]): SymbolGroup;
  /** Adds or updates settled cell dimming at the selected positions, including empty cells. */
  setSymbolDimming(
    dimmedPositions: readonly SymbolPosition[],
    dimmingAlpha: number,
  ): void;
  clearSymbolDimming(): void;
  /** Stable logical cell-center anchor. It remains valid while the cell spins. */
  getCellAnchor(position: SymbolPosition): RenderAnchor;
  /** Resolves any valid RenderCore anchor into this area's local coordinates. */
  resolveAnchor(anchor: RenderAnchor): RenderPoint;
}

export interface SymbolMutationArea extends SymbolArea {
  replaceSymbol(
    position: SymbolPosition,
    target: SymbolReplacementTarget,
  ): SymbolHandle;
  replaceSymbols(replacements: readonly SymbolReplacement[]): SymbolGroup;
}
