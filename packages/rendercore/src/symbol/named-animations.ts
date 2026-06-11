import { Graphics, Sprite } from "pixi.js";
import { ManualSymbolAni, resetBaseDisplay } from "./ani.js";
import { SymbolAnimationError } from "./errors.js";
import type {
  NamedSymbolAnimationRegistry,
  SymbolAnimationContext,
  SymbolAnimationProfile,
  SymbolAnimationProfileMap,
  SymbolAnimationResolver,
  SymbolLayerEffect,
  SymbolNamedAnimationSpec
} from "./types.js";

export interface CreateNamedSymbolAnimationResolverOptions {
  readonly profiles: SymbolAnimationProfileMap;
  readonly fallback?: SymbolAnimationResolver;
  readonly registry?: NamedSymbolAnimationRegistry;
}

const DEFAULT_MAX_SCALE = 1.2;
const DEFAULT_SHINE_ALPHA = 0.95;
const DEFAULT_SHINE_WIDTH_RATIO = 0.28;
const DEG_TO_RAD = Math.PI / 180;
const SHINE_MASK_ROTATION = Math.PI / 7;

export function createNamedSymbolAnimationResolver(
  options: CreateNamedSymbolAnimationResolverOptions
): SymbolAnimationResolver {
  const registry = Object.freeze({
    ...createDefaultNamedSymbolAnimationRegistry(),
    ...(options.registry ?? {})
  });

  return (context) => {
    const profile = options.profiles[context.symbol]?.[context.resolvedState];
    if (!profile) {
      if (!options.fallback) {
        throw new SymbolAnimationError(
          `No named symbol animation profile for "${context.symbol}" state "${context.resolvedState}".`
        );
      }
      return options.fallback(context);
    }

    assertAnimationProfile(context, profile);
    const effects = profile.effects.map((spec) => createEffect(context, profile, spec, registry));
    return new ManualSymbolAni({
      stateId: context.resolvedState,
      playback: profile.playback,
      durationSeconds: profile.durationSeconds,
      onReset: () => {
        resetBaseDisplay(context);
        for (const effect of effects) {
          effect.reset();
        }
      },
      onProgress: (progress) => {
        for (const effect of effects) {
          effect.progress(progress);
        }
      },
      onComplete: () => {
        for (const effect of effects) {
          effect.complete();
        }
      }
    });
  };
}

export function createDefaultNamedSymbolAnimationRegistry(): NamedSymbolAnimationRegistry {
  return Object.freeze({
    layerTextureSequence: createLayerTextureSequenceEffect,
    layerBounceScale: createLayerBounceScaleEffect,
    layerShineScale: createLayerShineScaleEffect,
    layerStaggeredShineScale: createLayerStaggeredShineScaleEffect,
    singleSpriteAppear: createSingleSpriteAppearEffect,
    singleSpriteWinShine: createSingleSpriteWinShineEffect
  });
}

function createEffect(
  context: SymbolAnimationContext,
  profile: SymbolAnimationProfile,
  spec: SymbolNamedAnimationSpec,
  registry: NamedSymbolAnimationRegistry
): SymbolLayerEffect {
  const factory = registry[spec.name];
  if (!factory) {
    throw new SymbolAnimationError(`Unknown symbol animation "${spec.name}".`);
  }
  return factory(context, spec.params ?? {}, profile);
}

function createLayerTextureSequenceEffect(
  context: SymbolAnimationContext,
  params: Readonly<Record<string, unknown>>,
  profile: SymbolAnimationProfile
): SymbolLayerEffect {
  assertKnownParams(params, ["layer", "frameDurationSeconds", "delaySeconds", "durationRatio"]);
  const layer = getLayer(context, readIntegerParam(params, "layer"));
  if (layer.keyframes.length < 2) {
    throw new SymbolAnimationError(
      `Symbol "${context.symbol}" layer ${layer.index} must declare at least two keyframes for layerTextureSequence.`
    );
  }
  const delaySeconds = readNonNegativeNumberParam(params, "delaySeconds", 0);
  const durationRatio = readRatioParam(params, "durationRatio", 1);
  const frameDurationSeconds =
    params.frameDurationSeconds === undefined
      ? (profile.durationSeconds * durationRatio) / layer.keyframes.length
      : readPositiveNumberParam(params, "frameDurationSeconds", 1 / 60);

  return Object.freeze({
    reset: () => {
      layer.sprite.texture = layer.texture;
    },
    progress: (progress: number) => {
      const elapsedSeconds = progress * profile.durationSeconds - delaySeconds;
      const sequenceDurationSeconds = profile.durationSeconds * durationRatio;
      const clampedElapsedSeconds = Math.min(
        Math.max(elapsedSeconds, 0),
        sequenceDurationSeconds
      );
      const frameIndex = Math.min(
        layer.keyframes.length - 1,
        Math.floor((clampedElapsedSeconds + 1e-9) / frameDurationSeconds)
      );
      layer.sprite.texture = layer.keyframes[frameIndex] ?? layer.texture;
    },
    complete: () => {
      layer.sprite.texture = layer.texture;
    }
  });
}

function createLayerBounceScaleEffect(
  context: SymbolAnimationContext,
  params: Readonly<Record<string, unknown>>,
  profile: SymbolAnimationProfile
): SymbolLayerEffect {
  assertKnownParams(params, [
    "layer",
    "maxScale",
    "offsetY",
    "cycles",
    "delaySeconds",
    "rotationDegrees"
  ]);
  const layer = getLayer(context, readIntegerParam(params, "layer"));
  const maxScale = readPositiveNumberParam(params, "maxScale", DEFAULT_MAX_SCALE);
  const offsetY = readFiniteNumberParam(params, "offsetY", -10);
  const cycles = readPositiveNumberParam(params, "cycles", 1);
  const delaySeconds = readNonNegativeNumberParam(params, "delaySeconds", 0);
  const rotationRadians = readFiniteNumberParam(params, "rotationDegrees", 0) * DEG_TO_RAD;

  return Object.freeze({
    reset: () => {
      layer.sprite.position.set(0);
      layer.sprite.scale.set(1);
      layer.sprite.rotation = 0;
    },
    progress: (progress: number) => {
      const localProgress = createLocalProgress(progress, profile.durationSeconds, delaySeconds, 1);
      const pulse = Math.sin(Math.PI * localProgress);
      const bob = Math.sin(Math.PI * 2 * cycles * localProgress);
      layer.sprite.scale.set(1 + pulse * (maxScale - 1));
      layer.sprite.rotation = pulse * rotationRadians;
      layer.sprite.y = bob * offsetY;
    },
    complete: () => {
      layer.sprite.position.set(0);
      layer.sprite.scale.set(1);
      layer.sprite.rotation = 0;
    }
  });
}

function createLayerShineScaleEffect(
  context: SymbolAnimationContext,
  params: Readonly<Record<string, unknown>>,
  profile: SymbolAnimationProfile
): SymbolLayerEffect {
  assertKnownParams(params, [
    "layer",
    "maxScale",
    "shineAlpha",
    "shineWidthRatio",
    "delaySeconds",
    "durationRatio",
    "rotationDegrees"
  ]);
  const layer = getLayer(context, readIntegerParam(params, "layer"));
  const maxScale = readPositiveNumberParam(params, "maxScale", DEFAULT_MAX_SCALE);
  const shineAlpha = readNonNegativeNumberParam(params, "shineAlpha", DEFAULT_SHINE_ALPHA);
  const shineWidthRatio = readPositiveNumberParam(params, "shineWidthRatio", DEFAULT_SHINE_WIDTH_RATIO);
  const delaySeconds = readNonNegativeNumberParam(params, "delaySeconds", 0);
  const durationRatio = readPositiveNumberParam(params, "durationRatio", 1);
  const rotationRadians = readFiniteNumberParam(params, "rotationDegrees", 0) * DEG_TO_RAD;
  let shineSprite: Sprite | null = null;
  let shineMask: Graphics | null = null;

  return Object.freeze({
    reset: () => {
      layer.sprite.position.set(0);
      layer.sprite.scale.set(1);
      layer.sprite.rotation = 0;
      const overlay = createLayerShineOverlay(layer.texture, shineWidthRatio);
      shineSprite = overlay.sprite;
      shineMask = overlay.mask;
      context.overlayLayer.addChild(shineSprite, shineMask);
    },
    progress: (progress: number) => {
      if (!shineSprite || !shineMask) {
        return;
      }
      const localProgress = createLocalProgress(
        progress,
        profile.durationSeconds,
        delaySeconds,
        durationRatio
      );
      const easedSweep = easeOutCubic(localProgress);
      const pulseScale = 1 + Math.sin(Math.PI * localProgress) * (maxScale - 1);
      const width = getTextureWidth(layer.texture);
      layer.sprite.scale.set(pulseScale);
      layer.sprite.rotation = Math.sin(Math.PI * localProgress) * rotationRadians;
      shineSprite.position.copyFrom(layer.sprite.position);
      shineSprite.scale.copyFrom(layer.sprite.scale);
      shineSprite.rotation = layer.sprite.rotation;
      shineMask.x = -width * 0.85 + width * 1.7 * easedSweep;
      shineMask.y = layer.sprite.y;
      shineMask.rotation = SHINE_MASK_ROTATION + layer.sprite.rotation;
      shineSprite.alpha = Math.sin(Math.PI * localProgress) * shineAlpha;
    },
    complete: () => {
      layer.sprite.position.set(0);
      layer.sprite.scale.set(1);
      layer.sprite.rotation = 0;
      clearOverlay(context, shineSprite);
      shineSprite = null;
      shineMask = null;
    }
  });
}

function createLayerStaggeredShineScaleEffect(
  context: SymbolAnimationContext,
  params: Readonly<Record<string, unknown>>,
  profile: SymbolAnimationProfile
): SymbolLayerEffect {
  assertKnownParams(params, ["layers", "maxScale", "staggerSeconds", "durationRatio"]);
  const layerIndexes = readIntegerArrayParam(params, "layers");
  if (layerIndexes.length === 0) {
    throw new SymbolAnimationError('Animation param "layers" must include at least one layer.');
  }
  const maxScale = readPositiveNumberParam(params, "maxScale", DEFAULT_MAX_SCALE);
  const staggerSeconds = readNonNegativeNumberParam(params, "staggerSeconds", 0.08);
  const durationRatio = readPositiveNumberParam(params, "durationRatio", 0.78);
  const effects = layerIndexes.map((layerIndex, index) =>
    createLayerShineScaleEffect(
      context,
      {
        layer: layerIndex,
        maxScale,
        delaySeconds: staggerSeconds * index,
        durationRatio
      },
      profile
    )
  );

  return Object.freeze({
    reset: () => {
      for (const effect of effects) {
        effect.reset();
      }
    },
    progress: (progress: number) => {
      for (const effect of effects) {
        effect.progress(progress);
      }
    },
    complete: () => {
      for (const effect of effects) {
        effect.complete();
      }
    }
  });
}

function createSingleSpriteAppearEffect(
  context: SymbolAnimationContext,
  params: Readonly<Record<string, unknown>>,
  _profile: SymbolAnimationProfile
): SymbolLayerEffect {
  assertKnownParams(params, ["maxScale"]);
  const maxScale = readPositiveNumberParam(params, "maxScale", 1.5);

  return Object.freeze({
    reset: () => {
      context.sprite.scale.set(1);
    },
    progress: (progress: number) => {
      context.sprite.scale.set(1 + Math.sin(Math.PI * progress) * (maxScale - 1));
    },
    complete: () => {
      context.sprite.scale.set(1);
    }
  });
}

function createSingleSpriteWinShineEffect(
  context: SymbolAnimationContext,
  params: Readonly<Record<string, unknown>>,
  profile: SymbolAnimationProfile
): SymbolLayerEffect {
  return createLayerShineScaleEffect(context, { layer: 0, ...params }, profile);
}

function assertAnimationProfile(
  context: SymbolAnimationContext,
  profile: SymbolAnimationProfile
): void {
  if (profile.playback !== context.state.playback) {
    throw new SymbolAnimationError(
      `Animation profile for "${context.symbol}" state "${context.resolvedState}" has playback "${profile.playback}", expected "${context.state.playback}".`
    );
  }
  if (!Number.isFinite(profile.durationSeconds) || profile.durationSeconds <= 0) {
    throw new SymbolAnimationError(
      `Animation profile for "${context.symbol}" state "${context.resolvedState}" must have positive durationSeconds.`
    );
  }
  if (!Array.isArray(profile.effects) || profile.effects.length === 0) {
    throw new SymbolAnimationError(
      `Animation profile for "${context.symbol}" state "${context.resolvedState}" must include effects.`
    );
  }
}

function getLayer(context: SymbolAnimationContext, index: number) {
  const layer = context.layers.find((candidate) => candidate.index === index);
  if (!layer) {
    throw new SymbolAnimationError(`Symbol "${context.symbol}" does not have layer ${index}.`);
  }
  return layer;
}

function createLayerShineOverlay(texture: import("pixi.js").Texture, shineWidthRatio: number): {
  readonly sprite: Sprite;
  readonly mask: Graphics;
} {
  const width = getTextureWidth(texture);
  const height = getTextureHeight(texture);
  const shineWidth = Math.max(24, width * shineWidthRatio);
  const shineHeight = Math.max(56, height * 1.6);
  const mask = new Graphics()
    .rect(-shineWidth / 2, -shineHeight / 2, shineWidth, shineHeight)
    .fill({ color: 0xffffff, alpha: 1 });
  mask.rotation = SHINE_MASK_ROTATION;
  mask.x = -width;

  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.alpha = 0;
  sprite.blendMode = "screen";
  sprite.mask = mask;

  return { sprite, mask };
}

function clearOverlay(context: SymbolAnimationContext, shineSprite: Sprite | null): void {
  if (shineSprite) {
    shineSprite.mask = null;
  }
  context.overlayLayer.removeChildren();
}

function assertKnownParams(params: Readonly<Record<string, unknown>>, allowed: readonly string[]): void {
  for (const key of Object.keys(params)) {
    if (!allowed.includes(key)) {
      throw new SymbolAnimationError(`Unknown animation param "${key}".`);
    }
  }
}

function readIntegerParam(params: Readonly<Record<string, unknown>>, key: string): number {
  const value = params[key];
  if (!Number.isInteger(value)) {
    throw new SymbolAnimationError(`Animation param "${key}" must be an integer.`);
  }
  return value as number;
}

function readIntegerArrayParam(params: Readonly<Record<string, unknown>>, key: string): readonly number[] {
  const value = params[key];
  if (!Array.isArray(value) || !value.every(Number.isInteger)) {
    throw new SymbolAnimationError(`Animation param "${key}" must be an integer array.`);
  }
  return Object.freeze([...value]);
}

function readFiniteNumberParam(
  params: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: number
): number {
  const value = params[key] ?? defaultValue;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SymbolAnimationError(`Animation param "${key}" must be a finite number.`);
  }
  return value;
}

function readPositiveNumberParam(
  params: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: number
): number {
  const value = readFiniteNumberParam(params, key, defaultValue);
  if (value <= 0) {
    throw new SymbolAnimationError(`Animation param "${key}" must be positive.`);
  }
  return value;
}

function readNonNegativeNumberParam(
  params: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: number
): number {
  const value = readFiniteNumberParam(params, key, defaultValue);
  if (value < 0) {
    throw new SymbolAnimationError(`Animation param "${key}" must be non-negative.`);
  }
  return value;
}

function readRatioParam(
  params: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: number
): number {
  const value = readPositiveNumberParam(params, key, defaultValue);
  if (value > 1) {
    throw new SymbolAnimationError(`Animation param "${key}" must be less than or equal to 1.`);
  }
  return value;
}

function createLocalProgress(
  progress: number,
  durationSeconds: number,
  delaySeconds: number,
  durationRatio: number
): number {
  const duration = Math.max(1 / 60, durationSeconds * durationRatio);
  const elapsed = progress * durationSeconds;
  return clamp((elapsed - delaySeconds) / duration);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function getTextureWidth(texture: import("pixi.js").Texture): number {
  return Math.max(1, texture.width || texture.source?.width || texture.orig?.width || 1);
}

function getTextureHeight(texture: import("pixi.js").Texture): number {
  return Math.max(1, texture.height || texture.source?.height || texture.orig?.height || 1);
}
