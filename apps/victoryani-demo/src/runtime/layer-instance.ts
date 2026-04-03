import { Container } from "pixi.js";
import type { VictoryLayerConfig } from "../config/victory-types.js";

export interface LayerBaseState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  visible: boolean;
}

export interface LayerInstance {
  layer: VictoryLayerConfig;
  container: Container;
  target: Container;
  baseState: LayerBaseState;
  cleanupTasks: Set<() => void>;
}

export function createLayerBaseState(layer: VictoryLayerConfig): LayerBaseState {
  return {
    x: layer.x,
    y: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation,
    alpha: layer.alpha,
    visible: layer.visible
  };
}

export function runLayerCleanups(instance: LayerInstance) {
  for (const cleanup of instance.cleanupTasks) {
    cleanup();
  }

  instance.cleanupTasks.clear();
}