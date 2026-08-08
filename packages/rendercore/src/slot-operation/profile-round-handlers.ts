import type {
  SlotOperationV2,
  SlotOperationSnapshot,
  SlotRoundCapability,
  SlotRoundDropdownStepPlan,
  SlotRoundRefillStepPlan,
  SlotRoundSettledTransformStepPlan,
  SlotRoundWinStepPlan,
} from "@slotclientengine/logiccore";
import type {
  SlotOperationHandler,
  SlotOperationHandlerRegistry,
  SlotOperationExecutionContext,
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
  startInitialSpin(snapshot: SlotOperationSnapshot): void;
  isInitialSpinComplete(): boolean;
  startWin(step: SlotRoundWinStepPlan): void;
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
  register(options.registry, "slot:win", createWinHandler(options.target));
  register(
    options.registry,
    "slot:dropdown",
    createDropdownHandler(options.target),
  );
  register(
    options.registry,
    "slot:dropdown-presentation",
    createDropdownHandler(options.target),
  );
  register(
    options.registry,
    "slot:refill",
    createRefillHandler(options.target),
  );
  register(
    options.registry,
    "slot:refill-presentation",
    createRefillHandler(options.target),
  );
  if (!options.skipSettledTransform)
    for (const kind of ["slot:state-mutation", "slot:settled-presentation"])
      register(options.registry, kind, createTransformHandler(options.target));
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
    version: 2,
    handler,
  });
}

function createSpinHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return frameDrivenHandler({
    start: (operation) => {
      if (operation.effect !== "scene-landing")
        throw new Error("slot:spin must be a scene-landing operation.");
      target.startInitialSpin(operation.output);
    },
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isInitialSpinComplete();
    },
  });
}

function createWinHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return frameDrivenHandler({
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
  return frameDrivenHandler({
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
  return frameDrivenHandler({
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
  return frameDrivenHandler({
    start: (operation) => {
      if (!target.startSettledTransform || !target.updateSettledTransform)
        throw new Error(
          "Slot round profile target has no settled-transform handler.",
        );
      target.startSettledTransform!(
        requireStep<SlotRoundSettledTransformStepPlan>(operation),
      );
    },
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.updateSettledTransform!(deltaSeconds).completed;
    },
  });
}

function createCompletionHandler(
  target: SlotRoundPresentationCapabilityTarget,
): SlotOperationHandler {
  return frameDrivenHandler({
    start: () => target.startCompletion?.(),
    update: (deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isCompletionComplete?.() !== false;
    },
  });
}

function frameDrivenHandler(options: {
  readonly start: (operation: SlotOperationV2) => void;
  readonly update: (deltaSeconds: number) => boolean;
}): SlotOperationHandler<SlotOperationV2> {
  return {
    async start(
      operation: SlotOperationV2,
      context: SlotOperationExecutionContext,
    ): Promise<void> {
      options.start(operation);
      await context.waitForFrame(options.update);
    },
  };
}

function requireStep<Step>(operation: SlotOperationV2): Step {
  const step = (operation.payload as { readonly step?: Step }).step;
  if (!step) throw new Error(`${operation.kind} payload.step is missing.`);
  return step;
}
