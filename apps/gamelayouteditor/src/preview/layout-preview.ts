import {
  createSceneLayoutRuntime,
  resolveSceneLayoutFrameViewport,
  type SceneLayoutFrameViewport,
  type SceneLayoutManifestV1,
  type SceneLayoutRuntime,
  type SceneLayoutSnapshot,
} from "@slotclientengine/rendercore/scene-layout";
import {
  createSymbolPackageValueControllerFactory,
  type RenderSymbol,
  type SymbolCatalogModel,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore/symbol";
import { Application, Container, Graphics } from "pixi.js";
import {
  validateLayoutAssets,
  type ImportedLayoutPackage,
} from "../io/imported-layout-zip.js";
import { drawPreviewGuides } from "./preview-guides.js";
import {
  clampPreviewZoom,
  validatePreviewSize,
  type PreviewSize,
} from "./preview-size.js";

export class LayoutPreview {
  readonly #host: HTMLElement;
  readonly #diagnostics: HTMLElement;
  readonly #app = new Application();
  readonly #guides = new Graphics();
  readonly #symbolOverlay = new Container();
  #package: ImportedLayoutPackage | null = null;
  #runtime: SceneLayoutRuntime | null = null;
  #manifest: SceneLayoutManifestV1 | null = null;
  #frameViewport: SceneLayoutFrameViewport | null = null;
  #pageSize: PreviewSize = { width: 1920, height: 1080 };
  #zoom = 1;
  #showFocus = true;
  #showReels = true;
  #ready = false;
  #destroyed = false;
  #layoutRequest = 0;
  #symbolRequest = 0;
  #symbolResource: SymbolPackageResource | null = null;
  #symbolCatalog: SymbolCatalogModel | null = null;
  #renderSymbols: RenderSymbol[] = [];
  #symbolDiagnostic = "";

  constructor(host: HTMLElement, diagnostics: HTMLElement) {
    this.#host = host;
    this.#diagnostics = diagnostics;
  }

  async init(): Promise<void> {
    if (this.#ready || this.#destroyed)
      throw new Error("Preview init 状态非法。");
    await this.#app.init({
      width: 1,
      height: 1,
      background: "#050914",
      antialias: true,
    });
    this.#app.canvas.setAttribute("aria-label", "布局预览画布");
    this.#host.replaceChildren(this.#app.canvas);
    this.#app.stage.addChild(this.#symbolOverlay, this.#guides);
    this.#app.ticker.add((ticker) => {
      if (this.#runtime) this.#runtime.update(ticker.deltaMS / 1000);
      for (const symbol of this.#renderSymbols)
        symbol.update(ticker.deltaMS / 1000);
    });
    this.#ready = true;
  }

  async setLayout(
    manifest: SceneLayoutManifestV1,
    assets: ReadonlyMap<string, Uint8Array>,
  ): Promise<void> {
    this.assertReady();
    const request = ++this.#layoutRequest;
    const nextPackage = await validateLayoutAssets(manifest, assets);
    if (request !== this.#layoutRequest || this.#destroyed) {
      nextPackage.destroy();
      return;
    }
    const nextRuntime = createSceneLayoutRuntime({
      resource: nextPackage.resource,
    });
    try {
      await nextRuntime.init();
    } catch (error) {
      nextRuntime.destroy();
      nextPackage.destroy();
      throw error;
    }
    if (request !== this.#layoutRequest || this.#destroyed) {
      nextRuntime.destroy();
      nextPackage.destroy();
      return;
    }
    this.clearRuntime();
    this.#package = nextPackage;
    this.#runtime = nextRuntime;
    this.#manifest = manifest;
    this.#app.stage.addChildAt(nextRuntime.container, 0);
    this.applySize();
  }

  clear(): void {
    this.assertReady();
    this.#layoutRequest += 1;
    this.clearRuntime();
    this.clearRenderSymbols();
    this.#manifest = null;
    this.#guides.clear();
    this.#diagnostics.textContent = "配置未通过严格校验，预览与导出已暂停。";
  }

  async setSymbolPackage(
    resource: SymbolPackageResource | null,
  ): Promise<void> {
    this.assertReady();
    const request = ++this.#symbolRequest;
    if (!resource) {
      this.clearSymbolPackage();
      if (this.#runtime) this.applySize();
      return;
    }
    let catalog: SymbolCatalogModel;
    try {
      catalog = await resource.createCatalog();
    } catch (error) {
      resource.destroy();
      throw error;
    }
    if (request !== this.#symbolRequest || this.#destroyed) {
      resource.destroy();
      return;
    }
    this.clearSymbolPackage();
    this.#symbolResource = resource;
    this.#symbolCatalog = catalog;
    if (this.#runtime) this.applySize();
  }

  setPageSize(size: PreviewSize): void {
    this.#pageSize = validatePreviewSize(size);
    if (this.#runtime) this.applySize();
  }

  setZoom(zoom: number): void {
    this.#zoom = clampPreviewZoom(zoom);
    if (this.#runtime) this.applyDisplaySize();
  }

  setGuideVisibility(options: {
    showFocus: boolean;
    showReels: boolean;
  }): void {
    this.#showFocus = options.showFocus;
    this.#showReels = options.showReels;
    if (this.#runtime) this.applySize();
  }

  get pageSize(): PreviewSize {
    return this.#pageSize;
  }

  get zoom(): number {
    return this.#zoom;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#layoutRequest += 1;
    this.#symbolRequest += 1;
    this.clearRuntime();
    this.clearSymbolPackage();
    this.#symbolOverlay.destroy({ children: true });
    this.#guides.destroy();
    this.#app.destroy(true, { children: true, texture: true });
    this.#host.replaceChildren();
  }

  private applySize(): void {
    const manifest = this.#manifest;
    const runtime = this.#runtime;
    if (!manifest || !runtime) return;
    const frameViewport = resolveSceneLayoutFrameViewport({
      manifest,
      pageSize: this.#pageSize,
    });
    this.#frameViewport = frameViewport;
    this.#app.renderer.resize(
      frameViewport.frameDesignSize.width,
      frameViewport.frameDesignSize.height,
    );
    const snapshot = runtime.applyViewport(frameViewport.frameDesignSize);
    this.layoutSymbolOverlay(snapshot);
    drawPreviewGuides({
      graphics: this.#guides,
      snapshot,
      showFocus: this.#showFocus,
      showReels: this.#showReels,
    });
    this.#diagnostics.textContent = [
      `variant=${snapshot.variantId}`,
      `page=${round(this.#pageSize.width)}×${round(this.#pageSize.height)}`,
      `logical=${round(frameViewport.frameDesignSize.width)}×${round(frameViewport.frameDesignSize.height)}`,
      `css=${round(frameViewport.cssSize.width)}×${round(frameViewport.cssSize.height)}`,
      `frameOffset=(${round(frameViewport.offsetX)}, ${round(frameViewport.offsetY)})`,
      `visible=${formatRect(snapshot.visibleRect)}`,
      `world=(${round(snapshot.worldOffset.x)}, ${round(snapshot.worldOffset.y)})`,
      ...(this.#symbolDiagnostic ? [this.#symbolDiagnostic] : []),
    ].join(" · ");
    this.applyDisplaySize();
  }

  private applyDisplaySize(): void {
    const frameViewport = this.#frameViewport;
    if (!frameViewport) return;
    const availableWidth = Math.max(
      280,
      this.#host.parentElement?.clientWidth ?? 900,
    );
    const availableHeight = Math.max(
      240,
      this.#host.parentElement?.clientHeight ?? 700,
    );
    const fit = Math.min(
      availableWidth / this.#pageSize.width,
      availableHeight / this.#pageSize.height,
      1,
    );
    const displayScale = fit * this.#zoom;
    this.#host.style.width = `${this.#pageSize.width * displayScale}px`;
    this.#host.style.height = `${this.#pageSize.height * displayScale}px`;
    this.#app.canvas.style.width = `${frameViewport.cssSize.width * displayScale}px`;
    this.#app.canvas.style.height = `${frameViewport.cssSize.height * displayScale}px`;
    this.#app.canvas.style.marginLeft = `${frameViewport.offsetX * displayScale}px`;
    this.#app.canvas.style.marginTop = `${frameViewport.offsetY * displayScale}px`;
  }

  private clearRuntime(): void {
    this.#runtime?.destroy();
    this.#runtime = null;
    this.#frameViewport = null;
    this.#package?.destroy();
    this.#package = null;
  }

  private layoutSymbolOverlay(snapshot: SceneLayoutSnapshot): void {
    this.clearRenderSymbols();
    this.#symbolDiagnostic = "";
    const resource = this.#symbolResource;
    const catalog = this.#symbolCatalog;
    const reel = snapshot.reels.main;
    if (!resource || !catalog || !reel) return;
    const cellCount = reel.columns * reel.rows;
    const symbols = resource.displaySymbols;
    for (let index = 0; index < cellCount; index += 1) {
      const symbol = symbols[index % symbols.length];
      const renderSymbol = catalog.createRenderSymbol(symbol, {
        valueControllerFactory: createSymbolPackageValueControllerFactory(
          resource,
          symbol,
        ),
      });
      renderSymbol.scale.set(resource.symbolScales[symbol] ?? 1);
      renderSymbol.init();
      const x = index % reel.columns;
      const y = Math.floor(index / reel.columns);
      renderSymbol.position.set(
        reel.viewportRect.x + x * reel.stride.width + reel.cellSize.width / 2,
        reel.viewportRect.y + y * reel.stride.height + reel.cellSize.height / 2,
      );
      const presentation =
        resource.symbolManifest.symbols[symbol]?.valuePresentation;
      if (presentation)
        renderSymbol.setPresentationValue(presentation.defaultValues[0]);
      this.#symbolOverlay.addChild(renderSymbol);
      this.#renderSymbols.push(renderSymbol);
    }
    this.#symbolDiagnostic =
      cellCount < symbols.length
        ? `symbols=${resource.packageManifest.id} · ${symbols.length} display · 当前 viewport 未覆盖全部 symbol`
        : `symbols=${resource.packageManifest.id} · ${symbols.length} display · normal-only row-major`;
  }

  private clearRenderSymbols(): void {
    for (const symbol of this.#renderSymbols) symbol.destroy();
    this.#renderSymbols = [];
    this.#symbolOverlay.removeChildren();
  }

  private clearSymbolPackage(): void {
    this.clearRenderSymbols();
    this.#symbolCatalog = null;
    this.#symbolResource?.destroy();
    this.#symbolResource = null;
    this.#symbolDiagnostic = "";
  }

  private assertReady(): void {
    if (!this.#ready || this.#destroyed)
      throw new Error("Preview 尚未初始化或已销毁。");
  }
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  return `${round(rect.x)},${round(rect.y)},${round(rect.width)},${round(rect.height)}`;
}
