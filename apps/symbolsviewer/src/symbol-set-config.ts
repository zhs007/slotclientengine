import rawSymbolsGameConfig from "../../../assets/gamecfg/game2.json";
import rawSymbols002GameConfig from "../../../assets/gamecfg002/gameconfig.json";
import symbolsStateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import symbols001StateTextureManifest from "../../../assets/symbols001/symbol-state-textures.manifest.json";
import symbols002StateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import symbols003StateTextureManifest from "../../../assets/symbols003/symbol-state-textures.manifest.json";
import game002S2StateTextureManifest from "../../../assets/game002-s2/symbol-state-textures.manifest.json";
import game002S3StateTextureManifest from "../../../assets/game002-s3/symbol-state-textures.manifest.json";
import {
  createDefaultSymbolAnimationResolver,
  createNamedSymbolAnimationResolver,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
} from "@slotclientengine/rendercore";
import {
  SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
  createSymbolScaleMapFromManifest,
} from "./symbol-assets.js";
import {
  SYMBOLS001_ANIMATION_PROFILES,
  SYMBOLS002_ANIMATION_PROFILES,
  SYMBOLS003_ANIMATION_PROFILES,
  SYMBOL_VIEWER_ANIMATION_PROFILES,
  GAME002_S2_ANIMATION_PROFILES,
  GAME002_S3_ANIMATION_PROFILES,
} from "./symbol-animation-config.js";

export type SymbolSetId =
  | "symbols"
  | "symbols001"
  | "symbols002"
  | "symbols003"
  | "game002-s2"
  | "game002-s3";

export interface SymbolSetConfig {
  readonly id: SymbolSetId;
  readonly label: string;
  readonly symbolScales: ReelSymbolScaleMap;
  readonly rawGameConfig: unknown;
  readonly modules: Record<string, string>;
  readonly manifest: unknown;
  readonly requiredStates: readonly string[];
  readonly animationResolver: SymbolAnimationResolver;
}

const symbolsModules = import.meta.glob("../../../assets/symbols/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const symbols001Modules = import.meta.glob("../../../assets/symbols001/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const symbols002Modules = import.meta.glob("../../../assets/symbols002/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const symbols003Modules = import.meta.glob("../../../assets/symbols003/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const game002S2Modules = import.meta.glob("../../../assets/game002-s2/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const game002S3Modules = import.meta.glob("../../../assets/game002-s3/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const defaultAnimationResolver = createDefaultSymbolAnimationResolver();

const SYMBOLS_DISPLAYABLE_SYMBOLS = Object.freeze([
  "S00",
  "S0",
  "S1",
  "S5",
  "S10",
  "SC",
  "RS",
  "X2",
  "X5",
  "X10",
]);
const SYMBOLS001_DISPLAYABLE_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "CN",
  "BN",
]);
const SYMBOLS002_DISPLAYABLE_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
]);
const SYMBOLS003_DISPLAYABLE_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "CN",
  "CO",
]);
const GAME002_S2_DISPLAYABLE_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "CN",
  "CO",
]);
const GAME002_S3_DISPLAYABLE_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
]);

const createRequiredScaleMap = (
  manifest: unknown,
  displaySymbols: readonly string[],
) =>
  createSymbolScaleMapFromManifest({
    manifest,
    displaySymbols,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    requireExplicitScale: true,
  });

export const SYMBOL_SET_CONFIGS = Object.freeze([
  Object.freeze({
    id: "symbols",
    label: "symbols",
    symbolScales: createRequiredScaleMap(
      symbolsStateTextureManifest,
      SYMBOLS_DISPLAYABLE_SYMBOLS,
    ),
    rawGameConfig: rawSymbolsGameConfig,
    modules: symbolsModules,
    manifest: symbolsStateTextureManifest,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: SYMBOL_VIEWER_ANIMATION_PROFILES,
      fallback: defaultAnimationResolver,
    }),
  }),
  Object.freeze({
    id: "symbols001",
    label: "symbols001",
    symbolScales: createRequiredScaleMap(
      symbols001StateTextureManifest,
      SYMBOLS001_DISPLAYABLE_SYMBOLS,
    ),
    rawGameConfig: rawSymbols002GameConfig,
    modules: symbols001Modules,
    manifest: symbols001StateTextureManifest,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: SYMBOLS001_ANIMATION_PROFILES,
      fallback: defaultAnimationResolver,
    }),
  }),
  Object.freeze({
    id: "symbols002",
    label: "symbols002",
    symbolScales: createRequiredScaleMap(
      symbols002StateTextureManifest,
      SYMBOLS002_DISPLAYABLE_SYMBOLS,
    ),
    rawGameConfig: rawSymbols002GameConfig,
    modules: symbols002Modules,
    manifest: symbols002StateTextureManifest,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: SYMBOLS002_ANIMATION_PROFILES,
      fallback: defaultAnimationResolver,
    }),
  }),
  Object.freeze({
    id: "symbols003",
    label: "symbols003",
    symbolScales: createRequiredScaleMap(
      symbols003StateTextureManifest,
      SYMBOLS003_DISPLAYABLE_SYMBOLS,
    ),
    rawGameConfig: rawSymbols002GameConfig,
    modules: symbols003Modules,
    manifest: symbols003StateTextureManifest,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: SYMBOLS003_ANIMATION_PROFILES,
      fallback: defaultAnimationResolver,
    }),
  }),
  Object.freeze({
    id: "game002-s2",
    label: "game002-s2",
    symbolScales: createRequiredScaleMap(
      game002S2StateTextureManifest,
      GAME002_S2_DISPLAYABLE_SYMBOLS,
    ),
    rawGameConfig: rawSymbols002GameConfig,
    modules: removePngModules(game002S2Modules, ["bg.png"]),
    manifest: game002S2StateTextureManifest,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: GAME002_S2_ANIMATION_PROFILES,
      fallback: defaultAnimationResolver,
    }),
  }),
  Object.freeze({
    id: "game002-s3",
    label: "game002-s3",
    symbolScales: createRequiredScaleMap(
      game002S3StateTextureManifest,
      GAME002_S3_DISPLAYABLE_SYMBOLS,
    ),
    rawGameConfig: rawSymbols002GameConfig,
    modules: game002S3Modules,
    manifest: game002S3StateTextureManifest,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: GAME002_S3_ANIMATION_PROFILES,
      fallback: defaultAnimationResolver,
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

function removePngModules(
  modules: Record<string, string>,
  filenames: readonly string[],
): Record<string, string> {
  const excluded = new Set(filenames);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(modules).filter(([modulePath]) => {
        const filename = modulePath.split("/").at(-1);
        return filename === undefined || !excluded.has(filename);
      }),
    ),
  );
}
