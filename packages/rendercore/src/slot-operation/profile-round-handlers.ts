import type {
  SlotOperationBase,
  SlotRoundCapability,
  SlotRoundDropdownStepPlan,
  SlotRoundRefillStepPlan,
  SlotRoundOccurrenceSnapshot,
  SlotRoundSettledTransformStepPlan,
  SlotRoundWinStepPlan,
} from "@slotclientengine/logiccore";
import type {
  SlotOperationHandler,
  SlotOperationHandlerRegistry,
} from "./types.js";

type ProfileCleanupReason =
  | "next-spin"
  | "compile-failure"
  | "execution-failure"
  | "fatal"
  | "destroy";

interface SlotRoundPresentationCapabilityTarget {
  readonly capabilities: ReadonlySet<SlotRoundCapability>;
  cleanup(reason?: ProfileCleanupReason): void;
  startInitialSpin(snapshot: SlotRoundOccurrenceSnapshot): void;
  isInitialSpinComplete(): boolean;
  startWin(step: SlotRoundWinStepPlan): void;
  preflightWin?(step: SlotRoundWinStepPlan): void;
  updateWin(deltaSeconds: number): { readonly completed: boolean };
  startDropdown(step: SlotRoundDropdownStepPlan): void;
  isDropdownComplete(): boolean;
  startRefill(step: SlotRoundRefillStepPlan): void;
  isRefillComplete(): boolean;
  startSettledTransform?(step: SlotRoundSettledTransformStepPlan): void;
  updateSettledTransform?(deltaSeconds: number): {
    readonly completed: boolean;
  };
  update(deltaSeconds: number): void;
  startCompletion?(): void;
  isCompletionComplete?(): boolean;
}

export function registerSlotRoundProfileOperationHandlers(options: {
  readonly registry: SlotOperationHandlerRegistry;
  readonly target: SlotRoundPresentationCapabilityTarget;
  readonly skipSettledTransform?: boolean;
}): void {
  register(options.registry, "slot:spin", createSpinHandler(options.target));
  register(
    options.registry,
    "slot:win-remove",
    createWinHandler(options.target),
  );
  register(
    options.registry,
    "slot:dropdown",
    createDropdownHandler(options.target),
  );
  register(
    options.registry,
    "slot:refill",
    createRefillHandler(options.target),
  );
  if (!options.skipSettledTransform)
    register(
      options.registry,
      "slot:settled-transform",
      createTransformHandler(options.target),
    );
  register(
    options.registry,
    "slot:completion",
    createCompletionHandler(options.target),
  );
}

function register(
  registry: SlotOperationHandlerRegistry,
  kind: string,
  handler: SlotOperationHandler,
): void {
  registry.register({
    kind,
    version: 1,
    requiredCapabilities: new Set([kind]),
    handler,
  });
}

function createSpinHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return immediateLifecycle({
    start: (operation) => target.startInitialSpin(operation.output),
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isInitialSpinComplete();
    },
  });
}

function createWinHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return immediateLifecycle({
    preflight: (operation) =>
      target.preflightWin?.(requireStep<SlotRoundWinStepPlan>(operation)),
    start: (operation) =>
      target.startWin(requireStep<SlotRoundWinStepPlan>(operation)),
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.updateWin(deltaSeconds).completed;
    },
  });
}

function createDropdownHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return immediateLifecycle({
    start: (operation) =>
      target.startDropdown(requireStep<SlotRoundDropdownStepPlan>(operation)),
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isDropdownComplete();
    },
  });
}

function createRefillHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return immediateLifecycle({
    start: (operation) =>
      target.startRefill(requireStep<SlotRoundRefillStepPlan>(operation)),
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isRefillComplete();
    },
  });
}

function createTransformHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return immediateLifecycle({
    preflight: () => {
      if (!target.startSettledTransform || !target.updateSettledTransform)
        throw new Error(
          "Slot round profile target has no settled-transform handler.",
        );
    },
    start: (operation) =>
      target.startSettledTransform!(
        requireStep<SlotRoundSettledTransformStepPlan>(operation),
      ),
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.updateSettledTransform!(deltaSeconds).completed;
    },
  });
}

function createCompletionHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return immediateLifecycle({
    start: () => target.startCompletion?.(),
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isCompletionComplete?.() !== false;
    },
  });
}

function immediateLifecycle(options: {
  readonly preflight?: (operation: SlotOperationBase) => void;
  readonly start: (operation: SlotOperationBase) => void;
  readonly update: (deltaSeconds: number) => boolean;
}): SlotOperationHandler<SlotOperationBase, SlotOperationBase> {
  return {
    preflight: (operation) => options.preflight?.(operation),
    prepare: (operation) => operation,
    start: (operation) => options.start(operation),
    update: (_operation, deltaSeconds) => ({
      completed: options.update(deltaSeconds),
    }),
    commit: () => undefined,
    rollback: () => undefined,
    destroy: () => undefined,
  };
}

function requireStep<Step>(operation: SlotOperationBase): Step {
  const step = (operation.payload as { readonly step?: Step }).step;
  if (!step) throw new Error(`${operation.kind} payload.step is missing.`);
  return step;
}
