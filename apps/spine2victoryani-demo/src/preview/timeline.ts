import type { VictoryLayerConfig } from "../config/victory-types.js";
import type { EncodedTimelineAnimation, EncodedTimelineFrame } from "../runtime/export-types.js";

export interface LayerSample {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  visible: boolean;
  drawOrder: number;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

export function parseLayerTimeline(layer: VictoryLayerConfig) {
  const animation = layer.animations.find((item) => item.type === "timeline" && item.script);
  if (!animation?.script) {
    return null;
  }

  return JSON.parse(animation.script) as EncodedTimelineAnimation;
}

function sampleFramePair(frames: EncodedTimelineFrame[], frameIndex: number) {
  const safeIndex = Math.max(0, Math.min(frameIndex, frames.length - 1));
  const nextIndex = Math.max(0, Math.min(safeIndex + 1, frames.length - 1));
  return {
    current: frames[safeIndex],
    next: frames[nextIndex]
  };
}

export function sampleTimelineLayer(layer: VictoryLayerConfig, time: number): LayerSample {
  const timeline = parseLayerTimeline(layer);
  if (!timeline || timeline.frames.length === 0) {
    return {
      x: layer.x,
      y: layer.y,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      rotation: layer.rotation,
      alpha: layer.alpha,
      visible: layer.visible,
      drawOrder: 0
    };
  }

  const timelineTime = Math.max(0, Math.min(time, (timeline.frames.length - 1) / timeline.fps));
  const rawIndex = timelineTime * timeline.fps;
  const frameIndex = Math.floor(rawIndex);
  const progress = Math.min(1, Math.max(0, rawIndex - frameIndex));
  const { current, next } = sampleFramePair(timeline.frames, frameIndex);

  return {
    x: lerp(current[0], next[0], progress),
    y: lerp(current[1], next[1], progress),
    scaleX: lerp(current[2], next[2], progress),
    scaleY: lerp(current[3], next[3], progress),
    rotation: lerp(current[4], next[4], progress),
    alpha: lerp(current[5], next[5], progress),
    visible: current[6] === 1,
    drawOrder: current[7]
  };
}
