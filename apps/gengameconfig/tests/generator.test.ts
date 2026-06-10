import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildGameConfig,
  stringifyGameConfig,
  writeGameConfigFile,
} from "../src/generator";
import {
  cleanupTempDirs,
  createTempDir,
  validPaytableRows,
  validReelsRows,
  writeWorkbook,
} from "./workbook-helpers";

const assetPaytable = resolve(__dirname, "../../../assets/gamecfg/paytables.xlsx");
const assetReel = resolve(__dirname, "../../../assets/gamecfg/bg-reel01.xlsx");

describe("generator", () => {
  afterEach(() => {
    cleanupTempDirs();
  });

  it("combines paytable and reels into a stable JSON model", () => {
    const config = buildGameConfig(assetPaytable, [assetReel]);
    const json = stringifyGameConfig(config);
    const parsed = JSON.parse(json);

    expect(json.endsWith("\n")).toBe(true);
    expect(parsed.paytable["1"].symbol).toBe("H1");
    expect(parsed.paytable["1"].pays).toEqual([0, 10, 15, 20, 25, 50]);
    expect(parsed.symbolCodes.H1).toBe(1);
    expect(parsed.reels["bg-reel01"]).toHaveLength(6);
    expect(parsed.reels["bg-reel01"][0].slice(0, 12)).toEqual([
      1, 2, 6, 3, 1, 2, 7, 8, 1, 8, 7, 7,
    ]);
  });

  it("writes parseable JSON and creates missing parent directories", async () => {
    const dir = createTempDir();
    const outPath = join(dir, "nested", "game.json");
    const config = buildGameConfig(assetPaytable, [assetReel]);

    await writeGameConfigFile(outPath, config);

    const parsed = JSON.parse(readFileSync(outPath, "utf8"));
    expect(parsed.symbolCodes.WL).toBe(0);
    expect(parsed.reels["bg-reel01"]).toHaveLength(6);
  });

  it("overwrites existing output files atomically", async () => {
    const dir = createTempDir();
    const outPath = join(dir, "game.json");
    writeFileSync(outPath, "old content", "utf8");

    await writeGameConfigFile(outPath, buildGameConfig(assetPaytable, [assetReel]));

    expect(JSON.parse(readFileSync(outPath, "utf8")).paytable["1"].symbol).toBe("H1");
  });

  it("cleans the temporary file when rename fails", async () => {
    const dir = createTempDir();
    const outPath = join(dir, "game.json");
    mkdirSync(outPath);

    await expect(
      writeGameConfigFile(outPath, buildGameConfig(assetPaytable, [assetReel])),
    ).rejects.toThrow();

    expect(readdirSync(dir).filter((name) => name.includes(".tmp"))).toEqual([]);
  });

  it("rejects duplicate reel keys", () => {
    const dir = createTempDir();
    const paytablePath = join(dir, "paytable.xlsx");
    const reelsA = join(dir, "a", "same.xlsx");
    const reelsB = join(dir, "b", "same.xlsx");
    mkdirSync(join(dir, "a"));
    mkdirSync(join(dir, "b"));
    writeWorkbook(paytablePath, validPaytableRows());
    writeWorkbook(reelsA, validReelsRows());
    writeWorkbook(reelsB, validReelsRows());

    expect(() => buildGameConfig(paytablePath, [reelsA, reelsB])).toThrow(
      "重复 reel key：same",
    );
  });
});
