import type { V5GAnimationConfig } from "./types.js";

type VNICardCarousel3DPhasePreviewMode =
  | "full"
  | "intro"
  | "idle"
  | "fast"
  | "stop"
  | "hold";

export function getCardCarousel3DSyncedDuration(
  animation: V5GAnimationConfig,
): number {
  const mode = getStringParam(
    animation,
    "phasePreviewMode",
  ) as VNICardCarousel3DPhasePreviewMode;
  let duration: number;
  if (mode === "intro") duration = getNumberParam(animation, "introDuration");
  else if (mode === "idle")
    duration = getNumberParam(animation, "demoIdleDuration");
  else if (mode === "fast")
    duration = getNumberParam(animation, "fastDuration");
  else if (mode === "stop")
    duration = getNumberParam(animation, "stopDuration");
  else if (mode === "hold")
    duration = getNumberParam(animation, "holdDuration");
  else {
    duration =
      getNumberParam(animation, "introDuration") +
      getNumberParam(animation, "demoIdleDuration") +
      getNumberParam(animation, "fastDuration") +
      getNumberParam(animation, "stopDuration") +
      getNumberParam(animation, "holdDuration");
  }
  const snapped = Math.round(Math.round(duration / 0.05) * 0.05 * 100) / 100;
  return Math.min(3600, Math.max(0.05, snapped));
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `VNI animation "${animation.id}" card_carousel_3d param "${key}" must be a finite number.`,
    );
  }
  return value;
}

function getStringParam(animation: V5GAnimationConfig, key: string): string {
  const value = animation.params[key];
  if (typeof value !== "string") {
    throw new Error(
      `VNI animation "${animation.id}" card_carousel_3d param "${key}" must be a string.`,
    );
  }
  return value;
}
