import rawSymbolsGameConfig from "../../../assets/gamecfg/game2.json";
import rawSymbols002GameConfig from "../../../assets/gamecfg002/gameconfig.json";
import symbolsStateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import symbols002StateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import symbols003StateTextureManifest from "../../../assets/symbols003/symbol-state-textures.manifest.json";
import {
  createDefaultSymbolAnimationResolver,
  createNamedSymbolAnimationResolver,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
} from "@slotclientengine/rendercore";
import { SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES } from "./symbol-assets.js";
import {
  SYMBOLS002_ANIMATION_PROFILES,
  SYMBOLS003_ANIMATION_PROFILES,
  SYMBOL_VIEWER_ANIMATION_PROFILES,
} from "./symbol-animation-config.js";

export type SymbolSetId = "symbols" | "symbols002" | "symbols003";

export interface SymbolSetConfig {
  readonly id: SymbolSetId;
  readonly label: string;
  readonly symbolScales?: ReelSymbolScaleMap;
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

const defaultAnimationResolver = createDefaultSymbolAnimationResolver();
const createUnitScaleMap = (symbols: readonly string[]) =>
  Object.fromEntries(
    symbols.map((symbol) => [symbol, 1] as const),
  ) satisfies ReelSymbolScaleMap;

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
const symbols002SymbolScales = Object.freeze(
  createUnitScaleMap(SYMBOLS002_DISPLAYABLE_SYMBOLS),
);
const symbols003SymbolScales = Object.freeze(
  createUnitScaleMap(SYMBOLS003_DISPLAYABLE_SYMBOLS),
);

export const SYMBOL_SET_CONFIGS = Object.freeze([
  Object.freeze({
    id: "symbols",
    label: "symbols",
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
    id: "symbols002",
    label: "symbols002",
    symbolScales: symbols002SymbolScales,
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
    symbolScales: symbols003SymbolScales,
    rawGameConfig: rawSymbols002GameConfig,
    modules: symbols003Modules,
    manifest: symbols003StateTextureManifest,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: SYMBOLS003_ANIMATION_PROFILES,
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
