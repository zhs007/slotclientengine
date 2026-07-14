import type {
  GameConfigPaytableEntry,
  LogicGameConfig,
} from "@slotclientengine/logiccore";
import type { Texture } from "pixi.js";
import { RenderSymbol } from "../symbol/render-symbol.js";
import { createRenderSymbolValueController } from "../symbol-value-presentation/render-symbol-value-controller.js";
import type { SymbolValuePresentationResourceMap } from "../symbol-value-presentation/types.js";
import {
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createSymbolDefinitionFromPreset,
  validateSymbolStatePreset,
} from "../symbol/index.js";
import type {
  SymbolAnimationResolver,
  SymbolAssetMap,
  SymbolDefinition,
  SymbolLayerTextureSource,
  SymbolNormalTextureSource,
  SymbolStateId,
  SymbolTextureSet,
} from "../symbol/index.js";
import { ReelAssetError } from "./errors.js";
import type {
  ReelCellSize,
  ReelSymbolRegistry,
  ReelSymbolRegistryEntry,
  ReelSymbolRegistryOptions,
  ReelSymbolRegistryValidation,
} from "./types.js";

interface NormalizedTextureSet {
  readonly normal: SymbolNormalTextureSource<Texture>;
  readonly states?: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly scale: number;
  readonly renderPriority: number;
}

export class ReelSymbolRegistryModel implements ReelSymbolRegistry {
  readonly #entriesByCode: ReadonlyMap<number, ReelSymbolRegistryEntry>;
  readonly #entriesBySymbol: ReadonlyMap<string, ReelSymbolRegistryEntry>;
  readonly #definitionsByCode: ReadonlyMap<number, SymbolDefinition>;
  readonly #textureSetsByCode: ReadonlyMap<number, NormalizedTextureSet>;
  readonly #validation: ReelSymbolRegistryValidation;
  readonly #cellSize: ReelCellSize;
  readonly #animationResolver: SymbolAnimationResolver;
  readonly #requiredStateTextures: readonly SymbolStateId[];
  readonly #valuePresentationResources: SymbolValuePresentationResourceMap;

  constructor(options: ReelSymbolRegistryOptions) {
    const statePreset = options.statePreset ?? createDefaultSymbolStatePreset();
    const validatedPreset = validateSymbolStatePreset(statePreset);
    const requiredStateTextures = normalizeRequiredStateTextures(
      options.texturePolicy?.requiredStateTextures ?? [],
      validatedPreset.statesById,
    );
    const animationResolver =
      options.animationResolver ?? createDefaultSymbolAnimationResolver();
    const configuredEmptySymbolSet = new Set(options.emptySymbols ?? []);
    const paytableEntries = extractPaytableEntries(options.gameConfig);
    const paytableSymbolSet = new Set(
      paytableEntries.map((entry) => entry.symbol),
    );
    const symbolScales = normalizeSymbolScales(
      options.symbolScales,
      paytableSymbolSet,
    );
    const symbolRenderPriorities = normalizeSymbolRenderPriorities(
      options.symbolRenderPriorities,
      paytableSymbolSet,
    );
    const assetSymbols = Object.keys(options.assets).sort();
    const assetSymbolSet = new Set(assetSymbols);

    const entriesByCode = new Map<number, ReelSymbolRegistryEntry>();
    const entriesBySymbol = new Map<string, ReelSymbolRegistryEntry>();
    const definitionsByCode = new Map<number, SymbolDefinition>();
    const textureSetsByCode = new Map<number, NormalizedTextureSet>();
    const texturedSymbols: string[] = [];
    const configuredEmptySymbolsWithAssets: string[] = [];
    const missingAssetEmptySymbols: string[] = [];

    for (const emptySymbol of configuredEmptySymbolSet) {
      if (!paytableSymbolSet.has(emptySymbol)) {
        throw new ReelAssetError(
          `Configured empty symbol "${emptySymbol}" does not exist in paytable.`,
        );
      }
    }

    for (const entry of paytableEntries) {
      if (configuredEmptySymbolSet.has(entry.symbol)) {
        if (assetSymbolSet.has(entry.symbol)) {
          configuredEmptySymbolsWithAssets.push(entry.symbol);
        }
        this.addEntry(entriesByCode, entriesBySymbol, entry, "empty");
        continue;
      }

      if (!assetSymbolSet.has(entry.symbol)) {
        missingAssetEmptySymbols.push(entry.symbol);
        this.addEntry(entriesByCode, entriesBySymbol, entry, "empty");
        continue;
      }

      const textureSet = normalizeTextureSet(
        entry.symbol,
        options.assets[entry.symbol],
        symbolScales.get(entry.symbol) ?? 1,
        symbolRenderPriorities.get(entry.symbol) ?? 0,
      );
      assertRequiredStateTextures(
        entry.symbol,
        textureSet,
        requiredStateTextures,
      );
      this.addEntry(entriesByCode, entriesBySymbol, entry, "textured");
      definitionsByCode.set(
        entry.code,
        createSymbolDefinitionFromPreset({
          code: entry.code,
          symbol: entry.symbol,
          pays: entry.pays,
          preset: statePreset,
        }),
      );
      textureSetsByCode.set(entry.code, textureSet);
      texturedSymbols.push(entry.symbol);
    }

    if (texturedSymbols.length === 0) {
      throw new ReelAssetError(
        "Reel symbol registry requires at least one textured symbol.",
      );
    }

    const ignoredAssetsWithoutPaytable = assetSymbols.filter(
      (symbol) => !paytableSymbolSet.has(symbol),
    );
    this.#entriesByCode = entriesByCode;
    this.#entriesBySymbol = entriesBySymbol;
    this.#definitionsByCode = definitionsByCode;
    this.#textureSetsByCode = textureSetsByCode;
    this.#animationResolver = animationResolver;
    this.#requiredStateTextures = requiredStateTextures;
    this.#valuePresentationResources =
      options.valuePresentationResources ?? Object.freeze({});
    this.#cellSize = calculateCellSize([...textureSetsByCode.values()]);
    this.#validation = Object.freeze({
      texturedSymbols: Object.freeze(texturedSymbols),
      configuredEmptySymbols: Object.freeze([...configuredEmptySymbolSet]),
      configuredEmptySymbolsWithAssets: Object.freeze(
        configuredEmptySymbolsWithAssets,
      ),
      missingAssetEmptySymbols: Object.freeze(missingAssetEmptySymbols),
      ignoredAssetsWithoutPaytable: Object.freeze(ignoredAssetsWithoutPaytable),
    });
  }

  getValidation(): ReelSymbolRegistryValidation {
    return Object.freeze({
      texturedSymbols: Object.freeze([...this.#validation.texturedSymbols]),
      configuredEmptySymbols: Object.freeze([
        ...this.#validation.configuredEmptySymbols,
      ]),
      configuredEmptySymbolsWithAssets: Object.freeze([
        ...this.#validation.configuredEmptySymbolsWithAssets,
      ]),
      missingAssetEmptySymbols: Object.freeze([
        ...this.#validation.missingAssetEmptySymbols,
      ]),
      ignoredAssetsWithoutPaytable: Object.freeze([
        ...this.#validation.ignoredAssetsWithoutPaytable,
      ]),
    });
  }

  getEntryByCode(code: number): ReelSymbolRegistryEntry {
    const entry = this.#entriesByCode.get(code);
    if (!entry) {
      throw new ReelAssetError(
        `Symbol code ${code} does not exist in reel registry.`,
      );
    }
    return entry;
  }

  getEntryBySymbol(symbol: string): ReelSymbolRegistryEntry {
    const entry = this.#entriesBySymbol.get(symbol);
    if (!entry) {
      throw new ReelAssetError(
        `Symbol "${symbol}" does not exist in reel registry.`,
      );
    }
    return entry;
  }

  getCellSize(): ReelCellSize {
    return Object.freeze({ ...this.#cellSize });
  }

  createRenderSymbolByCode(code: number): RenderSymbol | null {
    const entry = this.getEntryByCode(code);
    if (entry.kind === "empty") {
      return null;
    }

    const definition = this.#definitionsByCode.get(code);
    const textureSet = this.#textureSetsByCode.get(code);
    if (!definition || !textureSet) {
      throw new ReelAssetError(
        `Textured symbol code ${code} is missing render assets.`,
      );
    }

    const valueResource = this.#valuePresentationResources[entry.symbol];
    const renderSymbol = new RenderSymbol({
      definition,
      texture: textureSet.normal,
      stateTextures: textureSet.states,
      requiredStateTextures: this.#requiredStateTextures,
      animationResolver: this.#animationResolver,
      renderPriority: textureSet.renderPriority,
      ...(valueResource === undefined
        ? {}
        : {
            valueControllerFactory: (root) =>
              createRenderSymbolValueController({
                root,
                resource: valueResource,
              }),
          }),
    });
    renderSymbol.scale.set(textureSet.scale);
    return renderSymbol;
  }

  private addEntry(
    entriesByCode: Map<number, ReelSymbolRegistryEntry>,
    entriesBySymbol: Map<string, ReelSymbolRegistryEntry>,
    entry: GameConfigPaytableEntry,
    kind: ReelSymbolRegistryEntry["kind"],
  ): void {
    const registryEntry = Object.freeze({
      code: entry.code,
      symbol: entry.symbol,
      kind,
    });
    entriesByCode.set(entry.code, registryEntry);
    entriesBySymbol.set(entry.symbol, registryEntry);
  }
}

export function createReelSymbolRegistry(
  options: ReelSymbolRegistryOptions,
): ReelSymbolRegistryModel {
  return new ReelSymbolRegistryModel(options);
}

function normalizeTextureSet(
  symbol: string,
  asset: SymbolAssetMap[string],
  scale: number,
  renderPriority: number,
): NormalizedTextureSet {
  if (asset === undefined || asset === null) {
    throw new ReelAssetError(
      `Symbol "${symbol}" asset must include a normal texture.`,
    );
  }

  if (isSymbolTextureSet(asset)) {
    return Object.freeze({
      normal: normalizeNormalTextureSource(symbol, asset.normal),
      states: normalizeTextureStates(symbol, asset.states ?? {}),
      scale,
      renderPriority,
    });
  }

  return Object.freeze({
    normal: normalizeNormalTextureSource(symbol, asset),
    states: Object.freeze({}),
    scale,
    renderPriority,
  });
}

function normalizeNormalTextureSource(
  symbol: string,
  normal: Texture | string | SymbolNormalTextureSource<Texture | string>,
): SymbolNormalTextureSource<Texture> {
  if (isSymbolNormalTextureSource(normal)) {
    if (normal.kind === "single") {
      return Object.freeze({
        kind: "single",
        texture: assertLoadedTexture(symbol, "normal", normal.texture),
      });
    }
    if (normal.kind === "transparent") {
      return Object.freeze({
        kind: "transparent",
        width: assertPositiveDimension(
          normal.width,
          `Symbol "${symbol}" transparent normal width`,
        ),
        height: assertPositiveDimension(
          normal.height,
          `Symbol "${symbol}" transparent normal height`,
        ),
      });
    }
    return normalizeLayeredTextureSource(symbol, normal.layers);
  }

  return Object.freeze({
    kind: "single",
    texture: assertLoadedTexture(symbol, "normal", normal),
  });
}

function normalizeLayeredTextureSource(
  symbol: string,
  layers: readonly SymbolLayerTextureSource<Texture | string>[],
): SymbolNormalTextureSource<Texture> {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new ReelAssetError(
      `Symbol "${symbol}" layered normal texture must include layers.`,
    );
  }

  const seen = new Set<number>();
  let width: number | null = null;
  let height: number | null = null;
  const normalizedLayers = [...layers]
    .sort((left, right) => left.index - right.index)
    .map((layer, expectedIndex) => {
      if (!Number.isInteger(layer.index) || layer.index < 0) {
        throw new ReelAssetError(
          `Symbol "${symbol}" layer index must be a non-negative integer.`,
        );
      }
      if (seen.has(layer.index)) {
        throw new ReelAssetError(
          `Symbol "${symbol}" declares duplicate layer index ${layer.index}.`,
        );
      }
      seen.add(layer.index);
      if (layer.index !== expectedIndex) {
        throw new ReelAssetError(
          `Symbol "${symbol}" layered normal texture must use consecutive indexes from 0.`,
        );
      }
      const texture = assertLoadedTexture(
        symbol,
        `layer ${layer.index}`,
        layer.texture,
      );
      const layerWidth = getTextureWidth(texture);
      const layerHeight = getTextureHeight(texture);
      width ??= layerWidth;
      height ??= layerHeight;
      if (width !== layerWidth || height !== layerHeight) {
        throw new ReelAssetError(
          `Symbol "${symbol}" layered textures must have identical dimensions.`,
        );
      }
      const keyframes = normalizeLayerKeyframes(symbol, layer, texture);
      return Object.freeze({
        index: layer.index,
        texture,
        keyframes,
      });
    });

  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(normalizedLayers),
  });
}

function normalizeLayerKeyframes(
  symbol: string,
  layer: SymbolLayerTextureSource<Texture | string>,
  texture: Texture,
): readonly Texture[] {
  if (layer.keyframes === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(layer.keyframes) || layer.keyframes.length === 0) {
    throw new ReelAssetError(
      `Symbol "${symbol}" layer ${layer.index} keyframes must be a non-empty array.`,
    );
  }
  const width = getTextureWidth(texture);
  const height = getTextureHeight(texture);
  const keyframes = layer.keyframes.map((keyframe, keyframeIndex) => {
    const loadedKeyframe = assertLoadedTexture(
      symbol,
      `layer ${layer.index} keyframe ${keyframeIndex}`,
      keyframe,
    );
    if (
      getTextureWidth(loadedKeyframe) !== width ||
      getTextureHeight(loadedKeyframe) !== height
    ) {
      throw new ReelAssetError(
        `Symbol "${symbol}" layer ${layer.index} keyframe textures must match the layer texture dimensions.`,
      );
    }
    return loadedKeyframe;
  });
  if (keyframes[0] !== texture) {
    throw new ReelAssetError(
      `Symbol "${symbol}" layer ${layer.index} keyframes must start with the layer texture.`,
    );
  }
  return Object.freeze(keyframes);
}

function normalizeTextureStates(
  symbol: string,
  states: Readonly<Partial<Record<string, Texture | string>>>,
): Readonly<Partial<Record<SymbolStateId, Texture>>> {
  const normalized: Partial<Record<SymbolStateId, Texture>> = {};
  for (const [state, texture] of Object.entries(states)) {
    if (texture === undefined) {
      throw new ReelAssetError(
        `Symbol "${symbol}" texture for state "${state}" must exist.`,
      );
    }
    normalized[state] = assertLoadedTexture(symbol, state, texture);
  }
  return Object.freeze(normalized);
}

function assertLoadedTexture(
  symbol: string,
  state: string,
  texture: Texture | string,
): Texture {
  if (typeof texture === "string") {
    throw new ReelAssetError(
      `Symbol "${symbol}" texture for state "${state}" is a URL string; pass a loaded Texture.`,
    );
  }
  if (!texture || typeof texture !== "object") {
    throw new ReelAssetError(
      `Symbol "${symbol}" texture for state "${state}" must exist.`,
    );
  }
  const width = getTextureWidth(texture);
  const height = getTextureHeight(texture);
  if (width <= 0 || height <= 0) {
    throw new ReelAssetError(
      `Symbol "${symbol}" texture for state "${state}" must have positive dimensions.`,
    );
  }
  return texture;
}

function assertRequiredStateTextures(
  symbol: string,
  textureSet: NormalizedTextureSet,
  requiredStateTextures: readonly SymbolStateId[],
): void {
  for (const state of requiredStateTextures) {
    if (!textureSet.states?.[state]) {
      throw new ReelAssetError(
        `Symbol "${symbol}" is missing required texture for state "${state}".`,
      );
    }
  }
}

function calculateCellSize(
  textureSets: readonly NormalizedTextureSet[],
): ReelCellSize {
  let width = 0;
  let height = 0;
  for (const textureSet of textureSets) {
    const normalSize = getNormalTextureSize(textureSet.normal);
    width = Math.max(width, normalSize.width * textureSet.scale);
    height = Math.max(height, normalSize.height * textureSet.scale);
  }

  if (width <= 0 || height <= 0) {
    throw new ReelAssetError(
      "Reel symbol registry cannot calculate cell size without textures.",
    );
  }

  return Object.freeze({ width, height });
}

function getNormalTextureSize(
  normal: SymbolNormalTextureSource<Texture>,
): ReelCellSize {
  if (normal.kind === "transparent") {
    return Object.freeze({
      width: normal.width,
      height: normal.height,
    });
  }
  const texture =
    normal.kind === "single" ? normal.texture : normal.layers[0].texture;
  return Object.freeze({
    width: getTextureWidth(texture),
    height: getTextureHeight(texture),
  });
}

function getTextureWidth(texture: Texture): number {
  return Math.max(
    0,
    texture.width || texture.source?.width || texture.orig?.width || 0,
  );
}

function getTextureHeight(texture: Texture): number {
  return Math.max(
    0,
    texture.height || texture.source?.height || texture.orig?.height || 0,
  );
}

function normalizeSymbolScales(
  symbolScales: Readonly<Record<string, number>> | undefined,
  paytableSymbolSet: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const normalized = new Map<string, number>();
  for (const [symbol, scale] of Object.entries(symbolScales ?? {})) {
    if (!paytableSymbolSet.has(symbol)) {
      throw new ReelAssetError(
        `Symbol scale for "${symbol}" does not exist in paytable.`,
      );
    }
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new ReelAssetError(
        `Symbol "${symbol}" scale must be a positive number.`,
      );
    }
    normalized.set(symbol, scale);
  }
  return normalized;
}

function normalizeSymbolRenderPriorities(
  symbolRenderPriorities: Readonly<Record<string, number>> | undefined,
  paytableSymbolSet: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const normalized = new Map<string, number>();
  for (const [symbol, renderPriority] of Object.entries(
    symbolRenderPriorities ?? {},
  )) {
    if (!paytableSymbolSet.has(symbol)) {
      throw new ReelAssetError(
        `Symbol renderPriority for "${symbol}" does not exist in paytable.`,
      );
    }
    if (
      typeof renderPriority !== "number" ||
      !Number.isSafeInteger(renderPriority) ||
      renderPriority < 0
    ) {
      throw new ReelAssetError(
        `Symbol "${symbol}" renderPriority must be a non-negative safe integer.`,
      );
    }
    normalized.set(symbol, renderPriority);
  }
  return normalized;
}

function isSymbolTextureSet(
  asset: SymbolAssetMap[string],
): asset is SymbolTextureSet<Texture | string> {
  return typeof asset === "object" && asset !== null && "normal" in asset;
}

function isSymbolNormalTextureSource(
  normal: Texture | string | SymbolNormalTextureSource<Texture | string>,
): normal is SymbolNormalTextureSource<Texture | string> {
  return (
    typeof normal === "object" &&
    normal !== null &&
    "kind" in normal &&
    (normal.kind === "single" ||
      normal.kind === "layered" ||
      normal.kind === "transparent")
  );
}

function normalizeRequiredStateTextures(
  requiredStateTextures: readonly SymbolStateId[],
  statesById: ReadonlyMap<SymbolStateId, unknown>,
): readonly SymbolStateId[] {
  const unique: SymbolStateId[] = [];
  for (const state of requiredStateTextures) {
    if (!statesById.has(state)) {
      throw new ReelAssetError(
        `Required texture state "${state}" does not exist in state preset.`,
      );
    }
    if (!unique.includes(state)) {
      unique.push(state);
    }
  }
  return Object.freeze(unique);
}

function extractPaytableEntries(
  gameConfig: LogicGameConfig,
): readonly GameConfigPaytableEntry[] {
  const rawConfig = gameConfig.getRawConfig();
  const rawConfigRecord = assertRecord(rawConfig, "gameConfig");
  const paytableRecord = assertRecord(
    rawConfigRecord.paytable,
    "gameConfig.paytable",
  );

  return Object.freeze(
    Object.keys(paytableRecord)
      .map((codeKey) => Number.parseInt(codeKey, 10))
      .sort((left, right) => left - right)
      .map((code) => {
        const entry = gameConfig.getPaytableEntry(code);
        if (!entry) {
          throw new ReelAssetError(
            `Paytable entry code ${code} was not accepted by gameConfig.`,
          );
        }
        return Object.freeze({
          code: entry.code,
          symbol: entry.symbol,
          pays: Object.freeze([...entry.pays]),
        });
      }),
  );
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReelAssetError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertPositiveDimension(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ReelAssetError(`${label} must be a finite positive number.`);
  }
  return value;
}
