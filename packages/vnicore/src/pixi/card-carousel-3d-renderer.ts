import * as PIXI from "pixi.js";
import { toPixiBlendMode } from "./blend-mode.js";
import {
  createCardCarousel3DSampleBuffer,
  prepareCardCarousel3D,
  sampleCardCarousel3D,
  type VNICardCarousel3DPreparedConfig,
  type VNICardCarousel3DSampleBuffer,
  type VNICardCarousel3DSampleInput,
  type VNICardCarousel3DTextureInfo,
} from "../core/card-carousel-3d.js";
import type { V5GAnimationConfig } from "../core/types.js";

export interface VNICardCarousel3DPixiRuntimeStats {
  readonly cardContainersCreated: number;
  readonly sliceSpritesCreated: number;
  readonly sliceTexturesCreated: number;
  readonly visibleCards: number;
  readonly visibleSlices: number;
}

interface VNICardCarouselCardDisplay {
  readonly container: PIXI.Container;
  readonly sprites: PIXI.Sprite[];
}

export class VNICardCarousel3DPixiRuntime {
  readonly root = new PIXI.Container();
  readonly prepared: VNICardCarousel3DPreparedConfig;
  readonly output: VNICardCarousel3DSampleBuffer;
  private readonly cards: VNICardCarouselCardDisplay[];
  private readonly textureInfos: readonly VNICardCarousel3DTextureInfo[];
  private readonly sampleInput: VNICardCarousel3DSampleInput;
  private destroyed = false;

  constructor(
    animation: V5GAnimationConfig,
    textures: readonly PIXI.Texture[],
    getSliceTexture: (
      texture: PIXI.Texture,
      slices: number,
      sliceIndex: number,
    ) => PIXI.Texture,
  ) {
    if (textures.length === 0) {
      throw new Error(
        `VNI card_carousel_3d animation "${animation.id}" requires a non-empty texture library.`,
      );
    }
    this.prepared = prepareCardCarousel3D(animation);
    this.output = createCardCarousel3DSampleBuffer(this.prepared);
    this.textureInfos = textures.map(getTextureInfo);
    this.sampleInput = {
      progress: 0,
      emitterX: 0,
      emitterY: 0,
      layerOpacity: 0,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      },
      blendMode: "normal",
      textures: this.textureInfos,
    };
    this.root.label = `VNI card_carousel_3d ${animation.id}`;
    this.root.visible = false;
    this.cards = new Array<VNICardCarouselCardDisplay>(this.prepared.cardCount);
    for (
      let cardIndex = 0;
      cardIndex < this.prepared.cardCount;
      cardIndex += 1
    ) {
      const container = new PIXI.Container();
      container.label = `VNI card_carousel_3d ${animation.id} card ${cardIndex}`;
      container.visible = false;
      const sprites = new Array<PIXI.Sprite>(this.prepared.slices);
      const texture = textures[cardIndex % textures.length];
      for (
        let sliceIndex = 0;
        sliceIndex < this.prepared.slices;
        sliceIndex += 1
      ) {
        const sprite = new PIXI.Sprite(
          getSliceTexture(texture, this.prepared.slices, sliceIndex),
        );
        sprite.anchor.set(0.5);
        sprite.label = `${container.label} slice ${sliceIndex}`;
        sprites[sliceIndex] = sprite;
        container.addChild(sprite);
      }
      this.cards[cardIndex] = { container, sprites };
      this.root.addChild(container);
    }
  }

  render(
    progress: number,
    emitterX: number,
    emitterY: number,
    layerOpacity: number,
    transform: VNICardCarousel3DSampleInput["transform"],
    blendMode: VNICardCarousel3DSampleInput["blendMode"],
  ): number {
    this.assertAlive();
    this.sampleInput.progress = progress;
    this.sampleInput.emitterX = emitterX;
    this.sampleInput.emitterY = emitterY;
    this.sampleInput.layerOpacity = layerOpacity;
    this.sampleInput.transform = transform;
    this.sampleInput.blendMode = blendMode;
    sampleCardCarousel3D(this.prepared, this.sampleInput, this.output);
    this.root.visible = true;
    this.root.blendMode = toPixiBlendMode(blendMode);
    for (const card of this.cards) card.container.visible = false;
    for (
      let drawIndex = 0;
      drawIndex < this.output.visibleCardCount;
      drawIndex += 1
    ) {
      const cardIndex = this.output.drawOrder[drawIndex];
      const sample = this.output.cards[cardIndex];
      const display = this.cards[cardIndex];
      display.container.visible = true;
      display.container.position.set(sample.x, sample.y);
      display.container.rotation = sample.rotation;
      display.container.alpha = sample.alpha;
      display.container.blendMode = toPixiBlendMode(blendMode);
      for (
        let sliceIndex = 0;
        sliceIndex < this.prepared.slices;
        sliceIndex += 1
      ) {
        const slice = sample.slices[sliceIndex];
        const sprite = display.sprites[sliceIndex];
        sprite.position.set(slice.x, slice.y);
        sprite.scale.set(slice.scaleX, slice.scaleY);
        sprite.tint = slice.tint;
        sprite.alpha = 1;
        sprite.visible = true;
        sprite.blendMode = toPixiBlendMode(blendMode);
      }
      this.root.addChild(display.container);
    }
    return this.output.visibleCardCount;
  }

  hide(): void {
    if (this.destroyed) return;
    this.root.visible = false;
    for (const card of this.cards) card.container.visible = false;
  }

  getStats(sliceTexturesCreated: number): VNICardCarousel3DPixiRuntimeStats {
    return {
      cardContainersCreated: this.cards.length,
      sliceSpritesCreated: this.cards.length * this.prepared.slices,
      sliceTexturesCreated,
      visibleCards: this.root.visible ? this.output.visibleCardCount : 0,
      visibleSlices: this.root.visible
        ? this.output.visibleCardCount * this.prepared.slices
        : 0,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.parent?.removeChild(this.root);
    this.root.destroy({ children: true });
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error(
        `VNI card_carousel_3d animation "${this.prepared.animationId}" runtime is destroyed.`,
      );
    }
  }
}

export class VNICardCarousel3DPixiRenderer {
  private readonly sliceTextures = new Map<string, PIXI.Texture>();
  private readonly textureIds = new WeakMap<PIXI.Texture, number>();
  private readonly runtimes = new Set<VNICardCarousel3DPixiRuntime>();
  private nextTextureId = 1;
  private sliceTextureCreateCount = 0;

  createRuntime(
    animation: V5GAnimationConfig,
    textures: readonly PIXI.Texture[],
  ): VNICardCarousel3DPixiRuntime {
    const runtime = new VNICardCarousel3DPixiRuntime(
      animation,
      textures,
      (texture, slices, sliceIndex) =>
        this.getSliceTexture(texture, slices, sliceIndex),
    );
    this.runtimes.add(runtime);
    return runtime;
  }

  getStats(): VNICardCarousel3DPixiRuntimeStats {
    let cardContainersCreated = 0;
    let sliceSpritesCreated = 0;
    let visibleCards = 0;
    let visibleSlices = 0;
    for (const runtime of this.runtimes) {
      const stats = runtime.getStats(this.sliceTextureCreateCount);
      cardContainersCreated += stats.cardContainersCreated;
      sliceSpritesCreated += stats.sliceSpritesCreated;
      visibleCards += stats.visibleCards;
      visibleSlices += stats.visibleSlices;
    }
    return {
      cardContainersCreated,
      sliceSpritesCreated,
      sliceTexturesCreated: this.sliceTextureCreateCount,
      visibleCards,
      visibleSlices,
    };
  }

  destroy(): void {
    for (const runtime of this.runtimes) runtime.destroy();
    this.runtimes.clear();
    for (const texture of this.sliceTextures.values()) texture.destroy(false);
    this.sliceTextures.clear();
  }

  private getSliceTexture(
    texture: PIXI.Texture,
    slices: number,
    sliceIndex: number,
  ): PIXI.Texture {
    const frame = texture.frame;
    const key = [
      this.getTextureId(texture),
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      texture.width,
      texture.height,
      slices,
      sliceIndex,
    ].join(":");
    const cached = this.sliceTextures.get(key);
    if (cached) return cached;
    const x0 = (sliceIndex / slices) * texture.width;
    const x1 = ((sliceIndex + 1) / slices) * texture.width;
    const sliceWidth = Math.max(1, x1 - x0);
    const slice = new PIXI.Texture({
      source: texture.source,
      frame: new PIXI.Rectangle(
        frame.x + (x0 / texture.width) * frame.width,
        frame.y,
        Math.max(1, (sliceWidth / texture.width) * frame.width),
        frame.height,
      ),
    });
    this.sliceTextures.set(key, slice);
    this.sliceTextureCreateCount += 1;
    return slice;
  }

  private getTextureId(texture: PIXI.Texture): number {
    const existing = this.textureIds.get(texture);
    if (existing !== undefined) return existing;
    const id = this.nextTextureId;
    this.nextTextureId += 1;
    this.textureIds.set(texture, id);
    return id;
  }
}

function getTextureInfo(texture: PIXI.Texture): VNICardCarousel3DTextureInfo {
  return {
    width: Math.max(1, Number(texture.width) || 1),
    height: Math.max(1, Number(texture.height) || 1),
    frameX: texture.frame.x,
    frameY: texture.frame.y,
    frameWidth: Math.max(1, texture.frame.width),
    frameHeight: Math.max(1, texture.frame.height),
  };
}
