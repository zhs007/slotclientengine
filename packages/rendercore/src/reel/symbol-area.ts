import type { SymbolRender } from "../symbol/index.js";

export interface SymbolPosition {
  readonly x: number;
  readonly y: number;
}

export interface SymbolArea {
  getSymbol(position: SymbolPosition): SymbolRender;
}
