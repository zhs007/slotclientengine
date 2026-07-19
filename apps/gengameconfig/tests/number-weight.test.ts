import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseNumberWeightWorkbook } from "../src/number-weight";
import {
  cleanupTempDirs,
  createTempDir,
  writeWorkbook,
} from "./workbook-helpers";

describe("parseNumberWeightWorkbook", () => {
  afterEach(cleanupTempDirs);

  it("accepts numeric cells and integer text while preserving row order", () => {
    const file = writeWeight("coin-weight.xlsx", [
      ["val", "weight"],
      [1, "100"],
      ["25", 5],
    ]);
    expect(parseNumberWeightWorkbook(file)).toEqual({
      name: "coin-weight",
      entries: [
        { value: 1, weight: 100 },
        { value: 25, weight: 5 },
      ],
    });
  });

  it.each([
    [
      "bad header",
      [
        ["Val", "weight"],
        [1, 1],
      ],
      "必须是 val",
    ],
    [
      "zero value",
      [
        ["val", "weight"],
        [0, 1],
      ],
      "val 必须是正安全整数",
    ],
    [
      "zero weight",
      [
        ["val", "weight"],
        [1, 0],
      ],
      "weight 必须是正安全整数",
    ],
    [
      "negative",
      [
        ["val", "weight"],
        [-1, 1],
      ],
      "非负安全整数",
    ],
    [
      "float",
      [
        ["val", "weight"],
        [1.5, 1],
      ],
      "非负安全整数",
    ],
    [
      "duplicate",
      [
        ["val", "weight"],
        [1, 1],
        [1, 2],
      ],
      "重复 val：1",
    ],
    [
      "middle gap",
      [
        ["val", "weight"],
        [1, 1],
        [undefined, undefined],
        [2, 1],
      ],
      "实际值为 空",
    ],
    [
      "extra column",
      [
        ["val", "weight", "extra"],
        [1, 1, "x"],
      ],
      "只能包含",
    ],
    [
      "blank string",
      [
        ["val", "weight"],
        ["   ", 1],
      ],
      "不能为空",
    ],
    [
      "boolean",
      [
        ["val", "weight"],
        [true, 1],
      ],
      "数值或整数文本",
    ],
    [
      "date",
      [
        ["val", "weight"],
        [new Date("2026-01-01T00:00:00Z"), 1],
      ],
      "数值或整数文本",
    ],
  ])("rejects %s", (_label, rows, message) => {
    expect(() =>
      parseNumberWeightWorkbook(writeWeight("valid-name.xlsx", rows)),
    ).toThrow(message);
  });

  it("rejects formulas", () => {
    const file = writeWeight(
      "valid-name.xlsx",
      [
        ["val", "weight"],
        [1, 1],
      ],
      { A2: { t: "n", f: "1+1", v: 2 } },
    );
    expect(() => parseNumberWeightWorkbook(file)).toThrow("不允许使用公式");
  });

  it("rejects total weight above uint32 range", () => {
    const file = writeWeight("valid-name.xlsx", [
      ["val", "weight"],
      [1, 0xffff_ffff],
      [2, 2],
    ]);
    expect(() => parseNumberWeightWorkbook(file)).toThrow("weight 总和必须在");
  });

  it.each(["BadName.xlsx", "bad_name.xlsx", "-bad.xlsx"])(
    "rejects an invalid table stem: %s",
    (name) => {
      expect(() =>
        parseNumberWeightWorkbook(
          writeWeight(name, [
            ["val", "weight"],
            [1, 1],
          ]),
        ),
      ).toThrow("lowercase ASCII kebab-case");
    },
  );
});

function writeWeight(
  name: string,
  rows: unknown[][],
  patches: Parameters<typeof writeWorkbook>[2] = {},
): string {
  const file = join(createTempDir(), name);
  writeWorkbook(file, rows, patches);
  return file;
}
