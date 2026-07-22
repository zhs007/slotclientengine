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

export function createGameLoading<TPrepareResult = unknown>(
  options: GameLoadingOptions<TPrepareResult>,
): GameLoadingHandle {
  return new GameLoadingController(options);
}

class GameLoadingController<
  TPrepareResult = unknown,
> implements GameLoadingHandle {
  readonly #options: GameLoadingOptions<TPrepareResult>;
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

  constructor(options: GameLoadingOptions<TPrepareResult>) {
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
    this.#destroyUi();
    this.#options.root.hidden = true;
  }

  async #run(): Promise<void> {
    try {
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
          if (this.#destroyed || this.#abortController.signal.aborted) {
            return;
          }
          this.#loadedResources.set(resource.id, value);
          completedWeight += weight;
          this.#publish(
            "loading-resources",
            (completedWeight / totalWeight) * 99,
            null,
          );
        },
        this.#abortController.signal,
      );
      if (this.#destroyed) {
        return;
      }

      this.#publish("preparing", 99, null);
      const [prepareResult] = await Promise.all([
        waitWithAbort(
          Promise.resolve(
            this.#options.onBeforeComplete({
              loadedResources: this.#loadedResources,
              signal: this.#abortController.signal,
            }),
          ),
          this.#abortController.signal,
        ),
        waitWithAbort(this.#visualReady, this.#abortController.signal),
      ]);
      if (this.#destroyed) {
        return;
      }

      this.#publish("entering-game", 100, null);
      await waitWithAbort(
        Promise.resolve(
          this.#options.onEnterGame({
            loadedResources: this.#loadedResources,
            prepareResult,
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

function validateOptions<TPrepareResult>(
  options: GameLoadingOptions<TPrepareResult>,
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
