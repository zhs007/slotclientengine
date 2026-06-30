import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LogicParseError } from "../src";
import { loadGameConfigFromJsonFile } from "../src/node";

const tempDirs: string[] = [];
const fixturePath = resolve(__dirname, "fixtures/gameconfig-reels01.json");

describe("loadGameConfigFromJsonFile", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads a generated game config fixture from disk", async () => {
    const gameConfig = await loadGameConfigFromJsonFile(fixturePath);

    expect(gameConfig.getReelNames()).toEqual(["reels01"]);
    expect(gameConfig.getReels("reels01").getReelCount()).toBe(5);
  });

  it("fails clearly when the file does not exist", async () => {
    const missingPath = join(createTempDir(), "missing.json");

    await expect(loadGameConfigFromJsonFile(missingPath)).rejects.toThrow(
      LogicParseError,
    );
    await expect(loadGameConfigFromJsonFile(missingPath)).rejects.toThrow(
      missingPath,
    );
  });

  it("fails clearly when the path is not a file", async () => {
    const dir = createTempDir();
    const nestedDir = join(dir, "nested");
    mkdirSync(nestedDir);

    await expect(loadGameConfigFromJsonFile(nestedDir)).rejects.toThrow(
      LogicParseError,
    );
    await expect(loadGameConfigFromJsonFile(nestedDir)).rejects.toThrow(
      nestedDir,
    );
  });

  it("fails clearly for invalid JSON syntax", async () => {
    const filePath = writeTempFile("broken.json", "{");

    await expect(loadGameConfigFromJsonFile(filePath)).rejects.toThrow(
      LogicParseError,
    );
    await expect(loadGameConfigFromJsonFile(filePath)).rejects.toThrow(
      filePath,
    );
  });

  it("fails clearly for valid JSON that does not match the game config contract", async () => {
    const filePath = writeTempFile(
      "invalid-contract.json",
      JSON.stringify({ paytable: {} }),
    );

    await expect(loadGameConfigFromJsonFile(filePath)).rejects.toThrow(
      LogicParseError,
    );
    await expect(loadGameConfigFromJsonFile(filePath)).rejects.toThrow(
      filePath,
    );
    await expect(loadGameConfigFromJsonFile(filePath)).rejects.toThrow(
      "Invalid game config",
    );
  });
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "logiccore-node-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeTempFile(name: string, content: string): string {
  const dir = createTempDir();
  const filePath = join(dir, name);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}
