import { loadGameLoadingResource } from "./default-loaders.js";
import type {
  GameLoadingHandle,
  GameLoadingOptions,
  GameLoadingResource,
  GameLoadingUi,
  GameLoadingUiPhase,
} from "./types.js";

interface NormalizedResource {
  readonly resource: GameLoadingResource;
  readonly weight: number;
}

const DEFAULT_MAX_CONCURRENT_RESOURCES = 6;

export function createGameLoading<
  TPrepareResult = unknown,
  TReadinessResult = void,
>(
  options: GameLoadingOptions<TPrepareResult, TReadinessResult>,
): GameLoadingHandle {
  return new GameLoadingController(options);
}

class GameLoadingController<
  TPrepareResult = unknown,
  TReadinessResult = void,
> implements GameLoadingHandle {
  readonly #options: GameLoadingOptions<TPrepareResult, TReadinessResult>;
  readonly #resources: readonly NormalizedResource[];
  readonly #maxConcurrentResources: number;
  readonly #ui: GameLoadingUi;
  readonly #visualReady: Promise<void>;
  readonly #loadedResources = new Map<string, unknown>();
  readonly #abortController = new AbortController();
  #destroyed = false;
  #uiDestroyed = false;
  #startPromise: Promise<void> | null = null;
  #progress = 0;
  #readinessResult: TReadinessResult | undefined;
  #hasReadinessResult = false;
  #readinessDisposed = false;
  #readinessTransferred = false;

  constructor(options: GameLoadingOptions<TPrepareResult, TReadinessResult>) {
    validateOptions(options);
    this.#options = options;
    this.#resources = normalizeResources(options.resources);
    this.#maxConcurrentResources = normalizeMaxConcurrentResources(
      options.maxConcurrentResources,
      this.#resources.length,
    );
    options.root.hidden = false;
    this.#ui = options.ui.create({ root: options.root });
    validateUi(this.#ui);
    this.#visualReady = Promise.resolve(this.#ui.readyToComplete);
    void this.#visualReady.catch(() => undefined);
    this.#publish("loading-resources", 0, null);
  }

  get loadedResources(): ReadonlyMap<string, unknown> {
    return this.#loadedResources;
  }

  start(): Promise<void> {
    this.#startPromise ??= this.#run();
    return this.#startPromise;
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#abortController.abort();
    void this.#disposeReadinessResult();
    this.#destroyUi();
    this.#options.root.hidden = true;
  }

  async #run(): Promise<void> {
    const readinessPromise = this.#startReadiness();
    const resourcesPromise = this.#loadResources();
    const visualPromise = waitWithAbort(
      this.#visualReady,
      this.#abortController.signal,
    );
    try {
      const [readinessResult] = await Promise.all([
        readinessPromise,
        resourcesPromise.then(() => undefined),
        visualPromise,
      ]);
      if (this.#destroyed) {
        return;
      }

      const prepareResult = await waitWithAbort(
        Promise.resolve(
          this.#options.onBeforeComplete({
            loadedResources: this.#loadedResources,
            readinessResult,
            signal: this.#abortController.signal,
          }),
        ),
        this.#abortController.signal,
      );
      if (this.#destroyed) {
        return;
      }
      this.#readinessTransferred = true;

      this.#publish("entering-game", 100, null);
      await waitWithAbort(
        Promise.resolve(
          this.#options.onEnterGame({
            loadedResources: this.#loadedResources,
            prepareResult,
            readinessResult,
            signal: this.#abortController.signal,
          }),
        ),
        this.#abortController.signal,
      );
      if (this.#destroyed) {
        return;
      }
      await waitWithAbort(
        Promise.resolve(this.#ui.playExit?.()),
        this.#abortController.signal,
      );
      if (this.#destroyed) {
        return;
      }
      this.#destroyUi();
      this.#options.root.hidden = true;
    } catch (error) {
      if (this.#destroyed) {
        return;
      }
      const normalized = toError(error);
      this.#abortController.abort();
      await this.#disposeReadinessResult();
      this.#options.root.hidden = false;
      try {
        this.#publish("error", this.#progress, normalized.message);
      } catch {
        // The original error remains authoritative when rendering the error fails.
      }
      try {
        this.#options.onError?.(normalized);
      } catch {
        // Error observers cannot replace the loading failure.
      }
      throw normalized;
    }
  }

  async #loadResources(): Promise<void> {
    const totalWeight = this.#resources.reduce(
      (total, item) => total + item.weight,
      0,
    );
    let completedWeight = 0;
    await runConcurrent(
      this.#resources,
      this.#maxConcurrentResources,
      async ({ resource, weight }) => {
        const value = await loadGameLoadingResource(resource, {
          resource,
          loadedResources: this.#loadedResources,
          signal: this.#abortController.signal,
        });
        if (this.#destroyed || this.#abortController.signal.aborted) return;
        this.#loadedResources.set(resource.id, value);
        completedWeight += weight;
        if (completedWeight >= totalWeight) {
          this.#publish("preparing", 99, null);
        } else {
          this.#publish(
            "loading-resources",
            (completedWeight / totalWeight) * 99,
            null,
          );
        }
      },
      this.#abortController.signal,
    );
    if (this.#abortController.signal.aborted) throw createAbortError();
  }

  #startReadiness(): Promise<TReadinessResult> {
    const readiness = this.#options.readiness;
    let promise: Promise<TReadinessResult>;
    try {
      promise = readiness
        ? Promise.resolve(
            readiness.start({ signal: this.#abortController.signal }),
          )
        : Promise.resolve(undefined as TReadinessResult);
    } catch (error) {
      promise = Promise.reject(error);
    }
    return promise.then(async (result) => {
      if (this.#abortController.signal.aborted || this.#destroyed) {
        await this.#disposeLateReadinessResult(result);
        throw createAbortError();
      }
      this.#readinessResult = result;
      this.#hasReadinessResult = true;
      return result;
    });
  }

  async #disposeLateReadinessResult(result: TReadinessResult): Promise<void> {
    if (!this.#options.readiness || this.#readinessTransferred) return;
    if (this.#readinessDisposed) return;
    this.#readinessDisposed = true;
    try {
      await this.#options.readiness.dispose(result);
    } catch {
      // Cleanup failures never replace the authoritative loading failure.
    }
  }

  async #disposeReadinessResult(): Promise<void> {
    if (
      !this.#hasReadinessResult ||
      this.#readinessTransferred ||
      this.#readinessDisposed ||
      !this.#options.readiness
    ) {
      return;
    }
    this.#readinessDisposed = true;
    try {
      await this.#options.readiness.dispose(
        this.#readinessResult as TReadinessResult,
      );
    } catch {
      // Cleanup failures never replace the authoritative loading failure.
    }
  }

  #publish(
    phase: GameLoadingUiPhase,
    progress: number,
    error: string | null,
  ): void {
    if (this.#destroyed || this.#uiDestroyed) {
      return;
    }
    const normalizedProgress = normalizeProgress(progress);
    this.#progress = normalizedProgress;
    this.#ui.update(
      Object.freeze({ phase, progress: normalizedProgress, error }),
    );
  }

  #destroyUi(): void {
    if (this.#uiDestroyed) {
      return;
    }
    this.#uiDestroyed = true;
    this.#ui.destroy();
  }
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Game loading progress must be finite.");
  }
  return Math.max(0, Math.min(100, value));
}

function normalizeMaxConcurrentResources(
  value: number | undefined,
  resourceCount: number,
): number {
  const maxConcurrentResources = value ?? DEFAULT_MAX_CONCURRENT_RESOURCES;
  if (
    !Number.isInteger(maxConcurrentResources) ||
    maxConcurrentResources <= 0
  ) {
    throw new Error(
      "Game loading maxConcurrentResources must be a positive integer.",
    );
  }
  return Math.min(maxConcurrentResources, resourceCount);
}

function runConcurrent<T>(
  items: readonly T[],
  maxConcurrent: number,
  task: (item: T) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let nextIndex = 0;
    let activeCount = 0;
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => finish(resolve);
    const schedule = () => {
      if (settled) {
        return;
      }
      if (signal.aborted) {
        finish(resolve);
        return;
      }
      if (nextIndex >= items.length && activeCount === 0) {
        finish(resolve);
        return;
      }
      while (
        !signal.aborted &&
        activeCount < maxConcurrent &&
        nextIndex < items.length
      ) {
        const item = items[nextIndex];
        nextIndex += 1;
        activeCount += 1;
        void task(item).then(
          () => {
            activeCount -= 1;
            schedule();
          },
          (error) => finish(() => reject(error)),
        );
      }
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    schedule();
  });
}

function waitWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener("abort", handleAbort);
      reject(createAbortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
}

function createAbortError(): Error {
  return new DOMException("Game loading was aborted.", "AbortError");
}

function validateOptions<TPrepareResult, TReadinessResult>(
  options: GameLoadingOptions<TPrepareResult, TReadinessResult>,
): void {
  if (
    typeof HTMLElement === "undefined" ||
    !(options.root instanceof HTMLElement)
  ) {
    throw new Error("Game loading root must be an HTMLElement.");
  }
  if (!options.ui || typeof options.ui.create !== "function") {
    throw new Error("Game loading ui must be a factory.");
  }
  if (typeof options.onBeforeComplete !== "function") {
    throw new Error("Game loading onBeforeComplete must be a function.");
  }
  if (typeof options.onEnterGame !== "function") {
    throw new Error("Game loading onEnterGame must be a function.");
  }
  if (options.onError !== undefined && typeof options.onError !== "function") {
    throw new Error("Game loading onError must be a function when provided.");
  }
  if (
    options.readiness !== undefined &&
    (typeof options.readiness !== "object" ||
      options.readiness === null ||
      typeof options.readiness.start !== "function" ||
      typeof options.readiness.dispose !== "function")
  ) {
    throw new Error(
      "Game loading readiness must provide start() and dispose().",
    );
  }
}

function validateUi(ui: GameLoadingUi): void {
  if (
    !ui ||
    typeof ui.update !== "function" ||
    typeof ui.destroy !== "function" ||
    (ui.playExit !== undefined && typeof ui.playExit !== "function")
  ) {
    throw new Error("Game loading ui factory returned an invalid UI.");
  }
}

function normalizeResources(
  resources: readonly GameLoadingResource[],
): readonly NormalizedResource[] {
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error("Game loading resources must be a non-empty array.");
  }
  const seenIds = new Set<string>();
  return Object.freeze(
    resources.map((resource, index) => {
      if (typeof resource.id !== "string" || resource.id.length === 0) {
        throw new Error(`Game loading resource at index ${index} needs an id.`);
      }
      if (resource.id.trim() !== resource.id) {
        throw new Error(
          `Game loading resource id "${resource.id}" must not contain surrounding whitespace.`,
        );
      }
      if (seenIds.has(resource.id)) {
        throw new Error(`Duplicate game loading resource id "${resource.id}".`);
      }
      seenIds.add(resource.id);
      const weight = resource.weight ?? 1;
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error(
          `Game loading resource "${resource.id}" weight must be a finite positive number.`,
        );
      }
      if (!resource.load && typeof resource.url !== "string") {
        throw new Error(
          `Game loading resource "${resource.id}" requires a URL or custom load().`,
        );
      }
      return Object.freeze({ resource, weight });
    }),
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
