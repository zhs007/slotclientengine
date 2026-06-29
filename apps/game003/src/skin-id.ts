export const GAME003_SUPPORTED_SKINS = Object.freeze(["1"] as const);

export type Game003SkinId = (typeof GAME003_SUPPORTED_SKINS)[number];

export function parseGame003SkinId(value: string): Game003SkinId {
  if (isGame003SkinId(value)) {
    return value;
  }
  throw new Error('skin query parameter must be "1".');
}

function isGame003SkinId(value: string): value is Game003SkinId {
  return GAME003_SUPPORTED_SKINS.includes(value as Game003SkinId);
}
