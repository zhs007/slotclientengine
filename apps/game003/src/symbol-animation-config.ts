import game003StateTextureManifest from "../../../assets/game003-s1/symbol-state-textures.manifest.json";
import type { ReelSymbolScaleMap } from "@slotclientengine/rendercore";
import {
  GAME003_DISPLAY_SYMBOLS,
  createGame003SymbolScaleMapFromManifest,
} from "./assets.js";

export const GAME003_SYMBOL_SCALES = Object.freeze(
  createGame003SymbolScaleMapFromManifest({
    stateTextureManifest: game003StateTextureManifest,
    displaySymbols: GAME003_DISPLAY_SYMBOLS,
    requireExplicitScale: true,
  }),
) satisfies ReelSymbolScaleMap;
