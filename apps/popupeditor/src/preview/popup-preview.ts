import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  createAwardCelebrationPlayer,
  createSpinePopupPlayer,
  createPopupPackageResource,
  formatPopupAmount,
  type AwardCelebrationPlayer,
  type SpinePopupPlayer,
  type PopupPackageResource,
} from "@slotclientengine/rendercore/popup";
import { Application, Graphics } from "pixi.js";
import type { PopupEditorProject } from "../model/project.js";
import { exportPopupZip, importPopupZip } from "../io/popup-zip.js";
import { POPUP_ZIP_LIMITS } from "../io/resource-import.js";

export interface PopupPreviewAmountFormat {
  readonly fractionDigits: number;
  readonly useGrouping: boolean;
}

export const DEFAULT_POPUP_PREVIEW_AMOUNT_FORMAT: PopupPreviewAmountFormat =
  Object.freeze({ fractionDigits: 0, useGrouping: false });

export function formatPopupPreviewAmount(
  amountRaw: number,
  format: PopupPreviewAmountFormat = DEFAULT_POPUP_PREVIEW_AMOUNT_FORMAT,
): string {
  const validated = validatePopupPreviewAmountFormat(format);
  return formatPopupAmount(amountRaw, {
    rawScale: 1,
    fractionDigits: validated.fractionDigits,
    useGrouping: validated.useGrouping,
    groupSeparator: ",",
    decimalSeparator: ".",
    prefix: "",
    suffix: "",
    rounding: "floor",
  });
}

function validatePopupPreviewAmountFormat(
  format: PopupPreviewAmountFormat,
): Readonly<PopupPreviewAmountFormat> {
  if (
    !Number.isSafeInteger(format.fractionDigits) ||
    format.fractionDigits < 0 ||
    format.fractionDigits > 6
  )
    throw new Error("preview 小数位数必须是 0..6 safe integer。");
  if (typeof format.useGrouping !== "boolean")
    throw new Error("preview 千位分隔设置必须是 boolean。");
  return Object.freeze({
    fractionDigits: format.fractionDigits,
    useGrouping: format.useGrouping,
  });
}

export class PopupPreview {
  readonly #app = new Application();
  readonly #guides = new Graphics();
  readonly #host: HTMLElement;
  readonly #status: HTMLElement;
  #resource: PopupPackageResource | null = null;
  #player: AwardCelebrationPlayer | SpinePopupPlayer | null = null;
  #type: "award-celebration" | "spine" = "award-celebration";
  #ready = false;
  #size = { width: 1080, height: 1920 };
  #zoom: number | "fit" = "fit";
  #showGuides = true;
  #input = { betAmountRaw: 100, winAmountRaw: 5000 };
  #amountFormat = DEFAULT_POPUP_PREVIEW_AMOUNT_FORMAT;
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
        this.#status.textContent =
          "activeTierId" in snapshot
            ? `${snapshot.activeTierId ?? "-"} / ${snapshot.activeSegment ?? "-"} / ${snapshot.phase} / ${snapshot.formattedAmount} / layers ${snapshot.activeLayerCount}+${snapshot.endingLayerCount}`
            : `${snapshot.phase} / dismissRequested=${snapshot.dismissRequested}`;
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
    });
    await importPopupZip(exported.bytes);
    const resource = await createPopupPackageResource({ files });
    const player =
      resource.manifest.type === "spine"
        ? createSpinePopupPlayer({ resource })
        : createAwardCelebrationPlayer({
            resource,
            formatAmount: (amountRaw) =>
              formatPopupPreviewAmount(amountRaw, this.#amountFormat),
          });
    await player.init();
    this.clear();
    this.#resource = resource;
    this.#player = player;
    this.#type = resource.manifest.type;
    this.#app.stage.addChildAt(player.container, 0);
    this.layout();
    this.#status.textContent = "production runtime ready";
  }
  setInput(betAmountRaw: number, winAmountRaw: number) {
    this.#input = { betAmountRaw, winAmountRaw };
  }
  setAmountFormat(format: PopupPreviewAmountFormat) {
    this.#amountFormat = validatePopupPreviewAmountFormat(format);
  }
  play() {
    if (!this.#player) throw new Error("请先生成有效 production preview。");
    this.#player.dismissImmediately();
    if (this.#type === "spine") (this.#player as SpinePopupPlayer).start();
    else (this.#player as AwardCelebrationPlayer).start(this.#input);
  }
  advance() {
    if (this.#player && this.#type === "award-celebration")
      (this.#player as AwardCelebrationPlayer).requestAdvance();
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
