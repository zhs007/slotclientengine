export type ParsedColor = {
  tint: number;
  alpha: number;
};

export function parseSpineColor(color: string): ParsedColor {
  const normalized = color.trim().toLowerCase();
  const safe = normalized.length === 8 ? normalized : "ffffffff";
  const rgb = Number.parseInt(safe.slice(0, 6), 16);
  const alpha = Number.parseInt(safe.slice(6, 8), 16) / 255;

  return {
    tint: Number.isNaN(rgb) ? 0xffffff : rgb,
    alpha: Number.isNaN(alpha) ? 1 : alpha
  };
}