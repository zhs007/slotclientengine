import rawSymbolsGameConfig from "../../../assets/gamecfg/game2.json";
import rawSymbols002GameConfig from "../../../assets/gamecfg002/gameconfig.json";
import symbolsStateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import symbols002StateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import {
  createDefaultSymbolAnimationResolver,
  createNamedSymbolAnimationResolver,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
} from "@slotclientengine/rendercore";
import { SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES } from "./symbol-assets.js";
import {
  SYMBOLS002_ANIMATION_PROFILES,
  SYMBOL_VIEWER_ANIMATION_PROFILES,
} from "./symbol-animation-config.js";

export type SymbolSetId = "symbols" | "symbols002";

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

const defaultAnimationResolver = createDefaultSymbolAnimationResolver();
const symbols002SymbolScales = Object.freeze(
  Object.fromEntries(
    [
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
    ].map((symbol) => [symbol, 0.4] as const),
  ),
) satisfies ReelSymbolScaleMap;

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
] satisfies readonly SymbolSetConfig[]);

export function getSymbolSetConfig(id: string): SymbolSetConfig {
  const config = SYMBOL_SET_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) {
    throw new Error(`Unknown symbolsviewer symbol set "${id}".`);
  }
  return config;
}
