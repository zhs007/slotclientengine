import {
  ObjectUrlRegistry,
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
  resolvePackagePath,
} from "@slotclientengine/browserartifactio";
import {
  createGameConfig,
  type LogicGameConfig,
} from "@slotclientengine/logiccore";
import { Assets, Cache, type Texture } from "pixi.js";
import { createRenderSymbolValueController } from "../symbol-value-presentation/render-symbol-value-controller.js";
import { createSymbolValuePresentationResourcesFromManifest } from "../symbol-value-presentation/create-symbol-value-presenter.js";
import type { SymbolValuePresentationResourceMap } from "../symbol-value-presentation/types.js";
import type {
  ReelSymbolRenderPriorityMap,
  ReelSymbolScaleMap,
} from "../reel/types.js";
import { SymbolAssetError } from "./errors.js";
import {
  createSymbolAnimationCapabilityMapFromManifest,
  createSymbolAssetMapFromManifestModules,
  createSymbolRenderPriorityMapFromManifest,
  createSymbolScaleMapFromManifest,
  createSymbolStatePresetFromManifest,
  createSymbolValuePresentationImagePath,
  parseSymbolStateTextureManifest,
  type ParsedSymbolStateTextureManifest,
  type SymbolManifestNormal,
} from "./manifest.js";
import { createSymbolManifestAnimationResolver } from "./vni-animation.js";
import { createDefaultSymbolAnimationResolver } from "./animation-resolver.js";
import { createSymbolCatalog, type SymbolCatalogModel } from "./catalog.js";
import type {
  RenderSymbolValueController,
  SymbolAnimationResolver,
  SymbolAssetMap,
  SymbolNormalTextureSource,
  SymbolStatePreset,
  SymbolTextureSet,
} from "./types.js";
import type { RenderSymbol } from "./render-symbol.js";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
  validateImageStringText,
} from "../image-string/index.js";
import {
  createSymbolImageStringControllerFactories,
  createSymbolImageStringResourcePool,
  createSymbolImageStringResourcesFromPool,
  type SymbolImageStringResourceMap,
  type SymbolImageStringResourcePool,
} from "../symbol-image-string/index.js";

export interface SymbolPackageManifestV1 {
  readonly version: 1;
  readonly kind: "symbol-package";
  readonly id: string;
  readonly cellSize: Readonly<{ width: number; height: number }>;
  readonly entrypoints: Readonly<{
    gameConfig: string;
    symbolManifest: string;
  }>;
  readonly resources: readonly string[];
}

export interface SymbolPackageResource {
  readonly packageManifest: SymbolPackageManifestV1;
  readonly rawGameConfig: unknown;
  readonly rawSymbolManifest: unknown;
  readonly gameConfig: LogicGameConfig;
  readonly symbolManifest: ParsedSymbolStateTextureManifest;
  readonly displaySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
  readonly statePreset: SymbolStatePreset;
  readonly animationResolver: SymbolAnimationResolver;
  readonly valuePresentationResources: SymbolValuePresentationResourceMap;
  readonly imageStringResources: SymbolImageStringResourceMap;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  createCatalog(): Promise<SymbolCatalogModel>;
  destroy(): void;
}

export interface SymbolPackageGameConfigSymbol {
  readonly code: number;
  readonly symbol: string;
}

export function parseSymbolPackageGameConfig(rawGameConfig: unknown): {
  readonly gameConfig: LogicGameConfig;
  readonly symbols: readonly SymbolPackageGameConfigSymbol[];
} {
  const gameConfig = createGameConfig(rawGameConfig);
  const raw = assertRecord(gameConfig.getRawConfig(), "game config");
  const symbolCodes = assertRecord(raw.symbolCodes, "game config symbolCodes");
  const symbols = Object.entries(symbolCodes)
    .map(([symbol, code]) => {
      if (!Number.isSafeInteger(code) || (code as number) < 0) {
        throw new SymbolAssetError(
          `game config symbolCodes["${symbol}"] must be a non-negative safe integer.`,
        );
      }
      return Object.freeze({ code: code as number, symbol });
    })
    .sort((left, right) => left.code - right.code);
  return Object.freeze({ gameConfig, symbols: Object.freeze(symbols) });
}

export function parseSymbolPackageManifest(
  value: unknown,
): SymbolPackageManifestV1 {
  const record = assertRecord(value, "symbols.package.json");
  assertKeys(
    record,
    ["version", "kind", "id", "cellSize", "entrypoints", "resources"],
    "symbols.package.json",
  );
  if (record.version !== 1)
    throw new SymbolAssetError("symbol package version must be 1.");
  if (record.kind !== "symbol-package")
    throw new SymbolAssetError('symbol package kind must be "symbol-package".');
  if (
    typeof record.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.id)
  ) {
    throw new SymbolAssetError(
      "symbol package id must be lowercase ASCII kebab-case.",
    );
  }
  const cell = assertRecord(record.cellSize, "symbol package cellSize");
  assertKeys(cell, ["width", "height"], "symbol package cellSize");
  const cellSize = Object.freeze({
    width: finitePositive(cell.width, "symbol package cellSize.width"),
    height: finitePositive(cell.height, "symbol package cellSize.height"),
  });
  const entrypoints = assertRecord(
    record.entrypoints,
    "symbol package entrypoints",
  );
  assertKeys(
    entrypoints,
    ["gameConfig", "symbolManifest"],
    "symbol package entrypoints",
  );
  const gameConfig = packagePath(
    entrypoints.gameConfig,
    "entrypoints.gameConfig",
  );
  const symbolManifest = packagePath(
    entrypoints.symbolManifest,
    "entrypoints.symbolManifest",
  );
  if (gameConfig === symbolManifest)
    throw new SymbolAssetError("symbol package entrypoints must be different.");
  if (!Array.isArray(record.resources)) {
    throw new SymbolAssetError("symbol package resources must be an array.");
  }
  const resources = record.resources.map((path, index) =>
    packagePath(path, `resources[${index}]`),
  );
  assertNoPackagePathCollisions(resources);
  const sorted = [...resources].sort(comparePaths);
  if (!resources.every((path, index) => path === sorted[index])) {
    throw new SymbolAssetError(
      "symbol package resources must be sorted by canonical path.",
    );
  }
  if (resources.includes(gameConfig) || resources.includes(symbolManifest)) {
    throw new SymbolAssetError(
      "symbol package entrypoints must not appear in resources.",
    );
  }
  return deepFreeze({
    version: 1,
    kind: "symbol-package",
    id: record.id,
    cellSize,
    entrypoints: { gameConfig, symbolManifest },
    resources,
  });
}

export function collectSymbolPackageEntryPaths(
  manifestValue: unknown,
): readonly string[] {
  const manifest = parseSymbolPackageManifest(manifestValue);
  return Object.freeze(
    [
      "symbols.package.json",
      manifest.entrypoints.gameConfig,
      manifest.entrypoints.symbolManifest,
      ...manifest.resources,
    ].sort(comparePaths),
  );
}

export function validateSymbolPackageContents(options: {
  readonly packageManifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): SymbolPackageManifestV1 {
  const manifest = parseSymbolPackageManifest(options.packageManifest);
  const actual = [...options.files.keys()];
  for (const path of actual) assertCanonicalPackagePath(path);
  assertNoPackagePathCollisions(actual);
  const expected = collectSymbolPackageEntryPaths(manifest);
  const sortedActual = actual.sort(comparePaths);
  if (!sameStrings(expected, sortedActual)) {
    throw new SymbolAssetError(
      `symbol package entries must equal the declared closure; expected=${expected.join(",")}, actual=${sortedActual.join(",")}.`,
    );
  }
  return manifest;
}

export function validateSymbolPackageGameConfig(options: {
  readonly rawGameConfig: unknown;
  readonly symbolManifest: unknown;
}): {
  readonly gameConfig: LogicGameConfig;
  readonly displaySymbols: readonly string[];
} {
  const { gameConfig } = parseSymbolPackageGameConfig(options.rawGameConfig);
  const manifest = parseSymbolStateTextureManifest(options.symbolManifest);
  const displaySymbols = Object.keys(manifest.symbols).sort((left, right) => {
    return requireCode(gameConfig, left) - requireCode(gameConfig, right);
  });
  for (const symbol of displaySymbols) requireCode(gameConfig, symbol);
  return Object.freeze({
    gameConfig,
    displaySymbols: Object.freeze(displaySymbols),
  });
}

export function collectSymbolManifestResourcePaths(options: {
  readonly symbolManifest: unknown;
  readonly symbolManifestPath?: string;
  readonly files?: ReadonlyMap<string, Uint8Array>;
}): readonly string[] {
  const manifestPath =
    options.symbolManifestPath ?? "symbol-state-textures.manifest.json";
  assertCanonicalPackagePath(manifestPath);
  const manifest = parseSymbolStateTextureManifest(options.symbolManifest);
  const paths = new Set<string>();
  const packageFiles = options.files;
  const add = (reference: string) =>
    paths.add(resolvePackagePath(manifestPath, reference));
  const addImageStringDependency = (options: {
    readonly resource: string;
    readonly text: string;
    readonly label: string;
  }): void => {
    const manifestResourcePath = resolvePackagePath(
      manifestPath,
      options.resource,
    );
    paths.add(manifestResourcePath);
    if (!packageFiles) {
      throw new SymbolAssetError(
        `Image-string dependency ${manifestResourcePath} requires package files to derive its exact glyph closure.`,
      );
    }
    const nested = parseImageStringManifest(
      parseJsonFile(
        packageFiles,
        manifestResourcePath,
        "image-string manifest",
      ),
    );
    try {
      validateImageStringText(options.text, nested);
    } catch (error) {
      throw new SymbolAssetError(
        `${options.label} is invalid: ${formatError(error)}.`,
      );
    }
    for (const glyphPath of collectImageStringAssetPaths(nested)) {
      paths.add(resolvePackagePath(manifestResourcePath, glyphPath));
    }
  };
  for (const entry of Object.values(manifest.symbols)) {
    collectNormal(entry.normal, add);
    for (const statePath of Object.values(entry.states)) add(statePath);
    for (const animation of Object.values(entry.animations)) {
      if (
        !animation ||
        animation.kind === "builtin" ||
        animation.kind === "static" ||
        animation.kind === "empty" ||
        animation.kind === "activeSpine"
      )
        continue;
      if (animation.kind === "vni") {
        add(animation.project);
        if (options.files) {
          const projectPath = resolvePackagePath(
            manifestPath,
            animation.project,
          );
          const project = parseJsonFile(
            options.files,
            projectPath,
            "VNI project",
          ) as { assets?: unknown };
          if (!Array.isArray(project.assets))
            throw new SymbolAssetError(
              `VNI project ${projectPath} assets must be an array.`,
            );
          for (const [index, rawAsset] of project.assets.entries()) {
            const asset = assertRecord(
              rawAsset,
              `VNI project ${projectPath} assets[${index}]`,
            );
            if (typeof asset.path !== "string")
              throw new SymbolAssetError(
                `VNI project ${projectPath} asset path must be a string.`,
              );
            paths.add(resolvePackagePath(projectPath, asset.path));
          }
        }
      } else {
        add(animation.skeleton);
        add(animation.atlas);
        add(animation.texture);
      }
    }
    const presentation = entry.valuePresentation;
    if (presentation) {
      for (const tier of presentation.tiers) {
        add(tier.animation.skeleton);
        add(tier.animation.atlas);
        add(tier.animation.texture);
      }
      if (presentation.text.type === "image") {
        for (const value of presentation.defaultValues) {
          add(createSymbolValuePresentationImagePath(presentation.text, value));
        }
      } else if (presentation.text.type === "image-string") {
        for (const value of presentation.defaultValues) {
          const tierIndex = presentation.tiers.findIndex(
            (tier) =>
              tier.maxExclusive === undefined || value < tier.maxExclusive,
          );
          const binding = presentation.text.tiers[tierIndex];
          if (!binding) {
            throw new SymbolAssetError(
              `Value ${value} has no image-string tier binding.`,
            );
          }
          addImageStringDependency({
            resource: binding.resource,
            text: String(value),
            label: `Value ${value} image-string tier ${tierIndex}`,
          });
        }
      }
    }
    for (const node of entry.imageStringNodes) {
      addImageStringDependency({
        resource: node.resource,
        text: node.initialText,
        label: `Image-string node "${node.name}" initialText`,
      });
    }
  }
  const sorted = [...paths].sort(comparePaths);
  assertNoPackagePathCollisions(sorted);
  return Object.freeze(sorted);
}

export async function createSymbolPackageResource(options: {
  readonly packageManifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly loadTextures?: boolean;
}): Promise<SymbolPackageResource> {
  const packageManifest = validateSymbolPackageContents(options);
  const rawGameConfig = parseJsonFile(
    options.files,
    packageManifest.entrypoints.gameConfig,
    "game config",
  );
  const rawSymbolManifest = parseJsonFile(
    options.files,
    packageManifest.entrypoints.symbolManifest,
    "symbol manifest",
  );
  const { gameConfig, displaySymbols } = validateSymbolPackageGameConfig({
    rawGameConfig,
    symbolManifest: rawSymbolManifest,
  });
  const symbolManifest = parseSymbolStateTextureManifest(rawSymbolManifest);
  const requiredResources = collectSymbolManifestResourcePaths({
    symbolManifest: rawSymbolManifest,
    symbolManifestPath: packageManifest.entrypoints.symbolManifest,
    files: options.files,
  });
  if (!sameStrings(requiredResources, packageManifest.resources)) {
    throw new SymbolAssetError(
      `symbol package resources contain missing or orphan entries; required=${requiredResources.join(",")}, declared=${packageManifest.resources.join(",")}.`,
    );
  }
  const urls = new ObjectUrlRegistry();
  const textureUrls: string[] = [];
  let destroyed = false;
  let imageStringPool: SymbolImageStringResourcePool | null = null;
  try {
    const modules = createPackageModules(
      packageManifest,
      options.files,
      urls,
      textureUrls,
    );
    if (options.loadTextures !== false) {
      await Promise.all(
        Object.values(modules.imageModules).map(loadPackageTexture),
      );
    }
    const urlAssetMap = createSymbolAssetMapFromManifestModules({
      modules: modules.imageModules,
      manifest: rawSymbolManifest,
      displaySymbols,
    });
    const assetMap =
      options.loadTextures === false
        ? urlAssetMap
        : await loadSymbolAssetMap(urlAssetMap);
    const animationResolver = createSymbolManifestAnimationResolver({
      manifest: rawSymbolManifest,
      vniProjectModules: modules.vniProjectModules,
      vniAssetModules: modules.imageModules,
      spineSkeletonModules: modules.skeletonModules,
      spineAtlasModules: modules.atlasModules,
      spineTextureModules: modules.imageModules,
      fallback: createDefaultSymbolAnimationResolver(),
    });
    const imageStringResourcePaths = Object.values(
      symbolManifest.symbols,
    ).flatMap((entry) => [
      ...entry.imageStringNodes.map((node) => node.resource),
      ...(entry.valuePresentation?.text.type === "image-string"
        ? entry.valuePresentation.text.tiers.map((binding) => binding.resource)
        : []),
    ]);
    imageStringPool =
      options.loadTextures === false
        ? null
        : await createSymbolImageStringResourcePool({
            symbolManifestPath: packageManifest.entrypoints.symbolManifest,
            resourcePaths: imageStringResourcePaths,
            imageStringManifests: modules.imageStringManifestModules,
            imageModules: modules.imageModules,
          });
    const imageStringResources = imageStringPool
      ? createSymbolImageStringResourcesFromPool({
          manifest: symbolManifest,
          pool: imageStringPool,
        })
      : Object.freeze({});
    const hasValueImageStrings = Object.values(symbolManifest.symbols).some(
      (entry) => entry.valuePresentation?.text.type === "image-string",
    );
    const valuePresentationResources =
      options.loadTextures === false && hasValueImageStrings
        ? Object.freeze({})
        : createSymbolValuePresentationResourcesFromManifest({
            manifest: rawSymbolManifest,
            spineSkeletonModules: modules.skeletonModules,
            spineAtlasModules: modules.atlasModules,
            spineTextureModules: modules.imageModules,
            textImageModules: modules.imageModules,
            ...(imageStringPool
              ? { imageStringResourcePool: imageStringPool }
              : {}),
          });
    const symbolScales = createSymbolScaleMapFromManifest({
      manifest: rawSymbolManifest,
      displaySymbols,
    });
    const symbolRenderPriorities = createSymbolRenderPriorityMapFromManifest({
      manifest: rawSymbolManifest,
      displaySymbols,
    });
    const statePreset = createSymbolStatePresetFromManifest(rawSymbolManifest);
    const animationCapabilities =
      createSymbolAnimationCapabilityMapFromManifest({
        manifest: rawSymbolManifest,
        displaySymbols,
      });
    const assets = new Map(
      packageManifest.resources.map(
        (path) => [path, options.files.get(path)!.slice()] as const,
      ),
    );
    const resource: SymbolPackageResource = {
      packageManifest,
      rawGameConfig,
      rawSymbolManifest,
      gameConfig,
      symbolManifest,
      displaySymbols,
      symbolScales,
      symbolRenderPriorities,
      statePreset,
      animationResolver,
      valuePresentationResources,
      imageStringResources,
      assets,
      async createCatalog(): Promise<SymbolCatalogModel> {
        if (destroyed)
          throw new SymbolAssetError("symbol package resource is destroyed.");
        if (options.loadTextures === false) {
          throw new SymbolAssetError(
            "symbol package resource was created without loaded textures.",
          );
        }
        return createSymbolCatalog({
          gameConfig,
          assets: assetMap,
          symbolRenderPriorities,
          statePreset,
          animationResolver,
          symbolAnimationCapabilities: animationCapabilities,
          symbolImageStringControllerFactories:
            createSymbolImageStringControllerFactories(imageStringResources),
          texturePolicy: { requiredStateTextures: [] },
        });
      },
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        unloadCachedPackageTextures(textureUrls);
        void imageStringPool?.destroy();
        urls.destroy();
      },
    };
    return Object.freeze(resource);
  } catch (error) {
    await imageStringPool?.destroy();
    unloadCachedPackageTextures(textureUrls);
    urls.destroy();
    throw error;
  }
}

function unloadCachedPackageTextures(textureUrls: readonly string[]): void {
  for (const url of textureUrls) {
    if (!Cache.has(url)) continue;
    void Assets.unload(url).catch(() => undefined);
  }
}

export function createSymbolPackageValueControllerFactory(
  resource: SymbolPackageResource,
  symbol: string,
): ((root: RenderSymbol) => RenderSymbolValueController) | undefined {
  const presentation = resource.valuePresentationResources[symbol];
  if (!presentation) return undefined;
  return (root) =>
    createRenderSymbolValueController({ root, resource: presentation });
}

function createPackageModules(
  manifest: SymbolPackageManifestV1,
  files: ReadonlyMap<string, Uint8Array>,
  urls: ObjectUrlRegistry,
  textureUrls: string[],
): {
  imageModules: Record<string, string>;
  vniProjectModules: Record<string, unknown>;
  skeletonModules: Record<string, unknown>;
  atlasModules: Record<string, string>;
  imageStringManifestModules: Record<string, unknown>;
} {
  const imageModules: Record<string, string> = {};
  const vniProjectModules: Record<string, unknown> = {};
  const skeletonModules: Record<string, unknown> = {};
  const atlasModules: Record<string, string> = {};
  const imageStringManifestModules: Record<string, unknown> = {};
  for (const path of manifest.resources) {
    const bytes = files.get(path)!;
    const lower = path.toLowerCase();
    if (/\.(?:png|jpe?g|webp)$/u.test(lower)) {
      const url = urls.create(
        new Blob([bytes as BlobPart], { type: mimeType(path) }),
      );
      imageModules[path] = url;
      textureUrls.push(url);
    } else if (lower.endsWith(".atlas")) {
      atlasModules[path] = decodeUtf8(bytes, path);
    } else if (lower.endsWith(".json")) {
      const value = parseJsonBytes(bytes, path);
      if (isVniProject(value)) vniProjectModules[path] = value;
      else if (isImageStringManifest(value))
        imageStringManifestModules[path] = value;
      else skeletonModules[path] = value;
    }
  }
  return {
    imageModules,
    vniProjectModules,
    skeletonModules,
    atlasModules,
    imageStringManifestModules,
  };
}

async function loadSymbolAssetMap(
  assetMap: SymbolAssetMap,
): Promise<SymbolAssetMap> {
  const entries = await Promise.all(
    Object.entries(assetMap).map(async ([symbol, asset]) => {
      if (typeof asset === "string")
        return [symbol, await loadPackageTexture(asset)] as const;
      if (!isSymbolTextureSet(asset)) return [symbol, asset] as const;
      const normal = await loadNormalTexture(asset.normal);
      const states = Object.fromEntries(
        await Promise.all(
          Object.entries(asset.states ?? {}).map(async ([state, texture]) => [
            state,
            texture ? await loadTexture(texture) : texture,
          ]),
        ),
      );
      return [
        symbol,
        Object.freeze({ normal, states: Object.freeze(states) }),
      ] as const;
    }),
  );
  return Object.freeze(Object.fromEntries(entries));
}

async function loadNormalTexture(
  value: Texture | string | SymbolNormalTextureSource<Texture | string>,
): Promise<Texture | SymbolNormalTextureSource<Texture>> {
  if (typeof value === "string") return loadPackageTexture(value);
  if (!isSymbolNormalTextureSource(value)) return value;
  if (value.kind === "transparent") return value;
  if (value.kind === "single") {
    return Object.freeze({
      ...value,
      texture: await loadTexture(value.texture),
    });
  }
  return Object.freeze({
    ...value,
    layers: Object.freeze(
      await Promise.all(
        value.layers.map(async (layer) =>
          Object.freeze({
            ...layer,
            texture: await loadTexture(layer.texture),
            keyframes: Object.freeze(
              await Promise.all(
                (layer.keyframes ?? []).map((keyframe) =>
                  loadTexture(keyframe),
                ),
              ),
            ),
          }),
        ),
      ),
    ),
  });
}

function isSymbolNormalTextureSource(
  value: Texture | SymbolNormalTextureSource<Texture | string>,
): value is SymbolNormalTextureSource<Texture | string> {
  return typeof value === "object" && value !== null && "kind" in value;
}

function isSymbolTextureSet(
  value: SymbolAssetMap[string],
): value is SymbolTextureSet<Texture | string> {
  return typeof value === "object" && value !== null && "normal" in value;
}

async function loadTexture(value: string | Texture): Promise<Texture> {
  return typeof value === "string" ? loadPackageTexture(value) : value;
}

async function loadPackageTexture(url: string): Promise<Texture> {
  const texture = (await Assets.load({
    src: url,
    parser: "loadTextures",
  })) as Texture | null | undefined;
  if (!texture?.source) {
    throw new SymbolAssetError(
      `symbol package image failed to load a valid Pixi texture: ${url}.`,
    );
  }
  return texture;
}

function collectNormal(
  normal: SymbolManifestNormal,
  add: (path: string) => void,
): void {
  if (typeof normal === "string") add(normal);
  else if (normal.kind === "layered") {
    for (const layer of normal.layers) {
      add(layer.texture);
      for (const keyframe of layer.keyframes) add(keyframe);
    }
  }
}

function parseJsonFile(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
  label: string,
): unknown {
  const bytes = files.get(path);
  if (!bytes) throw new SymbolAssetError(`${label} is missing: ${path}.`);
  return parseJsonBytes(bytes, path);
}

function parseJsonBytes(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(decodeUtf8(bytes, path));
  } catch (error) {
    throw new SymbolAssetError(
      `${path} is invalid JSON: ${formatError(error)}.`,
    );
  }
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new SymbolAssetError(
      `${path} is not valid UTF-8: ${formatError(error)}.`,
    );
  }
}

function packagePath(value: unknown, label: string): string {
  if (typeof value !== "string")
    throw new SymbolAssetError(`${label} must be a string.`);
  try {
    return assertCanonicalPackagePath(value);
  } catch (error) {
    throw new SymbolAssetError(`${label} is invalid: ${formatError(error)}.`);
  }
}

function requireCode(gameConfig: LogicGameConfig, symbol: string): number {
  const code = gameConfig.getSymbolCode(symbol);
  if (code === undefined)
    throw new SymbolAssetError(
      `manifest symbol "${symbol}" does not exist in game config.`,
    );
  const entry = gameConfig.getPaytableEntry(code);
  if (!entry || entry.symbol !== symbol || entry.code !== code) {
    throw new SymbolAssetError(
      `manifest symbol "${symbol}" does not match game config code/paytable.`,
    );
  }
  return code;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SymbolAssetError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function assertKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void {
  const set = new Set(allowed);
  for (const key of Object.keys(record))
    if (!set.has(key))
      throw new SymbolAssetError(`${label} contains unknown key "${key}".`);
  for (const key of allowed)
    if (!(key in record))
      throw new SymbolAssetError(`${label} is missing key "${key}".`);
}

function finitePositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new SymbolAssetError(`${label} must be a finite positive number.`);
  return value;
}

function isVniProject(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    "assets" in value &&
    "stage" in value,
  );
}

function isImageStringManifest(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === "image-string",
  );
}

function mimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function comparePaths(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}
