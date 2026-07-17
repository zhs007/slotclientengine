export interface PreviewSize {
  readonly width: number;
  readonly height: number;
}

export const PREVIEW_SIZE_PRESETS = Object.freeze([
  Object.freeze({
    id: "landscape",
    label: "1920×1080",
    width: 1920,
    height: 1080,
  }),
  Object.freeze({ id: "portrait", label: "390×844", width: 390, height: 844 }),
  Object.freeze({
    id: "square",
    label: "1200×1200",
    width: 1200,
    height: 1200,
  }),
  Object.freeze({
    id: "near-square",
    label: "1430×1464",
    width: 1430,
    height: 1464,
  }),
]);

export function validatePreviewSize(size: PreviewSize): PreviewSize {
  if (!Number.isFinite(size.width) || size.width <= 0) {
    throw new Error("preview width 必须为有限正数。");
  }
  if (!Number.isFinite(size.height) || size.height <= 0) {
    throw new Error("preview height 必须为有限正数。");
  }
  return Object.freeze({ width: size.width, height: size.height });
}

export function clampPreviewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) throw new Error("preview zoom 必须为有限数。");
  return Math.min(2, Math.max(0.25, zoom));
}
