import type {
  VictoryAnimationConfig,
  VictoryAnimationConfigRaw,
  VictoryLayerConfig,
  VictoryLayerConfigRaw,
  VictoryProjectConfig,
  VictoryProjectConfigRaw
} from "./victory-types.js";

export const DEFAULT_STAGE_WIDTH = 1280;
export const DEFAULT_STAGE_HEIGHT = 900;

export function normalizeProjectConfig(
  raw: VictoryProjectConfigRaw,
  resolveAsset: (assetPath: string) => string,
  width = DEFAULT_STAGE_WIDTH,
  height = DEFAULT_STAGE_HEIGHT
): VictoryProjectConfig {
  if (!raw.layers || !Array.isArray(raw.layers)) {
    throw new Error("Victory project must contain a layers array.");
  }

  return {
    version: raw.version ?? "0.0.0",
    name: raw.name ?? "VictoryAnimation",
    duration: coerceNumber(raw.duration, 5),
    width,
    height,
    layers: raw.layers.map((layer, index) => normalizeLayer(layer, index, resolveAsset))
  };
}

function normalizeLayer(
  layer: VictoryLayerConfigRaw,
  index: number,
  resolveAsset: (assetPath: string) => string
): VictoryLayerConfig {
  const sourceAsset = layer.asset ?? "";
  const fallbackScale = coerceNumber(layer.scale, 1);

  return {
    id: layer.id?.trim() || `layer-${index + 1}`,
    type: layer.type === "font" ? "font" : "pic",
    asset: sourceAsset ? resolveAsset(sourceAsset) : "",
    sourceAsset,
    text: layer.text ?? "",
    x: coerceNumber(layer.x, 0),
    y: coerceNumber(layer.y, 0),
    scaleX: coerceNumber(layer.scaleX, fallbackScale),
    scaleY: coerceNumber(layer.scaleY, fallbackScale),
    rotation: coerceNumber(layer.rotation, 0),
    alpha: clamp01(coerceNumber(layer.alpha, 1)),
    blendMode: (layer.blendMode ?? "normal").toLowerCase(),
    visible: layer.visible ?? true,
    locked: layer.locked ?? false,
    maskId: layer.maskId ?? null,
    animations: (layer.animations ?? []).map(normalizeAnimation)
  };
}

function normalizeAnimation(animation: VictoryAnimationConfigRaw): VictoryAnimationConfig {
  return {
    type: animation.type ?? "custom",
    startTime: Math.max(0, coerceNumber(animation.startTime, 0)),
    duration: Math.max(0, coerceNumber(animation.duration, 0)),
    script: animation.script,
    params: animation.params ?? {},
    showParams: animation.showParams
  };
}

function coerceNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}