import * as PIXI from "pixi.js";
import gsap from "gsap";
import { editorToPixi, pixiToEditor, roundTo } from "./coordinates";
import type {
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
    await this.syncLayers();
    this.drawGuides();
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
    this.drawSelection();
    this.notifyViewportChange();
  }

  playDemo(): void {
    this.stopDemo();
    this.playTimeline = gsap.timeline();
    for (const layer of this.state.project.layers) {
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
      }
    }

    for (const layer of this.state.project.layers) {
      let display = this.layerDisplayMap.get(layer.id);
      if (!display) {
        display = await this.createLayerDisplay(layer);
        this.layerDisplayMap.set(layer.id, display);
        this.contentContainer.addChild(display);
      } else if (layer.type === "text") {
        const textNode = display.children[0];
        if (textNode instanceof PIXI.Text) {
          textNode.text = layer.text ?? layer.name;
        }
      }
      this.applyLayerTransform(layer);
    }

    for (const layer of this.state.project.layers) {
      const display = this.layerDisplayMap.get(layer.id);
      if (display) this.contentContainer.addChild(display);
    }
  }

  private async createLayerDisplay(
    layer: V5GLayerConfig,
  ): Promise<PIXI.Container> {
    const display = new PIXI.Container();
    display.eventMode = "static";
    display.cursor = layer.locked ? "default" : "pointer";
    display.on("pointerdown", (event) =>
      this.handleLayerPointerDown(event, layer.id),
    );

    if (layer.type === "image") {
      const runtimeAsset = this.findRuntimeAsset(layer.assetId);
      if (runtimeAsset) {
        const texture = await this.loadImageTexture(runtimeAsset);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(layer.transform.anchorX, layer.transform.anchorY);
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
    display.visible = layer.visible;
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

  private drawSelection(): void {
    this.selectionGraphics.clear();
    const layer = this.state.project.layers.find(
      (item) => item.id === this.state.selectedLayerId,
    );
    if (!layer || !layer.visible) return;
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
    event.stopPropagation();
    this.callbacks.onSelectLayer(layerId);
    const layer = this.state.project.layers.find((item) => item.id === layerId);
    const display = this.layerDisplayMap.get(layerId);
    if (!layer || layer.locked) return;

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
}

function clampViewportScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(scale, MIN_VIEW_SCALE), MAX_VIEW_SCALE);
}

function sanitizeViewportNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
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
