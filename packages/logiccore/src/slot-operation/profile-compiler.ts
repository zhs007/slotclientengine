import {
  compileSlotRoundProfileTrace,
  type SlotRoundCompileContext,
  type SlotRoundProfileStepTrace,
} from "../slot-round-plan";
import type { SlotRoundFlowProfileV1 } from "../slot-round-flow";
import type { GameLogic } from "../types";
import type {
  ServerComponentOperationSource,
  SlotOperationBase,
  SlotOperationPlanV1,
} from "./types";
import {
  freezeSlotOperationPlan,
  validateSlotOperationPlan,
} from "./validation";

export interface SlotRoundOperationCompileOptions {
  readonly includeCompletion?: boolean;
  readonly resolveSource?: (
    step: { readonly kind: string; readonly stepIndex: number } | null,
  ) => ServerComponentOperationSource;
}

/**
 * Compiles a configured server round directly into the public operation IR.
 * The fixed profile trace remains a private compiler implementation detail.
 */
export function compileSlotRoundOperationPlan(
  profile: SlotRoundFlowProfileV1,
  round: GameLogic,
  context: SlotRoundCompileContext & {
    readonly columns: number;
    readonly rows: number;
  },
  options: SlotRoundOperationCompileOptions = {},
): SlotOperationPlanV1 {
  const trace = compileSlotRoundProfileTrace(profile, round, context);
  const operations: SlotOperationBase[] = [];
  const source = (step: SlotRoundProfileStepTrace | null) =>
    options.resolveSource?.(step) ??
    Object.freeze({
      kind: "server-component" as const,
      stepIndex: step?.stepIndex ?? 0,
      bindings: Object.freeze({}),
    });
  operations.push({
    id: "spin:0",
    kind: "slot:spin",
    version: 1,
    operationIndex: 0,
    source: source(null),
    input: trace.initial,
    output: trace.initial,
    payload: Object.freeze({ snapshot: trace.initial }),
    requiredCapabilities: Object.freeze(["slot:spin"]),
    commit: "atomic",
  });
  for (const step of trace.steps) {
    const kind = profileOperationKind(step);
    operations.push({
      id: `${kind}:${step.index}`,
      kind,
      version: 1,
      operationIndex: operations.length,
      source: source(step),
      input: step.input,
      output: step.output,
      payload: Object.freeze({ step }),
      requiredCapabilities: Object.freeze([kind]),
      commit: "atomic",
    });
  }
  if (options.includeCompletion !== false)
    operations.push({
      id: "completion:0",
      kind: "slot:completion",
      version: 1,
      operationIndex: operations.length,
      source: source(null),
      input: trace.final,
      output: trace.final,
      payload: Object.freeze({}),
      requiredCapabilities: Object.freeze(["slot:completion"]),
      commit: "atomic",
    });
  const plan = freezeSlotOperationPlan({
    kind: "slot-operation-plan" as const,
    version: 1 as const,
    initial: trace.initial,
    operations,
    final: trace.final,
    requiredCapabilities: Object.freeze([
      ...new Set(
        operations.flatMap((operation) => operation.requiredCapabilities),
      ),
    ]),
  });
  validateSlotOperationPlan(plan, context);
  return plan;
}

function profileOperationKind(step: SlotRoundProfileStepTrace): string {
  switch (step.kind) {
    case "win":
      return "slot:win-remove";
    case "dropdown":
      return "slot:dropdown";
    case "refill":
      return "slot:refill";
    case "settled-transform":
      return "slot:settled-transform";
  }
}
