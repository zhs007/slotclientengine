import rawGame003RuntimeConfig from "../config/game-runtime.manifest.json";

export interface Game003RuntimeConfig {
  readonly version: 1;
  readonly brandLabel: string;
  readonly live: {
    readonly serverUrl: string;
    readonly gamecode: string;
    readonly rejectQueryParams: readonly string[];
  };
  readonly reel: {
    readonly kind: "normal";
    readonly direction: "forward" | "backward";
    readonly minimumSpinCycles: number;
    readonly baseDurationMs: number;
    readonly speedSymbolsPerSecond: number;
    readonly startDelayMs: number;
    readonly stopDelayMs: number;
  };
  readonly appExtensions: Readonly<Record<string, unknown>>;
}

export const GAME003_RUNTIME_CONFIG = parseGame003RuntimeConfig(
  rawGame003RuntimeConfig,
);

export function parseGame003RuntimeConfig(
  value: unknown,
): Game003RuntimeConfig {
  const root = assertRecord(value, "game003 runtime config");
  assertExactKeys(root, "game003 runtime config", [
    "version",
    "brandLabel",
    "live",
    "reel",
    "appExtensions",
  ]);
  if (root.version !== 1) {
    throw new Error("game003 runtime config.version must be 1.");
  }
  const live = assertRecord(root.live, "game003 runtime config.live");
  assertExactKeys(live, "game003 runtime config.live", [
    "serverUrl",
    "gamecode",
    "rejectQueryParams",
  ]);
  const reel = assertRecord(root.reel, "game003 runtime config.reel");
  assertExactKeys(reel, "game003 runtime config.reel", [
    "kind",
    "direction",
    "minimumSpinCycles",
    "baseDurationMs",
    "speedSymbolsPerSecond",
    "startDelayMs",
    "stopDelayMs",
  ]);
  if (reel.kind !== "normal") {
    throw new Error('game003 runtime config.reel.kind must be "normal".');
  }
  if (reel.direction !== "forward" && reel.direction !== "backward") {
    throw new Error(
      'game003 runtime config.reel.direction must be "forward" or "backward".',
    );
  }
  const appExtensions = assertRecord(
    root.appExtensions,
    "game003 runtime config.appExtensions",
  );
  assertExactKeys(appExtensions, "game003 runtime config.appExtensions", [
    "game003WinSymbolLoop",
    "game003CoinOverlay",
  ]);
  return Object.freeze({
    version: 1,
    brandLabel: assertNonEmptyString(
      root.brandLabel,
      "game003 runtime config.brandLabel",
    ),
    live: Object.freeze({
      serverUrl: assertNonEmptyString(
        live.serverUrl,
        "game003 runtime config.live.serverUrl",
      ),
      gamecode: assertNonEmptyString(
        live.gamecode,
        "game003 runtime config.live.gamecode",
      ),
      rejectQueryParams: parseUniqueStrings(
        live.rejectQueryParams,
        "game003 runtime config.live.rejectQueryParams",
      ),
    }),
    reel: Object.freeze({
      kind: "normal",
      direction: reel.direction,
      minimumSpinCycles: assertNonNegativeInteger(
        reel.minimumSpinCycles,
        "game003 runtime config.reel.minimumSpinCycles",
      ),
      baseDurationMs: assertPositiveNumber(
        reel.baseDurationMs,
        "game003 runtime config.reel.baseDurationMs",
      ),
      speedSymbolsPerSecond: assertPositiveNumber(
        reel.speedSymbolsPerSecond,
        "game003 runtime config.reel.speedSymbolsPerSecond",
      ),
      startDelayMs: assertNonNegativeNumber(
        reel.startDelayMs,
        "game003 runtime config.reel.startDelayMs",
      ),
      stopDelayMs: assertNonNegativeNumber(
        reel.stopDelayMs,
        "game003 runtime config.reel.stopDelayMs",
      ),
    }),
    appExtensions: Object.freeze({ ...appExtensions }),
  });
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  label: string,
  keys: readonly string[],
): void {
  const expected = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!expected.has(key))
      throw new Error(`${label}.${key} is not supported.`);
  }
  for (const key of keys) {
    if (!(key in record)) throw new Error(`${label}.${key} is required.`);
  }
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0
  ) {
    throw new Error(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function assertPositiveNumber(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function assertNonNegativeNumber(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  const number = assertNonNegativeNumber(value, label);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return number;
}

function parseUniqueStrings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const result = value.map((entry, index) =>
    assertNonEmptyString(entry, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
  return Object.freeze(result);
}
