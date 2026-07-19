import {
  assertVNIProject,
  createAssetUrlManifest,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/core";
import type {
  ReelSymbolRenderPriorityMap,
  ReelSymbolScaleMap,
} from "../reel/types.js";
import { SymbolAssetError } from "./errors.js";
import { createDefaultSymbolStatePreset } from "./state-machine.js";
import { readSupportedSpineSkeletonVersion } from "./spine-version.js";
import {
  AtlasAttachmentLoader,
  SkeletonJson,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import type {
  SymbolAssetInput,
  SymbolAssetMap,
  SymbolLayerTextureSource,
  SymbolNormalTextureSource,
  SymbolPlaybackKind,
  SymbolStateId,
  SymbolStateDefinition,
  SymbolStatePreset,
} from "./types.js";
import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import { validateImageStringAnchor } from "../image-string/layout.js";

export interface SymbolCascadeGroupPlaybackPresentation {
  readonly mode: "group";
  readonly winState: SymbolStateId;
  readonly removeState: SymbolStateId;
}

export interface SymbolCascadeSequentialCollectPlaybackPresentation {
  readonly mode: "sequentialCollect";
  readonly startState: SymbolStateId;
  readonly loopState: SymbolStateId;
  readonly collectState: SymbolStateId;
  readonly removeState: SymbolStateId;
}

export type SymbolCascadePlaybackPresentation =
  | SymbolCascadeGroupPlaybackPresentation
  | SymbolCascadeSequentialCollectPlaybackPresentation;

export interface SymbolCascadeWinPresentation {
  readonly order: number;
  readonly playback: SymbolCascadePlaybackPresentation;
  readonly summary: Readonly<{
    readonly mode: "groupAmount" | "itemAmount";
  }>;
}

export type SymbolCascadeWinPresentationMap = Readonly<
  Record<string, SymbolCascadeWinPresentation>
>;

export interface SymbolManifestRangePlaybackSpec {
  readonly mode: "range";
  readonly startTime: number;
  readonly endTime: number;
  readonly loop: boolean;
}

export interface SymbolManifestBuiltinAnimationSpec {
  readonly kind: "builtin";
  readonly durationSeconds: number;
}

export interface SymbolManifestStaticAnimationSpec {
  readonly kind: "static";
  readonly durationSeconds: number;
}

/**
 * An intentional visual absence. Unlike `static`, this hides every symbol art
 * layer while still participating in the state's lifecycle.
 */
export interface SymbolManifestEmptyAnimationSpec {
  readonly kind: "empty";
  readonly durationSeconds: number;
}

export interface SymbolManifestVniAnimationSpec {
  readonly kind: "vni";
  readonly project: string;
  readonly playback: SymbolManifestRangePlaybackSpec;
}

export interface SymbolManifestAnimationPlaybackSpec {
  readonly mode: "animation";
  readonly animationName: string;
  readonly loop: boolean;
}

export interface SymbolManifestSpineAnimationTransform {
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
}

export interface SymbolManifestSpineAnimationSpec {
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly texture: string;
  readonly playback: SymbolManifestAnimationPlaybackSpec;
  readonly transform?: SymbolManifestSpineAnimationTransform;
}

export interface SymbolManifestActiveSpineAnimationSpec {
  readonly kind: "activeSpine";
  readonly playback: SymbolManifestAnimationPlaybackSpec;
}

export interface SymbolValuePresentationTextBaseSpec {
  readonly slot: string;
  readonly x: number;
  readonly y: number;
}

export interface SymbolValuePresentationFontTextSpec extends SymbolValuePresentationTextBaseSpec {
  readonly type: "font";
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

export interface SymbolValuePresentationImageTextSpec extends SymbolValuePresentationTextBaseSpec {
  readonly type: "image";
  readonly prefix: string;
}

export type SymbolValuePresentationTextSpec =
  | SymbolValuePresentationFontTextSpec
  | SymbolValuePresentationImageTextSpec;

export interface SymbolValuePresentationReelStatesSpec {
  readonly normal: SymbolManifestTransparentNormal;
  readonly states: Readonly<Record<SymbolStateId, string>>;
}

export interface SymbolValuePresentationTierSpec {
  readonly maxExclusive?: number;
  readonly animation: SymbolManifestSpineAnimationSpec;
}

export interface SymbolValuePresentationSpec {
  readonly defaultValues: readonly number[];
  readonly reelStates: SymbolValuePresentationReelStatesSpec;
  readonly tiers: readonly SymbolValuePresentationTierSpec[];
  readonly text: SymbolValuePresentationTextSpec;
}

export interface SymbolImageStringNodeSpec {
  readonly name: string;
  readonly resource: string;
  readonly target: Readonly<{ state: string; slot: string }>;
  readonly initialText: string;
  readonly anchor: Readonly<{ x: number; y: number }>;
  readonly transform: Readonly<{ x: number; y: number; scale: number }>;
  readonly followSlotColor: boolean;
}

export type SymbolManifestAnimationSpec =
  | SymbolManifestBuiltinAnimationSpec
  | SymbolManifestStaticAnimationSpec
  | SymbolManifestEmptyAnimationSpec
  | SymbolManifestVniAnimationSpec
  | SymbolManifestSpineAnimationSpec
  | SymbolManifestActiveSpineAnimationSpec;

export type SymbolManifestNormal =
  | string
  | SymbolManifestLayeredNormal
  | SymbolManifestTransparentNormal;

export interface SymbolManifestLayeredNormal {
  readonly kind: "layered";
  readonly layers: readonly SymbolManifestLayer[];
}

export interface SymbolManifestTransparentNormal {
  readonly kind: "transparent";
  readonly width: number;
  readonly height: number;
}

export interface SymbolManifestLayer {
  readonly index: number;
  readonly texture: string;
  readonly keyframes: readonly string[];
}

export interface ParsedSymbolManifestSymbol {
  readonly normal: SymbolManifestNormal;
  readonly states: Readonly<Record<SymbolStateId, string>>;
  readonly scale: number;
  readonly hasExplicitScale: boolean;
  readonly renderPriority: number;
  readonly animations: Readonly<
    Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>>
  >;
  readonly valuePresentation?: SymbolValuePresentationSpec;
  readonly imageStringNodes: readonly SymbolImageStringNodeSpec[];
  readonly cascadeWinPresentation?: SymbolCascadeWinPresentation;
}

export interface ParsedSymbolStateTextureManifest {
  readonly version: 1;
  readonly states: readonly SymbolStateId[];
  readonly statePreset: SymbolStatePreset;
  readonly symbols: Readonly<Record<string, ParsedSymbolManifestSymbol>>;
}

export interface ParseSymbolStateTextureManifestOptions {
  readonly requiredStates?: readonly SymbolStateId[];
  readonly animationStates?: readonly SymbolStateId[];
}

export interface CreateSymbolAssetMapFromManifestModulesOptions extends ParseSymbolStateTextureManifestOptions {
  readonly modules: Readonly<Record<string, string>>;
  readonly manifest: unknown;
  readonly displaySymbols?: readonly string[];
  readonly includeUnmanifestedNormalAssets?: boolean;
}

export interface CreateSymbolScaleMapFromManifestOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly displaySymbols?: readonly string[];
  readonly requireExplicitScale?: boolean;
}

export interface CreateSymbolRenderPriorityMapFromManifestOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly displaySymbols?: readonly string[];
}

export interface CreateSymbolAnimationCapabilityMapFromManifestOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly displaySymbols?: readonly string[];
}

export interface CreateSymbolLandingAppearSymbolsFromManifestOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly displaySymbols?: readonly string[];
}

export interface CreateSymbolVniAnimationResourcesOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly vniProjectModules: Readonly<Record<string, unknown>>;
  readonly vniAssetModules: Readonly<Record<string, string>>;
}

export interface CreateSymbolSpineAnimationResourcesOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly spineSkeletonModules: Readonly<Record<string, unknown>>;
  readonly spineAtlasModules: Readonly<Record<string, string>>;
  readonly spineTextureModules: Readonly<Record<string, string>>;
}

export interface SymbolVniAnimationResource {
  readonly symbol: string;
  readonly state: SymbolStateId;
  readonly spec: SymbolManifestVniAnimationSpec;
  readonly project: VNIProjectConfig;
  readonly assetUrls: AssetUrlManifest;
}

export type SymbolVniAnimationResourceMap = Readonly<
  Record<
    string,
    Readonly<Partial<Record<SymbolStateId, SymbolVniAnimationResource>>>
  >
>;

export interface SymbolSpineAnimationResource {
  readonly symbol: string;
  readonly state: SymbolStateId;
  readonly spec: SymbolManifestSpineAnimationSpec;
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly textureUrl: string;
  readonly atlasPage: string;
}

export type SymbolSpineAnimationResourceMap = Readonly<
  Record<
    string,
    Readonly<Partial<Record<SymbolStateId, SymbolSpineAnimationResource>>>
  >
>;

interface SplitSymbolPngModulesResult {
  readonly normalAssets: Readonly<Record<string, string>>;
  readonly stateAssets: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
  readonly assetsByFileName: Readonly<Record<string, string>>;
}

const TOP_LEVEL_MANIFEST_KEYS = Object.freeze([
  "version",
  "states",
  "settings",
  "symbols",
]);

export function parseSymbolStateTextureManifest(
  manifest: unknown,
  options: ParseSymbolStateTextureManifestOptions = {},
): ParsedSymbolStateTextureManifest {
  const record = assertRecord(manifest, "symbol state texture manifest");
  assertOnlyKnownKeys(
    record,
    "symbol state texture manifest",
    TOP_LEVEL_MANIFEST_KEYS,
  );
  if (record.version !== 1) {
    throw new SymbolAssetError(
      "Symbol state texture manifest version must be 1.",
    );
  }
  if (!Array.isArray(record.states)) {
    throw new SymbolAssetError(
      "Symbol state texture manifest states must be an array.",
    );
  }

  const states = Object.freeze(
    record.states.map((state) => assertString(state, "manifest state")),
  );
  assertUniqueStrings(states, "symbol state texture manifest states");
  const statePreset = parseManifestStatePreset(record.settings, states);
  const stateSet = new Set(states);
  for (const state of options.requiredStates ?? []) {
    if (!stateSet.has(state)) {
      throw new SymbolAssetError(
        `Symbol state texture manifest is missing required state "${state}".`,
      );
    }
  }
  if (options.requiredStates) {
    const requiredStateSet = new Set(options.requiredStates);
    for (const state of states) {
      if (!requiredStateSet.has(state)) {
        throw new SymbolAssetError(
          `Symbol state texture manifest declares unknown state "${state}".`,
        );
      }
    }
  }

  const animationStateSet = new Set(
    options.animationStates ?? statePreset.states.map((state) => state.id),
  );
  const stateDefinitions = new Map(
    statePreset.states.map((state) => [state.id, state] as const),
  );
  const rawSymbols = assertRecord(
    record.symbols,
    "symbol state texture manifest symbols",
  );
  const symbols: Record<string, ParsedSymbolManifestSymbol> = {};
  for (const [symbol, rawSymbol] of Object.entries(rawSymbols)) {
    const rawSymbolRecord = assertRecord(
      rawSymbol,
      `symbol state texture manifest symbol "${symbol}"`,
    );
    const allowedKeys = [
      "normal",
      "scale",
      "renderPriority",
      "animations",
      "valuePresentation",
      "imageStringNodes",
      "cascadeWinPresentation",
      ...states,
    ];
    assertOnlyKnownKeys(
      rawSymbolRecord,
      `symbol "${symbol}" manifest`,
      allowedKeys,
    );
    const hasExplicitScale = Object.prototype.hasOwnProperty.call(
      rawSymbolRecord,
      "scale",
    );
    const valuePresentation =
      rawSymbolRecord.valuePresentation === undefined
        ? undefined
        : parseValuePresentation(
            rawSymbolRecord.valuePresentation,
            symbol,
            states,
          );
    if (valuePresentation) {
      if (rawSymbolRecord.normal !== undefined) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" with valuePresentation must not declare top-level normal.`,
        );
      }
      for (const state of states) {
        if (rawSymbolRecord[state] !== undefined) {
          throw new SymbolAssetError(
            `Symbol "${symbol}" with valuePresentation must not declare top-level state "${state}".`,
          );
        }
      }
    }
    const parsedStates: Record<SymbolStateId, string> = valuePresentation
      ? { ...valuePresentation.reelStates.states }
      : {};
    if (!valuePresentation) {
      for (const state of states) {
        if (rawSymbolRecord[state] !== undefined) {
          parsedStates[state] = assertString(
            rawSymbolRecord[state],
            `symbol "${symbol}" ${state} texture`,
          );
        }
      }
    }
    const animations = parseManifestAnimations(
      rawSymbolRecord.animations,
      symbol,
      animationStateSet,
      stateDefinitions,
    );
    const imageStringNodes = parseImageStringNodes(
      rawSymbolRecord.imageStringNodes,
      symbol,
      stateDefinitions,
      animations,
    );
    if (valuePresentation) {
      const slotConflict = imageStringNodes.find(
        (node) => node.target.slot === valuePresentation.text.slot,
      );
      if (slotConflict) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" image-string node "${slotConflict.name}" conflicts with valuePresentation text slot "${valuePresentation.text.slot}".`,
        );
      }
    }
    if (
      Object.values(animations).some(
        (animation) => animation?.kind === "activeSpine",
      ) &&
      !valuePresentation
    ) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" activeSpine animations require valuePresentation.`,
      );
    }
    if (
      valuePresentation &&
      Object.values(animations).some(
        (animation) => animation?.kind !== "activeSpine",
      )
    ) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" valuePresentation animations must use activeSpine.`,
      );
    }
    const cascadeWinPresentation =
      rawSymbolRecord.cascadeWinPresentation === undefined
        ? undefined
        : parseCascadeWinPresentation(
            rawSymbolRecord.cascadeWinPresentation,
            symbol,
            stateDefinitions,
            animations,
          );
    symbols[symbol] = Object.freeze({
      normal:
        valuePresentation?.reelStates.normal ??
        parseManifestNormal(rawSymbolRecord.normal, symbol),
      states: Object.freeze(parsedStates),
      scale: parseManifestScale(rawSymbolRecord.scale, symbol),
      hasExplicitScale,
      renderPriority: parseManifestRenderPriority(
        rawSymbolRecord.renderPriority,
        symbol,
      ),
      animations,
      imageStringNodes,
      ...(valuePresentation !== undefined ? { valuePresentation } : {}),
      ...(cascadeWinPresentation !== undefined
        ? { cascadeWinPresentation }
        : {}),
    });
  }

  return Object.freeze({
    version: 1,
    states,
    statePreset,
    symbols: Object.freeze(symbols),
  });
}

function parseImageStringNodes(
  value: unknown,
  symbol: string,
  stateDefinitions: ReadonlyMap<string, SymbolStateDefinition>,
  animations: Readonly<
    Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>>
  >,
): readonly SymbolImageStringNodeSpec[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" imageStringNodes must be an array.`,
    );
  }
  const names = new Set<string>();
  return Object.freeze(
    value.map((rawNode, index) => {
      const label = `symbol "${symbol}" imageStringNodes[${index}]`;
      const node = assertRecord(rawNode, label);
      assertOnlyKnownKeys(node, label, [
        "name",
        "resource",
        "target",
        "initialText",
        "anchor",
        "transform",
        "followSlotColor",
      ]);
      const name = assertString(node.name, `${label}.name`);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
        throw new SymbolAssetError(
          `${label}.name must be lowercase ASCII kebab-case.`,
        );
      }
      if (names.has(name)) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" has duplicate imageString node name "${name}".`,
        );
      }
      names.add(name);
      const resource = assertString(node.resource, `${label}.resource`);
      if (
        !resource.startsWith("./") ||
        !resource.endsWith("/image-string.manifest.json")
      ) {
        throw new SymbolAssetError(
          `${label}.resource must be a canonical local path to image-string.manifest.json.`,
        );
      }
      try {
        resolvePackagePath("symbol-state-textures.manifest.json", resource);
      } catch (error) {
        throw new SymbolAssetError(
          `${label}.resource is invalid: ${formatUnknownError(error)}.`,
        );
      }
      const target = assertRecord(node.target, `${label}.target`);
      assertOnlyKnownKeys(target, `${label}.target`, ["state", "slot"]);
      const state = assertString(target.state, `${label}.target.state`);
      const slot = assertString(target.slot, `${label}.target.slot`);
      if (!stateDefinitions.has(state)) {
        throw new SymbolAssetError(
          `${label}.target.state references unknown state "${state}".`,
        );
      }
      if (animations[state]?.kind !== "spine") {
        throw new SymbolAssetError(
          `${label}.target.state must resolve to a Spine animation.`,
        );
      }
      const initialText = assertStringValue(
        node.initialText,
        `${label}.initialText`,
      );
      const anchorRecord = assertRecord(node.anchor, `${label}.anchor`);
      assertOnlyKnownKeys(anchorRecord, `${label}.anchor`, ["x", "y"]);
      let anchor: Readonly<{ x: number; y: number }>;
      try {
        anchor = validateImageStringAnchor({
          x: finiteNumber(anchorRecord.x, `${label}.anchor.x`),
          y: finiteNumber(anchorRecord.y, `${label}.anchor.y`),
        });
      } catch (error) {
        throw new SymbolAssetError(
          `${label}.anchor is invalid: ${formatUnknownError(error)}.`,
        );
      }
      const transformRecord = assertRecord(
        node.transform,
        `${label}.transform`,
      );
      assertOnlyKnownKeys(transformRecord, `${label}.transform`, [
        "x",
        "y",
        "scale",
      ]);
      const transform = Object.freeze({
        x: finiteNumber(transformRecord.x, `${label}.transform.x`),
        y: finiteNumber(transformRecord.y, `${label}.transform.y`),
        scale: finitePositiveNumber(
          transformRecord.scale,
          `${label}.transform.scale`,
        ),
      });
      if (typeof node.followSlotColor !== "boolean") {
        throw new SymbolAssetError(
          `${label}.followSlotColor must be a boolean.`,
        );
      }
      return Object.freeze({
        name,
        resource,
        target: Object.freeze({ state, slot }),
        initialText,
        anchor,
        transform,
        followSlotColor: node.followSlotColor,
      });
    }),
  );
}

function assertStringValue(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new SymbolAssetError(`${label} must be a string.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SymbolAssetError(`${label} must be a finite number.`);
  }
  return value;
}

function finitePositiveNumber(value: unknown, label: string): number {
  const parsed = finiteNumber(value, label);
  if (parsed <= 0) throw new SymbolAssetError(`${label} must be positive.`);
  return parsed;
}

function parseManifestStatePreset(
  settings: unknown,
  textureStates: readonly SymbolStateId[],
): SymbolStatePreset {
  const base = createDefaultSymbolStatePreset();
  if (settings === undefined) return base;
  const record = assertRecord(
    settings,
    "symbol state texture manifest settings",
  );
  assertOnlyKnownKeys(record, "symbol state texture manifest settings", [
    ...textureStates,
    "additionalStateDefinitions",
  ]);
  if (record.additionalStateDefinitions === undefined) return base;
  if (!Array.isArray(record.additionalStateDefinitions)) {
    throw new SymbolAssetError(
      "Symbol state texture manifest settings.additionalStateDefinitions must be an array.",
    );
  }
  const existingIds = new Set(base.states.map((state) => state.id));
  const additions = record.additionalStateDefinitions.map((value, index) => {
    const label = `symbol additional state definition[${index}]`;
    const definition = assertRecord(value, label);
    assertOnlyKnownKeys(definition, label, ["id", "phase", "playback"]);
    const id = assertString(definition.id, `${label}.id`);
    if (existingIds.has(id)) {
      throw new SymbolAssetError(
        `Symbol additional state "${id}" duplicates or overrides an existing state.`,
      );
    }
    const phase = definition.phase;
    const playback = definition.playback;
    if (
      !(
        (phase === "once" && playback === "once") ||
        (phase === "stable" && playback === "loop")
      )
    ) {
      throw new SymbolAssetError(
        `Symbol additional state "${id}" must be once/once or stable/loop.`,
      );
    }
    existingIds.add(id);
    return Object.freeze({ id, phase, playback }) as SymbolStateDefinition;
  });
  return Object.freeze({
    defaultState: base.defaultState,
    states: Object.freeze([...base.states, ...additions]),
    equivalences: base.equivalences,
  });
}

function parseCascadeWinPresentation(
  value: unknown,
  symbol: string,
  stateDefinitions: ReadonlyMap<string, SymbolStateDefinition>,
  animations: Readonly<
    Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>>
  >,
): SymbolCascadeWinPresentation {
  const label = `symbol "${symbol}" cascadeWinPresentation`;
  const record = assertRecord(value, label);
  assertOnlyKnownKeys(record, label, ["order", "playback", "summary"]);
  if (!Number.isSafeInteger(record.order) || (record.order as number) < 0) {
    throw new SymbolAssetError(
      `${label}.order must be a non-negative safe integer.`,
    );
  }
  const playbackRecord = assertRecord(record.playback, `${label}.playback`);
  const mode = playbackRecord.mode;
  let playback: SymbolCascadePlaybackPresentation;
  if (mode === "group") {
    assertOnlyKnownKeys(playbackRecord, `${label}.playback`, [
      "mode",
      "winState",
      "removeState",
    ]);
    const winState = parsePresentationState(
      playbackRecord.winState,
      `${label}.playback.winState`,
      "once",
      stateDefinitions,
      animations,
    );
    const removeState = parsePresentationState(
      playbackRecord.removeState,
      `${label}.playback.removeState`,
      "once",
      stateDefinitions,
      animations,
    );
    if (winState === removeState) {
      throw new SymbolAssetError(`${label} group states must be distinct.`);
    }
    playback = Object.freeze({ mode, winState, removeState });
  } else if (mode === "sequentialCollect") {
    assertOnlyKnownKeys(playbackRecord, `${label}.playback`, [
      "mode",
      "startState",
      "loopState",
      "collectState",
      "removeState",
    ]);
    const startState = parsePresentationState(
      playbackRecord.startState,
      `${label}.playback.startState`,
      "once",
      stateDefinitions,
      animations,
    );
    const loopState = parsePresentationState(
      playbackRecord.loopState,
      `${label}.playback.loopState`,
      "loop",
      stateDefinitions,
      animations,
    );
    const collectState = parsePresentationState(
      playbackRecord.collectState,
      `${label}.playback.collectState`,
      "once",
      stateDefinitions,
      animations,
    );
    const removeState = parsePresentationState(
      playbackRecord.removeState,
      `${label}.playback.removeState`,
      "once",
      stateDefinitions,
      animations,
    );
    if (
      new Set([startState, loopState, collectState, removeState]).size !== 4
    ) {
      throw new SymbolAssetError(
        `${label} sequential collect states must be distinct.`,
      );
    }
    playback = Object.freeze({
      mode,
      startState,
      loopState,
      collectState,
      removeState,
    });
  } else {
    throw new SymbolAssetError(
      `${label}.playback.mode must be "group" or "sequentialCollect".`,
    );
  }
  const summaryRecord = assertRecord(record.summary, `${label}.summary`);
  assertOnlyKnownKeys(summaryRecord, `${label}.summary`, ["mode"]);
  const summaryMode = summaryRecord.mode;
  if (
    (mode === "group" && summaryMode !== "groupAmount") ||
    (mode === "sequentialCollect" && summaryMode !== "itemAmount")
  ) {
    throw new SymbolAssetError(
      `${label}.summary.mode is incompatible with playback mode "${mode}".`,
    );
  }
  return Object.freeze({
    order: record.order as number,
    playback,
    summary: Object.freeze({
      mode: summaryMode as "groupAmount" | "itemAmount",
    }),
  });
}

function parsePresentationState(
  value: unknown,
  label: string,
  expectedPlayback: "once" | "loop",
  stateDefinitions: ReadonlyMap<string, SymbolStateDefinition>,
  animations: Readonly<
    Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>>
  >,
): SymbolStateId {
  const state = assertString(value, label);
  const definition = stateDefinitions.get(state);
  if (!definition) {
    throw new SymbolAssetError(`${label} references unknown state "${state}".`);
  }
  if (definition.playback !== expectedPlayback) {
    throw new SymbolAssetError(
      `${label} must reference a ${expectedPlayback} state.`,
    );
  }
  const animation = animations[state];
  if (!animation) {
    throw new SymbolAssetError(
      `${label} requires symbol animation capability "${state}".`,
    );
  }
  if (
    expectedPlayback === "loop" &&
    !(
      (animation.kind === "vni" ||
        animation.kind === "spine" ||
        animation.kind === "activeSpine") &&
      animation.playback.loop
    )
  ) {
    throw new SymbolAssetError(
      `${label} requires a looping VNI, Spine or activeSpine animation.`,
    );
  }
  return state;
}

export function createSymbolStatePresetFromManifest(
  manifest: unknown,
): SymbolStatePreset {
  return parseSymbolStateTextureManifest(manifest).statePreset;
}

export function createSymbolCascadeWinPresentationMapFromManifest(options: {
  readonly manifest: unknown;
  readonly displaySymbols?: readonly string[];
  readonly requiredStates?: readonly SymbolStateId[];
}): SymbolCascadeWinPresentationMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const symbols = options.displaySymbols ?? Object.keys(manifest.symbols);
  const entries = symbols.flatMap((symbol) => {
    const definition = manifest.symbols[symbol];
    if (!definition) {
      throw new SymbolAssetError(
        `Symbol state texture manifest is missing "${symbol}".`,
      );
    }
    return definition.cascadeWinPresentation
      ? ([[symbol, definition.cascadeWinPresentation]] as const)
      : [];
  });
  return Object.freeze(Object.fromEntries(entries));
}

function parseValuePresentation(
  value: unknown,
  symbol: string,
  states: readonly SymbolStateId[],
): SymbolValuePresentationSpec {
  const record = assertRecord(value, `symbol "${symbol}" valuePresentation`);
  assertOnlyKnownKeys(record, `symbol "${symbol}" valuePresentation`, [
    "defaultValues",
    "reelStates",
    "tiers",
    "text",
  ]);
  if (
    !Array.isArray(record.defaultValues) ||
    record.defaultValues.length === 0
  ) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" valuePresentation.defaultValues must be a non-empty array.`,
    );
  }
  const defaultValues = Object.freeze(
    record.defaultValues.map((candidate, index) => {
      if (
        typeof candidate !== "number" ||
        !Number.isSafeInteger(candidate) ||
        candidate <= 0
      ) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" valuePresentation.defaultValues[${index}] must be a positive safe integer.`,
        );
      }
      return candidate;
    }),
  );
  if (new Set(defaultValues).size !== defaultValues.length) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" valuePresentation.defaultValues must not contain duplicates.`,
    );
  }
  const rawReelStates = assertRecord(
    record.reelStates,
    `symbol "${symbol}" valuePresentation.reelStates`,
  );
  assertOnlyKnownKeys(
    rawReelStates,
    `symbol "${symbol}" valuePresentation.reelStates`,
    ["normal", ...states],
  );
  const normal = parseManifestNormal(rawReelStates.normal, symbol);
  if (typeof normal === "string" || normal.kind !== "transparent") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" valuePresentation.reelStates.normal must be transparent because normal art comes from tiers.`,
    );
  }
  const reelStateTextures: Record<SymbolStateId, string> = {};
  for (const state of states) {
    if (rawReelStates[state] !== undefined) {
      reelStateTextures[state] = assertString(
        rawReelStates[state],
        `symbol "${symbol}" valuePresentation.reelStates.${state}`,
      );
    }
  }
  if (!Array.isArray(record.tiers) || record.tiers.length === 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" valuePresentation.tiers must be a non-empty array.`,
    );
  }
  const rawTiers = record.tiers;
  let previousMax = 0;
  const tiers = Object.freeze(
    rawTiers.map((rawTier, index) => {
      const label = `symbol "${symbol}" valuePresentation tier ${index}`;
      const tier = assertRecord(rawTier, label);
      assertOnlyKnownKeys(tier, label, ["maxExclusive", "animation"]);
      const isLast = index === rawTiers.length - 1;
      if (isLast && tier.maxExclusive !== undefined) {
        throw new SymbolAssetError(`${label} must be unbounded.`);
      }
      if (!isLast && tier.maxExclusive === undefined) {
        throw new SymbolAssetError(`${label} must declare maxExclusive.`);
      }
      let maxExclusive: number | undefined;
      if (tier.maxExclusive !== undefined) {
        if (
          typeof tier.maxExclusive !== "number" ||
          !Number.isSafeInteger(tier.maxExclusive) ||
          tier.maxExclusive <= previousMax
        ) {
          throw new SymbolAssetError(
            `${label} maxExclusive must be a strictly increasing positive safe integer.`,
          );
        }
        maxExclusive = tier.maxExclusive;
        previousMax = maxExclusive;
      }
      const animation = parseManifestAnimationSpec(
        tier.animation,
        symbol,
        `valuePresentation.tiers[${index}]`,
        true,
      );
      if (
        animation.kind !== "spine" ||
        animation.playback.mode !== "animation" ||
        animation.playback.loop !== true
      ) {
        throw new SymbolAssetError(
          `${label} animation must be a looping Spine animation.`,
        );
      }
      return Object.freeze({
        ...(maxExclusive === undefined ? {} : { maxExclusive }),
        animation,
      });
    }),
  );
  const text = assertRecord(
    record.text,
    `symbol "${symbol}" valuePresentation.text`,
  );
  const textType = text.type ?? "font";
  if (textType !== "font" && textType !== "image") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" valuePresentation.text.type must be "font" or "image".`,
    );
  }
  const textBase = {
    slot: assertString(text.slot, "valuePresentation text slot"),
    x: assertFiniteNumber(text.x, "valuePresentation text x"),
    y: assertFiniteNumber(text.y, "valuePresentation text y"),
  };
  let parsedText: SymbolValuePresentationTextSpec;
  if (textType === "image") {
    assertOnlyKnownKeys(text, `symbol "${symbol}" valuePresentation.text`, [
      "type",
      "slot",
      "x",
      "y",
      "prefix",
    ]);
    parsedText = Object.freeze({
      ...textBase,
      type: "image",
      prefix: assertManifestPathPrefix(
        text.prefix,
        "valuePresentation image prefix",
      ),
    });
  } else {
    assertOnlyKnownKeys(text, `symbol "${symbol}" valuePresentation.text`, [
      "type",
      "slot",
      "x",
      "y",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fill",
      "stroke",
      "strokeWidth",
    ]);
    parsedText = Object.freeze({
      ...textBase,
      type: "font",
      fontFamily: assertString(text.fontFamily, "valuePresentation fontFamily"),
      fontSize: assertFinitePositiveNumber(
        text.fontSize,
        "valuePresentation fontSize",
      ),
      fontWeight: assertString(text.fontWeight, "valuePresentation fontWeight"),
      fill: assertString(text.fill, "valuePresentation fill"),
      stroke: assertString(text.stroke, "valuePresentation stroke"),
      strokeWidth: assertFinitePositiveNumber(
        text.strokeWidth,
        "valuePresentation strokeWidth",
      ),
    });
  }
  return Object.freeze({
    defaultValues,
    reelStates: Object.freeze({
      normal,
      states: Object.freeze(reelStateTextures),
    }),
    tiers,
    text: parsedText,
  });
}

export function createSymbolValuePresentationImagePath(
  text: SymbolValuePresentationImageTextSpec,
  value: number,
): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SymbolAssetError(
      "Symbol value presentation image value must be a positive safe integer.",
    );
  }
  return `${text.prefix}${value}.png`;
}

export function getSymbolDisplaySymbolsFromManifest(
  manifest: unknown,
  options: ParseSymbolStateTextureManifestOptions = {},
): readonly string[] {
  const parsed = parseSymbolStateTextureManifest(manifest, options);
  return Object.freeze(Object.keys(parsed.symbols));
}

export function createSymbolAssetMapFromManifestModules(
  options: CreateSymbolAssetMapFromManifestModulesOptions,
): SymbolAssetMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const requiredStates = Object.freeze([...(options.requiredStates ?? [])]);
  const displaySymbols = Object.freeze([
    ...(options.displaySymbols ?? Object.keys(manifest.symbols)),
  ]);
  const assets: Record<string, SymbolAssetInput> = {};

  for (const symbol of displaySymbols) {
    const manifestSymbol = manifest.symbols[symbol];
    if (!manifestSymbol) {
      throw new SymbolAssetError(
        `Symbol state texture manifest is missing "${symbol}".`,
      );
    }
    const normal = createNormalAssetFromManifest(
      symbol,
      manifestSymbol.normal,
      options.modules,
    );
    const states: Record<string, string> = {};
    for (const [state, manifestStatePath] of Object.entries(
      manifestSymbol.states,
    )) {
      const stateAsset = resolveManifestModule(
        options.modules,
        manifestStatePath,
        `Symbol "${symbol}" state "${state}" texture`,
      );
      states[state] = stateAsset;
    }
    for (const state of requiredStates) {
      const manifestStatePath = manifestSymbol.states[state];
      if (!manifestStatePath) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" manifest is missing state "${state}".`,
        );
      }
      states[state] = resolveManifestModule(
        options.modules,
        manifestStatePath,
        `Symbol "${symbol}" required state "${state}" texture`,
      );
    }
    assets[symbol] = Object.freeze({
      normal,
      states: Object.freeze(states),
    });
  }

  if (options.includeUnmanifestedNormalAssets) {
    const split = splitSymbolPngModules(options.modules, manifest.states);
    for (const [symbol, normal] of Object.entries(split.normalAssets)) {
      if (!manifest.symbols[symbol]) {
        assets[symbol] = Object.freeze({
          normal,
          states: Object.freeze({}),
        });
      }
    }
  }

  return Object.freeze(assets);
}

export function createSymbolScaleMapFromManifest(
  options: CreateSymbolScaleMapFromManifestOptions,
): ReelSymbolScaleMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const displaySymbols = Object.freeze([
    ...(options.displaySymbols ?? Object.keys(manifest.symbols)),
  ]);
  const entries = displaySymbols.map((symbol) => {
    const manifestSymbol = manifest.symbols[symbol];
    if (!manifestSymbol) {
      throw new SymbolAssetError(
        `Symbol state texture manifest is missing "${symbol}".`,
      );
    }
    if (options.requireExplicitScale && !manifestSymbol.hasExplicitScale) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" manifest must explicitly declare scale.`,
      );
    }
    return [symbol, manifestSymbol.scale] as const;
  });
  return Object.freeze(
    Object.fromEntries(entries),
  ) satisfies ReelSymbolScaleMap;
}

export function createSymbolRenderPriorityMapFromManifest(
  options: CreateSymbolRenderPriorityMapFromManifestOptions,
): ReelSymbolRenderPriorityMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const displaySymbols = Object.freeze([
    ...(options.displaySymbols ?? Object.keys(manifest.symbols)),
  ]);
  const entries = displaySymbols.map((symbol) => {
    const manifestSymbol = manifest.symbols[symbol];
    if (!manifestSymbol) {
      throw new SymbolAssetError(
        `Symbol state texture manifest is missing "${symbol}".`,
      );
    }
    return [symbol, manifestSymbol.renderPriority] as const;
  });
  return Object.freeze(
    Object.fromEntries(entries),
  ) satisfies ReelSymbolRenderPriorityMap;
}

export function createSymbolAnimationCapabilityMapFromManifest(
  options: CreateSymbolAnimationCapabilityMapFromManifestOptions,
): Readonly<Record<string, readonly SymbolStateId[]>> {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const displaySymbols =
    options.displaySymbols ?? Object.keys(manifest.symbols);
  return Object.freeze(
    Object.fromEntries(
      displaySymbols.map((symbol) => {
        const entry = manifest.symbols[symbol];
        if (!entry) {
          throw new SymbolAssetError(
            `Symbol state texture manifest is missing "${symbol}".`,
          );
        }
        return [symbol, Object.freeze(Object.keys(entry.animations))];
      }),
    ),
  );
}

export function createSymbolLandingAppearSymbolsFromManifest(
  options: CreateSymbolLandingAppearSymbolsFromManifestOptions,
): readonly string[] {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const displaySymbols = Object.freeze([
    ...(options.displaySymbols ?? Object.keys(manifest.symbols)),
  ]);
  return Object.freeze(
    displaySymbols.filter((symbol) => {
      const manifestSymbol = manifest.symbols[symbol];
      if (!manifestSymbol) {
        throw new SymbolAssetError(
          `Symbol state texture manifest is missing "${symbol}".`,
        );
      }
      return manifestSymbol.animations.appear !== undefined;
    }),
  );
}

export function createSymbolVniAnimationResourcesFromManifest(
  options: CreateSymbolVniAnimationResourcesOptions,
): SymbolVniAnimationResourceMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const assetUrlManifest = createAssetUrlManifest({
    ...options.vniAssetModules,
  });
  const resources: Record<
    string,
    Partial<Record<SymbolStateId, SymbolVniAnimationResource>>
  > = {};

  for (const [symbol, manifestSymbol] of Object.entries(manifest.symbols)) {
    for (const [state, animation] of Object.entries(
      manifestSymbol.animations,
    )) {
      if (!animation || animation.kind !== "vni") {
        continue;
      }
      const rawProject = resolveManifestModule(
        options.vniProjectModules,
        animation.project,
        `Symbol "${symbol}" ${state} VNI project`,
      );
      const project = assertVNIProject(rawProject);
      const assetUrls = resolveProjectAssetUrls(project, assetUrlManifest);
      resources[symbol] = resources[symbol] ?? {};
      resources[symbol][state] = Object.freeze({
        symbol,
        state,
        spec: animation,
        project,
        assetUrls,
      });
    }
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(resources).map(([symbol, states]) => [
        symbol,
        Object.freeze({ ...states }),
      ]),
    ),
  );
}

export function createSymbolSpineAnimationResourcesFromManifest(
  options: CreateSymbolSpineAnimationResourcesOptions,
): SymbolSpineAnimationResourceMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const resources: Record<
    string,
    Partial<Record<SymbolStateId, SymbolSpineAnimationResource>>
  > = {};

  for (const [symbol, manifestSymbol] of Object.entries(manifest.symbols)) {
    for (const [state, animation] of Object.entries(
      manifestSymbol.animations,
    )) {
      if (!animation || animation.kind !== "spine") {
        continue;
      }
      const skeleton = resolveManifestModule(
        options.spineSkeletonModules,
        animation.skeleton,
        `Symbol "${symbol}" ${state} Spine skeleton`,
      );
      const atlas = resolveManifestModule(
        options.spineAtlasModules,
        animation.atlas,
        `Symbol "${symbol}" ${state} Spine atlas`,
      );
      if (typeof atlas !== "string" || atlas.trim().length === 0) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" ${state} Spine atlas module must be raw text.`,
        );
      }
      const texture = resolveManifestModule(
        options.spineTextureModules,
        animation.texture,
        `Symbol "${symbol}" ${state} Spine texture`,
      );
      if (typeof texture !== "string" || texture.trim().length === 0) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" ${state} Spine texture is missing from modules: ${animation.texture}.`,
        );
      }

      const atlasPage = validateSpineAtlasAndSkeleton({
        symbol,
        state,
        spec: animation,
        skeleton,
        atlasText: atlas,
        requiredSlots: manifestSymbol.imageStringNodes
          .filter((node) => node.target.state === state)
          .map((node) => node.target.slot),
      });
      resources[symbol] = resources[symbol] ?? {};
      resources[symbol][state] = Object.freeze({
        symbol,
        state,
        spec: animation,
        skeleton,
        atlasText: atlas,
        textureUrl: texture,
        atlasPage,
      });
    }
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(resources).map(([symbol, states]) => [
        symbol,
        Object.freeze({ ...states }),
      ]),
    ),
  );
}

function splitSymbolPngModules(
  modules: Readonly<Record<string, string>>,
  allowedStates: readonly string[],
): SplitSymbolPngModulesResult {
  const normalAssets: Record<string, string> = {};
  const stateAssets: Record<string, Record<string, string>> = {};
  const assetsByFileName: Record<string, string> = {};
  const allowedStateSet = new Set(allowedStates);

  for (const [modulePath, url] of Object.entries(modules)) {
    const filename = getFileNameFromPath(modulePath);
    if (!filename.endsWith(".png")) {
      continue;
    }
    if (assetsByFileName[filename] !== undefined) {
      throw new SymbolAssetError(
        `Duplicate symbol texture filename in modules: ${filename}.`,
      );
    }
    assetsByFileName[filename] = url;

    const stem = filename.slice(0, -".png".length);
    if (isLayerFileStem(stem)) {
      continue;
    }

    const parts = stem.split(".");
    if (parts.length === 1) {
      normalAssets[parts[0]] = url;
      continue;
    }

    if (parts.length === 2) {
      const [symbol, state] = parts;
      if (!allowedStateSet.has(state)) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" declares texture for unknown state "${state}".`,
        );
      }
      stateAssets[symbol] = stateAssets[symbol] ?? {};
      stateAssets[symbol][state] = url;
      continue;
    }

    throw new SymbolAssetError(
      `Cannot parse symbol texture filename "${filename}".`,
    );
  }

  return Object.freeze({
    normalAssets: Object.freeze(normalAssets),
    stateAssets: Object.freeze(
      Object.fromEntries(
        Object.entries(stateAssets).map(([symbol, states]) => [
          symbol,
          Object.freeze(states),
        ]),
      ),
    ),
    assetsByFileName: Object.freeze(assetsByFileName),
  });
}

function createNormalAssetFromManifest(
  symbol: string,
  normal: SymbolManifestNormal,
  modules: Readonly<Record<string, string>>,
): string | SymbolNormalTextureSource<string> {
  if (typeof normal === "string") {
    return resolveManifestModule(
      modules,
      normal,
      `Symbol "${symbol}" normal texture`,
    );
  }

  if (normal.kind === "transparent") {
    return normal;
  }

  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(
      normal.layers.map((layer) =>
        createLayerAssetFromManifestLayer(symbol, layer, modules),
      ),
    ),
  });
}

function createLayerAssetFromManifestLayer(
  symbol: string,
  layer: SymbolManifestLayer,
  modules: Readonly<Record<string, string>>,
): SymbolLayerTextureSource<string> {
  const texture = resolveManifestModule(
    modules,
    layer.texture,
    `Symbol "${symbol}" layer ${layer.index} texture`,
  );
  const keyframes = layer.keyframes.map((keyframePath) => {
    return resolveManifestModule(
      modules,
      keyframePath,
      `Symbol "${symbol}" layer ${layer.index} keyframe`,
    );
  });
  return Object.freeze({
    index: layer.index,
    texture,
    ...(keyframes.length > 0 ? { keyframes: Object.freeze(keyframes) } : {}),
  });
}

function parseManifestNormal(
  normal: unknown,
  symbol: string,
): SymbolManifestNormal {
  if (typeof normal === "string") {
    return normal;
  }
  const record = assertRecord(normal, `symbol "${symbol}" normal texture`);
  if (record.kind === "transparent") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" transparent normal`, [
      "kind",
      "width",
      "height",
    ]);
    return Object.freeze({
      kind: "transparent",
      width: assertFinitePositiveNumber(
        record.width,
        `symbol "${symbol}" transparent normal.width`,
      ),
      height: assertFinitePositiveNumber(
        record.height,
        `symbol "${symbol}" transparent normal.height`,
      ),
    });
  }

  assertOnlyKnownKeys(record, `symbol "${symbol}" layered normal`, [
    "kind",
    "layers",
  ]);
  if (record.kind !== "layered") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" manifest normal texture must be a string, layered normal or transparent normal.`,
    );
  }
  if (!Array.isArray(record.layers) || record.layers.length === 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layered normal texture must include layers.`,
    );
  }
  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(
      record.layers.map((layer, index) =>
        parseManifestLayer(layer, symbol, index),
      ),
    ),
  });
}

function parseManifestLayer(
  value: unknown,
  symbol: string,
  index: number,
): SymbolManifestLayer {
  if (typeof value === "string") {
    return Object.freeze({
      index: parseLayerIndexFromManifestPath(symbol, value),
      texture: value,
      keyframes: Object.freeze([]),
    });
  }
  const record = assertRecord(
    value,
    `symbol "${symbol}" normal layer ${index}`,
  );
  assertOnlyKnownKeys(record, `symbol "${symbol}" normal layer ${index}`, [
    "index",
    "texture",
    "keyframes",
  ]);
  if (!Number.isInteger(record.index) || (record.index as number) < 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layer index must be a non-negative integer.`,
    );
  }
  const keyframes =
    record.keyframes === undefined
      ? []
      : assertStringArray(
          record.keyframes,
          `symbol "${symbol}" layer keyframes`,
        );
  const texture = assertString(
    record.texture,
    `symbol "${symbol}" layer texture`,
  );
  if (keyframes.length > 0 && keyframes[0] !== texture) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layer ${record.index} keyframes must start with the layer texture.`,
    );
  }
  return Object.freeze({
    index: record.index as number,
    texture,
    keyframes: Object.freeze(keyframes),
  });
}

function parseLayerIndexFromManifestPath(symbol: string, path: string): number {
  const fileName = getFileNameFromManifestPath(path);
  const match = fileName.match(
    new RegExp(`^${escapeRegExp(symbol)}-(\\d+)\\.png$`, "u"),
  );
  if (!match) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" composite layer file "${fileName}" must match ${symbol}-{index}.png.`,
    );
  }
  return Number.parseInt(match[1], 10);
}

function parseManifestScale(scale: unknown, symbol: string): number {
  if (scale === undefined) {
    return 1;
  }
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" manifest scale must be a finite positive number.`,
    );
  }
  return scale;
}

function parseManifestRenderPriority(
  renderPriority: unknown,
  symbol: string,
): number {
  if (renderPriority === undefined) {
    return 0;
  }
  if (
    typeof renderPriority !== "number" ||
    !Number.isSafeInteger(renderPriority) ||
    renderPriority < 0
  ) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" renderPriority must be a non-negative safe integer.`,
    );
  }
  return renderPriority;
}

function parseManifestAnimations(
  animations: unknown,
  symbol: string,
  animationStateSet: ReadonlySet<string>,
  stateDefinitions: ReadonlyMap<string, SymbolStateDefinition>,
): Readonly<Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>>> {
  if (animations === undefined) {
    return Object.freeze({});
  }
  const record = assertRecord(animations, `symbol "${symbol}" animations`);
  const parsed: Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>> =
    {};
  for (const [state, animation] of Object.entries(record)) {
    if (!animationStateSet.has(state)) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" declares animation for unknown state "${state}".`,
      );
    }
    parsed[state] = parseManifestAnimationSpec(
      animation,
      symbol,
      state,
      false,
      stateDefinitions.get(state)?.playback,
    );
  }
  return Object.freeze(parsed);
}

function parseManifestAnimationSpec(
  value: unknown,
  symbol: string,
  state: string,
  allowLoopingOnceState = false,
  expectedPlaybackOverride?: SymbolPlaybackKind,
): SymbolManifestAnimationSpec {
  const record = assertRecord(value, `symbol "${symbol}" ${state} animation`);
  if (record.kind === "builtin") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
      "kind",
      "durationSeconds",
    ]);
    return Object.freeze({
      kind: "builtin",
      durationSeconds: assertFinitePositiveNumber(
        record.durationSeconds,
        `symbol "${symbol}" ${state} animation.durationSeconds`,
      ),
    });
  }
  if (record.kind === "static") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
      "kind",
      "durationSeconds",
    ]);
    return Object.freeze({
      kind: "static",
      durationSeconds: assertFinitePositiveNumber(
        record.durationSeconds,
        `symbol "${symbol}" ${state} animation.durationSeconds`,
      ),
    });
  }
  if (record.kind === "empty") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
      "kind",
      "durationSeconds",
    ]);
    return Object.freeze({
      kind: "empty",
      durationSeconds: assertFinitePositiveNumber(
        record.durationSeconds,
        `symbol "${symbol}" ${state} animation.durationSeconds`,
      ),
    });
  }
  if (record.kind === "activeSpine") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
      "kind",
      "playback",
    ]);
    const playback = parseAnimationPlayback(record.playback, symbol, state);
    const expectedPlayback =
      expectedPlaybackOverride ?? getDefaultSymbolPlaybackKind(state);
    if (expectedPlayback === "once" && playback.loop) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" ${state} activeSpine playback.loop must be false for once state "${state}".`,
      );
    }
    if (expectedPlayback === "loop" && !playback.loop) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" ${state} activeSpine playback.loop must be true for loop state "${state}".`,
      );
    }
    return Object.freeze({ kind: "activeSpine", playback });
  }
  if (record.kind === "spine") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
      "kind",
      "skeleton",
      "atlas",
      "texture",
      "playback",
      "transform",
    ]);
    const playback = parseAnimationPlayback(record.playback, symbol, state);
    if (
      !allowLoopingOnceState &&
      (expectedPlaybackOverride ?? getDefaultSymbolPlaybackKind(state)) ===
        "once" &&
      playback.loop
    ) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" ${state} Spine playback.loop must be false for once state "${state}".`,
      );
    }
    if (
      (expectedPlaybackOverride ?? getDefaultSymbolPlaybackKind(state)) ===
        "loop" &&
      !playback.loop
    ) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" ${state} Spine playback.loop must be true for loop state "${state}".`,
      );
    }
    return Object.freeze({
      kind: "spine",
      skeleton: assertManifestLocalFilePath(
        record.skeleton,
        `symbol "${symbol}" ${state} Spine skeleton`,
        [".json"],
      ),
      atlas: assertManifestLocalFilePath(
        record.atlas,
        `symbol "${symbol}" ${state} Spine atlas`,
        [".atlas"],
      ),
      texture: assertManifestLocalFilePath(
        record.texture,
        `symbol "${symbol}" ${state} Spine texture`,
        [".png"],
      ),
      playback,
      ...(record.transform !== undefined
        ? {
            transform: parseSpineTransform(record.transform, symbol, state),
          }
        : {}),
    });
  }
  if (record.kind !== "vni") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} animation kind must be "builtin", "static", "empty", "vni", "spine" or "activeSpine".`,
    );
  }
  assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
    "kind",
    "project",
    "playback",
  ]);
  const playback = parseRangePlayback(record.playback, symbol, state);
  const expectedPlayback =
    expectedPlaybackOverride ?? getDefaultSymbolPlaybackKind(state);
  if (!allowLoopingOnceState && expectedPlayback === "once" && playback.loop) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} VNI playback.loop must be false for once state "${state}".`,
    );
  }
  if (expectedPlayback === "loop" && !playback.loop) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} VNI playback.loop must be true for loop state "${state}".`,
    );
  }
  return Object.freeze({
    kind: "vni",
    project: assertString(
      record.project,
      `symbol "${symbol}" ${state} VNI project`,
    ),
    playback,
  });
}

function parseRangePlayback(
  value: unknown,
  symbol: string,
  state: string,
): SymbolManifestRangePlaybackSpec {
  const record = assertRecord(value, `symbol "${symbol}" ${state} playback`);
  assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} playback`, [
    "mode",
    "startTime",
    "endTime",
    "loop",
  ]);
  if (record.mode !== "range") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} VNI playback mode must be "range".`,
    );
  }
  const startTime = assertFiniteNonNegativeNumber(
    record.startTime,
    `symbol "${symbol}" ${state} VNI playback.startTime`,
  );
  const endTime = assertFinitePositiveNumber(
    record.endTime,
    `symbol "${symbol}" ${state} VNI playback.endTime`,
  );
  if (endTime <= startTime) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} VNI playback.endTime must be greater than startTime.`,
    );
  }
  if (typeof record.loop !== "boolean") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} VNI playback.loop must be a boolean.`,
    );
  }
  return Object.freeze({
    mode: "range",
    startTime,
    endTime,
    loop: record.loop,
  });
}

function parseAnimationPlayback(
  value: unknown,
  symbol: string,
  state: string,
): SymbolManifestAnimationPlaybackSpec {
  const record = assertRecord(value, `symbol "${symbol}" ${state} playback`);
  assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} playback`, [
    "mode",
    "animationName",
    "loop",
  ]);
  if (record.mode !== "animation") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} Spine playback mode must be "animation".`,
    );
  }
  if (typeof record.loop !== "boolean") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} Spine playback.loop must be a boolean.`,
    );
  }
  return Object.freeze({
    mode: "animation",
    animationName: assertString(
      record.animationName,
      `symbol "${symbol}" ${state} Spine playback.animationName`,
    ),
    loop: record.loop,
  });
}

function parseSpineTransform(
  value: unknown,
  symbol: string,
  state: string,
): SymbolManifestSpineAnimationTransform {
  const record = assertRecord(
    value,
    `symbol "${symbol}" ${state} Spine transform`,
  );
  assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} Spine transform`, [
    "x",
    "y",
    "scale",
  ]);
  return Object.freeze({
    ...(record.x !== undefined
      ? {
          x: assertFiniteNumber(
            record.x,
            `symbol "${symbol}" ${state} Spine transform.x`,
          ),
        }
      : {}),
    ...(record.y !== undefined
      ? {
          y: assertFiniteNumber(
            record.y,
            `symbol "${symbol}" ${state} Spine transform.y`,
          ),
        }
      : {}),
    ...(record.scale !== undefined
      ? {
          scale: assertFinitePositiveNumber(
            record.scale,
            `symbol "${symbol}" ${state} Spine transform.scale`,
          ),
        }
      : {}),
  });
}

function validateSpineAtlasAndSkeleton(options: {
  readonly symbol: string;
  readonly state: string;
  readonly spec: SymbolManifestSpineAnimationSpec;
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly requiredSlots?: readonly string[];
}): string {
  try {
    readSupportedSpineSkeletonVersion(options.skeleton);
  } catch (error) {
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine skeleton version is invalid: ${formatUnknownError(error)}.`,
    );
  }
  return validateOfficialSpineAtlasAndSkeleton(options);
}

function validateOfficialSpineAtlasAndSkeleton(options: {
  readonly symbol: string;
  readonly state: string;
  readonly spec: SymbolManifestSpineAnimationSpec;
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly requiredSlots?: readonly string[];
}): string {
  let atlas: TextureAtlas;
  try {
    atlas = new TextureAtlas(options.atlasText);
  } catch (error) {
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine atlas failed to parse: ${formatUnknownError(error)}.`,
    );
  }
  if (atlas.pages.length !== 1 || !atlas.pages[0]?.name) {
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine atlas must contain exactly one named page.`,
    );
  }
  const atlasPage = atlas.pages[0].name;
  const textureFileName = getFileNameFromManifestPath(options.spec.texture);
  if (atlasPage !== textureFileName) {
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine atlas page "${atlasPage}" must match texture "${textureFileName}".`,
    );
  }

  try {
    const skeletonData = new SkeletonJson(
      new AtlasAttachmentLoader(atlas),
    ).readSkeletonData(options.skeleton);
    if (!skeletonData.findAnimation(options.spec.playback.animationName)) {
      throw new Error(
        `missing animation "${options.spec.playback.animationName}"`,
      );
    }
    for (const slot of options.requiredSlots ?? []) {
      if (!skeletonData.findSlot(slot)) {
        throw new Error(`missing slot "${slot}"`);
      }
    }
  } catch (error) {
    const message = formatUnknownError(error);
    if (message.includes(`missing animation "`)) {
      throw new SymbolAssetError(
        `Symbol "${options.symbol}" ${options.state} Spine skeleton is ${message}.`,
      );
    }
    if (message.includes(`missing slot "`)) {
      throw new SymbolAssetError(
        `Symbol "${options.symbol}" ${options.state} Spine skeleton is ${message}.`,
      );
    }
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine skeleton failed to parse: ${message}.`,
    );
  }

  return atlasPage;
}

function resolveManifestModule<T>(
  modules: Readonly<Record<string, T>>,
  manifestPath: string,
  label: string,
): T {
  getFileNameFromManifestPath(manifestPath);
  const wanted = manifestPath.slice(2);
  const matches = Object.entries(modules).filter(([modulePath]) => {
    const normalized = modulePath.replaceAll("\\", "/").replace(/^\.\//u, "");
    return normalized === wanted || normalized.endsWith(`/${wanted}`);
  });
  if (matches.length === 0) {
    throw new SymbolAssetError(
      `${label} is missing from modules: ${manifestPath}.`,
    );
  }
  if (matches.length > 1) {
    throw new SymbolAssetError(`${label} path is ambiguous: ${manifestPath}.`);
  }
  return matches[0]![1];
}

function getDefaultSymbolStateIds(): readonly SymbolStateId[] {
  return createDefaultSymbolStatePreset().states.map((state) => state.id);
}

function getDefaultSymbolPlaybackKind(stateId: string): SymbolPlaybackKind {
  const state = createDefaultSymbolStatePreset().states.find(
    (candidate) => candidate.id === stateId,
  );
  return state?.playback ?? "once";
}

function getFileNameFromPath(path: string): string {
  const fileName = path.split(/[\\/]/u).at(-1);
  if (!fileName) {
    throw new SymbolAssetError(`Cannot extract filename from path "${path}".`);
  }
  return fileName;
}

function getFileNameFromManifestPath(path: string): string {
  if (!path.startsWith("./") || path.includes("\\") || path.includes("../")) {
    throw new SymbolAssetError(
      `Manifest texture path must be a local ./ path: ${path}.`,
    );
  }
  return getFileNameFromPath(path);
}

function assertManifestLocalFilePath(
  value: unknown,
  label: string,
  extensions: readonly string[],
): string {
  const path = assertString(value, label);
  if (!path.startsWith("./") || path.includes("\\") || path.includes("../")) {
    throw new SymbolAssetError(`${label} must be a local ./ path: ${path}.`);
  }
  const suffix = path.slice("./".length);
  if (suffix.includes("/") || suffix.length === 0) {
    throw new SymbolAssetError(`${label} must be a ./basename path: ${path}.`);
  }
  if (!extensions.some((extension) => suffix.endsWith(extension))) {
    throw new SymbolAssetError(
      `${label} must end with ${extensions.join(" or ")}: ${path}.`,
    );
  }
  return path;
}

function assertManifestPathPrefix(value: unknown, label: string): string {
  const prefix = assertString(value, label);
  if (
    !prefix.startsWith("./") ||
    prefix.includes("\\") ||
    prefix.includes("../") ||
    prefix.slice(2).includes("/")
  ) {
    throw new SymbolAssetError(
      `${label} must be a local ./basename prefix: ${prefix}.`,
    );
  }
  return prefix;
}

function isLayerFileStem(stem: string): boolean {
  return /^.+\.layer\d+(?:\.frame\d+)?$/u.test(stem);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SymbolAssetError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  label: string,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new SymbolAssetError(`${label} declares unknown field "${key}".`);
    }
  }
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SymbolAssetError(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new SymbolAssetError(`${label} must be an array.`);
  }
  return Object.freeze(
    value.map((item, index) => assertString(item, `${label}[${index}]`)),
  );
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new SymbolAssetError(
        `${label} contains duplicate value "${value}".`,
      );
    }
    seen.add(value);
  }
}

function assertFiniteNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SymbolAssetError(
      `${label} must be a finite non-negative number.`,
    );
  }
  return value;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SymbolAssetError(`${label} must be a finite number.`);
  }
  return value;
}

function assertFinitePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new SymbolAssetError(`${label} must be a finite positive number.`);
  }
  return value;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function getSymbolPlaybackKindForManifestAnimation(
  spec: SymbolManifestAnimationSpec,
): SymbolPlaybackKind {
  if (
    spec.kind === "builtin" ||
    spec.kind === "static" ||
    spec.kind === "empty" ||
    spec.kind === "vni" ||
    spec.kind === "spine" ||
    spec.kind === "activeSpine"
  ) {
    return (spec.kind === "vni" ||
      spec.kind === "spine" ||
      spec.kind === "activeSpine") &&
      spec.playback.loop
      ? "loop"
      : "once";
  }
  throw new SymbolAssetError(`Unsupported symbol manifest animation kind.`);
}
