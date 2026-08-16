import type {
  SlotOperationPlanV2,
  SlotOperationSnapshot,
  SlotOperationV2,
} from "@slotclientengine/logiccore";

export type SlotOperationCleanupReason =
  | "next-spin"
  | "execution-failure"
  | "fatal"
  | "destroy";

export interface SlotOperationHandler<
  Operation extends SlotOperationV2 = SlotOperationV2,
> {
  start(
    operation: Operation,
    context: SlotOperationExecutionContext,
  ): Promise<void> | void;
}

export interface SlotOperationExecutionContext {
  readonly signal: AbortSignal;
  /** Expected state produced by the previous state operation, or null before landing. */
  readonly input: SlotOperationSnapshot | null;
  waitForFrame(update: (deltaSeconds: number) => boolean): Promise<void>;
  delay(seconds: number): Promise<void>;
}

export interface SlotOperationHandlerRegistration<
  Operation extends SlotOperationV2 = SlotOperationV2,
> {
  readonly kind: Operation["kind"];
  readonly version: Operation["version"];
  readonly handler: SlotOperationHandler<Operation>;
}

export interface SlotOperationHandlerRegistry {
  register(registration: SlotOperationHandlerRegistration): void;
  get(
    kind: string,
    version: number,
  ): SlotOperationHandlerRegistration | undefined;
  has(kind: string, version: number): boolean;
  clear(): void;
}

export type SlotOperationCoordinatorPhase =
  | "idle"
  | "running"
  | "complete"
  | "fatal"
  | "destroyed";

export interface SlotOperationCoordinatorSnapshot {
  readonly phase: SlotOperationCoordinatorPhase;
  readonly operationIndex: number | null;
  readonly operationKey: string | null;
  readonly running: boolean;
}

export interface SlotOperationCoordinator {
  start(plan: SlotOperationPlanV2): Promise<void>;
  update(deltaSeconds: number): void;
  cleanup(reason: Exclude<SlotOperationCleanupReason, "destroy">): void;
  isRunning(): boolean;
  getPhase(): SlotOperationCoordinatorPhase;
  getSnapshot(): SlotOperationCoordinatorSnapshot;
  destroy(): void;
}

export interface SlotOperationCoordinatorOptions {
  readonly registry: SlotOperationHandlerRegistry;
  cleanup(reason: SlotOperationCleanupReason): void;
  updateRuntime?(deltaSeconds: number): void;
}
