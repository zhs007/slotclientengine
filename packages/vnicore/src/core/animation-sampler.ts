import { clampNumber, roundTo } from "./coordinates.js";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GTransformConfig,
} from "./types.js";

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

export const PARTICLE_ANIMATION_TYPES: readonly V5GAnimationType[] = [
  "particles",
  "particle_twinkle",
  "particle_wall",
  "particle_combo",
];

export const SUPPORTED_ANIMATION_TYPES: readonly V5GAnimationType[] = [
  "idle",
  "move",
  "fade",
  "scale_up",
  "scale_down",
  "scale_in",
  "scale_out",
  "pop",
  "shake",
  "blink",
  "rotate",
  "slide_in",
  "slide_out",
  "bounce_in",
  "pulse",
  "float",
  "swing",
  "particles",
  "particle_twinkle",
  "particle_wall",
  "particle_combo",
  "shatter",
  "glow",
  "squash_stretch",
];

const DEFAULT_EASING_BY_TYPE: Readonly<
  Record<V5GAnimationType, V5GEasingName>
> = {
  idle: "linear",
  move: "easeOutQuad",
  fade: "linear",
  scale_up: "easeOutQuad",
  scale_down: "easeOutQuad",
  scale_in: "easeOutQuad",
  scale_out: "easeInQuad",
  pop: "easeOutQuad",
  shake: "linear",
  blink: "linear",
  rotate: "linear",
  slide_in: "easeOutQuad",
  slide_out: "easeInQuad",
  bounce_in: "backOut",
  pulse: "linear",
  float: "linear",
  swing: "linear",
  particles: "linear",
  particle_twinkle: "linear",
  particle_wall: "linear",
  particle_combo: "easeInOutQuad",
  shatter: "easeOutQuad",
  glow: "linear",
  squash_stretch: "easeOutQuad",
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

    if (animation.type === "move") sampleMove(result, animation, easedProgress);
    else if (animation.type === "slide_in" || animation.type === "slide_out")
      sampleSlide(result, animation, easedProgress, base);
    else if (animation.type === "fade")
      sampleFade(result, animation, easedProgress);
    else if (animation.type === "bounce_in")
      sampleBounceIn(result, animation, progress, base);
    else if (animation.type === "scale_up" || animation.type === "scale_down")
      sampleScale(result, animation, easedProgress, base.transform);
    else if (animation.type === "scale_in" || animation.type === "scale_out")
      sampleScaleEntryExit(result, animation, easedProgress, base);
    else if (animation.type === "pop") samplePop(result, animation, progress);
    else if (animation.type === "shake")
      sampleShake(result, animation, progress);
    else if (animation.type === "blink")
      sampleBlink(result, animation, progress);
    else if (animation.type === "pulse")
      samplePulse(result, animation, progress);
    else if (animation.type === "float")
      sampleFloat(result, animation, progress);
    else if (animation.type === "swing")
      sampleSwing(result, animation, progress);
    else if (animation.type === "rotate")
      sampleRotate(result, animation, easedProgress);
    else if (animation.type === "squash_stretch")
      sampleSquashStretch(result, animation, easedProgress);
    else if (animation.type === "particle_combo")
      sampleParticleComboSource(result, animation, base);
    else if (animation.type === "shatter")
      sampleShatterSource(result, animation, base);
    else if (animation.type === "glow") sampleGlowSource(result, animation);
    else if (isParticleAnimationType(animation.type)) {
      // Particle animations are sampled by particle-sampler. They do not alter
      // the base layer transform or opacity here.
    } else if (animation.type === "idle") {
      // Idle is a timeline coverage marker. It intentionally leaves base
      // transform and opacity unchanged.
    } else throw new Error(`Unsupported V5G animation type: ${animation.type}`);
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

export function isParticleAnimationType(
  value: string,
): value is V5GAnimationType {
  return PARTICLE_ANIMATION_TYPES.includes(value as V5GAnimationType);
}

export function isSupportedEasing(value: string): value is V5GEasingName {
  return SUPPORTED_EASINGS.includes(value as V5GEasingName);
}

export function getDefaultEasing(type: V5GAnimationType): V5GEasingName {
  const easing = DEFAULT_EASING_BY_TYPE[type];
  if (!easing) {
    throw new Error(`Unsupported V5G animation type: ${String(type)}`);
  }
  return easing;
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
): void {
  const fromX = getNumberParam(animation, "fromX");
  const fromY = getNumberParam(animation, "fromY");
  const originX = getOptionalNumberParam(animation, "baseX", fromX);
  const originY = getOptionalNumberParam(animation, "baseY", fromY);
  result.transform.x +=
    lerp(fromX, getNumberParam(animation, "toX"), progress) - originX;
  result.transform.y +=
    lerp(fromY, getNumberParam(animation, "toY"), progress) - originY;
}

function sampleSlide(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  result.transform.x += lerp(
    getNumberParam(animation, "fromX"),
    getNumberParam(animation, "toX"),
    progress,
  );
  result.transform.y += lerp(
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
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
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
  const baseScaleX = Math.abs(baseTransform.scaleX) || 1;
  const baseScaleY = Math.abs(baseTransform.scaleY) || 1;
  const scaleRatioX =
    lerp(
      getNumberParam(animation, "fromScaleX"),
      getNumberParam(animation, "toScaleX"),
      progress,
    ) / baseScaleX;
  const scaleRatioY =
    lerp(
      getNumberParam(animation, "fromScaleY"),
      getNumberParam(animation, "toScaleY"),
      progress,
    ) / baseScaleY;
  result.transform.scaleX *= Math.abs(scaleRatioX);
  result.transform.scaleY *= Math.abs(scaleRatioY);
}

function sampleScaleEntryExit(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  const scaleRatio = Math.max(
    0,
    lerp(
      getNumberParam(animation, "fromScale"),
      getNumberParam(animation, "toScale"),
      progress,
    ),
  );
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
  if (
    animation.type === "scale_in" &&
    getOptionalBooleanParam(animation, "fadeIn", true)
  ) {
    result.opacity = lerp(0, base.opacity, progress);
  }
  if (
    animation.type === "scale_out" &&
    getOptionalBooleanParam(animation, "fadeOut", true)
  ) {
    result.opacity = lerp(base.opacity, 0, progress);
  }
}

function samplePop(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const peakAt = clampNumber(getNumberParam(animation, "peakAt"), 0.05, 0.95);
  const peakScale = getNumberParam(animation, "peakScale");
  const settleScale = getNumberParam(animation, "settleScale");
  const ratio =
    progress <= peakAt
      ? lerp(1, peakScale, easeProgress(progress / peakAt, "easeOutQuad"))
      : lerp(
          peakScale,
          settleScale,
          easeProgress((progress - peakAt) / (1 - peakAt), "easeOutQuad"),
        );
  result.transform.scaleX *= ratio;
  result.transform.scaleY *= ratio;
}

function sampleShake(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const cycles = getNumberParam(animation, "cycles");
  const decay = getOptionalBooleanParam(animation, "decay", true)
    ? 1 - progress
    : 1;
  const waveX = Math.sin(progress * Math.PI * 2 * cycles);
  const waveY = Math.cos(progress * Math.PI * 2 * cycles * 1.37);
  result.transform.x += getNumberParam(animation, "amplitudeX") * waveX * decay;
  result.transform.y += getNumberParam(animation, "amplitudeY") * waveY * decay;
}

function sampleBlink(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  if (progress >= 1) {
    result.opacity = getNumberParam(animation, "endOpacity");
    return;
  }
  const wave = getLoopWave(progress, getNumberParam(animation, "blinks"));
  result.opacity = lerp(
    getNumberParam(animation, "maxOpacity"),
    getNumberParam(animation, "minOpacity"),
    wave,
  );
}

function samplePulse(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const cycle = getLoopWave(progress, getNumberParam(animation, "cycles"));
  const scaleRatio = lerp(1, getNumberParam(animation, "scale"), cycle);
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
}

function sampleFloat(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.transform.y +=
    Math.sin(progress * Math.PI * 2 * getNumberParam(animation, "cycles")) *
    getNumberParam(animation, "amplitude");
}

function sampleSwing(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.transform.rotation +=
    Math.sin(progress * Math.PI * 2 * getNumberParam(animation, "cycles")) *
    getNumberParam(animation, "angle");
}

function sampleRotate(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.transform.rotation += lerp(
    getNumberParam(animation, "fromRotation"),
    getNumberParam(animation, "toRotation"),
    progress,
  );
}

function sampleParticleComboSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  result.opacity = base.opacity * getNumberParam(animation, "sourceOpacity");
}

function sampleShatterSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  result.opacity = base.opacity * getNumberParam(animation, "sourceOpacity");
}

function sampleGlowSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
): void {
  if (getOptionalBooleanParam(animation, "keepOriginal", true)) return;
  result.opacity = 0;
}

function sampleSquashStretch(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  easedProgress: number,
): void {
  const squashAngle = getNumberParam(animation, "squashAngle");
  const squashAmount = getNumberParam(animation, "squashAmount");
  const decayOscillateCount = getNumberParam(animation, "decayOscillateCount");
  const fromX = getNumberParam(animation, "fromX");
  const fromY = getNumberParam(animation, "fromY");
  const toX = getNumberParam(animation, "toX");
  const toY = getNumberParam(animation, "toY");

  result.transform.x += lerp(fromX, toX, easedProgress);
  result.transform.y += lerp(fromY, toY, easedProgress);

  if (squashAmount <= 0.001) return;

  const angleRad = squashAngle * (Math.PI / 180);
  const forceX = Math.cos(angleRad);
  const forceY = Math.sin(angleRad);
  const peakAt = 0.35;
  let squashFactor: number;
  if (easedProgress <= peakAt) {
    const phase = clampNumber(easedProgress / peakAt, 0, 1);
    squashFactor = 1 - squashAmount * easeProgress(phase, "easeOutQuad");
  } else {
    const decayPhase = (easedProgress - peakAt) / Math.max(1 - peakAt, 0.0001);
    if (decayOscillateCount <= 0) {
      const overshoot = squashAmount * 0.35;
      squashFactor =
        1 - squashAmount + overshoot * Math.sin(decayPhase * Math.PI);
    } else {
      const totalCycles = 1 + decayOscillateCount;
      const inner = decayPhase * Math.PI * 2 * totalCycles;
      const decay = Math.exp(-decayPhase * 4);
      squashFactor = 1 - squashAmount * decay * Math.cos(inner);
    }
  }

  squashFactor = clampNumber(squashFactor, 0.11, 3);
  const stretchX = 1 + (1 - squashFactor) * Math.abs(forceY);
  const stretchY = 1 + (1 - squashFactor) * Math.abs(forceX);
  result.transform.scaleX *= stretchX;
  result.transform.scaleY *= stretchY;
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

function getLoopWave(progress: number, cycles: number): number {
  return (1 - Math.cos(progress * Math.PI * 2 * cycles)) / 2;
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * clampNumber(ratio, 0, 1);
}
