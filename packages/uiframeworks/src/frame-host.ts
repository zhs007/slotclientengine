import {
  calculateFrameScale,
  calculateSlotUiFrameViewport,
  createDefaultSlotLayout,
} from "./layout.js";
import type {
  SlotUiDesignSize,
  SlotUiFramePolicy,
  SlotUiViewportListener,
  SlotUiViewportSnapshot,
} from "./types.js";

export interface SlotUiFrameHostOptions {
  readonly root: HTMLElement;
  readonly designSize: SlotUiDesignSize;
  readonly framePolicy?: SlotUiFramePolicy;
}

export interface SlotUiFrameHostElements {
  readonly page: HTMLElement;
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
}

export interface SlotUiFrameHost {
  readonly elements: SlotUiFrameHostElements;
  getViewport(): SlotUiViewportSnapshot;
  onViewportChange(listener: SlotUiViewportListener): () => void;
  destroy(): void;
}

export function createSlotUiFrameHost(
  options: SlotUiFrameHostOptions,
): SlotUiFrameHost {
  let destroyed = false;
  let viewportSnapshot = createViewport(options);
  const page = element("main", "slot-ui-page");
  const frame = element("div", "slot-ui-frame");
  const gameLayer = element("div", "slot-ui-game-layer");
  const overlay = element("div", "slot-ui-overlay");
  const viewportListeners = new Set<SlotUiViewportListener>();

  page.setAttribute("data-slot-ui", "dom");
  applyFrameViewport(frame, viewportSnapshot);
  frame.append(gameLayer, overlay);
  page.append(frame);
  options.root.replaceChildren(page);

  const resizeListener = () => {
    if (destroyed) return;
    viewportSnapshot = createViewport(options);
    applyFrameViewport(frame, viewportSnapshot);
    for (const listener of viewportListeners) listener(viewportSnapshot);
  };
  window.addEventListener("resize", resizeListener);
  resizeListener();

  const elements = Object.freeze({ page, frame, gameLayer, overlay });
  return Object.freeze({
    elements,
    getViewport(): SlotUiViewportSnapshot {
      return viewportSnapshot;
    },
    onViewportChange(listener: SlotUiViewportListener): () => void {
      if (destroyed) return () => undefined;
      viewportListeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        viewportListeners.delete(listener);
      };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener("resize", resizeListener);
      viewportListeners.clear();
      page.remove();
    },
  });
}

export function applyFrameScale(
  frame: HTMLElement,
  root: HTMLElement,
  designSize: SlotUiDesignSize,
): number {
  const viewport = calculateSlotUiFrameViewport({
    ...readRootViewport(root),
    designSize,
    policy: { mode: "fixed" },
  });
  applyFrameViewport(frame, viewport);
  return calculateFrameScale(
    viewport.pageSize.width,
    viewport.pageSize.height,
    designSize,
  );
}

export function applyFrameViewport(
  frame: HTMLElement,
  viewport: SlotUiViewportSnapshot,
): void {
  const layout = createDefaultSlotLayout(viewport.frameDesignSize);
  frame.style.width = `${layout.designSize.width}px`;
  frame.style.height = `${layout.designSize.height}px`;
  frame.style.setProperty("--slot-ui-width", `${layout.designSize.width}px`);
  frame.style.setProperty("--slot-ui-height", `${layout.designSize.height}px`);
  frame.style.setProperty(
    "--slot-ui-bottom-hud-height",
    `${layout.bottomHudHeight}px`,
  );
  frame.style.setProperty(
    "--slot-ui-left-rail-button-size",
    `${layout.leftRailButtonSize}px`,
  );
  frame.style.setProperty("--slot-ui-left-rail-gap", `${layout.leftRailGap}px`);
  frame.style.setProperty(
    "--slot-ui-buy-bonus-width",
    `${layout.buyBonusWidth}px`,
  );
  frame.style.setProperty(
    "--slot-ui-buy-bonus-height",
    `${layout.buyBonusHeight}px`,
  );
  frame.style.setProperty(
    "--slot-ui-spin-size",
    `${layout.spinButtonDiameter}px`,
  );
  frame.style.setProperty(
    "--slot-ui-auto-size",
    `${layout.autoButtonDiameter}px`,
  );
  frame.style.setProperty(
    "--slot-ui-bet-step-size",
    `${layout.betStepButtonDiameter}px`,
  );
  frame.style.setProperty("--slot-ui-top-inset", `${layout.topInset}px`);
  frame.style.setProperty("--slot-ui-side-inset", `${layout.sideInset}px`);
  frame.style.setProperty("--slot-ui-scale", String(viewport.scale));
  frame.style.transform = `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`;
}

function createViewport(options: SlotUiFrameHostOptions) {
  return calculateSlotUiFrameViewport({
    ...readRootViewport(options.root),
    designSize: options.designSize,
    policy: options.framePolicy,
  });
}

function readRootViewport(root: HTMLElement): {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
} {
  return Object.freeze({
    viewportWidth: root.clientWidth || window.innerWidth,
    viewportHeight: root.clientHeight || window.innerHeight,
  });
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  item.className = className;
  return item;
}
