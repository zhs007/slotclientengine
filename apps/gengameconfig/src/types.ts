export interface CliConfig {
  paytablePath: string;
  reelPaths: string[];
  numberWeightPaths: string[];
  outPath: string;
}

export interface NumberWeightEntry {
  value: number;
  weight: number;
}

export interface NumberWeightTable {
  name: string;
  entries: NumberWeightEntry[];
}

export interface PaytableEntry {
  code: number;
  symbol: string;
  pays: number[];
}

export interface PaytableModel {
  paytable: Record<string, PaytableEntry>;
  symbolCodes: Record<string, number>;
  entriesInRowOrder: PaytableEntry[];
}

export interface ReelModel {
  key: string;
  reels: number[][];
}

export interface GameConfig {
  paytable: Record<string, PaytableEntry>;
  symbolCodes: Record<string, number>;
  reels: Record<string, number[][]>;
  numberWeightTables?: Record<string, NumberWeightEntry[]>;
}
