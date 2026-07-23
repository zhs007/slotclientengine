import type { SlotRoundFlowProfileV1 } from "@slotclientengine/logiccore";
import {
  parseSymbolPackageManifest,
  parseSymbolStateTextureManifest,
  type SymbolPackageResource,
} from "../symbol/index.js";
import { SceneLayoutError } from "./errors.js";
import type {
  SceneLayoutManifestV1,
  SceneLayoutPackageResource,
  SceneLayoutSymbolPackageBinding,
} from "./types.js";

export interface StandardReelPresentationProfileV1 {
  readonly kind: "standard";
  readonly version: 1;
  readonly direction: "forward" | "backward";
  readonly speedSymbolsPerSecond: number;
  readonly minimumSpinCycles: number;
  readonly baseDurationMs: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
  readonly bounceStrength: number;
}

export interface GridCellReelPresentationProfileV1 {
  readonly kind: "grid-cell";
  readonly version: 1;
  readonly direction: "forward" | "backward";
  readonly order: "top-down-left-right";
  readonly timing: {
    readonly startStepMs: number;
    readonly stopStepMs: number;
    readonly settleAfterLastStartMs: number;
    readonly minimumSpinCycles: number;
    readonly speedSymbolsPerSecond: number;
  };
  readonly bounceStrength: number;
}

export type SlotReelPresentationProfileV1 =
  | StandardReelPresentationProfileV1
  | GridCellReelPresentationProfileV1;

export interface SlotFlowPresentationProfileV1 {
  readonly version: 1;
  readonly symbolStates: {
    readonly normal: string;
    readonly win: string;
    readonly remove: string;
  };
  readonly dimmingAlpha: number;
  readonly popup: {
    readonly enabled: boolean;
  };
  readonly cascade: {
    readonly emphasisFadeInMs: number;
    readonly emphasisHoldMs: number;
    readonly emphasisFadeOutMs: number;
    readonly baseFallSeconds: number;
    readonly perRowFallSeconds: number;
    readonly maxFallSeconds: number;
    readonly settleSeconds: number;
  };
}

export interface SlotFlowPresentationProfileV2 {
  readonly version: 2;
  readonly symbolStates: SlotFlowPresentationProfileV1["symbolStates"];
  readonly dimmingAlpha: number;
  readonly popup: SlotFlowPresentationProfileV1["popup"];
  readonly cascade: SlotFlowPresentationProfileV1["cascade"];
  readonly collect: {
    readonly startPresentationsWithEmphasis: boolean;
    readonly formatter: {
      readonly kind: "decimal-cents";
      readonly prefix: string;
    };
    readonly itemOrder: "row-major";
    readonly amountText: {
      readonly yOffsetRatioFromCellCenter: number;
      readonly fontSize: number;
      readonly fill: string;
      readonly stroke: string;
      readonly strokeWidth: number;
    };
    readonly summary: {
      readonly countDurationSeconds: number;
      readonly startIntervalSeconds: number;
      readonly position: {
        readonly x: number;
        readonly y: number;
      };
      readonly textStyle: {
        readonly fontSize: number;
        readonly fontWeight: 900;
        readonly fill: string;
        readonly stroke: string;
        readonly strokeWidth: number;
      };
    };
  };
}

export type SlotFlowPresentationProfile =
  | SlotFlowPresentationProfileV1
  | SlotFlowPresentationProfileV2;

export interface SlotReelPresentationCapabilities {
  readonly spinToScene: true;
  readonly visibleSymbolStates: true;
  readonly removeOccurrences: boolean;
  readonly dropdownOccurrences: boolean;
  readonly refillOccurrences: boolean;
  readonly sequentialCollect: boolean;
}

export interface SlotTemplatePresentationProfileV1 {
  readonly reel: SlotReelPresentationProfileV1;
  readonly flow: SlotFlowPresentationProfile;
}

export interface SlotTemplateCompatibilitySnapshot {
  readonly renderMode: "standard" | "grid-cell";
  readonly reelKind: SlotReelPresentationProfileV1["kind"];
  readonly cascadeEnabled: boolean;
  readonly capabilities: SlotReelPresentationCapabilities;
  readonly columns: number;
  readonly rows: number;
  readonly initialMode: string | null;
  readonly popupAvailable: boolean;
}

export function parseSlotTemplatePresentationProfile(
  input: unknown,
): SlotTemplatePresentationProfileV1 {
  const root = strictRecord(input, "presentation", ["reel", "flow"]);
  return deepFreeze({
    reel: parseReel(root.reel),
    flow: parseFlow(root.flow),
  });
}

export function getSlotReelPresentationCapabilities(
  reel: SlotReelPresentationProfileV1,
): SlotReelPresentationCapabilities {
  if (reel.kind !== "standard" && reel.kind !== "grid-cell")
    throw new SceneLayoutError(
      `Unsupported reel presentation kind "${String((reel as { kind?: unknown }).kind)}".`,
    );
  return Object.freeze({
    spinToScene: true as const,
    visibleSymbolStates: true as const,
    removeOccurrences: true,
    dropdownOccurrences: true,
    refillOccurrences: true,
    sequentialCollect: false,
  });
}

export function validateSlotTemplateCompatibility(options: {
  readonly roundFlow: SlotRoundFlowProfileV1;
  readonly presentation: SlotTemplatePresentationProfileV1;
  readonly packageResource:
    | SceneLayoutPackageResource
    | { readonly manifest: SceneLayoutManifestV1 };
}): SlotTemplateCompatibilitySnapshot {
  const manifest = options.packageResource.manifest;
  const reel = manifest.reels.main;
  if (!reel)
    throw new SceneLayoutError("Scene layout must declare reels.main.");
  const binding = resolveInitialBinding(manifest);
  if (!binding)
    throw new SceneLayoutError(
      "Scene layout initial mode must resolve a symbol package binding.",
    );
  if (binding.renderMode !== options.presentation.reel.kind)
    throw new SceneLayoutError(
      `Reel presentation "${options.presentation.reel.kind}" is incompatible with layout renderMode "${binding.renderMode}".`,
    );
  const baseCapabilities = getSlotReelPresentationCapabilities(
    options.presentation.reel,
  );
  const capabilities = Object.freeze({
    ...baseCapabilities,
    sequentialCollect: options.presentation.flow.version === 2,
  });
  if (
    options.roundFlow.cascade &&
    (!capabilities.removeOccurrences ||
      !capabilities.dropdownOccurrences ||
      !capabilities.refillOccurrences)
  )
    throw new SceneLayoutError(
      `Reel presentation "${options.presentation.reel.kind}" does not satisfy cascade remove/dropdown/refill capabilities.`,
    );
  const initialModeId = manifest.gameModes?.initialMode ?? null;
  const initialMode = initialModeId
    ? manifest.gameModes?.modes.find((mode) => mode.id === initialModeId)
    : null;
  const popupAvailable = Boolean(initialMode?.awardCelebrationPopup);
  if (options.presentation.flow.popup.enabled && !popupAvailable)
    throw new SceneLayoutError(
      "Popup presentation is enabled but the initial game mode has no explicit award-celebration popup binding.",
    );
  const valueSymbols =
    options.roundFlow.cascade?.symbols.valueSymbols ?? Object.freeze([]);
  if (valueSymbols.length > 0 && !capabilities.sequentialCollect)
    throw new SceneLayoutError(
      "Value-symbol rounds require presentation.flow version 2 collect capability.",
    );
  if ("symbolPackages" in options.packageResource) {
    const resource = resolveInitialSymbolResource(
      options.packageResource,
      manifest,
      binding,
    );
    const names = new Set(resource?.displaySymbols ?? []);
    for (const [path, symbols] of [
      [
        "round.cascade.symbols.removeExcludedSymbols",
        options.roundFlow.cascade?.symbols.removeExcludedSymbols ?? [],
      ],
      [
        "round.cascade.symbols.dropHeldSymbols",
        options.roundFlow.cascade?.symbols.dropHeldSymbols ?? [],
      ],
      [
        "round.cascade.symbols.valueSymbols",
        options.roundFlow.cascade?.symbols.valueSymbols ?? [],
      ],
      [
        "round.cascade.symbols.sequentialWinCompanionSymbols",
        options.roundFlow.cascade?.symbols.sequentialWinCompanionSymbols ?? [],
      ],
    ] as const) {
      for (const symbol of symbols)
        if (!names.has(symbol))
          throw new SceneLayoutError(
            `${path} contains symbol "${symbol}" that is not in the active symbol package.`,
          );
    }
    const values = resource?.valuePresentationResources ?? {};
    for (const symbol of valueSymbols) {
      const definition = resource?.symbolManifest.symbols[symbol];
      if (!values[symbol] && !definition?.valuePresentation)
        throw new SceneLayoutError(
          `Value symbol "${symbol}" has no manifest-owned value presentation binding.`,
        );
      if (
        definition?.cascadeWinPresentation?.playback.mode !==
        "sequentialCollect"
      )
        throw new SceneLayoutError(
          `Value symbol "${symbol}" has no manifest-owned sequential collect presentation.`,
        );
    }
    for (const symbol of options.roundFlow.cascade?.symbols
      .sequentialWinCompanionSymbols ?? []) {
      const playback =
        resource?.symbolManifest.symbols[symbol]?.cascadeWinPresentation
          ?.playback;
      if (playback?.mode !== "group")
        throw new SceneLayoutError(
          `Sequential companion symbol "${symbol}" has no manifest-owned group presentation.`,
        );
    }
  }
  return Object.freeze({
    renderMode: binding.renderMode,
    reelKind: options.presentation.reel.kind,
    cascadeEnabled: Boolean(options.roundFlow.cascade),
    capabilities,
    columns: reel.columns,
    rows: reel.rows,
    initialMode: initialModeId,
    popupAvailable,
  });
}

export function validateInspectedSlotTemplateCompatibility(options: {
  readonly roundFlow: SlotRoundFlowProfileV1;
  readonly presentation: SlotTemplatePresentationProfileV1;
  readonly packageInput: {
    readonly manifest: SceneLayoutManifestV1;
    readonly files: ReadonlyMap<string, Uint8Array>;
  };
}): SlotTemplateCompatibilitySnapshot {
  const binding = resolveInitialBinding(options.packageInput.manifest);
  if (!binding)
    return validateSlotTemplateCompatibility({
      roundFlow: options.roundFlow,
      presentation: options.presentation,
      packageResource: { manifest: options.packageInput.manifest },
    });
  const packageManifest = parseSymbolPackageManifest(
    parseJsonBytes(
      requireInspectionBytes(
        options.packageInput.files,
        binding.manifest,
        binding.manifest,
      ),
      binding.manifest,
    ),
  );
  const symbolManifestPath = resolveInspectionEntryPath(
    binding.manifest,
    packageManifest.entrypoints.symbolManifest,
    options.packageInput.files,
  );
  const symbolManifest = parseSymbolStateTextureManifest(
    parseJsonBytes(
      requireInspectionBytes(
        options.packageInput.files,
        symbolManifestPath,
        packageManifest.entrypoints.symbolManifest,
      ),
      symbolManifestPath,
    ),
  );
  const displaySymbols = Object.freeze(Object.keys(symbolManifest.symbols));
  const symbolResource = {
    displaySymbols,
    symbolManifest,
    valuePresentationResources: Object.freeze(
      Object.fromEntries(
        displaySymbols.flatMap((symbol) =>
          symbolManifest.symbols[symbol]?.valuePresentation
            ? [[symbol, Object.freeze({})] as const]
            : [],
        ),
      ),
    ),
  } as unknown as SymbolPackageResource;
  const direct = options.packageInput.manifest.symbolPackage === binding;
  const bindingId = direct
    ? null
    : (Object.entries(options.packageInput.manifest.symbolPackages ?? {}).find(
        ([, candidate]) => candidate === binding,
      )?.[0] ?? null);
  return validateSlotTemplateCompatibility({
    roundFlow: options.roundFlow,
    presentation: options.presentation,
    packageResource: {
      manifest: options.packageInput.manifest,
      symbolPackage: direct ? symbolResource : undefined,
      symbolPackages: bindingId === null ? {} : { [bindingId]: symbolResource },
    } as unknown as SceneLayoutPackageResource,
  });
}

function resolveInspectionEntryPath(
  manifestPath: string,
  entryPath: string,
  files: ReadonlyMap<string, Uint8Array>,
): string {
  if (files.has(entryPath)) return entryPath;
  const slash = manifestPath.lastIndexOf("/");
  const resolved =
    slash < 0 ? entryPath : `${manifestPath.slice(0, slash + 1)}${entryPath}`;
  return resolved;
}

function requireInspectionBytes(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
  label: string,
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes)
    throw new SceneLayoutError(
      `Scene layout inspection is missing "${label}" at "${path}".`,
    );
  return bytes;
}

function parseJsonBytes(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    throw new SceneLayoutError(
      `${path} is invalid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function resolveInitialBinding(
  manifest: SceneLayoutManifestV1,
): SceneLayoutSymbolPackageBinding | null {
  if (manifest.symbolPackage) return manifest.symbolPackage;
  const initialModeId = manifest.gameModes?.initialMode;
  const initialMode = manifest.gameModes?.modes.find(
    (mode) => mode.id === initialModeId,
  );
  if (!initialMode?.symbolPackage) return null;
  return manifest.symbolPackages?.[initialMode.symbolPackage] ?? null;
}

function resolveInitialSymbolResource(
  resource: SceneLayoutPackageResource,
  manifest: SceneLayoutManifestV1,
  binding: SceneLayoutSymbolPackageBinding,
) {
  if (manifest.symbolPackage === binding) return resource.symbolPackage;
  const id = Object.entries(manifest.symbolPackages ?? {}).find(
    ([, candidate]) => candidate === binding,
  )?.[0];
  return id ? resource.symbolPackages[id] : null;
}

function parseReel(value: unknown): SlotReelPresentationProfileV1 {
  const record = asRecord(value, "presentation.reel");
  if (record.kind === "standard") {
    assertKeys(record, "presentation.reel", [
      "kind",
      "version",
      "direction",
      "speedSymbolsPerSecond",
      "minimumSpinCycles",
      "baseDurationMs",
      "startDelayMs",
      "stopDelayMs",
      "bounceStrength",
    ]);
    version(record.version, "presentation.reel.version");
    return {
      kind: "standard",
      version: 1,
      direction: direction(record.direction, "presentation.reel.direction"),
      speedSymbolsPerSecond: positive(
        record.speedSymbolsPerSecond,
        "presentation.reel.speedSymbolsPerSecond",
      ),
      minimumSpinCycles: positiveInteger(
        record.minimumSpinCycles,
        "presentation.reel.minimumSpinCycles",
      ),
      baseDurationMs: positive(
        record.baseDurationMs,
        "presentation.reel.baseDurationMs",
      ),
      startDelayMs: nonNegative(
        record.startDelayMs,
        "presentation.reel.startDelayMs",
      ),
      stopDelayMs: nonNegative(
        record.stopDelayMs,
        "presentation.reel.stopDelayMs",
      ),
      bounceStrength: nonNegative(
        record.bounceStrength,
        "presentation.reel.bounceStrength",
      ),
    };
  }
  if (record.kind === "grid-cell") {
    assertKeys(record, "presentation.reel", [
      "kind",
      "version",
      "direction",
      "order",
      "timing",
      "bounceStrength",
    ]);
    version(record.version, "presentation.reel.version");
    if (record.order !== "top-down-left-right")
      throw new SceneLayoutError(
        'presentation.reel.order must be "top-down-left-right".',
      );
    const timing = strictRecord(record.timing, "presentation.reel.timing", [
      "startStepMs",
      "stopStepMs",
      "settleAfterLastStartMs",
      "minimumSpinCycles",
      "speedSymbolsPerSecond",
    ]);
    return {
      kind: "grid-cell",
      version: 1,
      direction: direction(record.direction, "presentation.reel.direction"),
      order: "top-down-left-right",
      timing: {
        startStepMs: nonNegative(
          timing.startStepMs,
          "presentation.reel.timing.startStepMs",
        ),
        stopStepMs: nonNegative(
          timing.stopStepMs,
          "presentation.reel.timing.stopStepMs",
        ),
        settleAfterLastStartMs: positive(
          timing.settleAfterLastStartMs,
          "presentation.reel.timing.settleAfterLastStartMs",
        ),
        minimumSpinCycles: positiveInteger(
          timing.minimumSpinCycles,
          "presentation.reel.timing.minimumSpinCycles",
        ),
        speedSymbolsPerSecond: positive(
          timing.speedSymbolsPerSecond,
          "presentation.reel.timing.speedSymbolsPerSecond",
        ),
      },
      bounceStrength: nonNegative(
        record.bounceStrength,
        "presentation.reel.bounceStrength",
      ),
    };
  }
  throw new SceneLayoutError(
    'presentation.reel.kind must be "standard" or "grid-cell".',
  );
}

function parseFlow(value: unknown): SlotFlowPresentationProfile {
  const record = asRecord(value, "presentation.flow");
  if (record.version !== 1 && record.version !== 2)
    throw new SceneLayoutError("presentation.flow.version must be 1 or 2.");
  assertKeys(record, "presentation.flow", [
    "version",
    "symbolStates",
    "dimmingAlpha",
    "popup",
    "cascade",
    ...(record.version === 2 ? ["collect"] : []),
  ]);
  const states = strictRecord(
    record.symbolStates,
    "presentation.flow.symbolStates",
    ["normal", "win", "remove"],
  );
  const popup = strictRecord(record.popup, "presentation.flow.popup", [
    "enabled",
  ]);
  if (typeof popup.enabled !== "boolean")
    throw new SceneLayoutError(
      "presentation.flow.popup.enabled must be a boolean.",
    );
  const cascade = strictRecord(record.cascade, "presentation.flow.cascade", [
    "emphasisFadeInMs",
    "emphasisHoldMs",
    "emphasisFadeOutMs",
    "baseFallSeconds",
    "perRowFallSeconds",
    "maxFallSeconds",
    "settleSeconds",
  ]);
  const dimmingAlpha = finite(
    record.dimmingAlpha,
    "presentation.flow.dimmingAlpha",
  );
  if (dimmingAlpha < 0 || dimmingAlpha > 1)
    throw new SceneLayoutError(
      "presentation.flow.dimmingAlpha must be between 0 and 1.",
    );
  const common = {
    symbolStates: {
      normal: nonBlank(states.normal, "presentation.flow.symbolStates.normal"),
      win: nonBlank(states.win, "presentation.flow.symbolStates.win"),
      remove: nonBlank(states.remove, "presentation.flow.symbolStates.remove"),
    },
    dimmingAlpha,
    popup: { enabled: popup.enabled },
    cascade: {
      emphasisFadeInMs: nonNegative(
        cascade.emphasisFadeInMs,
        "presentation.flow.cascade.emphasisFadeInMs",
      ),
      emphasisHoldMs: nonNegative(
        cascade.emphasisHoldMs,
        "presentation.flow.cascade.emphasisHoldMs",
      ),
      emphasisFadeOutMs: nonNegative(
        cascade.emphasisFadeOutMs,
        "presentation.flow.cascade.emphasisFadeOutMs",
      ),
      baseFallSeconds: positive(
        cascade.baseFallSeconds,
        "presentation.flow.cascade.baseFallSeconds",
      ),
      perRowFallSeconds: nonNegative(
        cascade.perRowFallSeconds,
        "presentation.flow.cascade.perRowFallSeconds",
      ),
      maxFallSeconds: positive(
        cascade.maxFallSeconds,
        "presentation.flow.cascade.maxFallSeconds",
      ),
      settleSeconds: nonNegative(
        cascade.settleSeconds,
        "presentation.flow.cascade.settleSeconds",
      ),
    },
  };
  if (record.version === 1)
    return {
      version: 1,
      ...common,
    };
  const collect = strictRecord(record.collect, "presentation.flow.collect", [
    "startPresentationsWithEmphasis",
    "formatter",
    "itemOrder",
    "amountText",
    "summary",
  ]);
  if (typeof collect.startPresentationsWithEmphasis !== "boolean")
    throw new SceneLayoutError(
      "presentation.flow.collect.startPresentationsWithEmphasis must be a boolean.",
    );
  if (collect.itemOrder !== "row-major")
    throw new SceneLayoutError(
      'presentation.flow.collect.itemOrder must be "row-major".',
    );
  const formatter = strictRecord(
    collect.formatter,
    "presentation.flow.collect.formatter",
    ["kind", "prefix"],
  );
  if (formatter.kind !== "decimal-cents")
    throw new SceneLayoutError(
      'presentation.flow.collect.formatter.kind must be "decimal-cents".',
    );
  if (typeof formatter.prefix !== "string")
    throw new SceneLayoutError(
      "presentation.flow.collect.formatter.prefix must be a string.",
    );
  const amountText = parseTextStyle(
    collect.amountText,
    "presentation.flow.collect.amountText",
    true,
  );
  const summary = strictRecord(
    collect.summary,
    "presentation.flow.collect.summary",
    ["countDurationSeconds", "startIntervalSeconds", "position", "textStyle"],
  );
  const position = strictRecord(
    summary.position,
    "presentation.flow.collect.summary.position",
    ["x", "y"],
  );
  const textStyle = parseTextStyle(
    summary.textStyle,
    "presentation.flow.collect.summary.textStyle",
    false,
  );
  return {
    version: 2,
    ...common,
    collect: {
      startPresentationsWithEmphasis: collect.startPresentationsWithEmphasis,
      formatter: {
        kind: "decimal-cents",
        prefix: formatter.prefix,
      },
      itemOrder: "row-major",
      amountText: {
        yOffsetRatioFromCellCenter: amountText.yOffsetRatioFromCellCenter!,
        fontSize: amountText.fontSize,
        fill: amountText.fill,
        stroke: amountText.stroke,
        strokeWidth: amountText.strokeWidth,
      },
      summary: {
        countDurationSeconds: positive(
          summary.countDurationSeconds,
          "presentation.flow.collect.summary.countDurationSeconds",
        ),
        startIntervalSeconds: positive(
          summary.startIntervalSeconds,
          "presentation.flow.collect.summary.startIntervalSeconds",
        ),
        position: {
          x: finite(position.x, "presentation.flow.collect.summary.position.x"),
          y: finite(position.y, "presentation.flow.collect.summary.position.y"),
        },
        textStyle: {
          fontSize: textStyle.fontSize,
          fontWeight: 900,
          fill: textStyle.fill,
          stroke: textStyle.stroke,
          strokeWidth: textStyle.strokeWidth,
        },
      },
    },
  };
}

function parseTextStyle(
  value: unknown,
  path: string,
  includeOffset: boolean,
): {
  readonly yOffsetRatioFromCellCenter?: number;
  readonly fontSize: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
} {
  const record = strictRecord(value, path, [
    ...(includeOffset ? ["yOffsetRatioFromCellCenter"] : []),
    ...(!includeOffset ? ["fontWeight"] : []),
    "fontSize",
    "fill",
    "stroke",
    "strokeWidth",
  ]);
  if (!includeOffset && record.fontWeight !== 900)
    throw new SceneLayoutError(`${path}.fontWeight must be 900.`);
  return {
    ...(includeOffset
      ? {
          yOffsetRatioFromCellCenter: finite(
            record.yOffsetRatioFromCellCenter,
            `${path}.yOffsetRatioFromCellCenter`,
          ),
        }
      : {}),
    fontSize: positive(record.fontSize, `${path}.fontSize`),
    fill: nonBlank(record.fill, `${path}.fill`),
    stroke: nonBlank(record.stroke, `${path}.stroke`),
    strokeWidth: nonNegative(record.strokeWidth, `${path}.strokeWidth`),
  };
}

function strictRecord(
  value: unknown,
  path: string,
  keys: readonly string[],
): Record<string, unknown> {
  const record = asRecord(value, path);
  assertKeys(record, path, keys);
  return record;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new SceneLayoutError(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function assertKeys(
  record: Record<string, unknown>,
  path: string,
  keys: readonly string[],
): void {
  const unknown = Object.keys(record).find((key) => !keys.includes(key));
  if (unknown)
    throw new SceneLayoutError(`${path}.${unknown} is not supported.`);
}

function version(value: unknown, path: string): void {
  if (value !== 1) throw new SceneLayoutError(`${path} must be 1.`);
}

function direction(value: unknown, path: string): "forward" | "backward" {
  if (value !== "forward" && value !== "backward")
    throw new SceneLayoutError(`${path} must be "forward" or "backward".`);
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new SceneLayoutError(`${path} must be a finite number.`);
  return value;
}

function positive(value: unknown, path: string): number {
  const parsed = finite(value, path);
  if (parsed <= 0) throw new SceneLayoutError(`${path} must be positive.`);
  return parsed;
}

function nonNegative(value: unknown, path: string): number {
  const parsed = finite(value, path);
  if (parsed < 0) throw new SceneLayoutError(`${path} must be non-negative.`);
  return parsed;
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = positive(value, path);
  if (!Number.isSafeInteger(parsed))
    throw new SceneLayoutError(`${path} must be a positive safe integer.`);
  return parsed;
}

function nonBlank(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new SceneLayoutError(`${path} must be a non-blank string.`);
  return value.trim();
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
