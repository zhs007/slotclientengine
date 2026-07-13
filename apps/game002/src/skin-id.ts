export const GAME002_SUPPORTED_SKINS = Object.freeze(["1"] as const);

export type Game002SkinId = (typeof GAME002_SUPPORTED_SKINS)[number];

export function parseGame002SkinId(value: string): Game002SkinId {
  if (value === "1") {
    return value;
  }
  throw new Error('skin query parameter must be exactly "1".');
}
