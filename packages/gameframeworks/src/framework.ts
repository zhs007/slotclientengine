import {
  SlotGameConfigError,
  SlotGameRuntimeError,
  toSlotGameError,
} from "./errors.js";
import { createSlotGameLogicResult } from "./logic-result.js";
import { createSlotGameRoundContext } from "./round-context.js";
import { requireFiniteBalance, SlotGameLiveSession } from "./session.js";
import { SlotGameStateStore } from "./state.js";
import { SlotGameUiAdapter } from "./ui-adapter.js";
import type { SpinParams, UserInfo } from "@slotclientengine/netcore";
import type {
  GameLogic,
  SlotGameAdapter,
  SlotGameBetOption,
  SlotGameFramework,
  SlotGameFrameworkOptions,
  SlotGameLiveSessionLike,
  SlotGameMountContext,
  SlotGameSpinRequest,
  SlotGameStateSnapshot,
  SlotGameViewportListener,
} from "./types.js";

export function createSlotGameFramework(
  options: SlotGameFrameworkOptions,
): SlotGameFramework {
  return new SlotGameFrameworkImpl(options);
}

class SlotGameFrameworkImpl implements SlotGameFramework {
  readonly #options: SlotGameFrameworkOptions;
  readonly #state: SlotGameStateStore;
  readonly #ui: SlotGameUiAdapter;
  readonly #session: SlotGameLiveSessionLike;
  readonly #mountPromise: Promise<void>;
  #destroyed = false;
  #roundId = 0;

  constructor(options: SlotGameFrameworkOptions) {
    validateFrameworkOptions(options);
    this.#options = options;
    this.#state = new SlotGameStateStore({
      designSize: options.designSize,
      betOptions: options.betOptions,
      initialBetIndex: options.initialBetIndex,
      initialBalance: options.initialBalance,
      initialWin: options.initialWin,
    });
    this.#ui = new SlotGameUiAdapter({
      root: options.root,
      designSize: this.#state.designSize,
      betOptions: this.#state.betOptions,
      initialBetIndex: options.initialBetIndex,
      initialBalance: options.initialBalance,
      initialWin: options.initialWin,
      framePolicy: options.framePolicy,
      brandLabel: options.brandLabel,
      currency: options.currency,
      locale: options.locale,
      formatMoney: options.formatMoney,
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
      onAutoModeChange: (enabled) => this.setAutoMode(enabled),
    });
    this.#session =
      options.liveSession ??
      new SlotGameLiveSession({
        live: options.live,
        clientFactory: options.clientFactory,
      });
    this.#mountPromise = this.#mountGameAdapter();
    this.#applyState();
  }

  async connect(): Promise<void> {
    this.#assertAlive();
    try {
      this.#state.setError(null);
      this.#state.setSpinState("connecting");
      this.#applyState();
      await this.#mountPromise;
      const userInfo = await this.#session.connect();
      const balance = requireFiniteBalance(
        userInfo,
        this.#options.initialBalance,
      );
      this.#state.setConnected(true);
      this.#state.setBalance(balance);
      await this.#options.gameAdapter.applyInitialState?.(
        createInitialState(userInfo, balance),
      );
      this.#state.setSpinState("idle");
      this.#state.setError(null);
      this.#applyState();
    } catch (error) {
      throw this.#handleFailure(error, "Slot game connect failed.");
    }
  }

  async spin(): Promise<GameLogic> {
    this.#assertAlive();
    const current = this.#state.getState();
    if (!current.connected) {
      throw new SlotGameRuntimeError("Cannot spin before connect succeeds.");
    }
    if (current.spinState !== "idle") {
      throw new SlotGameRuntimeError(
        "A slot game spin request is already in progress.",
      );
    }

    try {
      const betOption = current.betOption;
      const balanceBefore = current.balance;
      this.#state.setError(null);
      this.#state.setSpinState("spinning");
      this.#applyState();
      await this.#mountPromise;

      const params = buildSpinParams(
        this.#state.getState(),
        betOption,
        this.#options.buildSpinRequest,
      );
      const rawResult = await this.#session.spin(params);
      const balanceAfterSpin = readFiniteBalanceOrNull(
        this.#session.getUserInfo(),
      );
      const logicResult = createSlotGameLogicResult(rawResult, {
        bet: betOption,
        userInfo: this.#session.getUserInfo(),
        logicFactory: this.#options.logicFactory,
      });
      const round = createSlotGameRoundContext({
        id: ++this.#roundId,
        betOption,
        logicResult,
        balanceBefore,
        balanceAfterSpin,
      });

      this.#state.setWinAmount(logicResult.totalwin);
      this.#state.setSpinState("presenting");
      this.#applyState();
      await this.#options.gameAdapter.playSpin(logicResult.logic);

      if (round.shouldCollect) {
        this.#state.setSpinState("collecting");
        this.#applyState();
        const userInfo = await this.#session.collect();
        this.#state.setBalance(requireFiniteBalance(userInfo));
      } else if (balanceAfterSpin !== null) {
        this.#state.setBalance(balanceAfterSpin);
      }

      this.#state.setSpinState("idle");
      this.#state.setError(null);
      this.#applyState();
      return logicResult.logic;
    } catch (error) {
      throw this.#handleFailure(error, "Slot game spin failed.");
    }
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

  getState(): SlotGameStateSnapshot {
    return this.#state.getState();
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#ui.destroy();
    this.#session.disconnect();
    this.#options.gameAdapter.destroy?.();
  }

  async #mountGameAdapter(): Promise<void> {
    const context: SlotGameMountContext = Object.freeze({
      frame: this.#ui.elements.frame,
      gameLayer: this.#ui.elements.gameLayer,
      overlay: this.#ui.elements.overlay,
      getState: () => this.#state.getState(),
      getViewport: () => this.#ui.getViewport(),
      onViewportChange: (listener: SlotGameViewportListener) =>
        this.#ui.onViewportChange((viewport) => {
          try {
            listener(viewport);
          } catch (error) {
            this.#handleFailure(error, "Slot game viewport change failed.");
            throw error;
          }
        }),
    });
    await this.#options.gameAdapter.mount(context);
  }

  #applyState(): void {
    if (this.#destroyed) {
      return;
    }
    const snapshot = this.#state.getState();
    this.#ui.update(snapshot);
    this.#options.gameAdapter.setFrameworkState?.(snapshot);
    this.#options.onStateChange?.(snapshot);
  }

  #handleFailure(error: unknown, fallback: string): Error {
    const slotError = toSlotGameError(error, fallback);
    this.#state.setError(slotError);
    this.#applyState();
    this.#options.onError?.(slotError);
    return slotError;
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new SlotGameRuntimeError("Slot game framework has been destroyed.");
    }
  }
}

export function buildSpinParams(
  state: SlotGameStateSnapshot,
  bet: SlotGameBetOption,
  buildSpinRequest?: (
    state: SlotGameStateSnapshot,
    bet: SlotGameBetOption,
  ) => SlotGameSpinRequest,
): SpinParams {
  const defaultRequest: SlotGameSpinRequest = Object.freeze({
    bet: bet.bet,
    lines: bet.lines,
    ...(bet.times === undefined ? {} : { times: bet.times }),
  });
  if (!buildSpinRequest) {
    return defaultRequest as SpinParams;
  }
  const request = buildSpinRequest(state, bet);
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new SlotGameConfigError("buildSpinRequest must return an object.");
  }
  return Object.freeze({
    ...defaultRequest,
    ...request,
  }) as SpinParams;
}

function validateFrameworkOptions(options: SlotGameFrameworkOptions): void {
  if (
    typeof options.root !== "object" ||
    options.root === null ||
    typeof options.root.replaceChildren !== "function"
  ) {
    throw new SlotGameConfigError("root must be an HTMLElement.");
  }
  if (
    typeof options.gameAdapter !== "object" ||
    options.gameAdapter === null ||
    typeof options.gameAdapter.mount !== "function" ||
    typeof options.gameAdapter.playSpin !== "function"
  ) {
    throw new SlotGameConfigError(
      "gameAdapter must provide mount() and playSpin().",
    );
  }
  if (!options.live || typeof options.live.serverUrl !== "string") {
    throw new SlotGameConfigError("live.serverUrl is required.");
  }
  if (options.liveSession && options.clientFactory) {
    throw new SlotGameConfigError(
      "liveSession and clientFactory cannot be provided at the same time.",
    );
  }
}

function createInitialState(
  userInfo: Readonly<UserInfo>,
  balance: number,
): {
  readonly userInfo: Readonly<UserInfo>;
  readonly balance: number;
  readonly defaultScene?: readonly (readonly number[])[];
} {
  return Object.freeze({
    userInfo,
    balance,
    ...(userInfo.defaultScene === undefined
      ? {}
      : { defaultScene: userInfo.defaultScene }),
  });
}

function readFiniteBalanceOrNull(userInfo: Readonly<UserInfo>): number | null {
  return Number.isFinite(userInfo.balance)
    ? (userInfo.balance as number)
    : null;
}
