import {
  getServerBetMethodComponentCatalog,
  parseServerGameAuthoringSummary,
  parseSlotRoundFlowProfile,
  suggestSlotRoundFlow,
  validateSlotRoundFlowCatalogCompatibility,
  type ServerGameAuthoringSummary,
  type SlotRoundFlowProfileV1,
  type SlotRoundFlowSuggestions,
} from "@slotclientengine/logiccore";
import {
  createConfiguredSceneLayoutRoundAdapter,
  createSceneLayoutFramePolicy,
  inspectSceneLayoutPackageZipBytes,
  loadSceneLayoutPackageFromZipBytes,
  parseSlotTemplatePresentationProfile,
  validateSlotTemplateCompatibility,
  type SceneLayoutManifestV1,
  type SlotTemplateCompatibilitySnapshot,
  type SlotTemplatePresentationProfileV1,
} from "@slotclientengine/rendercore/scene-layout";
import { createSlotGameFramework } from "../framework.js";
import { validateLiveServerUrl } from "../session.js";
import type {
  SlotGameBetOption,
  SlotGameFramework,
  SlotGameLiveConfig,
  SlotGameLiveSessionLike,
} from "../types.js";

export interface SceneLayoutSlotTemplateConfigV1 {
  readonly kind: "scene-layout-slot-template";
  readonly version: 1;
  readonly title: string;
  readonly live: {
    readonly serverUrl: string;
    readonly gamecode: string;
    readonly clienttype: string;
    readonly jurisdiction?: string;
    readonly language?: string;
    readonly requestTimeoutMs: number;
  };
  readonly wager: {
    readonly betOptions: readonly SlotGameBetOption[];
    readonly initialBetIndex: number;
    readonly autonums?: number;
  };
  readonly round: SlotRoundFlowProfileV1;
  readonly presentation: SlotTemplatePresentationProfileV1;
}

export interface SceneLayoutTemplateCredential {
  readonly token?: string;
  readonly businessid?: string;
}

export interface SceneLayoutTemplateReadinessSnapshot {
  readonly kind: "scene-layout-template-readiness";
  readonly version: 1;
  readonly layout: {
    readonly sha256: string;
    readonly id: string;
    readonly entryCount: number;
    readonly totalBytes: number;
    readonly modes: readonly string[];
    readonly symbolPackages: readonly string[];
    readonly popups: readonly string[];
  };
  readonly compatibility: SlotTemplateCompatibilitySnapshot;
  readonly normalizedConfig: SceneLayoutSlotTemplateConfigV1;
  readonly warnings: readonly string[];
}

export async function inspectSceneLayoutPackageInput(options: {
  readonly layoutZipBytes: Uint8Array;
}): Promise<SceneLayoutTemplateReadinessSnapshot["layout"]> {
  const [inspected, sha256] = await Promise.all([
    inspectSceneLayoutPackageZipBytes({ zipBytes: options.layoutZipBytes }),
    sha256Hex(options.layoutZipBytes),
  ]);
  return deepFreeze({
    sha256,
    id: inspected.manifest.id,
    entryCount: inspected.entryCount,
    totalBytes: inspected.totalBytes,
    modes: inspected.manifest.gameModes?.modes.map((mode) => mode.id) ?? [],
    symbolPackages: inspected.manifest.symbolPackage
      ? [inspected.manifest.symbolPackage.manifest]
      : Object.keys(inspected.manifest.symbolPackages ?? {}),
    popups: Object.keys(inspected.manifest.popups ?? {}),
  });
}

export async function inspectSceneLayoutTemplateInputs(options: {
  readonly layoutZipBytes: Uint8Array;
  readonly config: unknown;
  readonly expectedLayoutSha256?: string;
}): Promise<SceneLayoutTemplateReadinessSnapshot> {
  const config = parseSceneLayoutSlotTemplateConfig(options.config);
  const [inspected, layout] = await Promise.all([
    inspectSceneLayoutPackageZipBytes({ zipBytes: options.layoutZipBytes }),
    inspectSceneLayoutPackageInput({
      layoutZipBytes: options.layoutZipBytes,
    }),
  ]);
  if (
    options.expectedLayoutSha256 !== undefined &&
    normalizeSha256(options.expectedLayoutSha256, "expectedLayoutSha256") !==
      layout.sha256
  )
    throw new Error(
      `Layout ZIP hash mismatch: expected ${options.expectedLayoutSha256}, received ${layout.sha256}.`,
    );
  const compatibility = validateSlotTemplateCompatibility({
    roundFlow: config.round,
    presentation: config.presentation,
    packageResource: inspected,
  });
  const warnings = createCapabilityWarnings(inspected.manifest);
  return deepFreeze({
    kind: "scene-layout-template-readiness" as const,
    version: 1 as const,
    layout,
    compatibility,
    normalizedConfig: config,
    warnings,
  });
}

export async function createSceneLayoutSlotGameTemplate(options: {
  readonly root: HTMLElement;
  readonly layoutZipBytes: Uint8Array;
  readonly config: unknown;
  readonly credential?: SceneLayoutTemplateCredential;
  readonly expectedLayoutSha256?: string;
  readonly liveSession?: SlotGameLiveSessionLike;
}): Promise<SlotGameFramework> {
  const readiness = await inspectSceneLayoutTemplateInputs({
    layoutZipBytes: options.layoutZipBytes,
    config: options.config,
    ...(options.expectedLayoutSha256
      ? { expectedLayoutSha256: options.expectedLayoutSha256 }
      : {}),
  });
  const resource = await loadSceneLayoutPackageFromZipBytes({
    zipBytes: options.layoutZipBytes,
    loadSymbolTextures: true,
  });
  try {
    validateSlotTemplateCompatibility({
      roundFlow: readiness.normalizedConfig.round,
      presentation: readiness.normalizedConfig.presentation,
      packageResource: resource,
    });
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow: readiness.normalizedConfig.round,
      presentation: readiness.normalizedConfig.presentation,
    });
    const live: SlotGameLiveConfig = Object.freeze({
      ...readiness.normalizedConfig.live,
      ...(options.credential?.token ? { token: options.credential.token } : {}),
      ...(options.credential?.businessid
        ? { businessid: options.credential.businessid }
        : {}),
    });
    const framePolicy = createSceneLayoutFramePolicy(resource.manifest);
    return createSlotGameFramework({
      root: options.root,
      gameAdapter: adapter,
      live,
      betOptions: readiness.normalizedConfig.wager.betOptions,
      initialBetIndex: readiness.normalizedConfig.wager.initialBetIndex,
      designSize: resolveInitialDesignSize(resource.manifest),
      framePolicy,
      brandLabel: readiness.normalizedConfig.title,
      ...(options.liveSession ? { liveSession: options.liveSession } : {}),
      ...(readiness.normalizedConfig.wager.autonums === undefined
        ? {}
        : {
            buildSpinRequest: () => ({
              autonums: readiness.normalizedConfig.wager.autonums,
            }),
          }),
    });
  } catch (error) {
    await resource.destroy();
    throw error;
  }
}

export function parseSceneLayoutSlotTemplateConfig(
  input: unknown,
): SceneLayoutSlotTemplateConfigV1 {
  const root = strictRecord(input, "config", [
    "kind",
    "version",
    "title",
    "live",
    "wager",
    "round",
    "presentation",
  ]);
  if (root.kind !== "scene-layout-slot-template")
    throw new Error('config.kind must be "scene-layout-slot-template".');
  if (root.version !== 1) throw new Error("config.version must be 1.");
  const title = nonBlank(root.title, "config.title");
  const live = strictRecord(root.live, "config.live", [
    "serverUrl",
    "gamecode",
    "clienttype",
    "jurisdiction",
    "language",
    "requestTimeoutMs",
  ]);
  const serverUrl = nonBlank(live.serverUrl, "config.live.serverUrl");
  validateLiveServerUrl(serverUrl);
  const parsedServerUrl = new URL(serverUrl);
  if (parsedServerUrl.search || parsedServerUrl.hash)
    throw new Error(
      "config.live.serverUrl must not contain query parameters or a fragment.",
    );
  if (parsedServerUrl.username || parsedServerUrl.password)
    throw new Error(
      "config.live.serverUrl must not contain embedded credentials.",
    );
  const gamecode = nonBlank(live.gamecode, "config.live.gamecode");
  const clienttype = nonBlank(live.clienttype, "config.live.clienttype");
  const jurisdiction = optionalNonBlank(
    live.jurisdiction,
    "config.live.jurisdiction",
  );
  const language = optionalNonBlank(live.language, "config.live.language");
  const requestTimeoutMs = positiveSafeInteger(
    live.requestTimeoutMs,
    "config.live.requestTimeoutMs",
  );
  const wager = strictRecord(root.wager, "config.wager", [
    "betOptions",
    "initialBetIndex",
    "autonums",
  ]);
  if (!Array.isArray(wager.betOptions) || wager.betOptions.length === 0)
    throw new Error("config.wager.betOptions must be a non-empty array.");
  const betOptions = wager.betOptions.map((value, index) =>
    parseBetOption(value, `config.wager.betOptions[${index}]`),
  );
  const initialBetIndex = nonNegativeSafeInteger(
    wager.initialBetIndex,
    "config.wager.initialBetIndex",
  );
  if (initialBetIndex >= betOptions.length)
    throw new Error(
      "config.wager.initialBetIndex is outside betOptions bounds.",
    );
  const autonums =
    wager.autonums === undefined
      ? undefined
      : nonNegativeSafeInteger(wager.autonums, "config.wager.autonums");
  return deepFreeze({
    kind: "scene-layout-slot-template" as const,
    version: 1 as const,
    title,
    live: {
      serverUrl,
      gamecode,
      clienttype,
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(language ? { language } : {}),
      requestTimeoutMs,
    },
    wager: {
      betOptions,
      initialBetIndex,
      ...(autonums === undefined ? {} : { autonums }),
    },
    round: parseSlotRoundFlowProfile(root.round),
    presentation: parseSlotTemplatePresentationProfile(root.presentation),
  });
}

export {
  getServerBetMethodComponentCatalog,
  parseServerGameAuthoringSummary,
  suggestSlotRoundFlow,
  validateSlotRoundFlowCatalogCompatibility,
};
export type {
  ServerGameAuthoringSummary,
  SlotRoundFlowProfileV1,
  SlotRoundFlowSuggestions,
  SlotTemplatePresentationProfileV1,
};

function parseBetOption(value: unknown, path: string): SlotGameBetOption {
  const record = strictRecord(value, path, ["bet", "lines", "times", "label"]);
  const bet = positiveFinite(record.bet, `${path}.bet`);
  const lines = positiveSafeInteger(record.lines, `${path}.lines`);
  const times =
    record.times === undefined
      ? undefined
      : positiveFinite(record.times, `${path}.times`);
  const label = optionalNonBlank(record.label, `${path}.label`);
  return {
    bet,
    lines,
    ...(times === undefined ? {} : { times }),
    ...(label ? { label } : {}),
  };
}

function resolveInitialDesignSize(manifest: SceneLayoutManifestV1): {
  readonly width: number;
  readonly height: number;
} {
  return manifest.adaptation.mode === "maximized-focus"
    ? manifest.adaptation.artSize
    : manifest.adaptation.variants.landscape.artSize;
}

function createCapabilityWarnings(
  manifest: SceneLayoutManifestV1,
): readonly string[] {
  const warnings = [
    "运行只使用 ZIP 内公开本地轮带；server authoring repository 不进入运行会话。",
    "首版不自动触发 game mode 转场；缺少 typed mode resolver 时保持 initial mode。",
  ];
  if (!Object.keys(manifest.popups ?? {}).length)
    warnings.push("当前 layout 没有 award-celebration popup binding。");
  return Object.freeze(warnings);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error("Web Crypto subtle.digest is required.");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeSha256(value: unknown, path: string): string {
  const parsed = nonBlank(value, path).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(parsed))
    throw new Error(`${path} must be a 64-character SHA-256 hex string.`);
  return parsed;
}

function strictRecord(
  value: unknown,
  path: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${path}.${unknown} is not supported.`);
  return record;
}

function nonBlank(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${path} must be a non-blank string.`);
  return value.trim();
}

function optionalNonBlank(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : nonBlank(value, path);
}

function positiveFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(`${path} must be a positive finite number.`);
  return value;
}

function positiveSafeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    throw new Error(`${path} must be a positive safe integer.`);
  return value as number;
}

function nonNegativeSafeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error(`${path} must be a non-negative safe integer.`);
  return value as number;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
