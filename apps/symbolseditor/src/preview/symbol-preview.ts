import {
  createSymbolPackageValueControllerFactory,
  type RenderSymbol,
  type SymbolCatalogModel,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore/symbol";
import { Application, Container, Graphics, type Ticker } from "pixi.js";

export class SymbolEditorPreview {
  readonly #host: HTMLElement;
  readonly #app = new Application();
  readonly #content = new Container();
  readonly #guides = new Graphics();
  #resource: SymbolPackageResource | null = null;
  #symbols: RenderSymbol[] = [];
  #selectedSymbol = "";
  #selectedState = "normal";
  #gallery = false;
  #request = 0;
  #ready = false;

  constructor(host: HTMLElement) {
    this.#host = host;
  }

  async init(): Promise<void> {
    await this.#app.init({
      width: 900,
      height: 720,
      background: "#050914",
      antialias: true,
    });
    this.#app.stage.addChild(this.#content, this.#guides);
    this.#app.ticker.add((ticker: Ticker) => {
      for (const symbol of this.#symbols) symbol.update(ticker.deltaMS / 1000);
    });
    this.#host.replaceChildren(this.#app.canvas);
    this.#ready = true;
  }

  async setResource(
    resource: SymbolPackageResource,
    selectedSymbol?: string,
  ): Promise<void> {
    if (!this.#ready) throw new Error("preview 尚未初始化。");
    const request = ++this.#request;
    const catalog = await resource.createCatalog();
    if (request !== this.#request) {
      resource.destroy();
      return;
    }
    this.clearSymbols();
    this.#resource?.destroy();
    this.#resource = resource;
    this.#selectedSymbol =
      selectedSymbol && resource.displaySymbols.includes(selectedSymbol)
        ? selectedSymbol
        : resource.displaySymbols[0];
    this.renderCatalog(catalog);
  }

  setSelectedSymbol(symbol: string): void {
    this.#selectedSymbol = symbol;
    void this.rebuildCurrentResource();
  }

  setState(state: string): void {
    this.#selectedState = state;
    for (const symbol of this.#symbols) symbol.requestState(state, "immediate");
  }

  replay(): void {
    for (const symbol of this.#symbols) {
      symbol.returnToDefaultState();
      symbol.requestState(this.#selectedState, "immediate");
    }
  }

  setPresentationValue(value: number): void {
    for (const symbol of this.#symbols) {
      if (symbol.getPresentationValue() !== null)
        symbol.setPresentationValue(value);
    }
  }

  setGallery(value: boolean): void {
    this.#gallery = value;
    void this.rebuildCurrentResource();
  }

  clearResource(): void {
    this.#request += 1;
    this.clearSymbols();
    this.#resource?.destroy();
    this.#resource = null;
    this.#guides.clear();
  }

  destroy(): void {
    this.clearResource();
    this.#guides.destroy();
    this.#content.destroy({ children: true });
    this.#app.destroy(true, { children: true, texture: true });
  }

  private renderCatalog(catalog: SymbolCatalogModel): void {
    const resource = this.#resource;
    if (!resource) return;
    this.clearSymbols();
    const display = this.#gallery
      ? resource.displaySymbols
      : [this.#selectedSymbol];
    const columns = this.#gallery
      ? Math.max(1, Math.ceil(Math.sqrt(display.length)))
      : 1;
    const cellWidth = resource.packageManifest.cellSize.width;
    const cellHeight = resource.packageManifest.cellSize.height;
    const scale = Math.min(
      1.8,
      560 /
        Math.max(
          cellWidth * columns,
          cellHeight * Math.ceil(display.length / columns),
        ),
    );
    this.#content.position.set(450, 360);
    this.#content.scale.set(scale);
    this.#guides.clear();
    display.forEach((symbol, index) => {
      const renderSymbol = catalog.createRenderSymbol(symbol, {
        valueControllerFactory: createSymbolPackageValueControllerFactory(
          resource,
          symbol,
        ),
      });
      renderSymbol.scale.set(resource.symbolScales[symbol] ?? 1);
      renderSymbol.init();
      const x = index % columns;
      const y = Math.floor(index / columns);
      renderSymbol.position.set(
        (x - (columns - 1) / 2) * cellWidth,
        (y - (Math.ceil(display.length / columns) - 1) / 2) * cellHeight,
      );
      const presentation =
        resource.symbolManifest.symbols[symbol]?.valuePresentation;
      if (presentation)
        renderSymbol.setPresentationValue(presentation.defaultValues[0]);
      if (this.#selectedState !== "normal")
        renderSymbol.requestState(this.#selectedState, "immediate");
      this.#content.addChild(renderSymbol);
      this.#symbols.push(renderSymbol);
      this.#guides
        .rect(
          450 + scale * (renderSymbol.x - cellWidth / 2),
          360 + scale * (renderSymbol.y - cellHeight / 2),
          cellWidth * scale,
          cellHeight * scale,
        )
        .stroke({ color: 0x38d9a9, width: 1, alpha: 0.8 });
    });
  }

  private async rebuildCurrentResource(): Promise<void> {
    const resource = this.#resource;
    if (!resource) return;
    const request = ++this.#request;
    const catalog = await resource.createCatalog();
    if (request !== this.#request || resource !== this.#resource) return;
    this.renderCatalog(catalog);
  }

  private clearSymbols(): void {
    for (const symbol of this.#symbols) symbol.destroy();
    this.#symbols = [];
    this.#content.removeChildren();
  }
}
