import { resolve } from "node:path";
import { findRepoRoot } from "./path-utils.js";
import { generateGameStaticConfigFile } from "./generator.js";
import type {
  BuildGameStaticCliOptions,
  BuildGameStaticResolvedOptions,
} from "./types.js";

export async function runBuildGameStaticCli(
  argv: readonly string[],
): Promise<void> {
  try {
    const options = resolveCliOptions(parseCliArgs(argv));
    const result = await generateGameStaticConfigFile(options);
    if (result.checked) {
      console.log(`buildgamestatic 校验通过：${result.outputPath}`);
      return;
    }
    console.log(
      result.changed
        ? `buildgamestatic 生成成功：${result.outputPath}`
        : `buildgamestatic 生成文件已是最新：${result.outputPath}`,
    );
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`buildgamestatic 执行失败：${message}`);
  }
}

export function parseCliArgs(
  argv: readonly string[],
): BuildGameStaticCliOptions {
  const options: {
    inputPath?: string;
    outPath?: string;
    gameId?: string;
    rootDir?: string;
    check: boolean;
  } = { check: false };
  const seen = new Set<string>();
  const args = argv[0] === "--" ? argv.slice(1) : argv;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") {
      if (seen.has(arg)) {
        throw new Error("--check 不能重复提供。");
      }
      seen.add(arg);
      options.check = true;
      continue;
    }
    if (
      arg === "--input" ||
      arg === "--out" ||
      arg === "--game" ||
      arg === "--root"
    ) {
      if (seen.has(arg)) {
        throw new Error(`${arg} 不能重复提供。`);
      }
      seen.add(arg);
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} 需要一个参数值。`);
      }
      index += 1;
      if (arg === "--input") {
        options.inputPath = value;
      } else if (arg === "--out") {
        options.outPath = value;
      } else if (arg === "--game") {
        options.gameId = value;
      } else {
        options.rootDir = value;
      }
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }

  if (!options.inputPath) {
    throw new Error("--input 是必填参数。");
  }
  if (!options.outPath) {
    throw new Error("--out 是必填参数。");
  }
  if (!options.gameId) {
    throw new Error("--game 是必填参数。");
  }
  return Object.freeze({
    inputPath: options.inputPath,
    outPath: options.outPath,
    gameId: options.gameId,
    rootDir: options.rootDir,
    check: options.check ?? false,
  });
}

function resolveCliOptions(
  options: BuildGameStaticCliOptions,
): BuildGameStaticResolvedOptions {
  return Object.freeze({
    ...options,
    rootDir: resolve(options.rootDir ?? findRepoRoot()),
  });
}
