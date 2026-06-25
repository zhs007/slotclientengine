import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePaytableWorkbook } from "../src/paytable";
import { parseReelsWorkbook } from "../src/reels";
import {
  cleanupTempDirs,
  createTempDir,
  validReelsRows,
  writeWorkbook,
} from "./workbook-helpers";

const assetPaytable = resolve(
  __dirname,
  "../../../assets/gamecfg/paytables.xlsx",
);
const assetReel = resolve(__dirname, "../../../assets/gamecfg/bg-reel01.xlsx");
const basicSymbolCodes = {
  WL: 0,
  H1: 1,
};

describe("parseReelsWorkbook", () => {
  afterEach(() => {
    cleanupTempDirs();
  });

  it("parses the repository reel fixture", () => {
    const paytable = parsePaytableWorkbook(assetPaytable);
    const model = parseReelsWorkbook(assetReel, paytable.symbolCodes);

    expect(model.key).toBe("bg-reel01");
    expect(model.reels).toHaveLength(6);
    expect(model.reels[0].slice(0, 12)).toEqual([
      1, 2, 6, 3, 1, 2, 7, 8, 1, 8, 7, 7,
    ]);
    expect(model.reels[1].slice(0, 12)).toEqual([
      1, 9, 3, 9, 0, 10, 6, 10, 1, 8, 4, 5,
    ]);
    expect(model.reels[2].slice(0, 12)).toEqual([
      1, 11, 2, 6, 1, 3, 5, 10, 1, 10, 4, 5,
    ]);
    expect(model.reels[3].slice(0, 12)).toEqual([
      2, 7, 8, 7, 1, 6, 2, 4, 1, 2, 9, 4,
    ]);
    expect(model.reels[4].slice(0, 12)).toEqual([
      1, 8, 6, 11, 1, 7, 5, 7, 1, 8, 8, 6,
    ]);
    expect(model.reels[5].slice(0, 12)).toEqual([
      1, 8, 6, 11, 1, 7, 5, 7, 1, 8, 8, 6,
    ]);
  });

  it("keeps different reel lengths without padding", () => {
    const file = writeReels([
      ["line", "R1", "R2"],
      [0, "WL", "H1"],
      [1, "H1", undefined],
      [2, "WL", undefined],
    ]);

    expect(parseReelsWorkbook(file, basicSymbolCodes).reels).toEqual([
      [0, 1, 0],
      [1],
    ]);
  });

  it("rejects unknown symbols", () => {
    const file = writeReels([
      ["line", "R1"],
      [0, "NOPE"],
    ]);

    expect(() => parseReelsWorkbook(file, basicSymbolCodes)).toThrow(
      "未知 symbol：NOPE",
    );
  });

  it("accepts numeric R cell content when the symbol exists", () => {
    const file = writeReels([
      ["line", "R1"],
      [0, 1],
    ]);

    expect(parseReelsWorkbook(file, { "1": 7 }).reels).toEqual([[7]]);
  });

  it("reports numeric R cell content as an unknown symbol when it is not configured", () => {
    const file = writeReels([
      ["line", "R1"],
      [0, 1],
    ]);

    expect(() => parseReelsWorkbook(file, basicSymbolCodes)).toThrow(
      "未知 symbol：1",
    );
  });

  it.each([
    ["boolean", true],
    ["date", new Date("2026-01-01T00:00:00Z")],
  ])("rejects invalid R cell: %s", (_label, value) => {
    const file = writeReels([
      ["line", "R1"],
      [0, value],
    ]);

    expect(() => parseReelsWorkbook(file, basicSymbolCodes)).toThrow("R1");
  });

  it("rejects formula R cells", () => {
    const file = writeReels(validReelsRows(), {
      B2: { t: "s", f: '"WL"', v: "WL" },
    });

    expect(() => parseReelsWorkbook(file, basicSymbolCodes)).toThrow(
      "R1 不允许使用公式单元格",
    );
  });

  it.each([
    ["empty", undefined],
    ["negative", -1],
    ["float", 1.2],
    ["decimal string", "1"],
    ["boolean", true],
    ["date", new Date("2026-01-01T00:00:00Z")],
  ])("ignores line cell data: %s", (_label, value) => {
    const file = writeReels([
      ["line", "R1"],
      [value, "WL"],
    ]);

    expect(parseReelsWorkbook(file, basicSymbolCodes).reels).toEqual([[0]]);
  });

  it("ignores formula line cells", () => {
    const file = writeReels(validReelsRows(), {
      A2: { t: "n", f: "1+1", v: 2 },
    });

    expect(parseReelsWorkbook(file, basicSymbolCodes).reels).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("ignores numeric lines whose formatted text looks like an integer", () => {
    const file = writeReels(validReelsRows(), {
      A2: { t: "n", v: 1.2, w: "1" },
    });

    expect(parseReelsWorkbook(file, basicSymbolCodes).reels).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("ignores rows with no R data without ending reel columns", () => {
    const file = writeReels([
      ["line", "R1", "R2"],
      [0, "WL", "H1"],
      [1, undefined, undefined],
      [2, "H1", "WL"],
      [3, undefined, undefined],
    ]);

    expect(parseReelsWorkbook(file, basicSymbolCodes).reels).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("rejects non-continuous R headers", () => {
    const file = writeReels([
      ["line", "R1", "R3"],
      [0, "WL", "H1"],
    ]);

    expect(() => parseReelsWorkbook(file, basicSymbolCodes)).toThrow(
      "reels R 列必须连续",
    );
  });

  it("rejects symbols after a reel column has ended", () => {
    const file = writeReels([
      ["line", "R1", "R2"],
      [0, "WL", "H1"],
      [1, undefined, "WL"],
      [2, "H1", "H1"],
    ]);

    expect(() => parseReelsWorkbook(file, basicSymbolCodes)).toThrow(
      "在尾部空白后又出现 symbol",
    );
  });
});

function writeReels(rows: unknown[], patches = {}): string {
  const dir = createTempDir();
  const file = join(dir, "reels.xlsx");
  writeWorkbook(file, rows as unknown[][], patches);
  return file;
}
