import {
  applySlotOperationValueUpdates,
  createSlotOperationSnapshot,
  genDropdownOperation,
  genChg,
  genRefillOperation,
  genRemoveOperation,
  genSpinOperation,
  genWinOperation,
  type GameLogic,
  type SlotOperationDraftV2,
  type SlotOperationPlanV2,
  type SlotOperationV2,
  type SlotOperationSnapshot,
  type SlotOperationSource,
  type SlotChgOperation,
  type SlotChgPayload,
  type SlotChgRoute,
  type SlotStateMutationDraftV2,
} from "@slotclientengine/gameframeworks";
import {
  readGame002FallOperationData,
  readGame002SpinOperationData,
  readGame002WinOperationData,
  type Game002FallOperationData,
  type Game002WinOperationData,
} from "./operation-data.js";
import {
  canGame002CascadeDropSymbol,
  canGame002CascadeRemoveSymbol,
} from "./cascade-config.js";
import { GAME002_REEL_COUNT, GAME002_VISIBLE_ROWS } from "./game-layout.js";
import type { Game002ReelRuntime } from "./game002-reel-controller.js";
import {
  compileGame002FreeGamePlan,
  type Game002FreeGameSpinPlan,
} from "./freegame-plan.js";
import type { SymbolCascadeGroup } from "@slotclientengine/rendercore";
import { resolveGame002WinResultAmount } from "./win-symbol-carousel-config.js";
import {
  createGame002WlWmMultiplierCompiler,
  type Game002SettledTransformPhase,
  type Game002TransformKey,
} from "./wl-wm-multiplier-plan.js";
export type { Game002TransformKey } from "./wl-wm-multiplier-plan.js";

export interface Game002WinPayload {
  readonly groups: Game002WinOperationData["groups"];
}

export interface Game002RemovePayload {
  readonly releaseOnlyPositions: readonly {
    readonly x: number;
    readonly y: number;
  }[];
}

export interface Game002FallPayload extends Game002FallOperationData {
  readonly flowKey: string;
}

export type Game002TransformPayload = SlotChgPayload;
export type Game002TransformOperationKind = `game002:${Game002TransformKey}`;
export type Game002TransformOperation =
  SlotChgOperation<Game002TransformOperationKind>;

export interface Game002BaseGameCompilation {
  readonly plan: SlotOperationPlanV2;
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
  readonly symbolCodes: Readonly<Record<string, number>>;
}

interface Game002CompilerOptions {
  readonly logic: GameLogic;
  readonly runtime: Game002ReelRuntime;
  readonly displaySymbols: readonly string[];
  readonly includeWinAmount?: boolean;
  readonly logDiagnostic?: (message: string) => void;
}

interface Game002DraftCompilation {
  readonly atomicOperations: readonly SlotOperationDraftV2[];
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly final: SlotOperationSnapshot;
}

export type Game002FreeGameOperationPayload =
  | Readonly<{
      kind: "trigger";
      positions: readonly { readonly x: number; readonly y: number }[];
    }>
  | Readonly<{ kind: "transition"; mode: "BaseGame" | "FreeGame" }>
  | Readonly<{
      kind: "spin";
      respinNumber: number;
      remainingFreeSpins: number;
      spinPositions: readonly { readonly x: number; readonly y: number }[];
      featurePositions: readonly { readonly x: number; readonly y: number }[];
    }>
  | Readonly<{
      kind: "af";
      positions: readonly { readonly x: number; readonly y: number }[];
      addedFreeSpins: number;
    }>
  | Readonly<{
      kind: "co";
      mainPos: readonly { readonly x: number; readonly y: number }[];
      routes: readonly SlotChgRoute[];
    }>
  | Readonly<{ kind: "win"; groups: readonly SymbolCascadeGroup[] }>
  | Readonly<{
      kind: "popup";
      betAmountRaw: number;
      winAmountRaw: number;
    }>;

export function compileGame002RoundOperationPlan(options: {
  readonly logic: GameLogic;
  readonly runtime: Game002ReelRuntime;
  readonly displaySymbols: readonly string[];
  readonly logDiagnostic?: (message: string) => void;
}): Game002BaseGameCompilation {
  const triggerStepIndex = options.logic
    .getSteps()
    .findIndex((step) => step.hasComponent("bg-triggerfg"));
  if (triggerStepIndex < 0) return compileGame002BaseGameOperationPlan(options);
  const base = compileGame002BaseDrafts({
    ...options,
    includeWinAmount: false,
    stepLimit: triggerStepIndex + 1,
  });
  const codes = {
    WL: requireCode(base.symbolCodes, "WL"),
    CN: requireCode(base.symbolCodes, "CN"),
    CO: requireCode(base.symbolCodes, "CO"),
    AF: requireCode(base.symbolCodes, "AF"),
    BN: requireCode(base.symbolCodes, "BN"),
  };
  const baseFinal = base.final;
  const free = compileGame002FreeGamePlan({
    logic: options.logic,
    entryScene: baseFinal.scene,
    entryValues: baseFinal.values.map((column) =>
      Object.freeze(
        column.map((value) => {
          if (value === -1)
            throw new Error("game002 FreeGame entry contains cascade holes.");
          return value;
        }),
      ),
    ),
    symbolCodes: codes,
  });
  if (!free) throw new Error("game002 FreeGame trigger plan is missing.");
  const drafts: SlotOperationDraftV2[] = [...base.atomicOperations];
  let current = baseFinal;
  const source = serverSource(free.triggerStepIndex, "freegame");
  const appendPresentation = (
    kind: string,
    payload: Game002FreeGameOperationPayload,
  ) => {
    drafts.push(
      genWinOperation({
        kind,
        source,
        payload,
        businessKey: `freegame:${drafts.length}:${kind}`,
      }),
    );
  };
  const appendMutation = (
    kind: string,
    output: SlotOperationSnapshot,
    payload: Game002FreeGameOperationPayload,
  ) => {
    drafts.push(
      Object.freeze({
        kind,
        effect: "state-mutation",
        version: 2 as const,
        source,
        payload,
        output,
        businessKey: `freegame:${drafts.length}:${kind}`,
      }),
    );
    current = output;
  };
  appendPresentation(
    "game002:freegame-trigger",
    Object.freeze({ kind: "trigger", positions: free.triggerPositions }),
  );
  appendPresentation(
    "game002:freegame-enter",
    Object.freeze({ kind: "transition", mode: "FreeGame" }),
  );
  for (const [spinIndex, spin] of free.spins.entries()) {
    const spinOutput = createSlotOperationSnapshot({
      scene: spin.spinScene,
      values: spin.spinValues,
      symbolCodes: base.symbolCodes,
    });
    appendMutation(
      "game002:freegame-spin",
      spinOutput,
      Object.freeze({
        kind: "spin",
        respinNumber: spin.respinNumber,
        remainingFreeSpins: spin.remainingFreeSpins,
        spinPositions: spin.spinPositions,
        featurePositions: spin.featurePositions,
      }),
    );
    if (spin.af) {
      const output = createSlotOperationSnapshot({
        scene: spin.af.outputScene,
        values: spin.af.outputValues,
        symbolCodes: base.symbolCodes,
      });
      appendMutation(
        "game002:freegame-af",
        output,
        Object.freeze({
          kind: "af",
          positions: spin.af.positions,
          addedFreeSpins: spin.af.addedFreeSpins,
        }),
      );
    }
    if (spin.co) {
      const output = createSlotOperationSnapshot({
        scene: spin.co.outputScene,
        values: spin.co.outputValues,
        symbolCodes: base.symbolCodes,
      });
      appendMutation(
        "game002:freegame-co",
        output,
        Object.freeze({
          kind: "co",
          mainPos: spin.co.mainPos,
          routes: spin.co.routes,
        }),
      );
    }
    if (spin.winResults.length > 0)
      appendPresentation(
        "game002:freegame-win",
        Object.freeze({
          kind: "win",
          groups: createFreeGameWinGroups(spin, current.scene),
        }),
      );
  }
  if (base.winAmountRaw > 0)
    appendPresentation(
      "game002:freegame-popup",
      Object.freeze({
        kind: "popup",
        betAmountRaw: base.betAmountRaw,
        winAmountRaw: base.winAmountRaw,
      }),
    );
  appendPresentation(
    "game002:freegame-exit",
    Object.freeze({ kind: "transition", mode: "BaseGame" }),
  );
  return createGame002Compilation({
    atomicOperations: Object.freeze(drafts),
    betAmountRaw: base.betAmountRaw,
    winAmountRaw: base.winAmountRaw,
    symbolCodes: base.symbolCodes,
    final: current,
  });
}

export function compileGame002BaseGameOperationPlan(
  options: Game002CompilerOptions,
): Game002BaseGameCompilation {
  return createGame002Compilation(compileGame002BaseDrafts(options));
}

function createGame002Compilation(
  facts: Game002DraftCompilation,
): Game002BaseGameCompilation {
  const plan = createGame002OperationPlan(facts.atomicOperations);
  return Object.freeze({
    plan,
    betAmountRaw: facts.betAmountRaw,
    winAmountRaw: facts.winAmountRaw,
    symbolCodes: facts.symbolCodes,
  });
}

function compileGame002BaseDrafts(
  options: Game002CompilerOptions & { readonly stepLimit?: number },
): Game002DraftCompilation {
  const betAmountRaw = options.logic.getBet() * options.logic.getLines();
  const winAmountRaw = options.logic.getTotalWin();
  const symbolCodes = readSymbolCodes(options.runtime, options.displaySymbols);
  const codes = {
    WL: requireCode(symbolCodes, "WL"),
    WM: requireCode(symbolCodes, "WM"),
    CN: requireCode(symbolCodes, "CN"),
    CM: requireCode(symbolCodes, "CM"),
    CO: requireCode(symbolCodes, "CO"),
  };
  const steps = options.logic.getSteps().slice(0, options.stepLimit);
  if (steps.length === 0) throw new Error("game002 round has no server steps.");
  const multiplierCompiler = createGame002WlWmMultiplierCompiler({
    wlSymbolCode: codes.WL,
    wmSymbolCode: codes.WM,
    cnSymbolCode: codes.CN,
    cmSymbolCode: codes.CM,
    coSymbolCode: codes.CO,
  });
  const drafts: SlotOperationDraftV2[] = [];
  const spinData = readGame002SpinOperationData({
    logic: options.logic,
    cnSymbolCode: codes.CN,
    auxiliaryValueSymbolCodes: [codes.WL, codes.WM, codes.CM],
  });
  const rawInitialSnapshot = createSlotOperationSnapshot({
    scene: spinData.scene,
    values: spinData.values,
    symbolCodes,
  });
  const initialSnapshot = hydrateSnapshot({
    input: rawInitialSnapshot,
    updates: multiplierCompiler.hydrateSettledValues({
      stepIndex: 0,
      step: steps[0]!,
      input: rawInitialSnapshot,
    }),
  });
  drafts.push(
    genSpinOperation({
      kind: "game002:spin",
      source: serverSource(0, "bg-spin"),
      output: initialSnapshot,
      payload: Object.freeze({}),
      businessKey: "spin",
    }),
  );
  let current = initialSnapshot;
  let winCount = 0;
  for (const [serverStepIndex, step] of steps.entries()) {
    const flowKey = `round:${serverStepIndex}`;
    if (serverStepIndex > 0) {
      const fall = readGame002FallOperationData({
        step,
        sourceScene: current.scene,
        sourceValues: current.values,
        cnSymbolCode: codes.CN,
        auxiliaryValueSymbolCodes: [codes.WL, codes.WM, codes.CM],
        canDropSymbol: ({ code }) =>
          canGame002CascadeDropSymbol(resolveSymbol(symbolCodes, code)),
      });
      const fallPayload = Object.freeze({ ...fall, flowKey });
      const dropdown = genDropdownOperation({
        kind: "game002:dropdown",
        source: serverSource(serverStepIndex, "bg-dropdown"),
        input: current,
        outputScene: fall.dropdownScene,
        outputValues: fall.dropdownValues,
        heldCodes: [codes.WL],
        payload: fallPayload,
        businessKey: `${flowKey}:dropdown`,
      });
      drafts.push(dropdown);
      current = dropdown.output;
      const rawRefill = genRefillOperation({
        kind: "game002:refill",
        source: serverSource(serverStepIndex, "bg-refill"),
        input: current,
        outputScene: fall.refillScene,
        outputValues: fall.refillValues,
        positions: fall.refillPositions,
        symbolCodes,
        payload: fallPayload,
        businessKey: `${flowKey}:refill`,
      });
      const hydrated = hydrateSnapshot({
        input: rawRefill.output,
        updates: multiplierCompiler.hydrateSettledValues({
          stepIndex: serverStepIndex,
          step,
          input: rawRefill.output,
        }),
      });
      drafts.push(mutationWithOutput(rawRefill, hydrated, fallPayload));
      current = hydrated;
    }
    const transformCompilation = multiplierCompiler.compileSettledTransform({
      stepIndex: serverStepIndex,
      step,
      input: current,
    });
    if (transformCompilation.phases.length > 0) {
      const atomic = genGame002AtomicTransformOperations({
        input: current,
        phases: transformCompilation.phases,
        symbolCodes,
        source: serverSource(serverStepIndex, "game002-transform"),
        flowKey,
      });
      drafts.push(...atomic.drafts);
      current = atomic.output;
    }
    const win = readGame002WinOperationData({
      logic: options.logic,
      step,
      sourceScene: current.scene,
      sourceValues: current.values,
      cnSymbolCode: codes.CN,
      canRemoveSymbol: ({ code }) =>
        canGame002CascadeRemoveSymbol(resolveSymbol(symbolCodes, code)),
    });
    if (win) {
      drafts.push(
        genWinOperation({
          kind: "game002:win",
          source: serverSource(serverStepIndex, "bg-win"),
          payload: Object.freeze({ groups: win.groups }),
          businessKey: `${flowKey}:win`,
        }),
      );
      const remove = genRemoveOperation({
        kind: "game002:remove",
        source: serverSource(serverStepIndex, "bg-remove"),
        input: current,
        outputScene: win.outputScene,
        outputValues: win.outputValues,
        payload: Object.freeze({
          releaseOnlyPositions: win.releaseOnlyPositions,
        }),
        businessKey: `${flowKey}:remove`,
      });
      drafts.push(remove);
      current = remove.output;
      winCount += 1;
    } else if (serverStepIndex !== steps.length - 1) {
      throw new Error(`${flowKey} has no win but more server steps follow.`);
    }
  }
  if (options.includeWinAmount !== false && winAmountRaw > 0)
    drafts.push(
      genWinOperation({
        kind: "game002:win-amount",
        source: serverSource(steps.length - 1, "totalwin"),
        payload: Object.freeze({ betAmountRaw, winAmountRaw }),
        businessKey: "win-amount",
      }),
    );
  if (winCount === 0 && winAmountRaw > 0)
    throw new Error("game002 positive total win has no win operation.");
  return Object.freeze({
    atomicOperations: Object.freeze(drafts),
    betAmountRaw,
    winAmountRaw,
    symbolCodes,
    final: current,
  });
}

function genGame002AtomicTransformOperations(options: {
  readonly input: SlotOperationSnapshot;
  readonly phases: readonly Game002SettledTransformPhase[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly source: SlotOperationSource;
  readonly flowKey: string;
}): Readonly<{
  drafts: readonly SlotOperationDraftV2[];
  output: SlotOperationSnapshot;
}> {
  const drafts: SlotOperationDraftV2[] = [];
  let current = options.input;
  for (const phase of options.phases) {
    const common = {
      kind: `game002:${phase.key}`,
      source: options.source,
      input: current,
      changes: phase.changes,
      symbolCodes: options.symbolCodes,
      businessKey: `${options.flowKey}:${phase.key}`,
    } as const;
    const draft = genChg({
      ...common,
      ...(phase.type === "change"
        ? { type: phase.type }
        : phase.type === "driven-change"
          ? { type: phase.type, mainPos: phase.mainPos }
          : {
              type: phase.type,
              mainPos: phase.mainPos,
              routes: phase.routes,
            }),
    });
    drafts.push(draft);
    current = draft.output;
  }
  return Object.freeze({ drafts: Object.freeze(drafts), output: current });
}

function mutationWithOutput<Payload>(
  draft: SlotStateMutationDraftV2<string, 2, Payload>,
  output: SlotOperationSnapshot,
  payload: Payload,
): SlotStateMutationDraftV2 {
  return Object.freeze({
    ...draft,
    output,
    payload,
  });
}

function hydrateSnapshot(options: {
  readonly input: SlotOperationSnapshot;
  readonly updates: readonly {
    readonly position: { readonly x: number; readonly y: number };
    readonly value: number | null;
  }[];
}): SlotOperationSnapshot {
  return applySlotOperationValueUpdates(options);
}

function readSymbolCodes(
  runtime: Game002ReelRuntime,
  displaySymbols: readonly string[],
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(
      displaySymbols.map((symbol) => {
        const code = runtime.gameConfig.getSymbolCode(symbol);
        if (code === undefined)
          throw new Error(`game002 display symbol "${symbol}" has no code.`);
        return [symbol, code];
      }),
    ),
  );
}

function requireCode(
  symbolCodes: Readonly<Record<string, number>>,
  symbol: string,
): number {
  const code = symbolCodes[symbol];
  if (code === undefined)
    throw new Error(`game002 symbol code ${symbol} is missing.`);
  return code;
}

function resolveSymbol(
  symbolCodes: Readonly<Record<string, number>>,
  code: number,
): string {
  const symbol = Object.entries(symbolCodes).find(
    (entry) => entry[1] === code,
  )?.[0];
  if (!symbol) throw new Error(`game002 symbol code ${code} is unknown.`);
  return symbol;
}

function serverSource(
  serverStepIndex: number,
  _componentName: string,
): SlotOperationSource {
  return Object.freeze({
    kind: "server-component" as const,
    stepIndex: serverStepIndex,
    bindings: Object.freeze({}),
  });
}

function createGame002OperationPlan(
  drafts: readonly SlotOperationDraftV2[],
): SlotOperationPlanV2 {
  const operations: SlotOperationV2[] = [];
  let final: SlotOperationSnapshot | null = null;
  for (const [operationIndex, draft] of drafts.entries()) {
    const envelope = {
      id: `game002:${operationIndex}:${draft.businessKey ?? draft.kind}`,
      kind: draft.kind,
      version: draft.version,
      operationIndex,
      source: draft.source,
      payload: draft.payload,
    };
    const operation = Object.freeze(
      draft.effect === "scene-landing"
        ? { ...envelope, effect: draft.effect, output: draft.output }
        : draft.effect === "state-mutation"
          ? {
              ...envelope,
              effect: draft.effect,
              output: draft.output,
            }
          : {
              ...envelope,
              effect: draft.effect,
              ...(draft.targets ? { targets: draft.targets } : {}),
            },
    ) as SlotOperationV2;
    operations.push(operation);
    if (operation.effect !== "presentation") final = operation.output;
  }
  if (!final) throw new Error("game002 operation plan has no scene operation.");
  return Object.freeze({
    kind: "slot-operation-plan",
    version: 2,
    operations: Object.freeze(operations),
    final,
  });
}

function createFreeGameWinGroups(
  spin: Game002FreeGameSpinPlan,
  scene: readonly (readonly number[])[],
): readonly SymbolCascadeGroup[] {
  return Object.freeze(
    spin.winResults.map((result, resultIndex) => {
      const positions = parseResultPositions(result.pos, scene);
      return Object.freeze({
        componentName: "fg-win",
        stepIndex: resultIndex,
        resultIndex,
        result,
        positions,
        amount: resolveGame002WinResultAmount({
          componentName: "fg-win",
          stepIndex: resultIndex,
          resultIndex,
          result,
        }),
        removePositions: Object.freeze([]),
        retainPrimaryPositionsAfterCollect: true,
      });
    }),
  );
}

function parseResultPositions(
  raw: readonly number[],
  scene: readonly (readonly number[])[],
) {
  if (raw.length === 0 || raw.length % 2 !== 0)
    throw new Error("game002 fg-win result.pos must contain x/y pairs.");
  return Object.freeze(
    Array.from({ length: raw.length / 2 }, (_, index) => {
      const x = raw[index * 2]!;
      const y = raw[index * 2 + 1]!;
      if (
        !Number.isSafeInteger(x) ||
        !Number.isSafeInteger(y) ||
        x < 0 ||
        y < 0 ||
        scene[x]?.[y] === undefined
      )
        throw new Error(`game002 fg-win position (${x},${y}) is invalid.`);
      return Object.freeze({ x, y });
    }),
  );
}
