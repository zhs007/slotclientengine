import { createSlotUiController } from "@slotclientengine/uiframeworks";
import type {
  SlotUiController,
  SlotUiFramePolicy,
  SlotUiViewportSnapshot,
} from "@slotclientengine/uiframeworks";
import type {
  SlotGameStateSnapshot,
  SlotGameUi,
  SlotGameUiCreateContext,
  SlotGameUiFactory,
  SlotGameViewportListener,
  SlotGameViewportSnapshot,
} from "./types.js";

export function createDefaultSlotGameUiFactory(): SlotGameUiFactory {
  return Object.freeze({
    create: (context: SlotGameUiCreateContext): SlotGameUi =>
      new SlotGameUiAdapter(context),
  });
}

class SlotGameUiAdapter implements SlotGameUi {
  readonly #controller: SlotUiController;
  readonly #designSize: { readonly width: number; readonly height: number };

  constructor(context: SlotGameUiCreateContext) {
    this.#designSize = context.designSize;
    this.#controller = createSlotUiController({
      root: context.root,
      designSize: context.designSize,
      framePolicy: context.framePolicy as SlotUiFramePolicy | undefined,
      betOptions: context.betOptions,
      initialBetIndex: context.initialState.betIndex,
      initialBalance: context.initialState.balance ?? undefined,
      initialWin: context.initialState.win,
      initialMuted: context.initialState.muted,
      initialFastMode: context.initialState.fastMode,
      initialAutoMode: context.initialState.autoMode,
      brandLabel: context.brandLabel,
      currency: context.currency,
      locale: context.locale,
      formatMoney: context.formatMoney,
      handlers: {
        onSpin: context.commands.requestSpin,
        onIncreaseBet: context.commands.increaseBet,
        onDecreaseBet: context.commands.decreaseBet,
        onMutedChange: context.commands.setMuted,
        onFastModeChange: context.commands.setFastMode,
        onAutoModeChange: context.commands.setAutoMode,
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
        designSize: this.#designSize,
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
