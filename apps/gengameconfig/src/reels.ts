import { basename, extname } from "node:path";
import {
  findLastNonEmptyColumn,
  isBlankCell,
  readFirstWorksheet,
  readOptionalTextCell,
  requireTextCell,
  type RawCell,
  type WorksheetMatrix,
} from "./excel";
import { fail, failAtCell } from "./errors";
import type { ReelModel } from "./types";

export function parseReelsWorkbook(
  filePath: string,
  symbolCodes: Record<string, number>,
): ReelModel {
  return {
    key: getReelKey(filePath),
    reels: parseReelsSheet(readFirstWorksheet(filePath), symbolCodes),
  };
}

export function getReelKey(filePath: string): string {
  const extension = extname(filePath);
  return basename(filePath, extension);
}

export function parseReelsSheet(
  sheet: WorksheetMatrix,
  symbolCodes: Record<string, number>,
): number[][] {
  const lastCol = findLastNonEmptyColumn(sheet);

  if (lastCol < 1) {
    fail(`${sheet.filePath} / ${sheet.sheetName}: reels 必须包含 line 和至少一个 R 列`);
  }

  validateReelsHeader(sheet, lastCol);

  const lastRow = findLastReelDataRow(sheet, lastCol);
  if (lastRow < 1) {
    fail(`${sheet.filePath} / ${sheet.sheetName}: reels 必须包含表头和至少一行数据`);
  }

  const reels: number[][] = Array.from({ length: lastCol }, () => []);
  const endedReels = Array.from({ length: lastCol }, () => false);

  for (let rowIndex = 1; rowIndex <= lastRow; rowIndex += 1) {
    const row = sheet.cells[rowIndex];
    if (isBlankReelRow(row, lastCol)) {
      continue;
    }

    for (let colIndex = 1; colIndex <= lastCol; colIndex += 1) {
      const symbol = readOptionalTextCell(row[colIndex], `R${colIndex}`);
      if (symbol === undefined) {
        endedReels[colIndex - 1] = true;
        continue;
      }

      if (endedReels[colIndex - 1]) {
        failAtCell(row[colIndex], `R${colIndex} 在尾部空白后又出现 symbol：${symbol}`);
      }

      if (!Object.prototype.hasOwnProperty.call(symbolCodes, symbol)) {
        failAtCell(row[colIndex], `未知 symbol：${symbol}`);
      }

      reels[colIndex - 1].push(symbolCodes[symbol]);
    }
  }

  return reels;
}

function findLastReelDataRow(sheet: WorksheetMatrix, lastCol: number): number {
  for (let rowIndex = sheet.rowCount - 1; rowIndex >= 1; rowIndex -= 1) {
    if (!isBlankReelRow(sheet.cells[rowIndex], lastCol)) {
      return rowIndex;
    }
  }

  return -1;
}

function isBlankReelRow(row: readonly RawCell[], lastCol: number): boolean {
  for (let colIndex = 1; colIndex <= lastCol; colIndex += 1) {
    if (!isBlankCell(row[colIndex])) {
      return false;
    }
  }

  return true;
}

function validateReelsHeader(sheet: WorksheetMatrix, lastCol: number): void {
  const header = sheet.cells[0];
  const lineHeader = requireTextCell(header[0], "reels 表头第 1 列");
  if (lineHeader !== "line") {
    failAtCell(header[0], `reels 表头第 1 列必须是 line，实际为 ${lineHeader}`);
  }

  for (let colIndex = 1; colIndex <= lastCol; colIndex += 1) {
    const expected = `R${colIndex}`;
    const actual = requireTextCell(header[colIndex], `reels 表头第 ${colIndex + 1} 列`);
    if (actual !== expected) {
      failAtCell(header[colIndex], `reels R 列必须连续，期望 ${expected}，实际为 ${actual}`);
    }
  }
}
