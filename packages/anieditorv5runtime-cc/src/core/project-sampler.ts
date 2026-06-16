import { clampNumber, roundTo } from "./coordinates.js";
import { sampleLayerAnimationsAtTime } from "./animation-sampler.js";
import type {
  V5GBlendMode,
  V5GLayerConfig,
  V5GProjectConfig,
  V5GTransformConfig,
} from "./types.js";

export interface SampledLayerState {
  layerId: string;
  transform: V5GTransformConfig;
  opacity: number;
  visible: boolean;
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
  const hasActiveCoverage = hasAnyEnabled
    ? layer.animations.some(
        (animation) =>
          animation.enabled &&
          time >= animation.startTime &&
          time <= animation.startTime + animation.duration,
      )
    : true;
  const opacity =
    hasAnyEnabled && !hasActiveCoverage
      ? 0
      : roundTo(clampNumber(sampled.opacity, 0, 1), 4);

  return {
    layerId: layer.id,
    transform: sampled.transform,
    opacity,
    visible: layer.visible && opacity > 0,
    blendMode: layer.blendMode,
  };
}
