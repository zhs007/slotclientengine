import { clampNumber, roundTo } from "./coordinates";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GTransformConfig,
} from "../v5g/types";

export type V5GEasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "backOut";

export interface V5GAnimationSampleBase {
  transform: V5GTransformConfig;
  opacity: number;
}

export interface V5GAnimationSampleResult {
  transform: V5GTransformConfig;
  opacity: number;
}

export const SUPPORTED_EASINGS: readonly V5GEasingName[] = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "backOut",
];

export const SUPPORTED_ANIMATION_TYPES: readonly V5GAnimationType[] = [
  "move",
  "fade",
  "scale_up",
  "scale_down",
  "rotate",
  "slide_in",
  "slide_out",
  "bounce_in",
  "pulse",
  "float",
  "swing",
];

const DEFAULT_EASING_BY_TYPE: Readonly<
  Record<V5GAnimationType, V5GEasingName>
> = {
  move: "easeOutQuad",
  fade: "linear",
  scale_up: "easeOutQuad",
  scale_down: "easeOutQuad",
  rotate: "linear",
  slide_in: "easeOutQuad",
  slide_out: "easeInQuad",
  bounce_in: "backOut",
  pulse: "linear",
  float: "linear",
  swing: "linear",
};

export function sampleLayerAnimationsAtTime(
  base: V5GAnimationSampleBase,
  animations: readonly V5GAnimationConfig[],
  time: number,
): V5GAnimationSampleResult {
  const result: V5GAnimationSampleResult = {
    transform: { ...base.transform },
    opacity: base.opacity,
  };

  for (const animation of [...animations].sort(
    (a, b) => a.startTime - b.startTime,
  )) {
    if (!animation.enabled) continue;

    const progress = getAnimationProgress(animation, time);
    if (progress === null) continue;

    const easedProgress = easeProgress(progress, getAnimationEasing(animation));

    if (animation.type === "move")
      sampleMove(result, animation, easedProgress, base.transform);
    else if (animation.type === "slide_in" || animation.type === "slide_out")
      sampleSlide(result, animation, easedProgress, base);
    else if (animation.type === "fade")
      sampleFade(result, animation, easedProgress);
    else if (animation.type === "bounce_in")
      sampleBounceIn(result, animation, progress, base);
    else if (animation.type === "scale_up" || animation.type === "scale_down")
      sampleScale(result, animation, easedProgress, base.transform);
    else if (animation.type === "pulse")
      samplePulse(result, animation, progress, base.transform);
    else if (animation.type === "float")
      sampleFloat(result, animation, progress, base.transform);
    else if (animation.type === "swing")
      sampleSwing(result, animation, progress, base.transform);
    else if (animation.type === "rotate")
      sampleRotate(result, animation, easedProgress, base.transform);
    else throw new Error(`Unsupported V5G animation type: ${animation.type}`);
  }

  result.transform.x = roundTo(result.transform.x, 4);
  result.transform.y = roundTo(result.transform.y, 4);
  result.transform.scaleX = roundTo(result.transform.scaleX, 4);
  result.transform.scaleY = roundTo(result.transform.scaleY, 4);
  result.transform.rotation = roundTo(result.transform.rotation, 4);
  result.opacity = roundTo(clampNumber(result.opacity, 0, 1), 4);
  return result;
}

export function easeProgress(progress: number, easing: V5GEasingName): number {
  const t = clampNumber(progress, 0, 1);
  if (easing === "linear") return t;
  if (easing === "easeInQuad") return t * t;
  if (easing === "easeOutQuad") return 1 - (1 - t) * (1 - t);
  if (easing === "easeInOutQuad")
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  if (easing === "backOut") return backOutProgress(t, 1.70158);
  throw new Error(`Unsupported V5G easing: ${String(easing)}`);
}

export function isSupportedAnimationType(
  value: string,
): value is V5GAnimationType {
  return SUPPORTED_ANIMATION_TYPES.includes(value as V5GAnimationType);
}

export function isSupportedEasing(value: string): value is V5GEasingName {
  return SUPPORTED_EASINGS.includes(value as V5GEasingName);
}

export function getDefaultEasing(type: V5GAnimationType): V5GEasingName {
  return DEFAULT_EASING_BY_TYPE[type];
}

export function backOutProgress(progress: number, overshoot: number): number {
  const t = clampNumber(progress, 0, 1);
  const c1 = Math.max(0, overshoot);
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function sampleMove(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const fromX = getNumberParam(animation, "fromX");
  const fromY = getNumberParam(animation, "fromY");
  const originX = getOptionalNumberParam(animation, "baseX", fromX);
  const originY = getOptionalNumberParam(animation, "baseY", fromY);
  result.transform.x =
    baseTransform.x +
    lerp(fromX, getNumberParam(animation, "toX"), progress) -
    originX;
  result.transform.y =
    baseTransform.y +
    lerp(fromY, getNumberParam(animation, "toY"), progress) -
    originY;
}

function sampleSlide(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  result.transform.x =
    base.transform.x +
    lerp(
      getNumberParam(animation, "fromX"),
      getNumberParam(animation, "toX"),
      progress,
    );
  result.transform.y =
    base.transform.y +
    lerp(
      getNumberParam(animation, "fromY"),
      getNumberParam(animation, "toY"),
      progress,
    );

  if (
    animation.type === "slide_in" &&
    getOptionalBooleanParam(animation, "fadeIn", true)
  ) {
    result.opacity = lerp(0, base.opacity, progress);
  }
  if (
    animation.type === "slide_out" &&
    getOptionalBooleanParam(animation, "fadeOut", true)
  ) {
    result.opacity = lerp(base.opacity, 0, progress);
  }
}

function sampleFade(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.opacity = lerp(
    getNumberParam(animation, "fromOpacity"),
    getNumberParam(animation, "toOpacity"),
    progress,
  );
}

function sampleBounceIn(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  const ratio = backOutProgress(
    progress,
    getNumberParam(animation, "overshoot"),
  );
  const scaleRatio = Math.max(
    0,
    lerp(
      getNumberParam(animation, "fromScale"),
      getNumberParam(animation, "toScale"),
      ratio,
    ),
  );
  result.transform.scaleX = base.transform.scaleX * scaleRatio;
  result.transform.scaleY = base.transform.scaleY * scaleRatio;
  if (getOptionalBooleanParam(animation, "fadeIn", true)) {
    result.opacity = lerp(0, base.opacity, clampNumber(progress * 1.25, 0, 1));
  }
}

function sampleScale(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const signX = getScaleSign(baseTransform.scaleX);
  const signY = getScaleSign(baseTransform.scaleY);
  result.transform.scaleX =
    signX *
    Math.abs(
      lerp(
        getNumberParam(animation, "fromScaleX"),
        getNumberParam(animation, "toScaleX"),
        progress,
      ),
    );
  result.transform.scaleY =
    signY *
    Math.abs(
      lerp(
        getNumberParam(animation, "fromScaleY"),
        getNumberParam(animation, "toScaleY"),
        progress,
      ),
    );
}

function samplePulse(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const cycle = getLoopWave(progress, getNumberParam(animation, "cycles"));
  const scaleRatio = lerp(1, getNumberParam(animation, "scale"), cycle);
  result.transform.scaleX = baseTransform.scaleX * scaleRatio;
  result.transform.scaleY = baseTransform.scaleY * scaleRatio;
}

function sampleFloat(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  result.transform.y =
    baseTransform.y +
    Math.sin(progress * Math.PI * 2 * getNumberParam(animation, "cycles")) *
      getNumberParam(animation, "amplitude");
}

function sampleSwing(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  result.transform.rotation =
    baseTransform.rotation +
    Math.sin(progress * Math.PI * 2 * getNumberParam(animation, "cycles")) *
      getNumberParam(animation, "angle");
}

function sampleRotate(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  result.transform.rotation =
    baseTransform.rotation +
    lerp(
      getNumberParam(animation, "fromRotation"),
      getNumberParam(animation, "toRotation"),
      progress,
    );
}

function getAnimationProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start) return null;
  if (time >= end) return 1;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

function getAnimationEasing(animation: V5GAnimationConfig): V5GEasingName {
  const value = animation.params.easing;
  if (value === undefined) return getDefaultEasing(animation.type);
  if (typeof value === "string" && isSupportedEasing(value)) return value;
  throw new Error(`Unsupported V5G easing: ${String(value)}`);
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}

function getOptionalNumberParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: number,
): number {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a finite number.`,
  );
}

function getOptionalBooleanParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: boolean,
): boolean {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a boolean.`,
  );
}

function getScaleSign(scale: number): number {
  return scale < 0 ? -1 : 1;
}

function getLoopWave(progress: number, cycles: number): number {
  return (1 - Math.cos(progress * Math.PI * 2 * cycles)) / 2;
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * clampNumber(ratio, 0, 1);
}
