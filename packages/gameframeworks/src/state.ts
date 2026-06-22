import {
  DEFAULT_SLOT_UI_DESIGN_SIZE,
  validateBetOptions,
  validateDesignSize,
  type SlotUiStateSnapshot,
} from "@slotclientengine/uiframeworks";
import { SlotGameConfigError } from "./errors.js";
import type {
  SlotGameBetOption,
  SlotGameSpinState,
  SlotGameStateSnapshot,
} from "./types.js";

export interface SlotGameStateInit {
  readonly designSize?: { readonly width: number; readonly height: number };
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
}

export class SlotGameStateStore {
  readonly #designSize: { readonly width: number; readonly height: number };
  readonly #betOptions: readonly SlotGameBetOption[];
  #state: SlotGameStateSnapshot;

  constructor(init: SlotGameStateInit) {
    this.#designSize = validateDesignSize(
      init.designSize ?? DEFAULT_SLOT_UI_DESIGN_SIZE,
    );
    this.#betOptions = validateBetOptions(init.betOptions);
    const betIndex = init.initialBetIndex ?? 0;
    assertBetIndex(betIndex, this.#betOptions);
    this.#state = freezeGameState({
      connected: false,
      spinState: "idle",
      balance:
        init.initialBalance === undefined
          ? null
          : assertFiniteNumber(init.initialBalance, "initialBalance"),
      win: assertFiniteNumber(init.initialWin ?? 0, "initialWin"),
      betIndex,
      betOption: this.#betOptions[betIndex],
      muted: false,
      fastMode: false,
      autoMode: false,
      error: null,
    });
  }

  get designSize(): { readonly width: number; readonly height: number } {
    return this.#designSize;
  }

  get betOptions(): readonly SlotGameBetOption[] {
    return this.#betOptions;
  }

  getState(): SlotGameStateSnapshot {
    return this.#state;
  }

  getUiState(): SlotUiStateSnapshot {
    return Object.freeze({
      designSize: Object.freeze({ ...this.#designSize }),
      ...this.#state,
    });
  }

  setConnected(connected: boolean): SlotGameStateSnapshot {
    return this.#replace({ connected });
  }

  setBetIndex(index: number): SlotGameStateSnapshot {
    assertBetIndex(index, this.#betOptions);
    return this.#replace({
      betIndex: index,
      betOption: this.#betOptions[index],
    });
  }

  increaseBet(): SlotGameStateSnapshot {
    return this.#state.betIndex < this.#betOptions.length - 1
      ? this.setBetIndex(this.#state.betIndex + 1)
      : this.#state;
  }

  decreaseBet(): SlotGameStateSnapshot {
    return this.#state.betIndex > 0
      ? this.setBetIndex(this.#state.betIndex - 1)
      : this.#state;
  }

  setBalance(balance: number): SlotGameStateSnapshot {
    return this.#replace({ balance: assertFiniteNumber(balance, "balance") });
  }

  setWinAmount(win: number): SlotGameStateSnapshot {
    return this.#replace({ win: assertFiniteNumber(win, "win") });
  }

  setMuted(muted: boolean): SlotGameStateSnapshot {
    return this.#replace({ muted });
  }

  setFastMode(fastMode: boolean): SlotGameStateSnapshot {
    return this.#replace({ fastMode });
  }

  setAutoMode(autoMode: boolean): SlotGameStateSnapshot {
    return this.#replace({ autoMode });
  }

  setSpinState(spinState: SlotGameSpinState): SlotGameStateSnapshot {
    assertSpinState(spinState);
    return this.#replace({ spinState });
  }

  setError(error: Error | string | null): SlotGameStateSnapshot {
    return this.#replace({
      error:
        error === null ? null : error instanceof Error ? error.message : error,
      spinState: error === null ? this.#state.spinState : "error",
    });
  }

  #replace(patch: Partial<SlotGameStateSnapshot>): SlotGameStateSnapshot {
    this.#state = freezeGameState({
      ...this.#state,
      ...patch,
    });
    return this.#state;
  }
}

export function assertFiniteNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new SlotGameConfigError(`${label} must be a finite number.`);
  }
  return value as number;
}

export function assertBetIndex(
  index: number,
  betOptions: readonly SlotGameBetOption[],
): void {
  if (!Number.isInteger(index) || index < 0 || index >= betOptions.length) {
    throw new SlotGameConfigError(`bet index ${index} is out of range.`);
  }
}

function assertSpinState(value: SlotGameSpinState): void {
  if (
    value !== "idle" &&
    value !== "connecting" &&
    value !== "spinning" &&
    value !== "presenting" &&
    value !== "collecting" &&
    value !== "error" &&
    value !== "disabled"
  ) {
    throw new SlotGameConfigError(`Unknown spin state: ${value}.`);
  }
}

function freezeGameState(state: SlotGameStateSnapshot): SlotGameStateSnapshot {
  return Object.freeze({
    ...state,
    betOption: Object.freeze({ ...state.betOption }),
  });
}
