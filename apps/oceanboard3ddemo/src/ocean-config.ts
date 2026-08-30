export interface OceanCameraProfile {
  readonly fov: number;
  readonly lookY: number;
  readonly lookZ: number;
}

export function getOceanCameraProfile(aspect: number): OceanCameraProfile {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError(`Invalid ocean viewport aspect: ${String(aspect)}.`);
  }
  if (aspect < 0.72) return { fov: 48, lookY: -17.2, lookZ: -56 };
  if (aspect < 1.1) return { fov: 43, lookY: -13.8, lookZ: -58 };
  return { fov: 37, lookY: -9.5, lookZ: -62 };
}

export function clampOceanPixelRatio(pixelRatio: number): number {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return 1;
  return Math.min(pixelRatio, 1.5);
}
