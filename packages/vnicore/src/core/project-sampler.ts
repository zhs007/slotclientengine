import { clampNumber, roundTo } from "./coordinates.js";
import {
  sampleLayerAnimationsAtTime,
  sampleLayerAnimationsAtTimeInto,
  shouldHideLayerOutsideActiveAnimation,
} from "./animation-sampler.js";
import {
  sampleBasicAnimationAtTime,
  sampleBasicAnimationAtTimeInto,
} from "./basic-animation.js";
import { hasActiveChaserLightAnimation } from "./chaser-light-sampler.js";
import { hasActiveDeterministicEffectAnimation } from "./effect-sampler.js";
import { hasActiveParticleAnimation } from "./particle-sampler.js";
import { hasActiveRenderEffectAnimation } from "./render-effect-sampler.js";
import { hasActiveSafeGlowAnimation } from "./safe-glow-sampler.js";
import { getCardCarousel3DProgress } from "./card-carousel-3d.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GProjectConfig,
  V5GTransformConfig,
} from "./types.js";
import type { V5GBasicAnimationSample } from "./basic-animation.js";
import type {
  V5GAnimationSampleBase,
  V5GAnimationSampleResult,
} from "./animation-sampler.js";

const VISUAL_ENTRY_SCALE_THRESHOLD = 0.011;

export interface SampledLayerState {
  layerId: string;
  transform: V5GTransformConfig;
  visualRotation: number;
  baseOpacity: number;
  opacity: number;
  visible: boolean;
  renderImageDisplay: boolean;
  hasActiveParticleAnimation: boolean;
  hasActiveChaserLightAnimation: boolean;
  hasActiveRenderEffect: boolean;
  hasActiveDeterministicEffect: boolean;
  hasActiveSafeGlowAnimation: boolean;
  hasActiveCardCarousel3D: boolean;
  blendMode: V5GBlendMode;
}

export interface SampledProjectState {
  time: number;
  layers: SampledLayerState[];
}

export interface RuntimeProjectSampler {
  sample(time: number): SampledProjectState;
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
  const basic = sampleBasicAnimationAtTime(layer, time);
  const sampled = sampleLayerAnimationsAtTime(
    {
      transform: basic.transform,
      opacity: basic.opacity,
    },
    layer.animations,
    time,
  );
  return applyLayerSample(
    layer,
    time,
    sampled,
    createSampledLayerState(layer.id, sampled.transform),
  );
}

export function createRuntimeProjectSampler(
  project: V5GProjectConfig,
): RuntimeProjectSampler {
  const samplers = project.layers.map((layer) =>
    createRuntimeLayerSampler(layer),
  );
  const state: SampledProjectState = {
    time: 0,
    layers: samplers.map((sampler) => sampler.state),
  };
  return {
    sample(time: number): SampledProjectState {
      const clampedTime = roundTo(
        clampNumber(time, 0, project.stage.duration),
        4,
      );
      state.time = clampedTime;
      for (const sampler of samplers) sampler.sample(clampedTime);
      return state;
    },
  };
}

function createRuntimeLayerSampler(layer: V5GLayerConfig): {
  readonly state: SampledLayerState;
  sample(time: number): void;
} {
  const basic: V5GBasicAnimationSample = {
    transform: createTransform(),
    opacity: 0,
  };
  const animation: V5GAnimationSampleResult = {
    transform: createTransform(),
    opacity: 0,
    visualRotation: 0,
  };
  const animationBase: V5GAnimationSampleBase = {
    transform: basic.transform,
    opacity: 0,
  };
  const state = createSampledLayerState(layer.id, animation.transform);
  return {
    state,
    sample(time: number): void {
      sampleBasicAnimationAtTimeInto(layer, time, basic);
      animationBase.opacity = basic.opacity;
      sampleLayerAnimationsAtTimeInto(
        animationBase,
        layer.animations,
        time,
        animation,
      );
      applyLayerSample(layer, time, animation, state);
    },
  };
}

function applyLayerSample(
  layer: V5GLayerConfig,
  time: number,
  sampled: V5GAnimationSampleResult,
  result: SampledLayerState,
): SampledLayerState {
  const hasActiveScaleEntryStart = layer.animations.some(
    (animation) =>
      animation.enabled &&
      isScaleEntryAnimation(animation) &&
      isSameSampleTime(time, animation.startTime),
  );
  const opacity =
    hasActiveScaleEntryStart ||
    shouldHideLayerOutsideActiveAnimation(layer.animations, time)
      ? 0
      : roundTo(clampNumber(sampled.opacity, 0, 1), 4);
  const baseOpacity = roundTo(clampNumber(layer.opacity, 0, 1), 4);
  const activeParticleAnimation =
    layer.visible && baseOpacity > 0 && hasActiveParticleAnimation(layer, time);
  const activeChaserLight =
    layer.visible &&
    baseOpacity > 0 &&
    hasActiveChaserLightAnimation(layer, time);
  const activeRenderEffect =
    layer.visible &&
    baseOpacity > 0 &&
    hasActiveRenderEffectAnimation(layer, time);
  const activeDeterministicEffect =
    layer.visible &&
    baseOpacity > 0 &&
    hasActiveDeterministicEffectAnimation(layer, time);
  const activeSafeGlow =
    layer.visible && baseOpacity > 0 && hasActiveSafeGlowAnimation(layer, time);
  const activeCardCarousel =
    layer.visible &&
    baseOpacity > 0 &&
    (layer.type === "image" || layer.type === "sequence") &&
    layer.animations.some(
      (animation) =>
        animation.enabled &&
        getCardCarousel3DProgress(animation, time) !== null,
    );
  const visible =
    layer.visible &&
    (opacity > 0 ||
      activeChaserLight ||
      activeRenderEffect ||
      activeDeterministicEffect ||
      activeSafeGlow ||
      activeCardCarousel);

  result.visualRotation = sampled.visualRotation;
  result.baseOpacity = baseOpacity;
  result.opacity = opacity;
  result.visible = visible;
  result.renderImageDisplay = layer.visible && opacity > 0;
  result.hasActiveParticleAnimation = activeParticleAnimation;
  result.hasActiveChaserLightAnimation = activeChaserLight;
  result.hasActiveRenderEffect = activeRenderEffect;
  result.hasActiveDeterministicEffect = activeDeterministicEffect;
  result.hasActiveSafeGlowAnimation = activeSafeGlow;
  result.hasActiveCardCarousel3D = activeCardCarousel;
  result.blendMode = layer.blendMode;
  return result;
}

function createSampledLayerState(
  layerId: string,
  transform: V5GTransformConfig,
): SampledLayerState {
  return {
    layerId,
    transform,
    visualRotation: 0,
    baseOpacity: 0,
    opacity: 0,
    visible: false,
    renderImageDisplay: false,
    hasActiveParticleAnimation: false,
    hasActiveChaserLightAnimation: false,
    hasActiveRenderEffect: false,
    hasActiveDeterministicEffect: false,
    hasActiveSafeGlowAnimation: false,
    hasActiveCardCarousel3D: false,
    blendMode: "normal",
  };
}

function createTransform(): V5GTransformConfig {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
  };
}

function isScaleEntryAnimation(animation: V5GAnimationConfig): boolean {
  if (animation.type === "scale_up") {
    return (
      getNumberParam(animation, "fromScaleX") <= VISUAL_ENTRY_SCALE_THRESHOLD ||
      getNumberParam(animation, "fromScaleY") <= VISUAL_ENTRY_SCALE_THRESHOLD
    );
  }
  if (animation.type === "scale_in" || animation.type === "bounce_in") {
    return (
      getNumberParam(animation, "fromScale") <= VISUAL_ENTRY_SCALE_THRESHOLD
    );
  }
  return false;
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.NaN;
}

function isSameSampleTime(left: number, right: number): boolean {
  return roundTo(left - right, 4) === 0;
}
