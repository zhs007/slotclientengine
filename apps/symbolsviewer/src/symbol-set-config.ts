import rawGame003GameConfig from "../../../assets/gamecfg003/gameconfig.json";
import game003S1L1WinsProject from "../../../assets/game003-s1/L1-wins.json";
import game003S1L2WinsProject from "../../../assets/game003-s1/L2-wins.json";
import game003S1L3WinsProject from "../../../assets/game003-s1/L3-wins.json";
import game003S1L4WinsProject from "../../../assets/game003-s1/L4-wins.json";
import game003S1L5WinsProject from "../../../assets/game003-s1/L5-wins.json";
import game003S1SpineAtlasRaw from "../../../assets/game003-s1/Symbol.atlas?raw";
import game003S1SpineTextureUrl from "../../../assets/game003-s1/Symbol.png?url";
import game003BgBarStateTextureManifest from "../../../assets/game003-s1/bg-bar-symbol-state-textures.manifest.json";
import game003S1StateTextureManifest from "../../../assets/game003-s1/symbol-state-textures.manifest.json";
import {
  createDefaultSymbolAnimationResolver,
  createSymbolManifestAnimationResolver,
  getSymbolDisplaySymbolsFromManifest,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
} from "@slotclientengine/rendercore";
import {
  SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
  createSymbolScaleMapFromManifest,
} from "./symbol-assets.js";

export type SymbolSetId = "game003-s1" | "game003-bg-bar";

export interface SymbolSetConfig {
  readonly id: SymbolSetId;
  readonly label: string;
  readonly catalogKind: "paytable" | "standalone";
  readonly symbolScales: ReelSymbolScaleMap;
  readonly rawGameConfig?: unknown;
  readonly displaySymbols?: readonly string[];
  readonly modules: Record<string, string>;
  readonly manifest: unknown;
  readonly vniProjectModules?: Record<string, unknown>;
  readonly vniAssetModules?: Record<string, string>;
  readonly spineSkeletonModules?: Record<string, unknown>;
  readonly spineAtlasModules?: Record<string, string>;
  readonly spineTextureModules?: Record<string, string>;
  readonly requiredStates: readonly string[];
  readonly animationResolver: SymbolAnimationResolver;
}

const game003S1Modules = import.meta.glob("../../../assets/game003-s1/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const game003BgBarModules = import.meta.glob(
  "../../../assets/game003-s1/{wild,up}.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

const game003S1VniProjectGlobModules = import.meta.glob(
  "../../../assets/game003-s1/*-wins.json",
  {
    eager: true,
    import: "default",
  },
) as Record<string, unknown>;

const game003S1VniProjectModules = Object.freeze({
  ...game003S1VniProjectGlobModules,
  "../../../assets/game003-s1/L1-wins.json": game003S1L1WinsProject,
  "../../../assets/game003-s1/L2-wins.json": game003S1L2WinsProject,
  "../../../assets/game003-s1/L3-wins.json": game003S1L3WinsProject,
  "../../../assets/game003-s1/L4-wins.json": game003S1L4WinsProject,
  "../../../assets/game003-s1/L5-wins.json": game003S1L5WinsProject,
});

const game003S1VniAssetModules = import.meta.glob(
  "../../../assets/game003-s1/assets/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

const game003S1SpineSkeletonModules = import.meta.glob(
  "../../../assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json",
  {
    eager: true,
    import: "default",
  },
) as Record<string, unknown>;

const game003S1SpineAtlasModules = Object.freeze({
  "../../../assets/game003-s1/Symbol.atlas": game003S1SpineAtlasRaw,
} as const satisfies Record<string, string>);

const game003S1SpineTextureModules = Object.freeze({
  "../../../assets/game003-s1/Symbol.png": game003S1SpineTextureUrl,
} as const satisfies Record<string, string>);

const manifestFallbackAnimationResolver =
  createDefaultSymbolAnimationResolver();

const GAME003_S1_DISPLAYABLE_SYMBOLS = getSymbolDisplaySymbolsFromManifest(
  game003S1StateTextureManifest,
  {
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
  },
);

const GAME003_BG_BAR_DISPLAYABLE_SYMBOLS = getSymbolDisplaySymbolsFromManifest(
  game003BgBarStateTextureManifest,
  {
    requiredStates: [],
  },
);

export const SYMBOL_SET_CONFIGS = Object.freeze([
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
    rawGameConfig: rawGame003GameConfig,
    modules: game003S1Modules,
    manifest: game003S1StateTextureManifest,
    vniProjectModules: game003S1VniProjectModules,
    vniAssetModules: game003S1VniAssetModules,
    spineSkeletonModules: game003S1SpineSkeletonModules,
    spineAtlasModules: game003S1SpineAtlasModules,
    spineTextureModules: game003S1SpineTextureModules,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createSymbolManifestAnimationResolver({
      manifest: game003S1StateTextureManifest,
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
      vniProjectModules: game003S1VniProjectModules,
      vniAssetModules: game003S1VniAssetModules,
      spineSkeletonModules: game003S1SpineSkeletonModules,
      spineAtlasModules: game003S1SpineAtlasModules,
      spineTextureModules: game003S1SpineTextureModules,
      fallback: manifestFallbackAnimationResolver,
    }),
  }),
  Object.freeze({
    id: "game003-bg-bar",
    label: "game003-bg-bar",
    catalogKind: "standalone",
    symbolScales: createSymbolScaleMapFromManifest({
      manifest: game003BgBarStateTextureManifest,
      displaySymbols: GAME003_BG_BAR_DISPLAYABLE_SYMBOLS,
      requiredStates: [],
      requireExplicitScale: true,
    }),
    displaySymbols: GAME003_BG_BAR_DISPLAYABLE_SYMBOLS,
    modules: game003BgBarModules,
    manifest: game003BgBarStateTextureManifest,
    requiredStates: [],
    animationResolver: createSymbolManifestAnimationResolver({
      manifest: game003BgBarStateTextureManifest,
      requiredStates: [],
      vniProjectModules: {},
      vniAssetModules: {},
      spineSkeletonModules: {},
      spineAtlasModules: {},
      spineTextureModules: {},
      fallback: manifestFallbackAnimationResolver,
    }),
  }),
] satisfies readonly SymbolSetConfig[]);

export function getSymbolSetConfig(id: string): SymbolSetConfig {
  const config = SYMBOL_SET_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) {
    throw new Error(`Unknown symbolsviewer symbol set "${id}".`);
  }
  return config;
}
