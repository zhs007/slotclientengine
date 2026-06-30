import { parseSlotGameStaticSkinId } from "@slotclientengine/gameframeworks/static-config";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";

export const GAME003_SUPPORTED_SKINS = GAME003_STATIC_CONFIG.supportedSkins;

export type Game003SkinId = (typeof GAME003_SUPPORTED_SKINS)[number];

export function parseGame003SkinId(value: string): Game003SkinId {
  return parseSlotGameStaticSkinId(
    GAME003_STATIC_CONFIG,
    value,
  ) as Game003SkinId;
}
