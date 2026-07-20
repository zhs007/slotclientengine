import {
  allocateContentAddressedPath,
  detectRasterAssetType,
  resolvePackagePath,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import { rewriteVNIProjectAssetPaths } from "@slotclientengine/vnicore/core";
import {
  collectSymbolManifestResourcePaths,
  createSymbolPackageResource,
  parseSymbolPackageManifest,
  type SymbolPackageManifestV1,
} from "./package.js";

export interface MaterializedSymbolPackageContents {
  readonly packageManifest: SymbolPackageManifestV1;
  readonly rawGameConfig: unknown;
  readonly rawSymbolManifest: unknown;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export async function materializeSymbolPackageContents(options: {
  readonly packageManifest: SymbolPackageManifestV1;
  readonly rawGameConfig: unknown;
  readonly rawSymbolManifest: unknown;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}): Promise<MaterializedSymbolPackageContents> {
  const output = new Map<string, Uint8Array>();
  const mapping = new Map<string, string>();
  for (const [path, bytes] of options.assets) {
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
  for (const [path, bytes] of options.assets) {
    if (path.startsWith("dependencies/") || !/\.json$/iu.test(path)) continue;
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
  for (const [path, bytes] of options.assets) {
    if (path.startsWith("dependencies/") || !/\.atlas$/iu.test(path)) continue;
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
  const rawSymbolManifest = rewriteSymbolManifestPaths(
    options.rawSymbolManifest,
    mapping,
  );
  const resources = collectSymbolManifestResourcePaths({
    symbolManifest: rawSymbolManifest,
    symbolManifestPath: options.packageManifest.entrypoints.symbolManifest,
    files: output,
  });
  const packageManifest = parseSymbolPackageManifest({
    ...options.packageManifest,
    resources,
  });
  const assets = new Map(
    resources.map(
      (path) => [path, requiredBytes(output, path).slice()] as const,
    ),
  );
  const rawGameConfig = structuredClone(options.rawGameConfig);
  const files = new Map<string, Uint8Array>();
  files.set("symbols.package.json", encodeStableJson(packageManifest));
  files.set(
    packageManifest.entrypoints.gameConfig,
    encodeStableJson(rawGameConfig),
  );
  files.set(
    packageManifest.entrypoints.symbolManifest,
    encodeStableJson(rawSymbolManifest),
  );
  for (const [path, bytes] of assets) files.set(path, bytes.slice());
  return Object.freeze({
    packageManifest,
    rawGameConfig,
    rawSymbolManifest,
    assets,
    files,
  });
}

export async function materializeSymbolPackageFiles(options: {
  readonly packageManifest: SymbolPackageManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): Promise<MaterializedSymbolPackageContents> {
  const resource = await createSymbolPackageResource({
    packageManifest: options.packageManifest,
    files: options.files,
    loadTextures: false,
  });
  try {
    return await materializeSymbolPackageContents({
      packageManifest: resource.packageManifest,
      rawGameConfig: resource.rawGameConfig,
      rawSymbolManifest: resource.rawSymbolManifest,
      assets: resource.assets,
    });
  } finally {
    resource.destroy();
  }
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
      rewriteValueImagePaths(presentation, mapping);
    }
  }
  return manifest;
}

function rewriteValueImagePaths(
  presentation: Record<string, unknown>,
  mapping: ReadonlyMap<string, string>,
): void {
  const text = record(presentation.text, "valuePresentation.text");
  if (text.type !== "image") return;
  if (typeof text.prefix === "string") {
    if (!Array.isArray(presentation.defaultValues))
      throw new Error("valuePresentation.defaultValues 必须是 array。");
    const images: Record<string, string> = {};
    for (const rawValue of presentation.defaultValues) {
      if (!Number.isSafeInteger(rawValue) || (rawValue as number) <= 0)
        throw new Error(
          "valuePresentation.defaultValues 必须是 positive safe integer。",
        );
      const value = rawValue as number;
      images[String(value)] = rewriteRequiredRef(
        `${text.prefix}${value}.png`,
        mapping,
      );
    }
    delete text.prefix;
    text.images = images;
    return;
  }
  const images = record(text.images, "valuePresentation.text.images");
  for (const [value, path] of Object.entries(images)) {
    if (typeof path === "string")
      images[value] = rewriteRequiredRef(path, mapping);
  }
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

function rewriteRequiredRef(
  value: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const hasPrefix = value.startsWith("./");
  const source = hasPrefix ? value.slice(2) : value;
  const target = requiredMapping(mapping, source);
  return hasPrefix ? `./${target}` : target;
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

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `${path} 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function encodeStableJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(sortValue(value), null, 2)}\n`,
  );
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
