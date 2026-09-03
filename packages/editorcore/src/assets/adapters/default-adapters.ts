import {
  detectRasterAssetType,
  type SourceFileLike,
} from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  assertEditorAssetKey,
  basenameFromSourcePath,
  decodeEditorAssetsMap,
  ingestEditorResourceSources,
  normalizeEditorPackageZipEntries,
  validateEditorAssetsMapPackage,
  type EditorAssetInput,
  type EditorImportSourceFile,
} from "@slotclientengine/editorresource";
import {
  detectAudioMediaType,
  mediaTypeForAudioFilenameKey,
} from "@slotclientengine/audiocore/editor";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string/data";
import {
  collectMappedPopupAssetKeys,
  collectPopupObjectDirectPaths,
  parsePopupManifest,
  parsePopupObjectManifest,
} from "@slotclientengine/rendercore/popup/data";
import { namespaceMappedPopupPackageFiles } from "@slotclientengine/rendercore/popup/editor";
import {
  collectSymbolManifestResourcePaths,
  collectSymbolPackageEntryPaths,
  inspectSymbolSpineAtlas,
  inspectSymbolSpineSkeleton,
  parseSymbolPackageManifest,
  validateSymbolPackageContents,
  validateSymbolPackageGameConfig,
} from "@slotclientengine/rendercore/symbol/data";
import {
  inspectSymbolVniExportBundle,
  materializeMappedSymbolPackageContents,
  materializeSymbolVniExportBundleRuntime,
} from "@slotclientengine/rendercore/symbol/editor";
import {
  collectSceneLayoutPackagePaths,
  parseSceneLayoutManifestDocument,
} from "@slotclientengine/rendercore/scene-layout/editor";
import {
  assertVNIProject,
  rewriteVNIProjectAssetPaths,
  validateVNIProject,
} from "@slotclientengine/vnicore/data";
import type {
  EditorAssetImportProfile,
  EditorAssetNode,
  EditorAssetRelation,
  EditorAssetRootDraft,
  EditorAssetRootKind,
} from "../data/index.js";

export const DEFAULT_EDITOR_ASSET_INGESTION_LIMITS = Object.freeze({
  files: Object.freeze({
    maxEntries: 4096,
    // ZIP sources must reach the ZIP reader before their compressed-size and
    // expanded-payload limits can be applied.
    maxFileBytes: 200 * 1024 * 1024,
    maxTotalBytes: 500 * 1024 * 1024,
  }),
  zip: Object.freeze({
    maxEntries: 4096,
    maxCompressedBytes: 200 * 1024 * 1024,
    maxFileBytes: 50 * 1024 * 1024,
    maxTotalBytes: 500 * 1024 * 1024,
  }),
});

export interface DiscoverDefaultEditorAssetsResult {
  readonly drafts: readonly EditorAssetRootDraft[];
  readonly profiles: readonly EditorAssetImportProfile[];
  readonly blockingErrors: readonly string[];
}

export async function ingestAndDiscoverDefaultEditorAssets(options: {
  readonly files: readonly SourceFileLike[];
  readonly profileSelections?: Readonly<Record<string, string>>;
}): Promise<DiscoverDefaultEditorAssetsResult> {
  const sources = await ingestEditorResourceSources({
    files: options.files,
    limits: DEFAULT_EDITOR_ASSET_INGESTION_LIMITS,
  });
  for (const source of sources) {
    if (
      source.container === "file" &&
      source.bytes.byteLength >
        DEFAULT_EDITOR_ASSET_INGESTION_LIMITS.zip.maxFileBytes
    ) {
      throw new Error(
        `loose asset 超过 ${DEFAULT_EDITOR_ASSET_INGESTION_LIMITS.zip.maxFileBytes} bytes 上限：${source.key}`,
      );
    }
  }
  return discoverDefaultEditorAssets({
    sources,
    profileSelections: options.profileSelections,
  });
}

export async function discoverDefaultEditorAssets(options: {
  readonly sources: readonly EditorImportSourceFile[];
  readonly profileSelections?: Readonly<Record<string, string>>;
}): Promise<DiscoverDefaultEditorAssetsResult> {
  const drafts: EditorAssetRootDraft[] = [];
  const profiles: EditorAssetImportProfile[] = [];
  const errors: string[] = [];
  const loose = options.sources.filter(({ container }) => container === "file");
  if (loose.length) {
    const result = discoverLooseAssets(loose);
    drafts.push(...result.drafts);
    errors.push(...result.errors);
  }
  const zipGroups = groupBy(
    options.sources.filter(({ container }) => container === "zip"),
    ({ containerName }) => containerName,
  );
  for (const [containerName, group] of zipGroups) {
    try {
      const entries = normalizeEditorPackageZipEntries(
        new Map(group.map(({ sourcePath, bytes }) => [sourcePath, bytes])),
        [
          "image-string.manifest.json",
          "popup.manifest.json",
          "symbols.package.json",
          "layout.manifest.json",
          "manifest.json",
        ],
      );
      const result = await discoverZipAssets({
        containerName,
        entries,
        selectedProfileId: options.profileSelections?.[containerName],
      });
      drafts.push(...result.drafts);
      profiles.push(...result.profiles);
      errors.push(...result.errors);
    } catch (error) {
      errors.push(`${containerName}: ${formatError(error)}`);
    }
  }
  assertUniqueRootKeys(drafts);
  return Object.freeze({
    drafts: Object.freeze(drafts),
    profiles: Object.freeze(profiles),
    blockingErrors: Object.freeze(errors),
  });
}

function discoverLooseAssets(files: readonly EditorImportSourceFile[]): {
  drafts: EditorAssetRootDraft[];
  errors: string[];
} {
  const drafts: EditorAssetRootDraft[] = [];
  const errors: string[] = [];
  const claimed = new Set<EditorImportSourceFile>();
  const json = files.filter(({ key }) => key.toLowerCase().endsWith(".json"));
  const vni: {
    file: EditorImportSourceFile;
    project: ReturnType<typeof assertVNIProject>;
  }[] = [];
  const skeletons: EditorImportSourceFile[] = [];
  for (const file of json) {
    let value: unknown;
    try {
      value = parseJson(file.bytes, file.key);
    } catch {
      // Invalid or unknown JSON remains importable as an opaque text file.
      continue;
    }
    let project: ReturnType<typeof assertVNIProject> | undefined;
    try {
      project = assertVNIProject(value);
    } catch {
      // Not a VNI project; Spine inspection below gets the next claim.
    }
    if (project) {
      try {
        validateVNIProject(project);
      } catch (error) {
        errors.push(`${file.key}: ${formatError(error)}`);
        claimed.add(file);
        continue;
      }
      vni.push({ file, project });
      continue;
    }
    try {
      inspectSymbolSpineSkeleton(value);
      skeletons.push(file);
    } catch {
      // Other JSON files are opaque text roots until a loader claims them.
    }
  }
  for (const item of vni) {
    try {
      const assetFiles = item.project.assets.map((asset) => {
        const key = basenameFromSourcePath(asset.path);
        const file = requiredUniqueFile(files, key);
        return { asset, file, key };
      });
      const keyById = new Map(
        assetFiles.map(({ asset, key }) => [asset.id, key] as const),
      );
      const project = rewriteVNIProjectAssetPaths(
        item.project,
        (_path, assetId) => requiredMap(keyById, assetId, "VNI asset"),
      );
      const inputs = [
        input(item.file.key, "application/json", encodeJson(project)),
        ...assetFiles.map(({ file, key }) =>
          input(key, rasterMediaType(file.bytes), file.bytes),
        ),
      ];
      drafts.push(
        createVniDraft(item.file.key, inputs, project, `vni:${item.file.key}`),
      );
      claimed.add(item.file);
      for (const { file } of assetFiles) claimed.add(file);
    } catch (error) {
      errors.push(`${item.file.key}: ${formatError(error)}`);
    }
  }
  if (skeletons.length) {
    const atlases = files.filter(({ key }) =>
      key.toLowerCase().endsWith(".atlas"),
    );
    if (atlases.length !== 1) {
      errors.push(
        `Spine batch 必须恰好包含一个 atlas，实际 ${atlases.length}。`,
      );
    } else {
      try {
        const atlas = atlases[0]!;
        const atlasText = decodeText(atlas.bytes, atlas.key);
        const atlasMetadata = inspectSymbolSpineAtlas(atlasText);
        const textures = atlasMetadata.pageNames.map((page) => ({
          page,
          file: requiredUniqueFile(files, basenameFromSourcePath(page)),
        }));
        for (const skeleton of skeletons) {
          const metadata = inspectSymbolSpineSkeleton(
            parseJson(skeleton.bytes, skeleton.key),
          );
          drafts.push(
            createSpineDraft({ skeleton, atlas, textures, metadata }),
          );
          claimed.add(skeleton);
        }
        claimed.add(atlas);
        for (const { file } of textures) claimed.add(file);
      } catch (error) {
        errors.push(`Spine batch: ${formatError(error)}`);
      }
    }
  }
  for (const file of files) {
    if (claimed.has(file)) continue;
    try {
      drafts.push(createAtomicDraft(file));
    } catch (error) {
      errors.push(`${file.key}: ${formatError(error)}`);
    }
  }
  return { drafts, errors };
}

async function discoverZipAssets(options: {
  containerName: string;
  entries: ReadonlyMap<string, Uint8Array>;
  selectedProfileId?: string;
}): Promise<{
  drafts: EditorAssetRootDraft[];
  profiles: EditorAssetImportProfile[];
  errors: string[];
}> {
  if (options.entries.has("image-string.manifest.json"))
    return {
      drafts: [await discoverImageStringPackage(options.entries)],
      profiles: [],
      errors: [],
    };
  if (options.entries.has("popup.manifest.json"))
    return {
      drafts: [await discoverPopupPackage(options.entries)],
      profiles: [],
      errors: [],
    };
  if (options.entries.has("symbols.package.json"))
    return {
      drafts: await discoverSymbolsPackage(options.entries),
      profiles: [],
      errors: [],
    };
  if (options.entries.has("layout.manifest.json"))
    return {
      drafts: await discoverGameLayoutPackage(options.entries),
      profiles: [],
      errors: [],
    };
  if (options.entries.has("manifest.json")) {
    const inspected = inspectSymbolVniExportBundle(options.entries);
    if (inspected) {
      const profiles = inspected.map((profile) => ({
        containerName: options.containerName,
        id: profile.id,
        label: profile.label,
        byteLength: profile.byteLength,
      }));
      if (inspected.length > 1 && !options.selectedProfileId)
        return {
          drafts: [],
          profiles,
          errors: [
            `${options.containerName}: VNI bundle 有多个 runtime profile，必须明确选择。`,
          ],
        };
      return {
        drafts: [discoverVniBundle(options.entries, options.selectedProfileId)],
        profiles,
        errors: [],
      };
    }
  }
  const loose = [...options.entries].map(([sourcePath, bytes]) =>
    Object.freeze({
      sourcePath,
      key: basenameFromSourcePath(sourcePath),
      bytes,
      container: "file" as const,
      containerName: options.containerName,
    }),
  );
  const discovered = discoverLooseAssets(loose);
  return { drafts: discovered.drafts, profiles: [], errors: discovered.errors };
}

async function discoverImageStringPackage(
  entries: ReadonlyMap<string, Uint8Array>,
): Promise<EditorAssetRootDraft> {
  const { logical } = await resolveMappedPackage(entries, [
    "image-string.manifest.json",
  ]);
  const manifest = parseImageStringManifest(
    parseJson(
      requiredBytes(entries, "image-string.manifest.json"),
      "image-string.manifest.json",
    ),
  );
  const keys = collectImageStringAssetPaths(manifest);
  assertExactMappedKeys(logical, keys, "ImgNumber");
  const prefix = manifest.id;
  const mapping = new Map(
    keys.map((key) => [key, `${prefix}-${key}`] as const),
  );
  const rewritten = structuredClone(manifest) as {
    glyphs: Record<string, { path: string }>;
  };
  for (const glyph of Object.values(rewritten.glyphs))
    glyph.path = requiredMap(mapping, glyph.path, "ImgNumber glyph");
  const parsed = parseImageStringManifest(rewritten);
  const rootKey = `${prefix}-image-string.manifest.json`;
  const inputs = [
    input(rootKey, "application/json", encodeJson(parsed)),
    ...keys.map((key) => {
      const target = requiredMap(mapping, key, "ImgNumber key");
      const bytes = requiredBytes(logical, key);
      return input(target, rasterMediaType(bytes), bytes);
    }),
  ];
  return createImageStringDraft(rootKey, parsed.id, inputs, parsed);
}

async function discoverPopupPackage(
  entries: ReadonlyMap<string, Uint8Array>,
): Promise<EditorAssetRootDraft> {
  const { logical } = await resolveMappedPackage(entries, [
    "popup.manifest.json",
  ]);
  const raw = parseJson(
    requiredBytes(entries, "popup.manifest.json"),
    "popup.manifest.json",
  );
  const manifest = parsePopupManifest(raw);
  const expected = collectMappedPopupAssetKeys({ manifest, files: logical });
  assertExactMappedKeys(logical, expected, "Popup");
  const namespaced = namespaceMappedPopupPackageFiles({
    manifest,
    files: logical,
    keyPrefix: manifest.id,
  });
  const inputs = [...namespaced.files].map(([key, bytes]) =>
    input(key, mediaTypeForKey(key, bytes), bytes),
  );
  return createPackageDraft({
    kind: "popup",
    rootKey: namespaced.rootKey,
    owner: `popup:${manifest.id}`,
    inputs,
    manifest: namespaced.manifest,
  });
}

async function discoverSymbolsPackage(
  entries: ReadonlyMap<string, Uint8Array>,
): Promise<EditorAssetRootDraft[]> {
  const rawPackage = parseJson(
    requiredBytes(entries, "symbols.package.json"),
    "symbols.package.json",
  );
  const packageManifest = parseSymbolPackageManifest(rawPackage);
  const controlPaths = [
    "symbols.package.json",
    packageManifest.entrypoints.gameConfig,
    packageManifest.entrypoints.symbolManifest,
  ];
  const { logical: mappedLogical } = await resolveMappedPackage(
    entries,
    controlPaths,
    { includeOpaqueControls: true },
  );
  const logical = new Map(mappedLogical);
  for (const key of controlPaths.slice(1)) {
    const bytes = entries.get(key);
    if (bytes) logical.set(key, bytes);
  }
  const expectedKeys = new Set(collectSymbolPackageEntryPaths(packageManifest));
  const packageLogical = new Map(
    [...logical].filter(([key]) => expectedKeys.has(key)),
  );
  const validationFiles = new Map(packageLogical);
  validationFiles.set(
    "symbols.package.json",
    requiredBytes(entries, "symbols.package.json"),
  );
  validateSymbolPackageContents({
    packageManifest,
    files: validationFiles,
  });
  const rawGameConfig = parseJson(
    requiredBytes(packageLogical, packageManifest.entrypoints.gameConfig),
    packageManifest.entrypoints.gameConfig,
  );
  const rawSymbolManifest = parseJson(
    requiredBytes(packageLogical, packageManifest.entrypoints.symbolManifest),
    packageManifest.entrypoints.symbolManifest,
  );
  validateSymbolPackageGameConfig({
    rawGameConfig,
    symbolManifest: rawSymbolManifest,
  });
  const referencedResources = collectSymbolManifestResourcePaths({
    symbolManifest: rawSymbolManifest,
    symbolManifestPath: packageManifest.entrypoints.symbolManifest,
    files: packageLogical,
  });
  const ownerKeys = new Set([
    packageManifest.entrypoints.gameConfig,
    packageManifest.entrypoints.symbolManifest,
    ...referencedResources,
  ]);
  const ownerLogical = new Map(
    [...packageLogical].filter(([key]) => ownerKeys.has(key)),
  );
  const materialized = await materializeMappedSymbolPackageContents({
    packageManifest,
    rawGameConfig,
    rawSymbolManifest,
    assets: ownerLogical,
    keyPrefix: packageManifest.id,
  });
  const rootKey = `${packageManifest.id}-symbols.package.json`;
  const inputs: EditorAssetInput[] = [
    input(
      rootKey,
      "application/json",
      encodeJson(materialized.packageManifest),
    ),
    input(
      materialized.packageManifest.entrypoints.gameConfig,
      "application/json",
      encodeJson(materialized.rawGameConfig),
    ),
    input(
      materialized.packageManifest.entrypoints.symbolManifest,
      "application/json",
      encodeJson(materialized.rawSymbolManifest),
    ),
    ...[...materialized.assets].map(([key, bytes]) =>
      input(key, mediaTypeForKey(key, bytes), bytes),
    ),
  ];
  return [
    createPackageDraft({
      kind: "symbols",
      rootKey,
      owner: `symbols:${packageManifest.id}`,
      inputs: uniqueInputs(inputs),
      manifest: materialized.packageManifest,
      entrypoints: [
        materialized.packageManifest.entrypoints.gameConfig,
        materialized.packageManifest.entrypoints.symbolManifest,
      ],
    }),
    ...opaqueDrafts(logical, ownerKeys, "symbols package"),
  ];
}

async function discoverGameLayoutPackage(
  entries: ReadonlyMap<string, Uint8Array>,
): Promise<EditorAssetRootDraft[]> {
  const manifest = parseSceneLayoutManifestDocument(
    parseJson(
      requiredBytes(entries, "layout.manifest.json"),
      "layout.manifest.json",
    ),
  );
  const { logical } = await resolveMappedPackage(
    entries,
    ["layout.manifest.json"],
    { includeOpaqueControls: true },
  );
  const closure = collectSceneLayoutPackagePaths({
    manifest,
    files: logical,
    allowExtraFiles: true,
  });
  const rootKey = `${manifest.id}-layout.manifest.json`;
  const inputs = [
    input(rootKey, "application/json", encodeJson(manifest)),
    ...closure.map((key) => {
      const bytes = requiredBytes(logical, key);
      return input(key, mediaTypeForKey(key, bytes), bytes);
    }),
  ];
  return [
    createPackageDraft({
      kind: "game-layout",
      rootKey,
      owner: `game-layout:${manifest.id}`,
      inputs,
      manifest,
    }),
    ...opaqueDrafts(logical, new Set(closure), "game-layout package"),
  ];
}

function opaqueDrafts(
  files: ReadonlyMap<string, Uint8Array>,
  claimedKeys: ReadonlySet<string>,
  label: string,
): EditorAssetRootDraft[] {
  return [...files]
    .filter(([key]) => !claimedKeys.has(key))
    .sort(([left], [right]) => compare(left, right))
    .map(([key, bytes]) => {
      try {
        return createAtomicDraft({
          sourcePath: key,
          key,
          bytes,
          container: "file",
          containerName: label,
        });
      } catch (error) {
        throw new Error(`${label} extra ${key}: ${formatError(error)}`);
      }
    });
}

function discoverVniBundle(
  entries: ReadonlyMap<string, Uint8Array>,
  selectedProfileId?: string,
): EditorAssetRootDraft {
  const runtime = materializeSymbolVniExportBundleRuntime({
    entries,
    selectedProfileId,
  });
  const prefix = `vni-${runtime.profile.id}`;
  const mapping = new Map(
    runtime.assets.map(({ key }) => [key, `${prefix}-${key}`] as const),
  );
  const project = assertVNIProject(
    parseJson(runtime.project.bytes, runtime.project.key),
  );
  const rewritten = rewriteVNIProjectAssetPaths(project, (path) =>
    requiredMap(mapping, basenameFromSourcePath(path), "VNI profile asset"),
  );
  const rootKey = `${prefix}-${runtime.project.key}`;
  const inputs = [
    input(rootKey, "application/json", encodeJson(rewritten)),
    ...runtime.assets.map(({ key, bytes }) =>
      input(
        requiredMap(mapping, key, "VNI key"),
        rasterMediaType(bytes),
        bytes,
      ),
    ),
  ];
  return createVniDraft(rootKey, inputs, rewritten, prefix);
}

function createAtomicDraft(file: EditorImportSourceFile): EditorAssetRootDraft {
  const lower = file.key.toLowerCase();
  let kind: EditorAssetRootKind;
  let mediaType: string;
  if (/\.(?:png|jpe?g|webp)$/u.test(lower)) {
    kind = "image";
    mediaType = rasterMediaType(file.bytes);
  } else if (/\.(?:mp3|ogg|wav|m4a|aac|webm)$/u.test(lower)) {
    kind = "audio";
    mediaType = mediaTypeForAudioFilenameKey(file.key);
    if (detectAudioMediaType(file.bytes) !== mediaType)
      throw new Error("audio signature 与扩展名不匹配");
  } else if (lower.endsWith(".mp4")) {
    kind = "video";
    mediaType = "video/mp4";
    if (!isIsoBaseMedia(file.bytes)) throw new Error("MP4 signature 无效");
  } else {
    mediaType = mediaTypeForKey(file.key, file.bytes);
    kind = mediaType === "application/octet-stream" ? "binary" : "text";
  }
  const rootId = rootNodeId(kind, file.key);
  const payload = fileNode(file.key, kind === "image" ? "texture" : "payload");
  return Object.freeze({
    key: file.key,
    kind,
    nodeId: rootId,
    owner: `${kind}:${file.key}`,
    exactKeys: Object.freeze([file.key]),
    inputs: Object.freeze([input(file.key, mediaType, file.bytes)]),
    nodes: Object.freeze([rootNode(rootId, kind, file.key, {}), payload]),
    relations: Object.freeze([relation(rootId, payload.id, "uses-payload")]),
  });
}

function createSpineDraft(options: {
  skeleton: EditorImportSourceFile;
  atlas: EditorImportSourceFile;
  textures: readonly { page: string; file: EditorImportSourceFile }[];
  metadata: ReturnType<typeof inspectSymbolSpineSkeleton>;
}): EditorAssetRootDraft {
  const rootKey = options.skeleton.key;
  const rootId = rootNodeId("spine", rootKey);
  const skeleton = fileNode(rootKey, "skeleton", {
    animations: options.metadata.animationNames.length,
    slots: options.metadata.slotNames.length,
  });
  const atlas = fileNode(options.atlas.key, "atlas");
  const nodes = [
    rootNode(rootId, "spine", rootKey, {
      animations: options.metadata.animationNames.length,
    }),
    skeleton,
    atlas,
    ...options.textures.map(({ file }) => fileNode(file.key, "texture")),
  ];
  const relations = [
    relation(rootId, skeleton.id, "contains"),
    relation(skeleton.id, atlas.id, "uses-atlas"),
    ...options.textures.map(({ page, file }) =>
      relation(atlas.id, fileNodeId(file.key), "uses-texture", page),
    ),
  ];
  const inputs = uniqueInputs([
    input(rootKey, "application/json", options.skeleton.bytes),
    input(options.atlas.key, "text/plain", options.atlas.bytes),
    ...options.textures.map(({ file }) =>
      input(file.key, rasterMediaType(file.bytes), file.bytes),
    ),
  ]);
  return Object.freeze({
    key: rootKey,
    kind: "spine",
    nodeId: rootId,
    owner: `spine:${rootKey}`,
    exactKeys: Object.freeze(inputs.map(({ key }) => key)),
    inputs: Object.freeze(inputs),
    nodes: Object.freeze(nodes),
    relations: Object.freeze(relations),
  });
}

function createVniDraft(
  rootKey: string,
  inputs: readonly EditorAssetInput[],
  project: ReturnType<typeof assertVNIProject>,
  owner: string,
): EditorAssetRootDraft {
  const rootId = rootNodeId("vni", rootKey);
  const projectNode = fileNode(rootKey, "project", {
    width: project.stage.width,
    height: project.stage.height,
    duration: project.stage.duration,
  });
  const assetKeys = inputs.slice(1).map(({ key }) => key);
  return Object.freeze({
    key: rootKey,
    kind: "vni",
    nodeId: rootId,
    owner,
    exactKeys: Object.freeze(inputs.map(({ key }) => key)),
    inputs: Object.freeze([...inputs]),
    nodes: Object.freeze([
      rootNode(rootId, "vni", rootKey, { assets: assetKeys.length }),
      projectNode,
      ...assetKeys.map((key) => fileNode(key, "texture")),
    ]),
    relations: Object.freeze([
      relation(rootId, projectNode.id, "uses-project"),
      ...assetKeys.map((key) =>
        relation(projectNode.id, fileNodeId(key), "uses-texture"),
      ),
    ]),
  });
}

function createImageStringDraft(
  rootKey: string,
  ownerId: string,
  inputs: readonly EditorAssetInput[],
  manifest: ReturnType<typeof parseImageStringManifest>,
): EditorAssetRootDraft {
  const rootId = rootNodeId("image-string", rootKey);
  const manifestNode = fileNode(rootKey, "manifest", {
    glyphs: Object.keys(manifest.glyphs).length,
  });
  const glyphKeys = collectImageStringAssetPaths(manifest);
  return Object.freeze({
    key: rootKey,
    kind: "image-string",
    nodeId: rootId,
    owner: `image-string:${ownerId}`,
    exactKeys: Object.freeze(inputs.map(({ key }) => key)),
    inputs: Object.freeze([...inputs]),
    nodes: Object.freeze([
      rootNode(rootId, "image-string", rootKey, { glyphs: glyphKeys.length }),
      manifestNode,
      ...glyphKeys.map((key) => fileNode(key, "texture")),
    ]),
    relations: Object.freeze([
      relation(rootId, manifestNode.id, "uses-manifest"),
      ...glyphKeys.map((key) =>
        relation(manifestNode.id, fileNodeId(key), "uses-texture"),
      ),
    ]),
  });
}

function createPackageDraft(options: {
  kind: "popup" | "symbols" | "game-layout";
  rootKey: string;
  owner: string;
  inputs: readonly EditorAssetInput[];
  manifest: unknown;
  entrypoints?: readonly string[];
}): EditorAssetRootDraft {
  const rootId = rootNodeId(options.kind, options.rootKey);
  const rootManifest = fileNode(options.rootKey, "manifest");
  const nodes = new Map<string, EditorAssetNode>([
    [rootId, rootNode(rootId, options.kind, options.rootKey, {})],
    [rootManifest.id, rootManifest],
  ]);
  const relations: EditorAssetRelation[] = [
    relation(rootId, rootManifest.id, "uses-manifest"),
  ];
  const inputByKey = new Map(options.inputs.map((item) => [item.key, item]));
  for (const key of options.entrypoints ?? []) {
    const node = fileNode(
      key,
      key.includes("gameconfig") || key.includes("game-config")
        ? "game-config"
        : "manifest",
    );
    nodes.set(node.id, node);
    relations.push(relation(rootManifest.id, node.id, "contains"));
  }
  if (options.kind === "popup") {
    const manifest = parsePopupManifest(options.manifest);
    for (const resource of Object.values(manifest.resources)) {
      if (resource.kind === "spine") {
        const skeleton = fileNode(resource.skeleton, "skeleton");
        const atlas = fileNode(resource.atlas, "atlas");
        nodes.set(skeleton.id, skeleton);
        nodes.set(atlas.id, atlas);
        relations.push(relation(rootManifest.id, skeleton.id, "contains"));
        relations.push(relation(skeleton.id, atlas.id, "uses-atlas"));
        for (const [page, key] of Object.entries(resource.textures)) {
          const texture = fileNode(key, "texture");
          nodes.set(texture.id, texture);
          relations.push(relation(atlas.id, texture.id, "uses-texture", page));
        }
        continue;
      }
      const keys =
        resource.kind === "vni"
          ? [resource.project]
          : resource.kind === "image-string" || resource.kind === "popup-object"
            ? [resource.manifest]
            : [resource.path];
      addResourceTree(nodes, relations, rootManifest.id, keys, inputByKey);
    }
  } else if (options.kind === "symbols") {
    const manifest = parseSymbolPackageManifest(options.manifest);
    addResourceTree(
      nodes,
      relations,
      rootManifest.id,
      manifest.resources,
      inputByKey,
    );
  } else {
    addResourceTree(
      nodes,
      relations,
      rootManifest.id,
      options.inputs.slice(1).map(({ key }) => key),
      inputByKey,
    );
  }
  return Object.freeze({
    key: options.rootKey,
    kind: options.kind,
    nodeId: rootId,
    owner: options.owner,
    exactKeys: Object.freeze(options.inputs.map(({ key }) => key)),
    inputs: Object.freeze([...options.inputs]),
    nodes: Object.freeze([...nodes.values()]),
    relations: Object.freeze(relations),
  });
}

function addResourceTree(
  nodes: Map<string, EditorAssetNode>,
  relations: EditorAssetRelation[],
  parentId: string,
  keys: readonly string[],
  inputByKey: ReadonlyMap<string, EditorAssetInput>,
): void {
  for (const key of keys) {
    const item = inputByKey.get(key);
    if (!item) continue;
    const kind = key.endsWith(".atlas")
      ? "atlas"
      : key.endsWith(".json")
        ? "manifest"
        : item.mediaType.startsWith("image/")
          ? "texture"
          : "payload";
    const node = fileNode(key, kind);
    nodes.set(node.id, node);
    relations.push(relation(parentId, node.id, "contains"));
    if (kind === "manifest")
      addNestedManifest(nodes, relations, node, item, inputByKey);
    if (kind === "atlas")
      addAtlasPages(nodes, relations, node, item, inputByKey);
  }
}

function addNestedManifest(
  nodes: Map<string, EditorAssetNode>,
  relations: EditorAssetRelation[],
  node: EditorAssetNode,
  item: EditorAssetInput,
  inputByKey: ReadonlyMap<string, EditorAssetInput>,
): void {
  const raw = parseJson(item.bytes, item.key);
  try {
    const imageString = parseImageStringManifest(raw);
    addResourceTree(
      nodes,
      relations,
      node.id,
      collectImageStringAssetPaths(imageString),
      inputByKey,
    );
    return;
  } catch {
    // Not an ImgNumber manifest.
  }
  try {
    const project = assertVNIProject(raw);
    addResourceTree(
      nodes,
      relations,
      node.id,
      project.assets.map(({ path }) => path),
      inputByKey,
    );
    return;
  } catch {
    // Not a VNI project.
  }
  try {
    const popupObject = parsePopupObjectManifest(raw);
    addResourceTree(
      nodes,
      relations,
      node.id,
      collectPopupObjectDirectPaths(popupObject),
      inputByKey,
    );
  } catch {
    // Other validated owner JSON is a leaf for this generic tree.
  }
}

function addAtlasPages(
  nodes: Map<string, EditorAssetNode>,
  relations: EditorAssetRelation[],
  node: EditorAssetNode,
  item: EditorAssetInput,
  inputByKey: ReadonlyMap<string, EditorAssetInput>,
): void {
  const atlas = inspectSymbolSpineAtlas(decodeText(item.bytes, item.key));
  addResourceTree(nodes, relations, node.id, atlas.pageNames, inputByKey);
}

async function resolveMappedPackage(
  entries: ReadonlyMap<string, Uint8Array>,
  controls: readonly string[],
  options: { readonly includeOpaqueControls?: boolean } = {},
): Promise<{ logical: ReadonlyMap<string, Uint8Array> }> {
  const mapBytes = requiredBytes(entries, EDITOR_ASSETS_MAP_PATH);
  const map = decodeEditorAssetsMap(mapBytes);
  const opaqueControls = options.includeOpaqueControls
    ? [...entries].filter(
        ([path]) =>
          path !== EDITOR_ASSETS_MAP_PATH &&
          !path.startsWith("assets/") &&
          !controls.includes(path),
      )
    : [];
  const resolved = await validateEditorAssetsMapPackage({
    map,
    files: entries,
    allowControlPaths: [...controls, ...opaqueControls.map(([path]) => path)],
  });
  const logical = new Map(
    [...resolved].map(([key, value]) => [key, value.bytes] as const),
  );
  for (const [path, bytes] of opaqueControls) {
    const key = basenameFromSourcePath(path);
    if (logical.has(key))
      throw new Error(`opaque control filename key collision：${key}`);
    logical.set(key, bytes);
  }
  return {
    logical,
  };
}

function assertExactMappedKeys(
  files: ReadonlyMap<string, Uint8Array>,
  expected: readonly string[],
  label: string,
): void {
  const actual = [...files.keys()].sort(compare);
  const wanted = [...expected].sort(compare);
  if (JSON.stringify(actual) !== JSON.stringify(wanted))
    throw new Error(
      `${label} mapped closure 不精确：expected=${wanted.join(",")}, actual=${actual.join(",")}`,
    );
}

function rootNode(
  id: string,
  kind: EditorAssetRootKind,
  key: string,
  metadata: Readonly<Record<string, string | number | boolean>>,
): EditorAssetNode {
  return Object.freeze({ id, kind, key, label: key, metadata });
}

function fileNode(
  key: string,
  kind: EditorAssetNode["kind"],
  metadata: Readonly<Record<string, string | number | boolean>> = {},
): EditorAssetNode {
  return Object.freeze({
    id: fileNodeId(key),
    kind,
    key,
    label: key,
    metadata: Object.freeze({ ...metadata }),
  });
}

function relation(
  from: string,
  to: string,
  kind: EditorAssetRelation["kind"],
  label?: string,
): EditorAssetRelation {
  return Object.freeze({ from, to, kind, ...(label ? { label } : {}) });
}

function rootNodeId(kind: EditorAssetRootKind, key: string): string {
  return `root:${kind}:${key}`;
}

function fileNodeId(key: string): string {
  return `file:${key}`;
}

function input(
  key: string,
  mediaType: string,
  bytes: Uint8Array,
): EditorAssetInput {
  return Object.freeze({
    key: assertEditorAssetKey(key),
    mediaType,
    bytes: bytes.slice(),
  });
}

function uniqueInputs(inputs: readonly EditorAssetInput[]): EditorAssetInput[] {
  const output = new Map<string, EditorAssetInput>();
  for (const item of inputs) {
    const previous = output.get(item.key);
    if (previous && !equalBytes(previous.bytes, item.bytes))
      throw new Error(`asset input 同 key 不同 bytes：${item.key}`);
    output.set(item.key, item);
  }
  return [...output.values()];
}

function rasterMediaType(bytes: Uint8Array): string {
  return detectRasterAssetType(bytes).mediaType;
}

function mediaTypeForKey(key: string, bytes: Uint8Array): string {
  const lower = key.toLowerCase();
  if (/\.(?:png|jpe?g|webp)$/u.test(lower)) return rasterMediaType(bytes);
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".atlas")) return "text/plain";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".otf")) return "font/otf";
  if (/\.(?:mp3|ogg|wav|m4a|aac|webm)$/u.test(lower))
    return mediaTypeForAudioFilenameKey(key);
  if (lower.endsWith(".mp4")) return "video/mp4";
  return isPlainText(bytes) ? "text/plain" : "application/octet-stream";
}

function isPlainText(bytes: Uint8Array): boolean {
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
      return false;
  }
  return true;
}

function requiredUniqueFile(
  files: readonly EditorImportSourceFile[],
  key: string,
): EditorImportSourceFile {
  const matches = files.filter((file) => file.key === key);
  if (matches.length !== 1)
    throw new Error(`asset ${key} 必须恰好存在一次，实际 ${matches.length}`);
  return matches[0]!;
}

function requiredBytes(
  files: ReadonlyMap<string, Uint8Array>,
  key: string,
): Uint8Array {
  const value = files.get(key);
  if (!value) throw new Error(`缺少文件：${key}`);
  return value;
}

function requiredMap<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} 不存在：${String(key)}`);
  return value;
}

function groupBy<T, K>(
  values: readonly T[],
  keyOf: (value: T) => K,
): Map<K, T[]> {
  const output = new Map<K, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = output.get(key) ?? [];
    group.push(value);
    output.set(key, group);
  }
  return output;
}

function assertUniqueRootKeys(drafts: readonly EditorAssetRootDraft[]): void {
  const seen = new Set<string>();
  for (const draft of drafts) {
    if (seen.has(draft.key)) throw new Error(`asset root 重复：${draft.key}`);
    seen.add(draft.key);
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(decodeText(bytes, label));
  } catch (error) {
    throw new Error(`${label} JSON 无效：${formatError(error)}`);
  }
}

function decodeText(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} UTF-8 无效：${formatError(error)}`);
  }
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(sortValue(value), null, 2)}\n`,
  );
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compare(left, right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  return value;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}

function isIsoBaseMedia(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
  );
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
