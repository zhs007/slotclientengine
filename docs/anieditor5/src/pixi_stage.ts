import * as PIXI from "pixi.js";
import gsap from "gsap";
import {
  clampNumber,
  editorToPixi,
  pixiToEditor,
  roundTo,
} from "./coordinates";
import {
  getLayerMaskSource,
  isLayerEffectivelyVisible,
  normalizeProjectLayerGroups,
  normalizeProjectMasks,
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

interface PrecomposedLayerState {
  key: string;
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
}

interface CachedImageElement {
  objectUrl: string;
  image: HTMLImageElement;
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
  private readonly layerWrapperMap = new Map<string, PIXI.Container>();
  private readonly layerParticleMap = new Map<string, PIXI.Container>();
  private readonly layerMaskMap = new Map<string, PIXI.Container>();
  private readonly layerMaskKeyMap = new Map<string, string>();
  private readonly precomposedLayerMap = new Map<
    string,
    PrecomposedLayerState
  >();
  private readonly imageElementCache = new Map<string, CachedImageElement>();
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
  private renderRunId = 0;

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
    const runId = this.renderRunId + 1;
    this.renderRunId = runId;
    this.state = nextState;
    normalizeProjectLayerGroups(this.state.project);
    normalizeProjectMasks(this.state.project);
    await this.syncLayers(runId);
    if (!this.isCurrentRender(runId)) return;
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
      const wrapper = this.layerWrapperMap.get(layer.id);
      const target = wrapper ?? display;
      this.playTimeline.fromTo(
        target.scale,
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
        target,
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

  resetAnimationRenderState(): void {
    this.clearAllPrecomposedLayers();
    for (const particleGroup of this.layerParticleMap.values()) {
      for (const child of particleGroup.removeChildren()) {
        child.destroy();
      }
      particleGroup.visible = true;
      particleGroup.renderable = true;
      particleGroup.alpha = 1;
      particleGroup.position.set(0, 0);
      particleGroup.scale.set(1, 1);
      particleGroup.rotation = 0;
      particleGroup.mask = null;
    }
    for (const layer of this.state.project.layers) {
      this.applyLayerTransform(layer);
    }
  }

  destroy(): void {
    this.stopDemo();
    this.resizeObserver?.disconnect();
    this.container.removeEventListener("wheel", this.handleWheel);
    for (const wrapper of this.layerWrapperMap.values()) {
      wrapper.destroy({ children: false });
    }
    this.layerWrapperMap.clear();
    this.clearAllPrecomposedLayers();
    this.imageElementCache.clear();
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

  private async syncLayers(runId: number): Promise<void> {
    const temporarySoloLayerId = this.state.temporarySoloLayerId ?? null;
    const liveLayerIds = new Set(
      this.state.project.layers.map((layer) => layer.id),
    );
    for (const [layerId, display] of this.layerDisplayMap) {
      if (!liveLayerIds.has(layerId)) {
        this.detachLayerMaskTargets(layerId);
        const wrapper = this.layerWrapperMap.get(layerId);
        if (wrapper) {
          if (display.parent === wrapper) {
            wrapper.removeChild(display);
          }
          wrapper.destroy({ children: false });
          this.layerWrapperMap.delete(layerId);
        }
        display.destroy({ children: true });
        this.layerDisplayMap.delete(layerId);
        const particleGroup = this.layerParticleMap.get(layerId);
        particleGroup?.destroy({ children: true });
        this.layerParticleMap.delete(layerId);
        const mask = this.layerMaskMap.get(layerId);
        mask?.destroy({ children: true });
        this.layerMaskMap.delete(layerId);
        this.layerMaskKeyMap.delete(layerId);
        this.clearPrecomposedLayer(layerId);
        this.layerAssetIdMap.delete(layerId);
      }
    }

    for (const layer of this.state.project.layers) {
      let display = this.layerDisplayMap.get(layer.id);
      const displayAssetId = this.getLayerDisplayAssetId(layer);
      const shouldRecreateImageDisplay =
        (layer.type === "image" || layer.type === "sequence") &&
        display !== undefined &&
        this.layerAssetIdMap.get(layer.id) !== displayAssetId;
      if (shouldRecreateImageDisplay && display) {
        this.detachLayerMaskTargets(layer.id);
        const wrapper = this.layerWrapperMap.get(layer.id);
        if (wrapper) {
          if (display.parent === wrapper) {
            wrapper.removeChild(display);
          }
          wrapper.destroy({ children: false });
          this.layerWrapperMap.delete(layer.id);
        }
        display.destroy({ children: true });
        this.layerDisplayMap.delete(layer.id);
        const particleGroup = this.layerParticleMap.get(layer.id);
        particleGroup?.destroy({ children: true });
        this.layerParticleMap.delete(layer.id);
        const mask = this.layerMaskMap.get(layer.id);
        mask?.destroy({ children: true });
        this.layerMaskMap.delete(layer.id);
        this.layerMaskKeyMap.delete(layer.id);
        this.clearPrecomposedLayer(layer.id);
        this.layerAssetIdMap.delete(layer.id);
        display = undefined;
      }
      if (!display) {
        display = await this.createLayerDisplay(layer);
        if (!this.isCurrentRender(runId)) {
          display.destroy({ children: true });
          return;
        }
        this.layerDisplayMap.set(layer.id, display);
        this.layerAssetIdMap.set(layer.id, displayAssetId);
        this.contentContainer.addChild(display);
      } else if (layer.type === "text") {
        const textNode = display.children[0];
        if (textNode instanceof PIXI.Text) {
          textNode.text = layer.text ?? layer.name;
        }
      }
      if (temporarySoloLayerId === null) {
        const maskSource = getLayerMaskSource(this.state.project, layer);
        const displayAfterMask = this.layerDisplayMap.get(layer.id);
        const usesPrecomposedMask = this.shouldUsePrecomposedLightMask(
          layer,
          maskSource,
        );
        if (maskSource && displayAfterMask && !usesPrecomposedMask) {
          let wrapper = this.layerWrapperMap.get(layer.id);
          if (!wrapper || wrapper.destroyed) {
            if (wrapper) this.layerWrapperMap.delete(layer.id);
            wrapper = new PIXI.Container();
            wrapper.eventMode = "static";
            this.layerWrapperMap.set(layer.id, wrapper);
          }
          if (displayAfterMask.parent !== wrapper) {
            if (displayAfterMask.parent) {
              displayAfterMask.parent.removeChild(displayAfterMask);
            }
            wrapper.addChild(displayAfterMask);
          }
          if (wrapper.parent !== this.contentContainer) {
            this.contentContainer.addChild(wrapper);
          }
        } else {
          const staleWrapper = this.layerWrapperMap.get(layer.id);
          if (staleWrapper) {
            staleWrapper.mask = null;
            const displayInWrapper = this.layerDisplayMap.get(layer.id);
            if (
              displayInWrapper &&
              staleWrapper.children.includes(displayInWrapper)
            ) {
              staleWrapper.removeChild(displayInWrapper);
              displayInWrapper.mask = null;
              this.contentContainer.addChild(displayInWrapper);
            }
            staleWrapper.destroy({ children: false });
            this.layerWrapperMap.delete(layer.id);
          }
        }
      }

      this.applyLayerTransform(layer);
      if (layer.type === "image" || layer.type === "sequence") {
        this.ensureParticleGroup(layer.id);
      }
      if (temporarySoloLayerId === null) {
        await this.syncLayerMask(layer, runId);
      }
    }

    for (const layer of this.state.project.layers) {
      const display = this.layerDisplayMap.get(layer.id);
      const wrapper = this.layerWrapperMap.get(layer.id);
      const target = wrapper ?? display;
      if (target) {
        this.contentContainer.addChild(target);
        const precomposed = this.precomposedLayerMap.get(layer.id);
        if (precomposed) this.contentContainer.addChild(precomposed.sprite);
        const particleGroup = this.layerParticleMap.get(layer.id);
        if (particleGroup) this.contentContainer.addChild(particleGroup);
        const mask = this.layerMaskMap.get(layer.id);
        if (mask && mask.parent !== this.contentContainer) {
          this.contentContainer.addChild(mask);
        }
      }
    }
  }

  private async syncLayerMask(
    layer: V5GLayerConfig,
    runId: number,
  ): Promise<void> {
    const display = this.layerDisplayMap.get(layer.id);
    const particleGroup = this.layerParticleMap.get(layer.id);
    const sourceLayer = getLayerMaskSource(this.state.project, layer);
    if (!display || !sourceLayer) {
      this.clearLayerMask(layer.id);
      if (display) display.mask = null;
      if (particleGroup) particleGroup.mask = null;
      this.clearPrecomposedLayer(layer.id);
      return;
    }

    if (this.shouldUsePrecomposedLightMask(layer, sourceLayer)) {
      await this.syncPrecomposedLightMask(layer, sourceLayer, runId);
      this.clearLayerMaskOnly(layer.id);
      display.mask = null;
      if (particleGroup) particleGroup.mask = null;
      return;
    }

    this.clearPrecomposedLayer(layer.id);

    const maskKey = getLayerMaskRenderKey(sourceLayer);
    let maskContainer = this.layerMaskMap.get(layer.id);
    if (!maskContainer || this.layerMaskKeyMap.get(layer.id) !== maskKey) {
      this.detachLayerMaskTargets(layer.id);
      maskContainer?.destroy({ children: true });
      maskContainer = await this.createLayerMaskDisplay(sourceLayer);
      if (!this.isCurrentRender(runId)) {
        maskContainer.destroy({ children: true });
        return;
      }
      this.layerMaskMap.set(layer.id, maskContainer);
      this.layerMaskKeyMap.set(layer.id, maskKey);
      // 把 mask container 加到 contentContainer 保持 transform 参照系正确
      this.contentContainer.addChild(maskContainer);
    } else if (sourceLayer.type === "text") {
      const textNode = maskContainer.children[0];
      if (textNode instanceof PIXI.Text) {
        textNode.text = sourceLayer.text ?? sourceLayer.name;
      }
    }

    this.applyMaskTransform(maskContainer, sourceLayer);
    const maskSource = maskContainer.children[0] ?? null;
    const wrapper = this.layerWrapperMap.get(layer.id);
    // 使用源图内部 Sprite/Text 作为 alpha mask，才能按 PNG 有效像素裁剪；
    // 外层 Container 仅承载 transform，不能直接作为 mask，否则 Pixi 会退化成矩形/普通管线。
    if (wrapper) {
      display.mask = null;
      wrapper.mask = maskSource;
    } else {
      display.mask = maskSource;
    }
    // 暂不把同一个 mask 对象复用到粒子层；共享 mask display object 会触发 Pixi v8 filter/bounds 异常。
    if (particleGroup) particleGroup.mask = null;
    // 外层容器不作为普通内容渲染，避免显示遮罩副本；maskSource 自身保持 renderable=true 供 mask pass 使用。
    maskContainer.renderable = false;
  }

  private clearLayerMask(layerId: string): void {
    this.detachLayerMaskTargets(layerId);
    const mask = this.layerMaskMap.get(layerId);
    mask?.destroy({ children: true });
    this.layerMaskMap.delete(layerId);
    this.layerMaskKeyMap.delete(layerId);
    const wrapper = this.layerWrapperMap.get(layerId);
    if (wrapper) {
      const display = this.layerDisplayMap.get(layerId);
      if (display && display.parent === wrapper) {
        wrapper.removeChild(display);
        this.contentContainer.addChild(display);
      }
      wrapper.destroy({ children: false });
      this.layerWrapperMap.delete(layerId);
    }
  }

  private detachLayerMaskTargets(layerId: string): void {
    const display = this.layerDisplayMap.get(layerId);
    if (display) display.mask = null;
    const wrapper = this.layerWrapperMap.get(layerId);
    if (wrapper) wrapper.mask = null;
    const particleGroup = this.layerParticleMap.get(layerId);
    if (particleGroup) particleGroup.mask = null;
  }

  private async createLayerMaskDisplay(
    sourceLayer: V5GLayerConfig,
  ): Promise<PIXI.Container> {
    const mask = new PIXI.Container();
    mask.eventMode = "none";
    mask.cursor = "default";

    if (sourceLayer.type === "image" || sourceLayer.type === "sequence") {
      const sourceAssetId = this.getLayerDisplayAssetId(sourceLayer);
      const runtimeAsset = this.findRuntimeAsset(sourceAssetId);
      const asset = this.findProjectAsset(sourceAssetId);
      if (runtimeAsset) {
        const texture = await this.loadImageTexture(runtimeAsset);
        const sprite = new PIXI.Sprite(texture);
        sprite.renderable = true;
        sprite.anchor.set(
          sourceLayer.transform.anchorX,
          sourceLayer.transform.anchorY,
        );
        const compensation = getAssetDisplayCompensation(asset, texture);
        sprite.scale.set(compensation.x, compensation.y);
        mask.addChild(sprite);
      } else {
        mask.addChild(this.createMissingAssetBox(sourceLayer.name));
      }
    } else if (sourceLayer.type === "text") {
      const text = new PIXI.Text({
        text: sourceLayer.text ?? sourceLayer.name,
        style: {
          fill: 0xffffff,
          fontFamily: "Arial, sans-serif",
          fontSize: 64,
          fontWeight: "700",
        },
      });
      text.anchor.set(
        sourceLayer.transform.anchorX,
        sourceLayer.transform.anchorY,
      );
      text.renderable = true;
      mask.addChild(text);
    } else {
      mask.addChild(this.createMissingAssetBox(sourceLayer.name));
    }

    return mask;
  }

  private applyMaskTransform(
    mask: PIXI.Container,
    sourceLayer: V5GLayerConfig,
  ): void {
    const stage = this.state.project.stage;
    const previewLayer = this.state.previewLayers?.[sourceLayer.id];
    const transform = previewLayer?.transform ?? sourceLayer.transform;
    const opacity = previewLayer?.opacity ?? sourceLayer.opacity;
    const position = editorToPixi(
      transform.x,
      transform.y,
      stage.width,
      stage.height,
    );
    mask.position.set(position.x, position.y);
    mask.scale.set(transform.scaleX, transform.scaleY);
    mask.rotation = (transform.rotation * Math.PI) / 180;
    mask.alpha = opacity;
    mask.blendMode = "normal";
    mask.visible = true;
    // 外层容器只负责 transform，不作为普通内容渲染；内部 Sprite/Text 作为 alpha mask。
    mask.renderable = false;
    mask.eventMode = "none";
  }

  private shouldUsePrecomposedLightMask(
    layer: V5GLayerConfig,
    sourceLayer: V5GLayerConfig | null,
  ): boolean {
    return (
      layer.mask?.enabled === true &&
      layer.mask.compositeMode === "precompose_light_alpha" &&
      layer.type === "image" &&
      sourceLayer?.type === "image" &&
      isLightMaskBlendMode(layer.blendMode) &&
      this.findRuntimeAsset(layer.assetId) !== null &&
      this.findRuntimeAsset(sourceLayer.assetId) !== null
    );
  }

  private async syncPrecomposedLightMask(
    layer: V5GLayerConfig,
    sourceLayer: V5GLayerConfig,
    runId: number,
  ): Promise<void> {
    const display = this.layerDisplayMap.get(layer.id);
    if (!display) return;

    const layerRuntimeAsset = this.findRuntimeAsset(layer.assetId);
    const maskRuntimeAsset = this.findRuntimeAsset(sourceLayer.assetId);
    const layerAsset = this.findProjectAsset(layer.assetId);
    const maskAsset = this.findProjectAsset(sourceLayer.assetId);
    if (!layerRuntimeAsset || !maskRuntimeAsset) {
      this.clearPrecomposedLayer(layer.id);
      display.renderable = true;
      return;
    }

    const stage = this.state.project.stage;
    const layerPreview = this.state.previewLayers?.[layer.id];
    const maskPreview = this.state.previewLayers?.[sourceLayer.id];
    const layerTransform = layerPreview?.transform ?? layer.transform;
    const maskTransform = maskPreview?.transform ?? sourceLayer.transform;
    const layerOpacity = layerPreview?.opacity ?? layer.opacity;
    const maskOpacity = maskPreview?.opacity ?? sourceLayer.opacity;
    const layerImage = await this.loadImageElement(layerRuntimeAsset);
    if (!this.isCurrentRender(runId)) return;
    const maskImage = await this.loadImageElement(maskRuntimeAsset);
    if (!this.isCurrentRender(runId)) return;
    const key = [
      "precompose_light_alpha",
      stage.width,
      stage.height,
      layer.id,
      layerRuntimeAsset.objectUrl,
      maskRuntimeAsset.objectUrl,
      layerAsset?.width ?? layerImage.naturalWidth,
      layerAsset?.height ?? layerImage.naturalHeight,
      maskAsset?.width ?? maskImage.naturalWidth,
      maskAsset?.height ?? maskImage.naturalHeight,
      serializeTransformForKey(layerTransform),
      roundTo(layerOpacity, 4),
      serializeTransformForKey(maskTransform),
      roundTo(maskOpacity, 4),
      layer.blendMode,
    ].join("|");

    let entry = this.precomposedLayerMap.get(layer.id);
    if (!entry || entry.key !== key) {
      const canvas = this.createPrecomposedLightMaskCanvas({
        layerImage,
        maskImage,
        layerAsset,
        maskAsset,
        layerTransform,
        maskTransform,
        maskOpacity,
      });
      const texture = PIXI.Texture.from(canvas);
      const sprite = new PIXI.Sprite(texture);
      sprite.position.set(0, 0);
      sprite.alpha = clampNumber(layerOpacity, 0, 1);
      sprite.blendMode = toPixiBlendMode(layer.blendMode);
      sprite.eventMode = "none";
      sprite.cursor = "default";
      entry?.sprite.destroy({ children: true });
      entry?.texture.destroy(true);
      entry = { key, sprite, texture };
      this.precomposedLayerMap.set(layer.id, entry);
      this.contentContainer.addChild(sprite);
    } else {
      entry.sprite.alpha = clampNumber(layerOpacity, 0, 1);
      entry.sprite.blendMode = toPixiBlendMode(layer.blendMode);
    }

    entry.sprite.visible = isLayerEffectivelyVisible(this.state.project, layer);
    entry.sprite.renderable = true;
    // 保留原 display 作为透明交互层，避免预合成 Sprite 覆盖全舞台后导致图层无法点选/拖动。
    display.renderable = true;
    display.alpha = 0;
  }

  private createPrecomposedLightMaskCanvas(options: {
    layerImage: HTMLImageElement;
    maskImage: HTMLImageElement;
    layerAsset: V5GEditorState["project"]["assets"][number] | null;
    maskAsset: V5GEditorState["project"]["assets"][number] | null;
    layerTransform: V5GLayerConfig["transform"];
    maskTransform: V5GLayerConfig["transform"];
    maskOpacity: number;
  }): HTMLCanvasElement {
    const stage = this.state.project.stage;
    const width = Math.max(1, Math.round(stage.width));
    const height = Math.max(1, Math.round(stage.height));
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = width;
    layerCanvas.height = height;
    const layerCtx = layerCanvas.getContext("2d", { willReadFrequently: true });
    if (!layerCtx) throw new Error("浏览器不支持 Canvas 光效遮罩预合成");
    drawImageLayerToContext(layerCtx, {
      image: options.layerImage,
      asset: options.layerAsset,
      transform: options.layerTransform,
      stageWidth: width,
      stageHeight: height,
    });

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskCtx) throw new Error("浏览器不支持 Canvas alpha 遮罩预合成");
    drawImageLayerToContext(maskCtx, {
      image: options.maskImage,
      asset: options.maskAsset,
      transform: options.maskTransform,
      stageWidth: width,
      stageHeight: height,
    });

    const layerData = layerCtx.getImageData(0, 0, width, height);
    const maskData = maskCtx.getImageData(0, 0, width, height);
    const layerPixels = layerData.data;
    const maskPixels = maskData.data;
    const maskOpacity = clampNumber(options.maskOpacity, 0, 1);
    for (let index = 0; index < layerPixels.length; index += 4) {
      const r = layerPixels[index] ?? 0;
      const g = layerPixels[index + 1] ?? 0;
      const b = layerPixels[index + 2] ?? 0;
      const sourceAlpha = (layerPixels[index + 3] ?? 0) / 255;
      const lightAlpha = (Math.max(r, g, b) / 255) * sourceAlpha;
      const maskAlpha = ((maskPixels[index + 3] ?? 0) / 255) * maskOpacity;
      const outputAlpha = clampNumber(lightAlpha * maskAlpha, 0, 1);
      layerPixels[index + 3] = Math.round(outputAlpha * 255);
    }
    layerCtx.putImageData(layerData, 0, 0);
    return layerCanvas;
  }

  private loadImageElement(
    runtimeAsset: V5GRuntimeAsset,
  ): Promise<HTMLImageElement> {
    const cached = this.imageElementCache.get(runtimeAsset.id);
    if (cached?.objectUrl === runtimeAsset.objectUrl) {
      return Promise.resolve(cached.image);
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        this.imageElementCache.set(runtimeAsset.id, {
          objectUrl: runtimeAsset.objectUrl,
          image,
        });
        resolve(image);
      };
      image.onerror = () => reject(new Error("图片像素读取失败"));
      image.src = runtimeAsset.objectUrl;
    });
  }

  private clearLayerMaskOnly(layerId: string): void {
    this.detachLayerMaskTargets(layerId);
    const mask = this.layerMaskMap.get(layerId);
    mask?.destroy({ children: true });
    this.layerMaskMap.delete(layerId);
    this.layerMaskKeyMap.delete(layerId);
  }

  private clearPrecomposedLayer(layerId: string): void {
    const entry = this.precomposedLayerMap.get(layerId);
    if (!entry) return;
    entry.sprite.destroy({ children: true });
    entry.texture.destroy(true);
    this.precomposedLayerMap.delete(layerId);
    const display = this.layerDisplayMap.get(layerId);
    if (display && !display.destroyed) {
      display.renderable = true;
      display.alpha = this.layerWrapperMap.has(layerId)
        ? 1
        : this.getCurrentLayerOpacity(layerId);
    }
  }

  private clearAllPrecomposedLayers(): void {
    for (const layerId of this.precomposedLayerMap.keys()) {
      this.clearPrecomposedLayer(layerId);
    }
  }

  private getCurrentLayerOpacity(layerId: string): number {
    const layer = this.state.project.layers.find((item) => item.id === layerId);
    const opacity =
      this.state.previewLayers?.[layerId]?.opacity ?? layer?.opacity ?? 1;
    return clampNumber(opacity, 0, 1);
  }

  private ensureParticleGroup(layerId: string): PIXI.Container {
    let particleGroup = this.layerParticleMap.get(layerId);
    if (!particleGroup || particleGroup.destroyed) {
      particleGroup = new PIXI.Container();
      particleGroup.eventMode = "none";
      this.layerParticleMap.set(layerId, particleGroup);
    }
    particleGroup.visible = true;
    particleGroup.renderable = true;
    particleGroup.alpha = 1;
    particleGroup.position.set(0, 0);
    particleGroup.scale.set(1, 1);
    particleGroup.rotation = 0;
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

    if (layer.type === "image" || layer.type === "sequence") {
      const layerAssetId = this.getLayerDisplayAssetId(layer);
      const runtimeAsset = this.findRuntimeAsset(layerAssetId);
      const asset = this.findProjectAsset(layerAssetId);
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

  private applyDisplayContentRotation(
    display: PIXI.Container,
    rotationDegrees: number,
  ): void {
    const rotation = (rotationDegrees * Math.PI) / 180;
    for (const child of display.children) {
      child.rotation = rotation;
    }
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
    const wrapper = this.layerWrapperMap.get(layer.id);
    const target = wrapper ?? display;
    const stage = this.state.project.stage;
    const temporarySoloLayerId = this.state.temporarySoloLayerId ?? null;
    const isTemporarySoloLayer = temporarySoloLayerId === layer.id;
    const previewLayer =
      temporarySoloLayerId === null
        ? this.state.previewLayers?.[layer.id]
        : undefined;
    const transform = previewLayer?.transform ?? layer.transform;
    const opacity = isTemporarySoloLayer
      ? 1
      : (previewLayer?.opacity ?? layer.opacity);
    const position = editorToPixi(
      transform.x,
      transform.y,
      stage.width,
      stage.height,
    );
    target.position.set(position.x, position.y);
    target.scale.set(transform.scaleX, transform.scaleY);
    target.rotation = (transform.rotation * Math.PI) / 180;
    target.alpha = opacity;
    target.blendMode = wrapper ? "normal" : toPixiBlendMode(layer.blendMode);
    const visualRotation = previewLayer?.visualRotation ?? 0;
    this.applyDisplayContentRotation(display, visualRotation);
    if (wrapper) {
      display.position.set(0, 0);
      display.scale.set(1, 1);
      display.rotation = 0;
      display.alpha = 1;
      // Pixi v8 在 wrapper+mask 管线中可能忽略 Container blendMode；
      // 将 ADD/screen 等混合模式下沉到实际图像 display，避免黑底光效退回 normal 显示。
      display.blendMode = toPixiBlendMode(layer.blendMode);
    }
    const effectivelyVisible =
      temporarySoloLayerId === null
        ? isLayerEffectivelyVisible(this.state.project, layer)
        : isTemporarySoloLayer;
    target.visible = effectivelyVisible;
    target.renderable = effectivelyVisible;
    target.eventMode = layer.locked || !effectivelyVisible ? "none" : "static";
    target.cursor =
      this.draggingLayerId === layer.id
        ? "grabbing"
        : layer.locked
          ? "default"
          : "pointer";
    const precomposed = this.precomposedLayerMap.get(layer.id);
    if (precomposed) {
      precomposed.sprite.visible =
        temporarySoloLayerId === null && effectivelyVisible;
      precomposed.sprite.renderable =
        temporarySoloLayerId === null && effectivelyVisible;
      precomposed.sprite.alpha = opacity;
      precomposed.sprite.blendMode = toPixiBlendMode(layer.blendMode);
      // 预合成视觉由全舞台 Sprite 承担；原 display 仅保留透明命中区域。
      display.alpha = temporarySoloLayerId === null ? 0 : opacity;
    }
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

    if (this.state.temporarySoloLayerId) return;

    const stage = this.state.project.stage;
    const playheadSeconds = this.state.playheadSeconds;
    for (const layer of this.state.project.layers) {
      if (
        !isLayerEffectivelyVisible(this.state.project, layer) ||
        (layer.type !== "image" && layer.type !== "sequence")
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
          (animation.type === "particle_stream" ||
            animation.type === "particle_combo" ||
            animation.type === "gather_particles" ||
            animation.type === "smoke_mist" ||
            animation.type === "energy_ring" ||
            animation.type === "slash_light" ||
            animation.type === "flame_flicker" ||
            animation.type === "wave_band" ||
            animation.type === "wave_distort" ||
            animation.type === "speed_lines" ||
            animation.type === "drift_fall" ||
            animation.type === "path_particles" ||
            animation.type === "shatter" ||
            animation.type === "glow" ||
            animation.type === "safe_glow" ||
            animation.type === "chaser_light") &&
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
        } else if (animation.type === "particle_stream") {
          this.drawParticleStream(
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
        } else if (animation.type === "gather_particles") {
          this.drawGatherParticles(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "smoke_mist") {
          this.drawSmokeMist(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "energy_ring") {
          this.drawEnergyRing(
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
        } else if (animation.type === "slash_light") {
          this.drawSlashLight(
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
        } else if (animation.type === "flame_flicker") {
          this.drawFlameFlicker(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "wave_band") {
          this.drawWaveBand(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "wave_distort") {
          this.drawWaveDistort(
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
        } else if (animation.type === "speed_lines") {
          this.drawSpeedLines(
            animation,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "drift_fall") {
          this.drawDriftFall(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
            layer.blendMode,
            particleGroup,
          );
        } else if (animation.type === "path_particles") {
          this.drawPathParticles(
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
        } else if (animation.type === "chaser_light") {
          this.drawChaserLight(
            animation,
            texture,
            emitter.x,
            emitter.y,
            progress,
            layer.opacity,
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
    const emissionAngle = getParticleParam(animation, "emissionAngle", 270);
    const emissionSpreadAngle = clampParticleNumber(
      getParticleParam(animation, "emissionSpreadAngle", 360),
      0,
      360,
    );
    const baseEmissionAngleRad = (emissionAngle * Math.PI) / 180;
    const emissionSpreadRad = (emissionSpreadAngle * Math.PI) / 180;
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
    const requestedTrailCount = Math.round(
      clampParticleNumber(getParticleParam(animation, "trailCount", 2), 0, 8),
    );
    // Mobile-friendly guard: keep burst particles below a predictable draw budget.
    // Actual sprites = count * (effectiveTrailCount + 1).
    const maxBurstSprites = 320;
    const trailCount = Math.min(
      requestedTrailCount,
      Math.max(0, Math.floor(maxBurstSprites / Math.max(1, count)) - 1),
    );
    const trailSpacing = clampParticleNumber(
      getParticleParam(animation, "trailSpacing", 0.035),
      0.005,
      0.2,
    );
    const trailFade = clampParticleNumber(
      getParticleParam(animation, "trailFade", 0.5),
      0.05,
      0.95,
    );
    const rotateParticles = animation.params.rotateParticles !== false;
    const randomRotation = animation.params.randomRotation !== false;
    const randomRotationRange = clampParticleNumber(
      getParticleParam(animation, "randomRotationDegrees", 135),
      0,
      360,
    );
    const spinSpeed = clampParticleNumber(
      getParticleParam(animation, "spinSpeed", 1),
      0,
      10,
    );
    const duration = Math.max(animation.duration, 0.0001);

    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;

    for (let index = 0; index < count; index += 1) {
      const randomA = seededRandom(animation.seed, index, 1);
      const randomB = seededRandom(animation.seed, index, 2);
      const randomC = seededRandom(animation.seed, index, 3);
      const randomD = seededRandom(animation.seed, index, 4);
      const randomE = seededRandom(animation.seed, index, 5);
      const angle = baseEmissionAngleRad + (randomA - 0.5) * emissionSpreadRad;
      const burstPower = 0.55 + randomB * 0.85;
      const startRadius = spread * 0.22 * randomC;
      for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
        const trailProgress = progress - trailIndex * trailSpacing;
        if (trailProgress < 0 || trailProgress > 1) continue;
        const trailAge = trailProgress * duration;
        const alphaBase =
          layerOpacity *
          (fadeOut ? Math.pow(1 - trailProgress, 1.35) : 1) *
          Math.pow(trailFade, trailIndex);
        if (alphaBase <= 0.002) continue;
        const travel = spread * trailProgress + speed * trailAge * burstPower;
        const x = emitterX + Math.cos(angle) * (startRadius + travel);
        const y =
          emitterY +
          Math.sin(angle) * (startRadius + travel) +
          0.5 * gravity * trailAge * trailAge;
        const scale = Math.max(
          0.01,
          baseTextureScale *
            (0.55 + randomD * 0.9) *
            (1 - trailProgress * 0.25),
        );
        const alpha = alphaBase * (0.55 + randomC * 0.45);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(x, y);
        sprite.scale.set(scale);
        if (rotateParticles) {
          const randomRotationOffset = randomRotation
            ? (randomE - 0.5) * ((randomRotationRange * Math.PI) / 180)
            : 0;
          sprite.rotation =
            randomRotationOffset +
            trailProgress * Math.PI * (0.5 + randomB) * spinSpeed;
        } else {
          sprite.rotation = 0;
        }
        sprite.alpha = alpha;
        sprite.blendMode = toPixiBlendMode(blendMode);
        target.addChild(sprite);
      }
    }
  }

  private drawParticleStream(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const spawnRate = clampParticleNumber(
      getParticleParam(animation, "spawnRate", 24),
      1,
      300,
    );
    const lifetime = clampParticleNumber(
      getParticleParam(animation, "lifetime", 1.2),
      0.05,
      10,
    );
    const spread = clampParticleNumber(
      getParticleParam(animation, "spread", 12),
      0,
      1000,
    );
    const speed = clampParticleNumber(
      getParticleParam(animation, "speed", 220),
      0,
      2000,
    );
    const emissionAngle = getParticleParam(animation, "emissionAngle", 270);
    const emissionSpreadAngle = clampParticleNumber(
      getParticleParam(animation, "emissionSpreadAngle", 30),
      0,
      360,
    );
    const baseEmissionAngleRad = (emissionAngle * Math.PI) / 180;
    const emissionSpreadRad = (emissionSpreadAngle * Math.PI) / 180;
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 48),
      1,
      400,
    );
    const gravity = clampParticleNumber(
      getParticleParam(animation, "gravity", 180),
      -2000,
      2000,
    );
    const fadeOut = animation.params.fadeOut !== false;
    const requestedTrailCount = Math.round(
      clampParticleNumber(getParticleParam(animation, "trailCount", 2), 0, 8),
    );
    const trailSpacing = clampParticleNumber(
      getParticleParam(animation, "trailSpacing", 0.035),
      0.005,
      0.2,
    );
    const trailFade = clampParticleNumber(
      getParticleParam(animation, "trailFade", 0.5),
      0.05,
      0.95,
    );
    const rotateParticles = animation.params.rotateParticles !== false;
    const randomRotation = animation.params.randomRotation !== false;
    const randomRotationRange = clampParticleNumber(
      getParticleParam(animation, "randomRotationDegrees", 135),
      0,
      360,
    );
    const spinSpeed = clampParticleNumber(
      getParticleParam(animation, "spinSpeed", 1),
      0,
      10,
    );
    const duration = Math.max(animation.duration, 0.0001);
    const elapsed = progress * duration;
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;

    // Mobile-friendly guard: draw only currently alive particles and cap total sprites.
    // Actual sprites = aliveParticles * (effectiveTrailCount + 1).
    const maxStreamSprites = 360;
    const estimatedAliveCount = Math.max(
      1,
      Math.ceil(Math.min(elapsed, lifetime) * spawnRate) + 2,
    );
    const trailCount = Math.min(
      requestedTrailCount,
      Math.max(
        0,
        Math.floor(maxStreamSprites / Math.max(1, estimatedAliveCount)) - 1,
      ),
    );
    const maxActiveParticles = Math.max(
      1,
      Math.floor(maxStreamSprites / Math.max(1, trailCount + 1)),
    );
    const totalSpawnCount = Math.min(
      Math.ceil(duration * spawnRate),
      Math.floor(elapsed * spawnRate) + 1,
    );
    const firstAliveIndex = Math.max(
      0,
      Math.floor((elapsed - lifetime) * spawnRate) - 1,
      totalSpawnCount - maxActiveParticles,
    );

    for (let index = firstAliveIndex; index < totalSpawnCount; index += 1) {
      const spawnTime = index / spawnRate;
      const particleAge = elapsed - spawnTime;
      if (particleAge < 0 || particleAge > lifetime) continue;

      const randomA = seededRandom(animation.seed, index, 51);
      const randomB = seededRandom(animation.seed, index, 52);
      const randomC = seededRandom(animation.seed, index, 53);
      const randomD = seededRandom(animation.seed, index, 54);
      const randomE = seededRandom(animation.seed, index, 55);
      const randomF = seededRandom(animation.seed, index, 56);
      const angle = baseEmissionAngleRad + (randomA - 0.5) * emissionSpreadRad;
      const velocity = speed * (0.6 + randomB * 0.8);
      const startRadius = spread * Math.sqrt(randomC);
      const startOffsetAngle = randomD * Math.PI * 2;
      const startX = emitterX + Math.cos(startOffsetAngle) * startRadius;
      const startY = emitterY + Math.sin(startOffsetAngle) * startRadius;

      for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
        const trailAge = particleAge - trailIndex * trailSpacing;
        if (trailAge < 0 || trailAge > lifetime) continue;
        const localProgress = clampNumber(trailAge / lifetime, 0, 1);
        const x = startX + Math.cos(angle) * velocity * trailAge;
        const y =
          startY +
          Math.sin(angle) * velocity * trailAge +
          0.5 * gravity * trailAge * trailAge;
        const scale = Math.max(
          0.01,
          baseTextureScale *
            (0.55 + randomE * 0.9) *
            (1 - localProgress * 0.25),
        );
        const alpha =
          layerOpacity *
          (fadeOut ? Math.pow(1 - localProgress, 1.25) : 1) *
          Math.pow(trailFade, trailIndex) *
          (0.55 + randomC * 0.45);
        if (alpha <= 0.002) continue;

        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(x, y);
        sprite.scale.set(scale);
        if (rotateParticles) {
          const randomRotationOffset = randomRotation
            ? (randomF - 0.5) * ((randomRotationRange * Math.PI) / 180)
            : 0;
          sprite.rotation =
            randomRotationOffset +
            localProgress * Math.PI * (0.5 + randomB) * spinSpeed;
        } else {
          sprite.rotation = 0;
        }
        sprite.alpha = alpha;
        sprite.blendMode = toPixiBlendMode(blendMode);
        target.addChild(sprite);
      }
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

  private drawGatherParticles(
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
      clampParticleNumber(getParticleParam(animation, "count", 48), 1, 220),
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 42),
      1,
      400,
    );
    const spawnRadius = clampParticleNumber(
      getParticleParam(animation, "spawnRadius", 360),
      0,
      4000,
    );
    const spawnRatio = clampParticleNumber(
      getParticleParam(animation, "spawnRatio", 0.2),
      0.01,
      0.8,
    );
    const targetOffsetX = getParticleParam(animation, "targetX", 0);
    const targetOffsetY = -getParticleParam(animation, "targetY", 0);
    const travelMode = Math.round(
      clampParticleNumber(getParticleParam(animation, "travelMode", 1), 0, 2),
    );
    const curve = getParticleParam(animation, "curve", 160);
    const spiralTurns = clampParticleNumber(
      getParticleParam(animation, "spiralTurns", 0.75),
      -8,
      8,
    );
    const staggerRatio = clampParticleNumber(
      getParticleParam(animation, "staggerRatio", 0.28),
      0,
      0.9,
    );
    const requestedTrailCount = Math.round(
      clampParticleNumber(getParticleParam(animation, "trailCount", 3), 0, 10),
    );
    const maxGatherSprites = 360;
    const trailCount = Math.min(
      requestedTrailCount,
      Math.max(0, Math.floor(maxGatherSprites / Math.max(1, count)) - 1),
    );
    const trailSpacing = clampParticleNumber(
      getParticleParam(animation, "trailSpacing", 0.04),
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
      getParticleParam(animation, "flashIntensity", 1.35),
      0.1,
      3,
    );
    const alphaBase = layerOpacity;
    if (alphaBase <= 0.002) return;
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;
    const effectiveTravelWindow = Math.max(0.001, 1 - staggerRatio);

    for (let index = 0; index < count; index += 1) {
      const startOffset =
        count <= 1 ? 0 : (index / Math.max(1, count - 1)) * staggerRatio;
      for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
        const trailProgress = progress - trailIndex * trailSpacing;
        const localProgress =
          (trailProgress - startOffset) / effectiveTravelWindow;
        if (localProgress < 0 || localProgress > 1) continue;
        const point = sampleGatherParticlePoint(
          animation,
          index,
          localProgress,
          spawnRadius,
          spawnRatio,
          targetOffsetX,
          targetOffsetY,
          travelMode,
          curve,
          spiralTurns,
          vanishMode,
          vanishRatio,
          flashScale,
          flashIntensity,
        );
        if (point.alpha <= 0.002) continue;
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(emitterX + point.x, emitterY + point.y);
        sprite.scale.set(Math.max(0.01, baseTextureScale * point.scale));
        sprite.rotation = point.rotation;
        sprite.alpha =
          alphaBase * point.alpha * Math.pow(trailFade, trailIndex);
        sprite.blendMode = toPixiBlendMode(blendMode);
        target.addChild(sprite);
      }
    }
  }

  private drawSmokeMist(
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
      clampParticleNumber(getParticleParam(animation, "count", 56), 1, 180),
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 96),
      1,
      800,
    );
    const spawnRadius = clampParticleNumber(
      getParticleParam(animation, "spawnRadius", 80),
      0,
      3000,
    );
    const spread = clampParticleNumber(
      getParticleParam(animation, "spread", 320),
      0,
      5000,
    );
    const windX = getParticleParam(animation, "windX", 80);
    const windY = -getParticleParam(animation, "windY", 40);
    const swirl = getParticleParam(animation, "swirl", 120);
    const startAlpha = clampParticleNumber(
      getParticleParam(animation, "startAlpha", 0.62),
      0,
      1,
    );
    const fadePower = clampParticleNumber(
      getParticleParam(animation, "fadePower", 1.35),
      0.1,
      5,
    );
    const grow = clampParticleNumber(
      getParticleParam(animation, "grow", 2.1),
      0.1,
      8,
    );
    const sizeRandom = clampParticleNumber(
      getParticleParam(animation, "sizeRandom", 0.55),
      0,
      2,
    );
    const rotationSpeed = clampParticleNumber(
      getParticleParam(animation, "rotationSpeed", 0.6),
      -10,
      10,
    );
    const alphaBase = layerOpacity;
    if (alphaBase <= 0.002) return;
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;
    const duration = Math.max(animation.duration, 0.0001);

    for (let index = 0; index < count; index += 1) {
      const randomA = seededRandom(animation.seed, index, 1001);
      const randomB = seededRandom(animation.seed, index, 1002);
      const randomC = seededRandom(animation.seed, index, 1003);
      const randomD = seededRandom(animation.seed, index, 1004);
      const randomE = seededRandom(animation.seed, index, 1005);
      const randomF = seededRandom(animation.seed, index, 1006);
      const startAngle = randomA * Math.PI * 2;
      const startDistance = Math.sqrt(randomB) * spawnRadius;
      const outwardAngle = startAngle + (randomC - 0.5) * 0.9;
      const outwardDistance = spread * (0.35 + randomD * 0.85);
      const eased = easeOutQuad(progress);
      const drift =
        Math.sin(progress * Math.PI) * swirl * (randomE < 0.5 ? -1 : 1);
      const tangentX = -Math.sin(outwardAngle);
      const tangentY = Math.cos(outwardAngle);
      const x =
        Math.cos(startAngle) * startDistance +
        Math.cos(outwardAngle) * outwardDistance * eased +
        tangentX * drift +
        windX * progress * duration * (0.35 + randomF * 0.9);
      const y =
        Math.sin(startAngle) * startDistance +
        Math.sin(outwardAngle) * outwardDistance * eased +
        tangentY * drift +
        windY * progress * duration * (0.35 + randomF * 0.9);
      const edgeFade = Math.pow(Math.max(0, 1 - progress), fadePower);
      const appear = Math.min(1, progress / 0.12);
      const alpha =
        alphaBase * startAlpha * edgeFade * appear * (0.55 + randomC * 0.45);
      if (alpha <= 0.002) continue;
      const randomScale = Math.max(0.08, 1 + (randomB - 0.5) * sizeRandom * 2);
      const scale = baseTextureScale * randomScale * lerpNumber(1, grow, eased);
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(emitterX + x, emitterY + y);
      sprite.scale.set(Math.max(0.01, scale));
      sprite.rotation =
        (randomE - 0.5) * Math.PI * 2 +
        progress * Math.PI * 2 * rotationSpeed * (0.35 + randomA * 0.8);
      sprite.alpha = alpha;
      sprite.blendMode = toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawEnergyRing(
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
    const ringCount = Math.round(
      clampParticleNumber(getParticleParam(animation, "ringCount", 2), 1, 8),
    );
    const startScale = clampParticleNumber(
      getParticleParam(animation, "startScale", 0.25),
      0.01,
      20,
    );
    const endScale = clampParticleNumber(
      getParticleParam(animation, "endScale", 2.4),
      0.01,
      50,
    );
    const alphaBase =
      layerOpacity *
      clampParticleNumber(getParticleParam(animation, "alpha", 1), 0, 1);
    const stagger = clampParticleNumber(
      getParticleParam(animation, "stagger", 0.28),
      0,
      0.95,
    );
    const rotationDegrees = getParticleParam(animation, "rotation", 60);
    const pulse = clampParticleNumber(
      getParticleParam(animation, "pulse", 0.08),
      0,
      1,
    );
    const vanishMode = Math.round(
      clampParticleNumber(getParticleParam(animation, "vanishMode", 1), 0, 2),
    );
    const additive = animation.params.additive !== false;
    if (alphaBase <= 0.002) return;
    const travelWindow = Math.max(0.001, 1 - stagger);

    for (let index = 0; index < ringCount; index += 1) {
      const startOffset =
        ringCount <= 1 ? 0 : (index / Math.max(1, ringCount - 1)) * stagger;
      const local = (progress - startOffset) / travelWindow;
      if (local < 0 || local > 1) continue;
      const eased = easeOutQuad(local);
      let alphaCurve: number;
      if (vanishMode === 2) alphaCurve = Math.sin(local * Math.PI);
      else if (vanishMode === 1) alphaCurve = Math.pow(1 - eased, 1.35);
      else alphaCurve = 1 - local;
      const alpha = alphaBase * Math.max(0, alphaCurve);
      if (alpha <= 0.002) continue;
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(transform.anchorX, transform.anchorY);
      sprite.position.set(emitterX, emitterY);
      const ringScale =
        lerpNumber(startScale, endScale, eased) *
        (1 + Math.sin(local * Math.PI) * pulse);
      sprite.scale.set(
        transform.scaleX * ringScale,
        transform.scaleY * ringScale,
      );
      sprite.rotation =
        (transform.rotation * Math.PI) / 180 +
        ((rotationDegrees * Math.PI) / 180) * local +
        index * 0.17;
      sprite.alpha = alpha;
      sprite.blendMode = additive ? "add" : toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawSlashLight(
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
    const mode = Math.round(
      clampParticleNumber(getParticleParam(animation, "mode", 0), 0, 2),
    );
    const angleRad =
      (getParticleParam(animation, "angle", -25) * Math.PI) / 180;
    const travel = getParticleParam(animation, "travel", 180);
    const lengthScale = clampParticleNumber(
      getParticleParam(animation, "lengthScale", 2.4),
      0.01,
      50,
    );
    const widthScale = clampParticleNumber(
      getParticleParam(animation, "widthScale", 0.55),
      0.01,
      20,
    );
    const flashAlpha = clampParticleNumber(
      getParticleParam(animation, "flashAlpha", 1),
      0,
      1,
    );
    const startScale = clampParticleNumber(
      getParticleParam(animation, "startScale", 0.18),
      0.01,
      2,
    );
    const fadeRatio = clampParticleNumber(
      getParticleParam(animation, "fadeRatio", 0.45),
      0.05,
      0.95,
    );
    const curve = getParticleParam(animation, "curve", 90);
    const additive = animation.params.additive !== false;
    const alphaBase = layerOpacity * flashAlpha;
    if (alphaBase <= 0.002) return;

    const slashCount = mode === 2 ? 2 : 1;
    const appear = clampNumber(progress / 0.22, 0, 1);
    const fadeStart = Math.max(0.001, 1 - fadeRatio);
    const fade =
      progress <= fadeStart
        ? 1
        : 1 - clampNumber((progress - fadeStart) / fadeRatio, 0, 1);
    const flash = Math.sin(clampNumber(progress, 0, 1) * Math.PI);
    const reveal = lerpNumber(startScale, 1, easeOutQuad(appear));
    const alpha = alphaBase * Math.max(0, fade) * Math.max(0.25, flash);
    if (alpha <= 0.002) return;

    for (let index = 0; index < slashCount; index += 1) {
      const crossAngle = angleRad + (index === 1 ? Math.PI / 2 : 0);
      const dirX = Math.cos(crossAngle);
      const dirY = Math.sin(crossAngle);
      const perpX = -dirY;
      const perpY = dirX;
      const localProgress =
        mode === 2 && index === 1
          ? clampNumber(progress * 1.12 - 0.08, 0, 1)
          : progress;
      const sweep = (localProgress - 0.5) * travel;
      const curveOffset =
        mode === 0
          ? 0
          : Math.sin(localProgress * Math.PI) *
            curve *
            (index === 1 ? -0.75 : 1);
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(transform.anchorX, transform.anchorY);
      sprite.position.set(
        emitterX + dirX * sweep + perpX * curveOffset,
        emitterY + dirY * sweep + perpY * curveOffset,
      );
      sprite.scale.set(
        transform.scaleX * lengthScale * reveal,
        transform.scaleY * widthScale * (1 + flash * 0.18),
      );
      sprite.rotation =
        (transform.rotation * Math.PI) / 180 + crossAngle + flash * 0.08;
      sprite.alpha = alpha * (index === 1 ? 0.82 : 1);
      sprite.blendMode = additive ? "add" : toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawFlameFlicker(
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
      clampParticleNumber(getParticleParam(animation, "count", 52), 1, 160),
    );
    const emitterWidth = clampParticleNumber(
      getParticleParam(animation, "emitterWidth", 180),
      0,
      3000,
    );
    const height = clampParticleNumber(
      getParticleParam(animation, "height", 420),
      1,
      5000,
    );
    const direction =
      (getParticleParam(animation, "direction", 270) * Math.PI) / 180;
    const spreadAngle =
      (clampParticleNumber(
        getParticleParam(animation, "spreadAngle", 22),
        0,
        180,
      ) *
        Math.PI) /
      180;
    const vanishSpread = clampParticleNumber(
      getParticleParam(animation, "vanishSpread", 120),
      0,
      3000,
    );
    const lengthRandom = clampParticleNumber(
      getParticleParam(animation, "lengthRandom", 0.35),
      0,
      1,
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 96),
      1,
      800,
    );
    const sway = clampParticleNumber(
      getParticleParam(animation, "sway", 54),
      0,
      2000,
    );
    const turbulence = clampParticleNumber(
      getParticleParam(animation, "turbulence", 80),
      0,
      3000,
    );
    const grow = clampParticleNumber(
      getParticleParam(animation, "grow", 1.65),
      0.1,
      8,
    );
    const alphaBase =
      layerOpacity *
      clampParticleNumber(getParticleParam(animation, "alpha", 0.9), 0, 1);
    const flicker = clampParticleNumber(
      getParticleParam(animation, "flicker", 0.35),
      0,
      1,
    );
    const legacySpeed = getParticleParam(animation, "speed", 1);
    const cycles = Math.max(
      1,
      Math.round(
        clampParticleNumber(
          getParticleParam(animation, "cycles", legacySpeed),
          1,
          60,
        ),
      ),
    );
    const additive = animation.params.additive !== false;
    if (alphaBase <= 0.002) return;

    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;
    const loopPhase = progress * cycles;
    const travel = positiveModulo(loopPhase, 1);
    const dirX = Math.cos(direction);
    const dirY = Math.sin(direction);
    const emitterPerpX = -dirY;
    const emitterPerpY = dirX;

    for (let index = 0; index < count; index += 1) {
      const randomA = seededRandom(animation.seed, index, 1101);
      const randomB = seededRandom(animation.seed, index, 1102);
      const randomC = seededRandom(animation.seed, index, 1103);
      const randomD = seededRandom(animation.seed, index, 1104);
      const randomE = seededRandom(animation.seed, index, 1105);
      const randomF = seededRandom(animation.seed, index, 1106);
      const randomG = seededRandom(animation.seed, index, 1107);
      const local = positiveModulo(randomA + travel, 1);
      const eased = easeOutQuad(local);
      const edgeAlpha = Math.sin(local * Math.PI);
      const flickerWave =
        1 -
        flicker * 0.5 +
        flicker * Math.sin(loopPhase * Math.PI * 14 + randomB * 9);
      const alpha =
        alphaBase * Math.max(0, edgeAlpha) * clampNumber(flickerWave, 0.1, 1.5);
      if (alpha <= 0.002) continue;

      const particleAngle = direction + (randomC - 0.5) * spreadAngle;
      const particleDirX = Math.cos(particleAngle);
      const particleDirY = Math.sin(particleAngle);
      const particlePerpX = -particleDirY;
      const particlePerpY = particleDirX;
      const startOffset = (randomB - 0.5) * emitterWidth;
      const distanceScale = 1 - lengthRandom * randomD;
      const distance = height * distanceScale * eased;
      const endSpread = (randomF - 0.5) * vanishSpread * Math.pow(local, 1.35);
      const wave =
        Math.sin(local * Math.PI * 2 + randomE * Math.PI * 2) *
        sway *
        (0.15 + local * 0.85);
      const jitterAlong = (randomG - 0.5) * turbulence * 0.25 * local;
      const jitterSide = (randomE - 0.5) * turbulence * local;
      const x =
        emitterPerpX * startOffset +
        particleDirX * (distance + jitterAlong) +
        particlePerpX * (wave + jitterSide + endSpread);
      const y =
        emitterPerpY * startOffset +
        particleDirY * (distance + jitterAlong) +
        particlePerpY * (wave + jitterSide + endSpread);
      const midGrow = 1 + Math.sin(local * Math.PI) * (grow - 1);
      const taper = lerpNumber(0.65, 0.28, local);
      const scale = baseTextureScale * (0.55 + randomD * 0.8) * midGrow * taper;
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(emitterX + x, emitterY + y);
      sprite.scale.set(Math.max(0.01, scale * (1 + flicker * 0.18)));
      sprite.rotation =
        particleAngle +
        Math.PI / 2 +
        (randomA - 0.5) * 0.45 +
        Math.sin(local * Math.PI * 4 + randomB * Math.PI * 2) * 0.22;
      sprite.alpha = alpha;
      sprite.blendMode = additive ? "add" : toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawWaveBand(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const mode = Math.round(
      clampParticleNumber(getParticleParam(animation, "mode", 0), 0, 2),
    );
    const count = Math.round(
      clampParticleNumber(getParticleParam(animation, "count", 36), 2, 160),
    );
    const length = clampParticleNumber(
      getParticleParam(animation, "length", 720),
      1,
      8000,
    );
    const amplitude = clampParticleNumber(
      getParticleParam(animation, "amplitude", 70),
      0,
      3000,
    );
    const frequency = clampParticleNumber(
      getParticleParam(animation, "frequency", 2.5),
      0,
      30,
    );
    const speed = clampParticleNumber(
      getParticleParam(animation, "speed", 1),
      0.05,
      8,
    );
    const direction =
      (getParticleParam(animation, "direction", 0) * Math.PI) / 180;
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 48),
      1,
      800,
    );
    const alphaBase =
      layerOpacity *
      clampParticleNumber(getParticleParam(animation, "alpha", 1), 0, 1);
    const trailFade = clampParticleNumber(
      getParticleParam(animation, "trailFade", 0.75),
      0.05,
      1,
    );
    const rotateToWave = animation.params.rotateToWave !== false;
    if (alphaBase <= 0.002) return;

    const dirX = Math.cos(direction);
    const dirY = Math.sin(direction);
    const perpX = -dirY;
    const perpY = dirX;
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;
    const flow = positiveModulo(progress * speed, 1);

    for (let index = 0; index < count; index += 1) {
      const baseT = count <= 1 ? 0 : index / Math.max(1, count - 1);
      let t = baseT;
      let visible = 1;
      if (mode === 0) {
        t = positiveModulo(baseT + flow, 1);
        visible = Math.sin(baseT * Math.PI);
      } else if (mode === 1) {
        const head = progress * (1 + 1 / count);
        const local = head - baseT;
        if (local < 0 || local > 1) continue;
        t = baseT;
        visible = Math.sin(clampNumber(local, 0, 1) * Math.PI);
      } else {
        const centerDistance = Math.abs(baseT - 0.5) * 2;
        const local = progress * 1.25 - centerDistance * 0.65;
        if (local < 0 || local > 1) continue;
        t = baseT;
        visible = Math.sin(clampNumber(local, 0, 1) * Math.PI);
      }
      const along = (t - 0.5) * length;
      const wave = Math.sin((t * frequency + flow) * Math.PI * 2);
      const x = dirX * along + perpX * amplitude * wave;
      const y = dirY * along + perpY * amplitude * wave;
      const edge = Math.pow(Math.max(0, Math.sin(baseT * Math.PI)), 1.25);
      const alpha =
        alphaBase * Math.max(0, visible) * lerpNumber(trailFade, 1, edge);
      if (alpha <= 0.002) continue;
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(emitterX + x, emitterY + y);
      const scale = baseTextureScale * (0.75 + edge * 0.35);
      sprite.scale.set(Math.max(0.01, scale));
      if (rotateToWave) {
        const slope =
          Math.cos((t * frequency + flow) * Math.PI * 2) *
          Math.PI *
          2 *
          frequency *
          amplitude;
        sprite.rotation = direction + Math.atan2(slope, length);
      } else {
        sprite.rotation = 0;
      }
      sprite.alpha = alpha;
      sprite.blendMode = toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawWaveDistort(
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
    const rows = Math.round(
      clampParticleNumber(getParticleParam(animation, "rows", 36), 2, 120),
    );
    const amplitude = clampParticleNumber(
      getParticleParam(animation, "amplitude", 24),
      0,
      500,
    );
    const frequency = clampParticleNumber(
      getParticleParam(animation, "frequency", 2),
      0,
      20,
    );
    const legacySpeed = getParticleParam(animation, "speed", 1);
    const cycles = Math.max(
      1,
      Math.round(
        clampParticleNumber(
          getParticleParam(animation, "cycles", Math.abs(legacySpeed)),
          1,
          60,
        ),
      ),
    );
    const flowDirection = legacySpeed < 0 ? -1 : 1;
    const phaseOffset = clampParticleNumber(
      getParticleParam(animation, "phaseOffset", 1),
      -10,
      10,
    );
    const verticalBob = clampParticleNumber(
      getParticleParam(animation, "verticalBob", 0),
      0,
      300,
    );
    const alphaBase =
      layerOpacity *
      clampParticleNumber(getParticleParam(animation, "alpha", 1), 0, 1);
    const edgeFeather = clampParticleNumber(
      getParticleParam(animation, "edgeFeather", 0),
      0,
      1,
    );
    if (alphaBase <= 0.002) return;

    const textureWidth = Math.max(1, Number(texture.width) || 1);
    const textureHeight = Math.max(1, Number(texture.height) || 1);
    const safeRows = Math.max(2, rows);
    const rotationRad = (transform.rotation * Math.PI) / 180;
    const flow = progress * cycles * flowDirection;
    const bob = Math.sin(progress * Math.PI * 2 * cycles) * verticalBob;
    const source = texture.source;
    const baseFrame = texture.frame;
    const baseFrameX = baseFrame?.x ?? 0;
    const baseFrameY = baseFrame?.y ?? 0;
    const baseFrameWidth = Math.max(1, baseFrame?.width ?? textureWidth);
    const baseFrameHeight = Math.max(1, baseFrame?.height ?? textureHeight);
    const anchorOffsetX = (0.5 - transform.anchorX) * textureWidth;
    const anchorOffsetY = (0.5 - transform.anchorY) * textureHeight;

    for (let row = 0; row < safeRows; row += 1) {
      const y0 = (row / safeRows) * textureHeight;
      const y1 = ((row + 1) / safeRows) * textureHeight;
      const sliceHeight = Math.max(1, y1 - y0);
      const centerT = (row + 0.5) / safeRows;
      const wave = Math.sin(
        (centerT * frequency * phaseOffset + flow) * Math.PI * 2,
      );
      const secondWave = Math.sin(
        (centerT * (frequency * 0.55 + 0.25) - flow) * Math.PI * 2,
      );
      const offsetX = amplitude * (wave * 0.78 + secondWave * 0.22);
      const edge = Math.sin(centerT * Math.PI);
      const alpha =
        alphaBase *
        (edgeFeather > 0
          ? lerpNumber(Math.max(0, edge), 1, 1 - edgeFeather)
          : 1);
      if (alpha <= 0.002) continue;

      const frameY = baseFrameY + (y0 / textureHeight) * baseFrameHeight;
      const frameHeight = Math.max(
        1,
        ((y1 - y0) / textureHeight) * baseFrameHeight,
      );
      const sliceTexture = new PIXI.Texture({
        source,
        frame: new PIXI.Rectangle(
          baseFrameX,
          frameY,
          baseFrameWidth,
          frameHeight,
        ),
      });
      const sprite = new PIXI.Sprite(sliceTexture);
      const localY = y0 + sliceHeight / 2 - textureHeight * 0.5 + anchorOffsetY;
      sprite.anchor.set(0.5);
      sprite.position.set(
        emitterX + offsetX + anchorOffsetX,
        emitterY + localY + bob,
      );
      sprite.scale.set(transform.scaleX, transform.scaleY);
      sprite.rotation = rotationRad;
      sprite.alpha = alpha;
      sprite.blendMode = toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawSpeedLines(
    animation: V5GAnimationConfig,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const mode = Math.round(
      clampParticleNumber(getParticleParam(animation, "mode", 0), 0, 2),
    );
    const count = Math.round(
      clampParticleNumber(getParticleParam(animation, "count", 72), 4, 180),
    );
    const radius = clampParticleNumber(
      getParticleParam(animation, "radius", 520),
      20,
      4000,
    );
    const length = clampParticleNumber(
      getParticleParam(animation, "length", 120),
      4,
      1000,
    );
    const speed = clampParticleNumber(
      getParticleParam(animation, "speed", 1.4),
      0.05,
      8,
    );
    const direction =
      (getParticleParam(animation, "direction", 0) * Math.PI) / 180;
    const spreadAngle =
      (clampParticleNumber(
        getParticleParam(animation, "spreadAngle", 360),
        1,
        360,
      ) *
        Math.PI) /
      180;
    const lineWidth = clampParticleNumber(
      getParticleParam(animation, "lineWidth", 3),
      0.5,
      40,
    );
    const alphaBase =
      layerOpacity *
      clampParticleNumber(getParticleParam(animation, "alpha", 0.75), 0, 1);
    if (alphaBase <= 0.002) return;

    const graphics = new PIXI.Graphics();
    graphics.blendMode = toPixiBlendMode(blendMode);
    const travel = positiveModulo(progress * speed, 1);

    for (let index = 0; index < count; index += 1) {
      const randomA = seededRandom(animation.seed, index, 701);
      const randomB = seededRandom(animation.seed, index, 702);
      const randomC = seededRandom(animation.seed, index, 703);
      const randomD = seededRandom(animation.seed, index, 704);
      const local = positiveModulo(randomA + travel, 1);
      const fade =
        animation.params.fadeOut === false ? 1 : Math.sin(local * Math.PI);
      const alpha = alphaBase * Math.max(0.04, fade) * (0.5 + randomB * 0.5);
      if (alpha <= 0.002) continue;

      let x1: number;
      let y1: number;
      let x2: number;
      let y2: number;
      if (mode === 1) {
        const dirX = Math.cos(direction);
        const dirY = Math.sin(direction);
        const perpX = -dirY;
        const perpY = dirX;
        const travelDistance = (local - 0.5) * radius * 2;
        const sideOffset = (randomC - 0.5) * radius * 2;
        const headX = emitterX + dirX * travelDistance + perpX * sideOffset;
        const headY = emitterY + dirY * travelDistance + perpY * sideOffset;
        const segmentLength = length * (0.45 + randomD * 0.9);
        x1 = headX - dirX * segmentLength;
        y1 = headY - dirY * segmentLength;
        x2 = headX;
        y2 = headY;
      } else {
        const angle =
          direction +
          (randomB - 0.5) * spreadAngle +
          (mode === 2 ? progress * 0.35 : 0);
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const distance =
          mode === 2 ? Math.pow(local, 1.7) * radius : local * radius;
        const segmentLength =
          length * (0.35 + local * 0.85) * (0.7 + randomC * 0.6);
        const startDistance = Math.max(0, distance - segmentLength);
        x1 = emitterX + dirX * startDistance;
        y1 = emitterY + dirY * startDistance;
        x2 = emitterX + dirX * distance;
        y2 = emitterY + dirY * distance;
      }

      graphics
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({
          color: 0xffffff,
          width: lineWidth * (0.55 + randomD * 0.7),
          alpha,
        });
    }

    target.addChild(graphics);
  }

  private drawDriftFall(
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
      clampParticleNumber(getParticleParam(animation, "count", 48), 1, 180),
    );
    const areaWidth = clampParticleNumber(
      getParticleParam(animation, "areaWidth", 900),
      20,
      6000,
    );
    const areaHeight = clampParticleNumber(
      getParticleParam(animation, "areaHeight", 1600),
      20,
      6000,
    );
    const legacyFallSpeed = getParticleParam(animation, "fallSpeed", 260);
    const cycles = Math.max(
      1,
      Math.round(
        clampParticleNumber(
          getParticleParam(
            animation,
            "cycles",
            legacyFallSpeed / Math.max(1, areaHeight),
          ),
          1,
          60,
        ),
      ),
    );
    const wind = clampParticleNumber(
      getParticleParam(animation, "wind", 45),
      -2000,
      2000,
    );
    const swayAmplitude = clampParticleNumber(
      getParticleParam(animation, "swayAmplitude", 42),
      0,
      1000,
    );
    const swayFrequency = Math.round(
      clampParticleNumber(
        getParticleParam(animation, "swayFrequency", 1),
        0,
        20,
      ),
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 48),
      1,
      400,
    );
    const sizeRandom = clampParticleNumber(
      getParticleParam(animation, "sizeRandom", 0.45),
      0,
      2,
    );
    const rotationSpeed = Math.round(
      clampParticleNumber(
        getParticleParam(animation, "rotationSpeed", 1),
        -20,
        20,
      ),
    );
    const alphaBase =
      layerOpacity *
      clampParticleNumber(getParticleParam(animation, "alpha", 1), 0, 1);
    if (alphaBase <= 0.002) return;

    const loopPhase = progress * cycles;
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;
    const fadeEdges = animation.params.fadeEdges !== false;

    for (let index = 0; index < count; index += 1) {
      const randomA = seededRandom(animation.seed, index, 801);
      const randomB = seededRandom(animation.seed, index, 802);
      const randomC = seededRandom(animation.seed, index, 803);
      const randomD = seededRandom(animation.seed, index, 804);
      const randomE = seededRandom(animation.seed, index, 805);
      const fallLocal = positiveModulo(randomA + loopPhase, 1);
      const baseX = (randomC - 0.5) * areaWidth;
      const baseY = (fallLocal - 0.5) * areaHeight;
      const sway =
        Math.sin(
          loopPhase * Math.PI * 2 * swayFrequency + randomE * Math.PI * 2,
        ) *
        swayAmplitude *
        (0.45 + randomB * 0.75);
      const windOffset = (fallLocal - 0.5) * wind * 0.35;
      const edgeAlpha = fadeEdges
        ? Math.min(1, Math.sin(fallLocal * Math.PI) * 1.35)
        : 1;
      const alpha = alphaBase * edgeAlpha * (0.55 + randomD * 0.45);
      if (alpha <= 0.002) continue;

      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(
        emitterX + baseX + sway + windOffset,
        emitterY + baseY,
      );
      const scaleRandom = Math.max(0.05, 1 + (randomB - 0.5) * sizeRandom * 2);
      sprite.scale.set(Math.max(0.01, baseTextureScale * scaleRandom));
      sprite.rotation =
        (randomE - 0.5) * Math.PI * 2 + loopPhase * Math.PI * 2 * rotationSpeed;
      sprite.alpha = alpha;
      sprite.blendMode = toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawPathParticles(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const pathMode = Math.round(
      clampParticleNumber(getParticleParam(animation, "pathMode", 1), 0, 4),
    );
    const count = Math.round(
      clampParticleNumber(getParticleParam(animation, "count", 36), 1, 160),
    );
    const size = clampParticleNumber(
      getParticleParam(animation, "size", 42),
      1,
      400,
    );
    const endX = getParticleParam(animation, "endX", 360);
    const endY = -getParticleParam(animation, "endY", 0);
    const curve = getParticleParam(animation, "curve", 160);
    const amplitude = clampParticleNumber(
      getParticleParam(animation, "amplitude", 70),
      0,
      2000,
    );
    const frequency = clampParticleNumber(
      getParticleParam(animation, "frequency", 2.5),
      0,
      20,
    );
    const radiusStart = clampParticleNumber(
      getParticleParam(animation, "radiusStart", 240),
      0,
      3000,
    );
    const radiusEnd = clampParticleNumber(
      getParticleParam(animation, "radiusEnd", 60),
      0,
      3000,
    );
    const turns = clampParticleNumber(
      getParticleParam(animation, "turns", 1.5),
      -10,
      10,
    );
    const speed = clampParticleNumber(
      getParticleParam(animation, "speed", 1),
      0.05,
      8,
    );
    const stagger = clampParticleNumber(
      getParticleParam(animation, "stagger", 1),
      0,
      1,
    );
    const oneShotStagger = clampParticleNumber(
      getParticleParam(animation, "oneShotStagger", 0.25),
      0,
      0.95,
    );
    const requestedTrailCount = Math.round(
      clampParticleNumber(getParticleParam(animation, "trailCount", 3), 0, 10),
    );
    const maxPathSprites = 360;
    const trailCount = Math.min(
      requestedTrailCount,
      Math.max(0, Math.floor(maxPathSprites / Math.max(1, count)) - 1),
    );
    const trailSpacing = clampParticleNumber(
      getParticleParam(animation, "trailSpacing", 0.035),
      0.005,
      0.25,
    );
    const trailFade = clampParticleNumber(
      getParticleParam(animation, "trailFade", 0.55),
      0.05,
      0.95,
    );
    const alphaBase =
      layerOpacity *
      clampParticleNumber(getParticleParam(animation, "alpha", 1), 0, 1);
    if (alphaBase <= 0.002) return;

    const rotateToPath = animation.params.rotateToPath !== false;
    const fadeEnds = animation.params.fadeEnds !== false;
    const textureEdge = getTextureLongestEdge(texture);
    const baseTextureScale = size / textureEdge;
    const loop = animation.params.loop !== false;
    const travel = loop ? positiveModulo(progress * speed, 1) : progress;
    const oneShotStaggerWindow = loop ? 0 : oneShotStagger;
    const oneShotTravelWindow = Math.max(0.001, 1 - oneShotStaggerWindow);

    for (let index = 0; index < count; index += 1) {
      const randomA = seededRandom(animation.seed, index, 901);
      const randomB = seededRandom(animation.seed, index, 902);
      const randomC = seededRandom(animation.seed, index, 903);
      const offset =
        count <= 1 ? 0 : (index / Math.max(1, count - 1)) * stagger;
      const oneShotStartOffset =
        count <= 1
          ? 0
          : (index / Math.max(1, count - 1)) * oneShotStaggerWindow;
      for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
        const local = loop
          ? positiveModulo(travel + offset - trailIndex * trailSpacing, 1)
          : (travel - oneShotStartOffset) / oneShotTravelWindow -
            trailIndex * trailSpacing;
        if (!loop && (local < 0 || local > 1)) continue;
        const edgeAlpha = fadeEnds
          ? Math.min(1, Math.sin(local * Math.PI) * 1.45)
          : 1;
        const alpha =
          alphaBase *
          edgeAlpha *
          Math.pow(trailFade, trailIndex) *
          (0.6 + randomB * 0.4);
        if (alpha <= 0.002) continue;

        const point = samplePathParticlePoint(
          pathMode,
          local,
          endX,
          endY,
          curve,
          amplitude,
          frequency,
          radiusStart,
          radiusEnd,
          turns,
        );
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(emitterX + point.x, emitterY + point.y);
        const scale =
          baseTextureScale *
          (0.75 + randomA * 0.55) *
          (trailIndex === 0 ? 1 : 0.86);
        sprite.scale.set(Math.max(0.01, scale));
        sprite.rotation = rotateToPath
          ? point.rotation
          : (randomC - 0.5) * Math.PI * 2 + local * Math.PI * 2;
        sprite.alpha = alpha;
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

  private drawChaserLight(
    animation: V5GAnimationConfig,
    texture: PIXI.Texture,
    emitterX: number,
    emitterY: number,
    progress: number,
    layerOpacity: number,
    blendMode: V5GBlendMode,
    target: PIXI.Container,
  ): void {
    const totalCount = Math.round(
      clampParticleNumber(
        getParticleParam(animation, "totalCount", 12),
        2,
        200,
      ),
    );
    const spacing = clampParticleNumber(
      getParticleParam(animation, "spacing", 40),
      4,
      500,
    );
    const lightDuration = clampParticleNumber(
      getParticleParam(animation, "lightDuration", 0.3),
      0.03,
      5,
    );
    const interval = clampParticleNumber(
      getParticleParam(animation, "interval", 0.1),
      0.01,
      5,
    );
    const trajectory = Math.round(
      clampParticleNumber(getParticleParam(animation, "trajectory", 0), 0, 2),
    );
    const radius = clampParticleNumber(
      getParticleParam(animation, "radius", 200),
      10,
      3000,
    );
    const centerX = getParticleParam(animation, "centerX", 0);
    const centerY = -getParticleParam(animation, "centerY", 0);
    const endX = getParticleParam(animation, "endX", 320);
    const endY = -getParticleParam(animation, "endY", 0);
    const curve = getParticleParam(animation, "curve", 120);
    const lightSize = clampParticleNumber(
      getParticleParam(animation, "lightSize", 48),
      4,
      400,
    );
    const dimAlpha = clampParticleNumber(
      getParticleParam(animation, "dimAlpha", 0.15),
      0,
      1,
    );
    const elapsed = progress * Math.max(animation.duration, 0.0001);
    const chasePeriod = Math.max(0.0001, lightDuration + interval);
    const loopPeriod = chasePeriod * totalCount;

    for (let index = 0; index < totalCount; index += 1) {
      const point = sampleChaserLightPoint(
        trajectory,
        index,
        totalCount,
        spacing,
        radius,
        centerX,
        centerY,
        endX,
        endY,
        curve,
      );
      const localTime = positiveModulo(
        elapsed - index * chasePeriod,
        loopPeriod,
      );
      const isLit = localTime < lightDuration;
      const lightWave = isLit
        ? 0.7 + 0.3 * Math.sin((localTime / lightDuration) * Math.PI)
        : 0;
      const alpha = layerOpacity * (isLit ? 1 : dimAlpha);
      if (alpha <= 0.002) continue;
      const textureEdge = getTextureLongestEdge(texture);
      const scale =
        (lightSize / textureEdge) * (isLit ? 1 + lightWave * 0.18 : 1);
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(emitterX + point.x, emitterY + point.y);
      sprite.scale.set(Math.max(0.01, scale));
      sprite.rotation = point.rotation;
      sprite.alpha = alpha;
      sprite.blendMode = isLit ? "add" : toPixiBlendMode(blendMode);
      target.addChild(sprite);
    }
  }

  private drawSelection(): void {
    this.selectionGraphics.clear();
    if (!this.state.showSelectionOutline) return;
    const layer = this.state.project.layers.find(
      (item) => item.id === this.state.selectedLayerId,
    );
    const temporarySoloLayerId = this.state.temporarySoloLayerId ?? null;
    const canDrawSelection =
      temporarySoloLayerId === null
        ? layer !== undefined &&
          isLayerEffectivelyVisible(this.state.project, layer)
        : layer?.id === temporarySoloLayerId;
    if (!layer || !canDrawSelection) return;
    const wrapper = this.layerWrapperMap.get(layer.id);
    const display = this.layerDisplayMap.get(layer.id);
    const target = wrapper ?? display;
    if (!target) return;
    const bounds = target.getBounds();
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

        width: 3 / this.viewScale,

        alpha: 0.95,
      });
  }

  private handleLayerPointerDown(
    event: PIXI.FederatedPointerEvent,
    layerId: string,
  ): void {
    const layer = this.state.project.layers.find((item) => item.id === layerId);
    const display = this.layerDisplayMap.get(layerId);
    const temporarySoloLayerId = this.state.temporarySoloLayerId ?? null;
    const canInteract =
      temporarySoloLayerId === null &&
      layer !== undefined &&
      isLayerEffectivelyVisible(this.state.project, layer);
    if (!layer || layer.locked || !canInteract) {
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

  private isCurrentRender(runId: number): boolean {
    return runId === this.renderRunId;
  }

  private getLayerDisplayAssetId(layer: V5GLayerConfig): string | null {
    if (layer.type === "image") return layer.assetId;
    if (layer.type === "sequence") return this.getSequenceFrameAssetId(layer);
    return null;
  }

  private getSequenceFrameAssetId(layer: V5GLayerConfig): string | null {
    const frameAssetIds = layer.sequence?.frameAssetIds ?? [];
    if (frameAssetIds.length === 0) return null;
    if (frameAssetIds.length === 1) return frameAssetIds[0] ?? null;
    const cycleDuration = Math.max(0.01, layer.sequence?.cycleDuration ?? 0);
    const frameDuration = cycleDuration / frameAssetIds.length;
    const rawTime = Math.max(0, this.state.playheadSeconds);
    const sequenceTime =
      layer.sequence?.loop === false
        ? Math.min(rawTime, Math.max(0, cycleDuration - 0.000001))
        : positiveModulo(rawTime, cycleDuration);
    const frameIndex = clampNumber(
      Math.floor(sequenceTime / Math.max(0.000001, frameDuration)),
      0,
      frameAssetIds.length - 1,
    );
    return frameAssetIds[Math.floor(frameIndex)] ?? null;
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
  if (time < start) return null;
  if (time > end) return null;
  if (time === end) return 1;
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

function samplePathParticlePoint(
  pathMode: number,
  progress: number,
  endX: number,
  endY: number,
  curve: number,
  amplitude: number,
  frequency: number,
  radiusStart: number,
  radiusEnd: number,
  turns: number,
  sampleOffset = 0.002,
  skipRotation = false,
): { x: number; y: number; rotation: number } {
  const t = positiveModulo(progress, 1);
  let point: { x: number; y: number };
  if (pathMode === 4) {
    const angle = -Math.PI / 2 + t * Math.PI * 2 * turns;
    point = { x: Math.cos(angle) * radiusEnd, y: Math.sin(angle) * radiusEnd };
  } else if (pathMode === 3) {
    const angle = -Math.PI / 2 + t * Math.PI * 2 * turns;
    const radius = lerpNumber(radiusStart, radiusEnd, t);
    point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  } else if (pathMode === 2) {
    const baseX = lerpNumber(0, endX, t);
    const baseY = lerpNumber(0, endY, t);
    const dx = endX;
    const dy = endY;
    const length = Math.hypot(dx, dy) || 1;
    const wave = Math.sin(t * Math.PI * 2 * frequency);
    point = {
      x: baseX + (-dy / length) * amplitude * wave,
      y: baseY + (dx / length) * amplitude * wave,
    };
  } else if (pathMode === 1) {
    point = quadraticPoint(0, 0, endX, endY, curve, t);
  } else {
    point = { x: lerpNumber(0, endX, t), y: lerpNumber(0, endY, t) };
  }
  if (skipRotation) return { ...point, rotation: 0 };
  const next = samplePathParticlePoint(
    pathMode,
    t + sampleOffset,
    endX,
    endY,
    curve,
    amplitude,
    frequency,
    radiusStart,
    radiusEnd,
    turns,
    sampleOffset,
    true,
  );
  return {
    ...point,
    rotation: Math.atan2(next.y - point.y, next.x - point.x),
  };
}

function sampleChaserLightPoint(
  trajectory: number,
  index: number,
  totalCount: number,
  spacing: number,
  radius: number,
  centerX: number,
  centerY: number,
  endX: number,
  endY: number,
  curve: number,
): { x: number; y: number; rotation: number } {
  if (trajectory === 0) {
    const angle = (index * spacing) / Math.max(radius, 1) - Math.PI / 2;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      rotation: angle + Math.PI / 2,
    };
  }

  const t = totalCount <= 1 ? 0 : index / Math.max(totalCount - 1, 1);
  if (trajectory === 2) {
    const point = quadraticPoint(centerX, centerY, endX, endY, curve, t);
    const nextT = clampNumber(t + 0.01, 0, 1);
    const nextPoint = quadraticPoint(
      centerX,
      centerY,
      endX,
      endY,
      curve,
      nextT,
    );
    return {
      ...point,
      rotation: Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x),
    };
  }

  const x = lerpNumber(centerX, endX, t);
  const y = lerpNumber(centerY, endY, t);
  return { x, y, rotation: Math.atan2(endY - centerY, endX - centerX) };
}

function positiveModulo(value: number, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
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

function sampleGatherParticlePoint(
  animation: V5GAnimationConfig,
  index: number,
  progress: number,
  spawnRadius: number,
  spawnRatio: number,
  targetOffsetX: number,
  targetOffsetY: number,
  travelMode: number,
  curve: number,
  spiralTurns: number,
  vanishMode: number,
  vanishRatio: number,
  flashScale: number,
  flashIntensity: number,
): ParticleComboPoint {
  const p = clampNumber(progress, 0, 1);
  const randomA = seededRandom(animation.seed, index, 951);
  const randomB = seededRandom(animation.seed, index, 952);
  const randomC = seededRandom(animation.seed, index, 953);
  const randomD = seededRandom(animation.seed, index, 954);
  const randomE = seededRandom(animation.seed, index, 955);
  const randomF = seededRandom(animation.seed, index, 956);
  const startAngle = randomA * Math.PI * 2;
  const startDistance = Math.sqrt(randomB) * spawnRadius;
  const startX = Math.cos(startAngle) * startDistance;
  const startY = Math.sin(startAngle) * startDistance;
  const targetX = targetOffsetX;
  const targetY = targetOffsetY;
  const travelStart = spawnRatio;
  const vanishStart = Math.max(travelStart + 0.001, 1 - vanishRatio);
  const travelDuration = Math.max(0.001, vanishStart - travelStart);
  const appearPhase = clampNumber(p / Math.max(spawnRatio, 0.001), 0, 1);
  const travelPhase = clampNumber((p - travelStart) / travelDuration, 0, 1);
  const vanishPhase = clampNumber(
    (p - vanishStart) / Math.max(vanishRatio, 0.001),
    0,
    1,
  );
  const easedAppear = easeOutQuad(appearPhase);
  const easedTravel = easeInOutQuad(travelPhase);
  const easedVanish = easeOutQuad(vanishPhase);

  let x = startX;
  let y = startY;
  if (p >= travelStart) {
    if (travelMode === 2) {
      const dx = startX - targetX;
      const dy = startY - targetY;
      const distance = Math.hypot(dx, dy);
      const baseAngle = Math.atan2(dy, dx);
      const angle =
        baseAngle +
        easedTravel * Math.PI * 2 * spiralTurns +
        (randomC - 0.5) * 0.55;
      const radius = distance * (1 - easedTravel);
      const drift =
        curve * Math.sin(easedTravel * Math.PI) * (randomD < 0.5 ? -1 : 1);
      x =
        targetX +
        Math.cos(angle) * radius +
        Math.cos(angle + Math.PI / 2) * drift;
      y =
        targetY +
        Math.sin(angle) * radius +
        Math.sin(angle + Math.PI / 2) * drift;
    } else if (travelMode === 1) {
      const curved = quadraticPoint(
        startX,
        startY,
        targetX,
        targetY,
        curve * (randomD < 0.5 ? -1 : 1),
        easedTravel,
      );
      x = curved.x;
      y = curved.y;
    } else {
      x = lerpNumber(startX, targetX, easedTravel);
      y = lerpNumber(startY, targetY, easedTravel);
    }
  }

  let alpha = p < travelStart ? easedAppear : 1;
  let scale =
    (0.55 + randomE * 0.9) * (p < travelStart ? 0.25 + easedAppear * 0.75 : 1);
  if (vanishPhase > 0) {
    if (vanishMode === 1) {
      const flash = Math.sin(vanishPhase * Math.PI);
      alpha *= Math.max(
        0,
        1 - easedVanish * 0.85 + flash * (flashIntensity - 1) * 0.4,
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
    (randomF - 0.5) * Math.PI * 2 + p * Math.PI * 2 * (0.25 + randomC);
  return { x, y, alpha: Math.max(0, alpha), scale, rotation };
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

function getLayerMaskRenderKey(layer: V5GLayerConfig): string {
  return [
    layer.type,
    layer.assetId ?? "",
    layer.sequence?.frameAssetIds.join(",") ?? "",
    layer.sequence?.cycleDuration ?? "",
    layer.sequence?.loop ?? "",
    layer.text ?? "",
    layer.name,
  ].join("|");
}

function isLightMaskBlendMode(blendMode: V5GBlendMode): boolean {
  return (
    blendMode === "add" || blendMode === "screen" || blendMode === "lighten"
  );
}

function serializeTransformForKey(
  transform: V5GLayerConfig["transform"],
): string {
  return [
    roundTo(transform.x, 3),
    roundTo(transform.y, 3),
    roundTo(transform.scaleX, 4),
    roundTo(transform.scaleY, 4),
    roundTo(transform.rotation, 4),
    roundTo(transform.anchorX, 4),
    roundTo(transform.anchorY, 4),
  ].join(",");
}

function drawImageLayerToContext(
  ctx: CanvasRenderingContext2D,
  options: {
    image: HTMLImageElement;
    asset: V5GEditorState["project"]["assets"][number] | null;
    transform: V5GLayerConfig["transform"];
    stageWidth: number;
    stageHeight: number;
  },
): void {
  const logicalWidth = getLogicalAssetDimension(
    options.asset?.width,
    options.image.naturalWidth,
  );
  const logicalHeight = getLogicalAssetDimension(
    options.asset?.height,
    options.image.naturalHeight,
  );
  const position = editorToPixi(
    options.transform.x,
    options.transform.y,
    options.stageWidth,
    options.stageHeight,
  );
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate((options.transform.rotation * Math.PI) / 180);
  ctx.scale(options.transform.scaleX, options.transform.scaleY);
  ctx.drawImage(
    options.image,
    -options.transform.anchorX * logicalWidth,
    -options.transform.anchorY * logicalHeight,
    logicalWidth,
    logicalHeight,
  );
  ctx.restore();
}

function getLogicalAssetDimension(
  configured: number | undefined,
  fallback: number,
): number {
  return Number.isFinite(configured) &&
    configured !== undefined &&
    configured > 0
    ? configured
    : Math.max(1, fallback);
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
