import { assertFiniteMoneyAmount } from "./format.js";
import { DEFAULT_SLOT_UI_DESIGN_SIZE, validateDesignSize } from "./layout.js";
import { SlotUiConfigError } from "./errors.js";
import type {
  SlotUiBetOption,
  SlotUiDesignSize,
  SlotUiSpinState,
  SlotUiStateSnapshot,
} from "./types.js";

export interface SlotUiStateInit {
  readonly designSize?: SlotUiDesignSize;
  readonly betOptions: readonly SlotUiBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
  readonly initialMuted?: boolean;
  readonly initialFastMode?: boolean;
  readonly initialAutoMode?: boolean;
}

export interface BetControlsState {
  readonly canDecrease: boolean;
  readonly canIncrease: boolean;
}

export class SlotUiStateStore {
  readonly #designSize: SlotUiDesignSize;
  readonly #betOptions: readonly SlotUiBetOption[];
  #state: SlotUiStateSnapshot;

  constructor(init: SlotUiStateInit) {
    this.#designSize = validateDesignSize(
      init.designSize ?? DEFAULT_SLOT_UI_DESIGN_SIZE,
    );
    this.#betOptions = validateBetOptions(init.betOptions);
    const betIndex = init.initialBetIndex ?? 0;
    assertBetIndex(betIndex, this.#betOptions);

    this.#state = freezeState({
      designSize: this.#designSize,
      connected: false,
      spinState: "idle",
      balance:
        init.initialBalance === undefined
          ? null
          : assertFiniteMoneyAmount(init.initialBalance, "initialBalance"),
      win: assertFiniteMoneyAmount(init.initialWin ?? 0, "initialWin"),
      betIndex,
      betOption: this.#betOptions[betIndex],
      muted: Boolean(init.initialMuted),
      fastMode: Boolean(init.initialFastMode),
      autoMode: Boolean(init.initialAutoMode),
      error: null,
    });
  }

  get betOptions(): readonly SlotUiBetOption[] {
    return this.#betOptions;
  }

  getState(): SlotUiStateSnapshot {
    return this.#state;
  }

  getBetControls(): BetControlsState {
    return getBetControls(this.#state, this.#betOptions);
  }

  setConnected(connected: boolean): SlotUiStateSnapshot {
    return this.#replace({ connected });
  }

  setBetIndex(index: number): SlotUiStateSnapshot {
    assertBetIndex(index, this.#betOptions);
    return this.#replace({
      betIndex: index,
      betOption: this.#betOptions[index],
    });
  }

  increaseBet(): SlotUiStateSnapshot {
    const controls = this.getBetControls();
    return controls.canIncrease
      ? this.setBetIndex(this.#state.betIndex + 1)
      : this.#state;
  }

  decreaseBet(): SlotUiStateSnapshot {
    const controls = this.getBetControls();
    return controls.canDecrease
      ? this.setBetIndex(this.#state.betIndex - 1)
      : this.#state;
  }

  setBalance(balance: number): SlotUiStateSnapshot {
    return this.#replace({
      balance: assertFiniteMoneyAmount(balance, "balance"),
    });
  }

  setWinAmount(win: number): SlotUiStateSnapshot {
    return this.#replace({
      win: assertFiniteMoneyAmount(win, "win"),
    });
  }

  setMuted(muted: boolean): SlotUiStateSnapshot {
    return this.#replace({ muted });
  }

  setFastMode(fastMode: boolean): SlotUiStateSnapshot {
    return this.#replace({ fastMode });
  }

  setAutoMode(autoMode: boolean): SlotUiStateSnapshot {
    return this.#replace({ autoMode });
  }

  setSpinState(spinState: SlotUiSpinState): SlotUiStateSnapshot {
    assertSpinState(spinState);
    return this.#replace({ spinState });
  }

  setError(error: Error | string | null): SlotUiStateSnapshot {
    return this.#replace({
      error:
        error === null ? null : error instanceof Error ? error.message : error,
      spinState: error === null ? this.#state.spinState : "error",
    });
  }

  #replace(patch: Partial<SlotUiStateSnapshot>): SlotUiStateSnapshot {
    this.#state = freezeState({
      ...this.#state,
      ...patch,
    });
    return this.#state;
  }
}

export function validateBetOptions(
  options: readonly SlotUiBetOption[],
): readonly SlotUiBetOption[] {
  if (!Array.isArray(options) || options.length === 0) {
    throw new SlotUiConfigError("betOptions must be a non-empty array.");
  }

  return Object.freeze(
    options.map((option, index) => {
      assertPositiveFinite(option.bet, `betOptions[${index}].bet`);
      assertPositiveInteger(option.lines, `betOptions[${index}].lines`);
      if (option.times !== undefined) {
        assertPositiveFinite(option.times, `betOptions[${index}].times`);
      }
      if (option.label !== undefined && option.label.length === 0) {
        throw new SlotUiConfigError(
          `betOptions[${index}].label must not be empty.`,
        );
      }
      return Object.freeze({ ...option });
    }),
  );
}

export function getBetControls(
  state: SlotUiStateSnapshot,
  betOptions: readonly SlotUiBetOption[],
): BetControlsState {
  return Object.freeze({
    canDecrease: state.betIndex > 0 && state.spinState === "idle",
    canIncrease:
      state.betIndex < betOptions.length - 1 && state.spinState === "idle",
  });
}

export function assertBetIndex(
  index: number,
  betOptions: readonly SlotUiBetOption[],
): void {
  if (!Number.isInteger(index) || index < 0 || index >= betOptions.length) {
    throw new SlotUiConfigError(`bet index ${index} is out of range.`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SlotUiConfigError(`${label} must be a positive finite number.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SlotUiConfigError(`${label} must be a positive integer.`);
  }
}

function assertSpinState(value: SlotUiSpinState): void {
  if (
    value !== "idle" &&
    value !== "connecting" &&
    value !== "spinning" &&
    value !== "presenting" &&
    value !== "collecting" &&
    value !== "error" &&
    value !== "disabled"
  ) {
    throw new SlotUiConfigError(`Unknown spin state: ${value}.`);
  }
}

function freezeState(state: SlotUiStateSnapshot): SlotUiStateSnapshot {
  return Object.freeze({
    ...state,
    designSize: Object.freeze({ ...state.designSize }),
    betOption: Object.freeze({ ...state.betOption }),
  });
}
