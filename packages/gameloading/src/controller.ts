import { loadGameLoadingResource } from "./default-loaders.js";
import { createGameLoadingDom, type GameLoadingDom } from "./dom.js";
import type {
  GameLoadingHandle,
  GameLoadingOptions,
  GameLoadingResource,
} from "./types.js";

interface NormalizedResource {
  readonly resource: GameLoadingResource;
  readonly weight: number;
}

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
  readonly #dom: GameLoadingDom;
  readonly #loadedResources = new Map<string, unknown>();
  #destroyed = false;
  #startPromise: Promise<void> | null = null;

  constructor(options: GameLoadingOptions<TPrepareResult>) {
    validateOptions(options);
    this.#options = options;
    this.#resources = normalizeResources(options.resources);
    this.#dom = createGameLoadingDom(options.root);
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
    this.#dom.destroy();
  }

  async #run(): Promise<void> {
    try {
      const totalWeight = this.#resources.reduce(
        (total, item) => total + item.weight,
        0,
      );
      let completedWeight = 0;
      await Promise.all(
        this.#resources.map(async ({ resource, weight }) => {
          const value = await loadGameLoadingResource(resource, {
            resource,
            loadedResources: this.#loadedResources,
          });
          if (this.#destroyed) {
            return;
          }
          this.#loadedResources.set(resource.id, value);
          completedWeight += weight;
          this.#dom.setProgress((completedWeight / totalWeight) * 99);
        }),
      );
      if (this.#destroyed) {
        return;
      }
      this.#dom.setProgress(99);
      const prepareResult = await this.#options.onBeforeComplete({
        loadedResources: this.#loadedResources,
      });
      if (this.#destroyed) {
        return;
      }
      this.#dom.setProgress(100);
      await this.#options.onEnterGame({
        loadedResources: this.#loadedResources,
        prepareResult,
      });
    } catch (error) {
      if (this.#destroyed) {
        return;
      }
      const normalized = toError(error);
      this.#dom.setError(normalized.message);
      this.#options.onError?.(normalized);
    }
  }
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
  if (typeof options.onBeforeComplete !== "function") {
    throw new Error("Game loading onBeforeComplete must be a function.");
  }
  if (typeof options.onEnterGame !== "function") {
    throw new Error("Game loading onEnterGame must be a function.");
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
