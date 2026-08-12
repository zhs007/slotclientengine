import type { SymbolGroup, SymbolRender } from "../symbol/index.js";

export interface SymbolPosition {
  readonly x: number;
  readonly y: number;
}

export interface SymbolArea {
  getSymbol(position: SymbolPosition): SymbolRender;
  getSymbols(positions: readonly SymbolPosition[]): SymbolGroup;
}
