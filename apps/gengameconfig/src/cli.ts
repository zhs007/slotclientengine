import { extname, resolve } from "node:path";
import type { CliConfig } from "./types";

export function parseCliArgs(argv: string[]): CliConfig {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const invocationCwd = process.env.INIT_CWD || process.cwd();
  let paytablePath: string | undefined;
  let outPath: string | undefined;
  const reelPaths: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--paytable": {
        if (paytablePath !== undefined) {
          throw new Error("参数 --paytable 只能出现一次");
        }
        const value = readOptionValue(args, index, arg);
        assertExtension(value, ".xlsx", arg);
        paytablePath = resolve(invocationCwd, value);
        index += 1;
        break;
      }
      case "--reel": {
        const value = readOptionValue(args, index, arg);
        assertExtension(value, ".xlsx", arg);
        reelPaths.push(resolve(invocationCwd, value));
        index += 1;
        break;
      }
      case "--out": {
        if (outPath !== undefined) {
          throw new Error("参数 --out 只能出现一次");
        }
        const value = readOptionValue(args, index, arg);
        assertExtension(value, ".json", arg);
        outPath = resolve(invocationCwd, value);
        index += 1;
        break;
      }
      default:
        throw new Error(`未知参数：${arg}`);
    }
  }

  if (paytablePath === undefined) {
    throw new Error("缺少必填参数：--paytable <xlsx-file>");
  }

  if (reelPaths.length === 0) {
    throw new Error("缺少必填参数：至少一个 --reel <xlsx-file>");
  }

  if (outPath === undefined) {
    throw new Error("缺少必填参数：--out <json-file>");
  }

  return {
    paytablePath,
    reelPaths,
    outPath,
  };
}

function readOptionValue(argv: string[], index: number, optionName: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`参数 ${optionName} 缺少取值`);
  }

  return value;
}

function assertExtension(filePath: string, expectedExtension: string, optionName: string): void {
  if (extname(filePath).toLowerCase() !== expectedExtension) {
    throw new Error(`参数 ${optionName} 必须使用 ${expectedExtension} 文件`);
  }
}
