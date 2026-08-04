import rawGame002GameConfig from "../../../assets/gamecfg002/gameconfig.json";
import craveAssetsMap from "../../../assets/crave/assets.map.json";
import minecart2AssetsMap from "../../../assets/minecart2/assets.map.json";
import {
  createDefaultSymbolAnimationResolver,
  createSymbolManifestAnimationResolver,
  createSymbolValuePresentationResourceBundleFromManifest,
  createSymbolStatePresetFromManifest,
  createSymbolCascadeWinPresentationMapFromManifest,
  getSymbolDisplaySymbolsFromManifest,
  parseSymbolStateTextureManifest,
  type ReelSymbolRenderPriorityMap,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
  type SymbolValuePresentationResourceMap,
  type SymbolStatePreset,
  type SymbolSequenceStep,
} from "@slotclientengine/rendercore";
import {
  SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
  createSymbolRenderPriorityMapFromManifest,
  createSymbolScaleMapFromManifest,
} from "./symbol-assets.js";
import {
  createViewerSequenceFromCascadePresentations,
  DEFAULT_VIEWER_SEQUENCE,
} from "./viewer-sequence.js";

export type SymbolSetId = "game002-s3" | "game003-s1";

export interface SymbolSetConfig {
  readonly id: SymbolSetId;
  readonly label: string;
  readonly catalogKind: "paytable" | "standalone";
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
  readonly rawGameConfig?: unknown;
  readonly displaySymbols?: readonly string[];
  readonly modules: Record<string, string>;
  readonly manifest: unknown;
  readonly statePreset: SymbolStatePreset;
  readonly defaultSequence: readonly SymbolSequenceStep[];
  readonly vniProjectModules?: Record<string, unknown>;
  readonly vniAssetModules?: Record<string, string>;
  readonly spineSkeletonModules?: Record<string, unknown>;
  readonly spineAtlasModules?: Record<string, string>;
  readonly spineTextureModules?: Record<string, string>;
  readonly requiredStates: readonly string[];
  readonly animationResolver: SymbolAnimationResolver;
  readonly symbolValuePresentationResources?: SymbolValuePresentationResourceMap;
}

const craveJsonPhysicalModules = import.meta.glob(
  "../../../assets/crave/assets/*.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;
const craveAtlasPhysicalModules = import.meta.glob(
  "../../../assets/crave/assets/*.atlas",
  { eager: true, import: "default", query: "?raw" },
) as Record<string, string>;
const craveImagePhysicalModules = import.meta.glob(
  "../../../assets/crave/assets/*.{webp,png,jpg,jpeg}",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const craveLogicalJsonModules = mapCraveLogicalModules(
  craveJsonPhysicalModules,
);
const craveLogicalAtlasModules = mapCraveLogicalModules(
  craveAtlasPhysicalModules,
);
const craveLogicalImageModules = mapCraveLogicalModules(
  craveImagePhysicalModules,
);
const game002S3StateTextureManifest = requireCraveModule(
  craveLogicalJsonModules,
  "symbol-state-textures.manifest.json",
);
const game002S3Modules = filterCraveModules(
  craveLogicalImageModules,
  /^(?:wl|h1|h2|l1|l2|l3|l4|wm|cn|cm|co|af|bn)(?:\.spinblur|\.disabled)?\.webp$/u,
);
const game002S3SpineSkeletonModules = filterCraveModules(
  craveLogicalJsonModules,
  /^(?:wl|h1|h2|l1|l2|l3|l4|wm|cm|co|af|bn)\.json$/u,
);
const game002S3SpineAtlasModules = filterCraveModules(
  craveLogicalAtlasModules,
  /^symbol\.atlas$/u,
);
const game002S3SpineTextureModules = filterCraveModules(
  craveLogicalImageModules,
  /^symbol\.webp$/u,
);
const symbolValueSpineSkeletonModules = filterCraveModules(
  craveLogicalJsonModules,
  /^cn_[1-4]\.json$/u,
);
const symbolValueSpineAtlasModules = game002S3SpineAtlasModules;
const symbolValueSpineTextureModules = game002S3SpineTextureModules;
const symbolValueTextImageModules = filterCraveModules(
  craveLogicalImageModules,
  /^(?:1|2|5|10|25|50|100|250|500|1000)\.webp$/u,
);
const symbolValueImageStringManifestModules = filterCraveModules(
  craveLogicalJsonModules,
  /^image-string\.manifest\.json$/u,
);
const symbolValueImageStringImageModules = filterCraveModules(
  craveLogicalImageModules,
  /^[0-9]-1\.webp$/u,
);
const minecart2JsonPhysicalModules = import.meta.glob(
  "../../../assets/minecart2/assets/*.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;
const minecart2AtlasPhysicalModules = import.meta.glob(
  "../../../assets/minecart2/assets/*.atlas",
  { eager: true, import: "default", query: "?raw" },
) as Record<string, string>;
const minecart2ImagePhysicalModules = import.meta.glob(
  "../../../assets/minecart2/assets/*.{webp,png,jpg,jpeg}",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const game003S1JsonModules = mapPackageLogicalModules(
  minecart2AssetsMap,
  minecart2JsonPhysicalModules,
);
const game003S1SpineAtlasModules = mapPackageLogicalModules(
  minecart2AssetsMap,
  minecart2AtlasPhysicalModules,
);
const game003S1Modules = mapPackageLogicalModules(
  minecart2AssetsMap,
  minecart2ImagePhysicalModules,
);
const game003S1StateTextureManifest = requirePackageModule(
  game003S1JsonModules,
  "symbol-state-textures.manifest.json",
  "Minecart2",
);
const rawGame003GameConfig = requirePackageModule(
  game003S1JsonModules,
  "gameconfig.json",
  "Minecart2",
);
const game003S1VniProjectModules = game003S1JsonModules;
const game003S1VniAssetModules = game003S1Modules;
const game003S1SpineSkeletonModules = game003S1JsonModules;
const game003S1SpineTextureModules = game003S1Modules;

const manifestFallbackAnimationResolver =
  createDefaultSymbolAnimationResolver();

const GAME003_S1_DISPLAYABLE_SYMBOLS = getSymbolDisplaySymbolsFromManifest(
  game003S1StateTextureManifest,
  {
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
  },
);

const GAME002_S3_DISPLAYABLE_SYMBOLS = getSymbolDisplaySymbolsFromManifest(
  game002S3StateTextureManifest,
  { requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES },
);

export const SYMBOL_SET_CONFIGS = Object.freeze([
  Object.freeze({
    id: "game002-s3",
    label: "game002-s3",
    catalogKind: "paytable",
    symbolScales: createSymbolScaleMapFromManifest({
      manifest: game002S3StateTextureManifest,
      displaySymbols: GAME002_S3_DISPLAYABLE_SYMBOLS,
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      requireExplicitScale: true,
    }),
    symbolRenderPriorities: createSymbolRenderPriorityMapFromManifest({
      manifest: game002S3StateTextureManifest,
      displaySymbols: GAME002_S3_DISPLAYABLE_SYMBOLS,
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    }),
    rawGameConfig: rawGame002GameConfig,
    modules: game002S3Modules,
    manifest: game002S3StateTextureManifest,
    statePreset: createSymbolStatePresetFromManifest(
      game002S3StateTextureManifest,
    ),
    defaultSequence: createViewerSequenceFromCascadePresentations(
      createSymbolCascadeWinPresentationMapFromManifest({
        manifest: game002S3StateTextureManifest,
        displaySymbols: GAME002_S3_DISPLAYABLE_SYMBOLS,
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      }),
    ),
    spineSkeletonModules: game002S3SpineSkeletonModules,
    spineAtlasModules: game002S3SpineAtlasModules,
    spineTextureModules: game002S3SpineTextureModules,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createSymbolManifestAnimationResolver({
      manifest: game002S3StateTextureManifest,
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      vniProjectModules: {},
      vniAssetModules: {},
      spineSkeletonModules: game002S3SpineSkeletonModules,
      spineAtlasModules: game002S3SpineAtlasModules,
      spineTextureModules: game002S3SpineTextureModules,
      fallback: manifestFallbackAnimationResolver,
    }),
    symbolValuePresentationResources: Object.freeze({}),
  }),
  Object.freeze({
    id: "game003-s1",
    label: "game003-s1",
    catalogKind: "paytable",
    symbolScales: createSymbolScaleMapFromManifest({
      manifest: game003S1StateTextureManifest,
      displaySymbols: GAME003_S1_DISPLAYABLE_SYMBOLS,
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      requireExplicitScale: true,
    }),
    symbolRenderPriorities: createSymbolRenderPriorityMapFromManifest({
      manifest: game003S1StateTextureManifest,
      displaySymbols: GAME003_S1_DISPLAYABLE_SYMBOLS,
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    }),
    rawGameConfig: rawGame003GameConfig,
    modules: game003S1Modules,
    manifest: game003S1StateTextureManifest,
    statePreset: createSymbolStatePresetFromManifest(
      game003S1StateTextureManifest,
    ),
    defaultSequence: DEFAULT_VIEWER_SEQUENCE,
    vniProjectModules: game003S1VniProjectModules,
    vniAssetModules: game003S1VniAssetModules,
    spineSkeletonModules: game003S1SpineSkeletonModules,
    spineAtlasModules: game003S1SpineAtlasModules,
    spineTextureModules: game003S1SpineTextureModules,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createLazyGame003AnimationResolver(),
  }),
] satisfies readonly SymbolSetConfig[]);

export function getSymbolSetConfig(id: string): SymbolSetConfig {
  const config = SYMBOL_SET_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) {
    throw new Error(`Unknown symbolsviewer symbol set "${id}".`);
  }
  return config;
}

function mapCraveLogicalModules<T>(
  physicalModules: Readonly<Record<string, T>>,
): Record<string, T> {
  const entries = Object.entries(craveAssetsMap.files).flatMap(
    ([logicalKey, entry]) => {
      const physical = Object.entries(physicalModules).find(([path]) =>
        path.endsWith(`/${entry.path}`),
      )?.[1];
      return physical === undefined ? [] : [[logicalKey, physical] as const];
    },
  );
  return Object.freeze(Object.fromEntries(entries));
}

function mapPackageLogicalModules<T>(
  assetsMap: {
    readonly files: Readonly<Record<string, { readonly path: string }>>;
  },
  physicalModules: Readonly<Record<string, T>>,
): Record<string, T> {
  const entries = Object.entries(assetsMap.files).flatMap(
    ([logicalKey, entry]) => {
      const physical = Object.entries(physicalModules).find(([path]) =>
        path.endsWith(`/${entry.path}`),
      )?.[1];
      return physical === undefined ? [] : [[logicalKey, physical] as const];
    },
  );
  return Object.freeze(Object.fromEntries(entries));
}

function requirePackageModule<T>(
  modules: Readonly<Record<string, T>>,
  logicalKey: string,
  label: string,
): T {
  const value = modules[logicalKey];
  if (value === undefined) {
    throw new Error(
      `${label} logical resource "${logicalKey}" is unavailable.`,
    );
  }
  return value;
}

function filterCraveModules<T>(
  modules: Readonly<Record<string, T>>,
  logicalKeyPattern: RegExp,
): Record<string, T> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(modules).filter(([logicalKey]) =>
        logicalKeyPattern.test(logicalKey),
      ),
    ),
  );
}

function requireCraveModule<T>(
  modules: Readonly<Record<string, T>>,
  logicalKey: string,
): T {
  const value = modules[logicalKey];
  if (value === undefined)
    throw new Error(
      `Crave package logical resource "${logicalKey}" is unavailable.`,
    );
  return value;
}

export async function prepareSymbolSetConfig(id: string): Promise<{
  readonly config: SymbolSetConfig;
  destroy(): Promise<void>;
}> {
  const config = getSymbolSetConfig(id);
  if (config.id !== "game002-s3") {
    return Object.freeze({ config, destroy: async () => undefined });
  }
  const bundle = await createSymbolValuePresentationResourceBundleFromManifest({
    manifest: game002S3StateTextureManifest,
    symbolManifestPath: "symbol-state-textures.manifest.json",
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    spineSkeletonModules: symbolValueSpineSkeletonModules,
    spineAtlasModules: symbolValueSpineAtlasModules,
    spineTextureModules: symbolValueSpineTextureModules,
    textImageModules: symbolValueTextImageModules,
    imageStringManifestModules: symbolValueImageStringManifestModules,
    imageStringImageModules: symbolValueImageStringImageModules,
  });
  return Object.freeze({
    config: Object.freeze({
      ...config,
      symbolValuePresentationResources: bundle.resources,
    }),
    destroy: () => bundle.destroy(),
  });
}

export function resolveViewerStateForSymbol(
  config: SymbolSetConfig,
  symbol: string,
  requestedState: string,
): string {
  if (["normal", ...config.requiredStates].includes(requestedState)) {
    return requestedState;
  }
  const parsed = parseSymbolStateTextureManifest(config.manifest, {
    requiredStates: config.requiredStates,
  });
  const entry = parsed.symbols[symbol];
  if (!entry) {
    throw new Error(
      `symbolsviewer manifest is missing configured symbol "${symbol}".`,
    );
  }
  return entry.animations[requestedState] ? requestedState : "normal";
}

function createLazyGame003AnimationResolver(): SymbolAnimationResolver {
  let resolver: SymbolAnimationResolver | null = null;
  return (context) => {
    resolver ??= createSymbolManifestAnimationResolver({
      manifest: game003S1StateTextureManifest,
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      vniProjectModules: game003S1VniProjectModules,
      vniAssetModules: game003S1VniAssetModules,
      spineSkeletonModules: game003S1SpineSkeletonModules,
      spineAtlasModules: game003S1SpineAtlasModules,
      spineTextureModules: game003S1SpineTextureModules,
      fallback: manifestFallbackAnimationResolver,
    });
    return resolver(context);
  };
}
