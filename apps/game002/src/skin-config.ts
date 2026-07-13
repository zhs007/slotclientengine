import rawGame002Config from "../../../assets/gamecfg002/gameconfig.json";
import game002S3SpineAtlasRaw from "../../../assets/game002-s3/Symbol.atlas?raw";
import game002S3SpineTextureUrl from "../../../assets/game002-s3/Symbol.png?url";
import game002S3StateTextureManifest from "../../../assets/game002-s3/symbol-state-textures.manifest.json";
import game002S3BackgroundUrl from "../../../assets/game002-s3/bg.jpg?url";
import {
  createDefaultSymbolAnimationResolver,
  createSymbolManifestAnimationResolver,
  type ReelSymbolRenderPriorityMap,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
} from "@slotclientengine/rendercore";
import {
  GAME002_EMPTY_SYMBOLS,
  createGame002SymbolRenderPriorityMapFromManifest,
  createGame002SymbolScaleMapFromManifest,
  getGame002DisplaySymbolsFromManifest,
} from "./assets.js";
import {
  GAME002_GRID_LAYOUT,
  GAME002_FOCUS_REGION,
  type Game002FocusRegion,
  type Game002GridLayout,
} from "./game-layout.js";
import {
  GAME002_SUPPORTED_SKINS,
  parseGame002SkinId,
  type Game002SkinId,
} from "./skin-id.js";

const game002S3NormalModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const game002S3SpinBlurModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN}.spinBlur.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const game002S3DisabledModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN}.disabled.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const game002S3SpineSkeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

const game002S3SymbolModules = Object.freeze({
  ...game002S3NormalModules,
  ...game002S3SpinBlurModules,
  ...game002S3DisabledModules,
});
const game002S3SpineAtlasModules = Object.freeze({
  "../../../assets/game002-s3/Symbol.atlas": game002S3SpineAtlasRaw,
});
const game002S3SpineTextureModules = Object.freeze({
  "../../../assets/game002-s3/Symbol.png": game002S3SpineTextureUrl,
});
const game002S3DisplaySymbols = getGame002DisplaySymbolsFromManifest(
  game002S3StateTextureManifest,
);
const defaultAnimationResolver = createDefaultSymbolAnimationResolver();

export interface Game002SkinConfig {
  readonly id: Game002SkinId;
  readonly label: string;
  readonly backgroundLabel: string;
  readonly backgroundUrl: string;
  readonly rawGameConfig: unknown;
  readonly symbolModules: Record<string, string>;
  readonly spineSkeletonModules: Record<string, unknown>;
  readonly spineAtlasModules: Record<string, string>;
  readonly spineTextureModules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly string[];
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
  readonly symbolAnimationResolver: SymbolAnimationResolver;
  readonly gridLayout: Game002GridLayout;
  readonly focusRegion: Game002FocusRegion;
}

const GAME002_SKIN_CONFIGS: Readonly<Record<Game002SkinId, Game002SkinConfig>> =
  Object.freeze({
    "1": Object.freeze({
      id: parseGame002SkinId("1"),
      label: "game002-s3",
      backgroundLabel: "game002-s3 bg.jpg",
      backgroundUrl: game002S3BackgroundUrl,
      rawGameConfig: rawGame002Config,
      symbolModules: game002S3SymbolModules,
      spineSkeletonModules: game002S3SpineSkeletonModules,
      spineAtlasModules: game002S3SpineAtlasModules,
      spineTextureModules: game002S3SpineTextureModules,
      stateTextureManifest: game002S3StateTextureManifest,
      displaySymbols: game002S3DisplaySymbols,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
      symbolScales: createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: game002S3StateTextureManifest,
        displaySymbols: game002S3DisplaySymbols,
        requireExplicitScale: true,
      }),
      symbolRenderPriorities: createGame002SymbolRenderPriorityMapFromManifest({
        stateTextureManifest: game002S3StateTextureManifest,
        displaySymbols: game002S3DisplaySymbols,
      }),
      symbolAnimationResolver: createSymbolManifestAnimationResolver({
        manifest: game002S3StateTextureManifest,
        requiredStates: ["spinBlur", "disabled"],
        vniProjectModules: {},
        vniAssetModules: {},
        spineSkeletonModules: game002S3SpineSkeletonModules,
        spineAtlasModules: game002S3SpineAtlasModules,
        spineTextureModules: game002S3SpineTextureModules,
        fallback: defaultAnimationResolver,
      }),
      gridLayout: GAME002_GRID_LAYOUT,
      focusRegion: GAME002_FOCUS_REGION,
    }),
  });

export function getGame002SkinConfig(id: Game002SkinId): Game002SkinConfig {
  const config = GAME002_SKIN_CONFIGS[id];
  if (!config) {
    throw new Error(`Unknown game002 skin "${id}".`);
  }
  return config;
}

export { GAME002_SUPPORTED_SKINS, parseGame002SkinId, type Game002SkinId };
