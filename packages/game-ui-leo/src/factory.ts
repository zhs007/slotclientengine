import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type {
  SlotGameStateSnapshot,
  SlotGameUi,
  SlotGameUiCreateContext,
  SlotGameUiFactory,
  SlotGameViewportListener,
  SlotGameViewportSnapshot,
} from "@slotclientengine/gameframeworks";
import {
  createSlotUiFrameHost,
  type SlotUiFrameHost,
  type SlotUiFramePolicy,
} from "@slotclientengine/uiframeworks";
import { createLeoSlotGameUiStore, type LeoSlotGameUiStore } from "./store.js";
import { LeoSlotGameUiView } from "./view.js";
import { createLeoMoneyFormatter } from "./format.js";
import {
  DEFAULT_LEO_SLOT_GAME_UI_LABELS,
  type LeoSlotGameUiLabels,
} from "./view.js";

export interface LeoSlotGameUiFactoryOptions {
  readonly labels?: Partial<LeoSlotGameUiLabels>;
}

export function createLeoSlotGameUiFactory(
  options: LeoSlotGameUiFactoryOptions = {},
): SlotGameUiFactory {
  const labels = Object.freeze({
    ...DEFAULT_LEO_SLOT_GAME_UI_LABELS,
    ...options.labels,
  });
  return Object.freeze({
    create(context: SlotGameUiCreateContext): SlotGameUi {
      return new LeoSlotGameUi(context, labels);
    },
  });
}

class LeoSlotGameUi implements SlotGameUi {
  readonly #host: SlotUiFrameHost;
  readonly #store: LeoSlotGameUiStore;
  readonly #reactRoot: Root;
  #destroyed = false;

  constructor(context: SlotGameUiCreateContext, labels: LeoSlotGameUiLabels) {
    this.#host = createSlotUiFrameHost({
      root: context.root,
      designSize: context.designSize,
      framePolicy: context.framePolicy as SlotUiFramePolicy | undefined,
    });
    const mount = document.createElement("div");
    mount.className = "slot-leo-ui-mount";
    this.#host.elements.overlay.append(mount);
    this.#store = createLeoSlotGameUiStore(context.initialState);
    this.#reactRoot = createRoot(mount);
    this.#reactRoot.render(
      createElement(LeoSlotGameUiView, {
        store: this.#store,
        commands: context.commands,
        betOptionCount: context.betOptions.length,
        brandLabel: context.brandLabel ?? "LEO",
        labels,
        formatMoney:
          context.formatMoney ??
          createLeoMoneyFormatter({
            currency: context.currency,
            locale: context.locale,
          }),
      }),
    );
  }

  get elements() {
    return this.#host.elements;
  }

  getViewport(): SlotGameViewportSnapshot {
    return this.#host.getViewport();
  }

  onViewportChange(listener: SlotGameViewportListener): () => void {
    return this.#host.onViewportChange(listener);
  }

  update(state: SlotGameStateSnapshot): void {
    if (this.#destroyed) return;
    this.#store.update(state);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#reactRoot.unmount();
    this.#store.destroy();
    this.#host.destroy();
  }
}
