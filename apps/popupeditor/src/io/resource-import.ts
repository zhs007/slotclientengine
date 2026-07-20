import {
  allocateContentAddressedPath,
  assertLogicalResourceId,
  createBoundedSourceIndex,
  extractBoundedZip,
  sha256Hex,
  suggestLogicalResourceId,
  type SourceFileLike,
} from "@slotclientengine/browserartifactio";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
  parseWinAmountAnimationManifest,
  validateImageStringPackageContents,
  validateOfficialSpineResource,
} from "@slotclientengine/rendercore";
import { assertVNIProject } from "@slotclientengine/vnicore/core";
import type {
  AwardTierId,
  PopupResourceSpec,
} from "@slotclientengine/rendercore/popup";
import type {
  PopupEditorAssetBlob,
  PopupEditorLogicalResource,
  PopupEditorProject,
  PopupEditorResourceProvenance,
  PopupEditorTierBindingSuggestion,
} from "../model/project.js";
import { garbageCollectResourceStorage } from "../model/project.js";

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
  proposedId: string;
  readonly kind: PopupResourceSpec["kind"];
  readonly primarySource: string;
  readonly dependencyCount: number;
  readonly summary: string;
  readonly provenance: PopupEditorResourceProvenance;
  readonly spec: PopupResourceSpec;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly blobs: readonly PopupEditorAssetBlob[];
  readonly errors: readonly string[];
  readonly suggestedTierBindings?: readonly PopupEditorTierBindingSuggestion[];
}

interface DiscoveredCandidate {
  readonly candidate: PopupImportReviewCandidate;
  readonly consumed: ReadonlySet<string>;
}

export async function discoverPopupResources(
  files: readonly SourceFileLike[],
  sourceKind: "files" | "directory" = "files",
): Promise<readonly PopupImportReviewCandidate[]> {
  const index = createBoundedSourceIndex(files, POPUP_SOURCE_LIMITS);
  const loaded = new Map<string, Uint8Array>();
  for (const item of [...index].sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  ))
    if (!isIgnoredFolderMetadata(item.path))
      loaded.set(item.path, new Uint8Array(await item.file.arrayBuffer()));
  if (!loaded.size) throw new Error("上传批次为空。");

  const candidates: PopupImportReviewCandidate[] = [];
  const consumed = new Set<string>();
  const accept = (result: DiscoveredCandidate) => {
    candidates.push(result.candidate);
    for (const path of result.consumed) consumed.add(path);
  };

  for (const [path, bytes] of loaded)
    if (isZip(bytes)) {
      accept({
        candidate: await discoverImageStringZip(path, bytes, sourceKind),
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
      accept(discoverImageStringDirectory(path, loaded, sourceKind));

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
    const tierIds = descriptor.tiers.map(({ id }) => id);
    if (tierIds.join(",") !== ["bigwin", "superwin", "megawin"].join(","))
      throw new Error(
        `${path} 必须按 bigwin/superwin/megawin 顺序声明三档 VNI。`,
      );
    consumed.add(path);
    for (const tier of descriptor.tiers) {
      const projectPath = findKey(loaded, resolveRelative(path, tier.project));
      if (!vniPaths.has(projectPath))
        throw new Error(
          `${path} 引用的 ${tier.project} 不是完整、合法的 VNI project。`,
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
  for (const entry of vniEntries)
    accept(
      await discoverVni(
        [entry[0], required(loaded, entry[0])],
        loaded,
        sourceKind,
        vniBindings.get(entry[0]),
      ),
    );

  const atlasEntries = [...loaded].filter(([path]) =>
    path.toLowerCase().endsWith(".atlas"),
  );
  const spineEntries = [...jsonValues].filter(
    ([path, value]) => !consumed.has(path) && isSpineSkeleton(value),
  );
  for (const skeleton of spineEntries) {
    accept(
      await discoverSpineFromAtlases(
        [skeleton[0], required(loaded, skeleton[0])],
        atlasEntries,
        loaded,
        sourceKind,
      ),
    );
  }

  for (const [path, bytes] of loaded)
    if (!consumed.has(path) && imageType(bytes)) {
      candidates.push(await discoverImage(path, bytes, sourceKind));
      consumed.add(path);
    }

  const unknown = [...loaded.keys()].filter((path) => !consumed.has(path));
  if (unknown.length)
    throw new Error(
      `上传批次包含无法识别、未引用或不完整的文件：${unknown.join(", ")}。`,
    );
  if (!candidates.length)
    throw new Error(
      "上传批次未发现 image、VNI、official Spine 4.3 或 standalone ImgNumber 资源。",
    );
  return Object.freeze(candidates);
}

function discoverImageStringDirectory(
  manifestPath: string,
  source: ReadonlyMap<string, Uint8Array>,
  sourceKind: "files" | "directory",
): DiscoveredCandidate {
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
  const prefix = `dependencies/image-strings/${manifest.id}`;
  return {
    candidate: review({
      proposedId: manifest.id,
      kind: "image-string",
      primarySource: manifestPath,
      dependencyCount: nested.size - 1,
      summary: `${Object.keys(manifest.glyphs).length} glyphs`,
      sourceKind,
      sourceNames: [...consumed].sort((a, b) => a.localeCompare(b, "en")),
      spec: {
        kind: "image-string",
        manifest: `${prefix}/image-string.manifest.json`,
      },
      files: new Map(
        [...nested].map(([path, bytes]) => [`${prefix}/${path}`, bytes]),
      ),
      blobs: [],
    }),
    consumed,
  };
}

export function commitImportReview(
  project: PopupEditorProject,
  candidates: readonly PopupImportReviewCandidate[],
): void {
  const ids = candidates.map((candidate) =>
    assertLogicalResourceId(candidate.proposedId),
  );
  if (new Set(ids).size !== ids.length)
    throw new Error("import review logical id 冲突。");
  for (const [index, candidate] of candidates.entries()) {
    if (candidate.errors.length) throw new Error(candidate.errors.join("\n"));
    const id = ids[index]!;
    if (project.resources.has(id))
      throw new Error(`logical resource id 已存在：${id}`);
  }
  for (const [index, candidate] of candidates.entries()) {
    const id = ids[index]!;
    for (const blob of candidate.blobs) {
      const key = `${blob.digest}.${blob.extension}`;
      const current = project.blobs.get(key);
      if (current && !equal(current.bytes, blob.bytes))
        throw new Error(`SHA-256 collision guard triggered：${key}`);
      project.blobs.set(key, { ...blob, bytes: blob.bytes.slice() });
    }
    for (const [path, bytes] of candidate.files) {
      const current = project.packageFiles.get(path);
      if (current && !equal(current, bytes))
        throw new Error(`production path collision：${path}`);
      project.packageFiles.set(path, bytes.slice());
    }
    const resource: PopupEditorLogicalResource = {
      id,
      kind: candidate.kind,
      provenance: candidate.provenance,
      spec: candidate.spec,
      paths: Object.freeze([...candidate.files.keys()].sort()),
    };
    project.resources.set(id, resource);
  }
}

export function replaceResourceFromReview(
  project: PopupEditorProject,
  resourceId: string,
  candidate: PopupImportReviewCandidate,
): void {
  const existing = project.resources.get(resourceId);
  if (!existing) throw new Error(`待替换 resource 不存在：${resourceId}`);
  if (candidate.errors.length) throw new Error(candidate.errors.join("\n"));
  if (candidate.kind !== existing.kind)
    throw new Error(
      `替换必须保持 resource kind：${existing.kind} -> ${candidate.kind}`,
    );
  project.resources.delete(resourceId);
  garbageCollectResourceStorage(project);
  candidate.proposedId = resourceId;
  commitImportReview(project, [candidate]);
}

async function discoverImage(
  path: string,
  bytes: Uint8Array,
  sourceKind: "files" | "directory",
): Promise<PopupImportReviewCandidate> {
  const media = imageType(bytes);
  if (!media) throw new Error("图片内容类型不支持。");
  const size = imageSize(bytes, media.extension);
  const digest = await sha256Hex(bytes);
  const production = allocateContentAddressedPath({
    digest,
    extension: media.extension,
  });
  return review({
    proposedId: requiredSuggestion(path),
    kind: "image",
    primarySource: path,
    dependencyCount: 0,
    summary: `${size.width}×${size.height} ${media.mediaType}`,
    sourceKind,
    sourceNames: [path],
    spec: { kind: "image", path: production, size },
    files: new Map([[production, bytes]]),
    blobs: [
      {
        digest,
        extension: media.extension,
        mediaType: media.mediaType,
        byteLength: bytes.byteLength,
        bytes,
      },
    ],
  });
}

async function discoverImageStringZip(
  path: string,
  bytes: Uint8Array,
  sourceKind: "files" | "directory",
): Promise<PopupImportReviewCandidate> {
  const nested = extractBoundedZip(bytes, {
    limits: POPUP_ZIP_LIMITS,
    pathPolicy: { requireLowercase: true },
  });
  const manifest = validateImageStringPackageContents({
    manifest: parseJson(required(nested, "image-string.manifest.json")),
    files: nested,
  });
  const prefix = `dependencies/image-strings/${manifest.id}`;
  const files = new Map<string, Uint8Array>();
  for (const [nestedPath, nestedBytes] of nested)
    files.set(`${prefix}/${nestedPath}`, nestedBytes);
  return review({
    proposedId: manifest.id,
    kind: "image-string",
    primarySource: path,
    dependencyCount: nested.size - 1,
    summary: `${Object.keys(manifest.glyphs).length} glyphs`,
    sourceKind,
    sourceNames: [path],
    spec: {
      kind: "image-string",
      manifest: `${prefix}/image-string.manifest.json`,
    },
    files,
    blobs: [],
  });
}

async function discoverVni(
  projectEntry: readonly [string, Uint8Array],
  source: ReadonlyMap<string, Uint8Array>,
  sourceKind: "files" | "directory",
  suggestedTierBinding?: PopupEditorTierBindingSuggestion,
): Promise<DiscoveredCandidate> {
  const [projectPath, projectBytes] = projectEntry;
  const project = assertVNIProject(parseJson(projectBytes));
  if (
    suggestedTierBinding &&
    project.stage.duration !== suggestedTierBinding.countDurationSeconds
  )
    throw new Error(
      `${projectPath} stage.duration=${project.stage.duration} 与 win-amount descriptor durationSeconds=${suggestedTierBinding.countDurationSeconds} 不一致。`,
    );
  const consumed = new Set([projectPath]);
  const rewritten = structuredClone(project);
  const files = new Map<string, Uint8Array>();
  const blobs: PopupEditorAssetBlob[] = [];
  for (const asset of rewritten.assets) {
    const sourcePath = resolveRelative(projectPath, asset.path);
    const bytes = requiredCaseFold(source, sourcePath);
    consumed.add(findKey(source, sourcePath));
    const media = imageType(bytes);
    if (!media) throw new Error(`VNI asset 不是支持图片：${asset.path}`);
    const digest = await sha256Hex(bytes);
    const leafPath = allocateContentAddressedPath({
      digest,
      extension: media.extension,
    });
    files.set(leafPath, bytes);
    blobs.push({
      digest,
      extension: media.extension,
      mediaType: media.mediaType,
      byteLength: bytes.byteLength,
      bytes,
    });
    asset.path = leafPath.split("/").at(-1)!;
  }
  const canonical = encodeStable(rewritten);
  const digest = await sha256Hex(canonical);
  const output = allocateContentAddressedPath({ digest, extension: "json" });
  files.set(output, canonical);
  blobs.push({
    digest,
    extension: "json",
    mediaType: "application/json",
    byteLength: canonical.byteLength,
    bytes: canonical,
  });
  return {
    candidate: review({
      proposedId: requiredSuggestion(projectPath),
      kind: "vni",
      primarySource: projectPath,
      dependencyCount: rewritten.assets.length,
      summary: `${project.stage.width}×${project.stage.height}, ${project.stage.duration}s`,
      sourceKind,
      sourceNames: [...consumed].sort((a, b) => a.localeCompare(b, "en")),
      spec: { kind: "vni", project: output },
      files,
      blobs,
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
  sourceKind: "files" | "directory",
): Promise<DiscoveredCandidate> {
  const [skeletonPath, skeletonBytes] = skeletonEntry;
  const [atlasPath, atlasBytes] = atlasEntry;
  const skeleton = parseJson(skeletonBytes);
  const atlasText = decode(atlasBytes);
  const pages = parseAtlasPages(atlasText);
  const consumed = new Set([skeletonPath, atlasPath]);
  const files = new Map<string, Uint8Array>();
  const blobs: PopupEditorAssetBlob[] = [];
  const mapping = new Map<string, string>();
  const texturePaths: Record<string, string> = {};
  for (const page of pages) {
    const sourcePath = resolveRelative(atlasPath, page);
    const bytes = requiredCaseFold(source, sourcePath);
    consumed.add(findKey(source, sourcePath));
    const media = imageType(bytes);
    if (!media) throw new Error(`Spine atlas page 不是支持图片：${page}`);
    const digest = await sha256Hex(bytes);
    const output = allocateContentAddressedPath({
      digest,
      extension: media.extension,
    });
    files.set(output, bytes);
    blobs.push({
      digest,
      extension: media.extension,
      mediaType: media.mediaType,
      byteLength: bytes.byteLength,
      bytes,
    });
    const flatName = output.split("/").at(-1)!;
    mapping.set(page, flatName);
    texturePaths[flatName] = output;
  }
  const rewrittenAtlas = encode(rewriteAtlas(atlasText, mapping));
  const atlasDigest = await sha256Hex(rewrittenAtlas);
  const atlasOutput = allocateContentAddressedPath({
    digest: atlasDigest,
    extension: "atlas",
  });
  files.set(atlasOutput, rewrittenAtlas);
  blobs.push({
    digest: atlasDigest,
    extension: "atlas",
    mediaType: "text/plain",
    byteLength: rewrittenAtlas.byteLength,
    bytes: rewrittenAtlas,
  });
  const skeletonCanonical = encodeStable(skeleton);
  const skeletonDigest = await sha256Hex(skeletonCanonical);
  const skeletonOutput = allocateContentAddressedPath({
    digest: skeletonDigest,
    extension: "json",
  });
  files.set(skeletonOutput, skeletonCanonical);
  blobs.push({
    digest: skeletonDigest,
    extension: "json",
    mediaType: "application/json",
    byteLength: skeletonCanonical.byteLength,
    bytes: skeletonCanonical,
  });
  const resource = {
    skeleton,
    atlasText: decode(rewrittenAtlas),
    textureUrls: Object.fromEntries(
      Object.keys(texturePaths).map((page) => [page, `memory:${page}`]),
    ),
  };
  const metadata = validateOfficialSpineResource({
    resource,
    requiredAnimations: [],
  });
  return {
    candidate: review({
      proposedId: requiredSuggestion(skeletonPath),
      kind: "spine",
      primarySource: skeletonPath,
      dependencyCount: pages.length + 1,
      summary: `${metadata.animationNames.length} animations / ${pages.length} pages`,
      sourceKind,
      sourceNames: [...consumed].sort((a, b) => a.localeCompare(b, "en")),
      spec: {
        kind: "spine",
        skeleton: skeletonOutput,
        atlas: atlasOutput,
        textures: texturePaths,
      },
      files,
      blobs,
    }),
    consumed,
  };
}

function review(
  value: Omit<PopupImportReviewCandidate, "provenance" | "errors"> & {
    sourceKind: "files" | "directory";
    sourceNames: readonly string[];
  },
): PopupImportReviewCandidate {
  const { sourceKind, sourceNames, ...rest } = value;
  return {
    ...rest,
    provenance: {
      sourceKind,
      sourceNames: Object.freeze([...sourceNames]),
      batchLabel: `${sourceKind}:${rest.primarySource}`,
    },
    errors: Object.freeze([]),
  };
}
function requiredSuggestion(path: string) {
  const value = suggestLogicalResourceId(path.split("/").at(-1)!);
  if (!value)
    throw new Error(
      `无法从 ${path} 建议 ASCII logical id，请在 import review 显式填写。`,
    );
  return value;
}
function isZip(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}
function isIgnoredFolderMetadata(path: string) {
  const parts = path.split("/");
  const basename = parts.at(-1)?.toLowerCase();
  return (
    parts.includes("__MACOSX") ||
    parts.some((part) => part.startsWith("._")) ||
    basename === ".ds_store" ||
    basename === "thumbs.db" ||
    basename === "desktop.ini"
  );
}
function imageType(
  bytes: Uint8Array,
): { extension: "png" | "webp" | "jpg"; mediaType: string } | null {
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
  sourceKind: "files" | "directory",
): Promise<DiscoveredCandidate> {
  const directory = parentPath(skeleton[0]);
  const local = atlases.filter(([path]) => parentPath(path) === directory);
  const candidates = local.length ? local : atlases;
  const matches: DiscoveredCandidate[] = [];
  const errors: string[] = [];
  for (const atlas of candidates) {
    try {
      matches.push(await discoverSpine(skeleton, atlas, source, sourceKind));
    } catch (error) {
      errors.push(`${atlas[0]}: ${formatError(error)}`);
    }
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? `${skeleton[0]} 可关联多个 Spine atlas，必须消除歧义：${candidates.map(([path]) => path).join(", ")}。`
        : `${skeleton[0]} 找不到可用的 official Spine 4.3 atlas closure：${errors.join(" | ") || "没有 atlas 候选"}。`,
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
function requiredCaseFold(
  source: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  return source.get(findKey(source, path))!;
}
function findKey(source: ReadonlyMap<string, Uint8Array>, path: string) {
  if (source.has(path)) return path;
  const matches = [...source.keys()].filter(
    (key) => key.toLowerCase() === path.toLowerCase(),
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
function equal(a: Uint8Array, b: Uint8Array) {
  return (
    a.byteLength === b.byteLength &&
    a.every((value, index) => value === b[index])
  );
}
function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
