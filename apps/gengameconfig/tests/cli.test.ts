import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli";

describe("parseCliArgs", () => {
  it("requires paytable", () => {
    expect(() =>
      parseCliArgs(["--reel", "reel.xlsx", "--out", "game.json"]),
    ).toThrow("缺少必填参数：--paytable");
  });

  it("requires at least one reel", () => {
    expect(() =>
      parseCliArgs(["--paytable", "paytable.xlsx", "--out", "game.json"]),
    ).toThrow("至少一个 --reel");
  });

  it("requires out", () => {
    expect(() =>
      parseCliArgs(["--paytable", "paytable.xlsx", "--reel", "reel.xlsx"]),
    ).toThrow("缺少必填参数：--out");
  });

  it("keeps repeated reels in argument order and supports pnpm separator", () => {
    const config = parseCliArgs([
      "--",
      "--paytable",
      "paytable.xlsx",
      "--reel",
      "base.xlsx",
      "--reel",
      "bonus.xlsx",
      "--number-weight",
      "base-weight.xlsx",
      "--number-weight",
      "bonus-weight.xlsx",
      "--out",
      "game.json",
    ]);

    expect(basename(config.paytablePath)).toBe("paytable.xlsx");
    expect(config.reelPaths.map((path) => basename(path))).toEqual([
      "base.xlsx",
      "bonus.xlsx",
    ]);
    expect(config.numberWeightPaths.map((path) => basename(path))).toEqual([
      "base-weight.xlsx",
      "bonus-weight.xlsx",
    ]);
    expect(basename(config.outPath)).toBe("game.json");
  });

  it("resolves relative paths from INIT_CWD when pnpm runs the package script", () => {
    const originalInitCwd = process.env.INIT_CWD;
    process.env.INIT_CWD = "/tmp/gengameconfig-root";

    try {
      const config = parseCliArgs([
        "--paytable",
        "assets/gamecfg/paytables.xlsx",
        "--reel",
        "assets/gamecfg/bg-reel01.xlsx",
        "--out",
        "dist/game.json",
      ]);

      expect(config.paytablePath).toBe(
        join("/tmp/gengameconfig-root", "assets/gamecfg/paytables.xlsx"),
      );
      expect(config.reelPaths[0]).toBe(
        join("/tmp/gengameconfig-root", "assets/gamecfg/bg-reel01.xlsx"),
      );
      expect(config.numberWeightPaths).toEqual([]);
      expect(config.outPath).toBe(
        join("/tmp/gengameconfig-root", "dist/game.json"),
      );
    } finally {
      if (originalInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = originalInitCwd;
      }
    }
  });

  it("rejects duplicate paytable", () => {
    expect(() =>
      parseCliArgs([
        "--paytable",
        "a.xlsx",
        "--paytable",
        "b.xlsx",
        "--reel",
        "reel.xlsx",
        "--out",
        "game.json",
      ]),
    ).toThrow("--paytable 只能出现一次");
  });

  it("rejects duplicate out", () => {
    expect(() =>
      parseCliArgs([
        "--paytable",
        "paytable.xlsx",
        "--reel",
        "reel.xlsx",
        "--out",
        "a.json",
        "--out",
        "b.json",
      ]),
    ).toThrow("--out 只能出现一次");
  });

  it("rejects unknown arguments", () => {
    expect(() => parseCliArgs(["--bad"])).toThrow("未知参数：--bad");
  });

  it("rejects missing option value", () => {
    expect(() => parseCliArgs(["--paytable"])).toThrow(
      "参数 --paytable 缺少取值",
    );
  });

  it("rejects non-xlsx input files", () => {
    expect(() =>
      parseCliArgs([
        "--paytable",
        "paytable.csv",
        "--reel",
        "reel.xlsx",
        "--out",
        "game.json",
      ]),
    ).toThrow("参数 --paytable 必须使用 .xlsx 文件");

    expect(() =>
      parseCliArgs([
        "--paytable",
        "paytable.xlsx",
        "--reel",
        "reel.xls",
        "--out",
        "game.json",
      ]),
    ).toThrow("参数 --reel 必须使用 .xlsx 文件");

    expect(() =>
      parseCliArgs([
        "--paytable",
        "paytable.xlsx",
        "--reel",
        "reel.xlsx",
        "--number-weight",
        "weight.csv",
        "--out",
        "game.json",
      ]),
    ).toThrow("参数 --number-weight 必须使用 .xlsx 文件");
  });

  it("rejects non-json output files", () => {
    expect(() =>
      parseCliArgs([
        "--paytable",
        "paytable.xlsx",
        "--reel",
        "reel.xlsx",
        "--out",
        "game.txt",
      ]),
    ).toThrow("参数 --out 必须使用 .json 文件");
  });
});
