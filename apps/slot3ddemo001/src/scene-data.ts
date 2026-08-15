import { WALL_COLUMNS, WALL_ROWS } from "./config.js";

export const SYMBOL_CODES = ["megalith-a", "megalith-b"] as const;

export type SymbolCode = (typeof SYMBOL_CODES)[number];
export type MegalithScene = readonly (readonly SymbolCode[])[];

export function createRandomScene(
  random: () => number = Math.random,
): MegalithScene {
  const columns: SymbolCode[][] = [];
  for (let column = 0; column < WALL_COLUMNS; column += 1) {
    const rows: SymbolCode[] = [];
    for (let row = 0; row < WALL_ROWS; row += 1) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new RangeError(
          "Random source must return a finite value in [0, 1). ",
        );
      }
      rows.push(SYMBOL_CODES[Math.floor(value * SYMBOL_CODES.length)]!);
    }
    columns.push(rows);
  }
  return Object.freeze(columns.map((column) => Object.freeze([...column])));
}

export function formatScene(scene: MegalithScene): string {
  assertMegalithScene(scene);
  const labels: Record<SymbolCode, string> = {
    "megalith-a": "A",
    "megalith-b": "B",
  };
  const lines: string[] = [];
  for (let row = WALL_ROWS - 1; row >= 0; row -= 1) {
    lines.push(scene.map((column) => labels[column[row]!]).join("  "));
  }
  return lines.join("\n");
}

export function assertMegalithScene(
  scene: MegalithScene,
): asserts scene is MegalithScene {
  if (scene.length !== WALL_COLUMNS) {
    throw new RangeError(
      `Megalith scene must contain exactly ${WALL_COLUMNS} columns.`,
    );
  }
  for (const [columnIndex, column] of scene.entries()) {
    if (column.length !== WALL_ROWS) {
      throw new RangeError(
        `Megalith scene column ${columnIndex} must contain exactly ${WALL_ROWS} rows.`,
      );
    }
    for (const code of column) {
      if (!SYMBOL_CODES.includes(code)) {
        throw new RangeError(`Unknown megalith symbol code: ${String(code)}.`);
      }
    }
  }
}
