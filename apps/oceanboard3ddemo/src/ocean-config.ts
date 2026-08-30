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

export interface UnderwaterBufferSize {
  readonly width: number;
  readonly height: number;
}

export function getUnderwaterBufferSize(
  drawingBufferWidth: number,
  drawingBufferHeight: number,
): UnderwaterBufferSize {
  if (
    !Number.isFinite(drawingBufferWidth) ||
    !Number.isFinite(drawingBufferHeight) ||
    drawingBufferWidth <= 0 ||
    drawingBufferHeight <= 0
  ) {
    throw new RangeError(
      `Invalid underwater drawing buffer size: ${String(drawingBufferWidth)}x${String(drawingBufferHeight)}.`,
    );
  }
  const scale = 0.72;
  return {
    width: Math.max(1, Math.floor(drawingBufferWidth * scale)),
    height: Math.max(1, Math.floor(drawingBufferHeight * scale)),
  };
}
