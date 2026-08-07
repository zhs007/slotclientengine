import type {
  ReelSymbolRenderPriorityMap,
  ReelSymbolScaleMap,
} from "@slotclientengine/rendercore";

/**
 * Production symbol scales and priorities are loaded from the Scene Layout symbol package
 * package. These empty defaults are only used before a package config is
 * supplied and must never become a second business table.
 */
export const GAME002_SYMBOL_SCALES = Object.freeze(
  {},
) satisfies ReelSymbolScaleMap;

export const GAME002_SYMBOL_RENDER_PRIORITIES = Object.freeze(
  {},
) satisfies ReelSymbolRenderPriorityMap;
