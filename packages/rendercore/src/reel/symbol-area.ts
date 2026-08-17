import type { SymbolGroup, SymbolHandle } from "../symbol/index.js";

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
}

export interface SymbolMutationArea extends SymbolArea {
  replaceSymbol(
    position: SymbolPosition,
    target: SymbolReplacementTarget,
  ): SymbolHandle;
  replaceSymbols(replacements: readonly SymbolReplacement[]): SymbolGroup;
}
