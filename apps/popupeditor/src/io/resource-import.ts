import {
  createBoundedSourceIndex,
  extractBoundedZip,
  resolvePackagePath,
  type SourceFileLike,
} from "@slotclientengine/browserartifactio";
import {
  assertEditorAdapterProfilesChosen,
  assertNoEditorAssetKeyAliases,
  basenameFromSourcePath,
  commitEditorAssetImport,
  createEditorAssetEntry,
  createEmptyEditorAssetWorkspace,
  reviewEditorAssetImport,
  type EditorAssetEntry,
  type EditorAssetRewriteAdapter,
  type EditorAssetWorkspace,
  type EditorImportReview,
} from "@slotclientengine/editorresource";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
  parseWinAmountAnimationManifest,
  resolveImageStringPackageFiles,
  validateImageStringPackageContents,
  validateOfficialSpineResource,
} from "@slotclientengine/rendercore";
import type {
  AwardTierId,
  PopupResourceSpec,
} from "@slotclientengine/rendercore/popup";
import {
  assertVNIBundleManifest,
  assertVNIProject,
  validateManifestProjectProfile,
  validateVNIBundleManifest,
} from "@slotclientengine/vnicore/core";
import {
  clonePopupEditorProject,
  type PopupEditorProject,
  type PopupEditorResource,
  type PopupEditorTierBindingSuggestion,
} from "../model/project.js";

export const POPUP_SOURCE_LIMITS = {
  maxEntries: 1024,
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
} as const;
export const POPUP_ZIP_LIMITS = {
  ...POPUP_SOURCE_LIMITS,
  maxCompressedBytes: 128 * 1024 * 1024,
} as const;

export interface PopupImportReviewCandidate {
  readonly rootKey: string;
  readonly kind: PopupResourceSpec["kind"];
  readonly primarySource: string;
  readonly dependencyCount: number;
  readonly summary: string;
  readonly spec: PopupResourceSpec;
  readonly assets: readonly EditorAssetEntry[];
  readonly exactKeys: readonly string[];
  readonly errors: readonly string[];
  readonly suggestedTierBindings?: readonly PopupEditorTierBindingSuggestion[];
  readonly profiles?: readonly PopupVniRuntimeProfile[];
  readonly selectedProfileId?: string;
}

export interface PopupVniRuntimeProfile {
  readonly id: string;
  readonly label: string;
  readonly assetScale: number;
  readonly byteLength: number;
}

export interface PopupImportTransactionReview {
  readonly assets: EditorImportReview;
  readonly candidates: readonly PopupImportReviewCandidate[];
}

interface DiscoveredCandidate {
  readonly candidate: PopupImportReviewCandidate;
  readonly consumed: ReadonlySet<string>;
}

export async function discoverPopupResources(
  files: readonly SourceFileLike[],
  options: {
    readonly vniProfileSelections?: ReadonlyMap<string, string>;
  } = {},
): Promise<readonly PopupImportReviewCandidate[]> {
  const index = createBoundedSourceIndex(files, POPUP_SOURCE_LIMITS);
  const loaded = new Map<string, Uint8Array>();
  for (const item of [...index].sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  )) {
    const buffer = await item.file.arrayBuffer();
    if (buffer.byteLength !== item.file.size)
      throw new Error(`source file 读取尺寸与预检不一致：${item.path}`);
    loaded.set(item.path, new Uint8Array(buffer));
  }
  if (!loaded.size) throw new Error("导入批次为空。");

  const candidates: PopupImportReviewCandidate[] = [];
  const consumed = new Set<string>();
  const accept = (result: DiscoveredCandidate) => {
    candidates.push(result.candidate);
    for (const path of result.consumed) consumed.add(path);
  };

  for (const [path, bytes] of loaded)
    if (isZip(bytes)) {
      const entries = extractBoundedZip(bytes, { limits: POPUP_ZIP_LIMITS });
      accept({
        candidate: entries.has("image-string.manifest.json")
          ? await discoverImageStringZip(path, bytes)
          : await discoverVniBundleZip(
              path,
              entries,
              options.vniProfileSelections?.get(path),
            ),
        consumed: new Set([path]),
      });
    }

  const jsonValues = new Map<string, unknown>();
  for (const [path, bytes] of loaded)
    if (path.toLowerCase().endsWith(".json") && !consumed.has(path)) {
      try {
        jsonValues.set(path, parseJson(bytes));
      } catch (error) {
        throw new Error(`${path} 不是合法 JSON：${formatError(error)}。`);
      }
    }

  for (const path of jsonValues.keys())
    if (path.toLowerCase().endsWith("image-string.manifest.json"))
      accept(await discoverImageStringDirectory(path, loaded));

  const vniEntries = [...jsonValues].filter(([path, value]) => {
    if (consumed.has(path)) return false;
    try {
      assertVNIProject(value);
      return true;
    } catch {
      return false;
    }
  });
  const vniPaths = new Set(vniEntries.map(([path]) => path));
  const vniOrder = new Map<string, number>();
  const vniBindings = new Map<string, PopupEditorTierBindingSuggestion>();
  let nextVniOrder = 0;
  for (const [path, value] of jsonValues) {
    if (!isWinAmountDescriptor(value)) continue;
    const descriptor = parseWinAmountAnimationManifest(value);
    if (
      descriptor.tiers.map(({ id }) => id).join(",") !==
      ["bigwin", "superwin", "megawin"].join(",")
    )
      throw new Error(
        `${path} 必须按 bigwin/superwin/megawin 顺序声明三档 VNI。`,
      );
    consumed.add(path);
    for (const tier of descriptor.tiers) {
      const projectPath = findKey(loaded, resolveRelative(path, tier.project));
      if (!vniPaths.has(projectPath))
        throw new Error(
          `${path} 引用的 ${tier.project} 不是合法 VNI project。`,
        );
      if (!vniOrder.has(projectPath)) vniOrder.set(projectPath, nextVniOrder++);
      if (vniBindings.has(projectPath))
        throw new Error(`${projectPath} 被多个 win-amount tier 重复引用。`);
      vniBindings.set(projectPath, {
        tierId: tier.id as AwardTierId,
        countDurationSeconds: tier.playback.durationSeconds,
        playback: {
          loopStartTime: tier.playback.loopStartTime,
          loopEndTime: tier.playback.loopEndTime,
          keepParticlesAlive: tier.playback.keepParticlesAlive,
        },
      });
    }
  }
  vniEntries.sort(([left], [right]) => {
    const leftOrder = vniOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = vniOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.localeCompare(right, "en");
  });
  for (const [path] of vniEntries)
    accept(
      await discoverVni(
        [path, required(loaded, path)],
        loaded,
        vniBindings.get(path),
        true,
      ),
    );

  const atlasEntries = [...loaded].filter(([path]) =>
    path.toLowerCase().endsWith(".atlas"),
  );
  const spineEntries = [...jsonValues].filter(
    ([path, value]) => !consumed.has(path) && isSpineSkeleton(value),
  );
  for (const [path] of spineEntries)
    accept(
      await discoverSpineFromAtlases(
        [path, required(loaded, path)],
        atlasEntries,
        loaded,
      ),
    );

  for (const [path, bytes] of loaded)
    if (!consumed.has(path) && imageType(bytes)) {
      candidates.push(await discoverImage(path, bytes));
      consumed.add(path);
    }

  const unknown = [...loaded.keys()].filter((path) => !consumed.has(path));
  if (unknown.length)
    throw new Error(
      `导入批次包含无法识别、未引用或不完整的文件：${unknown.join(", ")}。`,
    );
  if (!candidates.length)
    throw new Error(
      "导入批次未发现 image、VNI、official Spine 4.3 或 ImgNumber 资源。",
    );
  assertEditorAdapterProfilesChosen(
    candidates.map((candidate) => ({
      adapterId: candidate.kind,
      rootKey: candidate.rootKey,
      exactKeys: candidate.exactKeys,
      parsed: candidate.spec,
      diagnostics: candidate.errors,
      ...(candidate.profiles ? { profiles: candidate.profiles } : {}),
      ...(candidate.selectedProfileId
        ? { selectedProfileId: candidate.selectedProfileId }
        : {}),
    })),
  );
  return Object.freeze(candidates);
}

export function inspectVniBundleProfiles(
  bytes: Uint8Array,
): readonly PopupVniRuntimeProfile[] | null {
  const entries = extractBoundedZip(bytes, { limits: POPUP_ZIP_LIMITS });
  return readVniBundleProfiles(entries);
}

function readVniBundleProfiles(
  entries: ReadonlyMap<string, Uint8Array>,
): readonly PopupVniRuntimeProfile[] | null {
  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) return null;
  const manifest = assertVNIBundleManifest(parseJson(manifestBytes));
  validateVNIBundleManifest(manifest);
  const validated = manifest.exports.map((entry) => {
    const projectBytes = required(entries, entry.path);
    const project = assertVNIProject(parseJson(projectBytes));
    validateManifestProjectProfile(entry, project);
    const assetBytes = project.assets.map(
      (asset) =>
        required(entries, resolvePackagePath(entry.path, asset.path))
          .byteLength,
    );
    return Object.freeze({
      id: entry.id,
      purpose: entry.purpose,
      label:
        entry.label ?? `${entry.id} (${entry.purpose}, ${entry.assetScale})`,
      assetScale: entry.assetScale,
      byteLength:
        projectBytes.byteLength +
        assetBytes.reduce((total, size) => total + size, 0),
    });
  });
  const runtimeProfiles = validated.filter(
    (profile): profile is PopupVniRuntimeProfile & { purpose: "runtime" } =>
      profile.purpose === "runtime",
  );
  if (!runtimeProfiles.length)
    throw new Error("VNI bundle 未声明 purpose=runtime 的运行发布包。");
  return Object.freeze(
    runtimeProfiles.map(({ purpose: _purpose, ...profile }) =>
      Object.freeze(profile),
    ),
  );
}

async function discoverVniBundleZip(
  sourcePath: string,
  entries: ReadonlyMap<string, Uint8Array>,
  selectedProfileId: string | undefined,
): Promise<PopupImportReviewCandidate> {
  const profiles = readVniBundleProfiles(entries);
  if (!profiles)
    throw new Error(`${sourcePath} 是未知 ZIP；缺少已知 root sentinel。`);
  if (profiles.length > 1 && !selectedProfileId)
    throw new Error(
      `${sourcePath} 声明多个 VNI runtime，必须明确选择：${profiles.map(({ id }) => id).join(", ")}。`,
    );
  const selected = selectedProfileId ?? profiles[0]?.id;
  if (!selected || !profiles.some(({ id }) => id === selected))
    throw new Error(
      `${sourcePath} 的 VNI runtime 选择无效：${selected ?? "未选择"}。`,
    );
  const manifest = assertVNIBundleManifest(
    parseJson(required(entries, "manifest.json")),
  );
  validateVNIBundleManifest(manifest);
  const entry = manifest.exports.find(
    ({ id, purpose }) => id === selected && purpose === "runtime",
  )!;
  const projectBytes = required(entries, entry.path);
  const project = assertVNIProject(parseJson(projectBytes));
  validateManifestProjectProfile(entry, project);
  const discovered = await discoverVni([entry.path, projectBytes], entries);
  return Object.freeze({
    ...discovered.candidate,
    primarySource: `${sourcePath}:${entry.path}`,
    profiles,
    selectedProfileId: selected,
  });
}

export async function reviewPopupImportTransaction(
  project: PopupEditorProject,
  candidates: readonly PopupImportReviewCandidate[],
): Promise<PopupImportTransactionReview> {
  for (const candidate of candidates)
    if (candidate.errors.length) throw new Error(candidate.errors.join("\n"));
  const workspace = await popupProjectWorkspace(project);
  const review = await reviewEditorAssetImport({
    workspace,
    incoming: candidates.flatMap((candidate) => candidate.assets),
    references: popupProjectAdapter.collectReferences(project),
  });
  return Object.freeze({ assets: review, candidates });
}

export async function commitImportReview(
  project: PopupEditorProject,
  candidates: readonly PopupImportReviewCandidate[],
): Promise<PopupImportTransactionReview> {
  const transaction = await reviewPopupImportTransaction(project, candidates);
  if (!transaction.assets.canCommit)
    throw new Error(transaction.assets.blockingErrors.join("\n"));
  const workspace = await popupProjectWorkspace(project);
  const candidateProject = clonePopupEditorProject(project);
  for (const candidate of candidates) {
    const resource: PopupEditorResource = {
      rootKey: candidate.rootKey,
      kind: candidate.kind,
      spec: structuredClone(candidate.spec),
      keys: Object.freeze([...candidate.exactKeys]),
    };
    candidateProject.resources.set(candidate.rootKey, resource);
  }
  const committed = await commitEditorAssetImport({
    workspace,
    project: candidateProject,
    review: transaction.assets,
    adapter: popupProjectAdapter,
  });
  candidateProject.assets = new Map(committed.workspace.entries);
  Object.assign(project, candidateProject);
  return transaction;
}

async function discoverImage(
  path: string,
  bytes: Uint8Array,
): Promise<PopupImportReviewCandidate> {
  const media = imageType(bytes);
  if (!media) throw new Error("图片内容类型不支持。");
  const size = imageSize(bytes, media.extension);
  const key = basenameFromSourcePath(path);
  const asset = await createEditorAssetEntry({
    key,
    mediaType: media.mediaType,
    bytes,
  });
  return candidate({
    rootKey: key,
    kind: "image",
    primarySource: path,
    dependencyCount: 0,
    summary: `${size.width}×${size.height} ${media.mediaType}`,
    spec: { kind: "image", path: key, size },
    assets: [asset],
  });
}

async function discoverImageStringZip(
  path: string,
  bytes: Uint8Array,
): Promise<PopupImportReviewCandidate> {
  const nested = extractBoundedZip(bytes, { limits: POPUP_ZIP_LIMITS });
  const manifest = parseImageStringManifest(
    parseJson(required(nested, "image-string.manifest.json")),
  );
  const resolved = await resolveImageStringPackageFiles({
    manifest,
    files: nested,
  });
  return createImageStringCandidate(path, manifest, resolved.files);
}

async function discoverImageStringDirectory(
  manifestPath: string,
  source: ReadonlyMap<string, Uint8Array>,
): Promise<DiscoveredCandidate> {
  const rawManifest = parseJson(required(source, manifestPath));
  const parsedManifest = parseImageStringManifest(rawManifest);
  const nested = new Map<string, Uint8Array>([
    ["image-string.manifest.json", required(source, manifestPath)],
  ]);
  const consumed = new Set([manifestPath]);
  for (const assetPath of collectImageStringAssetPaths(parsedManifest)) {
    const sourcePath = findKey(
      source,
      resolveRelative(manifestPath, assetPath),
    );
    nested.set(assetPath, required(source, sourcePath));
    consumed.add(sourcePath);
  }
  const manifest = validateImageStringPackageContents({
    manifest: rawManifest,
    files: nested,
  });
  return {
    candidate: await createImageStringCandidate(manifestPath, manifest, nested),
    consumed,
  };
}

async function createImageStringCandidate(
  primarySource: string,
  manifest: ReturnType<typeof parseImageStringManifest>,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<PopupImportReviewCandidate> {
  const rewritten = structuredClone(manifest) as {
    glyphs: Record<string, { path: string }>;
  };
  const pathMap = new Map<string, string>();
  for (const glyph of Object.values(rewritten.glyphs))
    if (!pathMap.has(glyph.path))
      pathMap.set(glyph.path, basenameFromSourcePath(glyph.path));
  assertNoEditorAssetKeyAliases([...pathMap.values()]);
  for (const glyph of Object.values(rewritten.glyphs))
    glyph.path = pathMap.get(glyph.path)!;
  const parsed = parseImageStringManifest(rewritten);
  const rootKey = "image-string.manifest.json";
  const rootBytes = encodeStable(parsed);
  const assets: EditorAssetEntry[] = [
    await createEditorAssetEntry({
      key: rootKey,
      mediaType: "application/json",
      bytes: rootBytes,
    }),
  ];
  for (const [sourcePath, key] of pathMap) {
    const payload = required(files, sourcePath);
    const media = imageType(payload);
    if (!media || media.extension === "jpg")
      throw new Error(`image-string glyph 不是 PNG/WebP：${sourcePath}`);
    assets.push(
      await createEditorAssetEntry({
        key,
        mediaType: media.mediaType,
        bytes: payload,
      }),
    );
  }
  return candidate({
    rootKey,
    kind: "image-string",
    primarySource,
    dependencyCount: assets.length - 1,
    summary: `${Object.keys(parsed.glyphs).length} glyphs`,
    spec: { kind: "image-string", manifest: rootKey },
    assets,
  });
}

async function discoverVni(
  projectEntry: readonly [string, Uint8Array],
  source: ReadonlyMap<string, Uint8Array>,
  suggestedTierBinding?: PopupEditorTierBindingSuggestion,
  sourceIsFlat = false,
): Promise<DiscoveredCandidate> {
  const [projectPath, projectBytes] = projectEntry;
  const project = assertVNIProject(parseJson(projectBytes));
  if (
    suggestedTierBinding &&
    project.stage.duration !== suggestedTierBinding.countDurationSeconds
  )
    throw new Error(
      `${projectPath} stage.duration 与 win-amount descriptor 不一致。`,
    );
  const consumed = new Set([projectPath]);
  const rewritten = structuredClone(project);
  const assets: EditorAssetEntry[] = [];
  const assetKeys: string[] = [];
  for (const asset of rewritten.assets) {
    const referencedPath = resolveRelative(projectPath, asset.path);
    const sourcePath = findKey(
      source,
      sourceIsFlat ? basenameFromSourcePath(referencedPath) : referencedPath,
    );
    const payload = required(source, sourcePath);
    consumed.add(sourcePath);
    const media = imageType(payload);
    if (!media) throw new Error(`VNI asset 不是支持图片：${asset.path}`);
    const key = basenameFromSourcePath(sourcePath);
    asset.path = key;
    assetKeys.push(key);
    assets.push(
      await createEditorAssetEntry({
        key,
        mediaType: media.mediaType,
        bytes: payload,
      }),
    );
  }
  assertNoEditorAssetKeyAliases(assetKeys);
  const rootKey = basenameFromSourcePath(projectPath);
  const canonical = encodeStable(rewritten);
  assets.push(
    await createEditorAssetEntry({
      key: rootKey,
      mediaType: "application/json",
      bytes: canonical,
    }),
  );
  return {
    candidate: candidate({
      rootKey,
      kind: "vni",
      primarySource: projectPath,
      dependencyCount: rewritten.assets.length,
      summary: `${project.stage.width}×${project.stage.height}, ${project.stage.duration}s`,
      spec: { kind: "vni", project: rootKey },
      assets,
      ...(suggestedTierBinding
        ? { suggestedTierBindings: [suggestedTierBinding] }
        : {}),
    }),
    consumed,
  };
}

async function discoverSpine(
  skeletonEntry: readonly [string, Uint8Array],
  atlasEntry: readonly [string, Uint8Array],
  source: ReadonlyMap<string, Uint8Array>,
): Promise<DiscoveredCandidate> {
  const [skeletonPath, skeletonBytes] = skeletonEntry;
  const [atlasPath, atlasBytes] = atlasEntry;
  const skeleton = parseJson(skeletonBytes);
  const atlasText = decode(atlasBytes);
  const pages = parseAtlasPages(atlasText);
  const consumed = new Set([skeletonPath, atlasPath]);
  const assets: EditorAssetEntry[] = [];
  const mapping = new Map<string, string>();
  const textureKeys: Record<string, string> = {};
  for (const page of pages) {
    const sourcePath = findKey(source, resolveRelative(atlasPath, page));
    const payload = required(source, sourcePath);
    consumed.add(sourcePath);
    const media = imageType(payload);
    if (!media) throw new Error(`Spine atlas page 不是支持图片：${page}`);
    const key = basenameFromSourcePath(sourcePath);
    mapping.set(page, key);
    textureKeys[key] = key;
    assets.push(
      await createEditorAssetEntry({
        key,
        mediaType: media.mediaType,
        bytes: payload,
      }),
    );
  }
  assertNoEditorAssetKeyAliases([...mapping.values()]);
  const atlasKey = basenameFromSourcePath(atlasPath);
  const rewrittenAtlas = encode(rewriteAtlas(atlasText, mapping));
  assets.push(
    await createEditorAssetEntry({
      key: atlasKey,
      mediaType: "text/plain",
      bytes: rewrittenAtlas,
    }),
  );
  const skeletonKey = basenameFromSourcePath(skeletonPath);
  const skeletonCanonical = encodeStable(skeleton);
  assets.push(
    await createEditorAssetEntry({
      key: skeletonKey,
      mediaType: "application/json",
      bytes: skeletonCanonical,
    }),
  );
  const resource = {
    skeleton,
    atlasText: decode(rewrittenAtlas),
    textureUrls: Object.fromEntries(
      Object.keys(textureKeys).map((page) => [page, `memory:${page}`]),
    ),
  };
  const metadata = validateOfficialSpineResource({
    resource,
    requiredAnimations: [],
  });
  return {
    candidate: candidate({
      rootKey: skeletonKey,
      kind: "spine",
      primarySource: skeletonPath,
      dependencyCount: pages.length + 1,
      summary: `${metadata.animationNames.length} animations / ${pages.length} pages`,
      spec: {
        kind: "spine",
        skeleton: skeletonKey,
        atlas: atlasKey,
        textures: textureKeys,
      },
      assets,
    }),
    consumed,
  };
}

function candidate(
  value: Omit<PopupImportReviewCandidate, "exactKeys" | "errors">,
): PopupImportReviewCandidate {
  return Object.freeze({
    ...value,
    exactKeys: Object.freeze(value.assets.map(({ key }) => key).sort()),
    errors: Object.freeze([]),
  });
}

const popupProjectAdapter: EditorAssetRewriteAdapter<PopupEditorProject> = {
  cloneProject: clonePopupEditorProject,
  collectReferences(project) {
    return {
      references: [
        ...[...project.resources].flatMap(([rootKey, resource]) =>
          resource.keys.map((key) => ({
            key,
            location: `resources.${JSON.stringify(rootKey)}.${key}`,
            kind: resource.kind,
          })),
        ),
        ...[...project.tiers].flatMap(([tierId, tier]) =>
          tier.layers.map((layer, index) => ({
            key: layer.resource,
            location: `tiers.${tierId}.layers[${index}].resource`,
            kind: "layer",
          })),
        ),
      ],
    };
  },
  renameReferences(project, from, to) {
    const resource = project.resources.get(from);
    if (resource) {
      project.resources.delete(from);
      project.resources.set(to, {
        ...resource,
        rootKey: to,
        spec: renamePopupSpec(resource.spec, from, to),
        keys: resource.keys.map((key) => (key === from ? to : key)),
      });
    }
    for (const [rootKey, value] of project.resources)
      project.resources.set(rootKey, {
        ...value,
        spec: renamePopupSpec(value.spec, from, to),
        keys: value.keys.map((key) => (key === from ? to : key)),
      });
    for (const tier of project.tiers.values())
      tier.layers = tier.layers.map((layer) =>
        layer.resource === from ? { ...layer, resource: to } : layer,
      );
    return project;
  },
};

function renamePopupSpec(
  spec: PopupResourceSpec,
  from: string,
  to: string,
): PopupResourceSpec {
  if (spec.kind === "image")
    return { ...spec, path: spec.path === from ? to : spec.path };
  if (spec.kind === "image-string")
    return { ...spec, manifest: spec.manifest === from ? to : spec.manifest };
  if (spec.kind === "vni")
    return { ...spec, project: spec.project === from ? to : spec.project };
  return {
    ...spec,
    skeleton: spec.skeleton === from ? to : spec.skeleton,
    atlas: spec.atlas === from ? to : spec.atlas,
    textures: Object.fromEntries(
      Object.entries(spec.textures).map(([page, key]) => [
        page === from ? to : page,
        key === from ? to : key,
      ]),
    ),
  };
}

async function popupProjectWorkspace(
  project: PopupEditorProject,
): Promise<EditorAssetWorkspace> {
  if (!project.assets.size) return createEmptyEditorAssetWorkspace();
  const empty = createEmptyEditorAssetWorkspace();
  const review = await reviewEditorAssetImport({
    workspace: empty,
    incoming: [...project.assets.values()],
  });
  return (
    await commitEditorAssetImport({
      workspace: empty,
      project: null,
      review,
      adapter: {
        cloneProject: () => null,
        collectReferences: () => ({ references: [] }),
        renameReferences: () => null,
      },
    })
  ).workspace;
}

function isZip(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}
function imageType(bytes: Uint8Array): {
  extension: "png" | "webp" | "jpg";
  mediaType: "image/png" | "image/webp" | "image/jpeg";
} | null {
  if (bytes[0] === 0x89 && decode(bytes.slice(1, 4)) === "PNG")
    return { extension: "png", mediaType: "image/png" };
  if (
    decode(bytes.slice(0, 4)) === "RIFF" &&
    decode(bytes.slice(8, 12)) === "WEBP"
  )
    return { extension: "webp", mediaType: "image/webp" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8)
    return { extension: "jpg", mediaType: "image/jpeg" };
  return null;
}
function imageSize(bytes: Uint8Array, extension: string) {
  if (extension === "png") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  throw new Error(
    `当前 image importer 需要浏览器 decode 确认 ${extension} 尺寸；请使用 PNG。`,
  );
}
function isWinAmountDescriptor(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === "vni-win-amount-tiers",
  );
}
function isSpineSkeleton(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "skeleton" in value);
}
async function discoverSpineFromAtlases(
  skeleton: readonly [string, Uint8Array],
  atlases: readonly (readonly [string, Uint8Array])[],
  source: ReadonlyMap<string, Uint8Array>,
): Promise<DiscoveredCandidate> {
  const directory = parentPath(skeleton[0]);
  const local = atlases.filter(([path]) => parentPath(path) === directory);
  const choices = local.length ? local : atlases;
  const matches: DiscoveredCandidate[] = [];
  const errors: string[] = [];
  for (const atlas of choices)
    try {
      matches.push(await discoverSpine(skeleton, atlas, source));
    } catch (error) {
      errors.push(`${atlas[0]}: ${formatError(error)}`);
    }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? `${skeleton[0]} 可关联多个 Spine atlas，必须消除歧义。`
        : `${skeleton[0]} 找不到 official Spine 4.3 closure：${errors.join(" | ")}。`,
    );
  return matches[0]!;
}
function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}
function parseAtlasPages(text: string) {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const next = lines.slice(index + 1).find((item) => item.length > 0);
    if (
      line &&
      !/^\s/u.test(line) &&
      !line.includes(":") &&
      next?.startsWith("size:")
    )
      pages.push(line);
  }
  if (!pages.length || new Set(pages).size !== pages.length)
    throw new Error("Spine atlas page 结构无效或重复。");
  return pages;
}
function rewriteAtlas(text: string, mapping: ReadonlyMap<string, string>) {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  return `${lines
    .map((line) => mapping.get(line) ?? line)
    .join("\n")
    .replace(/\n+$/u, "")}\n`;
}
function resolveRelative(base: string, ref: string) {
  const stack = base.split("/").slice(0, -1);
  for (const part of ref.split("/")) {
    if (part === "..") stack.pop();
    else if (part !== "." && part) stack.push(part);
  }
  return stack.join("/");
}
function findKey(source: ReadonlyMap<string, Uint8Array>, path: string) {
  if (source.has(path)) return path;
  const matches = [...source.keys()].filter(
    (key) => key.toLocaleLowerCase("en-US") === path.toLocaleLowerCase("en-US"),
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? `source 大小写匹配歧义：${path}`
        : `source 缺失：${path}`,
    );
  return matches[0]!;
}
function required(map: ReadonlyMap<string, Uint8Array>, path: string) {
  const bytes = map.get(path);
  if (!bytes) throw new Error(`缺少 ${path}`);
  return bytes;
}
function parseJson(bytes: Uint8Array) {
  return JSON.parse(decode(bytes));
}
function decode(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function encode(text: string) {
  return new TextEncoder().encode(text);
}
function encodeStable(value: unknown) {
  return encode(`${JSON.stringify(sort(value), null, 2)}\n`);
}
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, child]) => [key, sort(child)]),
  );
}
function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
