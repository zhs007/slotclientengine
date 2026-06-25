import * as XLSX from "xlsx";
import { fail, failAtCell } from "./errors";

export interface RawCell {
  filePath: string;
  sheetName: string;
  rowIndex: number;
  colIndex: number;
  address: string;
  cell: XLSX.CellObject | undefined;
}

export interface WorksheetMatrix {
  filePath: string;
  sheetName: string;
  cells: RawCell[][];
  rowCount: number;
  colCount: number;
}

export function readFirstWorksheet(filePath: string): WorksheetMatrix {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.readFile(filePath, {
      cellDates: true,
      cellFormula: true,
      raw: true,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`${filePath}: 读取 xlsx 失败：${detail}`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    fail(`${filePath}: 工作簿没有 worksheet`);
  }

  const sheet = workbook.Sheets[sheetName];
  const ref = sheet["!ref"];
  if (!ref) {
    fail(`${filePath} / ${sheetName}: worksheet 为空`);
  }

  const range = XLSX.utils.decode_range(ref);
  if (range.s.r !== 0 || range.s.c !== 0) {
    fail(`${filePath} / ${sheetName}: 表格必须从 A1 开始`);
  }

  const rowCount = range.e.r + 1;
  const colCount = range.e.c + 1;
  const cells: RawCell[][] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row: RawCell[] = [];
    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      row.push({
        filePath,
        sheetName,
        rowIndex,
        colIndex,
        address,
        cell: sheet[address],
      });
    }
    cells.push(row);
  }

  return {
    filePath,
    sheetName,
    cells,
    rowCount,
    colCount,
  };
}

export function findLastNonEmptyRow(sheet: WorksheetMatrix): number {
  for (let rowIndex = sheet.rowCount - 1; rowIndex >= 0; rowIndex -= 1) {
    if (sheet.cells[rowIndex].some((cell) => !isBlankCell(cell))) {
      return rowIndex;
    }
  }

  return -1;
}

export function findLastNonEmptyColumn(sheet: WorksheetMatrix): number {
  for (let colIndex = sheet.colCount - 1; colIndex >= 0; colIndex -= 1) {
    for (let rowIndex = 0; rowIndex < sheet.rowCount; rowIndex += 1) {
      if (!isBlankCell(sheet.cells[rowIndex][colIndex])) {
        return colIndex;
      }
    }
  }

  return -1;
}

export function isBlankCell(raw: RawCell): boolean {
  const cell = raw.cell;
  if (!cell) {
    return true;
  }

  if (hasFormula(cell)) {
    return false;
  }

  if (cell.v === undefined || cell.v === null || cell.t === "z") {
    return true;
  }

  if (isTextCellType(cell.t) && String(cell.v).trim() === "") {
    return true;
  }

  return false;
}

export function requireTextCell(raw: RawCell, label: string): string {
  ensureNotFormula(raw, label);

  const value = readCellText(raw, label);
  if (!value) {
    failAtCell(raw, `${label} 不能为空`);
  }

  return value;
}

export function readOptionalTextCell(
  raw: RawCell,
  label: string,
): string | undefined {
  if (isBlankCell(raw)) {
    return undefined;
  }

  ensureNotFormula(raw, label);

  const value = readCellText(raw, label);
  return value || undefined;
}

export function requireNonNegativeIntegerCell(
  raw: RawCell,
  label: string,
): number {
  ensureNotFormula(raw, label);

  const value = readCellInteger(raw, label);
  if (!Number.isSafeInteger(value) || value < 0) {
    failAtCell(raw, `${label} 必须是非负安全整数，实际值为 ${String(value)}`);
  }

  return value;
}

function ensureNotFormula(raw: RawCell, label: string): void {
  if (raw.cell && hasFormula(raw.cell)) {
    failAtCell(raw, `${label} 不允许使用公式单元格`);
  }
}

function hasFormula(cell: XLSX.CellObject): boolean {
  return typeof cell.f === "string" && cell.f.length > 0;
}

function isTextCellType(cellType: XLSX.ExcelDataType | undefined): boolean {
  return cellType === "s" || String(cellType) === "str";
}

function readCellText(raw: RawCell, label: string): string {
  const cell = raw.cell;
  if (!cell || cell.v === undefined || cell.v === null || cell.t === "z") {
    failAtCell(raw, `${label} 不能为空`);
  }

  if (isTextCellType(cell.t)) {
    return String(cell.v).trim();
  }

  if (cell.t === "n" && typeof cell.v === "number" && Number.isFinite(cell.v)) {
    return String(cell.w ?? cell.v).trim();
  }

  failAtCell(raw, `${label} 必须是文本或数值内容，实际为 ${describeCell(raw)}`);
}

function readCellInteger(raw: RawCell, label: string): number {
  const cell = raw.cell;
  if (!cell || cell.v === undefined || cell.v === null || cell.t === "z") {
    failAtCell(raw, `${label} 不能为空`);
  }

  if (cell.t === "n" && typeof cell.v === "number") {
    return cell.v;
  }

  if (isTextCellType(cell.t)) {
    const value = String(cell.v).trim();
    if (!/^\d+$/.test(value)) {
      failAtCell(raw, `${label} 必须是非负安全整数，实际值为 ${value || "空"}`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      failAtCell(raw, `${label} 必须是非负安全整数，实际值为 ${value}`);
    }
    return parsed;
  }

  failAtCell(
    raw,
    `${label} 必须是数值或整数文本内容，实际为 ${describeCell(raw)}`,
  );
}

function describeCell(raw: RawCell): string {
  const cell = raw.cell;
  if (!cell) {
    return "空单元格";
  }

  if (hasFormula(cell)) {
    return "公式单元格";
  }

  switch (String(cell.t)) {
    case "n":
      return "数值";
    case "s":
    case "str":
      return "文本";
    case "b":
      return "布尔";
    case "d":
      return "日期";
    case "e":
      return "错误";
    case "z":
      return "空单元格";
    default:
      return `未知类型 ${String(cell.t)}`;
  }
}
