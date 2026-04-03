const BLEND_MODE_MAP: Record<string, number> = {
  normal: 0,
  add: 1,
  multiply: 2,
  screen: 3
};

const FILTER_BLEND_ANIMATIONS = new Set(["cloudSea", "fireDistortion"]);

export function resolveBlendMode(blendMode: string) {
  return BLEND_MODE_MAP[blendMode.toLowerCase()] ?? BLEND_MODE_MAP.normal;
}

export function layerUsesContainerBlendMode(animationTypes: string[]) {
  return animationTypes.some((type) => FILTER_BLEND_ANIMATIONS.has(type));
}