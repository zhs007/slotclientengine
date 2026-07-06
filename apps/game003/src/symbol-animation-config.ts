import { getSlotGameStaticSkin } from "@slotclientengine/gameframeworks/static-config";
import type {
  ReelSymbolRenderPriorityMap,
  ReelSymbolScaleMap,
} from "@slotclientengine/rendercore";
import {
  createGame003SymbolRenderPriorityMapFromManifest,
  createGame003SymbolScaleMapFromManifest,
  getGame003DisplaySymbolsFromManifest,
} from "./assets.js";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";

const game003StaticSkin1 = getSlotGameStaticSkin(GAME003_STATIC_CONFIG, "1");
const game003DisplaySymbols = getGame003DisplaySymbolsFromManifest(
  game003StaticSkin1.symbols.manifest,
  game003StaticSkin1.symbols.requiredStates,
);

export const GAME003_SYMBOL_SCALES = Object.freeze(
  createGame003SymbolScaleMapFromManifest({
    stateTextureManifest: game003StaticSkin1.symbols.manifest,
    displaySymbols: game003DisplaySymbols,
    requiredStates: game003StaticSkin1.symbols.requiredStates,
    requireExplicitScale: game003StaticSkin1.symbols.requireExplicitScale,
  }),
) satisfies ReelSymbolScaleMap;

export const GAME003_SYMBOL_RENDER_PRIORITIES = Object.freeze(
  createGame003SymbolRenderPriorityMapFromManifest({
    stateTextureManifest: game003StaticSkin1.symbols.manifest,
    displaySymbols: game003DisplaySymbols,
    requiredStates: game003StaticSkin1.symbols.requiredStates,
  }),
) satisfies ReelSymbolRenderPriorityMap;
