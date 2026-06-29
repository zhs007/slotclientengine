import game003StateTextureManifest from "../../../assets/game003-s1/symbol-state-textures.manifest.json";
import landscapeBackgroundUrl from "../../../assets/game003-s1/bg1.jpg?url";
import portraitBackgroundUrl from "../../../assets/game003-s1/bg2.jpg?url";
import mainReelBackgroundUrl from "../../../assets/game003-s1/mainreelbg.png?url";
import landscapeConveyorUrl from "../../../assets/game003-s1/conveyor1.png?url";
import portraitConveyorUrl from "../../../assets/game003-s1/conveyor2.png?url";
import type { ReelSymbolScaleMap } from "@slotclientengine/rendercore";
import {
  GAME003_DISPLAY_SYMBOLS,
  GAME003_EMPTY_SYMBOLS,
  createGame003SymbolScaleMapFromManifest,
} from "./assets.js";
import {
  GAME003_SUPPORTED_SKINS,
  parseGame003SkinId,
  type Game003SkinId,
} from "./skin-id.js";

const game003S1Modules = import.meta.glob("../../../assets/game003-s1/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

export interface Game003SkinConfig {
  readonly id: Game003SkinId;
  readonly label: string;
  readonly landscapeBackgroundUrl: string;
  readonly portraitBackgroundUrl: string;
  readonly mainReelBackgroundUrl: string;
  readonly landscapeConveyorUrl: string;
  readonly portraitConveyorUrl: string;
  readonly symbolModules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly string[];
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
}

const GAME003_SKIN_CONFIGS: Readonly<Record<Game003SkinId, Game003SkinConfig>> =
  Object.freeze({
    "1": Object.freeze({
      id: "1",
      label: "skin 1",
      landscapeBackgroundUrl,
      portraitBackgroundUrl,
      mainReelBackgroundUrl,
      landscapeConveyorUrl,
      portraitConveyorUrl,
      symbolModules: game003S1Modules,
      stateTextureManifest: game003StateTextureManifest,
      displaySymbols: GAME003_DISPLAY_SYMBOLS,
      emptySymbols: GAME003_EMPTY_SYMBOLS,
      symbolScales: createGame003SymbolScaleMapFromManifest({
        stateTextureManifest: game003StateTextureManifest,
        displaySymbols: GAME003_DISPLAY_SYMBOLS,
        requireExplicitScale: true,
      }),
    }),
  });

export function getGame003SkinConfig(id: Game003SkinId): Game003SkinConfig {
  const config = GAME003_SKIN_CONFIGS[id];
  if (!config) {
    throw new Error(`Unknown game003 skin "${id}".`);
  }
  return config;
}

export { GAME003_SUPPORTED_SKINS, parseGame003SkinId, type Game003SkinId };
