import type { ReelSymbolScaleMap } from "@slotclientengine/rendercore";
import { GAME002_DISPLAY_SYMBOLS } from "./assets.js";

export const GAME002_SYMBOL_SCALES = Object.freeze(
  Object.fromEntries(
    GAME002_DISPLAY_SYMBOLS.map((symbol) => [symbol, 1] as const),
  ),
) satisfies ReelSymbolScaleMap;
