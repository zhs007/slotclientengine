import { createDefaultConfig } from "./config";
import { RtpCliConfig } from "./types";

type OptionKind = "string" | "positive-number" | "positive-integer";

interface OptionSpec {
  property: string;
  kind: OptionKind;
}

const OPTION_SPECS = new Map<string, OptionSpec>([
  ["--url", { property: "url", kind: "string" }],
  ["--gamecode", { property: "gamecode", kind: "string" }],
  ["--token", { property: "token", kind: "string" }],
  ["--bet", { property: "bet", kind: "positive-number" }],
  ["--lines", { property: "lines", kind: "positive-integer" }],
  ["--times", { property: "times", kind: "positive-integer" }],
  [
    "--request-timeout-ms",
    { property: "requestTimeoutMs", kind: "positive-integer" },
  ],
]);

export function parseCliArgs(argv: string[]): RtpCliConfig {
  const config = createDefaultConfig();
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let seenSpins = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--verbose") {
      config.verbose = true;
      config.overrides.push("verbose=true");
      continue;
    }

    if (arg === "--spins") {
      const value = readOptionValue(args, index, arg);
      config.spins = parsePositiveInteger(value, arg);
      config.overrides.push(`spins=${config.spins}`);
      seenSpins = true;
      index += 1;
      continue;
    }

    const spec = OPTION_SPECS.get(arg);
    if (!spec) {
      throw new Error(`未知参数：${arg}`);
    }

    const value = readOptionValue(args, index, arg);
    applyOption(config, spec, value, arg);
    index += 1;
  }

  if (!seenSpins) {
    throw new Error("缺少必填参数：--spins <positive-integer>");
  }

  return config;
}

function readOptionValue(
  argv: string[],
  index: number,
  optionName: string,
): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`参数 ${optionName} 缺少取值`);
  }
  return value;
}

function applyOption(
  config: RtpCliConfig,
  spec: OptionSpec,
  rawValue: string,
  optionName: string,
): void {
  switch (spec.property) {
    case "url":
      config.url = parseWebSocketUrl(rawValue, optionName);
      config.overrides.push(`url=${config.url}`);
      break;
    case "gamecode":
      config.gamecode = parseRequiredString(rawValue, optionName);
      config.overrides.push(`gamecode=${config.gamecode}`);
      break;
    case "token":
      config.token = parseRequiredString(rawValue, optionName);
      config.overrides.push(`token=${config.token}`);
      break;
    case "bet":
      config.spin.bet = parsePositiveNumber(rawValue, optionName);
      config.overrides.push(`bet=${config.spin.bet}`);
      break;
    case "lines":
      config.spin.lines = parsePositiveInteger(rawValue, optionName);
      config.overrides.push(`lines=${config.spin.lines}`);
      break;
    case "times":
      config.spin.times = parsePositiveInteger(rawValue, optionName);
      config.overrides.push(`times=${config.spin.times}`);
      break;
    case "requestTimeoutMs":
      config.requestTimeoutMs = parsePositiveInteger(rawValue, optionName);
      config.overrides.push(`request-timeout-ms=${config.requestTimeoutMs}`);
      break;
    default:
      throw new Error(`未实现参数：${optionName}`);
  }
}

function parseRequiredString(rawValue: string, optionName: string): string {
  const value = rawValue.trim();
  if (!value) {
    throw new Error(`参数 ${optionName} 不能为空`);
  }
  return value;
}

function parseWebSocketUrl(rawValue: string, optionName: string): string {
  const value = parseRequiredString(rawValue, optionName);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`参数 ${optionName} 必须是合法 ws/wss URL`);
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`参数 ${optionName} 必须使用 ws:// 或 wss://`);
  }

  return value;
}

function parsePositiveInteger(rawValue: string, optionName: string): number {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`参数 ${optionName} 必须是正整数`);
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`参数 ${optionName} 必须是正整数`);
  }

  return value;
}

function parsePositiveNumber(rawValue: string, optionName: string): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`参数 ${optionName} 必须是正数`);
  }

  return value;
}
