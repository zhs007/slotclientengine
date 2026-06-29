import symbols001StateTextureManifest from "../../../assets/symbols001/symbol-state-textures.manifest.json";
import symbols002StateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import symbols003StateTextureManifest from "../../../assets/symbols003/symbol-state-textures.manifest.json";
import game002S2StateTextureManifest from "../../../assets/game002-s2/symbol-state-textures.manifest.json";
import game002S3StateTextureManifest from "../../../assets/game002-s3/symbol-state-textures.manifest.json";
import skin1BackgroundUrl from "../../../assets/game002-s1/bg.jpg?url";
import skin2BackgroundUrl from "../../../assets/game002/bgfull.jpg?url";
import skin3BackgroundUrl from "../../../assets/game003/bg.jpg?url";
import skin4BackgroundUrl from "../../../assets/game002-s2/bg.png?url";
import skin5BackgroundUrl from "../../../assets/game002-s3/bg.jpg?url";
import {
  GAME002_DISPLAY_SYMBOLS,
  GAME002_EMPTY_SYMBOLS,
  createGame002SymbolScaleMapFromManifest,
} from "./assets.js";
import type { ReelSymbolScaleMap } from "@slotclientengine/rendercore";
import {
  GAME002_DEFAULT_GRID_LAYOUT,
  GAME002_SKIN1_FOCUS_REGION,
  GAME002_SKIN1_GRID_LAYOUT,
  GAME002_SKIN2_FOCUS_REGION,
  GAME002_SKIN3_FOCUS_REGION,
  GAME002_SKIN4_FOCUS_REGION,
  GAME002_SKIN4_GRID_LAYOUT,
  GAME002_SKIN5_FOCUS_REGION,
  GAME002_SKIN5_GRID_LAYOUT,
  type Game002FocusRegion,
  type Game002GridLayout,
} from "./game-layout.js";
import {
  GAME002_SUPPORTED_SKINS,
  type Game002SkinId,
  parseGame002SkinId,
} from "./skin-id.js";

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

export const GAME002_SKIN1_DISPLAY_SYMBOLS = Object.freeze([
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

export const GAME002_SKIN3_DISPLAY_SYMBOLS = Object.freeze([
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

export const GAME002_SKIN4_DISPLAY_SYMBOLS = Object.freeze([
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

export const GAME002_SKIN5_DISPLAY_SYMBOLS = GAME002_DISPLAY_SYMBOLS;

export interface Game002SkinConfig {
  readonly id: Game002SkinId;
  readonly label: string;
  readonly backgroundLabel: string;
  readonly backgroundUrl: string;
  readonly symbolModules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly string[];
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly gridLayout: Game002GridLayout;
  readonly focusRegion: Game002FocusRegion;
}

const GAME002_SKIN_CONFIGS: Readonly<Record<Game002SkinId, Game002SkinConfig>> =
  Object.freeze({
    "1": Object.freeze({
      id: "1",
      label: "skin 1",
      backgroundLabel: "skin 1 bg.jpg",
      backgroundUrl: skin1BackgroundUrl,
      symbolModules: symbols001Modules,
      stateTextureManifest: symbols001StateTextureManifest,
      displaySymbols: GAME002_SKIN1_DISPLAY_SYMBOLS,
      emptySymbols: Object.freeze([]),
      symbolScales: createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: symbols001StateTextureManifest,
        displaySymbols: GAME002_SKIN1_DISPLAY_SYMBOLS,
        requireExplicitScale: true,
      }),
      gridLayout: GAME002_SKIN1_GRID_LAYOUT,
      focusRegion: GAME002_SKIN1_FOCUS_REGION,
    }),
    "2": Object.freeze({
      id: "2",
      label: "skin 2",
      backgroundLabel: "skin 2 bgfull.jpg",
      backgroundUrl: skin2BackgroundUrl,
      symbolModules: symbols002Modules,
      stateTextureManifest: symbols002StateTextureManifest,
      displaySymbols: GAME002_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
      symbolScales: createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: symbols002StateTextureManifest,
        displaySymbols: GAME002_DISPLAY_SYMBOLS,
        requireExplicitScale: true,
      }),
      gridLayout: GAME002_DEFAULT_GRID_LAYOUT,
      focusRegion: GAME002_SKIN2_FOCUS_REGION,
    }),
    "3": Object.freeze({
      id: "3",
      label: "skin 3",
      backgroundLabel: "skin 3 bg.jpg",
      backgroundUrl: skin3BackgroundUrl,
      symbolModules: symbols003Modules,
      stateTextureManifest: symbols003StateTextureManifest,
      displaySymbols: GAME002_SKIN3_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
      symbolScales: createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: symbols003StateTextureManifest,
        displaySymbols: GAME002_SKIN3_DISPLAY_SYMBOLS,
        requireExplicitScale: true,
      }),
      gridLayout: GAME002_DEFAULT_GRID_LAYOUT,
      focusRegion: GAME002_SKIN3_FOCUS_REGION,
    }),
    "4": Object.freeze({
      id: "4",
      label: "skin 4",
      backgroundLabel: "skin 4 bg.png",
      backgroundUrl: skin4BackgroundUrl,
      symbolModules: removePngModules(game002S2Modules, ["bg.png"]),
      stateTextureManifest: game002S2StateTextureManifest,
      displaySymbols: GAME002_SKIN4_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
      symbolScales: createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: game002S2StateTextureManifest,
        displaySymbols: GAME002_SKIN4_DISPLAY_SYMBOLS,
        requireExplicitScale: true,
      }),
      gridLayout: GAME002_SKIN4_GRID_LAYOUT,
      focusRegion: GAME002_SKIN4_FOCUS_REGION,
    }),
    "5": Object.freeze({
      id: "5",
      label: "skin 5",
      backgroundLabel: "skin 5 bg.jpg",
      backgroundUrl: skin5BackgroundUrl,
      symbolModules: game002S3Modules,
      stateTextureManifest: game002S3StateTextureManifest,
      displaySymbols: GAME002_SKIN5_DISPLAY_SYMBOLS,
      emptySymbols: GAME002_EMPTY_SYMBOLS,
      symbolScales: createGame002SymbolScaleMapFromManifest({
        stateTextureManifest: game002S3StateTextureManifest,
        displaySymbols: GAME002_SKIN5_DISPLAY_SYMBOLS,
        requireExplicitScale: true,
      }),
      gridLayout: GAME002_SKIN5_GRID_LAYOUT,
      focusRegion: GAME002_SKIN5_FOCUS_REGION,
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
