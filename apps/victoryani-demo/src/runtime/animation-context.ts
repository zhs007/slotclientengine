import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type gsap from "gsap";
import type { AnimParamValue, AnimParams, VictoryLayerConfig } from "../config/victory-types.js";
import type { LayerInstance } from "./layer-instance.js";

export interface AnimationRuntimeContext {
  layer: VictoryLayerConfig;
  instance: LayerInstance;
  container: Container;
  target: Container;
  duration: number;
  params: AnimParams;
  registerCleanup: (cleanup: () => void) => void;
  timelineFactory: typeof gsap.timeline;
}

export function getNumberParam(params: AnimParams, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function getStringParam(params: AnimParams, key: string, fallback: string) {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

export function getBooleanParam(params: AnimParams, key: string, fallback: boolean) {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

export function getNullableNumberParam(params: AnimParams, key: string) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getTextureFromTarget(target: Container) {
  const spriteTexture = (target as Sprite & { texture?: Texture }).texture;
  return spriteTexture ?? Texture.WHITE;
}

export function createParticleSprite(target: Container) {
  const particle = new Sprite(getTextureFromTarget(target));
  particle.anchor.set(0.5);
  return particle;
}

export function createSolidParticle(size: number, alpha = 1) {
  const particle = new Graphics();
  particle.circle(0, 0, size);
  particle.fill({ color: 0xffffff, alpha });
  return particle;
}

export function removeDisplayObject(child: Container | null | undefined) {
  if (!child) {
    return;
  }

  child.parent?.removeChild(child);
  const destroyable = child as Container & { destroyed?: boolean; destroy?: (options?: object) => void };
  if (!destroyable.destroyed && typeof destroyable.destroy === "function") {
    destroyable.destroy({ children: true });
  }
}

export function createNoiseCanvas(noiseSize: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const gridSize = Math.max(2, Math.floor(noiseSize));

  for (let x = 0; x < canvas.width; x += gridSize) {
    for (let y = 0; y < canvas.height; y += gridSize) {
      const channel = Math.floor(Math.random() * 255);
      context.fillStyle = `rgb(${channel},${channel},${channel})`;
      context.fillRect(x, y, gridSize, gridSize);
    }
  }

  context.filter = `blur(${gridSize}px)`;
  context.drawImage(canvas, 0, 0);

  return canvas;
}

export function toRadians(value: AnimParamValue, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}