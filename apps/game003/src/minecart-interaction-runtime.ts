import { Container, Sprite, type Texture } from "pixi.js";
import {
  createStandaloneSymbolCatalog,
  type RenderSymbol,
  type SymbolAssetMap,
} from "@slotclientengine/rendercore";
import type { Game003BgBarFeature } from "./bg-bar-sequence.js";
import type { Game003BgBarSkinConfig } from "./skin-config.js";
import type { Point } from "./game-layout.js";
import type {
  Game003MinecartInteractionConfig,
  Game003MinecartPoint,
} from "./minecart-interaction-config.js";
import type { Game003MinecartInteractionLayout } from "./minecart-interaction-layout.js";

export interface Game003MinecartInteractionRuntimeOptions {
  readonly config: Game003MinecartInteractionConfig;
  readonly bgBarConfig: Game003BgBarSkinConfig;
  readonly minecartTexture: Texture;
  readonly symbolAssets: SymbolAssetMap;
}

export interface Game003MinecartInteractionSnapshot {
  readonly phase:
    | "idle"
    | "cart-rush"
    | "symbol-fly"
    | "symbol-hold"
    | "parked"
    | "cart-exit"
    | "destroyed";
  readonly feature: Game003BgBarFeature | null;
  readonly cartPosition: Point;
  readonly cartRotation: number;
  readonly cartVisible: boolean;
  readonly payloadPosition: Point | null;
  readonly payloadScale: Point | null;
  readonly payloadAlpha: number | null;
  readonly payloadVisible: boolean;
}

export interface Game003MinecartInteractionRuntime {
  readonly container: Container;
  applyLayout(layout: Game003MinecartInteractionLayout): void;
  reset(): void;
  start(feature: Game003BgBarFeature): void;
  startExitIfParked(): boolean;
  clearParkedCart(): void;
  update(deltaSeconds: number): { readonly completed: boolean };
  isPlaying(): boolean;
  getSnapshot(): Game003MinecartInteractionSnapshot;
  destroy(): void;
}

type MinecartPhase = Game003MinecartInteractionSnapshot["phase"];

export function createGame003MinecartInteractionRuntime(
  options: Game003MinecartInteractionRuntimeOptions,
): Game003MinecartInteractionRuntime {
  return new Game003MinecartInteractionRuntimeModel(options);
}

class Game003MinecartInteractionRuntimeModel implements Game003MinecartInteractionRuntime {
  readonly container = new Container();
  readonly #config: Game003MinecartInteractionConfig;
  readonly #cart: Sprite;
  readonly #catalog: ReturnType<typeof createStandaloneSymbolCatalog>;
  #layout: Game003MinecartInteractionLayout | null = null;
  #payload: RenderSymbol | null = null;
  #feature: Game003BgBarFeature | null = null;
  #phase: MinecartPhase = "idle";
  #phaseElapsedSeconds = 0;
  #destroyed = false;

  constructor(options: Game003MinecartInteractionRuntimeOptions) {
    this.#config = options.config;
    assertTextureSize(
      options.minecartTexture,
      this.#config.imageSize,
      "game003 minecart texture",
    );
    this.#cart = new Sprite(options.minecartTexture);
    this.#cart.visible = false;
    this.#cart.pivot.set(
      this.#config.layout.landscape.cartPivotInImage.x,
      this.#config.layout.landscape.cartPivotInImage.y,
    );
    this.container.addChild(this.#cart);
    this.#catalog = createStandaloneSymbolCatalog({
      assets: options.symbolAssets,
      displaySymbols: options.bgBarConfig.displaySymbols,
      symbolScales: options.bgBarConfig.symbolScales,
      animationResolver: options.bgBarConfig.symbolAnimationResolver,
      texturePolicy: {
        requiredStateTextures: [],
      },
    });
    const validation = this.#catalog.getValidation();
    if (validation.ignoredAssetsWithoutPaytable.length > 0) {
      throw new Error(
        `game003 minecart payload has unused symbol assets: ${validation.ignoredAssetsWithoutPaytable.join(", ")}`,
      );
    }
  }

  applyLayout(layout: Game003MinecartInteractionLayout): void {
    this.assertNotDestroyed();
    this.#layout = layout;
    this.#cart.pivot.set(layout.cartPivotInImage.x, layout.cartPivotInImage.y);
    this.renderCurrentFrame();
  }

  reset(): void {
    this.assertNotDestroyed();
    this.clearPayload();
    this.#feature = null;
    this.#phase = "idle";
    this.#phaseElapsedSeconds = 0;
    this.#cart.visible = false;
    this.#cart.rotation = 0;
  }

  start(feature: Game003BgBarFeature): void {
    this.assertNotDestroyed();
    if (feature === "normal") {
      throw new Error(
        "game003 minecart animation is not played for normal bg-bar features.",
      );
    }
    if (!this.#layout) {
      throw new Error("game003 minecart layout must be applied before start.");
    }
    if (this.#phase !== "idle") {
      throw new Error(
        `game003 minecart animation must be idle before start, got "${this.#phase}".`,
      );
    }
    this.clearPayload();
    this.#feature = feature;
    this.#payload = this.#catalog.createRenderSymbol(feature);
    this.#payload.scale.set(
      this.#payload.scale.x * this.#config.payload.symbolScale,
      this.#payload.scale.y * this.#config.payload.symbolScale,
    );
    this.#payload.alpha = this.#config.payload.fadeStartAlpha;
    this.#payload.visible = true;
    this.container.addChild(this.#payload);
    this.#cart.visible = true;
    this.#phase = "cart-rush";
    this.#phaseElapsedSeconds = 0;
    this.renderCurrentFrame();
  }

  startExitIfParked(): boolean {
    this.assertNotDestroyed();
    if (this.isPlaying()) {
      throw new Error(
        `game003 minecart cannot start exit while "${this.#phase}" is in progress.`,
      );
    }
    if (this.#phase !== "parked") {
      return false;
    }
    if (!this.#layout) {
      throw new Error("game003 minecart layout must be applied before exit.");
    }
    this.clearPayload();
    this.#feature = null;
    this.#phase = "cart-exit";
    this.#phaseElapsedSeconds = 0;
    this.#cart.visible = true;
    this.renderCurrentFrame();
    return true;
  }

  clearParkedCart(): void {
    this.assertNotDestroyed();
    if (this.isPlaying()) {
      throw new Error(
        `game003 minecart cannot clear parked cart while "${this.#phase}" is in progress.`,
      );
    }
    if (this.#phase !== "parked") {
      return;
    }
    this.clearPayload();
    this.#feature = null;
    this.#phase = "idle";
    this.#phaseElapsedSeconds = 0;
    this.#cart.visible = false;
    this.#cart.rotation = 0;
  }

  update(deltaSeconds: number): { readonly completed: boolean } {
    this.assertNotDestroyed();
    assertDeltaSeconds(deltaSeconds);
    let remaining = deltaSeconds;
    while (remaining > 0 && this.isPlaying()) {
      const duration = this.getPhaseDurationSeconds();
      const step = Math.min(remaining, duration - this.#phaseElapsedSeconds);
      this.#phaseElapsedSeconds += step;
      this.#payload?.update(step);
      this.renderCurrentFrame();
      remaining -= step;
      if (this.#phaseElapsedSeconds >= duration) {
        this.advancePhase();
      }
    }
    if (remaining === 0) {
      this.#payload?.update(0);
    }
    this.renderCurrentFrame();
    return Object.freeze({ completed: !this.isPlaying() });
  }

  isPlaying(): boolean {
    return (
      this.#phase === "cart-rush" ||
      this.#phase === "symbol-fly" ||
      this.#phase === "symbol-hold" ||
      this.#phase === "cart-exit"
    );
  }

  getSnapshot(): Game003MinecartInteractionSnapshot {
    return Object.freeze({
      phase: this.#phase,
      feature: this.#feature,
      cartPosition: Object.freeze({
        x: this.#cart.position.x,
        y: this.#cart.position.y,
      }),
      cartRotation: this.#cart.rotation,
      cartVisible: this.#cart.visible,
      payloadPosition: this.#payload
        ? Object.freeze({
            x: this.#payload.position.x,
            y: this.#payload.position.y,
          })
        : null,
      payloadScale: this.#payload
        ? Object.freeze({
            x: this.#payload.scale.x,
            y: this.#payload.scale.y,
          })
        : null,
      payloadAlpha: this.#payload ? this.#payload.alpha : null,
      payloadVisible: this.#payload?.visible ?? false,
    });
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.clearPayload();
    this.container.destroy({ children: true });
    this.#phase = "destroyed";
    this.#destroyed = true;
  }

  private advancePhase(): void {
    if (this.#phase === "cart-rush") {
      this.#phase = "symbol-fly";
      this.#phaseElapsedSeconds = 0;
      this.renderCurrentFrame();
      return;
    }
    if (this.#phase === "symbol-fly") {
      this.#phase = "symbol-hold";
      this.#phaseElapsedSeconds = 0;
      this.renderCurrentFrame();
      return;
    }
    if (this.#phase === "symbol-hold") {
      this.#phase = "parked";
      this.#phaseElapsedSeconds = 0;
      if (this.#payload) {
        this.#payload.alpha = this.#config.payload.fadeEndAlpha;
        this.#payload.visible = false;
      }
      this.renderCurrentFrame();
      return;
    }
    if (this.#phase === "cart-exit") {
      this.clearPayload();
      this.#feature = null;
      this.#phase = "idle";
      this.#phaseElapsedSeconds = 0;
      this.#cart.visible = false;
      this.#cart.rotation = 0;
      this.renderCurrentFrame();
    }
  }

  private getPhaseDurationSeconds(): number {
    if (this.#phase === "cart-exit") {
      return this.#config.timing.cartExitDurationSeconds;
    }
    if (this.#phase === "cart-rush") {
      return this.#config.timing.cartRushDurationSeconds;
    }
    if (this.#phase === "symbol-fly") {
      return this.#config.timing.symbolFlyDurationSeconds;
    }
    if (this.#phase === "symbol-hold") {
      return this.#config.timing.symbolHoldDurationSeconds;
    }
    throw new Error(`game003 minecart phase "${this.#phase}" is not playing.`);
  }

  private renderCurrentFrame(): void {
    if (!this.#layout) {
      return;
    }
    if (this.#phase === "cart-rush") {
      const progress = clamp01(
        this.#phaseElapsedSeconds / this.#config.timing.cartRushDurationSeconds,
      );
      const cartPosition = getCartRushPosition({
        layout: this.#layout,
        progress,
        overshootPixels: this.#config.motion.overshootPixels,
      });
      this.#cart.position.set(cartPosition.x, cartPosition.y);
      this.#cart.rotation = getCartRushRotation({
        progress,
        brakeTiltDegrees: this.#config.motion.brakeTiltDegrees,
        reboundTiltDegrees: this.#config.motion.reboundTiltDegrees,
        direction: getRushDirection(this.#layout),
      });
      this.#cart.visible = true;
      if (this.#payload) {
        this.#payload.position.set(
          cartPosition.x +
            this.#layout.payloadAnchorInImage.x -
            this.#layout.cartPivotInImage.x,
          cartPosition.y +
            this.#layout.payloadAnchorInImage.y -
            this.#layout.cartPivotInImage.y,
        );
        this.#payload.alpha = this.#config.payload.fadeStartAlpha;
        this.#payload.visible = true;
      }
      return;
    }
    if (this.#phase === "cart-exit") {
      const progress = clamp01(
        this.#phaseElapsedSeconds / this.#config.timing.cartExitDurationSeconds,
      );
      const cartPosition = lerpPoint(
        this.#layout.cartStopCenter,
        this.#layout.cartExitCenter,
        easeInCubic(progress),
      );
      this.#cart.position.set(cartPosition.x, cartPosition.y);
      this.#cart.rotation = 0;
      this.#cart.visible = true;
      if (this.#payload) {
        this.#payload.visible = false;
        this.#payload.alpha = this.#config.payload.fadeEndAlpha;
      }
      return;
    }
    this.#cart.position.set(
      this.#layout.cartStopCenter.x,
      this.#layout.cartStopCenter.y,
    );
    this.#cart.rotation = 0;
    this.#cart.visible =
      this.#phase === "symbol-fly" ||
      this.#phase === "symbol-hold" ||
      this.#phase === "parked";
    if (this.#phase === "symbol-fly" && this.#payload) {
      const progress = clamp01(
        this.#phaseElapsedSeconds /
          this.#config.timing.symbolFlyDurationSeconds,
      );
      const eased = easeOutCubic(progress);
      const payloadPosition = lerpPoint(
        this.#layout.payloadStartCenter,
        this.#layout.payloadTargetCenter,
        eased,
      );
      this.#payload.position.set(payloadPosition.x, payloadPosition.y);
      this.#payload.alpha = lerp(
        this.#config.payload.fadeStartAlpha,
        getPayloadFlightEndAlpha(this.#config.payload.fadeStartAlpha),
        progress,
      );
      this.#payload.visible = true;
      return;
    }
    if (this.#phase === "symbol-hold" && this.#payload) {
      this.#payload.position.set(
        this.#layout.payloadTargetCenter.x,
        this.#layout.payloadTargetCenter.y,
      );
      this.#payload.alpha = Math.max(
        this.#config.payload.fadeStartAlpha * 0.9,
        getPayloadFlightEndAlpha(this.#config.payload.fadeStartAlpha),
      );
      this.#payload.visible = true;
      return;
    }
    if (this.#phase === "parked" && this.#payload) {
      this.#payload.position.set(
        this.#layout.payloadTargetCenter.x,
        this.#layout.payloadTargetCenter.y,
      );
      this.#payload.alpha = this.#config.payload.fadeEndAlpha;
      this.#payload.visible = false;
    }
  }

  private clearPayload(): void {
    if (this.#payload) {
      this.container.removeChild(this.#payload);
      this.#payload.destroy({ children: true });
      this.#payload = null;
    }
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error("game003 minecart runtime was destroyed.");
    }
  }
}

function getCartRushPosition(options: {
  readonly layout: Game003MinecartInteractionLayout;
  readonly progress: number;
  readonly overshootPixels: number;
}): Point {
  const direction = getRushDirection(options.layout);
  const overshoot = Object.freeze({
    x: options.layout.cartStopCenter.x + direction * options.overshootPixels,
    y: options.layout.cartStopCenter.y,
  });
  const rebound = Object.freeze({
    x:
      options.layout.cartStopCenter.x -
      direction * options.overshootPixels * 0.28,
    y: options.layout.cartStopCenter.y,
  });
  if (options.progress <= 0.72) {
    return lerpPoint(
      options.layout.cartStartCenter,
      overshoot,
      easeOutCubic(options.progress / 0.72),
    );
  }
  if (options.progress <= 0.88) {
    return lerpPoint(
      overshoot,
      rebound,
      easeOutCubic((options.progress - 0.72) / 0.16),
    );
  }
  return lerpPoint(
    rebound,
    options.layout.cartStopCenter,
    easeOutCubic((options.progress - 0.88) / 0.12),
  );
}

function getCartRushRotation(options: {
  readonly progress: number;
  readonly brakeTiltDegrees: number;
  readonly reboundTiltDegrees: number;
  readonly direction: number;
}): number {
  if (options.progress <= 0.72) {
    return degreesToRadians(
      options.direction * options.brakeTiltDegrees * 0.25 * options.progress,
    );
  }
  if (options.progress <= 0.88) {
    const progress = (options.progress - 0.72) / 0.16;
    return degreesToRadians(
      options.direction *
        lerp(options.brakeTiltDegrees, options.reboundTiltDegrees, progress),
    );
  }
  const progress = (options.progress - 0.88) / 0.12;
  return degreesToRadians(
    options.direction * lerp(options.reboundTiltDegrees, 0, progress),
  );
}

function getRushDirection(layout: Game003MinecartInteractionLayout): number {
  return layout.cartStartCenter.x <= layout.cartStopCenter.x ? 1 : -1;
}

function lerpPoint(from: Point, to: Point, progress: number): Point {
  return Object.freeze({
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress),
  });
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function easeOutCubic(progress: number): number {
  const normalized = clamp01(progress);
  return 1 - (1 - normalized) ** 3;
}

function easeInCubic(progress: number): number {
  const normalized = clamp01(progress);
  return normalized ** 3;
}

function getPayloadFlightEndAlpha(fadeStartAlpha: number): number {
  return fadeStartAlpha * 0.95;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function assertTextureSize(
  texture: Texture,
  expected: { readonly width: number; readonly height: number },
  label: string,
): void {
  const width =
    texture.width || texture.source?.width || texture.orig?.width || 0;
  const height =
    texture.height || texture.source?.height || texture.orig?.height || 0;
  if (width !== expected.width || height !== expected.height) {
    throw new Error(
      `${label} size must be ${expected.width} x ${expected.height}, got ${width} x ${height}.`,
    );
  }
}

function assertDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error(
      "game003 minecart deltaSeconds must be a finite non-negative number.",
    );
  }
}
