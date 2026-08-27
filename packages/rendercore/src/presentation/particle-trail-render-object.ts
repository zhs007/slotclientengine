import { Container, Sprite, type Texture } from "pixi.js";
import { SymbolAnimationError } from "../symbol/errors.js";
import { resolveRenderAnchor, type RenderAnchor } from "./render-anchor.js";
import {
  createRenderObject,
  getRenderObjectAdapter,
  registerRenderObjectAlias,
  type RenderObject,
} from "./render-object.js";

export interface ParticleTrailRange {
  readonly min: number;
  readonly max: number;
}

export interface ParticleTrailConfig {
  readonly maxParticles: number;
  readonly emissionRate: number;
  readonly lifetimeSeconds: ParticleTrailRange;
  readonly speedPixelsPerSecond: ParticleTrailRange;
  readonly sizePixels: ParticleTrailRange;
  readonly directionDegrees: number;
  readonly spreadDegrees: number;
  readonly gravityPixelsPerSecondSquared: number;
  readonly seed: number;
}

export interface ParticleTrailRenderObject extends RenderObject {
  /** Stops new emission and resolves only after every live particle expires. */
  stopEmissionAndDrain(): Promise<void>;
  getLiveParticleCount(): number;
  isEmitting(): boolean;
}

export interface CreateParticleTrailRenderObjectOptions {
  readonly texture: Texture;
  readonly emitter: RenderAnchor;
  readonly config: ParticleTrailConfig;
  readonly label?: string;
  readonly onDestroy?: () => void;
}

interface ParticleRecord {
  readonly sprite: Sprite;
  active: boolean;
  ageSeconds: number;
  lifetimeSeconds: number;
  velocityX: number;
  velocityY: number;
  initialScale: number;
}

/**
 * Creates a fixed-capacity, owner-clock-driven trail. Pixi can batch the pooled
 * sprites because every record shares one texture and no sprite is allocated in
 * the update path.
 */
export function createParticleTrailRenderObject(
  options: CreateParticleTrailRenderObjectOptions,
): ParticleTrailRenderObject {
  const config = validateConfig(options.config);
  if (!options.texture?.source)
    throw new SymbolAnimationError(
      "Particle trail requires a valid Pixi texture.",
    );
  const textureSize = Math.max(options.texture.width, options.texture.height);
  if (!Number.isFinite(textureSize) || textureSize <= 0)
    throw new SymbolAnimationError(
      "Particle trail texture size must be positive.",
    );

  const view = new Container();
  view.label = options.label ?? "particle-trail";
  const particles: ParticleRecord[] = [];
  for (let index = 0; index < config.maxParticles; index += 1) {
    const sprite = new Sprite(options.texture);
    sprite.anchor.set(0.5);
    sprite.blendMode = "add";
    sprite.visible = false;
    view.addChild(sprite);
    particles.push({
      sprite,
      active: false,
      ageSeconds: 0,
      lifetimeSeconds: 0,
      velocityX: 0,
      velocityY: 0,
      initialScale: 0,
    });
  }

  let destroyed = false;
  let emitting = true;
  let liveParticleCount = 0;
  let emissionAccumulator = 0;
  let spawnCursor = 0;
  let randomState = normalizeSeed(config.seed);
  let previousEmitterX = 0;
  let previousEmitterY = 0;
  let hasPreviousEmitter = false;
  let drainPromise: Promise<void> | null = null;
  let resolveDrain: (() => void) | null = null;

  const assertUsable = (): void => {
    if (destroyed)
      throw new SymbolAnimationError("Particle trail was destroyed.");
  };
  const nextRandom = (): number => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 0x1_0000_0000;
  };
  const finishDrainIfEmpty = (): void => {
    if (emitting || liveParticleCount !== 0 || !resolveDrain) return;
    const complete = resolveDrain;
    resolveDrain = null;
    complete();
  };
  const stopEmission = (): Promise<void> => {
    assertUsable();
    if (drainPromise) return drainPromise;
    emitting = false;
    emissionAccumulator = 0;
    drainPromise = new Promise<void>((resolve) => {
      resolveDrain = resolve;
    });
    finishDrainIfEmpty();
    return drainPromise;
  };
  const acquireParticle = (): ParticleRecord | null => {
    for (let offset = 0; offset < particles.length; offset += 1) {
      const index = (spawnCursor + offset) % particles.length;
      const particle = particles[index]!;
      if (particle.active) continue;
      spawnCursor = (index + 1) % particles.length;
      return particle;
    }
    return null;
  };
  const spawnParticle = (x: number, y: number): void => {
    const particle = acquireParticle();
    if (!particle) return;
    const lifetime = interpolateRange(config.lifetimeSeconds, nextRandom());
    const speed = interpolateRange(config.speedPixelsPerSecond, nextRandom());
    const size = interpolateRange(config.sizePixels, nextRandom());
    const angleDegrees =
      config.directionDegrees + (nextRandom() - 0.5) * config.spreadDegrees;
    const angleRadians = (angleDegrees * Math.PI) / 180;
    particle.active = true;
    particle.ageSeconds = 0;
    particle.lifetimeSeconds = lifetime;
    particle.velocityX = Math.cos(angleRadians) * speed;
    particle.velocityY = Math.sin(angleRadians) * speed;
    particle.initialScale = size / textureSize;
    particle.sprite.position.set(x, y);
    particle.sprite.scale.set(particle.initialScale);
    particle.sprite.alpha = 1;
    particle.sprite.visible = true;
    liveParticleCount += 1;
  };
  const update = (deltaSeconds: number): void => {
    assertUsable();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new SymbolAnimationError(
        "Particle trail deltaSeconds must be finite and non-negative.",
      );
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.ageSeconds += deltaSeconds;
      if (particle.ageSeconds >= particle.lifetimeSeconds) {
        particle.active = false;
        particle.sprite.visible = false;
        liveParticleCount -= 1;
        continue;
      }
      particle.velocityY += config.gravityPixelsPerSecondSquared * deltaSeconds;
      particle.sprite.x += particle.velocityX * deltaSeconds;
      particle.sprite.y += particle.velocityY * deltaSeconds;
      const progress = particle.ageSeconds / particle.lifetimeSeconds;
      particle.sprite.alpha = (1 - progress) * (1 - progress);
      const scale = particle.initialScale * (1 - progress * 0.65);
      particle.sprite.scale.set(scale);
    }
    finishDrainIfEmpty();
    if (!emitting || deltaSeconds === 0) return;

    const emitter = resolveRenderAnchor(options.emitter, view);
    if (!hasPreviousEmitter) {
      previousEmitterX = emitter.x;
      previousEmitterY = emitter.y;
      hasPreviousEmitter = true;
    }
    emissionAccumulator += config.emissionRate * deltaSeconds;
    const requested = Math.floor(emissionAccumulator);
    emissionAccumulator -= requested;
    for (let index = 0; index < requested; index += 1) {
      const progress = requested === 1 ? 1 : (index + 1) / requested;
      spawnParticle(
        previousEmitterX + (emitter.x - previousEmitterX) * progress,
        previousEmitterY + (emitter.y - previousEmitterY) * progress,
      );
    }
    previousEmitterX = emitter.x;
    previousEmitterY = emitter.y;
  };

  let object!: ParticleTrailRenderObject;
  const base = createRenderObject({
    view,
    update,
    stop: () => {
      void stopEmission();
    },
    destroy: () => {
      destroyed = true;
      emitting = false;
      liveParticleCount = 0;
      resolveDrain?.();
      resolveDrain = null;
      options.onDestroy?.();
      view.destroy({ children: true, texture: false, textureSource: false });
    },
  });
  object = Object.freeze({
    ...base,
    stopEmissionAndDrain: stopEmission,
    getLiveParticleCount: () => {
      assertUsable();
      return liveParticleCount;
    },
    isEmitting: () => {
      assertUsable();
      return emitting;
    },
  }) satisfies ParticleTrailRenderObject;
  registerRenderObjectAlias(object, getRenderObjectAdapter(base));
  return object;
}

function validateConfig(config: ParticleTrailConfig): ParticleTrailConfig {
  if (!Number.isSafeInteger(config.maxParticles) || config.maxParticles <= 0)
    throw new SymbolAnimationError(
      "Particle trail maxParticles must be a positive safe integer.",
    );
  if (config.maxParticles > 512)
    throw new SymbolAnimationError(
      "Particle trail maxParticles must not exceed 512.",
    );
  assertPositive(config.emissionRate, "emissionRate");
  assertRange(config.lifetimeSeconds, "lifetimeSeconds", true);
  assertRange(config.speedPixelsPerSecond, "speedPixelsPerSecond", false);
  assertRange(config.sizePixels, "sizePixels", true);
  assertFinite(config.directionDegrees, "directionDegrees");
  assertFinite(config.spreadDegrees, "spreadDegrees");
  if (config.spreadDegrees < 0 || config.spreadDegrees > 360)
    throw new SymbolAnimationError(
      "Particle trail spreadDegrees must be between 0 and 360.",
    );
  assertFinite(
    config.gravityPixelsPerSecondSquared,
    "gravityPixelsPerSecondSquared",
  );
  if (!Number.isSafeInteger(config.seed))
    throw new SymbolAnimationError(
      "Particle trail seed must be a safe integer.",
    );
  return Object.freeze({
    ...config,
    lifetimeSeconds: Object.freeze({ ...config.lifetimeSeconds }),
    speedPixelsPerSecond: Object.freeze({ ...config.speedPixelsPerSecond }),
    sizePixels: Object.freeze({ ...config.sizePixels }),
  });
}

function assertRange(
  range: ParticleTrailRange,
  label: string,
  strictlyPositive: boolean,
): void {
  if (!range || typeof range !== "object")
    throw new SymbolAnimationError(`Particle trail ${label} is required.`);
  assertFinite(range.min, `${label}.min`);
  assertFinite(range.max, `${label}.max`);
  if (
    (strictlyPositive ? range.min <= 0 : range.min < 0) ||
    range.max < range.min
  )
    throw new SymbolAnimationError(
      `Particle trail ${label} must contain an ordered ${strictlyPositive ? "positive" : "non-negative"} range.`,
    );
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (value <= 0)
    throw new SymbolAnimationError(`Particle trail ${label} must be positive.`);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value))
    throw new SymbolAnimationError(`Particle trail ${label} must be finite.`);
}

function interpolateRange(range: ParticleTrailRange, progress: number): number {
  return range.min + (range.max - range.min) * progress;
}

function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}
