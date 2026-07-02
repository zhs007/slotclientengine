import {
  GAME003_BG_BAR_SHIFT_DURATION_SECONDS,
  GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS,
} from "./bg-bar-runtime.js";

export const GAME003_MINECART_LOADING_RESOURCE_ID = "game003-minecart";

export interface Game003MinecartInteractionConfig {
  readonly loadingResourceId: typeof GAME003_MINECART_LOADING_RESOURCE_ID;
  readonly imageSize: Game003MinecartSize;
  readonly timing: {
    readonly cartRushDurationSeconds: number;
    readonly symbolFlyDurationSeconds: number;
    readonly maxTotalBeforeReelStopSeconds: number;
  };
  readonly motion: {
    readonly overshootPixels: number;
    readonly brakeTiltDegrees: number;
    readonly reboundTiltDegrees: number;
  };
  readonly payload: {
    readonly symbolScale: number;
    readonly fadeStartAlpha: number;
    readonly fadeEndAlpha: number;
  };
  readonly layout: Readonly<
    Record<"landscape" | "portrait", Game003MinecartLayoutConfig>
  >;
}

export interface Game003MinecartSize {
  readonly width: number;
  readonly height: number;
}

export interface Game003MinecartPoint {
  readonly x: number;
  readonly y: number;
}

export interface Game003MinecartLayoutConfig {
  readonly entrySide: "left" | "right";
  readonly offscreenMargin: number;
  readonly stopOffsetFromReelAreaBottomCenter: Game003MinecartPoint;
  readonly cartPivotInImage: Game003MinecartPoint;
  readonly payloadAnchorInImage: Game003MinecartPoint;
}

export function getGame003MinecartInteractionConfig(
  appExtensions: unknown,
): Game003MinecartInteractionConfig {
  const extensions = assertRecord(appExtensions, "game003 appExtensions");
  const rawConfig = extensions.game003MinecartInteraction;
  if (rawConfig === undefined) {
    throw new Error(
      "game003 appExtensions.game003MinecartInteraction is required.",
    );
  }
  const record = assertRecord(rawConfig, "game003MinecartInteraction");
  assertKeys(record, "game003MinecartInteraction", [
    "loadingResourceId",
    "imageSize",
    "timing",
    "motion",
    "payload",
    "layout",
  ]);
  if (record.loadingResourceId !== GAME003_MINECART_LOADING_RESOURCE_ID) {
    throw new Error(
      `game003MinecartInteraction.loadingResourceId must be ${GAME003_MINECART_LOADING_RESOURCE_ID}.`,
    );
  }
  const imageSize = parseSize(
    record.imageSize,
    "game003MinecartInteraction.imageSize",
  );
  const config = Object.freeze({
    loadingResourceId: GAME003_MINECART_LOADING_RESOURCE_ID,
    imageSize,
    timing: parseTiming(record.timing),
    motion: parseMotion(record.motion),
    payload: parsePayload(record.payload),
    layout: Object.freeze({
      landscape: parseLayoutConfig(record.layout, "landscape", imageSize),
      portrait: parseLayoutConfig(record.layout, "portrait", imageSize),
    }),
  });
  const total = getGame003MinecartTotalDurationSeconds(config);
  if (total > config.timing.maxTotalBeforeReelStopSeconds) {
    throw new Error(
      `game003 minecart total duration ${total}s exceeds maxTotalBeforeReelStopSeconds ${config.timing.maxTotalBeforeReelStopSeconds}s.`,
    );
  }
  return config;
}

export function getGame003MinecartTotalDurationSeconds(
  config: Pick<Game003MinecartInteractionConfig, "timing">,
): number {
  return (
    GAME003_BG_BAR_SHIFT_DURATION_SECONDS +
    GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS +
    config.timing.cartRushDurationSeconds +
    config.timing.symbolFlyDurationSeconds
  );
}

function parseTiming(
  value: unknown,
): Game003MinecartInteractionConfig["timing"] {
  const record = assertRecord(value, "game003MinecartInteraction.timing");
  assertKeys(record, "game003MinecartInteraction.timing", [
    "cartRushDurationSeconds",
    "symbolFlyDurationSeconds",
    "maxTotalBeforeReelStopSeconds",
  ]);
  const timing = Object.freeze({
    cartRushDurationSeconds: assertPositiveNumber(
      record.cartRushDurationSeconds,
      "game003MinecartInteraction.timing.cartRushDurationSeconds",
    ),
    symbolFlyDurationSeconds: assertPositiveNumber(
      record.symbolFlyDurationSeconds,
      "game003MinecartInteraction.timing.symbolFlyDurationSeconds",
    ),
    maxTotalBeforeReelStopSeconds: assertPositiveNumber(
      record.maxTotalBeforeReelStopSeconds,
      "game003MinecartInteraction.timing.maxTotalBeforeReelStopSeconds",
    ),
  });
  if (timing.maxTotalBeforeReelStopSeconds > 1.3) {
    throw new Error(
      "game003MinecartInteraction.timing.maxTotalBeforeReelStopSeconds must be <= 1.3.",
    );
  }
  return timing;
}

function parseMotion(
  value: unknown,
): Game003MinecartInteractionConfig["motion"] {
  const record = assertRecord(value, "game003MinecartInteraction.motion");
  assertKeys(record, "game003MinecartInteraction.motion", [
    "overshootPixels",
    "brakeTiltDegrees",
    "reboundTiltDegrees",
  ]);
  return Object.freeze({
    overshootPixels: assertNonNegativeNumber(
      record.overshootPixels,
      "game003MinecartInteraction.motion.overshootPixels",
    ),
    brakeTiltDegrees: assertPositiveNumber(
      record.brakeTiltDegrees,
      "game003MinecartInteraction.motion.brakeTiltDegrees",
    ),
    reboundTiltDegrees: assertFiniteNumber(
      record.reboundTiltDegrees,
      "game003MinecartInteraction.motion.reboundTiltDegrees",
    ),
  });
}

function parsePayload(
  value: unknown,
): Game003MinecartInteractionConfig["payload"] {
  const record = assertRecord(value, "game003MinecartInteraction.payload");
  assertKeys(record, "game003MinecartInteraction.payload", [
    "symbolScale",
    "fadeStartAlpha",
    "fadeEndAlpha",
  ]);
  const payload = Object.freeze({
    symbolScale: assertPositiveNumber(
      record.symbolScale,
      "game003MinecartInteraction.payload.symbolScale",
    ),
    fadeStartAlpha: assertUnitInterval(
      record.fadeStartAlpha,
      "game003MinecartInteraction.payload.fadeStartAlpha",
    ),
    fadeEndAlpha: assertUnitInterval(
      record.fadeEndAlpha,
      "game003MinecartInteraction.payload.fadeEndAlpha",
    ),
  });
  if (payload.fadeEndAlpha > payload.fadeStartAlpha) {
    throw new Error(
      "game003MinecartInteraction.payload.fadeEndAlpha must be <= fadeStartAlpha.",
    );
  }
  return payload;
}

function parseLayoutConfig(
  value: unknown,
  orientation: "landscape" | "portrait",
  imageSize: Game003MinecartSize,
): Game003MinecartLayoutConfig {
  const layouts = assertRecord(value, "game003MinecartInteraction.layout");
  assertKeys(layouts, "game003MinecartInteraction.layout", [
    "landscape",
    "portrait",
  ]);
  const label = `game003MinecartInteraction.layout.${orientation}`;
  const record = assertRecord(layouts[orientation], label);
  assertKeys(record, label, [
    "entrySide",
    "offscreenMargin",
    "stopOffsetFromReelAreaBottomCenter",
    "cartPivotInImage",
    "payloadAnchorInImage",
  ]);
  if (record.entrySide !== "left" && record.entrySide !== "right") {
    throw new Error(`${label}.entrySide must be left or right.`);
  }
  const config = Object.freeze({
    entrySide: record.entrySide,
    offscreenMargin: assertNonNegativeNumber(
      record.offscreenMargin,
      `${label}.offscreenMargin`,
    ),
    stopOffsetFromReelAreaBottomCenter: parsePoint(
      record.stopOffsetFromReelAreaBottomCenter,
      `${label}.stopOffsetFromReelAreaBottomCenter`,
    ),
    cartPivotInImage: parsePoint(
      record.cartPivotInImage,
      `${label}.cartPivotInImage`,
    ),
    payloadAnchorInImage: parsePoint(
      record.payloadAnchorInImage,
      `${label}.payloadAnchorInImage`,
    ),
  });
  assertPointInsideImage(
    config.cartPivotInImage,
    imageSize,
    `${label}.cartPivotInImage`,
  );
  assertPointInsideImage(
    config.payloadAnchorInImage,
    imageSize,
    `${label}.payloadAnchorInImage`,
  );
  return config;
}

function parseSize(value: unknown, label: string): Game003MinecartSize {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["width", "height"]);
  return Object.freeze({
    width: assertPositiveNumber(record.width, `${label}.width`),
    height: assertPositiveNumber(record.height, `${label}.height`),
  });
}

function parsePoint(value: unknown, label: string): Game003MinecartPoint {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["x", "y"]);
  return Object.freeze({
    x: assertFiniteNumber(record.x, `${label}.x`),
    y: assertFiniteNumber(record.y, `${label}.y`),
  });
}

function assertPointInsideImage(
  point: Game003MinecartPoint,
  imageSize: Game003MinecartSize,
  label: string,
): void {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x > imageSize.width ||
    point.y > imageSize.height
  ) {
    throw new Error(`${label} must be inside minecart imageSize.`);
  }
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
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new Error(`${label} declares unknown field "${key}".`);
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`${label}.${key} is required.`);
    }
  }
}

function assertPositiveNumber(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return number;
}

function assertNonNegativeNumber(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number < 0) {
    throw new Error(`${label} must be non-negative.`);
  }
  return number;
}

function assertUnitInterval(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number < 0 || number > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
  return number;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}
