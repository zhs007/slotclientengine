import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  createAwardCelebrationPlayer,
  createPopupPackageResource,
  type AwardCelebrationPlayer,
  type PopupPackageResource,
} from "@slotclientengine/rendercore/popup";
import { Application, Graphics } from "pixi.js";
import type { PopupEditorProject } from "../model/project.js";
import { exportPopupZip, importPopupZip } from "../io/popup-zip.js";
import { POPUP_ZIP_LIMITS } from "../io/resource-import.js";

export class PopupPreview {
  readonly #app = new Application();
  readonly #guides = new Graphics();
  readonly #host: HTMLElement;
  readonly #status: HTMLElement;
  #resource: PopupPackageResource | null = null;
  #player: AwardCelebrationPlayer | null = null;
  #ready = false;
  #size = { width: 1080, height: 1920 };
  #zoom: number | "fit" = "fit";
  #showGuides = true;
  #input = { betAmountRaw: 100, winAmountRaw: 5000 };
  constructor(host: HTMLElement, status: HTMLElement) {
    this.#host = host;
    this.#status = status;
  }
  async init() {
    await this.#app.init({
      width: 540,
      height: 720,
      background: "#050814",
      antialias: true,
    });
    this.#host.replaceChildren(this.#app.canvas);
    this.#app.stage.addChild(this.#guides);
    this.#app.ticker.add((ticker) => {
      if (this.#player?.isPlaying()) {
        const snapshot = this.#player.update(ticker.deltaMS / 1000);
        this.#status.textContent = `${snapshot.activeTierId ?? "-"} / ${snapshot.activeSegment ?? "-"} / ${snapshot.phase} / ${snapshot.formattedAmount} / layers ${snapshot.activeLayerCount}+${snapshot.endingLayerCount}`;
      }
    });
    this.#ready = true;
    this.layout();
  }
  async rebuild(project: PopupEditorProject) {
    this.assertReady();
    const exported = await exportPopupZip(project, { prepare: false });
    const files = extractBoundedZip(exported.bytes, {
      limits: POPUP_ZIP_LIMITS,
      pathPolicy: { requireLowercase: true },
    });
    const manifest = importPopupZip(exported.bytes);
    void manifest;
    const resource = await createPopupPackageResource({ files });
    const player = createAwardCelebrationPlayer({ resource });
    await player.init();
    this.clear();
    this.#resource = resource;
    this.#player = player;
    this.#app.stage.addChildAt(player.container, 0);
    this.layout();
    this.#status.textContent = "production runtime ready";
  }
  setInput(betAmountRaw: number, winAmountRaw: number) {
    this.#input = { betAmountRaw, winAmountRaw };
  }
  play() {
    if (!this.#player) throw new Error("请先生成有效 production preview。");
    this.#player.dismissImmediately();
    this.#player.start(this.#input);
  }
  advance() {
    this.#player?.requestAdvance();
  }
  dismiss() {
    this.#player?.requestDismiss();
  }
  dismissImmediately() {
    this.#player?.dismissImmediately();
  }
  setViewport(
    width: number,
    height: number,
    zoom: number | "fit",
    guides: boolean,
  ) {
    this.#size = { width, height };
    this.#zoom = zoom;
    this.#showGuides = guides;
    this.layout();
  }
  destroy() {
    this.clear();
    this.#guides.destroy();
    this.#app.destroy(true);
  }
  private layout() {
    if (!this.#ready) return;
    const screen = this.#app.screen;
    const fit = Math.min(
      screen.width / this.#size.width,
      screen.height / this.#size.height,
    );
    const scale = this.#zoom === "fit" ? fit : this.#zoom;
    if (this.#player) {
      this.#player.container.position.set(screen.width / 2, screen.height / 2);
      this.#player.container.scale.set(scale);
    }
    this.#guides.clear();
    if (this.#showGuides) {
      const width = this.#size.width * scale;
      const height = this.#size.height * scale;
      const x = (screen.width - width) / 2;
      const y = (screen.height - height) / 2;
      this.#guides
        .rect(x, y, width, height)
        .stroke({ color: 0x5d7cff, width: 1 });
      this.#guides
        .moveTo(screen.width / 2 - 20, screen.height / 2)
        .lineTo(screen.width / 2 + 20, screen.height / 2)
        .moveTo(screen.width / 2, screen.height / 2 - 20)
        .lineTo(screen.width / 2, screen.height / 2 + 20)
        .stroke({ color: 0xffcc66, width: 1 });
    }
  }
  private clear() {
    this.#player?.destroy();
    this.#player = null;
    void this.#resource?.destroy();
    this.#resource = null;
  }
  private assertReady() {
    if (!this.#ready) throw new Error("preview 尚未 init。");
  }
}
