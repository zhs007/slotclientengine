import * as PIXI from "pixi.js";
import { toPixiBlendMode } from "./blend-mode.js";
import {
  createCardCarousel3DSampleBuffer,
  prepareCardCarousel3D,
  sampleCardCarousel3D,
  type VNICardCarousel3DPreparedConfig,
  type VNICardCarousel3DMotionSample,
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
  private readonly sourceTextures: PIXI.Texture[];
  private readonly textureInfos: VNICardCarousel3DTextureInfo[];
  private readonly sampleInput: VNICardCarousel3DSampleInput;
  private readonly acquireSliceTexture: (
    texture: PIXI.Texture,
    slices: number,
    sliceIndex: number,
  ) => PIXI.Texture;
  private readonly releaseSliceTexture: (
    texture: PIXI.Texture,
    slices: number,
    sliceIndex: number,
  ) => void;
  private destroyed = false;

  constructor(
    animation: V5GAnimationConfig,
    textures: readonly PIXI.Texture[],
    acquireSliceTexture: (
      texture: PIXI.Texture,
      slices: number,
      sliceIndex: number,
    ) => PIXI.Texture,
    releaseSliceTexture: (
      texture: PIXI.Texture,
      slices: number,
      sliceIndex: number,
    ) => void,
  ) {
    if (textures.length === 0) {
      throw new Error(
        `VNI card_carousel_3d animation "${animation.id}" requires a non-empty texture library.`,
      );
    }
    for (const texture of textures) assertValidTexture(texture);
    this.prepared = prepareCardCarousel3D(animation);
    this.output = createCardCarousel3DSampleBuffer(this.prepared);
    this.acquireSliceTexture = acquireSliceTexture;
    this.releaseSliceTexture = releaseSliceTexture;
    this.sourceTextures = Array.from(
      { length: this.prepared.cardCount },
      (_, cardIndex) => textures[cardIndex % textures.length],
    );
    this.textureInfos = this.sourceTextures.map(getTextureInfo);
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
      const texture = this.sourceTextures[cardIndex];
      for (
        let sliceIndex = 0;
        sliceIndex < this.prepared.slices;
        sliceIndex += 1
      ) {
        const sprite = new PIXI.Sprite(
          acquireSliceTexture(texture, this.prepared.slices, sliceIndex),
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
    this.sampleInput.motion = undefined;
    return this.renderSample(
      progress,
      emitterX,
      emitterY,
      layerOpacity,
      transform,
      blendMode,
    );
  }

  renderControlled(
    motion: VNICardCarousel3DMotionSample,
    emitterX: number,
    emitterY: number,
    layerOpacity: number,
    transform: VNICardCarousel3DSampleInput["transform"],
    blendMode: VNICardCarousel3DSampleInput["blendMode"],
  ): number {
    this.assertAlive();
    this.sampleInput.motion = motion;
    return this.renderSample(
      0,
      emitterX,
      emitterY,
      layerOpacity,
      transform,
      blendMode,
    );
  }

  getCarrierTextures(): readonly PIXI.Texture[] {
    this.assertAlive();
    return [...this.sourceTextures];
  }

  replaceCarrierTexture(carrierIndex: number, texture: PIXI.Texture): void {
    this.assertAlive();
    if (
      !Number.isSafeInteger(carrierIndex) ||
      carrierIndex < 0 ||
      carrierIndex >= this.prepared.cardCount
    ) {
      throw new Error(
        `VNI card_carousel_3d carrierIndex must be within 0..${this.prepared.cardCount - 1}.`,
      );
    }
    assertValidTexture(texture);
    const previous = this.sourceTextures[carrierIndex];
    if (previous === texture) return;
    const nextSlices = new Array<PIXI.Texture>(this.prepared.slices);
    try {
      for (
        let sliceIndex = 0;
        sliceIndex < this.prepared.slices;
        sliceIndex += 1
      ) {
        nextSlices[sliceIndex] = this.acquireSliceTexture(
          texture,
          this.prepared.slices,
          sliceIndex,
        );
      }
    } catch (error) {
      for (
        let sliceIndex = 0;
        sliceIndex < nextSlices.length;
        sliceIndex += 1
      ) {
        if (nextSlices[sliceIndex]) {
          this.releaseSliceTexture(texture, this.prepared.slices, sliceIndex);
        }
      }
      throw error;
    }
    const display = this.cards[carrierIndex];
    for (
      let sliceIndex = 0;
      sliceIndex < this.prepared.slices;
      sliceIndex += 1
    ) {
      display.sprites[sliceIndex].texture = nextSlices[sliceIndex];
      this.releaseSliceTexture(previous, this.prepared.slices, sliceIndex);
    }
    this.sourceTextures[carrierIndex] = texture;
    this.textureInfos[carrierIndex] = getTextureInfo(texture);
  }

  isCarrierSafeToReplace(carrierIndex: number): boolean {
    this.assertAlive();
    if (
      !Number.isSafeInteger(carrierIndex) ||
      carrierIndex < 0 ||
      carrierIndex >= this.prepared.cardCount
    ) {
      throw new Error(
        `VNI card_carousel_3d carrierIndex must be within 0..${this.prepared.cardCount - 1}.`,
      );
    }
    return !this.root.visible || !this.output.cards[carrierIndex].visible;
  }

  canEverHideCarrier(): boolean {
    return this.prepared.hideBack || this.prepared.visibleRange < 1;
  }

  private renderSample(
    progress: number,
    emitterX: number,
    emitterY: number,
    layerOpacity: number,
    transform: VNICardCarousel3DSampleInput["transform"],
    blendMode: VNICardCarousel3DSampleInput["blendMode"],
  ): number {
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
    for (
      let carrierIndex = 0;
      carrierIndex < this.sourceTextures.length;
      carrierIndex += 1
    ) {
      for (
        let sliceIndex = 0;
        sliceIndex < this.prepared.slices;
        sliceIndex += 1
      ) {
        this.releaseSliceTexture(
          this.sourceTextures[carrierIndex],
          this.prepared.slices,
          sliceIndex,
        );
      }
    }
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
  private readonly sliceTextures = new Map<
    string,
    { texture: PIXI.Texture; refs: number }
  >();
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
        this.acquireSliceTexture(texture, slices, sliceIndex),
      (texture, slices, sliceIndex) =>
        this.releaseSliceTexture(texture, slices, sliceIndex),
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
    for (const entry of this.sliceTextures.values()) {
      entry.texture.destroy(false);
    }
    this.sliceTextures.clear();
  }

  private acquireSliceTexture(
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
    if (cached) {
      cached.refs += 1;
      return cached.texture;
    }
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
    this.sliceTextures.set(key, { texture: slice, refs: 1 });
    this.sliceTextureCreateCount += 1;
    return slice;
  }

  private releaseSliceTexture(
    texture: PIXI.Texture,
    slices: number,
    sliceIndex: number,
  ): void {
    const key = this.getSliceTextureKey(texture, slices, sliceIndex);
    const cached = this.sliceTextures.get(key);
    if (!cached) {
      throw new Error("VNI card carousel slice texture reference is missing.");
    }
    cached.refs -= 1;
    if (cached.refs < 0) {
      throw new Error("VNI card carousel slice texture refcount is negative.");
    }
    if (cached.refs === 0) {
      cached.texture.destroy(false);
      this.sliceTextures.delete(key);
    }
  }

  private getSliceTextureKey(
    texture: PIXI.Texture,
    slices: number,
    sliceIndex: number,
  ): string {
    const frame = texture.frame;
    return [
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

function assertValidTexture(texture: PIXI.Texture): void {
  if (
    !texture ||
    !texture.source ||
    !texture.frame ||
    !Number.isFinite(texture.width) ||
    !Number.isFinite(texture.height) ||
    texture.width <= 0 ||
    texture.height <= 0 ||
    !Number.isFinite(texture.frame.x) ||
    !Number.isFinite(texture.frame.y) ||
    !Number.isFinite(texture.frame.width) ||
    !Number.isFinite(texture.frame.height) ||
    texture.frame.width <= 0 ||
    texture.frame.height <= 0
  ) {
    throw new Error(
      "VNI cyclic-selection texture must have a valid source and finite positive dimensions/frame.",
    );
  }
}
