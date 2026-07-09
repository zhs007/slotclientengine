import type {
  SlotGameStaticArtConfig,
  SlotGameStaticArtVariant,
  SlotGameStaticConfig,
  SlotGameStaticConveyorConfig,
  SlotGameStaticFeatureBarConfig,
  SlotGameStaticFeatureBarLayoutVariant,
  SlotGameStaticFeatureBarSymbolsConfig,
  SlotGameStaticImageResource,
  SlotGameStaticLiveConfig,
  SlotGameStaticMargin,
  SlotGameStaticPoint,
  SlotGameStaticReelAreaConfig,
  SlotGameStaticReelConfig,
  SlotGameStaticRect,
  SlotGameStaticSkinConfig,
  SlotGameStaticSymbolsConfig,
  SlotGameStaticWinAmountAnimations,
  SlotGameStaticWinAmountConfig,
  SlotGameStaticWinAmountLayout,
  SlotGameStaticWinAmountText,
  SlotGameStaticWinAmountThresholds,
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
    assertReelAreaMatchesReelConfig(
      (skins[skinId] as SlotGameStaticSkinConfig).art
        .reelAreaInMainReelBackground,
      reel,
      `static config skins.${skinId}.art.reelAreaInMainReelBackground`,
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
  assertKeys(
    record,
    label,
    ["label", "symbols", "art", "featureBars", "winAmount", "appExtensions"],
    {
      optional: ["featureBars", "winAmount", "appExtensions"],
    },
  );
  assertNonEmptyString(record.label, `${label}.label`);
  assertSymbolsConfig(record.symbols, `${label}.symbols`);
  const art = assertArtConfig(record.art, `${label}.art`);
  if (record.featureBars !== undefined) {
    assertFeatureBarsConfig(record.featureBars, `${label}.featureBars`, art);
  }
  if (record.winAmount !== undefined) {
    assertWinAmountConfig(record.winAmount, `${label}.winAmount`);
  }
  if (record.appExtensions !== undefined) {
    assertRecord(record.appExtensions, `${label}.appExtensions`);
  }
}

function assertSymbolsConfig(
  value: unknown,
  label: string,
): asserts value is SlotGameStaticSymbolsConfig {
  const record = assertRecord(value, label);
  assertKeys(
    record,
    label,
    [
      "manifest",
      "pngModules",
      "vniProjectModules",
      "vniAssetModules",
      "spineSkeletonModules",
      "spineAtlasModules",
      "spineTextureModules",
      "emptySymbols",
      "requireExplicitScale",
      "requiredStates",
    ],
    {
      optional: [
        "vniProjectModules",
        "vniAssetModules",
        "spineSkeletonModules",
        "spineAtlasModules",
        "spineTextureModules",
      ],
    },
  );
  assertRecord(record.manifest, `${label}.manifest`);
  assertStringRecord(record.pngModules, `${label}.pngModules`);
  if (record.vniProjectModules !== undefined) {
    assertRecord(record.vniProjectModules, `${label}.vniProjectModules`);
  }
  if (record.vniAssetModules !== undefined) {
    assertStringRecord(record.vniAssetModules, `${label}.vniAssetModules`);
  }
  if (record.spineSkeletonModules !== undefined) {
    assertRecord(record.spineSkeletonModules, `${label}.spineSkeletonModules`);
  }
  if (record.spineAtlasModules !== undefined) {
    assertStringRecord(record.spineAtlasModules, `${label}.spineAtlasModules`);
  }
  if (record.spineTextureModules !== undefined) {
    assertStringRecord(
      record.spineTextureModules,
      `${label}.spineTextureModules`,
    );
  }
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
): SlotGameStaticArtConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "mode",
    "variants",
    "mainReelBackground",
    "reelAreaInMainReelBackground",
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
  const reelArea = assertReelArea(
    record.reelAreaInMainReelBackground,
    `${label}.reelAreaInMainReelBackground`,
  );
  assertRectFitsSize(
    reelArea,
    mainReelBackground,
    `${label}.reelAreaInMainReelBackground`,
    `${label}.mainReelBackground`,
  );
  return record as unknown as SlotGameStaticArtConfig;
}

function assertFeatureBarsConfig(
  value: unknown,
  label: string,
  art: SlotGameStaticArtConfig,
): asserts value is Readonly<Record<string, SlotGameStaticFeatureBarConfig>> {
  const record = assertRecord(value, label);
  if (Object.keys(record).length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  for (const [featureBarId, featureBar] of Object.entries(record)) {
    if (featureBarId.trim().length === 0) {
      throw new Error(`${label} must not contain an empty feature bar id.`);
    }
    assertFeatureBarConfig(featureBar, `${label}.${featureBarId}`, art);
  }
}

function assertFeatureBarConfig(
  value: unknown,
  label: string,
  art: SlotGameStaticArtConfig,
): SlotGameStaticFeatureBarConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "componentName",
    "queueLength",
    "visibleCount",
    "terminalSlotIndex",
    "emptyFeature",
    "allowedFeatures",
    "symbols",
    "layout",
  ]);
  assertNonEmptyString(record.componentName, `${label}.componentName`);
  const queueLength = assertPositiveInteger(
    record.queueLength,
    `${label}.queueLength`,
  );
  const visibleCount = assertPositiveInteger(
    record.visibleCount,
    `${label}.visibleCount`,
  );
  if (visibleCount >= queueLength) {
    throw new Error(`${label}.visibleCount must be less than queueLength.`);
  }
  const terminalSlotIndex = assertNonNegativeInteger(
    record.terminalSlotIndex,
    `${label}.terminalSlotIndex`,
  );
  if (terminalSlotIndex >= queueLength) {
    throw new Error(
      `${label}.terminalSlotIndex must be less than queueLength.`,
    );
  }
  const allowedFeatures = assertStringArray(
    record.allowedFeatures,
    `${label}.allowedFeatures`,
    { nonEmpty: true },
  );
  assertUniqueStrings(allowedFeatures, `${label}.allowedFeatures`);
  const emptyFeature = assertNonEmptyString(
    record.emptyFeature,
    `${label}.emptyFeature`,
  );
  if (!allowedFeatures.includes(emptyFeature)) {
    throw new Error(`${label}.emptyFeature must exist in allowedFeatures.`);
  }
  assertFeatureBarSymbolsConfig(record.symbols, `${label}.symbols`);
  assertFeatureBarLayoutConfig(
    record.layout,
    `${label}.layout`,
    queueLength,
    art,
  );
  return record as unknown as SlotGameStaticFeatureBarConfig;
}

function assertFeatureBarSymbolsConfig(
  value: unknown,
  label: string,
): asserts value is SlotGameStaticFeatureBarSymbolsConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "manifest",
    "pngModules",
    "requireExplicitScale",
    "requiredStates",
  ]);
  assertRecord(record.manifest, `${label}.manifest`);
  assertStringRecord(record.pngModules, `${label}.pngModules`);
  if (typeof record.requireExplicitScale !== "boolean") {
    throw new Error(`${label}.requireExplicitScale must be a boolean.`);
  }
  assertUniqueStrings(
    assertStringArray(record.requiredStates, `${label}.requiredStates`, {
      nonEmpty: false,
    }),
    `${label}.requiredStates`,
  );
}

function assertFeatureBarLayoutConfig(
  value: unknown,
  label: string,
  queueLength: number,
  art: SlotGameStaticArtConfig,
): void {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["landscape", "portrait"]);
  assertFeatureBarLayoutVariant(
    record.landscape,
    `${label}.landscape`,
    queueLength,
    art.variants.landscape.conveyor,
  );
  assertFeatureBarLayoutVariant(
    record.portrait,
    `${label}.portrait`,
    queueLength,
    art.variants.portrait.conveyor,
  );
}

function assertFeatureBarLayoutVariant(
  value: unknown,
  label: string,
  queueLength: number,
  conveyor: SlotGameStaticConveyorConfig | undefined,
): asserts value is SlotGameStaticFeatureBarLayoutVariant {
  if (!conveyor) {
    throw new Error(`${label} requires a matching art conveyor config.`);
  }
  const record = assertRecord(value, label);
  assertKeys(record, label, ["movement", "slotRectsInConveyor"]);
  if (record.movement !== "down" && record.movement !== "right") {
    throw new Error(`${label}.movement must be down or right.`);
  }
  if (!Array.isArray(record.slotRectsInConveyor)) {
    throw new Error(`${label}.slotRectsInConveyor must be an array.`);
  }
  if (record.slotRectsInConveyor.length !== queueLength) {
    throw new Error(
      `${label}.slotRectsInConveyor length must equal queueLength.`,
    );
  }
  record.slotRectsInConveyor.forEach((rect, index) => {
    const parsedRect = assertRect(
      rect,
      `${label}.slotRectsInConveyor[${index}]`,
    );
    assertRectFitsSize(
      parsedRect,
      conveyor,
      `${label}.slotRectsInConveyor[${index}]`,
      `${label}.conveyor`,
    );
  });
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

function assertReelAreaMatchesReelConfig(
  reelArea: SlotGameStaticReelAreaConfig,
  reel: SlotGameStaticReelConfig,
  label: string,
): void {
  if (reelArea.reelCount !== reel.reelCount) {
    throw new Error(`${label}.reelCount must match reel.reelCount.`);
  }
  const expectedWidth =
    reelArea.reelCount * reelArea.cellWidth +
    (reelArea.reelCount - 1) * reelArea.reelGap;
  if (!nearlyEqual(reelArea.width, expectedWidth)) {
    throw new Error(
      `${label}.width must equal reelCount * cellWidth plus total reel gaps.`,
    );
  }
  const expectedHeight = reel.visibleRows * reelArea.cellHeight;
  if (!nearlyEqual(reelArea.height, expectedHeight)) {
    throw new Error(`${label}.height must equal visibleRows * cellHeight.`);
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

function assertReelArea(
  value: unknown,
  label: string,
): SlotGameStaticReelAreaConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "x",
    "y",
    "width",
    "height",
    "reelCount",
    "reelGap",
    "cellWidth",
    "cellHeight",
  ]);
  assertNonNegativeFiniteNumber(record.x, `${label}.x`);
  assertNonNegativeFiniteNumber(record.y, `${label}.y`);
  assertSize(record, label);
  assertPositiveInteger(record.reelCount, `${label}.reelCount`);
  assertNonNegativeFiniteNumber(record.reelGap, `${label}.reelGap`);
  assertPositiveFiniteNumber(record.cellWidth, `${label}.cellWidth`);
  assertPositiveFiniteNumber(record.cellHeight, `${label}.cellHeight`);
  return record as unknown as SlotGameStaticReelAreaConfig;
}

function assertWinAmountConfig(
  value: unknown,
  label: string,
): asserts value is SlotGameStaticWinAmountConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "amountScale",
    "currency",
    "locale",
    "minorCountDurationSeconds",
    "majorCountDurationSeconds",
    "thresholds",
    "text",
    "layout",
    "animations",
  ]);
  assertPositiveFiniteNumber(record.amountScale, `${label}.amountScale`);
  assertNonEmptyString(record.currency, `${label}.currency`);
  assertNonEmptyString(record.locale, `${label}.locale`);
  assertPositiveFiniteNumber(
    record.minorCountDurationSeconds,
    `${label}.minorCountDurationSeconds`,
  );
  assertPositiveFiniteNumber(
    record.majorCountDurationSeconds,
    `${label}.majorCountDurationSeconds`,
  );
  assertWinAmountThresholds(record.thresholds, `${label}.thresholds`);
  assertWinAmountText(record.text, `${label}.text`);
  assertWinAmountLayout(record.layout, `${label}.layout`);
  assertWinAmountAnimations(record.animations, `${label}.animations`);
}

function assertWinAmountThresholds(
  value: unknown,
  label: string,
): SlotGameStaticWinAmountThresholds {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "minorMultiplier",
    "bigMultiplier",
    "superMultiplier",
    "megaMultiplier",
  ]);
  const thresholds = {
    minorMultiplier: assertPositiveFiniteNumber(
      record.minorMultiplier,
      `${label}.minorMultiplier`,
    ),
    bigMultiplier: assertPositiveFiniteNumber(
      record.bigMultiplier,
      `${label}.bigMultiplier`,
    ),
    superMultiplier: assertPositiveFiniteNumber(
      record.superMultiplier,
      `${label}.superMultiplier`,
    ),
    megaMultiplier: assertPositiveFiniteNumber(
      record.megaMultiplier,
      `${label}.megaMultiplier`,
    ),
  };
  if (
    !(
      thresholds.bigMultiplier > thresholds.minorMultiplier &&
      thresholds.superMultiplier > thresholds.bigMultiplier &&
      thresholds.megaMultiplier > thresholds.superMultiplier
    )
  ) {
    throw new Error(`${label} must be strictly increasing.`);
  }
  return thresholds;
}

function assertWinAmountText(
  value: unknown,
  label: string,
): SlotGameStaticWinAmountText {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "minorFontSize",
    "majorFontSize",
    "fill",
    "stroke",
    "strokeWidth",
  ]);
  assertPositiveFiniteNumber(record.minorFontSize, `${label}.minorFontSize`);
  assertPositiveFiniteNumber(record.majorFontSize, `${label}.majorFontSize`);
  assertCssHexColor(record.fill, `${label}.fill`);
  assertCssHexColor(record.stroke, `${label}.stroke`);
  assertNonNegativeFiniteNumber(record.strokeWidth, `${label}.strokeWidth`);
  return record as unknown as SlotGameStaticWinAmountText;
}

function assertWinAmountLayout(
  value: unknown,
  label: string,
): SlotGameStaticWinAmountLayout {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "minorAnchor",
    "majorAnchor",
    "minorOffset",
    "majorOffset",
  ]);
  assertWinAmountAnchor(record.minorAnchor, `${label}.minorAnchor`);
  assertWinAmountAnchor(record.majorAnchor, `${label}.majorAnchor`);
  assertPoint(record.minorOffset, `${label}.minorOffset`);
  assertPoint(record.majorOffset, `${label}.majorOffset`);
  return record as unknown as SlotGameStaticWinAmountLayout;
}

function assertWinAmountAnimations(
  value: unknown,
  label: string,
): SlotGameStaticWinAmountAnimations {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["manifest", "projectModules", "assetModules"]);
  assertRecord(record.manifest, `${label}.manifest`);
  assertNonEmptyRecord(record.projectModules, `${label}.projectModules`);
  assertNonEmptyStringRecord(record.assetModules, `${label}.assetModules`);
  return record as unknown as SlotGameStaticWinAmountAnimations;
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

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.000001;
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

function assertNonEmptyRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  const record = assertRecord(value, label);
  if (Object.keys(record).length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return record;
}

function assertNonEmptyStringRecord(
  value: unknown,
  label: string,
): Record<string, string> {
  const record = assertStringRecord(value, label);
  if (Object.keys(record).length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return record;
}

function assertWinAmountAnchor(
  value: unknown,
  label: string,
): "reel-area-bottom-center" | "reel-area-center" {
  if (value === "reel-area-bottom-center" || value === "reel-area-center") {
    return value;
  }
  throw new Error(
    `${label} must be reel-area-bottom-center or reel-area-center.`,
  );
}

function assertCssHexColor(value: unknown, label: string): string {
  const color = assertNonEmptyString(value, label);
  if (!/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/u.test(color)) {
    throw new Error(`${label} must be #RRGGBB or #RRGGBBAA.`);
  }
  return color;
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
