/* v8 ignore file -- public type declarations only. */

import type { GameLogic, GameLogicMeta } from "@slotclientengine/logiccore";
import type {
  Logger,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";

export interface SlotUiDesignSize {
  readonly width: number;
  readonly height: number;
}

export interface SlotUiFocusFramePolicy {
  readonly mode: "focus";
  readonly maxDesignSize: SlotUiDesignSize;
  readonly preferredPortraitSize: SlotUiDesignSize;
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

export interface SlotUiOrientationFocusFrameVariant {
  readonly maxDesignSize: SlotUiDesignSize;
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

export interface SlotUiOrientationFocusFramePolicy {
  readonly mode: "orientation-focus";
  readonly variants: {
    readonly landscape: SlotUiOrientationFocusFrameVariant;
    readonly portrait: SlotUiOrientationFocusFrameVariant;
  };
}

export type SlotUiFramePolicy =
  | { readonly mode: "fixed" }
  | SlotUiFocusFramePolicy
  | SlotUiOrientationFocusFramePolicy;

export interface SlotUiViewportSnapshot {
  readonly pageSize: SlotUiDesignSize;
  readonly frameDesignSize: SlotUiDesignSize;
  readonly scale: number;
  readonly cssSize: SlotUiDesignSize;
  readonly offsetX: number;
  readonly offsetY: number;
}

export type SlotUiViewportListener = (viewport: SlotUiViewportSnapshot) => void;

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

export interface SlotUiClockOptions {
  readonly now?: () => Date;
  readonly locale?: string;
  readonly hour12?: boolean;
  readonly updateIntervalMs?: number;
  readonly format?: (date: Date) => string;
}

export interface SlotUiBuyBonusOptions {
  readonly label?: string;
  readonly enabled?: boolean;
}

export type SlotUiSpinState =
  | "idle"
  | "connecting"
  | "spinning"
  | "presenting"
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
  getViewport(): SlotUiViewportSnapshot;
  onViewportChange(listener: SlotUiViewportListener): () => void;
}

export interface SlotGameAdapter {
  mount(root: HTMLElement, context: SlotGameMountContext): void | Promise<void>;
  applyInitialState?(state: SlotInitialState): void | Promise<void>;
  applySpinResult(result: SlotUiSpinResult): void | Promise<void>;
  setUiState?(state: SlotUiStateSnapshot): void;
  destroy?(): void;
}

export interface SlotUiControllerElements {
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
}

export interface SlotUiControllerHandlers {
  readonly onMenu?: () => void;
  readonly onBuyBonus?: () => void;
  readonly onSpin: () => void;
  readonly onIncreaseBet: () => void;
  readonly onDecreaseBet: () => void;
  readonly onMutedChange: (muted: boolean) => void;
  readonly onFastModeChange: (enabled: boolean) => void;
  readonly onAutoModeChange: (enabled: boolean) => void;
}

export interface SlotUiControllerOptions {
  readonly root: HTMLElement;
  readonly designSize?: SlotUiDesignSize;
  readonly framePolicy?: SlotUiFramePolicy;
  readonly betOptions: readonly SlotUiBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
  readonly initialMuted?: boolean;
  readonly initialFastMode?: boolean;
  readonly initialAutoMode?: boolean;
  readonly brandLabel?: string;
  readonly clock?: false | SlotUiClockOptions;
  readonly buyBonus?: false | SlotUiBuyBonusOptions;
  readonly showFastToggle?: boolean;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly handlers: SlotUiControllerHandlers;
}

export interface SlotUiController {
  readonly elements: SlotUiControllerElements;
  getViewport(): SlotUiViewportSnapshot;
  onViewportChange(listener: SlotUiViewportListener): () => void;
  update(state: SlotUiStateSnapshot): void;
  destroy(): void;
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
  readonly framePolicy?: SlotUiFramePolicy;
  readonly live: SlotUiLiveConfig;
  readonly betOptions: readonly SlotUiBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
  readonly initialMuted?: boolean;
  readonly initialFastMode?: boolean;
  readonly initialAutoMode?: boolean;
  readonly brandLabel?: string;
  readonly clock?: false | SlotUiClockOptions;
  readonly buyBonus?: false | SlotUiBuyBonusOptions;
  readonly showFastToggle?: boolean;
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
  readonly onMenu?: () => void;
  readonly onInfo?: () => void;
  readonly onSettings?: () => void;
  readonly onBuyBonus?: () => void;
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
  getViewport(): SlotUiViewportSnapshot;
  onViewportChange(listener: SlotUiViewportListener): () => void;
  destroy(): void;
}
