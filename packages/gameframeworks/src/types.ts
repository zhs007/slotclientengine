/* v8 ignore file -- public type declarations only. */

import type {
  GameConfigPaytableEntry,
  GameLogic,
  GameLogicMeta,
  GameLogicStep,
  LogicGameConfig,
  LogicComponent,
  LogicReels,
  ReelStopYOptions,
  SceneMatrix,
  WinResult,
} from "@slotclientengine/logiccore";
import type {
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";

export type {
  GameConfigPaytableEntry,
  GameLogic,
  GameLogicMeta,
  GameLogicStep,
  LogicGameConfig,
  LogicComponent,
  LogicReels,
  ReelStopYOptions,
  SceneMatrix,
  WinResult,
};

export interface SlotGameLiveConfig {
  readonly serverUrl: string;
  readonly token?: string;
  readonly gamecode?: string;
  readonly businessid?: string;
  readonly clienttype?: string;
  readonly jurisdiction?: string;
  readonly language?: string;
  readonly requestTimeoutMs?: number;
}

export interface SlotGameBetOption {
  readonly bet: number;
  readonly lines: number;
  readonly times?: number;
  readonly label?: string;
}

export interface SlotGameSpinRequest {
  readonly bet?: number;
  readonly lines?: number;
  readonly times?: number;
  readonly autonums?: number;
  readonly ctrlname?: string;
  readonly [key: string]: unknown;
}

export type SlotGameSpinState =
  | "idle"
  | "connecting"
  | "spinning"
  | "presenting"
  | "collecting"
  | "error"
  | "disabled";

export interface SlotGameStateSnapshot {
  readonly connected: boolean;
  readonly spinState: SlotGameSpinState;
  readonly balance: number | null;
  readonly win: number;
  readonly betIndex: number;
  readonly betOption: SlotGameBetOption;
  readonly muted: boolean;
  readonly fastMode: boolean;
  readonly autoMode: boolean;
  readonly error: string | null;
}

export interface SlotGameMountContext {
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
  getState(): SlotGameStateSnapshot;
}

export interface SlotGameInitialState {
  readonly userInfo: Readonly<UserInfo>;
  readonly balance: number;
  readonly defaultScene?: SceneMatrix;
}

export interface SlotGameClientLike {
  getUserInfo(): Readonly<UserInfo>;
  connect(token?: string): Promise<void>;
  enterGame(gamecode?: string): Promise<unknown>;
  spin(params: SpinParams): Promise<unknown>;
  collect(playIndex?: number): Promise<unknown>;
  disconnect(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off?(event: string, callback: (...args: unknown[]) => void): void;
}

export type SlotGameClientFactory = (
  live: SlotGameLiveConfig,
  options: SlotcraftClientOptions,
) => SlotGameClientLike;

export type SlotGameLogicFactory = (
  gmi: unknown,
  meta: GameLogicMeta,
) => GameLogic;

export interface SlotGameFrameworkOptions {
  readonly root: HTMLElement;
  readonly gameAdapter: SlotGameAdapter;
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
  readonly designSize?: { readonly width: number; readonly height: number };
  readonly brandLabel?: string;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly buildSpinRequest?: (
    state: SlotGameStateSnapshot,
    bet: SlotGameBetOption,
  ) => SlotGameSpinRequest;
  readonly clientFactory?: SlotGameClientFactory;
  readonly logicFactory?: SlotGameLogicFactory;
  readonly onStateChange?: (state: SlotGameStateSnapshot) => void;
  readonly onError?: (error: Error) => void;
}

export interface SlotGameAdapter {
  mount(context: SlotGameMountContext): void | Promise<void>;
  applyInitialState?(state: SlotGameInitialState): void | Promise<void>;
  playSpin(logic: GameLogic): void | Promise<void>;
  setFrameworkState?(state: SlotGameStateSnapshot): void;
  destroy?(): void;
}

export interface SlotGameFramework {
  connect(): Promise<void>;
  spin(): Promise<GameLogic>;
  setBetIndex(index: number): void;
  setMuted(muted: boolean): void;
  setFastMode(enabled: boolean): void;
  setAutoMode(enabled: boolean): void;
  getState(): SlotGameStateSnapshot;
  destroy(): void;
}
