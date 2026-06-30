import type {
  SlotGameStaticArtConfig,
  SlotGameStaticArtVariant,
  SlotGameStaticConfig,
  SlotGameStaticConveyorConfig,
  SlotGameStaticImageResource,
  SlotGameStaticLiveConfig,
  SlotGameStaticMargin,
  SlotGameStaticPoint,
  SlotGameStaticReelConfig,
  SlotGameStaticRect,
  SlotGameStaticSkinConfig,
  SlotGameStaticSymbolsConfig,
} from "./types.js";

export function assertSlotGameStaticConfig(
  config: unknown,
): asserts config is SlotGameStaticConfig {
  const record = assertRecord(config, "static config");
  assertKeys(record, "static config", [
    "schemaVersion",
    "gameId",
    "brandLabel",
    "live",
    "supportedSkins",
    "gameConfig",
    "skins",
    "reel",
  ]);
  if (record.schemaVersion !== 1) {
    throw new Error("static config schemaVersion must be 1.");
  }
  assertNonEmptyString(record.gameId, "static config gameId");
  assertNonEmptyString(record.brandLabel, "static config brandLabel");

  const live = assertLiveConfig(record.live);
  const supportedSkins = assertStringArray(
    record.supportedSkins,
    "static config supportedSkins",
    { nonEmpty: true },
  );
  assertUniqueStrings(supportedSkins, "static config supportedSkins");

  const skins = assertRecord(record.skins, "static config skins");
  const supportedSkinSet = new Set(supportedSkins);
  for (const skinId of supportedSkins) {
    if (!Object.prototype.hasOwnProperty.call(skins, skinId)) {
      throw new Error(
        `static config skins is missing supported skin "${skinId}".`,
      );
    }
  }
  for (const skinId of Object.keys(skins)) {
    if (!supportedSkinSet.has(skinId)) {
      throw new Error(
        `static config skins declares unsupported skin "${skinId}".`,
      );
    }
    assertSkinConfig(skins[skinId], `static config skins.${skinId}`);
  }

  const reel = assertReelConfig(record.reel);
  for (const skinId of supportedSkins) {
    assertReelWindowMatchesReelConfig(
      (skins[skinId] as SlotGameStaticSkinConfig).art
        .reelWindowInMainReelBackground,
      reel,
      `static config skins.${skinId}.art.reelWindowInMainReelBackground`,
    );
  }

  if (!isWebSocketUrl(live.serverUrl)) {
    throw new Error("static config live.serverUrl must be ws:// or wss://.");
  }
}

function assertLiveConfig(value: unknown): SlotGameStaticLiveConfig {
  const record = assertRecord(value, "static config live");
  assertKeys(record, "static config live", [
    "serverUrl",
    "gamecode",
    "rejectQueryParams",
  ]);
  const live = {
    serverUrl: assertNonEmptyString(
      record.serverUrl,
      "static config live.serverUrl",
    ),
    gamecode: assertNonEmptyString(
      record.gamecode,
      "static config live.gamecode",
    ),
    rejectQueryParams: assertStringArray(
      record.rejectQueryParams,
      "static config live.rejectQueryParams",
      { nonEmpty: false },
    ),
  };
  assertUniqueStrings(
    live.rejectQueryParams,
    "static config live.rejectQueryParams",
  );
  return live;
}

function assertSkinConfig(
  value: unknown,
  label: string,
): asserts value is SlotGameStaticSkinConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["label", "symbols", "art"]);
  assertNonEmptyString(record.label, `${label}.label`);
  assertSymbolsConfig(record.symbols, `${label}.symbols`);
  assertArtConfig(record.art, `${label}.art`);
}

function assertSymbolsConfig(
  value: unknown,
  label: string,
): asserts value is SlotGameStaticSymbolsConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "manifest",
    "pngModules",
    "emptySymbols",
    "requireExplicitScale",
    "requiredStates",
  ]);
  assertRecord(record.manifest, `${label}.manifest`);
  assertStringRecord(record.pngModules, `${label}.pngModules`);
  assertUniqueStrings(
    assertStringArray(record.emptySymbols, `${label}.emptySymbols`, {
      nonEmpty: false,
    }),
    `${label}.emptySymbols`,
  );
  if (typeof record.requireExplicitScale !== "boolean") {
    throw new Error(`${label}.requireExplicitScale must be a boolean.`);
  }
  assertUniqueStrings(
    assertStringArray(record.requiredStates, `${label}.requiredStates`, {
      nonEmpty: true,
    }),
    `${label}.requiredStates`,
  );
}

function assertArtConfig(
  value: unknown,
  label: string,
): asserts value is SlotGameStaticArtConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "mode",
    "variants",
    "mainReelBackground",
    "reelWindowInMainReelBackground",
  ]);
  if (record.mode !== "orientation-focus") {
    throw new Error(`${label}.mode must be orientation-focus.`);
  }
  const variants = assertRecord(record.variants, `${label}.variants`);
  assertKeys(variants, `${label}.variants`, ["landscape", "portrait"]);
  const mainReelBackground = assertImageResource(
    record.mainReelBackground,
    `${label}.mainReelBackground`,
  );
  assertArtVariant(
    variants.landscape,
    `${label}.variants.landscape`,
    mainReelBackground,
  );
  assertArtVariant(
    variants.portrait,
    `${label}.variants.portrait`,
    mainReelBackground,
  );
  const reelWindow = assertRect(
    record.reelWindowInMainReelBackground,
    `${label}.reelWindowInMainReelBackground`,
  );
  assertRectFitsSize(
    reelWindow,
    mainReelBackground,
    `${label}.reelWindowInMainReelBackground`,
    `${label}.mainReelBackground`,
  );
}

function assertArtVariant(
  value: unknown,
  label: string,
  mainReelBackground: SlotGameStaticImageResource,
): SlotGameStaticArtVariant {
  const record = assertRecord(value, label);
  assertKeys(
    record,
    label,
    [
      "background",
      "focusRect",
      "frameFocusRect",
      "minFocusMargin",
      "mainReelBackgroundPositionInFocusRect",
      "conveyor",
    ],
    { optional: ["minFocusMargin", "conveyor"] },
  );
  const background = assertImageResource(
    record.background,
    `${label}.background`,
  );
  const focusRect = assertRect(record.focusRect, `${label}.focusRect`);
  assertRectFitsSize(
    focusRect,
    background,
    `${label}.focusRect`,
    `${label}.background`,
  );
  assertSize(record.frameFocusRect, `${label}.frameFocusRect`);
  if (record.minFocusMargin !== undefined) {
    assertMargin(record.minFocusMargin, `${label}.minFocusMargin`);
  }
  const mainReelBackgroundPositionInFocusRect = assertPoint(
    record.mainReelBackgroundPositionInFocusRect,
    `${label}.mainReelBackgroundPositionInFocusRect`,
  );
  assertPositionedSizeFits(
    mainReelBackgroundPositionInFocusRect,
    mainReelBackground,
    focusRect,
    background,
    `${label}.mainReelBackgroundPositionInFocusRect`,
    `${label}.mainReelBackground`,
    `${label}.focusRect`,
    `${label}.background`,
  );
  if (record.conveyor !== undefined) {
    const conveyor = assertConveyor(record.conveyor, `${label}.conveyor`);
    assertPositionedSizeFits(
      conveyor.positionInFocusRect,
      conveyor,
      focusRect,
      background,
      `${label}.conveyor.positionInFocusRect`,
      `${label}.conveyor`,
      `${label}.focusRect`,
      `${label}.background`,
    );
  }
  return record as unknown as SlotGameStaticArtVariant;
}

function assertConveyor(
  value: unknown,
  label: string,
): SlotGameStaticConveyorConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["url", "width", "height", "positionInFocusRect"]);
  assertNonEmptyString(record.url, `${label}.url`);
  assertSize(record, label);
  assertPoint(record.positionInFocusRect, `${label}.positionInFocusRect`);
  return record as unknown as SlotGameStaticConveyorConfig;
}

function assertReelConfig(value: unknown): SlotGameStaticReelConfig {
  const record = assertRecord(value, "static config reel");
  assertKeys(record, "static config reel", [
    "kind",
    "reelsName",
    "reelCount",
    "visibleRows",
    "direction",
    "minimumSpinCycles",
    "baseDurationMs",
    "speedSymbolsPerSecond",
    "startDelayMs",
    "stopDelayMs",
  ]);
  if (record.kind !== "normal" && record.kind !== "grid-cell") {
    throw new Error("static config reel.kind must be normal or grid-cell.");
  }
  assertNonEmptyString(record.reelsName, "static config reel.reelsName");
  assertPositiveInteger(record.reelCount, "static config reel.reelCount");
  assertPositiveInteger(record.visibleRows, "static config reel.visibleRows");
  if (record.direction !== "forward" && record.direction !== "reverse") {
    throw new Error("static config reel.direction must be forward or reverse.");
  }
  assertNonNegativeInteger(
    record.minimumSpinCycles,
    "static config reel.minimumSpinCycles",
  );
  assertPositiveFiniteNumber(
    record.baseDurationMs,
    "static config reel.baseDurationMs",
  );
  assertPositiveFiniteNumber(
    record.speedSymbolsPerSecond,
    "static config reel.speedSymbolsPerSecond",
  );
  assertNonNegativeFiniteNumber(
    record.startDelayMs,
    "static config reel.startDelayMs",
  );
  assertNonNegativeFiniteNumber(
    record.stopDelayMs,
    "static config reel.stopDelayMs",
  );
  return record as unknown as SlotGameStaticReelConfig;
}

function assertReelWindowMatchesReelConfig(
  reelWindow: SlotGameStaticRect,
  reel: SlotGameStaticReelConfig,
  label: string,
): void {
  if (reelWindow.width % reel.reelCount !== 0) {
    throw new Error(`${label}.width must divide reel.reelCount.`);
  }
  if (reelWindow.height % reel.visibleRows !== 0) {
    throw new Error(`${label}.height must divide reel.visibleRows.`);
  }
}

function assertImageResource(
  value: unknown,
  label: string,
): SlotGameStaticImageResource {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["url", "width", "height"]);
  assertNonEmptyString(record.url, `${label}.url`);
  assertSize(record, label);
  return record as unknown as SlotGameStaticImageResource;
}

function assertRect(value: unknown, label: string): SlotGameStaticRect {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["x", "y", "width", "height"]);
  assertNonNegativeFiniteNumber(record.x, `${label}.x`);
  assertNonNegativeFiniteNumber(record.y, `${label}.y`);
  assertSize(record, label);
  return record as unknown as SlotGameStaticRect;
}

function assertPoint(value: unknown, label: string): SlotGameStaticPoint {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["x", "y"]);
  assertFiniteNumber(record.x, `${label}.x`);
  assertFiniteNumber(record.y, `${label}.y`);
  return record as unknown as SlotGameStaticPoint;
}

function assertSize(value: unknown, label: string): void {
  const record = assertRecord(value, label);
  assertPositiveFiniteNumber(record.width, `${label}.width`);
  assertPositiveFiniteNumber(record.height, `${label}.height`);
}

function assertMargin(
  value: unknown,
  label: string,
): asserts value is SlotGameStaticMargin {
  const record = assertRecord(value, label);
  assertOnlyKnownKeys(record, label, ["left", "right", "top", "bottom"]);
  for (const key of ["left", "right", "top", "bottom"] as const) {
    if (record[key] !== undefined) {
      assertNonNegativeFiniteNumber(record[key], `${label}.${key}`);
    }
  }
}

function assertOnlyKnownKeys(
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
}

function assertRectFitsSize(
  rect: SlotGameStaticRect,
  size: SlotGameStaticImageResource,
  rectLabel: string,
  sizeLabel: string,
): void {
  if (rect.x + rect.width > size.width || rect.y + rect.height > size.height) {
    throw new Error(`${rectLabel} must fit inside ${sizeLabel}.`);
  }
}

function assertPositionedSizeFits(
  positionInFocusRect: SlotGameStaticPoint,
  size: SlotGameStaticImageResource,
  focusRect: SlotGameStaticRect,
  background: SlotGameStaticImageResource,
  positionLabel: string,
  sizeLabel: string,
  focusRectLabel: string,
  backgroundLabel: string,
): void {
  const x = focusRect.x + positionInFocusRect.x;
  const y = focusRect.y + positionInFocusRect.y;
  if (
    x < 0 ||
    y < 0 ||
    x + size.width > background.width ||
    y + size.height > background.height
  ) {
    throw new Error(
      `${positionLabel} + ${sizeLabel} must map from ${focusRectLabel} inside ${backgroundLabel}.`,
    );
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertStringRecord(
  value: unknown,
  label: string,
): Record<string, string> {
  const record = assertRecord(value, label);
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${label}.${key} must be a non-empty string.`);
    }
  }
  return record as Record<string, string>;
}

function assertKeys(
  record: Record<string, unknown>,
  label: string,
  allowed: readonly string[],
  options: { readonly optional?: readonly string[] } = {},
): void {
  const allowedSet = new Set(allowed);
  const optionalSet = new Set(options.optional ?? []);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new Error(`${label} declares unknown field "${key}".`);
    }
  }
  for (const key of allowed) {
    if (
      !Object.prototype.hasOwnProperty.call(record, key) &&
      !optionalSet.has(key)
    ) {
      throw new Error(`${label}.${key} is required.`);
    }
  }
}

function assertStringArray(
  value: unknown,
  label: string,
  options: { readonly nonEmpty: boolean },
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  if (options.nonEmpty && value.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return Object.freeze(
    value.map((item, index) =>
      assertNonEmptyString(item, `${label}[${index}]`),
    ),
  );
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} must not contain duplicate value "${value}".`);
    }
    seen.add(value);
  }
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function assertPositiveFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
  return value;
}

function assertNonNegativeFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function isWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "ws:" || url.protocol === "wss:";
  } catch {
    return false;
  }
}
