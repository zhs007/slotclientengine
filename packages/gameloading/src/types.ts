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

export interface GameLoadingOptions<TPrepareResult = unknown> {
  readonly root: HTMLElement;
  readonly resources: readonly GameLoadingResource[];
  readonly onBeforeComplete: (
    context: GameLoadingCompleteContext,
  ) => Promise<TPrepareResult> | TPrepareResult;
  readonly onEnterGame: (
    context: GameLoadingEnterContext<TPrepareResult>,
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
}

export interface GameLoadingCompleteContext {
  readonly loadedResources: ReadonlyMap<string, unknown>;
}

export interface GameLoadingEnterContext<
  TPrepareResult = unknown,
> extends GameLoadingCompleteContext {
  readonly prepareResult: TPrepareResult;
}
