import { Application, Graphics } from "pixi.js";
import {
  createRenderImageString,
  type ImageStringResource,
  type ImageStringSnapshot,
  type RenderImageString,
} from "@slotclientengine/rendercore/image-string";

export class ImageStringPreview {
  readonly #application: Application;
  readonly #renderer: RenderImageString;
  readonly #guides = new Graphics();
  #destroyed = false;

  private constructor(application: Application, renderer: RenderImageString) {
    this.#application = application;
    this.#renderer = renderer;
  }
  static async create(
    host: HTMLElement,
    resource: ImageStringResource,
    text = "0123456789",
  ): Promise<ImageStringPreview> {
    const application = new Application();
    await application.init({
      width: 720,
      height: 240,
      background: "#182033",
      antialias: true,
      resolution: devicePixelRatio,
    });
    host.replaceChildren(application.canvas);
    const renderer = createRenderImageString({ resource, text });
    renderer.container.position.set(360, 120);
    const preview = new ImageStringPreview(application, renderer);
    application.stage.addChild(preview.#guides, renderer.container);
    preview.#drawGuides();
    return preview;
  }
  setText(text: string): void {
    this.#assertUsable();
    this.#renderer.setText(text);
    this.#drawGuides();
  }
  setZoom(zoom: number): void {
    this.#assertUsable();
    if (!Number.isFinite(zoom) || zoom <= 0)
      throw new Error("zoom 必须是有限正数。");
    this.#renderer.container.scale.set(zoom);
    this.#drawGuides();
  }
  getSnapshot(): ImageStringSnapshot {
    this.#assertUsable();
    return this.#renderer.getSnapshot();
  }
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#renderer.destroy();
    this.#guides.destroy();
    this.#application.destroy(true);
  }
  #drawGuides(): void {
    const snapshot = this.#renderer.getSnapshot();
    const originX =
      this.#renderer.container.position.x -
      this.#renderer.container.pivot.x * this.#renderer.container.scale.x;
    const originY =
      this.#renderer.container.position.y -
      this.#renderer.container.pivot.y * this.#renderer.container.scale.y;
    this.#guides
      .clear()
      .rect(
        originX,
        originY,
        snapshot.logicalBounds.width * this.#renderer.container.scale.x,
        snapshot.logicalBounds.height * this.#renderer.container.scale.y,
      )
      .stroke({ color: 0x56c8ff, width: 1 });
    if (snapshot.visualBounds)
      this.#guides
        .rect(
          originX + snapshot.visualBounds.x * this.#renderer.container.scale.x,
          originY + snapshot.visualBounds.y * this.#renderer.container.scale.y,
          snapshot.visualBounds.width * this.#renderer.container.scale.x,
          snapshot.visualBounds.height * this.#renderer.container.scale.y,
        )
        .stroke({ color: 0xffc857, width: 1 });
  }
  #assertUsable(): void {
    if (this.#destroyed) throw new Error("ImageStringPreview 已销毁。");
  }
}
