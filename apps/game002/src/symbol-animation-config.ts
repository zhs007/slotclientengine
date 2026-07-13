import type {
  ReelSymbolRenderPriorityMap,
  ReelSymbolScaleMap,
} from "@slotclientengine/rendercore";
import { getGame002SkinConfig } from "./skin-config.js";

const GAME002_SKIN = getGame002SkinConfig("1");

export const GAME002_SYMBOL_SCALES = Object.freeze(
  GAME002_SKIN.symbolScales,
) satisfies ReelSymbolScaleMap;

export const GAME002_SYMBOL_RENDER_PRIORITIES = Object.freeze(
  GAME002_SKIN.symbolRenderPriorities,
) satisfies ReelSymbolRenderPriorityMap;
