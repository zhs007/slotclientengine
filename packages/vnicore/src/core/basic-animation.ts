import { clampNumber, roundTo } from "./coordinates.js";
import { easeProgress } from "./animation-sampler.js";
import type {
  V5GBasicAnimationTrackConfig,
  V5GLayerConfig,
  V5GTransformConfig,
} from "./types.js";

export interface V5GBasicAnimationSample {
  transform: V5GTransformConfig;
  opacity: number;
}

export function sampleBasicAnimationAtTime(
  layer: V5GLayerConfig,
  time: number,
): V5GBasicAnimationSample {
  return sampleBasicAnimationAtTimeInto(layer, time, {
    transform: { ...layer.transform },
    opacity: 0,
  });
}

/** @internal Runtime-owned target sampling; not exported from the core barrel. */
export function sampleBasicAnimationAtTimeInto(
  layer: V5GLayerConfig,
  time: number,
  result: V5GBasicAnimationSample,
): V5GBasicAnimationSample {
  const transform = result.transform;
  transform.anchorX = layer.transform.anchorX;
  transform.anchorY = layer.transform.anchorY;
  const basic = layer.basicAnimation;
  if (!basic) {
    transform.x = layer.transform.x;
    transform.y = layer.transform.y;
    transform.scaleX = layer.transform.scaleX;
    transform.scaleY = layer.transform.scaleY;
    transform.rotation = layer.transform.rotation;
    result.opacity = roundTo(clampNumber(layer.opacity, 0, 1), 4);
    return result;
  }
  transform.x = roundTo(
    sampleBasicAnimationTrack(basic.positionX, layer.transform.x, time),
    4,
  );
  transform.y = roundTo(
    sampleBasicAnimationTrack(basic.positionY, layer.transform.y, time),
    4,
  );
  transform.scaleX = roundTo(
    sampleBasicAnimationTrack(basic.scaleX, layer.transform.scaleX, time),
    4,
  );
  transform.scaleY = roundTo(
    sampleBasicAnimationTrack(basic.scaleY, layer.transform.scaleY, time),
    4,
  );
  transform.rotation = roundTo(
    sampleBasicAnimationTrack(basic.rotation, layer.transform.rotation, time),
    4,
  );
  result.opacity = roundTo(
    clampNumber(
      sampleBasicAnimationTrack(basic.opacity, layer.opacity, time),
      0,
      1,
    ),
    4,
  );
  return result;
}

export function sampleBasicAnimationTrack(
  track: V5GBasicAnimationTrackConfig,
  baseValue: number,
  time: number,
): number {
  const points = track.points;
  if (!track.enabled || points.length === 0) return baseValue;
  if (time <= points[0].time) return points[0].value;
  const last = points[points.length - 1];
  if (time >= last.time) return last.value;

  let low = 1;
  let high = points.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (time <= points[middle].time) high = middle;
    else low = middle + 1;
  }
  const right = points[low];
  const left = points[low - 1];
  const span = Math.max(0.0001, right.time - left.time);
  const progress = easeProgress((time - left.time) / span, right.easing);
  return left.value + (right.value - left.value) * progress;
}
