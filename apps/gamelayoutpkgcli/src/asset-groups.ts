import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string/data";
import { assertVNIProject } from "@slotclientengine/vnicore/data";
import {
  collectMappedPopupAssetKeys,
  parsePopupManifest,
} from "@slotclientengine/rendercore/popup/data";
import type {
  SceneLayoutManifest,
  SceneLayoutNode,
} from "@slotclientengine/rendercore/scene-layout/data";
import {
  collectSymbolPackageEntryPaths,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol/data";
import { collectPackageAudioAssets } from "./audio-assets.js";
import { parseJson } from "./package-reader.js";
import { encodeStableJson } from "./reference-rewriter.js";
import type {
  AudioOptimizationOptions,
  AudioOptimizationResult,
  AssetGroupRecord,
  OptimizedLogicalAsset,
  SceneLayoutAssetGroups,
  SceneLayoutAssetGroupsV2,
  WrittenOptimizedPackage,
} from "./types.js";

type ProvisionalAssetGroup = AssetGroupRecord extends infer Group
  ? Group extends AssetGroupRecord
    ? Omit<Group, "incrementalAssets">
    : never
  : never;

export function createSceneLayoutAssetGroups(options: {
  readonly manifest: SceneLayoutManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly sourceZipBytes: number;
  readonly output: WrittenOptimizedPackage;
  readonly quality: number;
  readonly cwebpVersion: string;
  readonly convertedImageCount: number;
  readonly audioOptimization: AudioOptimizationResult;
  readonly audioOptions: AudioOptimizationOptions;
}): SceneLayoutAssetGroupsV2 {
  const gameModes = options.manifest.gameModes;
  if (!gameModes) throw new Error("资源分组要求 Scene Layout gameModes。");
  const allBackgroundIds = new Set(
    options.manifest.version === 7
      ? []
      : gameModes.modes.flatMap((mode) =>
          "backgroundNodes" in mode
            ? Object.values(mode.backgroundNodes ?? {})
            : [],
        ),
  );
  const sharedNodes = options.manifest.nodes.filter((node) =>
    options.manifest.version === 7
      ? node.scope === undefined
      : !allBackgroundIds.has(node.id) && node.gameMode === undefined,
  );
  const sharedRequired = nodeClosure(sharedNodes, options.files);
  const audioAssets = collectPackageAudioAssets(
    options.manifest,
    options.files,
  );
  const provisional: ProvisionalAssetGroup[] = [
    {
      id: "shared",
      kind: "shared",
      requiredAssets: sharedRequired,
    },
  ];
  if (audioAssets.length) {
    provisional.push({
      id: "audio:scene-layout",
      kind: "audio",
      owner: "scene-layout",
      usedByModes: sortUnique(
        gameModes.modes
          .filter((mode) => "bgm" in mode && mode.bgm !== undefined)
          .map((mode) => mode.id),
      ),
      requiredAssets: audioAssets,
    });
  }
  for (const [resourceKey, resource] of Object.entries(
    options.manifest.runtimeResources ?? {},
  ))
    provisional.push({
      id: `runtime-resource:${resourceKey}`,
      kind: "runtime-resource",
      resourceKey,
      resourceKind: resource.kind,
      requiredAssets: runtimeResourceClosure(resource, options.files),
    });
  for (const mode of gameModes.modes) {
    const nodeIds = new Set(
      "backgroundNodes" in mode
        ? Object.values(mode.backgroundNodes ?? {})
        : [],
    );
    const nodes = options.manifest.nodes.filter(
      (node) =>
        nodeIds.has(node.id) ||
        sharedNodes.includes(node) ||
        node.gameMode === mode.id ||
        Boolean(node.scope?.[mode.id]),
    );
    provisional.push({
      id: `mode:${mode.id}`,
      kind: "mode",
      modeId: mode.id,
      initial: mode.id === gameModes.initialMode,
      requiredAssets: nodeClosure(nodes, options.files),
    });
  }
  for (const transition of gameModes.transitions ?? []) {
    const preludePopup =
      "preludePopup" in transition ? transition.preludePopup : undefined;
    const preludeAssets = preludePopup
      ? popupClosure(preludePopup, options.manifest, options.files)
      : [];
    provisional.push({
      id: `transition:${transition.from}->${transition.to}`,
      kind: "transition",
      ownerMode: transition.from,
      from: transition.from,
      to: transition.to,
      requiredAssets: sortUnique([
        ...("kind" in transition.overlay
          ? []
          : transition.overlay.resource.kind === "video"
            ? [transition.overlay.resource.path]
            : [
                transition.overlay.resource.skeleton,
                transition.overlay.resource.atlas,
                ...Object.values(transition.overlay.resource.textures),
              ]),
        ...preludeAssets,
      ]),
    });
  }

  for (const binding of symbolBindings(options.manifest, options.files)) {
    const nested = parseSymbolPackageManifest(
      parseRequiredJson(options.files, binding.manifest),
    );
    provisional.push({
      id: `symbols:${binding.id}`,
      kind: "symbols",
      packageId: binding.id,
      usedByModes: sortUnique(
        gameModes.modes
          .filter((mode) => mode.symbolPackage === binding.id)
          .map((mode) => mode.id),
      ),
      requiredAssets: sortUnique(
        collectSymbolPackageEntryPaths(nested).map((path) =>
          path === "symbols.package.json" ? binding.manifest : path,
        ),
      ),
    });
  }
  for (const [popupId, binding] of Object.entries(
    options.manifest.popups ?? {},
  )) {
    const nested = parsePopupManifest(
      parseRequiredJson(options.files, binding.manifest),
    );
    if (nested.type !== binding.type)
      throw new Error(
        `Popup ${popupId} binding type ${binding.type} 与 nested ${nested.type} 不一致。`,
      );
    const requiredAssets = sortUnique([
      binding.manifest,
      ...collectMappedPopupAssetKeys({
        manifest: nested,
        files: options.files,
      }),
    ]);
    provisional.push(
      nested.type === "spine"
        ? {
            id: `spine-popup:${popupId}`,
            kind: "spine-popup" as const,
            popupId,
            usedByTransitions: sortUnique(
              (gameModes.transitions ?? [])
                .filter(
                  (transition) =>
                    "preludePopup" in transition &&
                    transition.preludePopup === popupId,
                )
                .map((transition) => `${transition.from}->${transition.to}`),
            ),
            requiredAssets,
          }
        : nested.type === "single-state"
          ? {
              id: `single-state-popup:${popupId}`,
              kind: "single-state-popup" as const,
              popupId,
              requiredAssets,
            }
          : {
              id: `award-celebration:${popupId}`,
              kind: "award-celebration" as const,
              popupId,
              requiredAssets,
              usedByModes: sortUnique(
                gameModes.modes
                  .filter((mode) => mode.awardCelebrationPopup === popupId)
                  .map((mode) => mode.id),
              ),
            },
    );
  }

  const initial = new Set<string>();
  for (const group of provisional) {
    const include =
      group.kind === "shared" ||
      (group.kind === "mode" && group.modeId === gameModes.initialMode) ||
      (group.kind === "transition" &&
        group.ownerMode === gameModes.initialMode) ||
      (group.kind === "symbols" &&
        group.usedByModes.includes(gameModes.initialMode)) ||
      (group.kind === "award-celebration" &&
        group.usedByModes.includes(gameModes.initialMode)) ||
      (group.kind === "spine-popup" &&
        (group.usedByTransitions.length === 0 ||
          group.usedByTransitions.some((edge) =>
            edge.startsWith(`${gameModes.initialMode}->`),
          ))) ||
      group.kind === "single-state-popup";
    if (include)
      for (const key of group.requiredAssets)
        if (!audioAssets.includes(key)) initial.add(key);
  }
  const initialAssets = sortUnique([...initial]);
  const groups = provisional
    .map((group) => finalizeGroup(group, initial))
    .sort((left, right) => compare(left.id, right.id));
  const assets = Object.fromEntries(
    Object.entries(options.output.assetsMap.files)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, entry]) => {
        const source = options.output.assets.get(key);
        if (!source) throw new Error(`优化资源 metadata 缺失：${key}`);
        return [
          key,
          {
            path: entry.path,
            mediaType: entry.mediaType,
            sha256: entry.sha256,
            byteLength: entry.byteLength,
            sourceKey: source.sourceKey,
            sourceByteLength: source.sourceByteLength,
            converted: source.converted,
          },
        ];
      }),
  );
  const result: SceneLayoutAssetGroupsV2 = {
    version: 2,
    kind: "scene-layout-asset-groups",
    layoutId: options.manifest.id,
    initialMode: gameModes.initialMode,
    optimization: {
      imageCodec: "webp",
      quality: options.quality,
      cwebpVersion: options.cwebpVersion,
      inputZipBytes: options.sourceZipBytes,
      outputZipBytes: options.output.zipBytes.byteLength,
      convertedImageCount: options.convertedImageCount,
      audioCodec: "aac-lc",
      audioContainer: "m4a",
      bgmBitrateKbps: options.audioOptions.bgmBitrateKbps,
      effectMonoBitrateKbps: options.audioOptions.effectMonoBitrateKbps,
      effectStereoBitrateKbps: options.audioOptions.effectStereoBitrateKbps,
      ffmpegVersion: options.audioOptimization.ffmpegVersion,
      ffprobeVersion: options.audioOptimization.ffprobeVersion,
      convertedAudioCount: options.audioOptimization.convertedAudioCount,
      inputAudioBytes: options.audioOptimization.inputAudioBytes,
      outputAudioBytes: options.audioOptimization.outputAudioBytes,
    },
    controlFiles: ["assets.map.json", "layout.manifest.json"],
    assets,
    initialAssets,
    groups,
  };
  const parsed = parseSceneLayoutAssetGroups(result);
  if (parsed.version !== 2)
    throw new Error("内部错误：新生成的 asset groups 不是 v2。");
  return parsed;
}

function finalizeGroup(
  group: ProvisionalAssetGroup,
  initial: ReadonlySet<string>,
): AssetGroupRecord {
  const requiredAssets = sortUnique(group.requiredAssets);
  const incrementalAssets = sortUnique(
    group.requiredAssets.filter((key) => !initial.has(key)),
  );
  switch (group.kind) {
    case "shared":
      return { ...group, requiredAssets, incrementalAssets };
    case "audio":
      return { ...group, requiredAssets, incrementalAssets };
    case "runtime-resource":
      return { ...group, requiredAssets, incrementalAssets };
    case "mode":
      return { ...group, requiredAssets, incrementalAssets };
    case "transition":
      return { ...group, requiredAssets, incrementalAssets };
    case "symbols":
      return { ...group, requiredAssets, incrementalAssets };
    case "award-celebration":
      return { ...group, requiredAssets, incrementalAssets };
    case "spine-popup":
      return { ...group, requiredAssets, incrementalAssets };
    case "single-state-popup":
      return { ...group, requiredAssets, incrementalAssets };
  }
}

export function parseSceneLayoutAssetGroups(
  value: unknown,
): SceneLayoutAssetGroups {
  const root = record(value, "asset groups");
  exactKeys(
    root,
    [
      "version",
      "kind",
      "layoutId",
      "initialMode",
      "optimization",
      "controlFiles",
      "assets",
      "initialAssets",
      "groups",
    ],
    "asset groups",
  );
  if (
    (root.version !== 1 && root.version !== 2) ||
    root.kind !== "scene-layout-asset-groups"
  )
    throw new Error("asset groups version/kind 无效。");
  nonEmptyString(root.layoutId, "layoutId");
  const initialMode = nonEmptyString(root.initialMode, "initialMode");
  const optimization = record(root.optimization, "optimization");
  const imageFields = [
    "imageCodec",
    "quality",
    "cwebpVersion",
    "inputZipBytes",
    "outputZipBytes",
    "convertedImageCount",
  ];
  const audioFields = [
    "audioCodec",
    "audioContainer",
    "bgmBitrateKbps",
    "effectMonoBitrateKbps",
    "effectStereoBitrateKbps",
    "ffmpegVersion",
    "ffprobeVersion",
    "convertedAudioCount",
    "inputAudioBytes",
    "outputAudioBytes",
  ];
  exactKeys(
    optimization,
    root.version === 2 ? [...imageFields, ...audioFields] : imageFields,
    "optimization",
  );
  if (
    optimization.imageCodec !== "webp" ||
    typeof optimization.quality !== "number" ||
    !Number.isFinite(optimization.quality) ||
    optimization.quality < 0 ||
    optimization.quality > 100
  )
    throw new Error("optimization codec/quality 无效。");
  nonEmptyString(optimization.cwebpVersion, "optimization.cwebpVersion");
  for (const key of ["inputZipBytes", "outputZipBytes", "convertedImageCount"])
    nonNegativeInteger(optimization[key], `optimization.${key}`);
  if (root.version === 2) validateAudioOptimization(optimization);
  if (
    JSON.stringify(root.controlFiles) !==
    JSON.stringify(["assets.map.json", "layout.manifest.json"])
  )
    throw new Error("controlFiles 无效。");
  const assets = record(root.assets, "assets");
  const assetKeys = Object.keys(assets);
  assertSortedUnique(assetKeys, "assets keys");
  for (const [key, raw] of Object.entries(assets)) {
    const asset = record(raw, `assets.${key}`);
    exactKeys(
      asset,
      [
        "path",
        "mediaType",
        "sha256",
        "byteLength",
        "sourceKey",
        "sourceByteLength",
        "converted",
      ],
      `assets.${key}`,
    );
    for (const field of ["path", "mediaType", "sourceKey"])
      nonEmptyString(asset[field], `assets.${key}.${field}`);
    if (
      typeof asset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(asset.sha256)
    )
      throw new Error(`assets.${key}.sha256 无效。`);
    nonNegativeInteger(asset.byteLength, `assets.${key}.byteLength`);
    nonNegativeInteger(
      asset.sourceByteLength,
      `assets.${key}.sourceByteLength`,
    );
    if (typeof asset.converted !== "boolean")
      throw new Error(`assets.${key}.converted 必须是 boolean。`);
  }
  const initialAssets = stringArray(root.initialAssets, "initialAssets");
  assertAssetReferences(initialAssets, assets, "initialAssets");
  if (!Array.isArray(root.groups) || root.groups.length === 0)
    throw new Error("groups 必须是非空数组。");
  const groups = root.groups.map((raw, index) =>
    validateGroup(raw, index, assets, new Set(initialAssets)),
  );
  assertSortedUnique(
    groups.map((group) => group.id),
    "group ids",
  );
  const modeIds = new Set(
    groups
      .filter((group) => group.kind === "mode")
      .map((group) => group.modeId),
  );
  if (!modeIds.has(initialMode))
    throw new Error("initialMode 没有对应 mode group。");
  for (const group of groups) {
    if (
      group.kind === "transition" &&
      (!modeIds.has(group.from) ||
        !modeIds.has(group.to) ||
        group.ownerMode !== group.from)
    )
      throw new Error(`transition group mode/owner 无效：${group.id}`);
    if (
      (group.kind === "symbols" || group.kind === "award-celebration") &&
      group.usedByModes.some((mode) => !modeIds.has(mode))
    )
      throw new Error(`group usedByModes 引用未知 mode：${group.id}`);
  }
  const covered = new Set(groups.flatMap((group) => group.requiredAssets));
  const uncovered = assetKeys.filter((key) => !covered.has(key));
  if (uncovered.length)
    throw new Error(`asset groups 未覆盖资源：${uncovered.join(", ")}`);
  return Object.freeze(structuredClone(value) as SceneLayoutAssetGroups);
}

export function serializeSceneLayoutAssetGroups(
  value: SceneLayoutAssetGroups,
): Uint8Array {
  return encodeStableJson(parseSceneLayoutAssetGroups(value));
}

function validateAudioOptimization(
  optimization: Record<string, unknown>,
): void {
  if (
    optimization.audioCodec !== "aac-lc" ||
    optimization.audioContainer !== "m4a"
  )
    throw new Error("optimization audio codec/container 无效。");
  for (const key of [
    "bgmBitrateKbps",
    "effectMonoBitrateKbps",
    "effectStereoBitrateKbps",
  ]) {
    const bitrate = nonNegativeInteger(
      optimization[key],
      `optimization.${key}`,
    );
    if (bitrate < 8 || bitrate > 512)
      throw new Error(`optimization.${key} 必须是 8..512 kbps。`);
  }
  for (const key of [
    "convertedAudioCount",
    "inputAudioBytes",
    "outputAudioBytes",
  ])
    nonNegativeInteger(optimization[key], `optimization.${key}`);
  const hasAudio = optimization.inputAudioBytes !== 0;
  for (const key of ["ffmpegVersion", "ffprobeVersion"]) {
    const value = optimization[key];
    if (hasAudio) nonEmptyString(value, `optimization.${key}`);
    else if (value !== null)
      throw new Error(`optimization.${key} 无音频时必须是 null。`);
  }
}

function nodeClosure(
  nodes: readonly SceneLayoutNode[],
  files: ReadonlyMap<string, Uint8Array>,
): readonly string[] {
  const keys = new Set<string>();
  for (const node of nodes) {
    const resource = node.resource;
    if (resource.kind === "image") keys.add(resource.path);
    else if (resource.kind === "image-string") {
      keys.add(resource.manifest);
      const nested = parseImageStringManifest(
        parseRequiredJson(files, resource.manifest),
      );
      for (const key of collectImageStringAssetPaths(nested)) keys.add(key);
    } else if (resource.kind === "vni") {
      keys.add(resource.project);
      const project = assertVNIProject(
        parseRequiredJson(files, resource.project),
      );
      for (const asset of project.assets) keys.add(asset.path);
    } else {
      keys.add(resource.skeleton);
      keys.add(resource.atlas);
      for (const key of Object.values(resource.textures)) keys.add(key);
    }
  }
  return sortUnique([...keys]);
}

function runtimeResourceClosure(
  resource: NonNullable<SceneLayoutManifest["runtimeResources"]>[string],
  files: ReadonlyMap<string, Uint8Array>,
): readonly string[] {
  const keys = new Set<string>();
  if (
    resource.kind === "image" ||
    resource.kind === "video" ||
    resource.kind === "json"
  ) {
    keys.add(resource.path);
  } else if (resource.kind === "image-string") {
    keys.add(resource.manifest);
    const nested = parseImageStringManifest(
      parseRequiredJson(files, resource.manifest),
    );
    for (const key of collectImageStringAssetPaths(nested)) keys.add(key);
  } else if (resource.kind === "vni") {
    keys.add(resource.project);
    const project = assertVNIProject(
      parseRequiredJson(files, resource.project),
    );
    for (const asset of project.assets) keys.add(asset.path);
  } else {
    keys.add(resource.skeleton);
    keys.add(resource.atlas);
    for (const key of Object.values(resource.textures)) keys.add(key);
  }
  return sortUnique([...keys]);
}

function symbolBindings(
  manifest: SceneLayoutManifest,
  files: ReadonlyMap<string, Uint8Array>,
): readonly { readonly id: string; readonly manifest: string }[] {
  if (manifest.symbolPackage) {
    const nested = parseSymbolPackageManifest(
      parseRequiredJson(files, manifest.symbolPackage.manifest),
    );
    return [{ id: nested.id, manifest: manifest.symbolPackage.manifest }];
  }
  return Object.entries(manifest.symbolPackages ?? {}).map(([id, binding]) => ({
    id,
    manifest: binding.manifest,
  }));
}

function popupClosure(
  popupId: string,
  manifest: SceneLayoutManifest,
  files: ReadonlyMap<string, Uint8Array>,
): readonly string[] {
  const binding = manifest.popups?.[popupId];
  if (!binding) throw new Error(`转场引用了未知 Popup binding：${popupId}`);
  const nested = parsePopupManifest(parseRequiredJson(files, binding.manifest));
  if (nested.id !== popupId || nested.type !== "spine")
    throw new Error(`转场 Popup ${popupId} 必须是 id 一致的 spine package。`);
  return sortUnique([
    binding.manifest,
    ...collectMappedPopupAssetKeys({ manifest: nested, files }),
  ]);
}

function validateGroup(
  value: unknown,
  index: number,
  assets: Record<string, unknown>,
  initial: ReadonlySet<string>,
): AssetGroupRecord {
  const group = record(value, `groups[${index}]`);
  const common = ["id", "kind", "requiredAssets", "incrementalAssets"];
  const kind = group.kind;
  const extras =
    kind === "shared"
      ? []
      : kind === "audio"
        ? ["owner", "usedByModes"]
        : kind === "runtime-resource"
          ? ["resourceKey", "resourceKind"]
          : kind === "mode"
            ? ["modeId", "initial"]
            : kind === "transition"
              ? ["ownerMode", "from", "to"]
              : kind === "symbols"
                ? ["packageId", "usedByModes"]
                : kind === "award-celebration"
                  ? ["popupId", "usedByModes"]
                  : kind === "spine-popup"
                    ? ["popupId", "usedByTransitions"]
                    : kind === "single-state-popup"
                      ? ["popupId"]
                      : null;
  if (!extras) throw new Error(`groups[${index}].kind 无效。`);
  exactKeys(group, [...common, ...extras], `groups[${index}]`);
  const id = nonEmptyString(group.id, `groups[${index}].id`);
  const required = stringArray(
    group.requiredAssets,
    `groups[${index}].requiredAssets`,
  );
  const incremental = stringArray(
    group.incrementalAssets,
    `groups[${index}].incrementalAssets`,
  );
  assertAssetReferences(required, assets, `${id}.requiredAssets`);
  const expectedIncremental = required.filter((key) => !initial.has(key));
  if (JSON.stringify(incremental) !== JSON.stringify(expectedIncremental))
    throw new Error(`${id}.incrementalAssets 不是 required - initial。`);
  if (kind === "shared") {
    if (id !== "shared") throw new Error("shared group id 必须是 shared。");
  } else if (kind === "audio") {
    if (id !== "audio:scene-layout" || group.owner !== "scene-layout")
      throw new Error("audio group identity 无效。");
    stringArray(group.usedByModes, `${id}.usedByModes`);
  } else if (kind === "runtime-resource") {
    nonEmptyString(group.resourceKey, `${id}.resourceKey`);
    nonEmptyString(group.resourceKind, `${id}.resourceKind`);
  } else if (kind === "mode") {
    nonEmptyString(group.modeId, `${id}.modeId`);
    if (typeof group.initial !== "boolean")
      throw new Error(`${id}.initial 必须是 boolean。`);
  } else if (kind === "transition") {
    for (const field of ["ownerMode", "from", "to"])
      nonEmptyString(group[field], `${id}.${field}`);
  } else if (kind === "symbols" || kind === "award-celebration") {
    nonEmptyString(
      group[kind === "symbols" ? "packageId" : "popupId"],
      `${id} identity`,
    );
    stringArray(group.usedByModes, `${id}.usedByModes`);
  } else if (kind === "spine-popup") {
    nonEmptyString(group.popupId, `${id}.popupId`);
    stringArray(group.usedByTransitions, `${id}.usedByTransitions`);
  } else {
    nonEmptyString(group.popupId, `${id}.popupId`);
  }
  return group as unknown as AssetGroupRecord;
}

function parseRequiredJson(
  files: ReadonlyMap<string, Uint8Array>,
  key: string,
): unknown {
  const bytes = files.get(key);
  if (!bytes) throw new Error(`资源分组缺少 bytes：${key}`);
  return parseJson(bytes, key);
}

function assertAssetReferences(
  keys: readonly string[],
  assets: Record<string, unknown>,
  label: string,
): void {
  for (const key of keys)
    if (!Object.hasOwn(assets, key))
      throw new Error(`${label} 引用未知 asset：${key}`);
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`${label} 必须是 string array。`);
  assertSortedUnique(value as string[], label);
  return value as string[];
}

function sortUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compare);
}

function assertSortedUnique(values: readonly string[], label: string): void {
  const sorted = sortUnique(values);
  if (
    sorted.length !== values.length ||
    values.some((value, index) => value !== sorted[index])
  )
    throw new Error(`${label} 必须按 code point 排序且不重复。`);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compare);
  const wanted = [...expected].sort(compare);
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    throw new Error(`${label} fields 无效：${actual.join(", ")}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} 必须是 object。`);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} 必须是非空字符串。`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} 必须是非负安全整数。`);
  return value;
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
