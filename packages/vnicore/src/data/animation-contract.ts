import type { V5GAnimationType } from "./types.js";

export type V5GEasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "backOut";

export const SUPPORTED_EASINGS: readonly V5GEasingName[] = Object.freeze([
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "backOut",
]);

export const PARTICLE_ANIMATION_TYPES: readonly V5GAnimationType[] =
  Object.freeze([
    "particles",
    "particle_stream",
    "particle_twinkle",
    "particle_wall",
    "particle_combo",
  ]);

export const DETERMINISTIC_EFFECT_ANIMATION_TYPES: readonly V5GAnimationType[] =
  Object.freeze([
    "gather_particles",
    "smoke_mist",
    "energy_ring",
    "slash_light",
    "flame_flicker",
    "wave_band",
    "wave_distort",
    "speed_lines",
    "drift_fall",
    "path_particles",
  ]);

export const SUPPORTED_ANIMATION_TYPES: readonly V5GAnimationType[] =
  Object.freeze([
    "idle",
    "move",
    "multi_move",
    "fade",
    "scale_up",
    "scale_down",
    "scale_in",
    "scale_out",
    "pop",
    "bounce_jump",
    "shake",
    "blink",
    "rotate",
    "slide_in",
    "slide_out",
    "bounce_in",
    "pulse",
    "float",
    "swing",
    "particles",
    "particle_stream",
    "particle_twinkle",
    "particle_wall",
    "particle_combo",
    "chaser_light",
    "gather_particles",
    "smoke_mist",
    "energy_ring",
    "slash_light",
    "flame_flicker",
    "wave_band",
    "wave_distort",
    "speed_lines",
    "drift_fall",
    "path_particles",
    "shatter",
    "glow",
    "safe_glow",
    "squash_stretch",
    "card_carousel_3d",
  ]);

const DEFAULT_EASING_BY_TYPE: Readonly<
  Record<V5GAnimationType, V5GEasingName>
> = Object.freeze({
  idle: "linear",
  move: "easeOutQuad",
  multi_move: "linear",
  fade: "linear",
  scale_up: "easeOutQuad",
  scale_down: "easeOutQuad",
  scale_in: "easeOutQuad",
  scale_out: "easeInQuad",
  pop: "easeOutQuad",
  bounce_jump: "linear",
  shake: "linear",
  blink: "linear",
  rotate: "linear",
  slide_in: "easeOutQuad",
  slide_out: "easeInQuad",
  bounce_in: "backOut",
  pulse: "linear",
  float: "linear",
  swing: "linear",
  particles: "linear",
  particle_stream: "linear",
  particle_twinkle: "linear",
  particle_wall: "linear",
  particle_combo: "easeInOutQuad",
  chaser_light: "linear",
  gather_particles: "easeInOutQuad",
  smoke_mist: "easeOutQuad",
  energy_ring: "easeOutQuad",
  slash_light: "easeOutQuad",
  flame_flicker: "linear",
  wave_band: "linear",
  wave_distort: "linear",
  speed_lines: "linear",
  drift_fall: "linear",
  path_particles: "linear",
  shatter: "easeOutQuad",
  glow: "linear",
  safe_glow: "linear",
  squash_stretch: "easeOutQuad",
  card_carousel_3d: "linear",
});

export function isSupportedAnimationType(
  value: string,
): value is V5GAnimationType {
  return SUPPORTED_ANIMATION_TYPES.includes(value as V5GAnimationType);
}

export function isParticleAnimationType(
  value: string,
): value is V5GAnimationType {
  return PARTICLE_ANIMATION_TYPES.includes(value as V5GAnimationType);
}

export function isDeterministicEffectAnimationType(
  value: string,
): value is V5GAnimationType {
  return DETERMINISTIC_EFFECT_ANIMATION_TYPES.includes(
    value as V5GAnimationType,
  );
}

export function isSupportedEasing(value: string): value is V5GEasingName {
  return SUPPORTED_EASINGS.includes(value as V5GEasingName);
}

export function getDefaultEasing(type: V5GAnimationType): V5GEasingName {
  const easing = DEFAULT_EASING_BY_TYPE[type];
  if (!easing) {
    throw new Error(`Unsupported V5G animation type: ${String(type)}`);
  }
  return easing;
}
