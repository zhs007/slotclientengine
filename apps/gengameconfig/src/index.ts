#!/usr/bin/env node
import { parseCliArgs } from "./cli";
import { generateGameConfigFile } from "./generator";

async function main(): Promise<void> {
  try {
    const config = parseCliArgs(process.argv.slice(2));
    const gameConfig = await generateGameConfigFile(config);
    console.log(`gengameconfig 生成成功：${config.outPath}`);
    console.log(`paytable symbols: ${Object.keys(gameConfig.symbolCodes).length}`);
    console.log(`reels: ${Object.keys(gameConfig.reels).join(", ")}`);
  } catch (error) {
    process.exitCode = 1;
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`gengameconfig 执行失败：${detail}`);
  }
}

void main();
