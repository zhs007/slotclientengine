import type {
  SlotRoundCapability,
  SlotRoundDropdownStepPlan,
  SlotRoundExecutionPlan,
  SlotRoundExecutionStep,
  SlotRoundOccurrenceSnapshot,
  SlotRoundRefillStepPlan,
  SlotRoundWinStepPlan,
} from "@slotclientengine/logiccore";

export type SlotRoundCleanupReason =
  | "next-spin"
  | "compile-failure"
  | "execution-failure"
  | "fatal"
  | "destroy";

export interface SlotRoundPresentationCapabilityTarget {
  readonly capabilities: ReadonlySet<SlotRoundCapability>;
  /**
   * Validates plan-specific renderer resources without mutating presentation.
   * Called after generic capability validation and before next-spin cleanup.
   */
  preflight?(plan: SlotRoundExecutionPlan): void;
  cleanup(reason: SlotRoundCleanupReason): void;
  startInitialSpin(snapshot: SlotRoundOccurrenceSnapshot): void;
  isInitialSpinComplete(): boolean;
  startWin(step: SlotRoundWinStepPlan): void;
  updateWin(deltaSeconds: number): { readonly completed: boolean };
  startDropdown(step: SlotRoundDropdownStepPlan): void;
  isDropdownComplete(): boolean;
  startRefill(step: SlotRoundRefillStepPlan): void;
  isRefillComplete(): boolean;
  update(deltaSeconds: number): void;
  startCompletion?(plan: SlotRoundExecutionPlan): void;
  isCompletionComplete?(): boolean;
}

export type SlotRoundCoordinatorPhase =
  | "idle"
  | "initial"
  | "win"
  | "dropdown"
  | "refill"
  | "completion"
  | "complete"
  | "destroyed";

export interface SlotRoundCoordinatorSnapshot {
  readonly phase: SlotRoundCoordinatorPhase;
  readonly stepIndex: number | null;
  readonly running: boolean;
}

export interface SlotRoundCoordinator {
  start(plan: SlotRoundExecutionPlan): Promise<void>;
  update(deltaSeconds: number): void;
  cleanup(reason: Exclude<SlotRoundCleanupReason, "destroy">): void;
  getSnapshot(): SlotRoundCoordinatorSnapshot;
  destroy(): void;
}

export function createSlotRoundCoordinator(options: {
  readonly target: SlotRoundPresentationCapabilityTarget;
}): SlotRoundCoordinator {
  return new DefaultSlotRoundCoordinator(options.target);
}

class DefaultSlotRoundCoordinator implements SlotRoundCoordinator {
  readonly #target: SlotRoundPresentationCapabilityTarget;
  #phase: SlotRoundCoordinatorPhase = "idle";
  #plan: SlotRoundExecutionPlan | null = null;
  #stepCursor = 0;
  #resolve: (() => void) | null = null;
  #reject: ((error: Error) => void) | null = null;

  constructor(target: SlotRoundPresentationCapabilityTarget) {
    this.#target = target;
  }

  start(plan: SlotRoundExecutionPlan): Promise<void> {
    try {
      if (this.#phase === "destroyed")
        throw new Error("Slot round coordinator is destroyed.");
      if (this.#plan)
        throw new Error("Slot round coordinator is already running.");
      validatePlanCapabilities(plan, this.#target.capabilities);
      this.#target.preflight?.(plan);
      // Preflight above is intentionally complete before next-spin cleanup or
      // any scene mutation.
      this.#target.cleanup("next-spin");
      this.#plan = plan;
      this.#stepCursor = 0;
      this.#phase = "initial";
      this.#target.startInitialSpin(plan.initial);
      return new Promise<void>((resolve, reject) => {
        this.#resolve = resolve;
        this.#reject = reject;
      });
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error(
        "Slot round deltaSeconds must be finite and non-negative.",
      );
    if (!this.#plan || this.#phase === "destroyed") return;
    try {
      this.#target.update(deltaSeconds);
      if (this.#phase === "initial") {
        if (!this.#target.isInitialSpinComplete()) return;
        this.startNextStep();
        return;
      }
      if (this.#phase === "completion") {
        if (this.#target.isCompletionComplete?.() === false) return;
        this.complete();
        return;
      }
      const step = this.currentStep();
      if (!step) return;
      if (step.kind === "win") {
        if (!this.#target.updateWin(deltaSeconds).completed) return;
      } else if (step.kind === "dropdown") {
        if (!this.#target.isDropdownComplete()) return;
      } else if (!this.#target.isRefillComplete()) return;
      this.#stepCursor += 1;
      this.startNextStep();
    } catch (error) {
      this.fail(asError(error));
    }
  }

  cleanup(reason: Exclude<SlotRoundCleanupReason, "destroy">): void {
    if (this.#phase === "destroyed") return;
    const rejection = this.#reject;
    this.#clearState("idle");
    const interruption = new Error(
      `Slot round was interrupted by ${reason} cleanup.`,
    );
    let cleanupError: Error | null = null;
    try {
      this.#target.cleanup(reason);
    } catch (error) {
      cleanupError = asError(error);
    }
    rejection?.(
      cleanupError
        ? new AggregateError(
            [interruption, cleanupError],
            `Slot round ${reason} cleanup failed while interrupting execution.`,
          )
        : interruption,
    );
    if (cleanupError) throw cleanupError;
  }

  getSnapshot(): SlotRoundCoordinatorSnapshot {
    return Object.freeze({
      phase: this.#phase,
      stepIndex:
        this.#plan && this.#stepCursor < this.#plan.steps.length
          ? this.#plan.steps[this.#stepCursor].index
          : null,
      running: this.#plan !== null,
    });
  }

  destroy(): void {
    if (this.#phase === "destroyed") return;
    const rejection = this.#reject;
    this.#clearState("destroyed");
    const interruption = new Error("Slot round coordinator was destroyed.");
    let cleanupError: Error | null = null;
    try {
      this.#target.cleanup("destroy");
    } catch (error) {
      cleanupError = asError(error);
    }
    rejection?.(
      cleanupError
        ? new AggregateError(
            [interruption, cleanupError],
            "Slot round destroy cleanup failed while interrupting execution.",
          )
        : interruption,
    );
    if (cleanupError) throw cleanupError;
  }

  private startNextStep(): void {
    const step = this.currentStep();
    if (!step) {
      if (this.#target.startCompletion) {
        this.#phase = "completion";
        this.#target.startCompletion(this.#plan!);
        if (this.#target.isCompletionComplete?.() !== false) this.complete();
      } else this.complete();
      return;
    }
    this.#phase = step.kind;
    if (step.kind === "win") this.#target.startWin(step);
    else if (step.kind === "dropdown") this.#target.startDropdown(step);
    else this.#target.startRefill(step);
  }

  private complete(): void {
    const resolve = this.#resolve;
    this.#clearState("complete");
    resolve?.();
  }

  private currentStep(): SlotRoundExecutionStep | undefined {
    return this.#plan?.steps[this.#stepCursor];
  }

  private fail(error: Error): void {
    const reject = this.#reject;
    let rejection = error;
    try {
      this.#target.cleanup("execution-failure");
    } catch (cleanupError) {
      rejection = new AggregateError(
        [error, cleanupError],
        "Slot round execution and cleanup both failed.",
      );
    }
    this.#clearState("idle");
    reject?.(rejection);
  }

  #clearState(phase: SlotRoundCoordinatorPhase): void {
    this.#plan = null;
    this.#stepCursor = 0;
    this.#resolve = null;
    this.#reject = null;
    this.#phase = phase;
  }
}

function validatePlanCapabilities(
  plan: SlotRoundExecutionPlan,
  capabilities: ReadonlySet<SlotRoundCapability>,
): void {
  if (
    plan.kind !== "slot-round-execution-plan" ||
    plan.version !== 1 ||
    !Object.isFrozen(plan)
  )
    throw new Error("Slot round coordinator requires an immutable V1 plan.");
  for (const capability of plan.requiredCapabilities)
    if (!capabilities.has(capability))
      throw new Error(
        `Slot round target is missing required "${capability}" capability.`,
      );
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
