import * as PIXI from "pixi.js";
import gsap from "gsap";
import {
  clampNumber,
  editorToPixi,
  pixiToEditor,
  roundTo,
} from "./coordinates";
import {
  isLayerEffectivelyVisible,
  normalizeProjectLayerGroups,
} from "./project_state";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GEditorState,
  V5GLayerConfig,
  V5GRuntimeAsset,
  V5GViewportState,
} from "./types";

interface RenderCallbacks {
  onSelectLayer: (layerId: string) => void;
  onClearSelection: () => void;
  onLayerMoveStart: (layerId: string) => void;
  onLayerMove: (layerId: string, x: number, y: number) => void;
  onCursorMove: (x: number, y: number) => void;
  onViewportChange: (viewport: V5GViewportState) => void;
}

const MIN_VIEW_SCALE = 0.05;
const MAX_VIEW_SCALE = 8;
const WHEEL_ZOOM_STEP = 1.12;

export class V5GPixiStage {
  private readonly app = new PIXI.Application();
  private readonly root = new PIXI.Container();
  private readonly stageContainer = new PIXI.Container();
  private readonly contentContainer = new PIXI.Container();
  private readonly guideGraphics = new PIXI.Graphics();
  private readonly selectionGraphics = new PIXI.Graphics();
  private readonly layerDisplayMap = new Map<string, PIXI.Container>();
  private readonly layerParticleMap = new Map<string, PIXI.Container>();
  private readonly layerAssetIdMap = new Map<string, string | null>();
  private readonly callbacks: RenderCallbacks;
  private state: V5GEditorState;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private fitScale = 1;
  private viewScale = 1;
  private viewOffsetX = 0;
  private viewOffsetY = 0;
  private draggingLayerId: string | null = null;
  private playTimeline: gsap.core.Timeline | null = null;

  constructor(
    container: HTMLElement,
    state: V5GEditorState,
    callbacks: RenderCallbacks,
  ) {
    this.container = container;
    this.state = state;
    this.callbacks = callbacks;
  }

  async init(): Promise<void> {
    await this.app.init({
      backgroundColor: 0x050505,
      resizeTo: this.container,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    this.container.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root);
    this.root.addChild(this.stageContainer);
    this.stageContainer.addChild(
      this.guideGraphics,
      this.contentContainer,
      this.selectionGraphics,
    );

    this.app.stage.eventMode = "static";
    this.app.stage.cursor = "default";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointermove", (event) =>
      this.handleStagePointerMove(event),
    );
    this.app.stage.on("pointerdown", (event) => this.handlePanStart(event));
    this.container.addEventListener("wheel", this.handleWheel, {
      passive: false,
    });

    this.resizeObserver = new ResizeObserver(() => this.resize(false));
    this.resizeObserver.observe(this.container);
    this.resize(true);
    await this.render(this.state);
  }

  async render(nextState: V5GEditorState): Promise<void> {
    this.state = nextState;
    normalizeProjectLayerGroups(this.state.project);
    await this.syncLayers();
    this.drawGuides();
    this.drawParticles();
    this.drawSelection();
  }

  resize(recenter = false): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.app.renderer.resize(width, height);
    this.app.stage.hitArea = this.app.screen;

    this.fitScale = this.calculateFitScale();

    if (recenter) {
      this.viewScale = this.fitScale;
      this.viewOffsetX = 0;
      this.viewOffsetY = 0;
    } else if (!Number.isFinite(this.viewScale) || this.viewScale <= 0) {
      this.viewScale = this.fitScale;
    }

    this.applyViewTransform();
    this.drawGuides();
    this.drawSelection();
    this.notifyViewportChange();
  }

  resetView(): void {
    this.resize(true);
    this.notifyViewportChange();
  }

  getViewportState(): V5GViewportState {
    return {
      scale: this.viewScale,
      offsetX: this.viewOffsetX,
      offsetY: this.viewOffsetY,
    };
  }

  setViewportState(viewport: V5GViewportState | null): void {
    this.fitScale = this.calculateFitScale();
    this.viewScale = clampViewportScale(viewport?.scale ?? this.fitScale);
    this.viewOffsetX = sanitizeViewportNumber(viewport?.offsetX ?? 0);
    this.viewOffsetY = sanitizeViewportNumber(viewport?.offsetY ?? 0);
    this.applyViewTransform();
    this.drawGuides();
    this.drawSelection();
    this.notifyViewportChange();
  }

  setViewportScale(scale: number): void {
    this.viewScale = clampViewportScale(scale);
    this.applyViewTransform();
    this.drawParticles();
    this.drawSelection();
    this.notifyViewportChange();
  }

  playDemo(): void {
    this.stopDemo();
    this.playTimeline = gsap.timeline();
    for (const layer of this.state.project.layers) {
      if (!isLayerEffectivelyVisible(this.state.project, layer)) continue;
      const display = this.layerDisplayMap.get(layer.id);
      if (!display) continue;
      this.playTimeline.fromTo(
        display.scale,
        { x: layer.transform.scaleX * 0.2, y: layer.transform.scaleY * 0.2 },
        {
          x: layer.transform.scaleX,
          y: layer.transform.scaleY,
          duration: 0.65,
          ease: "back.out(1.8)",
        },
        0,
      );
      this.playTimeline.fromTo(
        display,
        { alpha: 0 },
        { alpha: layer.opacity, duration: 0.45 },
        0,
      );
    }
  }

  stopDemo(): void {
    if (this.playTimeline) {
      this.playTimeline.kill();
      this.playTimeline = null;
    }
    for (const layer of this.state.project.layers) {
      this.applyLayerTransform(layer);
    }
  }

  destroy(): void {
    this.stopDemo();
    this.resizeObserver?.disconnect();
    this.container.removeEventListener("wheel", this.handleWheel);
    this.app.destroy(true);
  }

  private calculateFitScale(): number {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const stage = this.state.project.stage;
    const padding = 72;
    const scale = Math.min(
      (width - padding) / stage.width,
      (height - padding) / stage.height,
      1.2,
    );
    if (!Number.isFinite(scale) || scale <= 0) return 1;
    return clampViewportScale(scale);
  }

  private applyViewTransform(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const stage = this.state.project.stage;
    this.root.position.set(
      width / 2 + this.viewOffsetX,
      height / 2 + this.viewOffsetY,
    );
    this.stageContainer.scale.set(this.viewScale);
    this.stageContainer.pivot.set(stage.width / 2, stage.height / 2);
    this.stageContainer.position.set(0, 0);
  }

  private notifyViewportChange(): void {
    this.callbacks.onViewportChange(this.getViewportState());
  }

  private async syncLayers(): Promise<void> {
    const liveLayerIds = new Set(
      this.state.project.layers.map((layer) => layer.id),
    );
    for (const [layerId, display] of this.layerDisplayMap) {
      if (!liveLayerIds.has(layerId)) {
        display.destroy({ children: true });
        this.layerDisplayMap.delete(layerId);
        const particleGroup = this.layerParticleMap.get(layerId);
        particleGroup?.destroy({ children: true });
        this.layerParticleMap.delete(layerId);
        this.layerAssetIdMap.delete(layerId);
      }
    }

    for (const layer of this.state.project.layers) {
      let display = this.layerDisplayMap.get(layer.id);
      const shouldRecreateImageDisplay =
        layer.type === "image" &&
        display !== undefined &&
        this.layerAssetIdMap.get(layer.id) !== layer.assetId;
      if (shouldRecreateImageDisplay && display) {
        display.destroy({ children: true });
        this.layerDisplayMap.delete(layer.id);
        const particleGroup = this.layerParticleMap.get(layer.id);
        particleGroup?.destroy({ children: true });
        this.layerParticleMap.delete(layer.id);
        this.layerAssetIdMap.delete(layer.id);
        display = undefined;
      }
      if (!display) {
        display = await this.createLayerDisplay(layer);
        this.layerDisplayMap.set(layer.id, display);
        this.layerAssetIdMap.set(layer.id, layer.assetId);
        this.contentContainer.addChild(display);
      } else if (layer.type === "text") {
        const textNode = display.children[0];
        if (textNode instanceof PIXI.Text) {
          textNode.text = layer.text ?? layer.name;
        }
      }
      this.applyLayerTransform(layer);
      if (layer.type === "image") {
        this.ensureParticleGroup(layer.id);
      }
    }

    for (const layer of this.state.project.layers) {
      const display = this.layerDisplayMap.get(layer.id);
      if (display) {
        this.contentContainer.addChild(display);
        const particleGroup = this.layerParticleMap.get(layer.id);
        if (particleGroup) this.contentContainer.addChild(particleGroup);
      }
    }
  }

  private ensureParticleGroup(layerId: string): PIXI.Container {
    let particleGroup = this.layerParticleMap.get(layerId);
    if (!particleGroup || particleGroup.destroyed) {
      particleGroup = new PIXI.Container();
      particleGroup.eventMode = "none";
      this.layerParticleMap.set(layerId, particleGroup);
    }
    return particleGroup;
  }

  private async createLayerDisplay(
    layer: V5GLayerConfig,
  ): Promise<PIXI.Container> {
    const display = new PIXI.Container();
    display.eventMode = layer.locked ? "none" : "static";
    display.cursor = layer.locked ? "default" : "pointer";
    display.on("pointerdown", (event) =>
      this.handleLayerPointerDown(event, layer.id),
    );

    if (layer.type === "image") {
      const runtimeAsset = this.findRuntimeAsset(layer.assetId);
      const asset = this.findProjectAsset(layer.assetId);
      if (runtimeAsset) {
        const texture = await this.loadImageTexture(runtimeAsset);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(layer.transform.anchorX, layer.transform.anchorY);
        const compensation = getAssetDisplayCompensation(asset, texture);
        sprite.scale.set(compensation.x, compensation.y);
        display.addChild(sprite);
      } else {
        display.addChild(this.createMissingAssetBox(layer.name));
      }
    } else if (layer.type === "text") {
      const text = new PIXI.Text({
        text: layer.text ?? layer.name,
        style: {
          fill: 0xf4f4f5,
          fontFamily: "Arial, sans-serif",
          fontSize: 64,
          fontWeight: "700",
          stroke: { color: 0x27272a, width: 4 },
          dropShadow: {
            color: 0x000000,
            blur: 8,
            distance: 4,
            alpha: 0.5,
          },
        },
      });
      text.anchor.set(layer.transform.anchorX, layer.transform.anchorY);
      display.addChild(text);
    } else {
      display.addChild(this.createMissingAssetBox(layer.name));
    }

    return display;
  }

  private loadImageTexture(
    runtimeAsset: V5GRuntimeAsset,
  ): Promise<PIXI.Texture> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(PIXI.Texture.from(image));
      image.onerror = () => reject(new Error("图片纹理加载失败"));
      image.src = runtimeAsset.objectUrl;
    });
  }

  private createMissingAssetBox(label: string): PIXI.Container {
    const container = new PIXI.Container();
    const graphics = new PIXI.Graphics();
    graphics
      .roundRect(-80, -30, 160, 60, 12)
      .fill(0x18181b)
      .stroke({ color: 0x71717a, width: 2 });
    const text = new PIXI.Text({
      text: label || "Layer",
      style: { fill: 0xd4d4d8, fontSize: 16, fontFamily: "Arial" },
    });
    text.anchor.set(0.5);
    container.addChild(graphics, text);
    return container;
  }

  private applyLayerTransform(layer: V5GLayerConfig): void {
    const display = this.layerDisplayMap.get(layer.id);
    if (!display) return;
    const stage = this.state.project.stage;
    const previewLayer = this.state.previewLayers?.[layer.id];
    const transform = previewLayer?.transform ?? layer.transform;
    const opacity = previewLayer?.opacity ?? layer.opacity;
    const position = editorToPixi(
      transform.x,
      transform.y,
      stage.width,
      stage.height,
    );
    display.position.set(position.x, position.y);
    display.scale.set(transform.scaleX, transform.scaleY);
    display.rotation = (transform.rotation * Math.PI) / 180;
    display.alpha = opacity;
    display.blendMode = toPixiBlendMode(layer.blendMode);
    const effectivelyVisible = isLayerEffectivelyVisible(
      this.state.project,
      layer,
    );
    display.visible = effectivelyVisible;
    display.eventMode = layer.locked || !effectivelyVisible ? "none" : "static";
    display.cursor =
      this.draggingLayerId === layer.id
        ? "grabbing"
        : layer.locked
          ? "default"
          : "pointer";
  }

  private drawGuides(): void {
    const stage = this.state.project.stage;
    this.guideGraphics.clear();
    this.guideGraphics
      .rect(0, 0, stage.width, stage.height)
      .fill(0x0a0a0a)
      .stroke({ color: 0x71717a, width: 2 });
    this.guideGraphics
      .moveTo(stage.width / 2, 0)
      .lineTo(stage.width / 2, stage.height)
      .stroke({ color: 0xa1a1aa, width: 1, alpha: 0.45 });
    this.guideGraphics
      .moveTo(0, stage.height / 2)
      .lineTo(stage.width, stage.height / 2)
      .stroke({ color: 0xa1a1aa, width: 1, alpha: 0.45 });

    const tickColor = { color: 0x3f3f46, width: 1, alpha: 0.65 };
    for (let x = 100; x < stage.width; x += 100) {
      this.guideGraphics.moveTo(x, 0).lineTo(x, stage.height).stroke(tickColor);
    }
    for (let y = 100; y < stage.height; y += 100) {
      this.guideGraphics.moveTo(0, y).lineTo(stage.width, y).stroke(tickColor);
    }
  }

  private drawParticles(): void {
    for (const particleGroup of this.layerParticleMap.values()) {
      for (const child of particleGroup.removeChildren()) {
        child.destroy();
      }
    }

    const stage = this.state.project.stage;
    const playheadSeconds = this.state.playheadSeconds;
    for (const layer of this.state.project.layers) {
      if (
        !isLayerEffectivelyVisible(this.state.project, layer) ||
        layer.type !== "image"
      )
        continue;
      const display = this.layerDisplayMap.get(layer.id);
      if (!display) continue;
      const particleGroup = this.layerParticleMap.get(layer.id);
      if (!particleGroup) continue;
      const texture = this.getLayerImageTexture(layer);
      if (!texture) continue;
      const previewLayer = this.state.previewLayers?.[layer.id];
      const transform = previewLayer?.transform ?? layer.transform;
      const layerOpacity = previewLayer?.opacity ?? layer.opacity;
      const hasActiveRenderEffect = layer.animations.some(
        (animation) =>
          animation.enabled &&
          (animation.type === "particle_combo" ||
            animation.type === "shatter" ||
            animation.type === "glow" ||
            animation.type === "safe_glow") &&
          getAnimationProgress(animation, playheadSeconds) !== null,
      );
      if (layerOpacity <= 0 && !hasActiveRenderEffect) continue;
      const emitter = editorToPixi(
        transform.x,
        transform.y,
        stage.width,
        stage.height,
      );
      for (const animation of layer.animations) {
        if (!animation.enabled) continue;
        const progress = getAnimationProgress(animation, playheadSeconds);
        if (progress === null) continue;
        if (animation.type === "particles") {
          this.drawParticleBurst(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layerOpacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "particle_twinkle") {
          this.drawParticleTwinkle(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layerOpacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "particle_wall") {
          this.drawParticleWall(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layerOpacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "particle_combo") {
          this.drawParticleCombo(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "shatter") {
          this.drawShatter(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            transform,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "glow") {
          this.drawGlow(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            transform,
            particleGroup,
          );
        } else if (animation.type === "safe_glow") {
          this.drawSafeGlow(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            transform,
            layer.blendMode,
            particleGroup,
          );
        }
      }
    }
  }

  private getLayerImageTexture(layer: V5GLayerConfig): PIXI.Texture | null {
    const display = this.layerDisplayMap.get(layer.id);
    const sprite = display?.children.find(
      (child): child is PIXI.Sprite => child instanceof PIXI.Sprite,
    );
    return sprite?.texture ?? null;
  }

  private drawParticleBurst(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const count = Math.round(
      clampParticleNumber(getParticleParam(animation, "count", 32), 1, 200),
    );
    const spread = clampParticleNumber(
      getParticleParam(animation, "spread", 70),
      0,
      1000,
    );
    const speed = clampParticleNumber(
      getParticleParam(animation, "speed", 180),
      0,
      2000,
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 48),
      1,
      400,
    );
    const gravity = clampParticleNumber(
      getParticleParam(animation, "gravity", 90),
      -2000,
      2000,
    );
    const fadeOut = animation.params.fadeOut !== false;
    const duration = Math.max(animation.duration, 0.0001);
    const age = progress * duration;
    const alphaBase =
      layerOpacity * (fadeOut ? Math.pow(1 - progress, 1.35) : 1);
    if (alphaBase <= 0.002) return;

    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;

    for (let index = 0; index < count; index += 1) {
      const randomA = seededRandom(animation.seed, index, 1);
      const randomB = seededRandom(animation.seed, index, 2);
      const randomC = seededRandom(animation.seed, index, 3);
      const randomD = seededRandom(animation.seed, index, 4);
      const randomE = seededRandom(animation.seed, index, 5);
      const angle = randomA * Math.PI * 2;
      const burstPower = 0.55 + randomB * 0.85;
      const startRadius = spread * 0.22 * randomC;
      const travel = spread * progress + speed * age * burstPower;
      const x = emitterX + Math.cos(angle) * (startRadius + travel);
      const y =
        emitterY +
        Math.sin(angle) * (startRadius + travel) +
        0.5 * gravity * age * age;
      const scale = Math.max(
        0.01,
        baseTextureScale * (0.55 + randomD * 0.9) * (1 - progress * 0.25),
      );
      const alpha = alphaBase * (0.55 + randomC * 0.45);
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      sprite.scale.set(scale);
      sprite.rotation =
        (randomE - 0.5) * Math.PI * 0.75 + progress * Math.PI * (0.5 + randomB);
      sprite.alpha = alpha;
      sprite.blendMode = toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawParticleTwinkle(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const count = Math.round(
      clampParticleNumber(getParticleParam(animation, "count", 60), 1, 1000),
    );
    const radius = clampParticleNumber(
      getParticleParam(animation, "radius", 240),
      0,
      3000,
    );
    const spawnInterval = clampParticleNumber(
      getParticleParam(animation, "spawnInterval", 0.12),
      0.01,
      10,
    );
    const twinkleDuration = clampParticleNumber(
      getParticleParam(animation, "twinkleDuration", 0.45),
      0.03,
      10,
    );
    const batchMin = Math.round(
      clampParticleNumber(getParticleParam(animation, "batchMin", 1), 1, 100),
    );
    const batchMax = Math.round(
      clampParticleNumber(
        getParticleParam(animation, "batchMax", 3),
        batchMin,
        100,
      ),
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 48),
      1,
      400,
    );
    const duration = Math.max(animation.duration, 0.0001);
    const elapsed = progress * duration;
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;
    let spawnedCount = 0;

    for (let batchIndex = 0; spawnedCount < count; batchIndex += 1) {
      const spawnTime = batchIndex * spawnInterval;
      if (spawnTime > elapsed) break;
      const batchRandom = seededRandom(animation.seed, batchIndex, 11);
      const batchCount = Math.min(
        count - spawnedCount,
        batchMin + Math.floor(batchRandom * (batchMax - batchMin + 1)),
      );
      for (let itemIndex = 0; itemIndex < batchCount; itemIndex += 1) {
        const particleIndex = spawnedCount + itemIndex;
        const localAge = (elapsed - spawnTime) / twinkleDuration;
        if (localAge < 0 || localAge > 1) continue;
        const randomA = seededRandom(animation.seed, particleIndex, 21);
        const randomB = seededRandom(animation.seed, particleIndex, 22);
        const randomC = seededRandom(animation.seed, particleIndex, 23);
        const randomD = seededRandom(animation.seed, particleIndex, 24);
        const angle = randomA * Math.PI * 2;
        const distance = Math.sqrt(randomB) * radius;
        const x = emitterX + Math.cos(angle) * distance;
        const y = emitterY + Math.sin(angle) * distance;
        const waveAlpha = Math.sin(localAge * Math.PI);
        const shimmer =
          0.78 + 0.22 * Math.sin(localAge * Math.PI * 6 + randomC * 6);
        const alpha = layerOpacity * Math.max(0, waveAlpha * shimmer);
        if (alpha <= 0.002) continue;
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(x, y);
        sprite.scale.set(
          Math.max(0.01, baseTextureScale * (0.65 + randomC * 0.85)),
        );
        sprite.rotation = (randomD - 0.5) * Math.PI * 2;
        sprite.alpha = alpha;
        sprite.blendMode = toPixiBlendMode(blendMode);
        target.addChild(sprite);
      }
      spawnedCount += batchCount;
    }
  }

  private drawParticleWall(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const emitterWidth = clampParticleNumber(
      getParticleParam(animation, "emitterWidth", 300),
      0,
      3000,
    );
    const direction = clampParticleNumber(
      getParticleParam(animation, "direction", 270),
      0,
      360,
    );
    const spreadAngle = clampParticleNumber(
      getParticleParam(animation, "spreadAngle", 15),
      0,
      180,
    );
    const speed = clampParticleNumber(
      getParticleParam(animation, "speed", 200),
      0,
      2000,
    );
    const lifetimeMin = clampParticleNumber(
      getParticleParam(animation, "lifetimeMin", 0.8),
      0.05,
      10,
    );
    const lifetimeMax = clampParticleNumber(
      getParticleParam(animation, "lifetimeMax", 2),
      lifetimeMin,
      10,
    );
    const spawnRate = clampParticleNumber(
      getParticleParam(animation, "spawnRate", 30),
      1,
      500,
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 48),
      1,
      400,
    );
    const gravity = clampParticleNumber(
      getParticleParam(animation, "gravity", 0),
      -2000,
      2000,
    );
    const startScaleMin = clampParticleNumber(
      getParticleParam(animation, "startScaleMin", 0.6),
      0.01,
      2,
    );
    const startScaleMax = clampParticleNumber(
      getParticleParam(animation, "startScaleMax", 1),
      startScaleMin,
      2,
    );
    const endScaleMin = clampParticleNumber(
      getParticleParam(animation, "endScaleMin", 0.3),
      0.01,
      2,
    );
    const endScaleMax = clampParticleNumber(
      getParticleParam(animation, "endScaleMax", 0.8),
      endScaleMin,
      2,
    );
    const fadeOut = animation.params.fadeOut !== false;
    const duration = Math.max(animation.duration, 0.0001);
    const elapsed = progress * duration;
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;

    const dirRad = (direction * Math.PI) / 180;
    const dirX = Math.cos(dirRad);
    const dirY = Math.sin(dirRad);
    // perpendicular direction for width spread
    const perpX = -dirY;
    const perpY = dirX;

    const totalSpawnCount = Math.floor(elapsed * spawnRate);

    for (let index = 0; index < totalSpawnCount; index += 1) {
      const particleRandomA = seededRandom(animation.seed, index, 101);
      const particleRandomB = seededRandom(animation.seed, index, 102);
      const particleRandomC = seededRandom(animation.seed, index, 103);
      const particleRandomD = seededRandom(animation.seed, index, 104);
      const particleRandomE = seededRandom(animation.seed, index, 105);

      // Each particle has its own lifetime in [lifetimeMin, lifetimeMax]
      const lifetime =
        lifetimeMin + particleRandomA * (lifetimeMax - lifetimeMin);
      // Spawn time for this particle (evenly across elapsed)
      const spawnTime =
        totalSpawnCount <= 1 ? 0 : (index / (totalSpawnCount - 1)) * elapsed;
      const localAge = (elapsed - spawnTime) / Math.max(lifetime, 0.0001);
      if (localAge < 0 || localAge > 1) continue;

      // Random position along the emitter line (width)
      const widthOffset = (particleRandomB - 0.5) * emitterWidth;
      const startX = emitterX + perpX * widthOffset;
      const startY = emitterY + perpY * widthOffset;

      // Random angle spread within spreadAngle
      const spreadRad =
        (particleRandomC - 0.5) * 2 * ((spreadAngle * Math.PI) / 180);
      const flyDirX = Math.cos(dirRad + spreadRad);
      const flyDirY = Math.sin(dirRad + spreadRad);

      const distance = speed * localAge * lifetime;
      const x = startX + flyDirX * distance;
      const y =
        startY +
        flyDirY * distance +
        0.5 * gravity * localAge * lifetime * localAge * lifetime;

      // Scale interpolation: startScale -> endScale based on localAge
      const startScaleVal =
        startScaleMin + particleRandomD * (startScaleMax - startScaleMin);
      const endScaleVal =
        endScaleMin + particleRandomE * (endScaleMax - endScaleMin);
      const scale = Math.max(
        0.01,
        baseTextureScale *
          (startScaleVal + (endScaleVal - startScaleVal) * localAge),
      );

      const alpha = fadeOut
        ? layerOpacity * Math.max(0, 1 - localAge)
        : layerOpacity;
      if (alpha <= 0.002) continue;

      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      sprite.scale.set(scale);
      sprite.rotation =
        (particleRandomA - 0.5) * Math.PI * 0.5 +
        localAge * Math.PI * (0.5 + particleRandomB);
      sprite.alpha = alpha;
      sprite.blendMode = toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawParticleCombo(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const count = Math.round(
      clampParticleNumber(getParticleParam(animation, "count", 36), 1, 300),
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 42),
      1,
      400,
    );
    const spawnMode = Math.round(
      clampParticleNumber(getParticleParam(animation, "spawnMode", 1), 0, 1),
    );
    const spawnRadius = clampParticleNumber(
      getParticleParam(animation, "spawnRadius", 90),
      0,
      3000,
    );
    const spawnRatio = clampParticleNumber(
      getParticleParam(animation, "spawnRatio", 0.18),
      0.01,
      0.8,
    );
    const targetOffsetX = getParticleParam(animation, "targetX", 320);
    const targetOffsetY = -getParticleParam(animation, "targetY", 0);
    const travelMode = Math.round(
      clampParticleNumber(getParticleParam(animation, "travelMode", 1), 0, 2),
    );
    const curve = getParticleParam(animation, "curve", 160);
    const orbitRadius = clampParticleNumber(
      getParticleParam(animation, "orbitRadius", 80),
      0,
      3000,
    );
    const orbitTurns = clampParticleNumber(
      getParticleParam(animation, "orbitTurns", 1),
      -10,
      10,
    );
    const orbitSpeed = clampParticleNumber(
      getParticleParam(animation, "orbitSpeed", 1),
      0.1,
      5,
    );
    const orbitRatio = clampParticleNumber(
      getParticleParam(animation, "orbitRatio", 0.35) / orbitSpeed,
      0.03,
      0.95,
    );
    const staggerRatio = clampParticleNumber(
      getParticleParam(animation, "staggerRatio", 0.28),
      0,
      0.9,
    );
    const trailCount = Math.round(
      clampParticleNumber(getParticleParam(animation, "trailCount", 4), 0, 12),
    );
    const trailSpacing = clampParticleNumber(
      getParticleParam(animation, "trailSpacing", 0.045),
      0.005,
      0.25,
    );
    const trailFade = clampParticleNumber(
      getParticleParam(animation, "trailFade", 0.55),
      0.05,
      0.95,
    );
    const vanishMode = Math.round(
      clampParticleNumber(getParticleParam(animation, "vanishMode", 1), 0, 2),
    );
    const vanishRatio = clampParticleNumber(
      getParticleParam(animation, "vanishRatio", 0.18),
      0.01,
      0.8,
    );
    const flashScale = clampParticleNumber(
      getParticleParam(animation, "flashScale", 1.6),
      0.1,
      8,
    );
    const flashIntensity = clampParticleNumber(
      getParticleParam(animation, "flashIntensity", 1.4),
      0.1,
      3,
    );
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;
    const effectiveTravelWindow = Math.max(0.001, 1 - staggerRatio);

    for (let index = 0; index < count; index += 1) {
      const stagger =
        count <= 1 ? 0 : (index / Math.max(1, count - 1)) * staggerRatio;
      for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
        const trailProgress = progress - trailIndex * trailSpacing;
        const localProgress = (trailProgress - stagger) / effectiveTravelWindow;
        if (localProgress < 0 || localProgress > 1) continue;
        const point = sampleParticleComboPoint(
          animation,
          index,
          localProgress,
          spawnMode,
          spawnRadius,
          spawnRatio,
          targetOffsetX,
          targetOffsetY,
          travelMode,
          curve,
          orbitRadius,
          orbitTurns,
          orbitRatio,
          vanishMode,
          vanishRatio,
          flashScale,
          flashIntensity,
        );
        if (point.alpha <= 0.002) continue;
        const trailAlpha = Math.pow(trailFade, trailIndex);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(emitterX + point.x, emitterY + point.y);
        sprite.scale.set(Math.max(0.01, baseTextureScale * point.scale));
        sprite.rotation = point.rotation;
        sprite.alpha = layerOpacity * point.alpha * trailAlpha;
        sprite.blendMode = toPixiBlendMode(blendMode);
        target.addChild(sprite);
      }
    }
  }

  private drawShatter(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    transform: V5GLayerConfig["transform"],
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const maxCount = Math.round(
      clampParticleNumber(getParticleParam(animation, "count", 64), 1, 600),
    );
    const pieceSize = clampParticleNumber(
      getParticleParam(animation, "pieceSize", 72),
      4,
      1024,
    );
    const force = clampParticleNumber(
      getParticleParam(animation, "force", 420),
      0,
      5000,
    );
    const impactAngle = getParticleParam(animation, "impactAngle", 90);
    const spreadAngle = clampParticleNumber(
      getParticleParam(animation, "spreadAngle", 160),
      0,
      360,
    );
    const gravity = clampParticleNumber(
      getParticleParam(animation, "gravity", 900),
      -5000,
      8000,
    );
    const spin = clampParticleNumber(
      getParticleParam(animation, "spin", 5),
      0,
      60,
    );
    const fadeOut = animation.params.fadeOut !== false;
    const duration = Math.max(animation.duration, 0.0001);
    const age = progress * duration;
    const alphaBase =
      layerOpacity * (fadeOut ? Math.pow(1 - progress, 1.2) : 1);
    if (alphaBase <= 0.002) return;

    const textureWidth = Math.max(1, Number(texture.width) || 1);
    const textureHeight = Math.max(1, Number(texture.height) || 1);
    const cols = Math.max(1, Math.ceil(textureWidth / pieceSize));
    const rows = Math.max(1, Math.ceil(textureHeight / pieceSize));
    const totalPieces = cols * rows;
    const drawCount = Math.min(maxCount, totalPieces);
    const step = totalPieces <= drawCount ? 1 : totalPieces / drawCount;
    const scaleX = transform.scaleX;
    const scaleY = transform.scaleY;
    const rotationRad = (transform.rotation * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    const anchorOffsetX = (0.5 - transform.anchorX) * textureWidth;
    const anchorOffsetY = (0.5 - transform.anchorY) * textureHeight;

    for (let drawIndex = 0; drawIndex < drawCount; drawIndex += 1) {
      const pieceIndex = Math.min(
        totalPieces - 1,
        Math.floor(
          drawIndex * step +
            seededRandom(animation.seed, drawIndex, 401) * Math.max(1, step),
        ),
      );
      const col = pieceIndex % cols;
      const row = Math.floor(pieceIndex / cols);
      const x0 = (col / cols) * textureWidth;
      const y0 = (row / rows) * textureHeight;
      const x1 = ((col + 1) / cols) * textureWidth;
      const y1 = ((row + 1) / rows) * textureHeight;
      const pieceWidth = Math.max(1, x1 - x0);
      const pieceHeight = Math.max(1, y1 - y0);
      const localX = x0 + pieceWidth / 2 - textureWidth / 2 + anchorOffsetX;
      const localY = y0 + pieceHeight / 2 - textureHeight / 2 + anchorOffsetY;
      const baseX = emitterX + (localX * cos - localY * sin) * scaleX;
      const baseY = emitterY + (localX * sin + localY * cos) * scaleY;

      const randomA = seededRandom(animation.seed, pieceIndex, 411);
      const randomB = seededRandom(animation.seed, pieceIndex, 412);
      const randomC = seededRandom(animation.seed, pieceIndex, 413);
      const randomD = seededRandom(animation.seed, pieceIndex, 414);
      const angle =
        ((impactAngle + (randomA - 0.5) * spreadAngle) * Math.PI) / 180;
      const velocity = force * (0.35 + randomB * 0.95);
      const travelX = Math.cos(angle) * velocity * age;
      const travelY =
        Math.sin(angle) * velocity * age + 0.5 * gravity * age * age;
      const piece = new PIXI.Container();
      const sprite = new PIXI.Sprite(texture);
      const mask = new PIXI.Graphics();
      sprite.anchor.set(transform.anchorX, transform.anchorY);
      sprite.position.set(-localX, -localY);
      mask
        .rect(-pieceWidth / 2, -pieceHeight / 2, pieceWidth, pieceHeight)
        .fill(0xffffff);
      sprite.mask = mask;
      piece.addChild(sprite, mask);
      piece.position.set(baseX + travelX, baseY + travelY);
      piece.scale.set(scaleX, scaleY);
      piece.rotation =
        rotationRad + (randomC - 0.5) * spin * Math.PI * progress;
      piece.alpha = alphaBase * (0.72 + randomD * 0.28);
      piece.blendMode = toPixiBlendMode(blendMode);
      target.addChild(piece);
    }
  }

  private drawGlow(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    transform: V5GLayerConfig["transform"],
    target: PIXI.Container,
  ): void {
    const intensity = clampParticleNumber(
      getParticleParam(animation, "intensity", 0.75),
      0,
      5,
    );
    if (intensity <= 0.001) return;
    const spread = clampParticleNumber(
      getParticleParam(animation, "spread", 0.12),
      0,
      2,
    );
    const minAlpha = clampParticleNumber(
      getParticleParam(animation, "minAlpha", 0.15),
      0,
      1,
    );
    const maxAlpha = clampParticleNumber(
      getParticleParam(animation, "maxAlpha", 0.75),
      0,
      1,
    );
    const pulses = clampParticleNumber(
      getParticleParam(animation, "pulses", 2),
      0,
      60,
    );
    const blendModeIndex = Math.round(
      clampParticleNumber(getParticleParam(animation, "blendMode", 0), 0, 2),
    );
    const wave =
      pulses <= 0 ? 1 : (1 - Math.cos(progress * Math.PI * 2 * pulses)) / 2;
    const alpha =
      layerOpacity * intensity * lerpNumber(minAlpha, maxAlpha, wave);
    if (alpha <= 0.002) return;
    const blendMode =
      blendModeIndex === 1
        ? "screen"
        : blendModeIndex === 2
          ? "lighten"
          : "add";
    const glowScale = 1 + spread * (0.6 + wave * 0.8);

    for (let index = 0; index < 2; index += 1) {
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(transform.anchorX, transform.anchorY);
      sprite.position.set(emitterX, emitterY);
      const layerScaleX = transform.scaleX * (index === 0 ? glowScale : 1);
      const layerScaleY = transform.scaleY * (index === 0 ? glowScale : 1);
      sprite.scale.set(layerScaleX, layerScaleY);
      sprite.rotation = (transform.rotation * Math.PI) / 180;
      sprite.alpha = index === 0 ? alpha * 0.65 : alpha * 0.35;
      sprite.blendMode = blendMode;
      target.addChild(sprite);
    }
  }

  private drawSafeGlow(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    transform: V5GLayerConfig["transform"],
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const spread = clampParticleNumber(
      getParticleParam(animation, "spread", 0.12),
      0,
      1,
    );
    const minOpacity = clampParticleNumber(
      getParticleParam(animation, "minOpacity", 0.12),
      0,
      1,
    );
    const maxOpacity = clampParticleNumber(
      getParticleParam(animation, "maxOpacity", 0.65),
      0,
      1,
    );
    const pulses = clampParticleNumber(
      getParticleParam(animation, "pulses", 2),
      0,
      60,
    );
    const wave =
      pulses <= 0 ? 1 : (1 - Math.cos(progress * Math.PI * 2 * pulses)) / 2;
    const alpha = layerOpacity * lerpNumber(minOpacity, maxOpacity, wave);
    if (alpha <= 0.002 || spread <= 0.001) return;

    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(transform.anchorX, transform.anchorY);
    sprite.position.set(emitterX, emitterY);
    const glowScale = 1 + spread;
    sprite.scale.set(
      transform.scaleX * glowScale,
      transform.scaleY * glowScale,
    );
    sprite.rotation = (transform.rotation * Math.PI) / 180;
    sprite.alpha = alpha;
    sprite.blendMode = toPixiBlendMode(blendMode);
    target.addChild(sprite);
  }

  private drawSelection(): void {
    this.selectionGraphics.clear();
    const layer = this.state.project.layers.find(
      (item) => item.id === this.state.selectedLayerId,
    );
    if (!layer || !isLayerEffectivelyVisible(this.state.project, layer)) return;
    const display = this.layerDisplayMap.get(layer.id);
    if (!display) return;
    const bounds = display.getBounds();
    const topLeft = this.stageContainer.toLocal({ x: bounds.x, y: bounds.y });
    const bottomRight = this.stageContainer.toLocal({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });
    const selectionColor = 0xe5c012;
    this.selectionGraphics
      .rect(
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y,
      )
      .stroke({
        color: selectionColor,
        width: 2 / this.viewScale,
        alpha: 0.95,
      });
  }

  private handleLayerPointerDown(
    event: PIXI.FederatedPointerEvent,
    layerId: string,
  ): void {
    const layer = this.state.project.layers.find((item) => item.id === layerId);
    const display = this.layerDisplayMap.get(layerId);
    if (
      !layer ||
      layer.locked ||
      !isLayerEffectivelyVisible(this.state.project, layer)
    ) {
      // 锁定或隐藏图层不拦截事件，让点击穿透到下层
      return;
    }
    event.stopPropagation();
    this.callbacks.onSelectLayer(layerId);

    const startGlobal = event.global.clone();
    const startX = layer.transform.x;
    const startY = layer.transform.y;
    let hasMoved = false;

    const onMove = (moveEvent: PIXI.FederatedPointerEvent) => {
      const dx = (moveEvent.global.x - startGlobal.x) / this.viewScale;
      const dy = (moveEvent.global.y - startGlobal.y) / this.viewScale;
      const nextX = roundTo(startX + dx, 1);
      const nextY = roundTo(startY - dy, 1);
      if (nextX === startX && nextY === startY) return;
      if (!hasMoved) {
        hasMoved = true;
        this.draggingLayerId = layerId;
        if (display) display.cursor = "grabbing";
        this.callbacks.onLayerMoveStart(layerId);
      }
      this.callbacks.onLayerMove(layerId, nextX, nextY);
    };

    const onUp = () => {
      if (this.draggingLayerId === layerId) this.draggingLayerId = null;
      if (display) display.cursor = layer.locked ? "default" : "pointer";
      this.app.stage.off("pointermove", onMove);
      this.app.stage.off("pointerup", onUp);
      this.app.stage.off("pointerupoutside", onUp);
    };

    this.app.stage.on("pointermove", onMove);
    this.app.stage.on("pointerup", onUp);
    this.app.stage.on("pointerupoutside", onUp);
  }

  private handlePanStart(event: PIXI.FederatedPointerEvent): void {
    if (event.target !== this.app.stage) return;
    this.callbacks.onClearSelection();
    const startGlobal = event.global.clone();
    const startOffsetX = this.viewOffsetX;
    const startOffsetY = this.viewOffsetY;
    this.container.classList.remove("cursor-grab", "cursor-grabbing");

    const onMove = (moveEvent: PIXI.FederatedPointerEvent) => {
      this.viewOffsetX = startOffsetX + moveEvent.global.x - startGlobal.x;
      this.viewOffsetY = startOffsetY + moveEvent.global.y - startGlobal.y;
      this.applyViewTransform();
      this.drawSelection();
    };

    const onUp = () => {
      this.container.classList.remove("cursor-grab", "cursor-grabbing");
      this.app.stage.off("pointermove", onMove);
      this.app.stage.off("pointerup", onUp);
      this.app.stage.off("pointerupoutside", onUp);
      this.notifyViewportChange();
    };

    this.app.stage.on("pointermove", onMove);
    this.app.stage.on("pointerup", onUp);
    this.app.stage.on("pointerupoutside", onUp);
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const global = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const localBefore = this.stageContainer.toLocal(global);
    const zoomFactor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
    const nextScale = clampViewportScale(this.viewScale * zoomFactor);
    if (nextScale === this.viewScale) return;

    this.viewScale = nextScale;
    this.applyViewTransform();
    const globalAfter = this.stageContainer.toGlobal(localBefore);
    this.viewOffsetX += global.x - globalAfter.x;
    this.viewOffsetY += global.y - globalAfter.y;
    this.applyViewTransform();
    this.drawSelection();
    this.notifyViewportChange();
  };

  private handleStagePointerMove(event: PIXI.FederatedPointerEvent): void {
    const local = this.stageContainer.toLocal(event.global);
    const stage = this.state.project.stage;
    const editorPoint = pixiToEditor(
      local.x,
      local.y,
      stage.width,
      stage.height,
    );
    this.callbacks.onCursorMove(
      roundTo(editorPoint.x, 1),
      roundTo(editorPoint.y, 1),
    );
  }

  private findRuntimeAsset(assetId: string | null): V5GRuntimeAsset | null {
    if (!assetId) return null;
    return (
      this.state.runtimeAssets.find((asset) => asset.id === assetId) ?? null
    );
  }

  private findProjectAsset(
    assetId: string | null,
  ): V5GEditorState["project"]["assets"][number] | null {
    if (!assetId) return null;
    return (
      this.state.project.assets.find((asset) => asset.id === assetId) ?? null
    );
  }
}

function clampViewportScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(scale, MIN_VIEW_SCALE), MAX_VIEW_SCALE);
}

function sanitizeViewportNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function getAnimationProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start || time >= end) return null;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

function getParticleParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: number,
): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampParticleNumber(value: number, min: number, max: number): number {
  return clampNumber(Number.isFinite(value) ? value : min, min, max);
}

interface ParticleComboPoint {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  rotation: number;
}

function sampleParticleComboPoint(
  animation: V5GAnimationConfig,
  index: number,
  progress: number,
  spawnMode: number,
  spawnRadius: number,
  spawnRatio: number,
  targetOffsetX: number,
  targetOffsetY: number,
  travelMode: number,
  curve: number,
  orbitRadius: number,
  orbitTurns: number,
  orbitRatio: number,
  vanishMode: number,
  vanishRatio: number,
  flashScale: number,
  flashIntensity: number,
): ParticleComboPoint {
  const p = clampNumber(progress, 0, 1);
  const randomA = seededRandom(animation.seed, index, 301);
  const randomB = seededRandom(animation.seed, index, 302);
  const randomC = seededRandom(animation.seed, index, 303);
  const randomD = seededRandom(animation.seed, index, 304);
  const randomE = seededRandom(animation.seed, index, 305);
  const spawnAngle = randomA * Math.PI * 2;
  const spawnDistance = Math.sqrt(randomB) * spawnRadius;
  const spawnX = Math.cos(spawnAngle) * spawnDistance;
  const spawnY = Math.sin(spawnAngle) * spawnDistance;
  const targetX = targetOffsetX;
  const targetY = targetOffsetY;
  const travelStart = spawnRatio;
  const vanishStart = Math.max(travelStart + 0.001, 1 - vanishRatio);
  const travelDuration = Math.max(0.001, vanishStart - travelStart);
  const spawnPhase = clampNumber(p / Math.max(spawnRatio, 0.001), 0, 1);
  const travelPhase = clampNumber((p - travelStart) / travelDuration, 0, 1);
  const vanishPhase = clampNumber(
    (p - vanishStart) / Math.max(vanishRatio, 0.001),
    0,
    1,
  );
  const easedSpawn = easeOutQuad(spawnPhase);
  const easedTravel = easeInOutQuad(travelPhase);
  const easedVanish = easeOutQuad(vanishPhase);

  let x = spawnX;
  let y = spawnY;
  if (p < travelStart) {
    if (spawnMode === 1) {
      x = spawnX * easedSpawn;
      y = spawnY * easedSpawn;
    }
  } else if (travelMode === 2) {
    const orbitEnd = clampNumber(orbitRatio, 0.03, 0.95);
    if (travelPhase <= orbitEnd) {
      const orbitPhase = clampNumber(travelPhase / orbitEnd, 0, 1);
      const orbitAngle =
        spawnAngle + orbitPhase * Math.PI * 2 * orbitTurns + randomC * Math.PI;
      const orbitEase = easeInOutQuad(orbitPhase);
      x =
        spawnX + Math.cos(orbitAngle) * orbitRadius * (0.35 + orbitEase * 0.65);
      y =
        spawnY + Math.sin(orbitAngle) * orbitRadius * (0.35 + orbitEase * 0.65);
    } else {
      const flyPhase = clampNumber(
        (travelPhase - orbitEnd) / (1 - orbitEnd),
        0,
        1,
      );
      const flyEase = easeInOutQuad(flyPhase);
      const orbitAngle =
        spawnAngle + Math.PI * 2 * orbitTurns + randomC * Math.PI;
      const fromX = spawnX + Math.cos(orbitAngle) * orbitRadius;
      const fromY = spawnY + Math.sin(orbitAngle) * orbitRadius;
      const curved = quadraticPoint(
        fromX,
        fromY,
        targetX,
        targetY,
        curve * 0.45 * (randomD < 0.5 ? -1 : 1),
        flyEase,
      );
      x = curved.x;
      y = curved.y;
    }
  } else if (travelMode === 1) {
    const curved = quadraticPoint(
      spawnX,
      spawnY,
      targetX,
      targetY,
      curve,
      easedTravel,
    );
    x = curved.x;
    y = curved.y;
  } else {
    x = lerpNumber(spawnX, targetX, easedTravel);
    y = lerpNumber(spawnY, targetY, easedTravel);
  }

  let alpha = p < travelStart ? easeOutQuad(spawnPhase) : 1;
  let scale = 0.65 + randomE * 0.7;
  if (p < travelStart) scale *= 0.25 + easedSpawn * 0.75;
  if (vanishPhase > 0) {
    if (vanishMode === 1) {
      const flash = Math.sin(vanishPhase * Math.PI);
      alpha *= Math.max(
        0,
        1 - easedVanish * 0.75 + flash * (flashIntensity - 1) * 0.35,
      );
      scale *= 1 + flash * (flashScale - 1);
    } else if (vanishMode === 2) {
      scale *= lerpNumber(1, flashScale, easedVanish);
      alpha *= Math.max(0, 1 - easedVanish);
    } else {
      alpha *= Math.max(0, 1 - easedVanish);
    }
  }

  const rotation =
    (randomC - 0.5) * Math.PI * 2 + p * Math.PI * 2 * (0.35 + randomD);
  return { x, y, alpha: Math.max(0, alpha), scale, rotation };
}

function quadraticPoint(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  curve: number,
  progress: number,
): { x: number; y: number } {
  const t = clampNumber(progress, 0, 1);
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  const controlX = midX + (-dy / length) * curve;
  const controlY = midY + (dx / length) * curve;
  const inv = 1 - t;
  return {
    x: inv * inv * fromX + 2 * inv * t * controlX + t * t * toX,
    y: inv * inv * fromY + 2 * inv * t * controlY + t * t * toY,
  };
}

function easeOutQuad(progress: number): number {
  const t = clampNumber(progress, 0, 1);
  return 1 - (1 - t) * (1 - t);
}

function easeInOutQuad(progress: number): number {
  const t = clampNumber(progress, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerpNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * clampNumber(progress, 0, 1);
}

function seededRandom(seed: number, index: number, salt: number): number {
  const raw =
    Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453123;
  return raw - Math.floor(raw);
}

function getTextureLongestEdge(texture: PIXI.Texture): number {
  const width = Number(texture.width);
  const height = Number(texture.height);
  const longestEdge = Math.max(width, height);
  return Number.isFinite(longestEdge) && longestEdge > 0 ? longestEdge : 1;
}

function getAssetDisplayCompensation(
  asset: V5GEditorState["project"]["assets"][number] | null,
  texture: PIXI.Texture,
): { x: number; y: number } {
  if (!asset) return { x: 1, y: 1 };
  const textureWidth = Number(texture.width);
  const textureHeight = Number(texture.height);
  const logicalWidth = Number(asset.width);
  const logicalHeight = Number(asset.height);
  const x =
    Number.isFinite(textureWidth) &&
    textureWidth > 0 &&
    Number.isFinite(logicalWidth) &&
    logicalWidth > 0
      ? logicalWidth / textureWidth
      : asset.fileScale && asset.fileScale > 0
        ? 1 / asset.fileScale
        : 1;
  const y =
    Number.isFinite(textureHeight) &&
    textureHeight > 0 &&
    Number.isFinite(logicalHeight) &&
    logicalHeight > 0
      ? logicalHeight / textureHeight
      : asset.fileScale && asset.fileScale > 0
        ? 1 / asset.fileScale
        : 1;
  return { x: sanitizeCompensation(x), y: sanitizeCompensation(y) };
}

function sanitizeCompensation(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function toPixiBlendMode(blendMode: V5GBlendMode): V5GBlendMode {
  if (
    blendMode === "add" ||
    blendMode === "screen" ||
    blendMode === "multiply" ||
    blendMode === "lighten"
  ) {
    return blendMode;
  }
  return "normal";
}
