import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import {
  assertExistingDirectory,
  assertExistingFile,
  assertExtension,
  assertRepoRelativePath,
  getGlobDirectory,
} from "./path-utils.js";
import type {
  GameStaticYamlArtConfig,
  GameStaticYamlArtVariant,
  GameStaticYamlConfig,
  GameStaticYamlConveyor,
  GameStaticYamlFeatureBarConfig,
  GameStaticYamlFeatureBarLayoutVariant,
  GameStaticYamlFeatureBarSymbolsConfig,
  GameStaticYamlImage,
  GameStaticYamlLoadingConfig,
  GameStaticYamlLoadingResource,
  GameStaticYamlLiveConfig,
  GameStaticYamlMargin,
  GameStaticYamlPoint,
  GameStaticYamlReelConfig,
  GameStaticYamlReelArea,
  GameStaticYamlRect,
  GameStaticYamlSize,
  GameStaticYamlSkinConfig,
  GameStaticYamlSymbolsConfig,
  GameStaticYamlWinAmountAnimations,
  GameStaticYamlWinAmountConfig,
  GameStaticYamlWinAmountLayout,
  GameStaticYamlWinAmountText,
  GameStaticYamlWinAmountThresholds,
  GameStaticYamlWinAmountTier,
} from "./types.js";

const MIN_WIN_AMOUNT_TIER_DURATION_SECONDS = 5;

export function loadGameStaticYamlConfig(options: {
  readonly rootDir: string;
  readonly inputPath: string;
}): GameStaticYamlConfig {
  assertExtension(options.inputPath, [".yaml", ".yml"], "--input");
  assertExistingFile(options.rootDir, options.inputPath);
  const content = readFileSync(
    `${options.rootDir}/${options.inputPath}`,
    "utf8",
  );
  const document = parseDocument(content, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`YAML 解析失败：${document.errors[0].message}`);
  }
  if (document.warnings.length > 0) {
    throw new Error(`YAML 包含不安全内容：${document.warnings[0].message}`);
  }
  return parseGameStaticYamlValue(document.toJS(), options);
}

export function parseGameStaticYamlValue(
  value: unknown,
  options: { readonly rootDir: string; readonly inputPath: string },
): GameStaticYamlConfig {
  const record = assertRecord(value, "game static YAML");
  assertKeys(
    record,
    "game static YAML",
    [
      "schemaVersion",
      "gameId",
      "brandLabel",
      "live",
      "supportedSkins",
      "gameConfig",
      "reel",
      "skins",
      "loading",
    ],
    {
      optional: ["loading"],
    },
  );
  if (record.schemaVersion !== 1) {
    throw new Error("schemaVersion 当前只支持 1。");
  }
  const reel = parseReel(record.reel);
  const config: GameStaticYamlConfig = Object.freeze({
    schemaVersion: 1,
    gameId: assertNonEmptyString(record.gameId, "gameId"),
    brandLabel: assertNonEmptyString(record.brandLabel, "brandLabel"),
    live: parseLive(record.live),
    supportedSkins: assertStringArray(record.supportedSkins, "supportedSkins", {
      nonEmpty: true,
    }),
    gameConfig: assertPath(record.gameConfig, "gameConfig"),
    reel,
    skins: parseSkins(record.skins, reel.visibleRows),
    ...(record.loading !== undefined
      ? { loading: parseLoading(record.loading) }
      : {}),
  });
  assertUnique(config.supportedSkins, "supportedSkins");
  assertExistingFile(options.rootDir, config.gameConfig);
  assertExtension(config.gameConfig, [".json"], "gameConfig");
  validateSkins(config, options.rootDir);
  if (config.loading) {
    validateLoading(config.loading, options.rootDir);
  }
  return config;
}

function parseLive(value: unknown): GameStaticYamlLiveConfig {
  const record = assertRecord(value, "live");
  assertKeys(record, "live", ["serverUrl", "gamecode", "rejectQueryParams"]);
  const live = Object.freeze({
    serverUrl: assertNonEmptyString(record.serverUrl, "live.serverUrl"),
    gamecode: assertNonEmptyString(record.gamecode, "live.gamecode"),
    rejectQueryParams: assertStringArray(
      record.rejectQueryParams,
      "live.rejectQueryParams",
      { nonEmpty: false },
    ),
  });
  assertUnique(live.rejectQueryParams, "live.rejectQueryParams");
  assertWebSocketUrl(live.serverUrl);
  return live;
}

function parseReel(value: unknown): GameStaticYamlReelConfig {
  const record = assertRecord(value, "reel");
  assertKeys(record, "reel", [
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
  if (record.kind !== "normal") {
    throw new Error("buildgamestatic 第一版只支持 reel.kind=normal。");
  }
  if (record.direction !== "forward" && record.direction !== "reverse") {
    throw new Error("reel.direction 必须是 forward 或 reverse。");
  }
  return Object.freeze({
    kind: "normal",
    reelsName: assertNonEmptyString(record.reelsName, "reel.reelsName"),
    reelCount: assertPositiveInteger(record.reelCount, "reel.reelCount"),
    visibleRows: assertPositiveInteger(record.visibleRows, "reel.visibleRows"),
    direction: record.direction,
    minimumSpinCycles: assertNonNegativeInteger(
      record.minimumSpinCycles,
      "reel.minimumSpinCycles",
    ),
    baseDurationMs: assertPositiveNumber(
      record.baseDurationMs,
      "reel.baseDurationMs",
    ),
    speedSymbolsPerSecond: assertPositiveNumber(
      record.speedSymbolsPerSecond,
      "reel.speedSymbolsPerSecond",
    ),
    startDelayMs: assertNonNegativeNumber(
      record.startDelayMs,
      "reel.startDelayMs",
    ),
    stopDelayMs: assertNonNegativeNumber(
      record.stopDelayMs,
      "reel.stopDelayMs",
    ),
  });
}

function parseSkins(
  value: unknown,
  visibleRows: number,
): Readonly<Record<string, GameStaticYamlSkinConfig>> {
  const record = assertRecord(value, "skins");
  const skins: Record<string, GameStaticYamlSkinConfig> = {};
  for (const [skinId, skinValue] of Object.entries(record)) {
    if (skinId.trim().length === 0) {
      throw new Error("skins 不能包含空 skin id。");
    }
    skins[skinId] = parseSkin(skinValue, `skins.${skinId}`, visibleRows);
  }
  return Object.freeze(skins);
}

function parseLoading(value: unknown): GameStaticYamlLoadingConfig {
  const record = assertRecord(value, "loading");
  assertKeys(record, "loading", ["resources"]);
  if (!Array.isArray(record.resources) || record.resources.length === 0) {
    throw new Error("loading.resources 必须是非空数组。");
  }
  const resources = Object.freeze(
    record.resources.map((resource, index) =>
      parseLoadingResource(resource, `loading.resources[${index}]`),
    ),
  );
  assertUnique(
    resources.map((resource) => resource.id),
    "loading.resources.id",
  );
  return Object.freeze({ resources });
}

function parseLoadingResource(
  value: unknown,
  label: string,
): GameStaticYamlLoadingResource {
  const record = assertRecord(value, label);
  assertOnlyKnownKeys(record, label, ["id", "path", "glob", "kind", "weight"]);
  const hasPath = Object.prototype.hasOwnProperty.call(record, "path");
  const hasGlob = Object.prototype.hasOwnProperty.call(record, "glob");
  if (hasPath === hasGlob) {
    throw new Error(`${label} 必须且只能提供 path 或 glob。`);
  }
  const base = {
    id: assertNonEmptyString(record.id, `${label}.id`),
    ...(record.kind !== undefined
      ? { kind: assertLoadingKind(record.kind, `${label}.kind`) }
      : {}),
    ...(record.weight !== undefined
      ? { weight: assertPositiveNumber(record.weight, `${label}.weight`) }
      : {}),
  };
  if (hasPath) {
    return Object.freeze({
      ...base,
      path: assertPath(record.path, `${label}.path`),
    });
  }
  return Object.freeze({
    ...base,
    glob: assertPath(record.glob, `${label}.glob`),
  });
}

function parseSkin(
  value: unknown,
  label: string,
  visibleRows: number,
): GameStaticYamlSkinConfig {
  const record = assertRecord(value, label);
  assertKeys(
    record,
    label,
    ["label", "symbols", "art", "featureBars", "winAmount", "appExtensions"],
    {
      optional: ["featureBars", "winAmount", "appExtensions"],
    },
  );
  return Object.freeze({
    label: assertNonEmptyString(record.label, `${label}.label`),
    symbols: parseSymbols(record.symbols, `${label}.symbols`),
    art: parseArt(record.art, `${label}.art`, visibleRows),
    ...(record.featureBars !== undefined
      ? {
          featureBars: parseFeatureBars(
            record.featureBars,
            `${label}.featureBars`,
          ),
        }
      : {}),
    ...(record.winAmount !== undefined
      ? { winAmount: parseWinAmount(record.winAmount, `${label}.winAmount`) }
      : {}),
    ...(record.appExtensions !== undefined
      ? {
          appExtensions: Object.freeze({
            ...assertRecord(record.appExtensions, `${label}.appExtensions`),
          }),
        }
      : {}),
  });
}

function parseSymbols(
  value: unknown,
  label: string,
): GameStaticYamlSymbolsConfig {
  const record = assertRecord(value, label);
  assertKeys(
    record,
    label,
    [
      "manifest",
      "pngGlob",
      "vniProjectGlob",
      "vniAssetGlob",
      "emptySymbols",
      "requireExplicitScale",
      "requiredStates",
    ],
    {
      optional: ["vniProjectGlob", "vniAssetGlob"],
    },
  );
  if (typeof record.requireExplicitScale !== "boolean") {
    throw new Error(`${label}.requireExplicitScale 必须是 boolean。`);
  }
  const requiredStates = assertStringArray(
    record.requiredStates,
    `${label}.requiredStates`,
    {
      nonEmpty: true,
    },
  );
  assertUnique(requiredStates, `${label}.requiredStates`);
  return Object.freeze({
    manifest: assertPath(record.manifest, `${label}.manifest`),
    pngGlob: assertPath(record.pngGlob, `${label}.pngGlob`),
    ...(record.vniProjectGlob !== undefined
      ? {
          vniProjectGlob: assertPath(
            record.vniProjectGlob,
            `${label}.vniProjectGlob`,
          ),
        }
      : {}),
    ...(record.vniAssetGlob !== undefined
      ? {
          vniAssetGlob: assertPath(
            record.vniAssetGlob,
            `${label}.vniAssetGlob`,
          ),
        }
      : {}),
    emptySymbols: assertStringArray(
      record.emptySymbols,
      `${label}.emptySymbols`,
      {
        nonEmpty: false,
      },
    ),
    requireExplicitScale: record.requireExplicitScale,
    requiredStates,
  });
}

function parseArt(
  value: unknown,
  label: string,
  visibleRows: number,
): GameStaticYamlArtConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "mode",
    "variants",
    "mainReelBackground",
    "reelAreaInMainReelBackground",
  ]);
  if (record.mode !== "orientation-focus") {
    throw new Error(`${label}.mode 必须是 orientation-focus。`);
  }
  const variants = assertRecord(record.variants, `${label}.variants`);
  assertKeys(variants, `${label}.variants`, ["landscape", "portrait"]);
  return Object.freeze({
    mode: "orientation-focus",
    variants: Object.freeze({
      landscape: parseArtVariant(
        variants.landscape,
        `${label}.variants.landscape`,
      ),
      portrait: parseArtVariant(
        variants.portrait,
        `${label}.variants.portrait`,
      ),
    }),
    mainReelBackground: parseImage(
      record.mainReelBackground,
      `${label}.mainReelBackground`,
    ),
    reelAreaInMainReelBackground: parseReelArea(
      record.reelAreaInMainReelBackground,
      `${label}.reelAreaInMainReelBackground`,
      visibleRows,
    ),
  });
}

function parseFeatureBars(
  value: unknown,
  label: string,
): Readonly<Record<string, GameStaticYamlFeatureBarConfig>> {
  const record = assertRecord(value, label);
  const featureBars: Record<string, GameStaticYamlFeatureBarConfig> = {};
  for (const [featureBarId, featureBarValue] of Object.entries(record)) {
    if (featureBarId.trim().length === 0) {
      throw new Error(`${label} 不能包含空 feature bar id。`);
    }
    featureBars[featureBarId] = parseFeatureBar(
      featureBarValue,
      `${label}.${featureBarId}`,
    );
  }
  if (Object.keys(featureBars).length === 0) {
    throw new Error(`${label} 不能为空。`);
  }
  return Object.freeze(featureBars);
}

function parseFeatureBar(
  value: unknown,
  label: string,
): GameStaticYamlFeatureBarConfig {
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
  const queueLength = assertPositiveInteger(
    record.queueLength,
    `${label}.queueLength`,
  );
  const visibleCount = assertPositiveInteger(
    record.visibleCount,
    `${label}.visibleCount`,
  );
  if (visibleCount >= queueLength) {
    throw new Error(`${label}.visibleCount 必须小于 queueLength。`);
  }
  const terminalSlotIndex = assertNonNegativeInteger(
    record.terminalSlotIndex,
    `${label}.terminalSlotIndex`,
  );
  if (terminalSlotIndex >= queueLength) {
    throw new Error(`${label}.terminalSlotIndex 必须小于 queueLength。`);
  }
  const allowedFeatures = assertStringArray(
    record.allowedFeatures,
    `${label}.allowedFeatures`,
    { nonEmpty: true },
  );
  assertUnique(allowedFeatures, `${label}.allowedFeatures`);
  const emptyFeature = assertNonEmptyString(
    record.emptyFeature,
    `${label}.emptyFeature`,
  );
  if (!allowedFeatures.includes(emptyFeature)) {
    throw new Error(`${label}.emptyFeature 必须出现在 allowedFeatures 中。`);
  }
  return Object.freeze({
    componentName: assertNonEmptyString(
      record.componentName,
      `${label}.componentName`,
    ),
    queueLength,
    visibleCount,
    terminalSlotIndex,
    emptyFeature,
    allowedFeatures,
    symbols: parseFeatureBarSymbols(record.symbols, `${label}.symbols`),
    layout: parseFeatureBarLayout(
      record.layout,
      `${label}.layout`,
      queueLength,
    ),
  });
}

function parseFeatureBarSymbols(
  value: unknown,
  label: string,
): GameStaticYamlFeatureBarSymbolsConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "manifest",
    "pngGlob",
    "requireExplicitScale",
    "requiredStates",
  ]);
  if (typeof record.requireExplicitScale !== "boolean") {
    throw new Error(`${label}.requireExplicitScale 必须是 boolean。`);
  }
  const requiredStates = assertStringArray(
    record.requiredStates,
    `${label}.requiredStates`,
    { nonEmpty: false },
  );
  assertUnique(requiredStates, `${label}.requiredStates`);
  return Object.freeze({
    manifest: assertPath(record.manifest, `${label}.manifest`),
    pngGlob: assertPath(record.pngGlob, `${label}.pngGlob`),
    requireExplicitScale: record.requireExplicitScale,
    requiredStates,
  });
}

function parseFeatureBarLayout(
  value: unknown,
  label: string,
  queueLength: number,
): Readonly<
  Record<"landscape" | "portrait", GameStaticYamlFeatureBarLayoutVariant>
> {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["landscape", "portrait"]);
  return Object.freeze({
    landscape: parseFeatureBarLayoutVariant(
      record.landscape,
      `${label}.landscape`,
      queueLength,
    ),
    portrait: parseFeatureBarLayoutVariant(
      record.portrait,
      `${label}.portrait`,
      queueLength,
    ),
  });
}

function parseFeatureBarLayoutVariant(
  value: unknown,
  label: string,
  queueLength: number,
): GameStaticYamlFeatureBarLayoutVariant {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["movement", "slotRectsInConveyor"]);
  if (record.movement !== "down" && record.movement !== "right") {
    throw new Error(`${label}.movement 必须是 down 或 right。`);
  }
  if (!Array.isArray(record.slotRectsInConveyor)) {
    throw new Error(`${label}.slotRectsInConveyor 必须是数组。`);
  }
  if (record.slotRectsInConveyor.length !== queueLength) {
    throw new Error(
      `${label}.slotRectsInConveyor 长度必须等于 queueLength ${queueLength}。`,
    );
  }
  return Object.freeze({
    movement: record.movement,
    slotRectsInConveyor: Object.freeze(
      record.slotRectsInConveyor.map((rect, index) =>
        parseRect(rect, `${label}.slotRectsInConveyor[${index}]`),
      ),
    ),
  });
}

function parseArtVariant(
  value: unknown,
  label: string,
): GameStaticYamlArtVariant {
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
    {
      optional: ["minFocusMargin", "conveyor"],
    },
  );
  return Object.freeze({
    background: parseImage(record.background, `${label}.background`),
    focusRect: parseRect(record.focusRect, `${label}.focusRect`),
    frameFocusRect: parseSize(record.frameFocusRect, `${label}.frameFocusRect`),
    mainReelBackgroundPositionInFocusRect: parsePoint(
      record.mainReelBackgroundPositionInFocusRect,
      `${label}.mainReelBackgroundPositionInFocusRect`,
    ),
    ...(record.minFocusMargin !== undefined
      ? {
          minFocusMargin: parseMargin(
            record.minFocusMargin,
            `${label}.minFocusMargin`,
          ),
        }
      : {}),
    ...(record.conveyor !== undefined
      ? { conveyor: parseConveyor(record.conveyor, `${label}.conveyor`) }
      : {}),
  });
}

function parseWinAmount(
  value: unknown,
  label: string,
): GameStaticYamlWinAmountConfig {
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
  return Object.freeze({
    amountScale: assertPositiveNumber(
      record.amountScale,
      `${label}.amountScale`,
    ),
    currency: assertNonEmptyString(record.currency, `${label}.currency`),
    locale: assertNonEmptyString(record.locale, `${label}.locale`),
    minorCountDurationSeconds: assertPositiveNumber(
      record.minorCountDurationSeconds,
      `${label}.minorCountDurationSeconds`,
    ),
    majorCountDurationSeconds: assertPositiveNumber(
      record.majorCountDurationSeconds,
      `${label}.majorCountDurationSeconds`,
    ),
    thresholds: parseWinAmountThresholds(
      record.thresholds,
      `${label}.thresholds`,
    ),
    text: parseWinAmountText(record.text, `${label}.text`),
    layout: parseWinAmountLayout(record.layout, `${label}.layout`),
    animations: parseWinAmountAnimations(
      record.animations,
      `${label}.animations`,
    ),
  });
}

function parseWinAmountThresholds(
  value: unknown,
  label: string,
): GameStaticYamlWinAmountThresholds {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "minorMultiplier",
    "bigMultiplier",
    "superMultiplier",
    "megaMultiplier",
  ]);
  const thresholds = Object.freeze({
    minorMultiplier: assertPositiveNumber(
      record.minorMultiplier,
      `${label}.minorMultiplier`,
    ),
    bigMultiplier: assertPositiveNumber(
      record.bigMultiplier,
      `${label}.bigMultiplier`,
    ),
    superMultiplier: assertPositiveNumber(
      record.superMultiplier,
      `${label}.superMultiplier`,
    ),
    megaMultiplier: assertPositiveNumber(
      record.megaMultiplier,
      `${label}.megaMultiplier`,
    ),
  });
  if (
    !(
      thresholds.bigMultiplier > thresholds.minorMultiplier &&
      thresholds.superMultiplier > thresholds.bigMultiplier &&
      thresholds.megaMultiplier > thresholds.superMultiplier
    )
  ) {
    throw new Error(`${label} 必须严格递增。`);
  }
  return thresholds;
}

function parseWinAmountText(
  value: unknown,
  label: string,
): GameStaticYamlWinAmountText {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "minorFontSize",
    "majorFontSize",
    "fill",
    "stroke",
    "strokeWidth",
  ]);
  return Object.freeze({
    minorFontSize: assertPositiveNumber(
      record.minorFontSize,
      `${label}.minorFontSize`,
    ),
    majorFontSize: assertPositiveNumber(
      record.majorFontSize,
      `${label}.majorFontSize`,
    ),
    fill: assertCssHexColor(record.fill, `${label}.fill`),
    stroke: assertCssHexColor(record.stroke, `${label}.stroke`),
    strokeWidth: assertNonNegativeNumber(
      record.strokeWidth,
      `${label}.strokeWidth`,
    ),
  });
}

function parseWinAmountLayout(
  value: unknown,
  label: string,
): GameStaticYamlWinAmountLayout {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "minorAnchor",
    "majorAnchor",
    "minorOffset",
    "majorOffset",
  ]);
  return Object.freeze({
    minorAnchor: assertWinAmountAnchor(
      record.minorAnchor,
      `${label}.minorAnchor`,
    ),
    majorAnchor: assertWinAmountAnchor(
      record.majorAnchor,
      `${label}.majorAnchor`,
    ),
    minorOffset: parsePoint(record.minorOffset, `${label}.minorOffset`),
    majorOffset: parsePoint(record.majorOffset, `${label}.majorOffset`),
  });
}

function parseWinAmountAnimations(
  value: unknown,
  label: string,
): GameStaticYamlWinAmountAnimations {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["projectGlob", "assetGlob", "tiers"]);
  if (!Array.isArray(record.tiers) || record.tiers.length === 0) {
    throw new Error(`${label}.tiers 必须是非空数组。`);
  }
  const tiers = Object.freeze(
    record.tiers.map((tier, index) =>
      parseWinAmountTier(tier, `${label}.tiers[${index}]`),
    ),
  );
  assertUnique(
    tiers.map((tier) => tier.id),
    `${label}.tiers.id`,
  );
  for (let index = 1; index < tiers.length; index += 1) {
    if (
      tiers[index].thresholdMultiplier <= tiers[index - 1].thresholdMultiplier
    ) {
      throw new Error(`${label}.tiers thresholdMultiplier 必须严格递增。`);
    }
  }
  return Object.freeze({
    projectGlob: assertPath(record.projectGlob, `${label}.projectGlob`),
    assetGlob: assertPath(record.assetGlob, `${label}.assetGlob`),
    tiers,
  });
}

function parseWinAmountTier(
  value: unknown,
  label: string,
): GameStaticYamlWinAmountTier {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "id",
    "thresholdMultiplier",
    "project",
    "durationSeconds",
    "loopStartTime",
    "loopEndTime",
    "keepParticlesAlive",
  ]);
  const durationSeconds = assertPositiveNumber(
    record.durationSeconds,
    `${label}.durationSeconds`,
  );
  if (durationSeconds < MIN_WIN_AMOUNT_TIER_DURATION_SECONDS) {
    throw new Error(
      `${label}.durationSeconds 必须至少为 ${MIN_WIN_AMOUNT_TIER_DURATION_SECONDS} 秒。`,
    );
  }
  const loopStartTime = assertNonNegativeNumber(
    record.loopStartTime,
    `${label}.loopStartTime`,
  );
  const loopEndTime = assertNonNegativeNumber(
    record.loopEndTime,
    `${label}.loopEndTime`,
  );
  if (!(loopStartTime <= loopEndTime && loopEndTime <= durationSeconds)) {
    throw new Error(
      `${label} 必须满足 loopStartTime <= loopEndTime <= durationSeconds。`,
    );
  }
  if (typeof record.keepParticlesAlive !== "boolean") {
    throw new Error(`${label}.keepParticlesAlive 必须是 boolean。`);
  }
  return Object.freeze({
    id: assertNonEmptyString(record.id, `${label}.id`),
    thresholdMultiplier: assertPositiveNumber(
      record.thresholdMultiplier,
      `${label}.thresholdMultiplier`,
    ),
    project: assertTierProject(record.project, `${label}.project`),
    durationSeconds,
    loopStartTime,
    loopEndTime,
    keepParticlesAlive: record.keepParticlesAlive,
  });
}

function parseImage(value: unknown, label: string): GameStaticYamlImage {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["path", "width", "height"]);
  return Object.freeze({
    path: assertPath(record.path, `${label}.path`),
    ...parseSize(record, label),
  });
}

function parseConveyor(value: unknown, label: string): GameStaticYamlConveyor {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["path", "width", "height", "positionInFocusRect"]);
  return Object.freeze({
    path: assertPath(record.path, `${label}.path`),
    ...parseSize(record, label),
    positionInFocusRect: parsePoint(
      record.positionInFocusRect,
      `${label}.positionInFocusRect`,
    ),
  });
}

function parseReelArea(
  value: unknown,
  label: string,
  visibleRows: number,
): GameStaticYamlReelArea {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "x",
    "y",
    "reelCount",
    "reelGap",
    "cellWidth",
    "cellHeight",
  ]);
  const reelCount = assertPositiveInteger(
    record.reelCount,
    `${label}.reelCount`,
  );
  const reelGap = assertNonNegativeNumber(record.reelGap, `${label}.reelGap`);
  const cellWidth = assertPositiveNumber(
    record.cellWidth,
    `${label}.cellWidth`,
  );
  const cellHeight = assertPositiveNumber(
    record.cellHeight,
    `${label}.cellHeight`,
  );
  return Object.freeze({
    x: assertNonNegativeNumber(record.x, `${label}.x`),
    y: assertNonNegativeNumber(record.y, `${label}.y`),
    width: reelCount * cellWidth + (reelCount - 1) * reelGap,
    height: visibleRows * cellHeight,
    reelCount,
    reelGap,
    cellWidth,
    cellHeight,
  });
}

function parsePoint(value: unknown, label: string): GameStaticYamlPoint {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["x", "y"]);
  return Object.freeze({
    x: assertFiniteNumber(record.x, `${label}.x`),
    y: assertFiniteNumber(record.y, `${label}.y`),
  });
}

function parseRect(value: unknown, label: string): GameStaticYamlRect {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["x", "y", "width", "height"]);
  return Object.freeze({
    x: assertNonNegativeNumber(record.x, `${label}.x`),
    y: assertNonNegativeNumber(record.y, `${label}.y`),
    ...parseSize(record, label),
  });
}

function parseSize(value: unknown, label: string): GameStaticYamlSize {
  const record = assertRecord(value, label);
  return Object.freeze({
    width: assertPositiveNumber(record.width, `${label}.width`),
    height: assertPositiveNumber(record.height, `${label}.height`),
  });
}

function parseMargin(value: unknown, label: string): GameStaticYamlMargin {
  const record = assertRecord(value, label);
  assertOnlyKnownKeys(record, label, ["left", "right", "top", "bottom"]);
  return Object.freeze({
    ...(record.left !== undefined
      ? { left: assertNonNegativeNumber(record.left, `${label}.left`) }
      : {}),
    ...(record.right !== undefined
      ? { right: assertNonNegativeNumber(record.right, `${label}.right`) }
      : {}),
    ...(record.top !== undefined
      ? { top: assertNonNegativeNumber(record.top, `${label}.top`) }
      : {}),
    ...(record.bottom !== undefined
      ? { bottom: assertNonNegativeNumber(record.bottom, `${label}.bottom`) }
      : {}),
  });
}

function assertOnlyKnownKeys(
  record: Record<string, unknown>,
  label: string,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new Error(`${label} 包含未知字段 "${key}"。`);
    }
  }
}

function validateSkins(config: GameStaticYamlConfig, rootDir: string): void {
  const skinIds = new Set(config.supportedSkins);
  for (const skinId of config.supportedSkins) {
    if (!config.skins[skinId]) {
      throw new Error(`skins 缺少 supportedSkins 中声明的 "${skinId}"。`);
    }
  }
  for (const [skinId, skin] of Object.entries(config.skins)) {
    if (!skinIds.has(skinId)) {
      throw new Error(`skins.${skinId} 未在 supportedSkins 中声明。`);
    }
    assertExistingFile(rootDir, skin.symbols.manifest);
    assertExtension(
      skin.symbols.manifest,
      [".json"],
      `skins.${skinId}.symbols.manifest`,
    );
    assertExtension(
      skin.symbols.pngGlob,
      ["*.png"],
      `skins.${skinId}.symbols.pngGlob`,
    );
    assertExistingDirectory(rootDir, getGlobDirectory(skin.symbols.pngGlob));
    if (skin.symbols.vniProjectGlob !== undefined) {
      validateVniProjectGlob(rootDir, skin.symbols.vniProjectGlob, skinId);
    }
    if (skin.symbols.vniAssetGlob !== undefined) {
      validateVniAssetGlob(rootDir, skin.symbols.vniAssetGlob, skinId);
    }
    if (skin.winAmount !== undefined) {
      validateWinAmount(rootDir, skinId, skin.winAmount);
    }
    if (skin.featureBars !== undefined) {
      validateFeatureBars(rootDir, skinId, skin);
    }
    validateArtPaths(rootDir, skinId, skin);
    validateRectFits(
      skin.art.reelAreaInMainReelBackground,
      skin.art.mainReelBackground,
      `skins.${skinId}.art.reelAreaInMainReelBackground`,
      `skins.${skinId}.art.mainReelBackground`,
    );
    validateReelArea(config, skinId, skin);
  }
}

function validateFeatureBars(
  rootDir: string,
  skinId: string,
  skin: GameStaticYamlSkinConfig,
): void {
  for (const [featureBarId, featureBar] of Object.entries(
    skin.featureBars ?? {},
  )) {
    assertExistingFile(rootDir, featureBar.symbols.manifest);
    assertExtension(
      featureBar.symbols.manifest,
      [".json"],
      `skins.${skinId}.featureBars.${featureBarId}.symbols.manifest`,
    );
    assertExtension(
      featureBar.symbols.pngGlob,
      [".png"],
      `skins.${skinId}.featureBars.${featureBarId}.symbols.pngGlob`,
    );
    assertExistingDirectory(
      rootDir,
      getStrictGlobDirectory(featureBar.symbols.pngGlob),
    );
    validateFeatureBarLayoutFitsConveyors(
      skinId,
      featureBarId,
      skin,
      featureBar,
    );
  }
}

function validateFeatureBarLayoutFitsConveyors(
  skinId: string,
  featureBarId: string,
  skin: GameStaticYamlSkinConfig,
  featureBar: GameStaticYamlFeatureBarConfig,
): void {
  for (const variantId of ["landscape", "portrait"] as const) {
    const conveyor = skin.art.variants[variantId].conveyor;
    if (!conveyor) {
      throw new Error(
        `skins.${skinId}.featureBars.${featureBarId}.layout.${variantId} 需要 art.variants.${variantId}.conveyor。`,
      );
    }
    for (const [index, rect] of featureBar.layout[
      variantId
    ].slotRectsInConveyor.entries()) {
      validateRectFits(
        rect,
        conveyor,
        `skins.${skinId}.featureBars.${featureBarId}.layout.${variantId}.slotRectsInConveyor[${index}]`,
        `skins.${skinId}.art.variants.${variantId}.conveyor`,
      );
    }
  }
}

function validateVniProjectGlob(
  rootDir: string,
  glob: string,
  skinId: string,
): void {
  if (glob.includes("**")) {
    throw new Error(
      `skins.${skinId}.symbols.vniProjectGlob 不能使用递归 glob：${glob}`,
    );
  }
  const directory = getStrictGlobDirectory(glob);
  assertSpecificGlobDirectory(
    directory,
    `skins.${skinId}.symbols.vniProjectGlob`,
  );
  assertExistingDirectory(rootDir, directory);
  if (!/\/\*[-A-Za-z0-9_]*\.json$/u.test(glob)) {
    throw new Error(
      `skins.${skinId}.symbols.vniProjectGlob 必须是当前资源目录下的 JSON glob，例如 assets/game003-s1/*-wins.json。`,
    );
  }
}

function validateVniAssetGlob(
  rootDir: string,
  glob: string,
  skinId: string,
): void {
  if (glob.includes("**")) {
    throw new Error(
      `skins.${skinId}.symbols.vniAssetGlob 不能使用递归 glob：${glob}`,
    );
  }
  const directory = getStrictGlobDirectory(glob);
  assertSpecificGlobDirectory(
    directory,
    `skins.${skinId}.symbols.vniAssetGlob`,
  );
  assertExistingDirectory(rootDir, directory);
  if (
    !(
      /\/\*\.(png|jpg|jpeg|webp)$/iu.test(glob) ||
      /\/\*\.\{png,jpg,jpeg,webp\}$/iu.test(glob)
    )
  ) {
    throw new Error(
      `skins.${skinId}.symbols.vniAssetGlob 只能匹配 png/jpg/jpeg/webp 图片资源。`,
    );
  }
}

function validateWinAmount(
  rootDir: string,
  skinId: string,
  winAmount: GameStaticYamlWinAmountConfig,
): void {
  validateWinAmountProjectGlob(
    rootDir,
    winAmount.animations.projectGlob,
    skinId,
  );
  validateWinAmountAssetGlob(rootDir, winAmount.animations.assetGlob, skinId);
  const projectDirectory = getStrictGlobDirectory(
    winAmount.animations.projectGlob,
  );
  for (const tier of winAmount.animations.tiers) {
    const projectPath = join(projectDirectory, tier.project.slice(2));
    assertExistingFile(rootDir, projectPath);
    assertExtension(
      projectPath,
      [".json"],
      `skins.${skinId}.winAmount.animations.tiers.${tier.id}.project`,
    );
    const duration = readProjectStageDuration(
      rootDir,
      projectPath,
      `skins.${skinId}.winAmount.animations.tiers.${tier.id}.project`,
    );
    if (tier.durationSeconds > duration) {
      throw new Error(
        `skins.${skinId}.winAmount.animations.tiers.${tier.id}.durationSeconds 不能大于 project.stage.duration ${duration}。`,
      );
    }
  }
}

function validateWinAmountProjectGlob(
  rootDir: string,
  glob: string,
  skinId: string,
): void {
  if (glob.includes("**")) {
    throw new Error(
      `skins.${skinId}.winAmount.animations.projectGlob 不能使用递归 glob：${glob}`,
    );
  }
  const directory = getStrictGlobDirectory(glob);
  assertSpecificGlobDirectory(
    directory,
    `skins.${skinId}.winAmount.animations.projectGlob`,
  );
  assertExistingDirectory(rootDir, directory);
  if (!/(\/\*[-A-Za-z0-9_]*\.json|\/\{[-A-Za-z0-9_,]+\}\.json)$/u.test(glob)) {
    throw new Error(
      `skins.${skinId}.winAmount.animations.projectGlob 必须是当前资源目录下的 JSON glob。`,
    );
  }
}

function validateWinAmountAssetGlob(
  rootDir: string,
  glob: string,
  skinId: string,
): void {
  if (glob.includes("**")) {
    throw new Error(
      `skins.${skinId}.winAmount.animations.assetGlob 不能使用递归 glob：${glob}`,
    );
  }
  const directory = getStrictGlobDirectory(glob);
  assertSpecificGlobDirectory(
    directory,
    `skins.${skinId}.winAmount.animations.assetGlob`,
  );
  assertExistingDirectory(rootDir, directory);
  if (
    !(
      /\/\*\.(png|jpg|jpeg|webp)$/iu.test(glob) ||
      /\/\*\.\{png,jpg,jpeg,webp\}$/iu.test(glob)
    )
  ) {
    throw new Error(
      `skins.${skinId}.winAmount.animations.assetGlob 只能匹配 png/jpg/jpeg/webp 图片资源。`,
    );
  }
}

function readProjectStageDuration(
  rootDir: string,
  projectPath: string,
  label: string,
): number {
  const raw = JSON.parse(readFileSync(join(rootDir, projectPath), "utf8")) as {
    readonly stage?: { readonly duration?: unknown };
  };
  return assertPositiveNumber(raw.stage?.duration, `${label}.stage.duration`);
}

function assertSpecificGlobDirectory(directory: string, label: string): void {
  if (!directory.includes("/")) {
    throw new Error(`${label} 不能宽泛到仓库根级目录：${directory}`);
  }
}

function validateLoading(
  loading: GameStaticYamlLoadingConfig,
  rootDir: string,
): void {
  for (const resource of loading.resources) {
    if ("path" in resource) {
      assertExistingFile(rootDir, resource.path);
      continue;
    }
    assertExistingDirectory(rootDir, getLoadingGlobDirectory(resource.glob));
    if (/\/\*\.png$/i.test(resource.glob)) {
      throw new Error(
        `loading resource "${resource.id}" 不能使用宽泛 *.png glob，必须使用显式 brace glob 或精确资源组。`,
      );
    }
  }
}

function getLoadingGlobDirectory(glob: string): string {
  return getStrictGlobDirectory(glob);
}

function getStrictGlobDirectory(glob: string): string {
  const firstGlobIndex = glob.search(/[*{[]/);
  if (firstGlobIndex === -1) {
    throw new Error(`glob 必须包含 glob 表达式：${glob}`);
  }
  const prefix = glob.slice(0, firstGlobIndex);
  const slashIndex = prefix.lastIndexOf("/");
  if (slashIndex <= 0) {
    throw new Error(`glob 必须包含可验证目录：${glob}`);
  }
  return prefix.slice(0, slashIndex);
}

function validateArtPaths(
  rootDir: string,
  skinId: string,
  skin: GameStaticYamlSkinConfig,
): void {
  for (const [variantId, variant] of Object.entries(skin.art.variants)) {
    assertExistingFile(rootDir, variant.background.path);
    assertExtension(
      variant.background.path,
      [".jpg", ".jpeg", ".png"],
      `skins.${skinId}.art.variants.${variantId}.background.path`,
    );
    validateRectFits(
      variant.focusRect,
      variant.background,
      `skins.${skinId}.art.variants.${variantId}.focusRect`,
      `skins.${skinId}.art.variants.${variantId}.background`,
    );
    validatePositionedSizeFits(
      variant.mainReelBackgroundPositionInFocusRect,
      skin.art.mainReelBackground,
      variant.focusRect,
      variant.background,
      `skins.${skinId}.art.variants.${variantId}.mainReelBackgroundPositionInFocusRect`,
      `skins.${skinId}.art.mainReelBackground`,
      `skins.${skinId}.art.variants.${variantId}.focusRect`,
      `skins.${skinId}.art.variants.${variantId}.background`,
    );
    if (variant.conveyor) {
      assertExistingFile(rootDir, variant.conveyor.path);
      assertExtension(
        variant.conveyor.path,
        [".png"],
        `skins.${skinId}.art.variants.${variantId}.conveyor.path`,
      );
      validatePositionedSizeFits(
        variant.conveyor.positionInFocusRect,
        variant.conveyor,
        variant.focusRect,
        variant.background,
        `skins.${skinId}.art.variants.${variantId}.conveyor.positionInFocusRect`,
        `skins.${skinId}.art.variants.${variantId}.conveyor`,
        `skins.${skinId}.art.variants.${variantId}.focusRect`,
        `skins.${skinId}.art.variants.${variantId}.background`,
      );
    }
  }
  assertExistingFile(rootDir, skin.art.mainReelBackground.path);
  assertExtension(
    skin.art.mainReelBackground.path,
    [".png"],
    `skins.${skinId}.art.mainReelBackground.path`,
  );
}

function validateReelArea(
  config: GameStaticYamlConfig,
  skinId: string,
  skin: GameStaticYamlSkinConfig,
): void {
  const reelArea = skin.art.reelAreaInMainReelBackground;
  if (reelArea.reelCount !== config.reel.reelCount) {
    throw new Error(
      `skins.${skinId}.art.reelAreaInMainReelBackground.reelCount 必须等于 reel.reelCount。`,
    );
  }
  const expectedWidth =
    reelArea.reelCount * reelArea.cellWidth +
    (reelArea.reelCount - 1) * reelArea.reelGap;
  if (!nearlyEqual(reelArea.width, expectedWidth)) {
    throw new Error(
      `skins.${skinId}.art.reelAreaInMainReelBackground.width 必须等于 reelCount * cellWidth + 所有轴间距之和。`,
    );
  }
  const expectedHeight = config.reel.visibleRows * reelArea.cellHeight;
  if (!nearlyEqual(reelArea.height, expectedHeight)) {
    throw new Error(
      `skins.${skinId}.art.reelAreaInMainReelBackground.height 必须等于 visibleRows * cellHeight。`,
    );
  }
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.000001;
}

function validateRectFits(
  rect: GameStaticYamlRect,
  size: GameStaticYamlSize,
  rectLabel: string,
  sizeLabel: string,
): void {
  if (rect.x + rect.width > size.width || rect.y + rect.height > size.height) {
    throw new Error(`${rectLabel} 必须位于 ${sizeLabel} 范围内。`);
  }
}

function validatePositionedSizeFits(
  positionInFocusRect: GameStaticYamlPoint,
  size: GameStaticYamlSize,
  focusRect: GameStaticYamlRect,
  background: GameStaticYamlSize,
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
      `${positionLabel} + ${sizeLabel} 必须经 ${focusRectLabel} 映射后位于 ${backgroundLabel} 范围内。`,
    );
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象。`);
  }
  return value as Record<string, unknown>;
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
      throw new Error(`${label} 包含未知字段 "${key}"。`);
    }
  }
  for (const key of allowed) {
    if (
      !Object.prototype.hasOwnProperty.call(record, key) &&
      !optionalSet.has(key)
    ) {
      throw new Error(`${label}.${key} 是必填字段。`);
    }
  }
}

function assertPath(value: unknown, label: string): string {
  const path = assertNonEmptyString(value, label);
  assertRepoRelativePath(path, label);
  return path;
}

function assertTierProject(value: unknown, label: string): string {
  const project = assertNonEmptyString(value, label);
  if (
    !/^\.\/[-A-Za-z0-9_]+\.json$/u.test(project) ||
    project.includes("..") ||
    project.includes("\\")
  ) {
    throw new Error(`${label} 必须是 ./filename.json 形式。`);
  }
  return project;
}

function assertWinAmountAnchor(
  value: unknown,
  label: string,
): "reel-area-bottom-center" | "reel-area-center" {
  if (value === "reel-area-bottom-center" || value === "reel-area-center") {
    return value;
  }
  throw new Error(
    `${label} 必须是 reel-area-bottom-center 或 reel-area-center。`,
  );
}

function assertCssHexColor(value: unknown, label: string): string {
  const color = assertNonEmptyString(value, label);
  if (!/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/u.test(color)) {
    throw new Error(`${label} 必须是 #RRGGBB 或 #RRGGBBAA 颜色。`);
  }
  return color;
}

function assertStringArray(
  value: unknown,
  label: string,
  options: { readonly nonEmpty: boolean },
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} 必须是数组。`);
  }
  if (options.nonEmpty && value.length === 0) {
    throw new Error(`${label} 不能为空。`);
  }
  return Object.freeze(
    value.map((item, index) =>
      assertNonEmptyString(item, `${label}[${index}]`),
    ),
  );
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} 包含重复值 "${value}"。`);
    }
    seen.add(value);
  }
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} 必须是非空字符串。`);
  }
  return value;
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} 必须是正整数。`);
  }
  return value as number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} 必须是非负整数。`);
  }
  return value as number;
}

function assertPositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 必须是有限正数。`);
  }
  return value;
}

function assertLoadingKind(value: unknown, label: string): string {
  const kind = assertNonEmptyString(value, label);
  if (
    !["image", "json", "text", "binary", "wasm", "module", "style"].includes(
      kind,
    )
  ) {
    throw new Error(`${label} 必须是有效 loading 资源类型。`);
  }
  return kind;
}

function assertNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} 必须是有限非负数。`);
  }
  return value;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数值。`);
  }
  return value;
}

function assertWebSocketUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol === "ws:" || url.protocol === "wss:") {
      return;
    }
  } catch {
    // handled below
  }
  throw new Error("live.serverUrl 必须是 ws:// 或 wss://。");
}
