import symbols002StateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import type { ReelSymbolScaleMap } from "@slotclientengine/rendercore";
import {
  GAME002_DISPLAY_SYMBOLS,
  createGame002SymbolScaleMapFromManifest,
} from "./assets.js";

export const GAME002_SYMBOL_SCALES = Object.freeze(
  createGame002SymbolScaleMapFromManifest({
    stateTextureManifest: symbols002StateTextureManifest,
    displaySymbols: GAME002_DISPLAY_SYMBOLS,
    requireExplicitScale: true,
  }),
) satisfies ReelSymbolScaleMap;
