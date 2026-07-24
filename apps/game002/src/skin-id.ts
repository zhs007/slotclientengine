export const GAME002_SUPPORTED_SKINS = Object.freeze(["1", "2"] as const);

export type Game002SkinId = (typeof GAME002_SUPPORTED_SKINS)[number];

export function parseGame002SkinId(value: string): Game002SkinId {
  if (value === "1" || value === "2") {
    return value;
  }
  throw new Error('skin query parameter must be exactly "1" or "2".');
}

export function parseGame002SkinQuery(
  search: string | URLSearchParams,
): Game002SkinId {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const values = params.getAll("skin");
  if (values.length === 0) {
    throw new Error("skin query parameter is required.");
  }
  if (values.length > 1) {
    throw new Error(
      "skin query parameter must not be provided more than once.",
    );
  }
  const value = values[0];
  if (value.trim() !== value || value.length === 0 || /\s/u.test(value)) {
    throw new Error(
      "skin query parameter must be URL encoded and must not contain whitespace.",
    );
  }
  return parseGame002SkinId(value);
}
