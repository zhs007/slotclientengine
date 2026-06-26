export const GAME002_SUPPORTED_SKINS = Object.freeze(["2", "3"] as const);

export type Game002SkinId = (typeof GAME002_SUPPORTED_SKINS)[number];

export function parseGame002SkinId(value: string): Game002SkinId {
  if (isGame002SkinId(value)) {
    return value;
  }
  throw new Error('skin query parameter must be either "2" or "3".');
}

function isGame002SkinId(value: string): value is Game002SkinId {
  return GAME002_SUPPORTED_SKINS.includes(value as Game002SkinId);
}
