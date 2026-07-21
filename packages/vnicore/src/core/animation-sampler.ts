import { clampNumber, roundTo } from "./coordinates.js";
import {
  parseMultiMovePointsJson,
  type V5GMultiMovePoint,
} from "./multi-move.js";
import { getTimelineAnimationProgress } from "./timeline-progress.js";
import type {
  V5GAnimationConfig,
  V5GAnimationParamValue,
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
  visualRotation: number;
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
  "particle_stream",
  "particle_twinkle",
  "particle_wall",
  "particle_combo",
];

export const DETERMINISTIC_EFFECT_ANIMATION_TYPES: readonly V5GAnimationType[] =
  [
    "gather_particles",
    "smoke_mist",
    "energy_ring",
    "slash_light",
    "flame_flicker",
    "wave_band",
    "wave_distort",
    "speed_lines",
    "drift_fall",
    "path_particles",
  ];

export const SUPPORTED_ANIMATION_TYPES: readonly V5GAnimationType[] = [
  "idle",
  "move",
  "multi_move",
  "fade",
  "scale_up",
  "scale_down",
  "scale_in",
  "scale_out",
  "pop",
  "bounce_jump",
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
  "particle_stream",
  "particle_twinkle",
  "particle_wall",
  "particle_combo",
  "chaser_light",
  "gather_particles",
  "smoke_mist",
  "energy_ring",
  "slash_light",
  "flame_flicker",
  "wave_band",
  "wave_distort",
  "speed_lines",
  "drift_fall",
  "path_particles",
  "shatter",
  "glow",
  "safe_glow",
  "squash_stretch",
  "card_carousel_3d",
];

const DEFAULT_EASING_BY_TYPE: Readonly<
  Record<V5GAnimationType, V5GEasingName>
> = {
  idle: "linear",
  move: "easeOutQuad",
  multi_move: "linear",
  fade: "linear",
  scale_up: "easeOutQuad",
  scale_down: "easeOutQuad",
  scale_in: "easeOutQuad",
  scale_out: "easeInQuad",
  pop: "easeOutQuad",
  bounce_jump: "linear",
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
  particle_stream: "linear",
  particle_twinkle: "linear",
  particle_wall: "linear",
  particle_combo: "easeInOutQuad",
  chaser_light: "linear",
  gather_particles: "easeInOutQuad",
  smoke_mist: "easeOutQuad",
  energy_ring: "easeOutQuad",
  slash_light: "easeOutQuad",
  flame_flicker: "linear",
  wave_band: "linear",
  wave_distort: "linear",
  speed_lines: "linear",
  drift_fall: "linear",
  path_particles: "linear",
  shatter: "easeOutQuad",
  glow: "linear",
  safe_glow: "linear",
  squash_stretch: "easeOutQuad",
  card_carousel_3d: "linear",
};

interface MultiMovePointCacheEntry {
  readonly source: string;
  readonly duration: number;
  readonly points: readonly V5GMultiMovePoint[];
}

const multiMovePointCache = new WeakMap<
  V5GAnimationConfig,
  MultiMovePointCacheEntry
>();

interface BounceJumpCacheEntry {
  readonly height: number;
  readonly bounceCount: number;
  readonly bounceDecay: number;
  readonly lobeHeights: readonly number[];
  readonly totalWeight: number;
}

const bounceJumpCache = new WeakMap<V5GAnimationConfig, BounceJumpCacheEntry>();

export function sampleLayerAnimationsAtTime(
  base: V5GAnimationSampleBase,
  animations: readonly V5GAnimationConfig[],
  time: number,
): V5GAnimationSampleResult {
  const result: V5GAnimationSampleResult = {
    transform: { ...base.transform },
    opacity: base.opacity,
    visualRotation: 0,
  };

  for (const animation of [...animations].sort(
    (a, b) => a.startTime - b.startTime,
  )) {
    if (!animation.enabled) continue;

    const progress = getAnimationProgressForSampling(animation, time);
    if (progress === null) continue;

    const easedProgress = easeProgress(progress, getAnimationEasing(animation));

    if (animation.type === "move") sampleMove(result, animation, easedProgress);
    else if (animation.type === "multi_move")
      sampleMultiMove(result, animation, time);
    else if (animation.type === "slide_in" || animation.type === "slide_out")
      sampleSlide(result, animation, easedProgress, base);
    else if (animation.type === "fade")
      sampleFade(result, animation, easedProgress);
    else if (animation.type === "bounce_in")
      sampleBounceIn(result, animation, easedProgress, base);
    else if (animation.type === "scale_up" || animation.type === "scale_down")
      sampleScale(result, animation, easedProgress, base.transform);
    else if (animation.type === "scale_in" || animation.type === "scale_out")
      sampleScaleEntryExit(result, animation, easedProgress, base);
    else if (animation.type === "pop") samplePop(result, animation, progress);
    else if (animation.type === "bounce_jump")
      sampleBounceJump(result, animation, progress);
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
      sampleSourceOpacity(result, animation, base);
    else if (isSourceOpacityEffectAnimationType(animation.type))
      sampleSourceOpacity(result, animation, base);
    else if (isKeepOriginalEffectAnimationType(animation.type))
      sampleKeepOriginalSource(result, animation);
    else if (animation.type === "shatter")
      sampleSourceOpacity(result, animation, base);
    else if (animation.type === "glow" || animation.type === "safe_glow")
      sampleKeepOriginalSource(result, animation);
    else if (animation.type === "chaser_light")
      sampleKeepOriginalSource(result, animation);
    else if (animation.type === "card_carousel_3d")
      sampleCardCarouselSource(result, animation, base);
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
  result.visualRotation = roundTo(result.visualRotation, 4);
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

export function isDeterministicEffectAnimationType(
  value: string,
): value is V5GAnimationType {
  return DETERMINISTIC_EFFECT_ANIMATION_TYPES.includes(
    value as V5GAnimationType,
  );
}

function isSourceOpacityEffectAnimationType(
  value: string,
): value is V5GAnimationType {
  return (
    value === "gather_particles" ||
    value === "smoke_mist" ||
    value === "energy_ring" ||
    value === "slash_light" ||
    value === "flame_flicker"
  );
}

function sampleCardCarouselSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  const keepOriginal = getOptionalBooleanParam(
    animation,
    "keepOriginal",
    false,
  );
  result.opacity = keepOriginal
    ? base.opacity * getNumberParam(animation, "sourceOpacity")
    : 0;
}

function isKeepOriginalEffectAnimationType(
  value: string,
): value is V5GAnimationType {
  return (
    value === "wave_band" ||
    value === "wave_distort" ||
    value === "speed_lines" ||
    value === "drift_fall" ||
    value === "path_particles"
  );
}

export function isSupportedEasing(value: string): value is V5GEasingName {
  return SUPPORTED_EASINGS.includes(value as V5GEasingName);
}

export function shouldHideLayerOutsideActiveAnimation(
  animations: readonly V5GAnimationConfig[],
  time: number,
): boolean {
  const enabledAnimations = animations.filter((animation) => animation.enabled);
  if (enabledAnimations.length === 0) return false;
  return !enabledAnimations.some((animation) => {
    const start = animation.startTime;
    const end = animation.startTime + animation.duration;
    return time >= start && time <= end;
  });
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
    lerpOvershoot(fromX, getNumberParam(animation, "toX"), progress) - originX;
  result.transform.y +=
    lerpOvershoot(fromY, getNumberParam(animation, "toY"), progress) - originY;
}

function sampleMultiMove(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  time: number,
): void {
  const points = getMultiMovePoints(animation);
  const localTime = clampNumber(
    time - animation.startTime,
    0,
    animation.duration,
  );
  if (localTime <= points[0].time) {
    result.transform.x += points[0].x;
    result.transform.y += points[0].y;
    return;
  }

  const lastPoint = points[points.length - 1];
  if (localTime >= lastPoint.time) {
    result.transform.x += lastPoint.x;
    result.transform.y += lastPoint.y;
    return;
  }

  for (let index = 1; index < points.length; index += 1) {
    const fromPoint = points[index - 1];
    const toPoint = points[index];
    if (localTime > toPoint.time) continue;
    const segmentDuration = Math.max(toPoint.time - fromPoint.time, 0.0001);
    const progress = clampNumber(
      (localTime - fromPoint.time) / segmentDuration,
      0,
      1,
    );
    const easedProgress = easeProgress(progress, toPoint.easing);
    result.transform.x += lerpOvershoot(fromPoint.x, toPoint.x, easedProgress);
    result.transform.y += lerpOvershoot(fromPoint.y, toPoint.y, easedProgress);
    return;
  }
}

function sampleSlide(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  result.transform.x += lerpOvershoot(
    getNumberParam(animation, "fromX"),
    getNumberParam(animation, "toX"),
    progress,
  );
  result.transform.y += lerpOvershoot(
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

function sampleBounceJump(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const p = clampNumber(progress, 0, 1);
  const height = Math.max(0, getNumberParam(animation, "height"));
  const anticipationRatio = clampNumber(
    getNumberParam(animation, "anticipationRatio"),
    0.02,
    0.6,
  );
  const squash = clampNumber(getNumberParam(animation, "squash"), 0, 0.9);
  const stretch = clampNumber(getNumberParam(animation, "stretch"), 0, 0.9);
  const topSquash = clampNumber(getNumberParam(animation, "topSquash"), 0, 0.6);
  const bounceCount = Math.round(
    clampNumber(getNumberParam(animation, "bounceCount"), 0, 8),
  );
  const bounceDecay = clampNumber(
    getNumberParam(animation, "bounceDecay"),
    0.05,
    0.95,
  );
  const landSquash = clampNumber(
    getNumberParam(animation, "landSquash"),
    0,
    0.9,
  );

  let offsetY = 0;
  let scaleXRatio = 1;
  let scaleYRatio = 1;
  if (p < anticipationRatio) {
    const phase = clampNumber(p / anticipationRatio, 0, 1);
    const wave = Math.sin(phase * Math.PI);
    const squashWave = easeProgress(phase, "easeOutQuad");
    offsetY = -height * 0.06 * wave;
    scaleXRatio *= 1 + squash * 0.55 * squashWave;
    scaleYRatio *= Math.max(0.1, 1 - squash * squashWave);
  } else {
    const jumpProgress = clampNumber(
      (p - anticipationRatio) / Math.max(1 - anticipationRatio, 0.0001),
      0,
      1,
    );
    const cache = getBounceJumpCache(
      animation,
      height,
      bounceCount,
      bounceDecay,
    );
    let accumulated = 0;
    let currentStart = 0;
    let currentEnd = 1;
    let currentHeight = cache.lobeHeights[0] ?? height;
    let currentIndex = 0;
    for (let index = 0; index < cache.lobeHeights.length; index += 1) {
      const lobeHeight = cache.lobeHeights[index];
      const span =
        Math.sqrt(Math.max(lobeHeight, 1)) /
        Math.max(cache.totalWeight, 0.0001);
      currentStart = accumulated;
      currentEnd = accumulated + span;
      currentHeight = lobeHeight;
      currentIndex = index;
      if (
        jumpProgress <= currentEnd ||
        lobeHeight === cache.lobeHeights[cache.lobeHeights.length - 1]
      ) {
        break;
      }
      accumulated = currentEnd;
    }
    const lobeProgress = clampNumber(
      (jumpProgress - currentStart) /
        Math.max(currentEnd - currentStart, 0.0001),
      0,
      1,
    );
    offsetY = 4 * currentHeight * lobeProgress * (1 - lobeProgress);

    const velocity = 1 - 2 * lobeProgress;
    const flightStretch = Math.max(0, velocity) * stretch;
    const apex = 1 - clampNumber(Math.abs(lobeProgress - 0.5) / 0.18, 0, 1);
    const landing =
      lobeProgress < 0.5
        ? 1 - clampNumber(lobeProgress / 0.14, 0, 1)
        : 1 - clampNumber((1 - lobeProgress) / 0.14, 0, 1);
    const lobeIndex = height === 0 ? 0 : currentIndex;
    const decayScale = Math.pow(bounceDecay, Math.max(0, lobeIndex));
    const landingSquash = landSquash * landing * decayScale;
    const topCompress = topSquash * apex;
    scaleYRatio *= Math.max(
      0.1,
      1 + flightStretch - landingSquash - topCompress,
    );
    scaleXRatio *= Math.max(
      0.1,
      1 - flightStretch * 0.35 + landingSquash * 0.55 + topCompress * 0.35,
    );
  }
  result.transform.y += offsetY;
  result.transform.scaleX *= scaleXRatio;
  result.transform.scaleY *= scaleYRatio;
}

function getBounceJumpCache(
  animation: V5GAnimationConfig,
  height: number,
  bounceCount: number,
  bounceDecay: number,
): BounceJumpCacheEntry {
  const cached = bounceJumpCache.get(animation);
  if (
    cached?.height === height &&
    cached.bounceCount === bounceCount &&
    cached.bounceDecay === bounceDecay
  ) {
    return cached;
  }
  const lobeCount = Math.max(1, bounceCount + 1);
  const lobeHeights = new Array<number>(lobeCount);
  let totalWeight = 0;
  for (let index = 0; index < lobeCount; index += 1) {
    const lobeHeight = height * Math.pow(bounceDecay, index);
    lobeHeights[index] = lobeHeight;
    totalWeight += Math.sqrt(Math.max(lobeHeight, 1));
  }
  const entry = {
    height,
    bounceCount,
    bounceDecay,
    lobeHeights,
    totalWeight,
  };
  bounceJumpCache.set(animation, entry);
  return entry;
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
  if (Object.prototype.hasOwnProperty.call(animation.params, "turns")) {
    const pressure = clampNumber(getNumberParam(animation, "pressure"), 0, 0.8);
    const motionProgress = easeSpinProgress(
      progress,
      getNumberParam(animation, "accelRatio"),
      getNumberParam(animation, "decelRatio"),
    );
    const rotation =
      getNumberParam(animation, "turns") *
      360 *
      getNumberParam(animation, "direction") *
      motionProgress;
    if (pressure > 0.001) {
      result.transform.scaleX *=
        1 +
        pressure *
          clampNumber(getNumberParam(animation, "pressureStretch"), 0, 1);
      result.transform.scaleY *= Math.max(0.1, 1 - pressure);
      result.visualRotation += rotation;
    } else {
      result.transform.rotation += rotation;
    }
    return;
  }
  result.transform.rotation += lerpOvershoot(
    getNumberParam(animation, "fromRotation"),
    getNumberParam(animation, "toRotation"),
    progress,
  );
}

function easeSpinProgress(
  progress: number,
  accelRatio: number,
  decelRatio: number,
): number {
  const t = clampNumber(progress, 0, 1);
  const accel = clampNumber(accelRatio, 0, 0.8);
  const decel = clampNumber(decelRatio, 0, 0.8);
  const totalEase = accel + decel;
  if (totalEase <= 0.0001) return t;
  const normalizedAccel = totalEase > 0.95 ? (accel / totalEase) * 0.95 : accel;
  const normalizedDecel = totalEase > 0.95 ? (decel / totalEase) * 0.95 : decel;
  const linearSpan = Math.max(0, 1 - normalizedAccel - normalizedDecel);
  const speedArea = linearSpan + normalizedAccel * 0.5 + normalizedDecel * 0.5;
  if (speedArea <= 0.0001) return t;
  if (t <= normalizedAccel && normalizedAccel > 0) {
    const phase = t / normalizedAccel;
    return (normalizedAccel * phase * phase * 0.5) / speedArea;
  }
  if (t >= 1 - normalizedDecel && normalizedDecel > 0) {
    const phase = (t - (1 - normalizedDecel)) / normalizedDecel;
    const beforeDecel = normalizedAccel * 0.5 + linearSpan;
    const decelArea = normalizedDecel * (phase - phase * phase * 0.5);
    return (beforeDecel + decelArea) / speedArea;
  }
  return (normalizedAccel * 0.5 + (t - normalizedAccel)) / speedArea;
}

function sampleSourceOpacity(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  result.opacity = base.opacity * getNumberParam(animation, "sourceOpacity");
}

function sampleKeepOriginalSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
): void {
  const keepOriginalFallback =
    animation.type !== "wave_band" &&
    animation.type !== "wave_distort" &&
    animation.type !== "speed_lines" &&
    animation.type !== "drift_fall" &&
    animation.type !== "path_particles";
  if (getOptionalBooleanParam(animation, "keepOriginal", keepOriginalFallback))
    return;
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

  result.transform.x += lerpOvershoot(fromX, toX, easedProgress);
  result.transform.y += lerpOvershoot(fromY, toY, easedProgress);

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
  return getTimelineAnimationProgress(animation, time);
}

function getAnimationProgressForSampling(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const progress = getAnimationProgress(animation, time);
  if (progress !== null) return progress;
  if (
    time > animation.startTime + animation.duration &&
    shouldPersistEndedTransform(animation.type)
  ) {
    return 1;
  }
  return null;
}

function shouldPersistEndedTransform(type: V5GAnimationType): boolean {
  return (
    type === "move" ||
    type === "multi_move" ||
    type === "slide_in" ||
    type === "slide_out" ||
    type === "squash_stretch"
  );
}

function getMultiMovePoints(
  animation: V5GAnimationConfig,
): readonly V5GMultiMovePoint[] {
  const source = getStringParam(animation, "pointsJson");
  const cached = multiMovePointCache.get(animation);
  if (cached?.source === source && cached.duration === animation.duration) {
    return cached.points;
  }
  const points = parseMultiMovePointsJson(
    source,
    animation.duration,
    `V5G animation "${animation.id}" multi_move pointsJson`,
    isSupportedEasing,
  );
  multiMovePointCache.set(animation, {
    source,
    duration: animation.duration,
    points,
  });
  return points;
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

function getStringParam(animation: V5GAnimationConfig, key: string): string {
  const value: V5GAnimationParamValue | undefined = animation.params[key];
  if (typeof value === "string") return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires string param "${key}".`,
  );
}

function getLoopWave(progress: number, cycles: number): number {
  return (1 - Math.cos(progress * Math.PI * 2 * cycles)) / 2;
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * clampNumber(ratio, 0, 1);
}

function lerpOvershoot(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}
