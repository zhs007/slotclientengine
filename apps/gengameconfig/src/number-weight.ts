import { basename, extname } from "node:path";
import {
  findLastNonEmptyColumn,
  findLastNonEmptyRow,
  readFirstWorksheet,
  requireNonNegativeIntegerCell,
  requireTextCell,
  type WorksheetMatrix,
} from "./excel";
import { fail, failAtCell } from "./errors";
import type { NumberWeightTable } from "./types";

const MAX_TOTAL_WEIGHT = 0x1_0000_0000;
const TABLE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseNumberWeightWorkbook(filePath: string): NumberWeightTable {
  const fileName = basename(filePath);
  const name = fileName.slice(0, fileName.length - extname(fileName).length);
  if (!TABLE_NAME_PATTERN.test(name)) {
    fail(
      `${filePath}: number weight table 文件名必须是 lowercase ASCII kebab-case`,
    );
  }
  return parseNumberWeightSheet(readFirstWorksheet(filePath), name);
}

export function parseNumberWeightSheet(
  sheet: WorksheetMatrix,
  name: string,
): NumberWeightTable {
  if (!TABLE_NAME_PATTERN.test(name)) {
    fail(
      `${sheet.filePath}: number weight table name 必须是 lowercase ASCII kebab-case`,
    );
  }

  const lastRow = findLastNonEmptyRow(sheet);
  const lastCol = findLastNonEmptyColumn(sheet);
  if (lastRow < 1) {
    fail(
      `${sheet.filePath} / ${sheet.sheetName}: number weight table 必须包含表头和至少一行数据`,
    );
  }
  if (lastCol !== 1) {
    fail(
      `${sheet.filePath} / ${sheet.sheetName}: number weight table 只能包含 val、weight 两列`,
    );
  }

  const valueHeader = requireTextCell(
    sheet.cells[0][0],
    "number weight 表头第 1 列",
  );
  const weightHeader = requireTextCell(
    sheet.cells[0][1],
    "number weight 表头第 2 列",
  );
  if (valueHeader !== "val") {
    failAtCell(
      sheet.cells[0][0],
      `number weight 表头第 1 列必须是 val，实际为 ${valueHeader}`,
    );
  }
  if (weightHeader !== "weight") {
    failAtCell(
      sheet.cells[0][1],
      `number weight 表头第 2 列必须是 weight，实际为 ${weightHeader}`,
    );
  }

  const entries: NumberWeightTable["entries"] = [];
  const seenValues = new Set<number>();
  let totalWeight = 0;
  for (let rowIndex = 1; rowIndex <= lastRow; rowIndex += 1) {
    const row = sheet.cells[rowIndex];
    requirePresentNumberWeightCell(row[0], "val");
    requirePresentNumberWeightCell(row[1], "weight");
    const value = requireNonNegativeIntegerCell(row[0], "val");
    const weight = requireNonNegativeIntegerCell(row[1], "weight");
    if (value === 0) {
      failAtCell(row[0], "val 必须是正安全整数，0 保留给无值 otherScene cell");
    }
    if (weight === 0) {
      failAtCell(row[1], "weight 必须是正安全整数");
    }
    if (seenValues.has(value)) {
      failAtCell(row[0], `重复 val：${value}`);
    }
    seenValues.add(value);
    totalWeight += weight;
    if (!Number.isSafeInteger(totalWeight) || totalWeight > MAX_TOTAL_WEIGHT) {
      failAtCell(row[1], `weight 总和必须在 1..${MAX_TOTAL_WEIGHT} 之间`);
    }
    entries.push({ value, weight });
  }

  return { name, entries };
}

function requirePresentNumberWeightCell(
  raw: WorksheetMatrix["cells"][number][number],
  label: string,
): void {
  const cell = raw.cell;
  if (!cell || cell.v === undefined || cell.v === null || cell.t === "z") {
    failAtCell(raw, `${label} 必须是非负安全整数，实际值为 空`);
  }
  if (
    (cell.t === "s" || String(cell.t) === "str") &&
    String(cell.v).trim() === ""
  ) {
    failAtCell(raw, `${label} 不能为空`);
  }
}
