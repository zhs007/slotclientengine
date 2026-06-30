import { readFileSync } from "node:fs";
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
  GameStaticYamlImage,
  GameStaticYamlLoadingConfig,
  GameStaticYamlLoadingResource,
  GameStaticYamlLiveConfig,
  GameStaticYamlMargin,
  GameStaticYamlReelConfig,
  GameStaticYamlRect,
  GameStaticYamlSize,
  GameStaticYamlSkinConfig,
  GameStaticYamlSymbolsConfig,
} from "./types.js";

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
  const config: GameStaticYamlConfig = Object.freeze({
    schemaVersion: 1,
    gameId: assertNonEmptyString(record.gameId, "gameId"),
    brandLabel: assertNonEmptyString(record.brandLabel, "brandLabel"),
    live: parseLive(record.live),
    supportedSkins: assertStringArray(record.supportedSkins, "supportedSkins", {
      nonEmpty: true,
    }),
    gameConfig: assertPath(record.gameConfig, "gameConfig"),
    reel: parseReel(record.reel),
    skins: parseSkins(record.skins),
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
): Readonly<Record<string, GameStaticYamlSkinConfig>> {
  const record = assertRecord(value, "skins");
  const skins: Record<string, GameStaticYamlSkinConfig> = {};
  for (const [skinId, skinValue] of Object.entries(record)) {
    if (skinId.trim().length === 0) {
      throw new Error("skins 不能包含空 skin id。");
    }
    skins[skinId] = parseSkin(skinValue, `skins.${skinId}`);
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

function parseSkin(value: unknown, label: string): GameStaticYamlSkinConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, ["label", "symbols", "art"]);
  return Object.freeze({
    label: assertNonEmptyString(record.label, `${label}.label`),
    symbols: parseSymbols(record.symbols, `${label}.symbols`),
    art: parseArt(record.art, `${label}.art`),
  });
}

function parseSymbols(
  value: unknown,
  label: string,
): GameStaticYamlSymbolsConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "manifest",
    "pngGlob",
    "emptySymbols",
    "requireExplicitScale",
    "requiredStates",
  ]);
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

function parseArt(value: unknown, label: string): GameStaticYamlArtConfig {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "mode",
    "scenePartGap",
    "variants",
    "mainReelBackground",
    "reelWindowInMainReelBackground",
  ]);
  if (record.mode !== "orientation-focus") {
    throw new Error(`${label}.mode 必须是 orientation-focus。`);
  }
  const variants = assertRecord(record.variants, `${label}.variants`);
  assertKeys(variants, `${label}.variants`, ["landscape", "portrait"]);
  return Object.freeze({
    mode: "orientation-focus",
    scenePartGap: assertNonNegativeNumber(
      record.scenePartGap,
      `${label}.scenePartGap`,
    ),
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
    reelWindowInMainReelBackground: parseRect(
      record.reelWindowInMainReelBackground,
      `${label}.reelWindowInMainReelBackground`,
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
    ["background", "focusRect", "frameFocusRect", "minFocusMargin", "conveyor"],
    {
      optional: ["minFocusMargin"],
    },
  );
  return Object.freeze({
    background: parseImage(record.background, `${label}.background`),
    focusRect: parseRect(record.focusRect, `${label}.focusRect`),
    frameFocusRect: parseSize(record.frameFocusRect, `${label}.frameFocusRect`),
    ...(record.minFocusMargin !== undefined
      ? {
          minFocusMargin: parseMargin(
            record.minFocusMargin,
            `${label}.minFocusMargin`,
          ),
        }
      : {}),
    conveyor: parseConveyor(record.conveyor, `${label}.conveyor`),
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
  assertKeys(record, label, ["path", "width", "height", "placement"]);
  return Object.freeze({
    path: assertPath(record.path, `${label}.path`),
    ...parseSize(record, label),
    placement: assertNonEmptyString(record.placement, `${label}.placement`),
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
    validateArtPaths(rootDir, skinId, skin);
    validateRectFits(
      skin.art.reelWindowInMainReelBackground,
      skin.art.mainReelBackground,
      `skins.${skinId}.art.reelWindowInMainReelBackground`,
      `skins.${skinId}.art.mainReelBackground`,
    );
    validateReelWindow(config, skinId, skin);
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
  const firstGlobIndex = glob.search(/[*{[]/);
  if (firstGlobIndex === -1) {
    throw new Error(`loading glob 必须包含 glob 表达式：${glob}`);
  }
  const prefix = glob.slice(0, firstGlobIndex);
  const slashIndex = prefix.lastIndexOf("/");
  if (slashIndex <= 0) {
    throw new Error(`loading glob 必须包含可验证目录：${glob}`);
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
    assertExistingFile(rootDir, variant.conveyor.path);
    assertExtension(
      variant.conveyor.path,
      [".png"],
      `skins.${skinId}.art.variants.${variantId}.conveyor.path`,
    );
    validateRectFits(
      variant.focusRect,
      variant.background,
      `skins.${skinId}.art.variants.${variantId}.focusRect`,
      `skins.${skinId}.art.variants.${variantId}.background`,
    );
  }
  assertExistingFile(rootDir, skin.art.mainReelBackground.path);
  assertExtension(
    skin.art.mainReelBackground.path,
    [".png"],
    `skins.${skinId}.art.mainReelBackground.path`,
  );
}

function validateReelWindow(
  config: GameStaticYamlConfig,
  skinId: string,
  skin: GameStaticYamlSkinConfig,
): void {
  const reelWindow = skin.art.reelWindowInMainReelBackground;
  if (reelWindow.width % config.reel.reelCount !== 0) {
    throw new Error(
      `skins.${skinId}.art.reelWindowInMainReelBackground.width 必须整除 reelCount。`,
    );
  }
  if (reelWindow.height % config.reel.visibleRows !== 0) {
    throw new Error(
      `skins.${skinId}.art.reelWindowInMainReelBackground.height 必须整除 visibleRows。`,
    );
  }
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
