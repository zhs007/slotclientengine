import {
  allocateContentAddressedPath,
  createDeterministicZip,
  detectRasterAssetType,
  extractBoundedZip,
  resolvePackagePath,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  collectSymbolManifestResourcePaths,
  createSymbolPackageResource,
  parseSymbolPackageManifest,
  type SymbolPackageResource,
  rewriteVNIProjectAssetPaths,
} from "@slotclientengine/rendercore/symbol";
import {
  createFromImportedPackage,
  exportSnapshot,
  type SymbolEditorProject,
} from "../model/editor-project.js";

export const SYMBOL_ZIP_LIMITS = Object.freeze({
  maxEntries: 1024,
  maxCompressedBytes: 100 * 1024 * 1024,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
});

export interface ImportedSymbolEditorPackage {
  readonly project: SymbolEditorProject;
  readonly resource: SymbolPackageResource;
  destroy(): void;
}

export async function importSymbolPackageZip(
  bytes: Uint8Array,
  options: { readonly loadTextures?: boolean } = {},
): Promise<ImportedSymbolEditorPackage> {
  const files = extractBoundedZip(bytes, { limits: SYMBOL_ZIP_LIMITS });
  const manifestBytes = files.get("symbols.package.json");
  if (!manifestBytes)
    throw new Error("zip 根目录必须包含 symbols.package.json。");
  const rawPackageManifest = parseJson(manifestBytes, "symbols.package.json");
  const packageManifest = parseSymbolPackageManifest(rawPackageManifest);
  const resource = await createSymbolPackageResource({
    packageManifest,
    files,
    loadTextures: options.loadTextures,
  });
  try {
    const project = createFromImportedPackage({
      packageManifest,
      rawGameConfig: resource.rawGameConfig,
      rawSymbolManifest: resource.rawSymbolManifest,
      assets: resource.assets,
    });
    let destroyed = false;
    return Object.freeze({
      project,
      resource,
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        resource.destroy();
      },
    });
  } catch (error) {
    resource.destroy();
    throw error;
  }
}

export async function exportSymbolPackageZip(
  project: SymbolEditorProject,
  options: { readonly loadTextures?: boolean } = {},
): Promise<{
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly blob: Blob;
}> {
  const snapshot = await materializeSymbolEditorSnapshot(
    exportSnapshot(project),
  );
  const files = createSnapshotFiles(snapshot);
  const validationResource = await createSymbolPackageResource({
    packageManifest: snapshot.packageManifest,
    files,
    loadTextures: options.loadTextures,
  });
  validationResource.destroy();
  const bytes = createDeterministicZip(files);
  return Object.freeze({
    fileName: `${snapshot.packageManifest.id}-symbols.zip`,
    bytes,
    blob: new Blob([bytes as BlobPart], { type: "application/zip" }),
  });
}

export async function materializeSymbolEditorSnapshot(
  snapshot: ReturnType<typeof exportSnapshot>,
): Promise<ReturnType<typeof exportSnapshot>> {
  const output = new Map<string, Uint8Array>();
  const mapping = new Map<string, string>();
  for (const [path, bytes] of snapshot.assets) {
    if (path.startsWith("dependencies/")) {
      output.set(path, bytes.slice());
      continue;
    }
    if (!/\.(?:png|jpe?g|webp)$/iu.test(path)) continue;
    const type = detectRasterAssetType(bytes);
    const target = allocateContentAddressedPath({
      digest: await sha256Hex(bytes),
      extension: type.extension,
    });
    putFile(output, target, bytes);
    mapping.set(path, target);
  }
  for (const [path, bytes] of snapshot.assets) {
    if (path.startsWith("dependencies/") || !path.endsWith(".json")) continue;
    const raw = parseJson(bytes, path);
    let canonical: Uint8Array;
    try {
      const rewritten = rewriteVNIProjectAssetPaths(
        raw,
        (assetPath: string) => {
          const source = resolvePackagePath(path, assetPath);
          const target = requiredMapping(mapping, source);
          return target.split("/").at(-1)!;
        },
      );
      canonical = encodeStableJson(rewritten);
    } catch (error) {
      if (isVniLike(raw)) throw error;
      canonical = encodeStableJson(raw);
    }
    const target = allocateContentAddressedPath({
      digest: await sha256Hex(canonical),
      extension: "json",
    });
    putFile(output, target, canonical);
    mapping.set(path, target);
  }
  for (const [path, bytes] of snapshot.assets) {
    if (path.startsWith("dependencies/") || !path.endsWith(".atlas")) continue;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const pages = inspectAtlasPages(text);
    const pageMapping = new Map<string, string>();
    for (const page of pages) {
      const source = resolvePackagePath(path, page);
      const target = requiredMapping(mapping, source);
      pageMapping.set(page, target.split("/").at(-1)!);
    }
    const canonical = new TextEncoder().encode(rewriteAtlas(text, pageMapping));
    const target = allocateContentAddressedPath({
      digest: await sha256Hex(canonical),
      extension: "atlas",
    });
    putFile(output, target, canonical);
    mapping.set(path, target);
  }
  const symbolManifest = rewriteSymbolManifestPaths(
    snapshot.symbolManifest,
    mapping,
  );
  const allFiles = new Map(output);
  const resources = collectSymbolManifestResourcePaths({
    symbolManifest,
    symbolManifestPath: "symbol-state-textures.manifest.json",
    files: allFiles,
  });
  const packageManifest = parseSymbolPackageManifest({
    ...snapshot.packageManifest,
    resources,
  });
  return Object.freeze({
    packageManifest,
    rawGameConfig: structuredClone(snapshot.rawGameConfig),
    symbolManifest,
    assets: new Map(
      resources.map(
        (path) => [path, requiredBytes(allFiles, path).slice()] as const,
      ),
    ),
  });
}

export function createSnapshotFiles(
  snapshot: ReturnType<typeof exportSnapshot>,
): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set("symbols.package.json", encodeStableJson(snapshot.packageManifest));
  files.set(
    snapshot.packageManifest.entrypoints.gameConfig,
    encodeStableJson(snapshot.rawGameConfig),
  );
  files.set(
    snapshot.packageManifest.entrypoints.symbolManifest,
    encodeStableJson(snapshot.symbolManifest),
  );
  for (const [path, bytes] of snapshot.assets) files.set(path, bytes.slice());
  return files;
}

export function encodeStableJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(sortValue(value), null, 2)}\n`,
  );
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `${path} 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}

function rewriteSymbolManifestPaths(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): unknown {
  const manifest = structuredClone(value) as Record<string, unknown>;
  const stateIds = Array.isArray(manifest.states)
    ? manifest.states.filter(
        (state): state is string => typeof state === "string",
      )
    : [];
  const symbols = record(manifest.symbols, "symbol manifest.symbols");
  for (const rawEntry of Object.values(symbols)) {
    const entry = record(rawEntry, "symbol manifest symbol");
    entry.normal = rewriteNormal(entry.normal, mapping);
    for (const state of stateIds) {
      if (typeof entry[state] === "string")
        entry[state] = rewriteRef(entry[state], mapping);
    }
    if (entry.animations) {
      const animations = record(entry.animations, "symbol animations");
      for (const animation of Object.values(animations))
        rewriteAnimation(record(animation, "symbol animation"), mapping);
    }
    if (entry.valuePresentation) {
      const presentation = record(entry.valuePresentation, "valuePresentation");
      const reelStates = record(
        presentation.reelStates,
        "valuePresentation.reelStates",
      );
      for (const [state, path] of Object.entries(reelStates)) {
        if (state !== "normal" && typeof path === "string")
          reelStates[state] = rewriteRef(path, mapping);
      }
      if (Array.isArray(presentation.tiers)) {
        for (const tier of presentation.tiers) {
          const animation = record(
            record(tier, "valuePresentation tier").animation,
            "valuePresentation tier.animation",
          );
          rewriteAnimation(animation, mapping);
        }
      }
    }
  }
  return manifest;
}

function rewriteNormal(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === "string") return rewriteRef(value, mapping);
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normal = value as Record<string, unknown>;
  if (normal.kind !== "layered" || !Array.isArray(normal.layers)) return normal;
  for (const rawLayer of normal.layers) {
    const layer = record(rawLayer, "symbol normal layer");
    if (typeof layer.texture === "string")
      layer.texture = rewriteRef(layer.texture, mapping);
    if (Array.isArray(layer.keyframes))
      layer.keyframes = layer.keyframes.map((path) =>
        typeof path === "string" ? rewriteRef(path, mapping) : path,
      );
  }
  return normal;
}

function rewriteAnimation(
  animation: Record<string, unknown>,
  mapping: ReadonlyMap<string, string>,
): void {
  if (animation.kind === "vni" && typeof animation.project === "string") {
    animation.project = rewriteRef(animation.project, mapping);
  } else if (animation.kind === "spine") {
    for (const key of ["skeleton", "atlas", "texture"] as const) {
      if (typeof animation[key] === "string")
        animation[key] = rewriteRef(animation[key], mapping);
    }
  }
  if ("base" in animation)
    animation.base = rewriteNormal(animation.base, mapping);
}

function rewriteRef(
  value: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const hasPrefix = value.startsWith("./");
  const source = hasPrefix ? value.slice(2) : value;
  const target = mapping.get(source);
  return target ? (hasPrefix ? `./${target}` : target) : value;
}

function inspectAtlasPages(text: string): readonly string[] {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const pages = lines.filter((line, index) => {
    if (!line || /^\s/u.test(line) || line.includes(":")) return false;
    return lines
      .slice(index + 1)
      .find((candidate) => candidate.length > 0)
      ?.startsWith("size:");
  });
  if (pages.length === 0 || new Set(pages).size !== pages.length)
    throw new Error("Spine atlas page 结构无效或重复。");
  return pages;
}

function rewriteAtlas(
  text: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  return `${lines
    .map((line) => mapping.get(line) ?? line)
    .join("\n")
    .replace(/\n+$/u, "")}\n`;
}

function requiredMapping(
  mapping: ReadonlyMap<string, string>,
  path: string,
): string {
  const target = mapping.get(path);
  if (!target) throw new Error(`结构化资源依赖未物化：${path}`);
  return target;
}

function requiredBytes(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`materialized symbol closure 缺少：${path}`);
  return bytes;
}

function putFile(
  files: Map<string, Uint8Array>,
  path: string,
  bytes: Uint8Array,
): void {
  const current = files.get(path);
  if (
    current &&
    (current.byteLength !== bytes.byteLength ||
      current.some((value, index) => value !== bytes[index]))
  )
    throw new Error(`content-addressed path collision：${path}`);
  if (!current) files.set(path, bytes.slice());
}

function isVniLike(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    "assets" in value &&
    "layers" in value,
  );
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} 必须是 object。`);
  return value as Record<string, unknown>;
}
