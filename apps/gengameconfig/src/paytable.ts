import {
  findLastNonEmptyColumn,
  findLastNonEmptyRow,
  readFirstWorksheet,
  requireNonNegativeIntegerCell,
  requireTextCell,
  type WorksheetMatrix,
} from "./excel";
import { fail, failAtCell } from "./errors";
import type { PaytableEntry, PaytableModel } from "./types";

export function parsePaytableWorkbook(filePath: string): PaytableModel {
  return parsePaytableSheet(readFirstWorksheet(filePath));
}

export function parsePaytableSheet(sheet: WorksheetMatrix): PaytableModel {
  const lastRow = findLastNonEmptyRow(sheet);
  const lastCol = findLastNonEmptyColumn(sheet);

  if (lastRow < 1) {
    fail(`${sheet.filePath} / ${sheet.sheetName}: paytable 必须包含表头和至少一行数据`);
  }

  if (lastCol < 2) {
    fail(`${sheet.filePath} / ${sheet.sheetName}: paytable 必须包含 Code、Symbol 和至少一个 X 列`);
  }

  validatePaytableHeader(sheet, lastCol);

  const entriesInRowOrder: PaytableEntry[] = [];
  const seenCodes = new Set<number>();
  const seenSymbols = new Set<string>();
  const symbolCodes: Record<string, number> = {};

  for (let rowIndex = 1; rowIndex <= lastRow; rowIndex += 1) {
    const row = sheet.cells[rowIndex];
    const code = requireNonNegativeIntegerCell(row[0], "Code");
    const symbol = requireTextCell(row[1], "Symbol");

    if (seenCodes.has(code)) {
      failAtCell(row[0], `重复 Code：${code}`);
    }

    if (seenSymbols.has(symbol)) {
      failAtCell(row[1], `重复 Symbol：${symbol}`);
    }

    const pays: number[] = [];
    for (let colIndex = 2; colIndex <= lastCol; colIndex += 1) {
      pays.push(requireNonNegativeIntegerCell(row[colIndex], `X${colIndex - 1}`));
    }

    const entry: PaytableEntry = {
      code,
      symbol,
      pays,
    };

    seenCodes.add(code);
    seenSymbols.add(symbol);
    symbolCodes[symbol] = code;
    entriesInRowOrder.push(entry);
  }

  const paytable: Record<string, PaytableEntry> = {};
  for (const entry of [...entriesInRowOrder].sort((left, right) => left.code - right.code)) {
    paytable[String(entry.code)] = entry;
  }

  return {
    paytable,
    symbolCodes,
    entriesInRowOrder,
  };
}

function validatePaytableHeader(sheet: WorksheetMatrix, lastCol: number): void {
  const header = sheet.cells[0];
  const codeHeader = requireTextCell(header[0], "paytable 表头第 1 列");
  if (codeHeader !== "Code") {
    failAtCell(header[0], `paytable 表头第 1 列必须是 Code，实际为 ${codeHeader}`);
  }

  const symbolHeader = requireTextCell(header[1], "paytable 表头第 2 列");
  if (symbolHeader !== "Symbol") {
    failAtCell(header[1], `paytable 表头第 2 列必须是 Symbol，实际为 ${symbolHeader}`);
  }

  for (let colIndex = 2; colIndex <= lastCol; colIndex += 1) {
    const expected = `X${colIndex - 1}`;
    const actual = requireTextCell(header[colIndex], `paytable 表头第 ${colIndex + 1} 列`);
    if (actual !== expected) {
      failAtCell(header[colIndex], `paytable X 列必须连续，期望 ${expected}，实际为 ${actual}`);
    }
  }
}
