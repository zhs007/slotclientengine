export interface CliConfig {
  paytablePath: string;
  reelPaths: string[];
  outPath: string;
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
}
