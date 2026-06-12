/* v8 ignore file -- public type declarations only. */

import type { GameLogic, GameLogicMeta } from "@slotclientengine/logiccore";
import type {
  Logger,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo
} from "@slotclientengine/netcore";

export interface SlotUiDesignSize {
  readonly width: number;
  readonly height: number;
}

export interface SlotUiBetOption {
  readonly bet: number;
  readonly lines: number;
  readonly times?: number;
  readonly label?: string;
}

export interface SlotUiLiveConfig {
  readonly serverUrl: string;
  readonly token?: string;
  readonly gamecode?: string;
  readonly businessid?: string;
  readonly clienttype?: string;
  readonly jurisdiction?: string;
  readonly language?: string;
  readonly requestTimeoutMs?: number;
}

export type SlotUiSpinState =
  | "idle"
  | "connecting"
  | "spinning"
  | "collecting"
  | "error"
  | "disabled";

export interface SlotUiStateSnapshot {
  readonly designSize: SlotUiDesignSize;
  readonly connected: boolean;
  readonly spinState: SlotUiSpinState;
  readonly balance: number | null;
  readonly win: number;
  readonly betIndex: number;
  readonly betOption: SlotUiBetOption;
  readonly muted: boolean;
  readonly fastMode: boolean;
  readonly autoMode: boolean;
  readonly error: string | null;
}

export interface SlotUiSpinResult {
  readonly rawResult: unknown;
  readonly gmi: unknown;
  readonly logic: GameLogic;
  readonly totalwin: number;
  readonly results: number;
  readonly userInfo: Readonly<UserInfo>;
}

export interface SlotInitialState {
  readonly userInfo: Readonly<UserInfo>;
  readonly balance: number;
  readonly defaultScene?: readonly (readonly number[])[];
}

export interface SlotGameMountContext {
  readonly designSize: SlotUiDesignSize;
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
  getState(): SlotUiStateSnapshot;
}

export interface SlotGameAdapter {
  mount(root: HTMLElement, context: SlotGameMountContext): void | Promise<void>;
  applyInitialState?(state: SlotInitialState): void | Promise<void>;
  applySpinResult(result: SlotUiSpinResult): void | Promise<void>;
  setUiState?(state: SlotUiStateSnapshot): void;
  destroy?(): void;
}

export interface SlotcraftClientLike {
  getUserInfo(): Readonly<UserInfo>;
  connect(token?: string): Promise<void>;
  enterGame(gamecode?: string): Promise<unknown>;
  spin(params: SpinParams): Promise<unknown>;
  collect(playIndex?: number): Promise<unknown>;
  disconnect(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off?(event: string, callback: (...args: unknown[]) => void): void;
}

export type SlotcraftClientFactory = (
  live: SlotUiLiveConfig,
  options: SlotcraftClientOptions,
) => SlotcraftClientLike;

export interface SlotUiFrameworkOptions {
  readonly root: HTMLElement;
  readonly gameAdapter: SlotGameAdapter;
  readonly designSize?: SlotUiDesignSize;
  readonly live: SlotUiLiveConfig;
  readonly betOptions: readonly SlotUiBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
  readonly initialMuted?: boolean;
  readonly initialFastMode?: boolean;
  readonly initialAutoMode?: boolean;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly buildSpinParams?: (
    state: SlotUiStateSnapshot,
    bet: SlotUiBetOption,
  ) => SpinParams;
  readonly clientFactory?: SlotcraftClientFactory;
  readonly logicFactory?: (gmi: unknown, meta: GameLogicMeta) => GameLogic;
  readonly logger?: Logger | null;
  readonly onStateChange?: (state: SlotUiStateSnapshot) => void;
  readonly onError?: (error: Error) => void;
}

export interface SlotUiFramework {
  connect(): Promise<void>;
  spin(): Promise<SlotUiSpinResult>;
  setBalance(balance: number): void;
  setBetIndex(index: number): void;
  setMuted(muted: boolean): void;
  setFastMode(enabled: boolean): void;
  setAutoMode(enabled: boolean): void;
  getState(): SlotUiStateSnapshot;
  destroy(): void;
}
