import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";

const tempDirs: string[] = [];

export function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gengameconfig-test-"));
  tempDirs.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function writeWorkbook(
  filePath: string,
  rows: unknown[][],
  patches: Record<string, XLSX.CellObject> = {},
): void {
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  for (const [address, cell] of Object.entries(patches)) {
    sheet[address] = cell;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  XLSX.writeFile(workbook, filePath);
}

export function validPaytableRows(): unknown[][] {
  return [
    ["Code", "Symbol", "X1", "X2"],
    [0, "WL", 0, 0],
    [1, "H1", 0, 10],
  ];
}

export function validReelsRows(): unknown[][] {
  return [
    ["line", "R1", "R2"],
    [0, "WL", "H1"],
    [1, "H1", "WL"],
  ];
}
