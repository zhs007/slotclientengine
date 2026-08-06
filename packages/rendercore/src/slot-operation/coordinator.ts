import {
  toSlotOperationKey,
  type SlotOperationPlanV2,
  type SlotOperationV2,
} from "@slotclientengine/logiccore";
import type {
  SlotOperationCleanupReason,
  SlotOperationCoordinator,
  SlotOperationCoordinatorOptions,
  SlotOperationCoordinatorPhase,
  SlotOperationCoordinatorSnapshot,
  SlotOperationHandler,
  SlotOperationHandlerRegistration,
} from "./types.js";

interface ActivePreparedOperation {
  readonly operation: SlotOperationV2;
  readonly registration: SlotOperationHandlerRegistration;
  readonly handler: SlotOperationHandler;
  readonly prepared: unknown;
  committed: boolean;
  destroyed: boolean;
}

export function createSlotOperationCoordinator(
  options: SlotOperationCoordinatorOptions,
): SlotOperationCoordinator {
  return new DefaultSlotOperationCoordinator(options);
}

class DefaultSlotOperationCoordinator implements SlotOperationCoordinator {
  readonly #options: SlotOperationCoordinatorOptions;
  #phase: SlotOperationCoordinatorPhase = "idle";
  #plan: SlotOperationPlanV2 | null = null;
  #cursor = 0;
  #active: ActivePreparedOperation | null = null;
  #resolve: (() => void) | null = null;
  #reject: ((error: Error) => void) | null = null;

  constructor(options: SlotOperationCoordinatorOptions) {
    this.#options = options;
  }

  start(plan: SlotOperationPlanV2): Promise<void> {
    try {
      if (this.#phase === "destroyed")
        throw new Error("Slot operation coordinator is destroyed.");
      if (this.#plan)
        throw new Error("Slot operation coordinator is already running.");
      this.preflight(plan);
      this.#options.cleanup("next-spin");
      this.#plan = plan;
      this.#cursor = 0;
      this.#phase = "running";
      const promise = new Promise<void>((resolve, reject) => {
        this.#resolve = resolve;
        this.#reject = reject;
      });
      try {
        this.startCurrent();
      } catch (error) {
        this.fail(asError(error));
      }
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
    try {
      this.#options.updateRuntime?.(deltaSeconds);
      const active = this.requireActive();
      if (!active.handler.update(active.prepared, deltaSeconds).completed)
        return;
      active.handler.commit(active.prepared);
      active.committed = true;
      if (active.operation.effect !== "presentation")
        this.#options.assertSnapshot?.(
          active.operation.output,
          active.operation,
        );
      this.destroyPrepared(active);
      this.#active = null;
      this.#cursor += 1;
      this.startCurrent();
    } catch (error) {
      this.fail(asError(error));
    }
  }

  cleanup(reason: Exclude<SlotOperationCleanupReason, "destroy">): void {
    if (this.#phase === "destroyed") return;
    const reject = this.#reject;
    const interruption = new Error(
      `Slot operation plan was interrupted by ${reason} cleanup.`,
    );
    let cleanupError: Error | null = null;
    try {
      this.rollbackAndDestroyActive();
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

  getSnapshot(): SlotOperationCoordinatorSnapshot {
    const operation = this.#plan?.operations[this.#cursor];
    return Object.freeze({
      phase: this.#phase,
      operationIndex: operation?.operationIndex ?? null,
      operationKey: operation
        ? toSlotOperationKey(operation.kind, operation.version)
        : null,
      running: this.#plan !== null,
    });
  }

  destroy(): void {
    if (this.#phase === "destroyed") return;
    const reject = this.#reject;
    const interruption = new Error("Slot operation coordinator was destroyed.");
    let cleanupError: Error | null = null;
    try {
      this.rollbackAndDestroyActive();
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

  private preflight(plan: SlotOperationPlanV2): void {
    if (
      plan.kind !== "slot-operation-plan" ||
      plan.version !== 2 ||
      !Object.isFrozen(plan)
    )
      throw new Error(
        "Slot operation coordinator requires an immutable V2 plan.",
      );
    for (const operation of plan.operations) {
      const key = toSlotOperationKey(operation.kind, operation.version);
      const registration = this.#options.registry.get(
        operation.kind,
        operation.version,
      );
      if (!registration)
        throw new Error(`Missing slot operation handler ${key}.`);
      if (registration.effect !== operation.effect)
        throw new Error(
          `${key} handler effect ${registration.effect} does not match operation effect ${operation.effect}.`,
        );
      for (const capability of operation.requiredCapabilities)
        if (!registration.requiredCapabilities.has(capability))
          throw new Error(
            `${key} handler is missing required capability "${capability}".`,
          );
      registration.handler.preflight(operation);
    }
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
      throw new Error(
        `Handler disappeared for ${operation.kind}@${operation.version}.`,
      );
    const handler = registration.handler as SlotOperationHandler;
    const prepared = handler.prepare(operation);
    this.#active = {
      operation,
      registration,
      handler,
      prepared,
      committed: false,
      destroyed: false,
    };
    handler.start(prepared);
  }

  private fail(error: Error): void {
    const reject = this.#reject;
    let rejection = error;
    try {
      this.rollbackAndDestroyActive();
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

  private rollbackAndDestroyActive(): void {
    const active = this.#active;
    if (!active) return;
    let rollbackError: Error | null = null;
    if (!active.committed) {
      try {
        active.handler.rollback(active.prepared);
      } catch (error) {
        rollbackError = asError(error);
      }
    }
    try {
      this.destroyPrepared(active);
    } catch (error) {
      const destroyError = asError(error);
      if (rollbackError)
        throw new AggregateError(
          [rollbackError, destroyError],
          "Slot operation rollback and destroy both failed.",
        );
      throw destroyError;
    } finally {
      this.#active = null;
    }
    if (rollbackError) throw rollbackError;
  }

  private destroyPrepared(active: ActivePreparedOperation): void {
    if (active.destroyed) return;
    active.destroyed = true;
    active.handler.destroy(active.prepared);
  }

  private requireActive(): ActivePreparedOperation {
    if (!this.#active)
      throw new Error("Slot operation prepared state is missing.");
    return this.#active;
  }

  private clear(phase: SlotOperationCoordinatorPhase): void {
    this.#plan = null;
    this.#cursor = 0;
    this.#active = null;
    this.#resolve = null;
    this.#reject = null;
    this.#phase = phase;
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
