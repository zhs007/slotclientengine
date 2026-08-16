import {
  toSlotOperationKey,
  type SlotOperationPlanV2,
  type SlotOperationSnapshot,
  type SlotOperationV2,
} from "@slotclientengine/logiccore";
import type {
  SlotOperationCleanupReason,
  SlotOperationCoordinator,
  SlotOperationCoordinatorOptions,
  SlotOperationCoordinatorPhase,
  SlotOperationExecutionContext,
} from "./types.js";

interface FrameWaiter {
  readonly signal: AbortSignal;
  readonly eligibleUpdateEpoch: number;
  readonly update: (deltaSeconds: number) => boolean;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly onAbort: () => void;
}

export function createSlotOperationCoordinator(
  options: SlotOperationCoordinatorOptions,
): SlotOperationCoordinator {
  return new DefaultSlotOperationCoordinator(options);
}

class DefaultSlotOperationCoordinator implements SlotOperationCoordinator {
  readonly #options: SlotOperationCoordinatorOptions;
  readonly #frameWaiters = new Set<FrameWaiter>();
  #phase: SlotOperationCoordinatorPhase = "idle";
  #plan: SlotOperationPlanV2 | null = null;
  #cursor = 0;
  #current: SlotOperationSnapshot | null = null;
  #generation = 0;
  #activeAbort: AbortController | null = null;
  #resolve: (() => void) | null = null;
  #reject: ((error: Error) => void) | null = null;
  #updateEpoch = 0;
  #updating = false;

  constructor(options: SlotOperationCoordinatorOptions) {
    this.#options = options;
  }

  start(plan: SlotOperationPlanV2): Promise<void> {
    try {
      if (this.#phase === "destroyed")
        throw new Error("Slot operation coordinator is destroyed.");
      if (this.#plan)
        throw new Error("Slot operation coordinator is already running.");
      this.#options.cleanup("next-spin");
      this.#plan = plan;
      this.#cursor = 0;
      this.#current = null;
      this.#phase = "running";
      this.#generation += 1;
      const promise = new Promise<void>((resolve, reject) => {
        this.#resolve = resolve;
        this.#reject = reject;
      });
      this.startCurrent();
      return promise;
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error(
        "Slot operation deltaSeconds must be finite and non-negative.",
      );
    if (!this.#plan || this.#phase !== "running") return;
    const updateEpoch = (this.#updateEpoch += 1);
    this.#updating = true;
    try {
      this.#options.updateRuntime?.(deltaSeconds);
      for (const waiter of this.#frameWaiters) {
        if (waiter.eligibleUpdateEpoch > updateEpoch) continue;
        if (waiter.signal.aborted) continue;
        if (waiter.update(deltaSeconds)) this.resolveFrameWaiter(waiter);
      }
    } catch (error) {
      this.fail(asError(error));
    } finally {
      this.#updating = false;
    }
  }

  cleanup(reason: Exclude<SlotOperationCleanupReason, "destroy">): void {
    if (this.#phase === "destroyed") return;
    const reject = this.#reject;
    const interruption = new Error(
      `Slot operation plan was interrupted by ${reason} cleanup.`,
    );
    let cleanupError: Error | null = null;
    this.retireActive(interruption);
    try {
      this.#options.cleanup(reason);
    } catch (error) {
      cleanupError = asError(error);
    }
    this.clear("idle");
    reject?.(
      cleanupError
        ? new AggregateError(
            [interruption, cleanupError],
            "Slot operation cleanup failed.",
          )
        : interruption,
    );
    if (cleanupError) throw cleanupError;
  }

  isRunning(): boolean {
    return this.#plan !== null && this.#phase === "running";
  }

  getPhase(): SlotOperationCoordinatorPhase {
    return this.#phase;
  }

  destroy(): void {
    if (this.#phase === "destroyed") return;
    const reject = this.#reject;
    const interruption = new Error("Slot operation coordinator was destroyed.");
    let cleanupError: Error | null = null;
    this.retireActive(interruption);
    try {
      this.#options.cleanup("destroy");
    } catch (error) {
      cleanupError = asError(error);
    }
    this.clear("destroyed");
    reject?.(
      cleanupError
        ? new AggregateError(
            [interruption, cleanupError],
            "Slot operation destroy failed.",
          )
        : interruption,
    );
    if (cleanupError) throw cleanupError;
  }

  private startCurrent(): void {
    const operation = this.#plan?.operations[this.#cursor];
    if (!operation) {
      const resolve = this.#resolve;
      this.clear("complete");
      resolve?.();
      return;
    }
    const registration = this.#options.registry.get(
      operation.kind,
      operation.version,
    );
    if (!registration)
      return this.fail(
        new Error(
          `Missing slot operation handler ${toSlotOperationKey(operation.kind, operation.version)}.`,
        ),
      );
    const generation = this.#generation;
    const abort = new AbortController();
    this.#activeAbort = abort;
    const context = this.createExecutionContext(abort.signal, this.#current);
    let completion: Promise<void> | void;
    try {
      completion = registration.handler.start(operation, context);
    } catch (error) {
      this.fail(asError(error));
      return;
    }
    void Promise.resolve(completion).then(
      () => {
        if (
          generation !== this.#generation ||
          this.#phase !== "running" ||
          this.#plan?.operations[this.#cursor] !== operation
        )
          return;
        this.#activeAbort = null;
        if (operation.effect !== "presentation")
          this.#current = operation.output;
        this.#cursor += 1;
        this.startCurrent();
      },
      (error: unknown) => {
        if (
          generation !== this.#generation ||
          this.#phase !== "running" ||
          this.#plan?.operations[this.#cursor] !== operation
        )
          return;
        this.fail(asError(error));
      },
    );
  }

  private createExecutionContext(
    signal: AbortSignal,
    input: SlotOperationSnapshot | null,
  ): SlotOperationExecutionContext {
    return Object.freeze({
      signal,
      input,
      waitForFrame: (update: (deltaSeconds: number) => boolean) =>
        this.createFrameWaiter(signal, update),
      delay: (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0)
          return Promise.reject(
            new Error(
              "Slot operation delay seconds must be finite and non-negative.",
            ),
          );
        let remaining = seconds;
        return this.createFrameWaiter(signal, (deltaSeconds) => {
          remaining -= deltaSeconds;
          return remaining <= 0;
        });
      },
    });
  }

  private createFrameWaiter(
    signal: AbortSignal,
    update: (deltaSeconds: number) => boolean,
  ): Promise<void> {
    if (signal.aborted)
      return Promise.reject(new Error("Slot operation was aborted."));
    return new Promise<void>((resolve, reject) => {
      const waiter: FrameWaiter = {
        signal,
        eligibleUpdateEpoch: this.#updateEpoch + (this.#updating ? 1 : 0),
        update,
        resolve,
        reject,
        onAbort: () => {
          this.#frameWaiters.delete(waiter);
          reject(new Error("Slot operation was aborted."));
        },
      };
      signal.addEventListener("abort", waiter.onAbort, { once: true });
      this.#frameWaiters.add(waiter);
    });
  }

  private resolveFrameWaiter(waiter: FrameWaiter): void {
    if (!this.#frameWaiters.delete(waiter)) return;
    waiter.signal.removeEventListener("abort", waiter.onAbort);
    waiter.resolve();
  }

  private fail(error: Error): void {
    const reject = this.#reject;
    let rejection = error;
    this.retireActive(error);
    try {
      this.#options.cleanup("execution-failure");
    } catch (cleanupError) {
      rejection = new AggregateError(
        [error, cleanupError],
        "Slot operation execution and cleanup both failed.",
      );
    }
    this.clear("fatal");
    reject?.(rejection);
  }

  private retireActive(reason: Error): void {
    this.#generation += 1;
    this.#activeAbort?.abort(reason);
    this.#activeAbort = null;
    for (const waiter of [...this.#frameWaiters]) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.reject(reason);
    }
    this.#frameWaiters.clear();
  }

  private clear(phase: SlotOperationCoordinatorPhase): void {
    this.#plan = null;
    this.#cursor = 0;
    this.#current = null;
    this.#activeAbort = null;
    this.#resolve = null;
    this.#reject = null;
    this.#phase = phase;
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
