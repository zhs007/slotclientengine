import {
  createSymbolPackageValueControllerFactory,
  type RenderSymbol,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore/symbol";
import { Application, Container, Graphics, Text, type Ticker } from "pixi.js";

export type SymbolPreviewCellStatus =
  | "configured"
  | "empty"
  | "missing"
  | "error";

export interface SymbolPreviewCell {
  readonly symbol: string;
  readonly code: number;
  readonly status: SymbolPreviewCellStatus;
  readonly message?: string;
  readonly value?: number;
  readonly imageStringTexts?: Readonly<Record<string, string>>;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export class SymbolEditorPreview {
  readonly #host: HTMLElement;
  readonly #app = new Application();
  readonly #gallery = new Container();
  readonly #symbols: RenderSymbol[] = [];
  #resource: SymbolPackageResource | null = null;
  #cells: readonly SymbolPreviewCell[] = [];
  #selectedState = "normal";
  #request = 0;
  #ready = false;
  #fitZoom = 1;
  #zoom = 1;
  #manualZoom = false;
  #resizeObserver: ResizeObserver | null = null;

  constructor(host: HTMLElement) {
    this.#host = host;
  }

  async init(): Promise<void> {
    await this.#app.init({
      width: Math.max(320, this.#host.clientWidth || 900),
      height: Math.max(320, this.#host.clientHeight || 720),
      background: "#050914",
      antialias: true,
      autoDensity: true,
    });
    this.#app.stage.addChild(this.#gallery);
    this.#app.ticker.add((ticker: Ticker) => {
      for (const symbol of this.#symbols) symbol.update(ticker.deltaMS / 1000);
    });
    this.#host.replaceChildren(this.#app.canvas);
    this.#resizeObserver = new ResizeObserver(() => this.resizeAndFit());
    this.#resizeObserver.observe(this.#host);
    this.#ready = true;
  }

  async setResource(
    resource: SymbolPackageResource | null,
    cells: readonly SymbolPreviewCell[],
    state: string,
  ): Promise<void> {
    if (!this.#ready) throw new Error("preview 尚未初始化。");
    const request = ++this.#request;
    let catalog: Awaited<
      ReturnType<SymbolPackageResource["createCatalog"]>
    > | null;
    try {
      catalog = resource ? await resource.createCatalog() : null;
    } catch (error) {
      if (resource && resource !== this.#resource) resource.destroy();
      throw error;
    }
    if (request !== this.#request) {
      if (resource && resource !== this.#resource) resource.destroy();
      return;
    }
    const available = new Set(resource?.displaySymbols ?? []);
    const cellWidth = resource?.packageManifest.cellSize.width ?? 160;
    const cellHeight = resource?.packageManifest.cellSize.height ?? 160;
    const { columns } = calculateGalleryLayout(
      cells.length,
      this.#app.renderer.width,
      this.#app.renderer.height,
      cellWidth,
      cellHeight,
    );
    const rows = Math.max(1, Math.ceil(cells.length / columns));
    const nextRoots: Container[] = [];
    const nextSymbols: RenderSymbol[] = [];
    try {
      cells.forEach((cell, index) => {
        const root = new Container();
        nextRoots.push(root);
        const guide = new Graphics()
          .rect(-cellWidth / 2, -cellHeight / 2, cellWidth, cellHeight)
          .stroke({
            color:
              cell.status === "error"
                ? 0xff6b6b
                : cell.status === "missing"
                  ? 0xf4a261
                  : 0x38d9a9,
            width: 1,
            alpha: 0.85,
          });
        root.addChild(guide);
        if (
          catalog &&
          available.has(cell.symbol) &&
          cell.status === "configured"
        ) {
          const renderSymbol = catalog.createRenderSymbol(cell.symbol, {
            valueControllerFactory: resource
              ? createSymbolPackageValueControllerFactory(resource, cell.symbol)
              : undefined,
          });
          nextSymbols.push(renderSymbol);
          renderSymbol.scale.set(resource?.symbolScales[cell.symbol] ?? 1);
          renderSymbol.init();
          if (cell.value !== undefined)
            renderSymbol.setPresentationValue(cell.value);
          for (const [name, text] of Object.entries(
            cell.imageStringTexts ?? {},
          )) {
            renderSymbol.setImageStringText(name, text);
          }
          if (state !== "normal") renderSymbol.requestState(state, "immediate");
          root.addChild(renderSymbol);
        } else {
          root.addChild(
            new Text({
              text:
                cell.status === "empty"
                  ? "空"
                  : cell.status === "missing"
                    ? "未配置"
                    : (cell.message ?? "资源错误"),
              style: {
                fill: cell.status === "error" ? 0xff8f8f : 0xaab4c8,
                fontSize: 15,
                align: "center",
                wordWrap: true,
                wordWrapWidth: cellWidth * 0.8,
              },
              anchor: 0.5,
            }),
          );
        }
        const label = new Text({
          text: `${cell.code} · ${cell.symbol}`,
          style: { fill: 0xe7eefc, fontSize: 13 },
          anchor: { x: 0.5, y: 1 },
        });
        label.y = cellHeight / 2 - 6;
        root.addChild(label);
        const x = index % columns;
        const y = Math.floor(index / columns);
        root.position.set(
          (x - (columns - 1) / 2) * cellWidth,
          (y - (rows - 1) / 2) * cellHeight,
        );
      });
    } catch (error) {
      for (const symbol of nextSymbols) symbol.destroy();
      for (const root of nextRoots) root.destroy({ children: true });
      if (resource && resource !== this.#resource) resource.destroy();
      throw error;
    }
    this.clearGallery();
    if (this.#resource !== resource) this.#resource?.destroy();
    this.#resource = resource;
    this.#cells = Object.freeze([...cells]);
    this.#selectedState = state;
    this.#symbols.push(...nextSymbols);
    attachPreviewRoots(this.#gallery, nextRoots);
    this.applyLayout(cellWidth, cellHeight, columns, rows, !this.#manualZoom);
  }

  replay(): void {
    for (const symbol of this.#symbols) {
      symbol.returnToDefaultState();
      if (this.#selectedState !== "normal") {
        symbol.requestState(this.#selectedState, "immediate");
      }
    }
  }

  fitAll(): number {
    this.#manualZoom = false;
    this.#zoom = this.#fitZoom;
    this.#gallery.scale.set(this.#zoom);
    return this.#zoom;
  }

  setZoom(value: number): number {
    this.#manualZoom = true;
    this.#zoom = clampZoom(value);
    this.#gallery.scale.set(this.#zoom);
    return this.#zoom;
  }

  getZoom(): number {
    return this.#zoom;
  }

  clearResource(): void {
    this.#request += 1;
    this.clearGallery();
    this.#resource?.destroy();
    this.#resource = null;
    this.#cells = [];
  }

  destroy(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.clearResource();
    this.#gallery.destroy({ children: true });
    this.#app.destroy(true, { children: true, texture: true });
  }

  private resizeAndFit(): void {
    if (!this.#ready) return;
    const width = Math.max(320, this.#host.clientWidth || 900);
    const height = Math.max(320, this.#host.clientHeight || 720);
    this.#app.renderer.resize(width, height);
    this.#gallery.position.set(width / 2, height / 2);
    this.#manualZoom = false;
    this.rebuild();
  }

  private rebuild(): void {
    const resource = this.#resource;
    // Resize only repositions the current tree. Recreating it would race the
    // active resource owner and an empty initial gallery must remain a no-op.
    const cellWidth = resource?.packageManifest.cellSize.width ?? 160;
    const cellHeight = resource?.packageManifest.cellSize.height ?? 160;
    const { columns } = calculateGalleryLayout(
      this.#cells.length,
      this.#app.renderer.width,
      this.#app.renderer.height,
      cellWidth,
      cellHeight,
    );
    const rows = Math.max(1, Math.ceil(this.#cells.length / columns));
    this.#gallery.children.forEach((root, index) => {
      const x = index % columns;
      const y = Math.floor(index / columns);
      root.position.set(
        (x - (columns - 1) / 2) * cellWidth,
        (y - (rows - 1) / 2) * cellHeight,
      );
    });
    this.applyLayout(cellWidth, cellHeight, columns, rows, true);
  }

  private applyLayout(
    cellWidth: number,
    cellHeight: number,
    columns: number,
    rows: number,
    applyFit: boolean,
  ): void {
    this.#gallery.position.set(
      this.#app.renderer.width / 2,
      this.#app.renderer.height / 2,
    );
    this.#fitZoom = clampZoom(
      Math.min(
        (this.#app.renderer.width * 0.94) / Math.max(1, columns * cellWidth),
        (this.#app.renderer.height * 0.94) / Math.max(1, rows * cellHeight),
      ),
    );
    if (applyFit) this.fitAll();
    else this.#gallery.scale.set(this.#zoom);
  }

  private clearGallery(): void {
    for (const symbol of this.#symbols.splice(0)) symbol.destroy();
    for (const child of this.#gallery.removeChildren())
      child.destroy({ children: true });
  }
}

export function attachPreviewRoots(
  gallery: Container,
  roots: readonly Container[],
): void {
  for (const root of roots) gallery.addChild(root);
}

export function calculateGalleryLayout(
  count: number,
  viewportWidth: number,
  viewportHeight: number,
  cellWidth: number,
  cellHeight: number,
): Readonly<{ columns: number; rows: number }> {
  if (count <= 0) return Object.freeze({ columns: 1, rows: 1 });
  const target = Math.sqrt(
    (count * viewportWidth * cellHeight) /
      Math.max(1, viewportHeight * cellWidth),
  );
  const columns = Math.max(1, Math.min(count, Math.ceil(target)));
  return Object.freeze({ columns, rows: Math.ceil(count / columns) });
}

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}
