import raw from "../config/game-runtime.manifest.json";

export const GAME003V2_CONFIG = parse(raw);

function parse(value: unknown) {
  const root = record(value, "runtime config");
  if (root.version !== 1) throw new Error("runtime config.version must be 1.");
  const live = record(root.live, "runtime config.live");
  const reel = record(root.reel, "runtime config.reel");
  const carousel = record(root.winCarousel, "runtime config.winCarousel");
  const amountText = record(
    carousel.amountText,
    "runtime config.winCarousel.amountText",
  );
  const direction = reel.direction;
  if (direction !== "forward" && direction !== "backward")
    throw new Error("runtime config reel direction is invalid.");
  return Object.freeze({
    brandLabel: string(root.brandLabel, "brandLabel"),
    live: Object.freeze({
      serverUrl: string(live.serverUrl, "live.serverUrl"),
      gamecode: string(live.gamecode, "live.gamecode"),
    }),
    reel: Object.freeze({
      direction,
      minimumSpinCycles: integer(reel.minimumSpinCycles, "minimumSpinCycles"),
      baseDurationMs: positive(reel.baseDurationMs, "baseDurationMs"),
      speedSymbolsPerSecond: positive(
        reel.speedSymbolsPerSecond,
        "speedSymbolsPerSecond",
      ),
      startDelayMs: nonNegative(reel.startDelayMs, "startDelayMs"),
      stopDelayMs: nonNegative(reel.stopDelayMs, "stopDelayMs"),
    }),
    winCarousel: Object.freeze({
      cyclePauseSeconds: positive(
        carousel.cyclePauseSeconds,
        "cyclePauseSeconds",
      ),
      amountText: Object.freeze({
        yOffsetRatioFromCellCenter: nonNegative(
          amountText.yOffsetRatioFromCellCenter,
          "yOffsetRatioFromCellCenter",
        ),
        fontSize: positive(amountText.fontSize, "fontSize"),
        fill: string(amountText.fill, "fill"),
        stroke: string(amountText.stroke, "stroke"),
        strokeWidth: nonNegative(amountText.strokeWidth, "strokeWidth"),
      }),
    }),
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function positive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be positive.`);
  return value;
}

function nonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be non-negative.`);
  return value;
}

function integer(value: unknown, label: string): number {
  const parsed = nonNegative(value, label);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`${label} must be an integer.`);
  return parsed;
}
