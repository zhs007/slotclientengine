import { Graphics, Sprite } from "pixi.js";
import { SymbolAnimationError } from "./errors.js";
import type {
  SymbolAni,
  SymbolAniUpdateResult,
  SymbolAnimationContext,
  SymbolPlaybackKind,
  SymbolStateId
} from "./types.js";

const EMPTY_UPDATE_RESULT: SymbolAniUpdateResult = Object.freeze({
  loopCompleted: false,
  onceCompleted: false
});

const WIN_SHINE_DURATION_SECONDS = 0.58;
const WIN_SHINE_MAX_ALPHA = 0.95;
const WIN_SHINE_MAX_SCALE = 1.2;

export interface ManualSymbolAniOptions {
  readonly stateId: SymbolStateId;
  readonly playback: SymbolPlaybackKind;
  readonly durationSeconds?: number;
  readonly onReset?: () => void;
  readonly onProgress?: (progress: number) => void;
  readonly onComplete?: () => void;
}

export class ManualSymbolAni implements SymbolAni {
  readonly stateId: SymbolStateId;
  readonly playback: SymbolPlaybackKind;
  readonly #durationSeconds: number;
  readonly #onReset?: () => void;
  readonly #onProgress?: (progress: number) => void;
  readonly #onComplete?: () => void;
  #elapsedSeconds = 0;
  #onceCompleted = false;

  constructor(options: ManualSymbolAniOptions) {
    this.stateId = options.stateId;
    this.playback = options.playback;
    this.#durationSeconds = options.durationSeconds ?? 1 / 60;
    this.#onReset = options.onReset;
    this.#onProgress = options.onProgress;
    this.#onComplete = options.onComplete;

    if (!Number.isFinite(this.#durationSeconds) || this.#durationSeconds <= 0) {
      throw new SymbolAnimationError(`Symbol ani "${this.stateId}" duration must be positive.`);
    }
  }

  reset(): void {
    this.#elapsedSeconds = 0;
    this.#onceCompleted = false;
    this.#onReset?.();
    this.#onProgress?.(0);
  }

  update(deltaSeconds: number): SymbolAniUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);

    if (this.playback === "static") {
      return Object.freeze({
        loopCompleted: true,
        onceCompleted: false
      });
    }

    if (deltaSeconds === 0) {
      return EMPTY_UPDATE_RESULT;
    }

    if (this.playback === "loop") {
      return this.updateLoop(deltaSeconds);
    }

    return this.updateOnce(deltaSeconds);
  }

  private updateLoop(deltaSeconds: number): SymbolAniUpdateResult {
    const nextElapsed = this.#elapsedSeconds + deltaSeconds;
    const loopCompleted = nextElapsed >= this.#durationSeconds;
    this.#elapsedSeconds = nextElapsed % this.#durationSeconds;
    this.#onProgress?.(this.#elapsedSeconds / this.#durationSeconds);

    return Object.freeze({
      loopCompleted,
      onceCompleted: false
    });
  }

  private updateOnce(deltaSeconds: number): SymbolAniUpdateResult {
    if (this.#onceCompleted) {
      return EMPTY_UPDATE_RESULT;
    }

    this.#elapsedSeconds = Math.min(this.#elapsedSeconds + deltaSeconds, this.#durationSeconds);
    const progress = this.#elapsedSeconds / this.#durationSeconds;
    this.#onProgress?.(progress);

    if (this.#elapsedSeconds >= this.#durationSeconds) {
      this.#onceCompleted = true;
      this.#onComplete?.();
      return Object.freeze({
        loopCompleted: false,
        onceCompleted: true
      });
    }

    return EMPTY_UPDATE_RESULT;
  }
}

export function createStaticSymbolAni(context: SymbolAnimationContext): SymbolAni {
  return new ManualSymbolAni({
    stateId: context.resolvedState,
    playback: "static",
    onReset: () => {
      resetBaseDisplay(context);
    }
  });
}

export function createLoopSymbolAni(options: {
  readonly stateId: SymbolStateId;
  readonly durationSeconds: number;
  readonly onProgress?: (progress: number) => void;
}): SymbolAni {
  return new ManualSymbolAni({
    stateId: options.stateId,
    playback: "loop",
    durationSeconds: options.durationSeconds,
    onProgress: options.onProgress
  });
}

export function createAppearSymbolAni(context: SymbolAnimationContext): SymbolAni {
  return new ManualSymbolAni({
    stateId: context.resolvedState,
    playback: "once",
    durationSeconds: 0.42,
    onReset: () => {
      resetBaseDisplay(context);
    },
    onProgress: (progress) => {
      const scale = 1 + Math.sin(Math.PI * progress) * 0.5;
      context.sprite.scale.set(scale);
    },
    onComplete: () => {
      context.sprite.scale.set(1);
    }
  });
}

export function createWinSymbolAni(context: SymbolAnimationContext): SymbolAni {
  let shineSprite: Sprite | null = null;
  let shineMask: Graphics | null = null;

  return new ManualSymbolAni({
    stateId: context.resolvedState,
    playback: "once",
    durationSeconds: WIN_SHINE_DURATION_SECONDS,
    onReset: () => {
      resetBaseDisplay(context);
      const shineOverlay = createShineOverlay(context);
      shineSprite = shineOverlay.sprite;
      shineMask = shineOverlay.mask;
      context.overlayLayer.addChild(shineSprite, shineMask);
    },
    onProgress: (progress) => {
      if (!shineSprite || !shineMask) {
        return;
      }
      const width = getTextureWidth(context);
      const easedSweep = easeOutCubic(progress);
      const pulseScale = 1 + Math.sin(Math.PI * progress) * (WIN_SHINE_MAX_SCALE - 1);
      shineMask.x = -width * 0.85 + width * 1.7 * easedSweep;
      shineSprite.alpha = Math.sin(Math.PI * progress) * WIN_SHINE_MAX_ALPHA;
      context.sprite.scale.set(pulseScale);
      context.overlayLayer.scale.set(pulseScale);
    },
    onComplete: () => {
      context.sprite.scale.set(1);
      context.overlayLayer.scale.set(1);
      clearShineOverlay(context, shineSprite);
      shineSprite = null;
      shineMask = null;
    }
  });
}

export function assertValidDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new SymbolAnimationError("deltaSeconds must be a finite non-negative number.");
  }
}

export function resetBaseDisplay(context: SymbolAnimationContext): void {
  context.sprite.texture = context.texture;
  context.sprite.alpha = 1;
  context.sprite.rotation = 0;
  context.sprite.scale.set(1);
  context.overlayLayer.alpha = 1;
  context.overlayLayer.rotation = 0;
  context.overlayLayer.scale.set(1);
  for (const child of context.overlayLayer.children) {
    child.mask = null;
  }
  context.overlayLayer.removeChildren();
}

function createShineOverlay(context: SymbolAnimationContext): {
  readonly sprite: Sprite;
  readonly mask: Graphics;
} {
  const width = getTextureWidth(context);
  const height = getTextureHeight(context);
  const shineWidth = Math.max(24, width * 0.28);
  const shineHeight = Math.max(56, height * 1.6);
  const mask = new Graphics()
    .rect(-shineWidth / 2, -shineHeight / 2, shineWidth, shineHeight)
    .fill({ color: 0xffffff, alpha: 1 });
  mask.rotation = Math.PI / 7;
  mask.x = -width;

  const sprite = new Sprite(context.texture);
  sprite.anchor.set(0.5);
  sprite.alpha = 0;
  sprite.blendMode = "screen";
  sprite.mask = mask;

  return { sprite, mask };
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function clearShineOverlay(context: SymbolAnimationContext, shineSprite: Sprite | null): void {
  if (shineSprite) {
    shineSprite.mask = null;
  }
  context.overlayLayer.removeChildren();
}

function getTextureWidth(context: SymbolAnimationContext): number {
  return Math.max(1, context.texture.width || context.sprite.width || 1);
}

function getTextureHeight(context: SymbolAnimationContext): number {
  return Math.max(1, context.texture.height || context.sprite.height || 1);
}
