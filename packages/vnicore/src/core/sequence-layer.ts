import { clampNumber } from "./coordinates.js";
import type { V5GAssetConfig, V5GLayerConfig } from "./types.js";

export function getSequenceFrameAssetId(
  layer: V5GLayerConfig,
  time: number,
): string {
  if (layer.type !== "sequence") {
    throw new Error(
      `VNI layer "${layer.id}" is not a sequence layer: ${layer.type}.`,
    );
  }
  const sequence = layer.sequence;
  if (!sequence) {
    throw new Error(`VNI sequence layer "${layer.id}" is missing sequence.`);
  }
  const frameAssetIds = sequence.frameAssetIds;
  if (frameAssetIds.length === 0) {
    throw new Error(
      `VNI sequence layer "${layer.id}" requires at least one frameAssetId.`,
    );
  }
  if (frameAssetIds.length === 1) return frameAssetIds[0];

  const cycleDuration = Math.max(0.01, sequence.cycleDuration);
  const frameDuration = cycleDuration / frameAssetIds.length;
  const rawTime = Math.max(0, time);
  const sequenceTime =
    sequence.loop === false
      ? Math.min(rawTime, Math.max(0, cycleDuration - 0.000001))
      : positiveModulo(rawTime, cycleDuration);
  const frameIndex = clampNumber(
    Math.floor(sequenceTime / Math.max(0.000001, frameDuration)),
    0,
    frameAssetIds.length - 1,
  );
  return frameAssetIds[Math.floor(frameIndex)];
}

export function getLayerDisplayAssetId(
  layer: V5GLayerConfig,
  time: number,
): string | null {
  if (layer.type === "image") return layer.assetId;
  if (layer.type === "sequence") return getSequenceFrameAssetId(layer, time);
  return null;
}

export function getLayerDisplayAsset(
  layer: V5GLayerConfig,
  time: number,
  assetsById: ReadonlyMap<string, V5GAssetConfig>,
): V5GAssetConfig | null {
  const assetId = getLayerDisplayAssetId(layer, time);
  if (!assetId) return null;
  const asset = assetsById.get(assetId);
  if (!asset) {
    throw new Error(
      `VNI ${layer.type} layer "${layer.id}" references missing display asset "${assetId}".`,
    );
  }
  return asset;
}

function positiveModulo(value: number, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}
