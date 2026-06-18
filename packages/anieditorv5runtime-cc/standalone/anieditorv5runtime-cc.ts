import {
  Color,
  Graphics,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  UIOpacity,
} from "cc";

export type V5GCoordinateMode = "center";
export type V5GLayerType = "image" | "text" | "group";
export type V5GAssetType = "image";
export type V5GBlendMode = "normal" | "add" | "screen" | "multiply" | "lighten";

export interface V5GStageConfig {
  width: number;
  height: number;
  coordinate: V5GCoordinateMode;
  duration: number;
  backgroundColor: string;
}

export interface V5GAssetConfig {
  id: string;
  type: V5GAssetType;
  path: string;
  originalName: string;
  width: number;
  height: number;
  fileWidth?: number;
  fileHeight?: number;
  fileScale?: number;
}

export interface V5GExportProfileConfig {
  id: string;
  purpose: "editing" | "runtime";
  assetScale: number;
  label?: string;
}

export interface V5GTransformConfig {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

export type V5GAnimationType =
  | "move"
  | "fade"
  | "scale_up"
  | "scale_down"
  | "scale_in"
  | "scale_out"
  | "pop"
  | "shake"
  | "blink"
  | "rotate"
  | "slide_in"
  | "slide_out"
  | "bounce_in"
  | "pulse"
  | "float"
  | "swing"
  | "particles"
  | "particle_twinkle";

export type V5GAnimationParamValue = string | number | boolean;

export interface V5GAnimationConfig {
  id: string;
  type: V5GAnimationType;
  name?: string;
  startTime: number;
  duration: number;
  enabled: boolean;
  seed: number;
  params: Record<string, V5GAnimationParamValue>;
}

export interface V5GLayerKeyframeConfig {
  id: string;
  time: number;
  transform: V5GTransformConfig;
  opacity: number;
  easing: "linear";
}

export interface V5GLayerConfig {
  id: string;
  name: string;
  type: V5GLayerType;
  assetId: string | null;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  transform: V5GTransformConfig;
  opacity: number;
  blendMode: V5GBlendMode;
  text?: string;
  animations: V5GAnimationConfig[];
  keyframes?: V5GLayerKeyframeConfig[];
}

export interface V5GParticleConfig {
  id: string;
  name: string;
  assetId: string | null;
  startTime: number;
  duration: number;
  seed: number;
  emitter: {
    x: number;
    y: number;
    type: "burst" | "rain" | "trail";
    count: number;
    radius: number;
  };
  params: Record<string, V5GAnimationParamValue>;
}

export interface V5GProjectConfig {
  schemaVersion: string;
  editor: {
    name: string;
    version: string;
  };
  engineTarget: {
    name: "cocos_creator";
    version: string;
  };
  name: string;
  exportProfile?: V5GExportProfileConfig;
  stage: V5GStageConfig;
  assets: V5GAssetConfig[];
  layers: V5GLayerConfig[];
  particles: V5GParticleConfig[];
}

export interface CocosPoint2D {
  x: number;
  y: number;
}

export interface V5GSize {
  width: number;
  height: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function v5gTransformToCocosPosition(
  transform: V5GTransformConfig,
): CocosPoint2D {
  return {
    x: transform.x,
    y: transform.y,
  };
}

export function opacityToCocosOpacity(opacity: number): number {
  return Math.round(clampNumber(opacity, 0, 1) * 255);
}

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
];

export const SUPPORTED_ANIMATION_TYPES: readonly V5GAnimationType[] = [
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
];

const DEFAULT_EASING_BY_TYPE: Readonly<
  Record<V5GAnimationType, V5GEasingName>
> = {
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
    else if (isParticleAnimationType(animation.type)) {
      // Particle animations are sampled by sampleParticleSpritesForLayer().
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
  return hasStringValue(SUPPORTED_ANIMATION_TYPES, value);
}

export function isParticleAnimationType(
  value: string,
): value is V5GAnimationType {
  return hasStringValue(PARTICLE_ANIMATION_TYPES, value);
}

export function isSupportedEasing(value: string): value is V5GEasingName {
  return hasStringValue(SUPPORTED_EASINGS, value);
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

export interface TextureSize {
  width: number;
  height: number;
}

export interface ParticleLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  opacity: number;
  visible: boolean;
  blendMode: V5GBlendMode;
}

export interface ParticleSpriteSample {
  layerId: string;
  animationId: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  alpha: number;
  blendMode: V5GBlendMode;
}

export function hasActiveParticleAnimation(
  layer: V5GLayerConfig,
  time: number,
): boolean {
  if (layer.type !== "image") return false;
  return layer.animations.some(
    (animation) =>
      animation.enabled &&
      isParticleAnimationType(animation.type) &&
      getParticleProgress(animation, time) !== null,
  );
}

export function getParticleProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start || time >= end) return null;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

export function sampleParticleSpritesForLayer(
  layer: V5GLayerConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  time: number,
): ParticleSpriteSample[] {
  if (layer.type !== "image" || !layer.visible || sampledLayer.opacity <= 0) {
    return [];
  }

  const sprites: ParticleSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled || !isParticleAnimationType(animation.type)) {
      continue;
    }
    const progress = getParticleProgress(animation, time);
    if (progress === null) continue;

    if (animation.type === "particles") {
      sprites.push(
        ...sampleParticleBurst(animation, sampledLayer, textureSize, progress),
      );
    } else if (animation.type === "particle_twinkle") {
      sprites.push(
        ...sampleParticleTwinkle(
          animation,
          sampledLayer,
          textureSize,
          progress,
        ),
      );
    }
  }
  return sprites;
}

export function seededRandom(
  seed: number,
  index: number,
  salt: number,
): number {
  const raw =
    Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453123;
  return raw - Math.floor(raw);
}

function sampleParticleBurst(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  const count = Math.round(
    clampParticleNumber(getNumberParam(animation, "count"), 1, 200),
  );
  const spread = clampParticleNumber(
    getNumberParam(animation, "spread"),
    0,
    1000,
  );
  const speed = clampParticleNumber(
    getNumberParam(animation, "speed"),
    0,
    2000,
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const gravity = clampParticleNumber(
    getNumberParam(animation, "gravity"),
    -2000,
    2000,
  );
  const fadeOut = getOptionalBooleanParam(animation, "fadeOut", true);
  const duration = Math.max(animation.duration, 0.0001);
  const age = progress * duration;
  const alphaBase =
    sampledLayer.opacity * (fadeOut ? Math.pow(1 - progress, 1.35) : 1);
  if (alphaBase <= 0.002) return [];

  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const sprites: ParticleSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const randomA = seededRandom(animation.seed, index, 1);
    const randomB = seededRandom(animation.seed, index, 2);
    const randomC = seededRandom(animation.seed, index, 3);
    const randomD = seededRandom(animation.seed, index, 4);
    const randomE = seededRandom(animation.seed, index, 5);
    const angle = randomA * Math.PI * 2;
    const burstPower = 0.55 + randomB * 0.85;
    const startRadius = spread * 0.22 * randomC;
    const travel = spread * progress + speed * age * burstPower;
    const offsetX = Math.cos(angle) * (startRadius + travel);
    const offsetY =
      Math.sin(angle) * (startRadius + travel) + 0.5 * gravity * age * age;
    const scale = Math.max(
      0.01,
      baseTextureScale * (0.55 + randomD * 0.9) * (1 - progress * 0.25),
    );
    const alpha = alphaBase * (0.55 + randomC * 0.45);
    sprites.push({
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      offsetX: roundTo(offsetX, 4),
      offsetY: roundTo(offsetY, 4),
      scale: roundTo(scale, 4),
      rotation: roundTo(
        (randomE - 0.5) * Math.PI * 0.75 + progress * Math.PI * (0.5 + randomB),
        4,
      ),
      alpha: roundTo(clampNumber(alpha, 0, 1), 4),
      blendMode: sampledLayer.blendMode,
    });
  }

  return sprites;
}

function sampleParticleTwinkle(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  const count = Math.round(
    clampParticleNumber(getNumberParam(animation, "count"), 1, 1000),
  );
  const radius = clampParticleNumber(
    getNumberParam(animation, "radius"),
    0,
    3000,
  );
  const spawnInterval = clampParticleNumber(
    getNumberParam(animation, "spawnInterval"),
    0.01,
    10,
  );
  const twinkleDuration = clampParticleNumber(
    getNumberParam(animation, "twinkleDuration"),
    0.03,
    10,
  );
  const batchMin = Math.round(
    clampParticleNumber(getNumberParam(animation, "batchMin"), 1, 100),
  );
  const batchMax = Math.round(
    clampParticleNumber(getNumberParam(animation, "batchMax"), batchMin, 100),
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const duration = Math.max(animation.duration, 0.0001);
  const elapsed = progress * duration;
  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const sprites: ParticleSpriteSample[] = [];
  let spawnedCount = 0;

  for (let batchIndex = 0; spawnedCount < count; batchIndex += 1) {
    const spawnTime = batchIndex * spawnInterval;
    if (spawnTime > elapsed) break;
    const batchRandom = seededRandom(animation.seed, batchIndex, 11);
    const batchCount = Math.min(
      count - spawnedCount,
      batchMin + Math.floor(batchRandom * (batchMax - batchMin + 1)),
    );
    for (let itemIndex = 0; itemIndex < batchCount; itemIndex += 1) {
      const particleIndex = spawnedCount + itemIndex;
      const localAge = (elapsed - spawnTime) / twinkleDuration;
      if (localAge < 0 || localAge > 1) continue;
      const randomA = seededRandom(animation.seed, particleIndex, 21);
      const randomB = seededRandom(animation.seed, particleIndex, 22);
      const randomC = seededRandom(animation.seed, particleIndex, 23);
      const randomD = seededRandom(animation.seed, particleIndex, 24);
      const angle = randomA * Math.PI * 2;
      const distance = Math.sqrt(randomB) * radius;
      const waveAlpha = Math.sin(localAge * Math.PI);
      const shimmer =
        0.78 + 0.22 * Math.sin(localAge * Math.PI * 6 + randomC * 6);
      const alpha = sampledLayer.opacity * Math.max(0, waveAlpha * shimmer);
      if (alpha <= 0.002) continue;
      sprites.push({
        layerId: sampledLayer.layerId,
        animationId: animation.id,
        offsetX: roundTo(Math.cos(angle) * distance, 4),
        offsetY: roundTo(Math.sin(angle) * distance, 4),
        scale: roundTo(
          Math.max(0.01, baseTextureScale * (0.65 + randomC * 0.85)),
          4,
        ),
        rotation: roundTo((randomD - 0.5) * Math.PI * 2, 4),
        alpha: roundTo(clampNumber(alpha, 0, 1), 4),
        blendMode: sampledLayer.blendMode,
      });
    }
    spawnedCount += batchCount;
  }

  return sprites;
}

function clampParticleNumber(value: number, min: number, max: number): number {
  return clampNumber(Number.isFinite(value) ? value : min, min, max);
}

function getTextureLongestEdge(textureSize: TextureSize): number {
  const width = Number(textureSize.width);
  const height = Number(textureSize.height);
  const longestEdge = Math.max(width, height);
  return Number.isFinite(longestEdge) && longestEdge > 0 ? longestEdge : 1;
}

export interface SampledLayerState {
  layerId: string;
  transform: V5GTransformConfig;
  opacity: number;
  visible: boolean;
  renderImageDisplay: boolean;
  hasActiveParticleAnimation: boolean;
  blendMode: V5GBlendMode;
}

export interface SampledProjectState {
  time: number;
  layers: SampledLayerState[];
}

export function sampleProjectAtTime(
  project: V5GProjectConfig,
  time: number,
): SampledProjectState {
  const clampedTime = roundTo(clampNumber(time, 0, project.stage.duration), 4);
  return {
    time: clampedTime,
    layers: project.layers.map((layer) =>
      sampleLayerAtTime(layer, clampedTime),
    ),
  };
}

export function sampleLayerAtTime(
  layer: V5GLayerConfig,
  time: number,
): SampledLayerState {
  const sampled = sampleLayerAnimationsAtTime(
    {
      transform: { ...layer.transform },
      opacity: layer.opacity,
    },
    layer.animations,
    time,
  );
  const hasAnyEnabled = layer.animations.some((animation) => animation.enabled);
  const hasPendingOpacityEntry = layer.animations.some(
    (animation) =>
      animation.enabled &&
      isOpacityEntryAnimation(animation) &&
      time < animation.startTime,
  );
  const hasActiveCoverage = hasAnyEnabled
    ? layer.animations.some(
        (animation) =>
          animation.enabled &&
          time >= animation.startTime &&
          time <= animation.startTime + animation.duration,
      )
    : true;
  const opacity =
    hasPendingOpacityEntry || (hasAnyEnabled && !hasActiveCoverage)
      ? 0
      : roundTo(clampNumber(sampled.opacity, 0, 1), 4);
  const activeParticleAnimation =
    opacity > 0 && hasActiveParticleAnimation(layer, time);
  const visible = layer.visible && opacity > 0;

  return {
    layerId: layer.id,
    transform: sampled.transform,
    opacity,
    visible,
    renderImageDisplay: visible && !activeParticleAnimation,
    hasActiveParticleAnimation: activeParticleAnimation,
    blendMode: layer.blendMode,
  };
}

function isOpacityEntryAnimation(animation: V5GAnimationConfig): boolean {
  if (animation.type === "fade") {
    return getProjectNumberParam(animation, "fromOpacity") === 0;
  }
  if (animation.type === "slide_in") {
    return getProjectBooleanParam(animation, "fadeIn", true);
  }
  if (animation.type === "bounce_in") {
    return getProjectBooleanParam(animation, "fadeIn", true);
  }
  if (animation.type === "scale_in") {
    return getProjectBooleanParam(animation, "fadeIn", true);
  }
  return false;
}

function getProjectNumberParam(
  animation: V5GAnimationConfig,
  key: string,
): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.NaN;
}

function getProjectBooleanParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: boolean,
): boolean {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  return value === true;
}

const SUPPORTED_BLEND_MODES: readonly V5GBlendMode[] = [
  "normal",
  "add",
  "screen",
  "multiply",
  "lighten",
];

const REQUIRED_NUMERIC_PARAMS: Readonly<
  Record<V5GAnimationType, readonly string[]>
> = {
  move: ["fromX", "fromY", "toX", "toY"],
  fade: ["fromOpacity", "toOpacity"],
  scale_up: ["fromScaleX", "fromScaleY", "toScaleX", "toScaleY"],
  scale_down: ["fromScaleX", "fromScaleY", "toScaleX", "toScaleY"],
  scale_in: ["fromScale", "toScale"],
  scale_out: ["fromScale", "toScale"],
  pop: ["peakScale", "settleScale", "peakAt"],
  shake: ["amplitudeX", "amplitudeY", "cycles"],
  blink: ["minOpacity", "maxOpacity", "blinks", "endOpacity"],
  rotate: ["fromRotation", "toRotation"],
  slide_in: ["fromX", "fromY", "toX", "toY"],
  slide_out: ["fromX", "fromY", "toX", "toY"],
  bounce_in: ["fromScale", "toScale", "overshoot"],
  pulse: ["scale", "cycles"],
  float: ["amplitude", "cycles"],
  swing: ["angle", "cycles"],
  particles: ["count", "spread", "speed", "size", "gravity"],
  particle_twinkle: [
    "radius",
    "count",
    "spawnInterval",
    "twinkleDuration",
    "batchMin",
    "batchMax",
    "size",
  ],
};

const OPTIONAL_BOOLEAN_PARAMS: Readonly<
  Partial<Record<V5GAnimationType, readonly string[]>>
> = {
  slide_in: ["fadeIn"],
  slide_out: ["fadeOut"],
  bounce_in: ["fadeIn"],
  scale_in: ["fadeIn"],
  scale_out: ["fadeOut"],
  shake: ["decay"],
  particles: ["fadeOut"],
};

const SUPPORTED_EDITOR_NAMES = ["victory_editor_v5_g", "VNI"] as const;

export interface ValidateCocosV5GProjectOptions {
  engineVersion?: "3.8.6";
}

export function assertV5GProject(value: unknown): V5GProjectConfig {
  const project = assertRecord(value, "V5G project");
  const schemaVersion = assertString(
    project.schemaVersion,
    "project.schemaVersion",
  );

  const editor = assertRecord(project.editor, "project.editor");
  const editorName = assertString(editor.name, "project.editor.name");
  const editorVersion = assertString(editor.version, "project.editor.version");

  const engineTarget = assertRecord(
    project.engineTarget,
    "project.engineTarget",
  );
  if (engineTarget.name !== "cocos_creator") {
    throw new Error("V5G project engineTarget.name must be cocos_creator.");
  }
  const engineTargetVersion = assertString(
    engineTarget.version,
    "project.engineTarget.version",
  );

  const projectName = assertString(project.name, "project.name");
  const exportProfile =
    project.exportProfile === undefined
      ? undefined
      : assertExportProfile(project.exportProfile, "project.exportProfile");

  const stage = assertRecord(project.stage, "project.stage");
  const stageWidth = assertNumber(stage.width, "project.stage.width");
  const stageHeight = assertNumber(stage.height, "project.stage.height");
  const stageCoordinate = assertString(
    stage.coordinate,
    "project.stage.coordinate",
  ) as V5GProjectConfig["stage"]["coordinate"];
  const stageDuration = assertNumber(stage.duration, "project.stage.duration");
  const stageBackgroundColor = assertString(
    stage.backgroundColor,
    "project.stage.backgroundColor",
  );

  const assets = assertArray(project.assets, "project.assets").map(
    (asset, index) => assertAsset(asset, index),
  );
  const layers = assertArray(project.layers, "project.layers").map(
    (layer, index) => assertLayer(layer, index),
  );
  const particles = assertArray(
    project.particles,
    "project.particles",
  ) as V5GProjectConfig["particles"];

  return {
    schemaVersion,
    editor: {
      name: editorName,
      version: editorVersion,
    },
    engineTarget: {
      name: "cocos_creator",
      version: engineTargetVersion,
    },
    name: projectName,
    exportProfile,
    stage: {
      width: stageWidth,
      height: stageHeight,
      coordinate: stageCoordinate,
      duration: stageDuration,
      backgroundColor: stageBackgroundColor,
    },
    assets,
    layers,
    particles,
  };
}

export function validateV5GProject(project: V5GProjectConfig): void {
  if (!isSupportedProjectSchemaVersion(project.schemaVersion)) {
    throw new Error(
      `Unsupported V5G schemaVersion: ${project.schemaVersion}. Expected V5G_0.x or VNI_0.x.`,
    );
  }
  if (!hasStringValue(SUPPORTED_EDITOR_NAMES, project.editor.name)) {
    throw new Error(`Unsupported V5G editor: ${project.editor.name}.`);
  }
  if (project.engineTarget.name !== "cocos_creator") {
    throw new Error(
      `Unsupported V5G engine target: ${project.engineTarget.name}.`,
    );
  }
  if (project.stage.coordinate !== "center") {
    throw new Error(
      `Unsupported V5G coordinate mode: ${project.stage.coordinate}.`,
    );
  }
  assertPositiveFinite(project.stage.width, "project.stage.width");
  assertPositiveFinite(project.stage.height, "project.stage.height");
  assertPositiveFinite(project.stage.duration, "project.stage.duration");
  parseColorHex(project.stage.backgroundColor);

  if (project.particles.length > 0) {
    throw new Error(
      "Unsupported V5G top-level particles: layer particle animations are supported, project.particles is not implemented.",
    );
  }
  if (project.exportProfile) {
    validateExportProfile(project.exportProfile, "project.exportProfile");
  }

  const assetsById = new Map<string, V5GAssetConfig>();
  const assetPaths = new Set<string>();
  for (const asset of project.assets) {
    if (assetsById.has(asset.id)) {
      throw new Error(`Duplicate V5G asset id: ${asset.id}.`);
    }
    if (assetPaths.has(asset.path)) {
      throw new Error(`Duplicate V5G asset path: ${asset.path}.`);
    }
    if (asset.type !== "image") {
      throw new Error(`Unsupported V5G asset type: ${asset.type}.`);
    }
    assertPositiveFinite(asset.width, `asset "${asset.id}" width`);
    assertPositiveFinite(asset.height, `asset "${asset.id}" height`);
    validateAssetFileMetadata(asset);
    validateAssetProfileMetadata(asset, project.exportProfile);
    assetsById.set(asset.id, asset);
    assetPaths.add(asset.path);
  }

  const layerIds = new Set<string>();
  for (const layer of project.layers) {
    if (layerIds.has(layer.id)) {
      throw new Error(`Duplicate V5G layer id: ${layer.id}.`);
    }
    layerIds.add(layer.id);
    assertSupportedLayer(layer, assetsById);
    for (const animation of layer.animations) {
      assertSupportedAnimation(animation, layer.id, project.stage.duration);
    }
  }
}

export function validateCocosV5GProject(
  project: V5GProjectConfig,
  options: ValidateCocosV5GProjectOptions = {},
): void {
  validateV5GProject(project);
  const expectedVersion = options.engineVersion ?? "3.8.6";
  if (project.engineTarget.version !== expectedVersion) {
    throw new Error(
      `Unsupported Cocos Creator version: ${project.engineTarget.version}. Expected ${expectedVersion}.`,
    );
  }

  for (const layer of project.layers) {
    if (layer.type !== "image") {
      throw new Error(`Unsupported Cocos V5G layer type: ${layer.type}.`);
    }
  }
}

export function parseColorHex(value: string): number {
  if (!/^#[0-9a-fA-F]{6}$/u.test(value)) {
    throw new Error(`Invalid V5G background color: ${value}.`);
  }
  return Number.parseInt(value.slice(1), 16);
}

export function assertSupportedLayer(
  layer: V5GLayerConfig,
  assetsById = new Map<string, V5GAssetConfig>(),
): void {
  if (layer.parentId !== null) {
    throw new Error(`Unsupported V5G parentId on layer "${layer.id}".`);
  }
  if (layer.type === "group") {
    throw new Error("Unsupported V5G layer type: group");
  }
  if (layer.type !== "image" && layer.type !== "text") {
    throw new Error(`Unsupported V5G layer type: ${layer.type}.`);
  }
  if (layer.type === "image") {
    if (!layer.assetId) {
      throw new Error(`V5G image layer "${layer.id}" requires assetId.`);
    }
    const asset = assetsById.get(layer.assetId);
    if (!asset) {
      throw new Error(
        `V5G image layer "${layer.id}" references missing asset "${layer.assetId}".`,
      );
    }
    if (asset.type !== "image") {
      throw new Error(
        `V5G image layer "${layer.id}" asset "${asset.id}" must be image.`,
      );
    }
  }
  if (layer.type === "text" && layer.assetId !== null) {
    throw new Error(`V5G text layer "${layer.id}" must not reference assetId.`);
  }
  if ((layer.keyframes ?? []).length > 0) {
    throw new Error(`Unsupported V5G keyframes on layer "${layer.id}".`);
  }
  validateTransform(layer.transform, `layer "${layer.id}" transform`);
  assertFiniteRange(layer.opacity, 0, 1, `layer "${layer.id}" opacity`);
  if (!hasStringValue(SUPPORTED_BLEND_MODES, layer.blendMode)) {
    throw new Error(`Unsupported V5G blendMode: ${layer.blendMode}.`);
  }
}

export function assertSupportedAnimation(
  animation: V5GAnimationConfig,
  layerId = "unknown",
  stageDuration = Number.POSITIVE_INFINITY,
): void {
  if (!isSupportedAnimationType(animation.type)) {
    throw new Error(`Unsupported V5G animation type: ${animation.type}`);
  }
  assertFiniteRange(
    animation.startTime,
    0,
    Number.POSITIVE_INFINITY,
    `animation "${animation.id}" startTime`,
  );
  assertPositiveFinite(
    animation.duration,
    `animation "${animation.id}" duration`,
  );
  if (animation.startTime + animation.duration > stageDuration) {
    throw new Error(
      `V5G animation "${animation.id}" on layer "${layerId}" exceeds stage.duration.`,
    );
  }
  const easing = animation.params.easing;
  if (easing !== undefined) {
    if (typeof easing !== "string" || !isSupportedEasing(easing)) {
      throw new Error(`Unsupported V5G easing: ${String(easing)}`);
    }
  } else {
    getDefaultEasing(animation.type);
  }

  for (const paramKey of REQUIRED_NUMERIC_PARAMS[animation.type]) {
    const value = animation.params[paramKey];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `V5G animation "${animation.id}" ${animation.type} requires numeric param "${paramKey}".`,
      );
    }
  }
  assertOptionalNumber(animation, "baseX");
  assertOptionalNumber(animation, "baseY");
  for (const paramKey of OPTIONAL_BOOLEAN_PARAMS[animation.type] ?? []) {
    assertOptionalBoolean(animation, paramKey);
  }
}

function assertAsset(value: unknown, index: number): V5GAssetConfig {
  const asset = assertRecord(value, `project.assets[${index}]`);
  return {
    id: assertString(asset.id, `project.assets[${index}].id`),
    type: assertString(
      asset.type,
      `project.assets[${index}].type`,
    ) as V5GAssetConfig["type"],
    path: assertString(asset.path, `project.assets[${index}].path`),
    originalName: assertString(
      asset.originalName,
      `project.assets[${index}].originalName`,
    ),
    width: assertNumber(asset.width, `project.assets[${index}].width`),
    height: assertNumber(asset.height, `project.assets[${index}].height`),
    fileWidth: assertOptionalNumberField(
      asset.fileWidth,
      `project.assets[${index}].fileWidth`,
    ),
    fileHeight: assertOptionalNumberField(
      asset.fileHeight,
      `project.assets[${index}].fileHeight`,
    ),
    fileScale: assertOptionalNumberField(
      asset.fileScale,
      `project.assets[${index}].fileScale`,
    ),
  };
}

function assertExportProfile(
  value: unknown,
  path: string,
): V5GExportProfileConfig {
  const profile = assertRecord(value, path);
  return {
    id: assertString(profile.id, `${path}.id`),
    purpose: assertString(
      profile.purpose,
      `${path}.purpose`,
    ) as V5GExportProfileConfig["purpose"],
    assetScale: assertNumber(profile.assetScale, `${path}.assetScale`),
    label:
      profile.label === undefined
        ? undefined
        : assertString(profile.label, `${path}.label`),
  };
}

function assertLayer(value: unknown, index: number): V5GLayerConfig {
  const layer = assertRecord(value, `project.layers[${index}]`);
  return {
    id: assertString(layer.id, `project.layers[${index}].id`),
    name: assertString(layer.name, `project.layers[${index}].name`),
    type: assertString(
      layer.type,
      `project.layers[${index}].type`,
    ) as V5GLayerConfig["type"],
    assetId:
      layer.assetId === null
        ? null
        : assertString(layer.assetId, `project.layers[${index}].assetId`),
    parentId:
      layer.parentId === null
        ? null
        : assertString(layer.parentId, `project.layers[${index}].parentId`),
    visible: assertBoolean(layer.visible, `project.layers[${index}].visible`),
    locked: assertBoolean(layer.locked, `project.layers[${index}].locked`),
    transform: assertTransform(
      layer.transform,
      `project.layers[${index}].transform`,
    ),
    opacity: assertNumber(layer.opacity, `project.layers[${index}].opacity`),
    blendMode: assertString(
      layer.blendMode,
      `project.layers[${index}].blendMode`,
    ) as V5GBlendMode,
    text:
      layer.text === undefined
        ? undefined
        : assertString(layer.text, `project.layers[${index}].text`),
    animations: assertArray(
      layer.animations,
      `project.layers[${index}].animations`,
    ).map((animation, animationIndex) =>
      assertAnimation(animation, index, animationIndex),
    ),
    keyframes: assertArray(
      layer.keyframes ?? [],
      `project.layers[${index}].keyframes`,
    ) as V5GLayerConfig["keyframes"],
  };
}

function assertAnimation(
  value: unknown,
  layerIndex: number,
  animationIndex: number,
): V5GAnimationConfig {
  const animation = assertRecord(
    value,
    `project.layers[${layerIndex}].animations[${animationIndex}]`,
  );
  const params = assertRecord(
    animation.params,
    `project.layers[${layerIndex}].animations[${animationIndex}].params`,
  );
  return {
    id: assertString(
      animation.id,
      `project.layers[${layerIndex}].animations[${animationIndex}].id`,
    ),
    type: assertString(
      animation.type,
      `project.layers[${layerIndex}].animations[${animationIndex}].type`,
    ) as V5GAnimationConfig["type"],
    name:
      animation.name === undefined
        ? undefined
        : assertString(
            animation.name,
            `project.layers[${layerIndex}].animations[${animationIndex}].name`,
          ),
    startTime: assertNumber(
      animation.startTime,
      `project.layers[${layerIndex}].animations[${animationIndex}].startTime`,
    ),
    duration: assertNumber(
      animation.duration,
      `project.layers[${layerIndex}].animations[${animationIndex}].duration`,
    ),
    enabled: assertBoolean(
      animation.enabled,
      `project.layers[${layerIndex}].animations[${animationIndex}].enabled`,
    ),
    seed: assertNumber(
      animation.seed,
      `project.layers[${layerIndex}].animations[${animationIndex}].seed`,
    ),
    params: params as Record<string, V5GAnimationParamValue>,
  };
}

function assertTransform(value: unknown, path: string): V5GTransformConfig {
  const transform = assertRecord(value, path);
  return {
    x: assertNumber(transform.x, `${path}.x`),
    y: assertNumber(transform.y, `${path}.y`),
    scaleX: assertNumber(transform.scaleX, `${path}.scaleX`),
    scaleY: assertNumber(transform.scaleY, `${path}.scaleY`),
    rotation: assertNumber(transform.rotation, `${path}.rotation`),
    anchorX: assertNumber(transform.anchorX, `${path}.anchorX`),
    anchorY: assertNumber(transform.anchorY, `${path}.anchorY`),
  };
}

function validateTransform(transform: V5GTransformConfig, path: string): void {
  assertFinite(transform.x, `${path}.x`);
  assertFinite(transform.y, `${path}.y`);
  assertFinite(transform.scaleX, `${path}.scaleX`);
  assertFinite(transform.scaleY, `${path}.scaleY`);
  assertFinite(transform.rotation, `${path}.rotation`);
  assertFiniteRange(transform.anchorX, 0, 1, `${path}.anchorX`);
  assertFiniteRange(transform.anchorY, 0, 1, `${path}.anchorY`);
}

function assertOptionalNumber(
  animation: V5GAnimationConfig,
  key: string,
): void {
  const value = animation.params[key];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a finite number.`,
    );
  }
}

function assertOptionalBoolean(
  animation: V5GAnimationConfig,
  key: string,
): void {
  const value = animation.params[key];
  if (value === undefined) return;
  if (typeof value !== "boolean") {
    throw new Error(
      `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a boolean.`,
    );
  }
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value;
}

function assertOptionalNumberField(
  value: unknown,
  path: string,
): number | undefined {
  if (value === undefined) return undefined;
  return assertNumber(value, path);
}

function assertNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

function assertPositiveFinite(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
}

function assertFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
}

function assertFiniteRange(
  value: number,
  min: number,
  max: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path} must be in range ${min}..${max}.`);
  }
}

function isSupportedProjectSchemaVersion(value: string): boolean {
  return /^V5G_0\.\d+$/u.test(value) || /^VNI_0\.\d+$/u.test(value);
}

function validateAssetFileMetadata(asset: V5GAssetConfig): void {
  const fields = [asset.fileWidth, asset.fileHeight, asset.fileScale];
  const presentCount = fields.filter((value) => value !== undefined).length;
  if (presentCount === 0) return;
  if (presentCount !== fields.length) {
    throw new Error(
      `V5G asset "${asset.id}" fileWidth/fileHeight/fileScale must be provided together.`,
    );
  }
  if (
    asset.fileWidth === undefined ||
    asset.fileHeight === undefined ||
    asset.fileScale === undefined
  ) {
    throw new Error(
      `V5G asset "${asset.id}" fileWidth/fileHeight/fileScale must be provided together.`,
    );
  }
  assertPositiveInteger(asset.fileWidth, `asset "${asset.id}" fileWidth`);
  assertPositiveInteger(asset.fileHeight, `asset "${asset.id}" fileHeight`);
  assertFiniteRange(
    asset.fileScale,
    Number.MIN_VALUE,
    1,
    `asset "${asset.id}" fileScale`,
  );

  const expectedFileWidth = Math.max(
    1,
    Math.round(asset.width * asset.fileScale),
  );
  const expectedFileHeight = Math.max(
    1,
    Math.round(asset.height * asset.fileScale),
  );
  if (
    asset.fileWidth !== expectedFileWidth ||
    asset.fileHeight !== expectedFileHeight
  ) {
    throw new Error(
      `V5G asset "${asset.id}" file size metadata mismatch: expected ${expectedFileWidth}x${expectedFileHeight} from logical ${asset.width}x${asset.height} at scale ${asset.fileScale}, got ${asset.fileWidth}x${asset.fileHeight}.`,
    );
  }
}

function validateExportProfile(
  profile: V5GExportProfileConfig,
  path: string,
): void {
  if (profile.id.length === 0) {
    throw new Error(`${path}.id must be a non-empty string.`);
  }
  if (profile.purpose !== "editing" && profile.purpose !== "runtime") {
    throw new Error(`${path}.purpose must be editing or runtime.`);
  }
  assertFiniteRange(
    profile.assetScale,
    Number.MIN_VALUE,
    1,
    `${path}.assetScale`,
  );
}

function validateAssetProfileMetadata(
  asset: V5GAssetConfig,
  profile: V5GExportProfileConfig | undefined,
): void {
  if (!profile) return;
  const hasFileMetadata =
    asset.fileWidth !== undefined &&
    asset.fileHeight !== undefined &&
    asset.fileScale !== undefined;
  if (!hasFileMetadata) {
    if (profile.assetScale < 1 || profile.purpose === "runtime") {
      throw new Error(
        `V5G asset "${asset.id}" must provide fileWidth/fileHeight/fileScale for exportProfile "${profile.id}".`,
      );
    }
    return;
  }
  if (asset.fileScale !== profile.assetScale) {
    throw new Error(
      `V5G asset "${asset.id}" fileScale ${asset.fileScale} does not match exportProfile.assetScale ${profile.assetScale}.`,
    );
  }
}

function assertPositiveInteger(value: number | undefined, path: string): void {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${path} must be an integer.`);
  }
}

function hasStringValue<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true;
  }
  return false;
}

export type SupportedCocosBlendMode = "normal";

export interface CocosBlendModeConfig {
  mode: SupportedCocosBlendMode;
}

export function getCocosBlendModeConfig(
  _blendMode: V5GBlendMode,
): CocosBlendModeConfig {
  return { mode: "normal" };
}

export interface V5GCocosNodeDriver<TNode, TSpriteFrame> {
  createNode(name: string): TNode;
  appendChild(parent: TNode, child: TNode): void;
  destroyNode(node: TNode): void;
  setContentSize(node: TNode, width: number, height: number): void;
  setAnchorPoint(node: TNode, x: number, y: number): void;
  setPosition(node: TNode, x: number, y: number): void;
  setScale(node: TNode, x: number, y: number): void;
  setRotationDegrees(node: TNode, degrees: number): void;
  setOpacity(node: TNode, opacity: number): void;
  setActive(node: TNode, active: boolean): void;
  createBackgroundNode(
    name: string,
    color: number,
    width: number,
    height: number,
  ): TNode;
  createImageNode(name: string, spriteFrame: TSpriteFrame): TNode;
  getSpriteFrameSize(spriteFrame: TSpriteFrame): V5GSize | null;
  applyBlendMode(node: TNode, config: CocosBlendModeConfig): void;
}

interface ReadableSpriteFrameSize {
  width: number;
  height: number;
}

interface ReadableSpriteFrame {
  originalSize?: ReadableSpriteFrameSize;
  rect?: ReadableSpriteFrameSize;
  width?: number;
  height?: number;
  getOriginalSize?: () => ReadableSpriteFrameSize;
  getRect?: () => ReadableSpriteFrameSize;
}

export function createCocosNodeDriver(): V5GCocosNodeDriver<Node, SpriteFrame> {
  return {
    createNode(name) {
      return new Node(name);
    },
    appendChild(parent, child) {
      parent.addChild(child);
    },
    destroyNode(node) {
      node.removeFromParent();
      node.destroy();
    },
    setContentSize(node, width, height) {
      requireUITransform(node).setContentSize(width, height);
    },
    setAnchorPoint(node, x, y) {
      requireUITransform(node).setAnchorPoint(x, y);
    },
    setPosition(node, x, y) {
      node.setPosition(x, y, 0);
    },
    setScale(node, x, y) {
      node.setScale(x, y, 1);
    },
    setRotationDegrees(node, degrees) {
      node.setRotationFromEuler(0, 0, degrees);
    },
    setOpacity(node, opacity) {
      requireUIOpacity(node).opacity = opacity;
    },
    setActive(node, active) {
      node.active = active;
    },
    createBackgroundNode(name, color, width, height) {
      const node = new Node(name);
      requireUITransform(node).setContentSize(width, height);
      requireUITransform(node).setAnchorPoint(0.5, 0.5);
      const graphics = node.addComponent(Graphics);
      graphics.fillColor = numberToColor(color, 255);
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.fill();
      return node;
    },
    createImageNode(name, spriteFrame) {
      const node = new Node(name);
      const sprite = node.addComponent(Sprite);
      sprite.spriteFrame = spriteFrame;
      sprite.color = new Color(255, 255, 255, 255);
      return node;
    },
    getSpriteFrameSize(spriteFrame) {
      return readSpriteFrameSize(spriteFrame);
    },
    applyBlendMode(node, _config) {
      requireSprite(node);
    },
  };
}

function requireUITransform(node: Node): UITransform {
  return node.getComponent(UITransform) ?? node.addComponent(UITransform);
}

function requireUIOpacity(node: Node): UIOpacity {
  return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
}

function requireSprite(node: Node): Sprite {
  const sprite = node.getComponent(Sprite);
  if (!sprite) {
    throw new Error(
      `Cocos node "${node.name}" does not have a Sprite component.`,
    );
  }
  return sprite;
}

function numberToColor(color: number, alpha: number): Color {
  return new Color((color >> 16) & 255, (color >> 8) & 255, color & 255, alpha);
}

function readSpriteFrameSize(spriteFrame: SpriteFrame): V5GSize | null {
  const readable = spriteFrame as ReadableSpriteFrame;
  const fromMethod = readable.getOriginalSize?.() ?? readable.getRect?.();
  if (isReadableSize(fromMethod)) return fromMethod;
  if (isReadableSize(readable.originalSize)) return readable.originalSize;
  if (isReadableSize(readable.rect)) return readable.rect;
  if (
    typeof readable.width === "number" &&
    Number.isFinite(readable.width) &&
    typeof readable.height === "number" &&
    Number.isFinite(readable.height)
  ) {
    return {
      width: readable.width,
      height: readable.height,
    };
  }
  return null;
}

function isReadableSize(value: unknown): value is ReadableSpriteFrameSize {
  if (typeof value !== "object" || value === null) return false;
  const size = value as Partial<ReadableSpriteFrameSize>;
  return (
    typeof size.width === "number" &&
    Number.isFinite(size.width) &&
    typeof size.height === "number" &&
    Number.isFinite(size.height)
  );
}

export interface V5GCocosAssetResolver<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(assetPath: string, assetId: string): TSpriteFrame | null;
}

export interface V5GCocosPlayerOptions<
  TNode = Node,
  TSpriteFrame = SpriteFrame,
> {
  root: TNode;
  project: V5GProjectConfig;
  assets: V5GCocosAssetResolver<TSpriteFrame>;
  driver: V5GCocosNodeDriver<TNode, TSpriteFrame>;
  loop?: boolean;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

export type V5GCocosPlayerFactoryOptions = Omit<
  V5GCocosPlayerOptions<Node, SpriteFrame>,
  "driver"
>;

export type V5GCocosPlaybackRange =
  | { unit: "time"; start: number; end?: number }
  | { unit: "frame"; start: number; end?: number; fps: number };

export interface V5GCocosPlayRangeOptions {
  range: V5GCocosPlaybackRange;
  loop?: boolean;
}

export type V5GCocosPlaybackPoint =
  | { unit: "time"; at: number }
  | { unit: "frame"; at: number; fps: number };

export interface V5GCocosPlaybackEventContext {
  id: string;
  time: number;
  previousTime: number;
  currentTime: number;
  loopIndex: number;
}

export interface V5GCocosPlaybackEventOptions {
  id: string;
  at: V5GCocosPlaybackPoint;
  once?: boolean;
  listener: (event: V5GCocosPlaybackEventContext) => void;
}

export interface V5GCocosPlaybackCompleteContext {
  startTime: number;
  endTime: number;
  currentTime: number;
  loopIndex: number;
}

interface ManagedLayer<TNode, TSpriteFrame> {
  layer: V5GLayerConfig;
  asset: V5GAssetConfig;
  node: TNode;
  spriteFrame: TSpriteFrame;
}

interface PlaybackBoundary {
  startTime: number;
  endTime: number;
  loop: boolean;
}

interface NormalizedPlaybackEvent {
  id: string;
  time: number;
  once: boolean;
  order: number;
  listener: (event: V5GCocosPlaybackEventContext) => void;
}

const SIZE_EPSILON = 0.01;
const PLAYBACK_EPSILON = 1e-9;

function getExpectedSpriteFrameSize(asset: V5GAssetConfig): {
  width: number;
  height: number;
} {
  return {
    width: asset.fileWidth ?? asset.width,
    height: asset.fileHeight ?? asset.height,
  };
}

export class V5GCocosPlayer<TNode = Node, TSpriteFrame = SpriteFrame> {
  private readonly options: V5GCocosPlayerOptions<TNode, TSpriteFrame>;
  private readonly layers = new Map<
    string,
    ManagedLayer<TNode, TSpriteFrame>
  >();
  private stageNode: TNode | null = null;
  private contentNode: TNode | null = null;
  private particleRootNode: TNode | null = null;
  private backgroundNode: TNode | null = null;
  private readonly particleNodes: TNode[] = [];
  private currentTime = 0;
  private isPlaying = false;
  private loop: boolean;
  private activeRange: PlaybackBoundary | null = null;
  private readonly playbackEvents = new Map<string, NormalizedPlaybackEvent>();
  private readonly completeListeners = new Set<
    (event: V5GCocosPlaybackCompleteContext) => void
  >();
  private loopIndex = 0;
  private nextPlaybackEventOrder = 0;

  constructor(options: V5GCocosPlayerOptions<TNode, TSpriteFrame>) {
    this.options = options;
    this.loop = options.loop ?? true;
  }

  get time(): number {
    return this.currentTime;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  init(): void {
    this.destroyManagedNodes();
    validateCocosV5GProject(this.options.project);

    const driver = this.options.driver;
    const project = this.options.project;
    const stage = driver.createNode("V5G Stage");

    try {
      driver.setContentSize(stage, project.stage.width, project.stage.height);
      driver.setAnchorPoint(stage, 0.5, 0.5);

      const backgroundColor = parseColorHex(project.stage.backgroundColor);
      const background = driver.createBackgroundNode(
        "V5G Background",
        backgroundColor,
        project.stage.width,
        project.stage.height,
      );
      driver.appendChild(stage, background);
      this.backgroundNode = background;

      const content = driver.createNode("V5G Content");
      driver.setContentSize(content, project.stage.width, project.stage.height);
      driver.setAnchorPoint(content, 0.5, 0.5);
      driver.appendChild(stage, content);
      this.contentNode = content;

      const particleRoot = driver.createNode("V5G Particles");
      driver.setContentSize(
        particleRoot,
        project.stage.width,
        project.stage.height,
      );
      driver.setAnchorPoint(particleRoot, 0.5, 0.5);
      driver.appendChild(stage, particleRoot);
      this.particleRootNode = particleRoot;

      const assetsById = new Map(
        project.assets.map((asset) => [asset.id, asset]),
      );
      for (const layer of project.layers) {
        const asset = this.requireImageAsset(layer, assetsById);
        const spriteFrame = this.options.assets.getSpriteFrame(
          asset.path,
          asset.id,
        );
        if (spriteFrame === null) {
          throw new Error(
            `Missing Cocos SpriteFrame for V5G asset "${asset.id}" at "${asset.path}".`,
          );
        }
        this.assertSpriteFrameSize(asset, spriteFrame);

        const node = driver.createImageNode(layer.name, spriteFrame);
        driver.setContentSize(node, asset.width, asset.height);
        driver.setAnchorPoint(
          node,
          layer.transform.anchorX,
          layer.transform.anchorY,
        );
        driver.applyBlendMode(node, getCocosBlendModeConfig(layer.blendMode));
        driver.appendChild(content, node);

        this.layers.set(layer.id, {
          layer,
          asset,
          node,
          spriteFrame,
        });
      }

      driver.appendChild(this.options.root, stage);
      this.stageNode = stage;
      this.seek(this.currentTime);
    } catch (error) {
      driver.destroyNode(stage);
      this.stageNode = null;
      this.backgroundNode = null;
      this.contentNode = null;
      this.particleRootNode = null;
      this.layers.clear();
      throw error;
    }
  }

  seek(time: number): void {
    this.assertInitialized();
    const sampledProject = sampleProjectAtTime(this.options.project, time);
    this.currentTime = sampledProject.time;

    for (const sampledLayer of sampledProject.layers) {
      const managed = this.layers.get(sampledLayer.layerId);
      if (!managed) {
        throw new Error(
          `Missing runtime node for V5G layer "${sampledLayer.layerId}".`,
        );
      }
      const position = v5gTransformToCocosPosition(sampledLayer.transform);
      this.options.driver.setPosition(managed.node, position.x, position.y);
      this.options.driver.setScale(
        managed.node,
        sampledLayer.transform.scaleX,
        sampledLayer.transform.scaleY,
      );
      this.options.driver.setRotationDegrees(
        managed.node,
        sampledLayer.transform.rotation,
      );
      this.options.driver.setOpacity(
        managed.node,
        opacityToCocosOpacity(sampledLayer.opacity),
      );
      this.options.driver.setActive(
        managed.node,
        sampledLayer.renderImageDisplay,
      );
    }

    this.drawParticles(sampledProject.layers);
    this.options.onTimeChange?.(this.currentTime);
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "V5GCocosPlayer.update(deltaSeconds) requires a non-negative finite number.",
      );
    }
    if (!this.isPlaying) return;

    const boundary = this.getPlaybackBoundary();
    const previousTime = this.currentTime;
    const nextTime = previousTime + deltaSeconds;
    if (nextTime < boundary.endTime - PLAYBACK_EPSILON) {
      this.seek(nextTime);
      this.emitPlaybackEventsBetween(
        previousTime,
        nextTime,
        this.loopIndex,
        boundary,
      );
      return;
    }

    this.seek(boundary.endTime);
    this.emitPlaybackEventsBetween(
      previousTime,
      boundary.endTime,
      this.loopIndex,
      boundary,
    );

    if (!boundary.loop) {
      const completeContext: V5GCocosPlaybackCompleteContext = {
        startTime: boundary.startTime,
        endTime: boundary.endTime,
        currentTime: boundary.endTime,
        loopIndex: this.loopIndex,
      };
      this.activeRange = null;
      this.setPlaying(false);
      this.emitPlaybackComplete(completeContext);
      return;
    }

    this.advanceLoopingPlayback(Math.max(0, nextTime - boundary.endTime));
  }

  playRange(options: V5GCocosPlayRangeOptions): void {
    this.assertInitialized();
    const range = this.normalizePlaybackRange(
      options.range,
      "V5GCocosPlayer.playRange",
    );
    this.activeRange = {
      ...range,
      loop: options.loop ?? this.loop,
    };
    this.loopIndex = 0;
    this.seek(range.startTime);
    this.setPlaying(true);
  }

  addPlaybackEvent(options: V5GCocosPlaybackEventOptions): () => void {
    if (typeof options.id !== "string" || options.id.length === 0) {
      throw new Error("V5GCocosPlayer.addPlaybackEvent id must be non-empty.");
    }
    if (this.playbackEvents.has(options.id)) {
      throw new Error(
        `V5GCocosPlayer.addPlaybackEvent id must be unique: ${options.id}.`,
      );
    }
    if (typeof options.listener !== "function") {
      throw new Error(
        "V5GCocosPlayer.addPlaybackEvent listener must be a function.",
      );
    }

    this.playbackEvents.set(options.id, {
      id: options.id,
      time: this.normalizePlaybackPoint(
        options.at,
        "V5GCocosPlayer.addPlaybackEvent",
      ),
      once: options.once ?? false,
      order: this.nextPlaybackEventOrder,
      listener: options.listener,
    });
    this.nextPlaybackEventOrder += 1;

    return () => {
      this.playbackEvents.delete(options.id);
    };
  }

  clearPlaybackEvent(id: string): void {
    if (!this.playbackEvents.delete(id)) {
      throw new Error(`V5GCocosPlayer.clearPlaybackEvent unknown id: ${id}.`);
    }
  }

  clearPlaybackEvents(): void {
    this.playbackEvents.clear();
  }

  onPlaybackComplete(
    listener: (event: V5GCocosPlaybackCompleteContext) => void,
  ): () => void {
    if (typeof listener !== "function") {
      throw new Error(
        "V5GCocosPlayer.onPlaybackComplete listener must be a function.",
      );
    }
    this.completeListeners.add(listener);
    return () => {
      this.completeListeners.delete(listener);
    };
  }

  play(): void {
    this.setPlaying(true);
  }

  pause(): void {
    this.setPlaying(false);
  }

  restart(): void {
    this.activeRange = null;
    this.loopIndex = 0;
    this.seek(0);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  destroy(): void {
    this.destroyManagedNodes();
    this.activeRange = null;
    this.playbackEvents.clear();
    this.completeListeners.clear();
    this.loopIndex = 0;
    this.setPlaying(false);
    this.currentTime = 0;
  }

  private advanceLoopingPlayback(overflowSeconds: number): void {
    const boundary = this.getPlaybackBoundary();
    const rangeDuration = boundary.endTime - boundary.startTime;
    let remaining = overflowSeconds;

    while (remaining >= rangeDuration - PLAYBACK_EPSILON) {
      this.loopIndex += 1;
      this.seek(boundary.endTime);
      this.emitPlaybackEventsBetween(
        boundary.startTime,
        boundary.endTime,
        this.loopIndex,
        boundary,
      );
      remaining -= rangeDuration;
    }

    this.loopIndex += 1;
    const clampedRemaining =
      Math.abs(remaining) <= PLAYBACK_EPSILON ? 0 : remaining;
    const nextTime = boundary.startTime + clampedRemaining;
    this.seek(nextTime);
    this.emitPlaybackEventsBetween(
      boundary.startTime,
      nextTime,
      this.loopIndex,
      boundary,
    );
  }

  private getPlaybackBoundary(): PlaybackBoundary {
    return (
      this.activeRange ?? {
        startTime: 0,
        endTime: this.options.project.stage.duration,
        loop: this.loop,
      }
    );
  }

  private normalizePlaybackRange(
    range: V5GCocosPlaybackRange,
    apiName: string,
  ): Omit<PlaybackBoundary, "loop"> {
    if (range.unit === "time") {
      this.assertFiniteNumber(range.start, `${apiName} range.start`);
      const endTime =
        range.end === undefined || range.end === -1
          ? this.options.project.stage.duration
          : range.end;
      this.assertFiniteNumber(endTime, `${apiName} range.end`);
      return this.assertPlaybackRangeTimes(range.start, endTime, apiName);
    }

    if (range.unit === "frame") {
      this.assertNonNegativeInteger(range.start, `${apiName} range.start`);
      this.assertPositiveFiniteNumber(range.fps, `${apiName} range.fps`);
      const endTime =
        range.end === undefined || range.end === -1
          ? this.options.project.stage.duration
          : this.normalizePlaybackFrameEnd(range.end, range.fps, apiName);
      return this.assertPlaybackRangeTimes(
        range.start / range.fps,
        endTime,
        apiName,
      );
    }

    throw new Error(`${apiName} range.unit must be "time" or "frame".`);
  }

  private normalizePlaybackFrameEnd(
    endFrame: number,
    fps: number,
    apiName: string,
  ): number {
    this.assertNonNegativeInteger(endFrame, `${apiName} range.end`);
    return endFrame / fps;
  }

  private normalizePlaybackPoint(
    point: V5GCocosPlaybackPoint,
    apiName: string,
  ): number {
    let time: number;
    if (point.unit === "time") {
      this.assertFiniteNumber(point.at, `${apiName} at`);
      time = point.at;
    } else if (point.unit === "frame") {
      this.assertNonNegativeInteger(point.at, `${apiName} at`);
      this.assertPositiveFiniteNumber(point.fps, `${apiName} fps`);
      time = point.at / point.fps;
    } else {
      throw new Error(`${apiName} at.unit must be "time" or "frame".`);
    }

    const duration = this.options.project.stage.duration;
    if (time < 0 || time > duration) {
      throw new Error(
        `${apiName} at must resolve to a time between 0 and project.stage.duration (${duration}).`,
      );
    }
    return time;
  }

  private assertPlaybackRangeTimes(
    startTime: number,
    endTime: number,
    apiName: string,
  ): Omit<PlaybackBoundary, "loop"> {
    const duration = this.options.project.stage.duration;
    if (startTime < 0) {
      throw new Error(`${apiName} range.start must be >= 0.`);
    }
    if (startTime >= endTime) {
      throw new Error(`${apiName} range.start must be less than range.end.`);
    }
    if (endTime > duration) {
      throw new Error(
        `${apiName} range.end must be <= project.stage.duration (${duration}).`,
      );
    }
    return { startTime, endTime };
  }

  private emitPlaybackEventsBetween(
    previousTime: number,
    currentTime: number,
    loopIndex: number,
    boundary: PlaybackBoundary,
  ): void {
    const events = [...this.playbackEvents.values()]
      .filter(
        (event) =>
          event.time >= boundary.startTime &&
          event.time <= boundary.endTime + PLAYBACK_EPSILON &&
          event.time > previousTime + PLAYBACK_EPSILON &&
          event.time <= currentTime + PLAYBACK_EPSILON,
      )
      .sort((a, b) => a.time - b.time || a.order - b.order);

    for (const event of events) {
      if (event.once) {
        this.playbackEvents.delete(event.id);
      }
      event.listener({
        id: event.id,
        time: event.time,
        previousTime,
        currentTime,
        loopIndex,
      });
    }
  }

  private emitPlaybackComplete(context: V5GCocosPlaybackCompleteContext): void {
    for (const listener of [...this.completeListeners]) {
      listener(context);
    }
  }

  private assertFiniteNumber(value: number, field: string): void {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number.`);
    }
  }

  private assertPositiveFiniteNumber(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${field} must be a positive finite number.`);
    }
  }

  private assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
  }

  private setPlaying(nextPlaying: boolean): void {
    if (this.isPlaying === nextPlaying) return;
    this.isPlaying = nextPlaying;
    this.options.onPlayingChange?.(this.isPlaying);
  }

  private destroyManagedNodes(): void {
    this.clearParticles();
    if (this.stageNode !== null) {
      this.options.driver.destroyNode(this.stageNode);
    }
    this.stageNode = null;
    this.backgroundNode = null;
    this.contentNode = null;
    this.particleRootNode = null;
    this.layers.clear();
  }

  private assertInitialized(): void {
    if (this.stageNode === null) {
      throw new Error("V5GCocosPlayer must be initialized before seek/update.");
    }
  }

  private drawParticles(sampledLayers: readonly SampledLayerState[]): void {
    this.clearParticles();
    const particleRoot = this.particleRootNode;
    if (particleRoot === null) {
      throw new Error("V5GCocosPlayer particle root is not initialized.");
    }

    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveParticleAnimation) continue;
      const managed = this.layers.get(sampledLayer.layerId);
      if (!managed) {
        throw new Error(
          `Missing runtime node for V5G particle layer "${sampledLayer.layerId}".`,
        );
      }
      const emitterPosition = v5gTransformToCocosPosition(
        sampledLayer.transform,
      );
      const particles = sampleParticleSpritesForLayer(
        managed.layer,
        sampledLayer,
        {
          width: managed.asset.width,
          height: managed.asset.height,
        },
        this.currentTime,
      );

      for (const particle of particles) {
        const node = this.options.driver.createImageNode(
          `V5G Particle ${particle.layerId} ${particle.animationId}`,
          managed.spriteFrame,
        );
        this.options.driver.setContentSize(
          node,
          managed.asset.width,
          managed.asset.height,
        );
        this.options.driver.setAnchorPoint(node, 0.5, 0.5);
        this.options.driver.setPosition(
          node,
          emitterPosition.x + particle.offsetX,
          emitterPosition.y + particle.offsetY,
        );
        this.options.driver.setScale(node, particle.scale, particle.scale);
        this.options.driver.setRotationDegrees(
          node,
          (particle.rotation * 180) / Math.PI,
        );
        this.options.driver.setOpacity(
          node,
          opacityToCocosOpacity(particle.alpha),
        );
        this.options.driver.applyBlendMode(
          node,
          getCocosBlendModeConfig(particle.blendMode),
        );
        this.options.driver.appendChild(particleRoot, node);
        this.particleNodes.push(node);
      }
    }
  }

  private clearParticles(): void {
    while (this.particleNodes.length > 0) {
      const node = this.particleNodes.pop();
      if (node !== undefined) this.options.driver.destroyNode(node);
    }
  }

  private requireImageAsset(
    layer: V5GLayerConfig,
    assetsById: ReadonlyMap<string, V5GAssetConfig>,
  ): V5GAssetConfig {
    if (layer.type !== "image" || !layer.assetId) {
      throw new Error(`V5G Cocos layer "${layer.id}" requires an image asset.`);
    }
    const asset = assetsById.get(layer.assetId);
    if (!asset) {
      throw new Error(
        `V5G Cocos layer "${layer.id}" references missing asset "${layer.assetId}".`,
      );
    }
    return asset;
  }

  private assertSpriteFrameSize(
    asset: V5GAssetConfig,
    spriteFrame: TSpriteFrame,
  ): void {
    const actualSize = this.options.driver.getSpriteFrameSize(spriteFrame);
    if (actualSize === null) return;
    const expectedSize = getExpectedSpriteFrameSize(asset);
    if (
      Math.abs(actualSize.width - expectedSize.width) > SIZE_EPSILON ||
      Math.abs(actualSize.height - expectedSize.height) > SIZE_EPSILON
    ) {
      throw new Error(
        `Cocos SpriteFrame size mismatch for V5G asset "${asset.id}" at "${asset.path}": logical ${asset.width}x${asset.height}, expected file ${expectedSize.width}x${expectedSize.height}, got ${actualSize.width}x${actualSize.height}.`,
      );
    }
  }
}

export function createV5GCocosPlayer(
  options: V5GCocosPlayerFactoryOptions,
): V5GCocosPlayer<Node, SpriteFrame> {
  return new V5GCocosPlayer({
    ...options,
    driver: createCocosNodeDriver(),
  });
}
