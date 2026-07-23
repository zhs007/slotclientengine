/* v8 ignore file -- public type declarations only. */

import type {
  ComponentWinResultGroup,
  ComponentWinResultPositionValidationContext,
  ComponentWinResultPositionValidator,
  GameConfigPaytableEntry,
  GameLogic,
  GameLogicMeta,
  GameLogicStep,
  LogicGameConfig,
  LogicComponent,
  LogicReels,
  OtherSceneMatrix,
  ReelStopYOptions,
  SceneMatrix,
  WinResult,
  WinResultPosition,
} from "@slotclientengine/logiccore";
import type {
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";

export type {
  ComponentWinResultGroup,
  ComponentWinResultPositionValidationContext,
  ComponentWinResultPositionValidator,
  GameConfigPaytableEntry,
  GameLogic,
  GameLogicMeta,
  GameLogicStep,
  LogicGameConfig,
  LogicComponent,
  LogicReels,
  OtherSceneMatrix,
  ReelStopYOptions,
  SceneMatrix,
  WinResult,
  WinResultPosition,
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

export interface SlotGameFocusFramePolicy {
  readonly mode: "focus";
  readonly maxDesignSize: { readonly width: number; readonly height: number };
  readonly preferredPortraitSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly focusRect: {
    readonly width: number;
    readonly height: number;
  };
  readonly minFocusMargin?: {
    readonly left?: number;
    readonly right?: number;
    readonly top?: number;
    readonly bottom?: number;
  };
}

export interface SlotGameOrientationFocusFrameVariant {
  readonly maxDesignSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly focusRect: {
    readonly width: number;
    readonly height: number;
  };
  readonly minFocusMargin?: {
    readonly left?: number;
    readonly right?: number;
    readonly top?: number;
    readonly bottom?: number;
  };
}

export interface SlotGameOrientationFocusFramePolicy {
  readonly mode: "orientation-focus";
  readonly variants: {
    readonly landscape: SlotGameOrientationFocusFrameVariant;
    readonly portrait: SlotGameOrientationFocusFrameVariant;
  };
}

export interface SlotGameMaximizedFocusFramePolicy {
  readonly mode: "maximized-focus";
  resolveViewportSize(pageSize: {
    readonly width: number;
    readonly height: number;
  }): { readonly width: number; readonly height: number };
}

export type SlotGameFramePolicy =
  | { readonly mode: "fixed" }
  | SlotGameFocusFramePolicy
  | SlotGameOrientationFocusFramePolicy
  | SlotGameMaximizedFocusFramePolicy;

export interface SlotGameViewportSnapshot {
  readonly pageSize: { readonly width: number; readonly height: number };
  readonly frameDesignSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly scale: number;
  readonly cssSize: { readonly width: number; readonly height: number };
  readonly offsetX: number;
  readonly offsetY: number;
}

export type SlotGameViewportListener = (
  viewport: SlotGameViewportSnapshot,
) => void;

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

export interface SlotGameUiElements {
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
}

export interface SlotGameUiCommands {
  requestSpin(): void;
  increaseBet(): void;
  decreaseBet(): void;
  setMuted(muted: boolean): void;
  setFastMode(enabled: boolean): void;
  setAutoMode(enabled: boolean): void;
}

export interface SlotGameUiCreateContext {
  readonly root: HTMLElement;
  readonly designSize: { readonly width: number; readonly height: number };
  readonly framePolicy?: SlotGameFramePolicy;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialState: SlotGameStateSnapshot;
  readonly brandLabel?: string;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly commands: SlotGameUiCommands;
}

export interface SlotGameUi {
  readonly elements: SlotGameUiElements;
  getViewport(): SlotGameViewportSnapshot;
  onViewportChange(listener: SlotGameViewportListener): () => void;
  update(state: SlotGameStateSnapshot): void;
  destroy(): void;
}

export interface SlotGameUiFactory {
  create(context: SlotGameUiCreateContext): SlotGameUi;
}

export interface SlotGameMountContext {
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
  getState(): SlotGameStateSnapshot;
  getViewport(): SlotGameViewportSnapshot;
  onViewportChange(listener: SlotGameViewportListener): () => void;
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

export interface SlotGameLiveSessionLike {
  getUserInfo(): Readonly<UserInfo>;
  connect(): Promise<Readonly<UserInfo>>;
  spin(params: SpinParams): Promise<unknown>;
  collect(playIndex?: number): Promise<Readonly<UserInfo>>;
  disconnect(): void;
}

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
  readonly initialMuted?: boolean;
  readonly initialFastMode?: boolean;
  readonly initialAutoMode?: boolean;
  readonly designSize?: { readonly width: number; readonly height: number };
  readonly framePolicy?: SlotGameFramePolicy;
  readonly brandLabel?: string;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly buildSpinRequest?: (
    state: SlotGameStateSnapshot,
    bet: SlotGameBetOption,
  ) => SlotGameSpinRequest;
  readonly liveSession?: SlotGameLiveSessionLike;
  readonly clientFactory?: SlotGameClientFactory;
  readonly logicFactory?: SlotGameLogicFactory;
  readonly uiFactory?: SlotGameUiFactory;
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
