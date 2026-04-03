import type { VictoryLayerConfig } from "../config/victory-types.js";
import type { LayerInstance } from "./layer-instance.js";

export function applyMasks(layers: VictoryLayerConfig[], instances: Map<string, LayerInstance>) {
  for (const layer of layers) {
    const source = instances.get(layer.id);
    if (!source) {
      continue;
    }

    if (!layer.maskId) {
      source.container.mask = null;
      continue;
    }

    const target = instances.get(layer.maskId);
    if (!target) {
      source.container.mask = null;
      continue;
    }

    source.container.mask = target.target;
    (target.target as any).blendMode = 0;
  }
}