import { createSlotUiController } from "@slotclientengine/uiframeworks";
import type {
  SlotUiController,
  SlotUiFramePolicy,
  SlotUiViewportSnapshot,
} from "@slotclientengine/uiframeworks";
import type {
  SlotGameBetOption,
  SlotGameFramePolicy,
  SlotGameStateSnapshot,
  SlotGameViewportListener,
  SlotGameViewportSnapshot,
} from "./types.js";

export interface SlotGameUiAdapterOptions {
  readonly root: HTMLElement;
  readonly designSize: { readonly width: number; readonly height: number };
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
  readonly framePolicy?: SlotGameFramePolicy;
  readonly brandLabel?: string;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly onSpin: () => void;
  readonly onIncreaseBet: () => void;
  readonly onDecreaseBet: () => void;
  readonly onMutedChange: (muted: boolean) => void;
  readonly onFastModeChange: (enabled: boolean) => void;
  readonly onAutoModeChange: (enabled: boolean) => void;
}

export class SlotGameUiAdapter {
  readonly #controller: SlotUiController;
  readonly #designSize: { readonly width: number; readonly height: number };

  constructor(options: SlotGameUiAdapterOptions) {
    this.#designSize = options.designSize;
    this.#controller = createSlotUiController({
      root: options.root,
      designSize: options.designSize,
      framePolicy: options.framePolicy as SlotUiFramePolicy | undefined,
      betOptions: options.betOptions,
      initialBetIndex: options.initialBetIndex,
      initialBalance: options.initialBalance,
      initialWin: options.initialWin,
      brandLabel: options.brandLabel,
      currency: options.currency,
      locale: options.locale,
      formatMoney: options.formatMoney,
      handlers: {
        onSpin: options.onSpin,
        onIncreaseBet: options.onIncreaseBet,
        onDecreaseBet: options.onDecreaseBet,
        onMutedChange: options.onMutedChange,
        onFastModeChange: options.onFastModeChange,
        onAutoModeChange: options.onAutoModeChange,
      },
    });
  }

  get elements(): SlotUiController["elements"] {
    return this.#controller.elements;
  }

  getViewport(): SlotGameViewportSnapshot {
    return toSlotGameViewport(this.#controller.getViewport());
  }

  onViewportChange(listener: SlotGameViewportListener): () => void {
    return this.#controller.onViewportChange((viewport) => {
      listener(toSlotGameViewport(viewport));
    });
  }

  update(state: SlotGameStateSnapshot): void {
    this.#controller.update(
      Object.freeze({
        designSize: Object.freeze({ ...this.#designSize }),
        ...state,
      }),
    );
  }

  destroy(): void {
    this.#controller.destroy();
  }
}

function toSlotGameViewport(
  viewport: SlotUiViewportSnapshot,
): SlotGameViewportSnapshot {
  return Object.freeze({
    pageSize: Object.freeze({ ...viewport.pageSize }),
    frameDesignSize: Object.freeze({ ...viewport.frameDesignSize }),
    scale: viewport.scale,
    cssSize: Object.freeze({ ...viewport.cssSize }),
    offsetX: viewport.offsetX,
    offsetY: viewport.offsetY,
  });
}
