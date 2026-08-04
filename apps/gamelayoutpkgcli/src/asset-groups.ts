import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string";
import { assertVNIProject } from "@slotclientengine/vnicore/core";
import {
  collectMappedPopupAssetKeys,
  parsePopupManifest,
} from "@slotclientengine/rendercore/popup";
import type {
  SceneLayoutManifestV1,
  SceneLayoutNode,
} from "@slotclientengine/rendercore/scene-layout";
import {
  collectSymbolPackageEntryPaths,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol";
import { parseJson } from "./package-reader.js";
import { encodeStableJson } from "./reference-rewriter.js";
import type {
  AssetGroupRecord,
  OptimizedLogicalAsset,
  SceneLayoutAssetGroupsV1,
  WrittenOptimizedPackage,
} from "./types.js";

type ProvisionalAssetGroup = AssetGroupRecord extends infer Group
  ? Group extends AssetGroupRecord
    ? Omit<Group, "incrementalAssets">
    : never
  : never;

export function createSceneLayoutAssetGroups(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly sourceZipBytes: number;
  readonly output: WrittenOptimizedPackage;
  readonly quality: number;
  readonly cwebpVersion: string;
  readonly convertedImageCount: number;
}): SceneLayoutAssetGroupsV1 {
  const gameModes = options.manifest.gameModes;
  if (!gameModes) throw new Error("资源分组要求 Scene Layout gameModes。");
  const allBackgroundIds = new Set(
    gameModes.modes.flatMap((mode) =>
      Object.values(mode.backgroundNodes ?? {}),
    ),
  );
  const sharedNodes = options.manifest.nodes.filter(
    (node) => !allBackgroundIds.has(node.id),
  );
  const sharedRequired = nodeClosure(sharedNodes, options.files);
  const provisional: ProvisionalAssetGroup[] = [
    {
      id: "shared",
      kind: "shared",
      requiredAssets: sharedRequired,
    },
  ];
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
    const nodeIds = new Set(Object.values(mode.backgroundNodes ?? {}));
    const nodes = options.manifest.nodes.filter(
      (node) => nodeIds.has(node.id) || sharedNodes.includes(node),
    );
    provisional.push({
      id: `mode:${mode.id}`,
      kind: "mode",
      modeId: mode.id,
      initial: mode.id === gameModes.initialMode,
      requiredAssets: nodeClosure(nodes, options.files),
    });
  }
  for (const transition of gameModes.transitions ?? [])
    provisional.push({
      id: `transition:${transition.from}->${transition.to}`,
      kind: "transition",
      ownerMode: transition.from,
      from: transition.from,
      to: transition.to,
      requiredAssets: sortUnique(
        transition.overlay.resource.kind === "video"
          ? [transition.overlay.resource.path]
          : [
              transition.overlay.resource.skeleton,
              transition.overlay.resource.atlas,
              ...Object.values(transition.overlay.resource.textures),
            ],
      ),
    });

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
      group.kind === "spine-popup";
    if (include) for (const key of group.requiredAssets) initial.add(key);
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
  const result: SceneLayoutAssetGroupsV1 = {
    version: 1,
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
    },
    controlFiles: ["assets.map.json", "layout.manifest.json"],
    assets,
    initialAssets,
    groups,
  };
  return parseSceneLayoutAssetGroups(result);
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
  }
}

export function parseSceneLayoutAssetGroups(
  value: unknown,
): SceneLayoutAssetGroupsV1 {
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
  if (root.version !== 1 || root.kind !== "scene-layout-asset-groups")
    throw new Error("asset groups version/kind 无效。");
  nonEmptyString(root.layoutId, "layoutId");
  const initialMode = nonEmptyString(root.initialMode, "initialMode");
  const optimization = record(root.optimization, "optimization");
  exactKeys(
    optimization,
    [
      "imageCodec",
      "quality",
      "cwebpVersion",
      "inputZipBytes",
      "outputZipBytes",
      "convertedImageCount",
    ],
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
  return Object.freeze(structuredClone(value) as SceneLayoutAssetGroupsV1);
}

export function serializeSceneLayoutAssetGroups(
  value: SceneLayoutAssetGroupsV1,
): Uint8Array {
  return encodeStableJson(parseSceneLayoutAssetGroups(value));
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
  resource: NonNullable<SceneLayoutManifestV1["runtimeResources"]>[string],
  files: ReadonlyMap<string, Uint8Array>,
): readonly string[] {
  const keys = new Set<string>();
  if (resource.kind === "image" || resource.kind === "video") {
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
  manifest: SceneLayoutManifestV1,
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
