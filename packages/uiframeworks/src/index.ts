import "./styles.css";

import { createSlotUiDom, type SlotUiDom } from "./dom.js";
import { toSlotUiError, SlotUiConfigError, SlotUiRuntimeError } from "./errors.js";
import { createMoneyFormatter } from "./format.js";
import { validateDesignSize } from "./layout.js";
import { SlotUiLiveSession, requireFiniteBalance } from "./session.js";
import { SlotUiStateStore } from "./state.js";
import type {
  SlotGameMountContext,
  SlotUiFramework,
  SlotUiFrameworkOptions,
  SlotUiSpinResult,
  SlotUiStateSnapshot
} from "./types.js";

export function createSlotUiFramework(
  options: SlotUiFrameworkOptions,
): SlotUiFramework {
  return new SlotUiFrameworkImpl(options);
}

class SlotUiFrameworkImpl implements SlotUiFramework {
  readonly #options: SlotUiFrameworkOptions;
  readonly #state: SlotUiStateStore;
  readonly #dom: SlotUiDom;
  readonly #session: SlotUiLiveSession;
  readonly #mountPromise: Promise<void>;
  #destroyed = false;

  constructor(options: SlotUiFrameworkOptions) {
    validateFrameworkOptions(options);
    this.#options = options;
    const designSize = validateDesignSize(options.designSize);
    this.#state = new SlotUiStateStore({
      designSize,
      betOptions: options.betOptions,
      initialBetIndex: options.initialBetIndex,
      initialBalance: options.initialBalance,
      initialWin: options.initialWin,
      initialMuted: options.initialMuted,
      initialFastMode: options.initialFastMode,
      initialAutoMode: options.initialAutoMode
    });
    this.#dom = createSlotUiDom({
      root: options.root,
      designSize,
      formatMoney: createMoneyFormatter(options),
      getBetControls: () => this.#state.getBetControls(),
      handlers: {
        onSpin: () => {
          void this.spin().catch(() => undefined);
        },
        onIncreaseBet: () => {
          this.#state.increaseBet();
          this.#applyState();
        },
        onDecreaseBet: () => {
          this.#state.decreaseBet();
          this.#applyState();
        },
        onMutedChange: (muted) => this.setMuted(muted),
        onFastModeChange: (enabled) => this.setFastMode(enabled),
        onAutoModeChange: (enabled) => this.setAutoMode(enabled)
      }
    });
    this.#session = new SlotUiLiveSession({
      live: options.live,
      clientFactory: options.clientFactory,
      logicFactory: options.logicFactory,
      logger: options.logger
    });
    this.#mountPromise = this.#mountGameAdapter(designSize);
    this.#applyState();
  }

  async connect(): Promise<void> {
    this.#assertAlive();
    await this.#mountPromise;
    try {
      this.#state.setError(null);
      this.#state.setSpinState("connecting");
      this.#applyState();
      const userInfo = await this.#session.connect();
      const balance = requireFiniteBalance(userInfo, this.#options.initialBalance);
      this.#state.setConnected(true);
      this.#state.setBalance(balance);
      this.#state.setSpinState("idle");
      this.#state.setError(null);
      this.#applyState();
      await this.#options.gameAdapter.applyInitialState?.({
        userInfo,
        balance,
        ...(userInfo.defaultScene === undefined
          ? {}
          : { defaultScene: userInfo.defaultScene })
      });
      this.#applyState();
    } catch (error) {
      throw this.#handleFailure(error, "Slot UI connect failed.");
    }
  }

  async spin(): Promise<SlotUiSpinResult> {
    this.#assertAlive();
    await this.#mountPromise;
    const current = this.#state.getState();
    if (!current.connected) {
      throw new SlotUiRuntimeError("Cannot spin before connect succeeds.");
    }
    if (current.spinState !== "idle") {
      throw new SlotUiRuntimeError("A slot UI spin request is already in progress.");
    }

    try {
      this.#state.setError(null);
      this.#state.setSpinState("spinning");
      this.#applyState();
      const result = await this.#session.spin({
        state: this.#state.getState(),
        bet: this.#state.getState().betOption,
        buildSpinParams: this.#options.buildSpinParams,
        onCollectStart: () => {
          this.#state.setSpinState("collecting");
          this.#applyState();
        }
      });
      const balance = requireFiniteBalance(result.userInfo);
      this.#state.setWinAmount(result.totalwin);
      this.#state.setBalance(balance);
      await this.#options.gameAdapter.applySpinResult(result);
      this.#state.setSpinState("idle");
      this.#state.setError(null);
      this.#applyState();
      return result;
    } catch (error) {
      throw this.#handleFailure(error, "Slot UI spin failed.");
    }
  }

  setBalance(balance: number): void {
    this.#assertAlive();
    this.#state.setBalance(balance);
    this.#applyState();
  }

  setBetIndex(index: number): void {
    this.#assertAlive();
    this.#state.setBetIndex(index);
    this.#applyState();
  }

  setMuted(muted: boolean): void {
    this.#assertAlive();
    this.#state.setMuted(muted);
    this.#applyState();
  }

  setFastMode(enabled: boolean): void {
    this.#assertAlive();
    this.#state.setFastMode(enabled);
    this.#applyState();
  }

  setAutoMode(enabled: boolean): void {
    this.#assertAlive();
    this.#state.setAutoMode(enabled);
    this.#applyState();
  }

  getState(): SlotUiStateSnapshot {
    return this.#state.getState();
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#dom.destroy();
    this.#session.disconnect();
    this.#options.gameAdapter.destroy?.();
  }

  async #mountGameAdapter(
    designSize: SlotUiStateSnapshot["designSize"],
  ): Promise<void> {
    const context: SlotGameMountContext = Object.freeze({
      designSize,
      frame: this.#dom.elements.frame,
      gameLayer: this.#dom.elements.gameLayer,
      overlay: this.#dom.elements.overlay,
      getState: () => this.#state.getState()
    });
    await this.#options.gameAdapter.mount(this.#dom.elements.gameLayer, context);
  }

  #applyState(): void {
    if (this.#destroyed) {
      return;
    }
    const snapshot = this.#state.getState();
    this.#dom.update(snapshot);
    this.#options.onStateChange?.(snapshot);
    this.#options.gameAdapter.setUiState?.(snapshot);
  }

  #handleFailure(error: unknown, fallback: string): Error {
    const slotError = toSlotUiError(error, fallback);
    this.#state.setError(slotError);
    try {
      this.#applyState();
    } catch {
      this.#dom.update(this.#state.getState());
    }
    this.#options.onError?.(slotError);
    return slotError;
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new SlotUiRuntimeError("Slot UI framework has been destroyed.");
    }
  }
}

function validateFrameworkOptions(options: SlotUiFrameworkOptions): void {
  if (
    typeof options.root !== "object" ||
    options.root === null ||
    typeof options.root.replaceChildren !== "function"
  ) {
    throw new SlotUiConfigError("root must be an HTMLElement.");
  }
  if (
    typeof options.gameAdapter !== "object" ||
    options.gameAdapter === null ||
    typeof options.gameAdapter.mount !== "function" ||
    typeof options.gameAdapter.applySpinResult !== "function"
  ) {
    throw new SlotUiConfigError(
      "gameAdapter must provide mount() and applySpinResult().",
    );
  }
  if (!options.live || typeof options.live.serverUrl !== "string") {
    throw new SlotUiConfigError("live.serverUrl is required.");
  }
}

export { SlotUiConfigError, SlotUiRuntimeError } from "./errors.js";
export {
  DEFAULT_SLOT_UI_DESIGN_SIZE,
  calculateFrameScale,
  createDefaultSlotLayout,
  validateDesignSize
} from "./layout.js";
export { createMoneyFormatter } from "./format.js";
export {
  SlotUiStateStore,
  getBetControls,
  validateBetOptions
} from "./state.js";
export {
  SlotUiLiveSession,
  buildSpinParams,
  createSlotcraftClientOptions,
  requireFiniteBalance,
  shouldCollectFinalResult,
  validateLiveServerUrl,
  validateSlotUiSpinResult
} from "./session.js";
export type {
  SlotGameAdapter,
  SlotGameMountContext,
  SlotInitialState,
  SlotUiBetOption,
  SlotUiDesignSize,
  SlotUiFramework,
  SlotUiFrameworkOptions,
  SlotUiLiveConfig,
  SlotUiSpinResult,
  SlotUiSpinState,
  SlotUiStateSnapshot,
  SlotcraftClientFactory,
  SlotcraftClientLike
} from "./types.js";
