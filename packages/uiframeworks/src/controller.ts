import { createSlotUiDom } from "./dom.js";
import { createMoneyFormatter } from "./format.js";
import { DEFAULT_SLOT_UI_DESIGN_SIZE, validateDesignSize } from "./layout.js";
import { SlotUiStateStore, getBetControls } from "./state.js";
import { SlotUiConfigError } from "./errors.js";
import type {
  SlotUiController,
  SlotUiControllerOptions,
  SlotUiStateSnapshot,
} from "./types.js";

export function createSlotUiController(
  options: SlotUiControllerOptions,
): SlotUiController {
  validateControllerOptions(options);
  const designSize = validateDesignSize(
    options.designSize ?? DEFAULT_SLOT_UI_DESIGN_SIZE,
  );
  const stateStore = new SlotUiStateStore({
    designSize,
    betOptions: options.betOptions,
    initialBetIndex: options.initialBetIndex,
    initialBalance: options.initialBalance,
    initialWin: options.initialWin,
    initialMuted: options.initialMuted,
    initialFastMode: options.initialFastMode,
    initialAutoMode: options.initialAutoMode,
  });
  const betOptions = stateStore.betOptions;
  const initialState = stateStore.getState();
  let latestState: SlotUiStateSnapshot = initialState;

  const dom = createSlotUiDom({
    root: options.root,
    designSize,
    brandLabel: options.brandLabel,
    clock: options.clock,
    buyBonus: options.buyBonus,
    showFastToggle: options.showFastToggle,
    formatMoney: createMoneyFormatter(options),
    getBetControls: () => getBetControls(latestState, betOptions),
    handlers: options.handlers,
  });
  dom.update(latestState);

  return {
    elements: Object.freeze({
      frame: dom.elements.frame,
      gameLayer: dom.elements.gameLayer,
      overlay: dom.elements.overlay,
    }),
    update(state: SlotUiStateSnapshot): void {
      latestState = state;
      dom.update(state);
    },
    destroy(): void {
      dom.destroy();
    },
  };
}

function validateControllerOptions(options: SlotUiControllerOptions): void {
  if (
    typeof options.root !== "object" ||
    options.root === null ||
    typeof options.root.replaceChildren !== "function"
  ) {
    throw new SlotUiConfigError("root must be an HTMLElement.");
  }
  if (
    typeof options.handlers !== "object" ||
    options.handlers === null ||
    typeof options.handlers.onSpin !== "function" ||
    typeof options.handlers.onIncreaseBet !== "function" ||
    typeof options.handlers.onDecreaseBet !== "function" ||
    typeof options.handlers.onMutedChange !== "function" ||
    typeof options.handlers.onFastModeChange !== "function" ||
    typeof options.handlers.onAutoModeChange !== "function"
  ) {
    throw new SlotUiConfigError(
      "controller handlers must provide spin, bet, sound, fast, and auto callbacks.",
    );
  }
}
