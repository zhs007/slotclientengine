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
  Prepared = unknown,
> {
  preflight(operation: Operation): void;
  prepare(operation: Operation): Prepared;
  start(prepared: Prepared): void;
  update(
    prepared: Prepared,
    deltaSeconds: number,
  ): { readonly completed: boolean };
  commit(prepared: Prepared): void;
  rollback(prepared: Prepared): void;
  destroy(prepared: Prepared): void;
}

export interface SlotOperationHandlerRegistration<
  Operation extends SlotOperationV2 = SlotOperationV2,
  Prepared = unknown,
> {
  readonly kind: Operation["kind"];
  readonly version: Operation["version"];
  readonly effect: Operation["effect"];
  readonly requiredCapabilities: ReadonlySet<string>;
  readonly handler: SlotOperationHandler<Operation, Prepared>;
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
  getSnapshot(): SlotOperationCoordinatorSnapshot;
  destroy(): void;
}

export interface SlotOperationCoordinatorOptions {
  readonly registry: SlotOperationHandlerRegistry;
  cleanup(reason: SlotOperationCleanupReason): void;
  updateRuntime?(deltaSeconds: number): void;
  assertSnapshot?(
    expected: SlotOperationSnapshot,
    operation: Extract<
      SlotOperationV2,
      { readonly effect: "scene-landing" | "state-mutation" }
    >,
  ): void;
}
