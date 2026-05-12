import type { BuiltLayer } from "./layer-factory.js";

export function bindLayerMasks(layers: BuiltLayer[]) {
  const layerById = new Map(layers.map((layer) => [layer.config.id, layer]));

  for (const layer of layers) {
    if (!layer.config.maskId) {
      continue;
    }

    const maskLayer = layerById.get(layer.config.maskId);
    if (!maskLayer) {
      throw new Error(
        `Missing mask layer "${layer.config.maskId}" for "${layer.config.id}".`,
      );
    }

    maskLayer.container.blendMode = "normal";
    layer.container.mask = maskLayer.sprite;
  }
}
