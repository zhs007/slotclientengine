import {
  SlotGameConfigError,
  SlotGameRuntimeError,
  toSlotGameError,
} from "./errors.js";
import { createSlotGameLogicResult } from "./logic-result.js";
import { createSlotGameRoundContext } from "./round-context.js";
import {
  createSlotGameRngConsoleController,
  type SlotGameRngConsoleController,
} from "./rng-console.js";
import { requireFiniteBalance, SlotGameLiveSession } from "./session.js";
import { SlotGameStateStore } from "./state.js";
import { createDefaultSlotGameUiFactory } from "./ui-adapter.js";
import { createAndValidateUi, validateViewportSnapshot } from "./ui-factory.js";
import type { SpinParams, UserInfo } from "@slotclientengine/netcore";
import { createMoneyFormatter } from "@slotclientengine/uiframeworks";
import type {
  GameLogic,
  SlotGameAdapter,
  SlotGameBetOption,
  SlotGameFramework,
  SlotGameFrameworkOptions,
  SlotGameLiveSessionLike,
  SlotGameMountContext,
  SlotGamePerformancePhase,
  SlotGamePerformanceTraceKind,
  SlotGameSpinRequest,
  SlotGameStateSnapshot,
  SlotGameUi,
  SlotGameUiCommands,
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
  readonly #ui: SlotGameUi;
  readonly #formatMoney: (amount: number) => string;
  readonly #session: SlotGameLiveSessionLike;
  readonly #mountPromise: Promise<void>;
  readonly #rngConsole: SlotGameRngConsoleController | null;
  readonly #reportedErrors = new Set<Error>();
  #destroyed = false;
  #lifecycleGeneration = 0;
  #fatalUiError: Error | null = null;
  #roundId = 0;
  #spinTraceId = 0;
  #activeSpinTraceId: number | null = null;

  constructor(options: SlotGameFrameworkOptions) {
    validateFrameworkOptions(options);
    this.#rngConsole =
      options.rngConsole === undefined
        ? null
        : createSlotGameRngConsoleController(options.rngConsole);
    try {
      this.#options = options;
      this.#emitPerformance("startup", 0, "framework-created");
      this.#state = new SlotGameStateStore({
        designSize: options.designSize,
        betOptions: options.betOptions,
        initialBetIndex: options.initialBetIndex,
        initialBalance: options.initialBalance,
        initialWin: options.initialWin,
        initialMuted: options.initialMuted,
        initialFastMode: options.initialFastMode,
        initialAutoMode: options.initialAutoMode,
      });
      this.#formatMoney = createMoneyFormatter({
        ...(options.currency === undefined
          ? {}
          : { currency: options.currency }),
        ...(options.locale === undefined ? {} : { locale: options.locale }),
        ...(options.formatMoney === undefined
          ? {}
          : { formatMoney: options.formatMoney }),
      });
      const commands = this.#createUiCommands();
      const uiFactory = options.uiFactory ?? createDefaultSlotGameUiFactory();
      this.#ui = createAndValidateUi(uiFactory, {
        root: options.root,
        designSize: this.#state.designSize,
        framePolicy: options.framePolicy,
        betOptions: this.#state.betOptions,
        initialState: this.#state.getState(),
        brandLabel: options.brandLabel,
        currency: options.currency,
        locale: options.locale,
        formatMoney: this.#formatMoney,
        commands,
      });
      this.#session =
        options.liveSession ??
        new SlotGameLiveSession({
          live: options.live,
          clientFactory: options.clientFactory,
        });
      this.#mountPromise = this.#mountGameAdapter().catch((error: unknown) => {
        try {
          this.#rngConsole?.destroy();
        } catch {
          // The mount failure remains authoritative.
        }
        throw error;
      });
      this.#applyState();
    } catch (error) {
      try {
        this.#rngConsole?.destroy();
      } catch {
        // The constructor failure remains authoritative.
      }
      throw error;
    }
  }

  async connect(): Promise<void> {
    this.#assertAlive();
    const generation = this.#lifecycleGeneration;
    this.#emitPerformance("startup", 0, "connect-start");
    try {
      this.#state.setError(null);
      this.#state.setSpinState("connecting");
      this.#applyState();
      await this.#mountPromise;
      this.#assertOperationActive(generation);
      this.#emitPerformance("startup", 0, "session-connect-start");
      const userInfo = await this.#session.connect();
      this.#emitPerformance("startup", 0, "session-connect-complete");
      this.#assertOperationActive(generation);
      const balance = requireFiniteBalance(
        userInfo,
        this.#options.initialBalance,
      );
      this.#state.setConnected(true);
      this.#state.setBalance(balance);
      this.#emitPerformance("startup", 0, "initial-state-start");
      await this.#options.gameAdapter.applyInitialState?.(
        createInitialState(userInfo, balance),
      );
      this.#emitPerformance("startup", 0, "initial-state-complete");
      this.#assertOperationActive(generation);
      this.#state.setSpinState("idle");
      this.#state.setError(null);
      this.#applyState();
      this.#emitPerformance("startup", 0, "connect-complete");
    } catch (error) {
      this.#emitPerformance("startup", 0, "failed");
      throw this.#handleOperationFailure(
        error,
        generation,
        "Slot game connect failed.",
      );
    }
  }

  async spin(): Promise<GameLogic> {
    return this.#spin(++this.#spinTraceId);
  }

  async #spin(traceId: number): Promise<GameLogic> {
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

    const generation = this.#lifecycleGeneration;
    let preSpinStarted = false;
    this.#activeSpinTraceId = traceId;
    this.#emitPerformance("spin", traceId, "spin-start");
    try {
      const betOption = current.betOption;
      const balanceBefore = current.balance;
      this.#state.setError(null);
      this.#state.setSpinState("spinning");
      this.#applyState();
      await this.#mountPromise;
      this.#assertOperationActive(generation);

      this.#emitPerformance("spin", traceId, "request-build-start");
      const baseParams = buildSpinParams(
        this.#state.getState(),
        betOption,
        this.#options.buildSpinRequest,
      );
      const nextRandomNumbers = this.#rngConsole?.takeNext();
      const params =
        nextRandomNumbers === undefined
          ? baseParams
          : (Object.freeze({
              ...baseParams,
              lstrand: nextRandomNumbers,
            }) as SpinParams);
      this.#emitPerformance("spin", traceId, "request-build-complete");
      this.#emitPerformance("spin", traceId, "request-send");
      const responsePromise = this.#session.spin(params);
      // A synchronous presentation hook can fail after the request has already
      // been dispatched. Observe the request in that case so a later rejection
      // never becomes unhandled while the authoritative hook error is reported.
      void responsePromise.catch(() => undefined);
      if (this.#options.gameAdapter.startSpinPresentation) {
        this.#emitPerformance("spin", traceId, "adapter-pre-spin-start");
        this.#options.gameAdapter.startSpinPresentation();
        preSpinStarted = true;
        this.#emitPerformance("spin", traceId, "adapter-pre-spin-complete");
      }
      const rawResult = await responsePromise;
      this.#emitPerformance("spin", traceId, "response-received");
      this.#assertOperationActive(generation);
      const balanceAfterSpin = readFiniteBalanceOrNull(
        this.#session.getUserInfo(),
      );
      this.#emitPerformance("spin", traceId, "logic-parse-start");
      const logicResult = createSlotGameLogicResult(rawResult, {
        bet: betOption,
        userInfo: this.#session.getUserInfo(),
        logicFactory: this.#options.logicFactory,
      });
      this.#emitPerformance("spin", traceId, "logic-parse-complete");
      this.#rngConsole?.logRandomNumbers(logicResult.logic.getRandomNumbers());
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
      this.#assertOperationActive(generation);
      this.#emitPerformance("spin", traceId, "adapter-play-start");
      await this.#options.gameAdapter.playSpin(logicResult.logic);
      this.#emitPerformance("spin", traceId, "adapter-play-complete");
      preSpinStarted = false;
      this.#assertOperationActive(generation);

      if (round.shouldCollect) {
        this.#state.setSpinState("collecting");
        this.#applyState();
        this.#assertOperationActive(generation);
        this.#emitPerformance("spin", traceId, "collect-start");
        const userInfo = await this.#session.collect();
        this.#emitPerformance("spin", traceId, "collect-complete");
        this.#assertOperationActive(generation);
        this.#state.setBalance(requireFiniteBalance(userInfo));
      } else if (balanceAfterSpin !== null) {
        this.#state.setBalance(balanceAfterSpin);
      }

      this.#state.setSpinState("idle");
      this.#state.setError(null);
      this.#applyState();
      this.#emitPerformance("spin", traceId, "spin-complete");
      this.#activeSpinTraceId = null;
      return logicResult.logic;
    } catch (error) {
      if (preSpinStarted) {
        this.#emitPerformance("spin", traceId, "adapter-pre-spin-cancel");
        try {
          this.#options.gameAdapter.cancelSpinPresentation?.(
            toSlotGameError(error, "Slot game spin failed."),
          );
        } catch (cancelError) {
          this.#reportError(
            toSlotGameError(
              cancelError,
              "Slot game pre-spin cancellation failed.",
            ),
          );
        }
      }
      this.#emitPerformance("spin", traceId, "failed");
      this.#activeSpinTraceId = null;
      throw this.#handleOperationFailure(
        error,
        generation,
        "Slot game spin failed.",
      );
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
    const cleanupError = this.#destroyResources();
    if (cleanupError) {
      throw cleanupError;
    }
  }

  async #mountGameAdapter(): Promise<void> {
    this.#emitPerformance("startup", 0, "adapter-mount-start");
    const context: SlotGameMountContext = Object.freeze({
      frame: this.#ui.elements.frame,
      gameLayer: this.#ui.elements.gameLayer,
      overlay: this.#ui.elements.overlay,
      formatMoney: this.#formatMoney,
      getState: () => this.#state.getState(),
      getViewport: () => {
        this.#assertAlive();
        return validateViewportSnapshot(this.#ui.getViewport());
      },
      onViewportChange: (listener: SlotGameViewportListener) => {
        if (this.#destroyed) {
          return () => undefined;
        }
        const unsubscribe = this.#ui.onViewportChange((viewport) => {
          if (this.#destroyed) {
            return;
          }
          try {
            listener(validateViewportSnapshot(viewport));
          } catch (error) {
            this.#handleFailure(error, "Slot game viewport change failed.");
            throw error;
          }
        });
        if (typeof unsubscribe !== "function") {
          throw new SlotGameConfigError(
            "SlotGameUi.onViewportChange() must return an unsubscribe function.",
          );
        }
        let subscribed = true;
        return () => {
          if (!subscribed) {
            return;
          }
          subscribed = false;
          unsubscribe();
        };
      },
    });
    await this.#options.gameAdapter.mount(context);
    this.#emitPerformance("startup", 0, "adapter-mount-complete");
  }

  #applyState(): void {
    if (this.#destroyed) {
      return;
    }
    const snapshot = this.#state.getState();
    try {
      this.#ui.update(snapshot);
    } catch (error) {
      throw this.#handleUiUpdateFailure(error);
    }
    if (this.#destroyed) {
      return;
    }
    this.#options.gameAdapter.setFrameworkState?.(snapshot);
    this.#options.onStateChange?.(snapshot);
  }

  #handleFailure(error: unknown, fallback: string): Error {
    if (this.#fatalUiError) {
      return this.#fatalUiError;
    }
    if (this.#destroyed) {
      return createDestroyedError();
    }
    const slotError = toSlotGameError(error, fallback);
    this.#state.setError(slotError);
    try {
      this.#applyState();
    } catch (stateError) {
      return this.#fatalUiError ?? toSlotGameError(stateError, fallback);
    }
    this.#reportError(slotError);
    return slotError;
  }

  #handleOperationFailure(
    error: unknown,
    generation: number,
    fallback: string,
  ): Error {
    if (this.#fatalUiError) {
      return this.#fatalUiError;
    }
    if (this.#destroyed || generation !== this.#lifecycleGeneration) {
      return createDestroyedError();
    }
    return this.#handleFailure(error, fallback);
  }

  #handleUiUpdateFailure(error: unknown): Error {
    if (this.#fatalUiError) {
      return this.#fatalUiError;
    }
    const slotError = toSlotGameError(error, "Slot game UI update failed.");
    this.#fatalUiError = slotError;
    this.#destroyResources();
    void this.#mountPromise?.catch(() => undefined);
    this.#reportError(slotError);
    return slotError;
  }

  #reportError(error: Error): void {
    if (this.#reportedErrors.has(error)) {
      return;
    }
    this.#reportedErrors.add(error);
    try {
      this.#options.onError?.(error);
    } catch {
      // Error observers must not replace or duplicate the original failure.
    }
  }

  #destroyResources(): Error | null {
    if (this.#destroyed) {
      return null;
    }
    this.#destroyed = true;
    if (this.#activeSpinTraceId !== null) {
      this.#emitPerformance("spin", this.#activeSpinTraceId, "destroyed");
      this.#activeSpinTraceId = null;
    }
    this.#emitPerformance("startup", 0, "destroyed");
    this.#lifecycleGeneration += 1;
    let firstError: Error | null = null;
    for (const cleanup of [
      () => this.#rngConsole?.destroy(),
      () => this.#ui.destroy(),
      () => this.#session.disconnect(),
      () => this.#options.gameAdapter.destroy?.(),
    ]) {
      try {
        cleanup();
      } catch (error) {
        firstError ??= toSlotGameError(error, "Slot game destroy failed.");
      }
    }
    return firstError;
  }

  #createUiCommands(): SlotGameUiCommands {
    return Object.freeze({
      requestSpin: (): void => {
        if (this.#destroyed) {
          return;
        }
        const traceId = ++this.#spinTraceId;
        this.#emitPerformance("spin", traceId, "command-received");
        void this.#spin(traceId).catch(() => undefined);
      },
      increaseBet: (): void => {
        if (this.#destroyed) {
          return;
        }
        this.#state.increaseBet();
        this.#applyState();
      },
      decreaseBet: (): void => {
        if (this.#destroyed) {
          return;
        }
        this.#state.decreaseBet();
        this.#applyState();
      },
      setMuted: (muted: boolean): void => {
        if (!this.#destroyed) {
          this.setMuted(muted);
        }
      },
      setFastMode: (enabled: boolean): void => {
        if (!this.#destroyed) {
          this.setFastMode(enabled);
        }
      },
      setAutoMode: (enabled: boolean): void => {
        if (!this.#destroyed) {
          this.setAutoMode(enabled);
        }
      },
    });
  }

  #assertOperationActive(generation: number): void {
    if (this.#destroyed || generation !== this.#lifecycleGeneration) {
      throw createDestroyedError();
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new SlotGameRuntimeError("Slot game framework has been destroyed.");
    }
  }

  #emitPerformance(
    traceKind: SlotGamePerformanceTraceKind,
    traceId: number,
    phase: SlotGamePerformancePhase,
  ): void {
    const observer = this.#options.performanceObserver;
    if (!observer) return;
    try {
      const now = observer.now ?? defaultPerformanceNow;
      const atMs = now();
      if (!Number.isFinite(atMs)) return;
      observer.onEvent(Object.freeze({ traceKind, traceId, phase, atMs }));
    } catch {
      // Diagnostic observers must never change game behavior.
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
  const hasPreSpinStart =
    options.gameAdapter.startSpinPresentation !== undefined;
  const hasPreSpinCancel =
    options.gameAdapter.cancelSpinPresentation !== undefined;
  if (hasPreSpinStart !== hasPreSpinCancel) {
    throw new SlotGameConfigError(
      "gameAdapter startSpinPresentation() and cancelSpinPresentation() must be provided together.",
    );
  }
  if (
    (hasPreSpinStart &&
      typeof options.gameAdapter.startSpinPresentation !== "function") ||
    (hasPreSpinCancel &&
      typeof options.gameAdapter.cancelSpinPresentation !== "function")
  ) {
    throw new SlotGameConfigError(
      "gameAdapter pre-spin presentation hooks must be functions.",
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
  if (
    options.uiFactory !== undefined &&
    (typeof options.uiFactory !== "object" ||
      options.uiFactory === null ||
      typeof options.uiFactory.create !== "function")
  ) {
    throw new SlotGameConfigError("uiFactory must provide create().");
  }
  if (
    options.performanceObserver !== undefined &&
    (typeof options.performanceObserver !== "object" ||
      options.performanceObserver === null ||
      typeof options.performanceObserver.onEvent !== "function" ||
      (options.performanceObserver.now !== undefined &&
        typeof options.performanceObserver.now !== "function"))
  ) {
    throw new SlotGameConfigError(
      "performanceObserver must provide onEvent() and an optional now().",
    );
  }
}

function defaultPerformanceNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function createDestroyedError(): SlotGameRuntimeError {
  return new SlotGameRuntimeError("Slot game framework has been destroyed.");
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
