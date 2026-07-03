export interface Game003WinSymbolLoopConfig {
  readonly cyclePauseSeconds: number;
  readonly resultAmount: {
    readonly yOffsetRatioFromCellCenter: number;
    readonly fontSize: number;
    readonly fill: string;
    readonly stroke: string;
    readonly strokeWidth: number;
  };
}

export function getGame003WinSymbolLoopConfig(
  appExtensions: unknown,
): Game003WinSymbolLoopConfig {
  const extensions = assertRecord(appExtensions, "game003 appExtensions");
  const rawConfig = extensions.game003WinSymbolLoop;
  if (rawConfig === undefined) {
    throw new Error("game003 appExtensions.game003WinSymbolLoop is required.");
  }
  const record = assertRecord(rawConfig, "game003WinSymbolLoop");
  assertKeys(record, "game003WinSymbolLoop", [
    "cyclePauseSeconds",
    "resultAmount",
  ]);
  return Object.freeze({
    cyclePauseSeconds: assertPositiveNumber(
      record.cyclePauseSeconds,
      "game003WinSymbolLoop.cyclePauseSeconds",
    ),
    resultAmount: parseResultAmount(record.resultAmount),
  });
}

function parseResultAmount(
  value: unknown,
): Game003WinSymbolLoopConfig["resultAmount"] {
  const record = assertRecord(value, "game003WinSymbolLoop.resultAmount");
  assertKeys(record, "game003WinSymbolLoop.resultAmount", [
    "yOffsetRatioFromCellCenter",
    "fontSize",
    "fill",
    "stroke",
    "strokeWidth",
  ]);
  const yOffsetRatioFromCellCenter = assertFiniteNumber(
    record.yOffsetRatioFromCellCenter,
    "game003WinSymbolLoop.resultAmount.yOffsetRatioFromCellCenter",
  );
  if (yOffsetRatioFromCellCenter < -0.5 || yOffsetRatioFromCellCenter > 0.5) {
    throw new Error(
      "game003WinSymbolLoop.resultAmount.yOffsetRatioFromCellCenter must be between -0.5 and 0.5.",
    );
  }
  return Object.freeze({
    yOffsetRatioFromCellCenter,
    fontSize: assertPositiveNumber(
      record.fontSize,
      "game003WinSymbolLoop.resultAmount.fontSize",
    ),
    fill: assertNonEmptyString(
      record.fill,
      "game003WinSymbolLoop.resultAmount.fill",
    ),
    stroke: assertNonEmptyString(
      record.stroke,
      "game003WinSymbolLoop.resultAmount.stroke",
    ),
    strokeWidth: assertPositiveNumber(
      record.strokeWidth,
      "game003WinSymbolLoop.resultAmount.strokeWidth",
    ),
  });
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(
  record: Record<string, unknown>,
  label: string,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${label}.${key} is not supported.`);
    }
  }
  for (const key of allowedKeys) {
    if (!(key in record)) {
      throw new Error(`${label}.${key} is required.`);
    }
  }
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function assertPositiveNumber(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
  return number;
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}
