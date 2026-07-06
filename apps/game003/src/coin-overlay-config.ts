export interface Game003CoinOverlayConfig {
  readonly componentName: "bg-gencoins";
  readonly coinSymbol: "CO";
  readonly text: {
    readonly yOffsetRatioFromCellCenter: number;
    readonly fontSize: number;
    readonly fill: string;
    readonly stroke: string;
    readonly strokeWidth: number;
  };
}

export function getGame003CoinOverlayConfig(
  appExtensions: unknown,
): Game003CoinOverlayConfig {
  const extensions = assertRecord(appExtensions, "game003 appExtensions");
  const rawConfig = extensions.game003CoinOverlay;
  if (rawConfig === undefined) {
    throw new Error("game003 appExtensions.game003CoinOverlay is required.");
  }
  const record = assertRecord(rawConfig, "game003CoinOverlay");
  assertKeys(record, "game003CoinOverlay", [
    "componentName",
    "coinSymbol",
    "text",
  ]);
  const componentName = assertLiteral(
    record.componentName,
    "bg-gencoins",
    "game003CoinOverlay.componentName",
  );
  const coinSymbol = assertLiteral(
    record.coinSymbol,
    "CO",
    "game003CoinOverlay.coinSymbol",
  );
  return Object.freeze({
    componentName,
    coinSymbol,
    text: parseTextConfig(record.text),
  });
}

function parseTextConfig(value: unknown): Game003CoinOverlayConfig["text"] {
  const record = assertRecord(value, "game003CoinOverlay.text");
  assertKeys(record, "game003CoinOverlay.text", [
    "yOffsetRatioFromCellCenter",
    "fontSize",
    "fill",
    "stroke",
    "strokeWidth",
  ]);
  const yOffsetRatioFromCellCenter = assertFiniteNumber(
    record.yOffsetRatioFromCellCenter,
    "game003CoinOverlay.text.yOffsetRatioFromCellCenter",
  );
  if (yOffsetRatioFromCellCenter < -0.5 || yOffsetRatioFromCellCenter > 0.5) {
    throw new Error(
      "game003CoinOverlay.text.yOffsetRatioFromCellCenter must be between -0.5 and 0.5.",
    );
  }
  return Object.freeze({
    yOffsetRatioFromCellCenter,
    fontSize: assertPositiveNumber(
      record.fontSize,
      "game003CoinOverlay.text.fontSize",
    ),
    fill: assertNonEmptyString(record.fill, "game003CoinOverlay.text.fill"),
    stroke: assertNonEmptyString(
      record.stroke,
      "game003CoinOverlay.text.stroke",
    ),
    strokeWidth: assertPositiveNumber(
      record.strokeWidth,
      "game003CoinOverlay.text.strokeWidth",
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

function assertLiteral<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    throw new Error(`${label} must be "${expected}".`);
  }
  return expected;
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
