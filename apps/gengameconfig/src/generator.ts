import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseNumberWeightWorkbook } from "./number-weight";
import { parsePaytableWorkbook } from "./paytable";
import { parseReelsWorkbook } from "./reels";
import type { CliConfig, GameConfig } from "./types";

export function buildGameConfig(
  paytablePath: string,
  reelPaths: string[],
  numberWeightPaths: string[] = [],
): GameConfig {
  const paytableModel = parsePaytableWorkbook(paytablePath);
  const reels: Record<string, number[][]> = {};
  const seenReelKeys = new Set<string>();
  const numberWeightTables: NonNullable<GameConfig["numberWeightTables"]> = {};
  const seenNumberWeightNames = new Set<string>();

  for (const reelPath of reelPaths) {
    const reelModel = parseReelsWorkbook(reelPath, paytableModel.symbolCodes);

    if (seenReelKeys.has(reelModel.key)) {
      throw new Error(`重复 reel key：${reelModel.key}`);
    }

    seenReelKeys.add(reelModel.key);
    reels[reelModel.key] = reelModel.reels;
  }

  for (const numberWeightPath of numberWeightPaths) {
    const table = parseNumberWeightWorkbook(numberWeightPath);
    if (seenNumberWeightNames.has(table.name)) {
      throw new Error(`重复 number weight table name：${table.name}`);
    }
    seenNumberWeightNames.add(table.name);
    numberWeightTables[table.name] = table.entries;
  }

  const config: GameConfig = {
    paytable: paytableModel.paytable,
    symbolCodes: paytableModel.symbolCodes,
    reels,
  };
  if (numberWeightPaths.length > 0) {
    config.numberWeightTables = numberWeightTables;
  }
  return config;
}

export async function generateGameConfigFile(
  config: CliConfig,
): Promise<GameConfig> {
  await assertInputFile(config.paytablePath);
  for (const reelPath of config.reelPaths) {
    await assertInputFile(reelPath);
  }
  for (const numberWeightPath of config.numberWeightPaths) {
    await assertInputFile(numberWeightPath);
  }

  const gameConfig = buildGameConfig(
    config.paytablePath,
    config.reelPaths,
    config.numberWeightPaths,
  );
  await writeGameConfigFile(config.outPath, gameConfig);
  return gameConfig;
}

export async function writeGameConfigFile(
  outPath: string,
  gameConfig: GameConfig,
): Promise<void> {
  const outDir = dirname(outPath);
  await mkdir(outDir, { recursive: true });

  const tempPath = join(
    outDir,
    `.${basename(outPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(tempPath, stringifyGameConfig(gameConfig), "utf8");
    await rename(tempPath, outPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export function stringifyGameConfig(gameConfig: GameConfig): string {
  return `${JSON.stringify(gameConfig, null, 2)}\n`;
}

async function assertInputFile(filePath: string): Promise<void> {
  let result;
  try {
    result = await stat(filePath);
  } catch {
    throw new Error(`输入文件不存在：${filePath}`);
  }

  if (!result.isFile()) {
    throw new Error(`输入路径不是文件：${filePath}`);
  }
}
