import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  bindPopupInteractionInput,
  createAwardCelebrationPlayer,
  createSpinePopupPlayer,
  createPopupPackageResource,
  formatPopupAmount,
  handledPopupInteraction,
  unhandledPopupInteraction,
  type AwardCelebrationPlayer,
  type SpinePopupPlayer,
  type PopupPackageResource,
  type PopupPresentationSnapshot,
} from "@slotclientengine/rendercore/popup";
import { Application, Container, Graphics } from "pixi.js";
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
  readonly #previewRoot = new Container();
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
  #disposePopupInputBinding: (() => void) | null = null;
  #presentationSnapshot: PopupPresentationSnapshot | null = null;
  #rebuildGeneration = 0;
  constructor(host: HTMLElement, status: HTMLElement) {
    this.#host = host;
    this.#status = status;
  }
  async init() {
    await this.#app.init({
      width: 540,
      height: 720,
      backgroundAlpha: 0,
      antialias: true,
    });
    this.#host.classList.add("popup-preview-gradient");
    this.#host.replaceChildren(this.#app.canvas);
    const keyboardTarget = this.#app.canvas.ownerDocument.defaultView;
    if (!keyboardTarget)
      throw new Error(
        "Popup preview canvas 缺少 browser window input target。",
      );
    this.#disposePopupInputBinding = bindPopupInteractionInput({
      canvas: this.#app.canvas,
      keyboardTarget,
      shouldHandleKeyboardEvent: shouldHandlePopupPreviewKeyboardEvent,
      dispatch: () => this.requestPrimaryPopupInteraction(),
      onError: (error) => {
        this.#status.textContent =
          error instanceof Error ? error.message : String(error);
      },
    });
    this.#app.stage.addChild(this.#previewRoot, this.#guides);
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
    const generation = ++this.#rebuildGeneration;
    const exported = await exportPopupZip(project, { prepare: false });
    const files = extractBoundedZip(exported.bytes, {
      limits: POPUP_ZIP_LIMITS,
    });
    await importPopupZip(exported.bytes);
    const resource = await createPopupPackageResource({ files });
    let player: AwardCelebrationPlayer | SpinePopupPlayer | null = null;
    try {
      player =
        resource.manifest.type === "spine"
          ? createSpinePopupPlayer({ resource })
          : createAwardCelebrationPlayer({
              resource,
              formatAmount: (amountRaw) =>
                formatPopupPreviewAmount(amountRaw, this.#amountFormat),
            });
      await player.init();
    } catch (error) {
      player?.destroy();
      await resource.destroy();
      throw error;
    }
    if (generation !== this.#rebuildGeneration) {
      player.destroy();
      await resource.destroy();
      return;
    }
    this.clear();
    this.#resource = resource;
    this.#player = player;
    this.#type = resource.manifest.type;
    this.#previewRoot.addChild(player.container);
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
  reset() {
    this.#rebuildGeneration += 1;
    this.clear();
    this.layout();
  }
  cancelPendingRebuild() {
    this.#rebuildGeneration += 1;
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
    this.#disposePopupInputBinding?.();
    this.#disposePopupInputBinding = null;
    this.#host.classList.remove("popup-preview-gradient");
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
    const width = this.#size.width * scale;
    const height = this.#size.height * scale;
    const x = (screen.width - width) / 2;
    const y = (screen.height - height) / 2;
    this.#previewRoot.position.set(x, y);
    this.#previewRoot.scale.set(scale);
    if (this.#player) {
      this.#presentationSnapshot = this.#player.applyViewport
        ? this.#player.applyViewport(this.#size)
        : null;
      if (!this.#player.applyViewport)
        this.#player.container.position.set(
          this.#size.width / 2,
          this.#size.height / 2,
        );
    } else {
      this.#presentationSnapshot = null;
    }
    this.#guides.clear();
    if (this.#showGuides) {
      this.#guides
        .rect(x, y, width, height)
        .stroke({ color: 0x5d7cff, width: 1 });
      this.#guides
        .moveTo(screen.width / 2 - 20, screen.height / 2)
        .lineTo(screen.width / 2 + 20, screen.height / 2)
        .moveTo(screen.width / 2, screen.height / 2 - 20)
        .lineTo(screen.width / 2, screen.height / 2 + 20)
        .stroke({ color: 0xffcc66, width: 1 });
      const focus = this.#presentationSnapshot?.focusRectInViewport;
      if (focus)
        this.#guides
          .rect(
            x + focus.x * scale,
            y + focus.y * scale,
            focus.width * scale,
            focus.height * scale,
          )
          .stroke({ color: 0x3ddc97, width: 2 });
    }
  }
  private requestPrimaryPopupInteraction() {
    if (!this.#player?.isPlaying()) return unhandledPopupInteraction();
    if (this.#type === "award-celebration")
      (this.#player as AwardCelebrationPlayer).requestAdvance();
    else (this.#player as SpinePopupPlayer).requestDismiss();
    return handledPopupInteraction();
  }
  private clear() {
    this.#presentationSnapshot = null;
    this.#player?.destroy();
    this.#player = null;
    void this.#resource?.destroy();
    this.#resource = null;
  }
  private assertReady() {
    if (!this.#ready) throw new Error("preview 尚未 init。");
  }
}

export function shouldHandlePopupPreviewKeyboardEvent(event: Event): boolean {
  for (const target of event.composedPath()) {
    if (!(target instanceof Element)) continue;
    if (
      target.matches(
        "input, textarea, select, button, [contenteditable]:not([contenteditable='false'])",
      )
    )
      return false;
  }
  return true;
}
