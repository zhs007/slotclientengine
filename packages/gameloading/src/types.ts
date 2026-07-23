/* v8 ignore file -- public type declarations only. */

export interface GameLoadingResource<T = unknown> {
  readonly id: string;
  readonly url?: string;
  readonly kind?: GameLoadingResourceKind;
  readonly weight?: number;
  readonly load?: (context: GameLoadingResourceContext) => Promise<T> | T;
}

export type GameLoadingResourceKind =
  | "image"
  | "json"
  | "text"
  | "binary"
  | "wasm"
  | "module"
  | "style";

export interface GameLoadingOptions<
  TPrepareResult = unknown,
  TReadinessResult = void,
> {
  readonly root: HTMLElement;
  readonly ui: GameLoadingUiFactory;
  readonly resources: readonly GameLoadingResource[];
  readonly maxConcurrentResources?: number;
  readonly readiness?: GameLoadingReadiness<TReadinessResult>;
  readonly onBeforeComplete: (
    context: GameLoadingCompleteContext<TReadinessResult>,
  ) => Promise<TPrepareResult> | TPrepareResult;
  readonly onEnterGame: (
    context: GameLoadingEnterContext<TPrepareResult, TReadinessResult>,
  ) => Promise<void> | void;
  readonly onError?: (error: Error) => void;
}

export interface GameLoadingHandle {
  readonly loadedResources: ReadonlyMap<string, unknown>;
  start(): Promise<void>;
  destroy(): void;
}

export interface GameLoadingResourceContext {
  readonly resource: GameLoadingResource;
  readonly loadedResources: ReadonlyMap<string, unknown>;
  readonly signal: AbortSignal;
}

export interface GameLoadingReadinessContext {
  readonly signal: AbortSignal;
}

export interface GameLoadingReadiness<TResult> {
  start(context: GameLoadingReadinessContext): Promise<TResult> | TResult;
  dispose(result: TResult): Promise<void> | void;
}

export interface GameLoadingCompleteContext<TReadinessResult = void> {
  readonly loadedResources: ReadonlyMap<string, unknown>;
  readonly readinessResult: TReadinessResult;
  readonly signal: AbortSignal;
}

export interface GameLoadingEnterContext<
  TPrepareResult = unknown,
  TReadinessResult = void,
> extends GameLoadingCompleteContext<TReadinessResult> {
  readonly prepareResult: TPrepareResult;
}

export type GameLoadingUiPhase =
  | "loading-resources"
  | "preparing"
  | "entering-game"
  | "error";

export interface GameLoadingUiSnapshot {
  readonly phase: GameLoadingUiPhase;
  readonly progress: number;
  readonly error: string | null;
}

export interface GameLoadingUiCreateContext {
  readonly root: HTMLElement;
}

export interface GameLoadingUi {
  readonly readyToComplete?: Promise<void>;
  update(snapshot: GameLoadingUiSnapshot): void;
  playExit?(): Promise<void>;
  destroy(): void;
}

export interface GameLoadingUiFactory {
  create(context: GameLoadingUiCreateContext): GameLoadingUi;
}
