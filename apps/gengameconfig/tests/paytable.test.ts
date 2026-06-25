import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePaytableWorkbook } from "../src/paytable";
import {
  cleanupTempDirs,
  createTempDir,
  validPaytableRows,
  writeWorkbook,
} from "./workbook-helpers";

const assetPaytable = resolve(
  __dirname,
  "../../../assets/gamecfg/paytables.xlsx",
);

describe("parsePaytableWorkbook", () => {
  afterEach(() => {
    cleanupTempDirs();
  });

  it("parses the repository paytable fixture", () => {
    const model = parsePaytableWorkbook(assetPaytable);

    expect(Object.keys(model.paytable)).toHaveLength(20);
    expect(model.paytable["0"]).toEqual({
      code: 0,
      symbol: "WL",
      pays: [0, 0, 0, 0, 0, 0],
    });
    expect(model.paytable["1"]).toEqual({
      code: 1,
      symbol: "H1",
      pays: [0, 10, 15, 20, 25, 50],
    });
    expect(model.paytable["12"]).toEqual({
      code: 12,
      symbol: "SC",
      pays: [0, 0, 10, 20, 30, 50],
    });
    expect(model.paytable["19"]).toEqual({
      code: 19,
      symbol: "JK",
      pays: [0, 0, 0, 0, 0, 0],
    });
    expect(model.symbolCodes.H1).toBe(1);
    expect(model.symbolCodes.WL).toBe(0);
    expect(model.symbolCodes.JK).toBe(19);
  });

  it("rejects duplicate code", () => {
    const file = writePaytable([
      ["Code", "Symbol", "X1"],
      [0, "WL", 0],
      [0, "H1", 10],
    ]);

    expect(() => parsePaytableWorkbook(file)).toThrow("重复 Code：0");
  });

  it("rejects duplicate symbol", () => {
    const file = writePaytable([
      ["Code", "Symbol", "X1"],
      [0, "WL", 0],
      [1, "WL", 10],
    ]);

    expect(() => parsePaytableWorkbook(file)).toThrow("重复 Symbol：WL");
  });

  it("rejects missing Code or Symbol header", () => {
    expect(() =>
      parsePaytableWorkbook(
        writePaytable([
          ["Cod", "Symbol", "X1"],
          [0, "WL", 0],
        ]),
      ),
    ).toThrow("必须是 Code");

    expect(() =>
      parsePaytableWorkbook(
        writePaytable([
          ["Code", "Sym", "X1"],
          [0, "WL", 0],
        ]),
      ),
    ).toThrow("必须是 Symbol");
  });

  it("rejects non-continuous X headers", () => {
    const file = writePaytable([
      ["Code", "Symbol", "X1", "X3"],
      [0, "WL", 0, 0],
    ]);

    expect(() => parsePaytableWorkbook(file)).toThrow("paytable X 列必须连续");
  });

  it("accepts integer text in Code and pay cells", () => {
    const file = writePaytable([
      ["Code", "Symbol", "X1", "X2"],
      ["0", "WL", "0", "10"],
      ["1", "H1", "5", "20"],
    ]);

    expect(parsePaytableWorkbook(file)).toMatchObject({
      paytable: {
        "0": { code: 0, symbol: "WL", pays: [0, 10] },
        "1": { code: 1, symbol: "H1", pays: [5, 20] },
      },
      symbolCodes: {
        WL: 0,
        H1: 1,
      },
    });
  });

  it("accepts numeric symbol cell content", () => {
    const file = writePaytable([
      ["Code", "Symbol", "X1"],
      [0, 10, 0],
    ]);

    expect(parsePaytableWorkbook(file).symbolCodes).toEqual({ "10": 0 });
  });

  it("uses formatted text when numeric Symbol cells have display formatting", () => {
    const file = writePaytable(
      [
        ["Code", "Symbol", "X1"],
        [0, 1, 0],
      ],
      {
        B2: { t: "n", v: 1, z: "000" },
      },
    );

    expect(parsePaytableWorkbook(file).symbolCodes).toEqual({ "001": 0 });
  });

  it.each([
    ["empty", undefined],
    ["negative", -1],
    ["float", 1.2],
    ["decimal string", "1.2"],
    ["non-number", "abc"],
    ["boolean", true],
    ["date", new Date("2026-01-01T00:00:00Z")],
  ])("rejects invalid Code cell: %s", (_label, value) => {
    const file = writePaytable([
      ["Code", "Symbol", "X1"],
      [value, "WL", 0],
    ]);

    expect(() => parsePaytableWorkbook(file)).toThrow("Code");
  });

  it("rejects formula Code cells", () => {
    const file = writePaytable(validPaytableRows(), {
      A2: { t: "n", f: "1+1", v: 2 },
    });

    expect(() => parsePaytableWorkbook(file)).toThrow(
      "Code 不允许使用公式单元格",
    );
  });

  it.each([
    ["empty", undefined],
    ["negative", -1],
    ["float", 1.2],
    ["decimal string", "1.2"],
    ["boolean", true],
    ["date", new Date("2026-01-01T00:00:00Z")],
    ["non-number", "abc"],
  ])("rejects invalid pay cell: %s", (_label, value) => {
    const file = writePaytable([
      ["Code", "Symbol", "X1"],
      [0, "WL", value],
    ]);

    expect(() => parsePaytableWorkbook(file)).toThrow("X1");
  });

  it("rejects formula pay cells", () => {
    const file = writePaytable(validPaytableRows(), {
      C2: { t: "n", f: "1+1", v: 2 },
    });

    expect(() => parsePaytableWorkbook(file)).toThrow(
      "X1 不允许使用公式单元格",
    );
  });

  it.each([
    ["empty", ""],
    ["boolean", true],
    ["date", new Date("2026-01-01T00:00:00Z")],
  ])("rejects invalid Symbol cell: %s", (_label, value) => {
    const file = writePaytable([
      ["Code", "Symbol", "X1"],
      [0, value, 0],
    ]);

    expect(() => parsePaytableWorkbook(file)).toThrow("Symbol");
  });

  it("rejects formula Symbol cells", () => {
    const file = writePaytable(validPaytableRows(), {
      B2: { t: "s", f: '"WL"', v: "WL" },
    });

    expect(() => parsePaytableWorkbook(file)).toThrow(
      "Symbol 不允许使用公式单元格",
    );
  });

  it("rejects numeric cells whose formatted text looks like an integer", () => {
    const file = writePaytable(validPaytableRows(), {
      A2: { t: "n", v: 1.2, w: "1" },
    });

    expect(() => parsePaytableWorkbook(file)).toThrow(
      "Code 必须是非负安全整数",
    );
  });
});

function writePaytable(rows: unknown[], patches = {}): string {
  const dir = createTempDir();
  const file = join(dir, "paytable.xlsx");
  writeWorkbook(file, rows as unknown[][], patches);
  return file;
}
