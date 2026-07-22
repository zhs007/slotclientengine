import { clampNumber } from "./coordinates.js";
import type { V5GAnimationConfig } from "./types.js";

export function getTimelineAnimationProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start) return null;
  if (time > end) return null;
  if (time === end) return 1;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}
