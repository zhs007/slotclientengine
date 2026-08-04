export const GAME003_SUPPORTED_SKINS = Object.freeze(["2"] as const);

export type Game003SkinId = (typeof GAME003_SUPPORTED_SKINS)[number];

export function parseGame003SkinId(value: string): Game003SkinId {
  if (value === "2") {
    return value;
  }
  throw new Error('skin query parameter must be exactly "2".');
}

export function parseGame003SkinQuery(
  search: string | URLSearchParams,
): Game003SkinId {
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
  return parseGame003SkinId(value);
}
