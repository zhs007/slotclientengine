import {
  applySlotOperationChanges,
  applySlotOperationValueUpdates,
  createBuiltinSlotOperationDefinitionsV2,
  createSlotOperationSnapshot,
  deriveSlotStateMutations,
  finalizeSlotOperationPlanV2,
  genDropdownOperation,
  genRefillOperation,
  genRemoveOperation,
  genSpinOperation,
  genWinOperation,
  type GameLogic,
  type SlotOperationDefinitionV2,
  type SlotOperationDraftV2,
  type SlotOperationPlanV2,
  type SlotOperationSnapshot,
  type SlotOperationSource,
  type SlotStateMutationDraftV2,
  type SlotStateMutation,
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
  type Game002FreeGameAfPlan,
  type Game002FreeGameCoPlan,
  type Game002FreeGameSpinPlan,
} from "./freegame-plan.js";
import type { SymbolCascadeGroup } from "@slotclientengine/rendercore";
import { resolveGame002WinResultAmount } from "./win-symbol-carousel-config.js";
import {
  createGame002WlWmMultiplierCompiler,
  type Game002TransformOperationPayload,
} from "./wl-wm-multiplier-plan.js";

export interface Game002SpinPayload {
  readonly scene: SlotOperationSnapshot;
}

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

export type Game002TransformPayload =
  | Readonly<{
      phase: "wl-increment";
      increments: Game002TransformOperationPayload["wlIncrements"];
    }>
  | Readonly<{
      phase: "wild-multiplier";
      wmPositions: readonly { readonly x: number; readonly y: number }[];
    }>
  | Readonly<{
      phase: "wm-to-cn";
      replacements: Game002TransformOperationPayload["wmReplacements"];
    }>
  | Readonly<{
      phase: "coin-multiplier";
      cm: NonNullable<Game002TransformOperationPayload["cm"]>;
      updates: Game002TransformOperationPayload["cnUpdates"];
    }>
  | Readonly<{
      phase: "cm-to-cn";
      cm: NonNullable<Game002TransformOperationPayload["cm"]>;
    }>
  | Readonly<{
      phase: "co-collect";
      collection: NonNullable<Game002TransformOperationPayload["coCollection"]>;
    }>;

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

export interface Game002RoundFacts {
  readonly drafts: readonly SlotOperationDraftV2[];
  readonly definitions: readonly SlotOperationDefinitionV2[];
  readonly final: SlotOperationSnapshot;
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
  readonly symbolCodes: Readonly<Record<string, number>>;
}

export type Game002FreeGameOperationPayload =
  | Readonly<{
      kind: "trigger";
      positions: readonly { readonly x: number; readonly y: number }[];
    }>
  | Readonly<{ kind: "transition"; mode: "BaseGame" | "FreeGame" }>
  | Readonly<{
      kind: "spin";
      spin: Omit<
        Game002FreeGameSpinPlan,
        "stepIndex" | "af" | "co" | "winResults"
      >;
    }>
  | Readonly<{ kind: "af"; af: Game002FreeGameAfPlan }>
  | Readonly<{ kind: "co"; co: Game002FreeGameCoPlan }>
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
  return compileGame002OperationPlanFromFacts(decodeGame002RoundFacts(options));
}

export function decodeGame002RoundFacts(options: {
  readonly logic: GameLogic;
  readonly runtime: Game002ReelRuntime;
  readonly displaySymbols: readonly string[];
  readonly logDiagnostic?: (message: string) => void;
}): Game002RoundFacts {
  const triggerStepIndex = options.logic
    .getSteps()
    .findIndex((step) => step.hasComponent("bg-triggerfg"));
  if (triggerStepIndex < 0) return decodeGame002BaseRoundFacts(options);
  const base = decodeGame002BaseRoundFacts({
    ...options,
    logic: sliceGameLogic(options.logic, triggerStepIndex + 1),
    includeWinAmount: false,
  });
  const codes = {
    WL: requireCode(base.symbolCodes, "WL"),
    CN: requireCode(base.symbolCodes, "CN"),
    CO: requireCode(base.symbolCodes, "CO"),
    AF: requireCode(base.symbolCodes, "AF"),
    BN: requireCode(base.symbolCodes, "BN"),
  };
  const free = compileGame002FreeGamePlan({
    logic: options.logic,
    entryScene: base.final.scene,
    entryValues: base.final.values.map((column) =>
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
  const drafts: SlotOperationDraftV2[] = [...base.drafts];
  let current = base.final;
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
        input: current,
        output,
        mutations: deriveSlotStateMutations(current, output),
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
      occurrenceIdPrefix: `game002:freegame:${spinIndex}:spin`,
    });
    const {
      stepIndex: _stepIndex,
      af: _af,
      co: _co,
      winResults: _wins,
      ...spinPayload
    } = spin;
    appendMutation(
      "game002:freegame-spin",
      spinOutput,
      Object.freeze({ kind: "spin", spin: Object.freeze(spinPayload) }),
    );
    if (spin.af) {
      const output = createSlotOperationSnapshot({
        scene: spin.af.outputScene,
        values: spin.af.outputValues,
        symbolCodes: base.symbolCodes,
        occurrenceIdPrefix: `game002:freegame:${spinIndex}:af`,
      });
      appendMutation(
        "game002:freegame-af",
        output,
        Object.freeze({ kind: "af", af: spin.af }),
      );
    }
    if (spin.co) {
      const output = createSlotOperationSnapshot({
        scene: spin.co.outputScene,
        values: spin.co.outputValues,
        symbolCodes: base.symbolCodes,
        occurrenceIdPrefix: `game002:freegame:${spinIndex}:co`,
      });
      appendMutation(
        "game002:freegame-co",
        output,
        Object.freeze({ kind: "co", co: spin.co }),
      );
    }
    if (spin.winResults.length > 0)
      appendPresentation(
        "game002:freegame-win",
        Object.freeze({
          kind: "win",
          groups: createFreeGameWinGroups(spin),
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
  return Object.freeze({
    drafts: Object.freeze(drafts),
    definitions: base.definitions,
    final: current,
    betAmountRaw: base.betAmountRaw,
    winAmountRaw: base.winAmountRaw,
    symbolCodes: base.symbolCodes,
  });
}

export function compileGame002BaseGameOperationPlan(
  options: Game002CompilerOptions,
): Game002BaseGameCompilation {
  return compileGame002OperationPlanFromFacts(
    decodeGame002BaseRoundFacts(options),
  );
}

export function compileGame002OperationPlanFromFacts(
  facts: Game002RoundFacts,
): Game002BaseGameCompilation {
  const plan = finalizeSlotOperationPlanV2({
    drafts: facts.drafts,
    definitions: facts.definitions,
    symbolCodes: facts.symbolCodes,
    columns: GAME002_REEL_COUNT,
    rows: GAME002_VISIBLE_ROWS,
  });
  return Object.freeze({
    plan,
    betAmountRaw: facts.betAmountRaw,
    winAmountRaw: facts.winAmountRaw,
    symbolCodes: facts.symbolCodes,
  });
}

function decodeGame002BaseRoundFacts(
  options: Game002CompilerOptions,
): Game002RoundFacts {
  const betAmountRaw = options.logic.getBet() * options.logic.getLines();
  const winAmountRaw = options.logic.getTotalWin();
  const symbolCodes = readSymbolCodes(options.runtime, options.displaySymbols);
  const codes = {
    WL: requireCode(symbolCodes, "WL"),
    WM: requireCode(symbolCodes, "WM"),
    CN: requireCode(symbolCodes, "CN"),
    CM: requireCode(symbolCodes, "CM"),
    CO: requireCode(symbolCodes, "CO"),
    BN: requireCode(symbolCodes, "BN"),
  };
  const steps = options.logic.getSteps();
  if (steps.length === 0) throw new Error("game002 round has no server steps.");
  const multiplierCompiler = createGame002WlWmMultiplierCompiler({
    wlSymbolCode: codes.WL,
    wmSymbolCode: codes.WM,
    cnSymbolCode: codes.CN,
    cmSymbolCode: codes.CM,
    coSymbolCode: codes.CO,
    bnSymbolCode: codes.BN,
    logDiagnostic: options.logDiagnostic,
  });
  const drafts: SlotOperationDraftV2[] = [];
  const definitions = game002Definitions();
  const spinData = readGame002SpinOperationData({
    logic: options.logic,
    cnSymbolCode: codes.CN,
    auxiliaryValueSymbolCodes: [codes.WL, codes.WM, codes.CM],
  });
  const initialScene = multiplierCompiler.resolveSettledScene({
    stepIndex: 0,
    step: steps[0]!,
    kind: "spin",
    inputScene: spinData.scene,
  });
  const initialSnapshot = hydrateSnapshot({
    input: createSlotOperationSnapshot({
      scene: initialScene,
      values: spinData.values,
      symbolCodes,
      occurrenceIdPrefix: "game002:spin",
    }),
    updates: multiplierCompiler.hydrateSettledValues({
      stepIndex: 0,
      step: steps[0]!,
      input: createSlotOperationSnapshot({
        scene: initialScene,
        values: spinData.values,
        symbolCodes,
        occurrenceIdPrefix: "game002:spin",
      }),
    }),
  });
  drafts.push(
    genSpinOperation({
      kind: "game002:spin",
      source: serverSource(0, "bg-spin"),
      scene: initialSnapshot.scene,
      values: initialSnapshot.values,
      symbolCodes,
      occurrenceIdPrefix: "game002:spin",
      payload: Object.freeze({ scene: initialSnapshot }),
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
        heldSymbols: ["WL"],
        payload: fallPayload,
        businessKey: `${flowKey}:dropdown`,
      });
      drafts.push(dropdown);
      current = dropdown.output;
      const rawRefill = genRefillOperation({
        kind: "game002:refill",
        source: serverSource(serverStepIndex, "bg-refill"),
        input: current,
        outputScene: multiplierCompiler.resolveSettledScene({
          stepIndex: serverStepIndex,
          step,
          kind: "refill",
          inputScene: fall.refillScene,
        }),
        outputValues: fall.refillValues,
        positions: fall.refillPositions,
        symbolCodes,
        occurrenceIdPrefix: `${flowKey}:refill`,
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
    const normalizedTransform = normalizeTransformDraft(
      transformCompilation.draft,
    );
    if (
      normalizedTransform.changes.length > 0 ||
      normalizedTransform.relocations.length > 0
    ) {
      const finalOutput = applySlotOperationChanges({
        input: current,
        changes: normalizedTransform.changes,
        relocations: normalizedTransform.relocations,
        symbolCodes,
        replacementIdPrefix: `${flowKey}:transform`,
      });
      const transform = transformCompilation.payload;
      if (!transform)
        throw new Error(`${flowKey} has transform changes without a payload.`);
      const atomic = genGame002AtomicTransformOperations({
        input: current,
        finalOutput,
        transform,
        symbolCodes,
        source: serverSource(serverStepIndex, "game002-transform"),
        flowKey,
      });
      drafts.push(...atomic);
      current = finalOutput;
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
  multiplierCompiler.assertComplete();
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
    drafts: Object.freeze(drafts),
    definitions,
    final: current,
    betAmountRaw,
    winAmountRaw,
    symbolCodes,
  });
}

function genGame002AtomicTransformOperations(options: {
  readonly input: SlotOperationSnapshot;
  readonly finalOutput: SlotOperationSnapshot;
  readonly transform: Game002TransformOperationPayload;
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly source: SlotOperationSource;
  readonly flowKey: string;
}): readonly SlotOperationDraftV2[] {
  const transform = Object.freeze({
    wlIncrements: options.transform.wlIncrements,
    wmReplacements: options.transform.wmReplacements,
    cnUpdates: options.transform.cnUpdates,
    cm: options.transform.cm,
    ...(options.transform.coCollection
      ? { coCollection: options.transform.coCollection }
      : {}),
  });
  const codes = {
    WL: requireCode(options.symbolCodes, "WL"),
    WM: requireCode(options.symbolCodes, "WM"),
    CN: requireCode(options.symbolCodes, "CN"),
    CM: requireCode(options.symbolCodes, "CM"),
  };
  let current = options.input;
  const drafts: SlotOperationDraftV2[] = [];
  const append = (
    payload: Game002TransformPayload,
    output: SlotOperationSnapshot,
  ) => {
    const phase = payload.phase;
    if (snapshotsEqual(current, output)) {
      if (phase !== "wild-multiplier")
        throw new Error(`${options.flowKey}:${phase} is an unexpected no-op.`);
      return;
    }
    const draft: SlotStateMutationDraftV2 = Object.freeze({
      kind: `game002:${phase}`,
      version: 2,
      effect: "state-mutation",
      source: options.source,
      input: current,
      output,
      mutations: deriveSlotStateMutations(current, output),
      payload,
      businessKey: `${options.flowKey}:${phase}`,
    });
    drafts.push(draft);
    current = output;
  };
  if (transform.wlIncrements.length > 0)
    append(
      Object.freeze({
        phase: "wl-increment",
        increments: transform.wlIncrements,
      }),
      applyChanges(
        current,
        transform.wlIncrements.map((item) => ({
          position: item.position,
          outputCode: codes.WL,
          outputValue: item.outputValue,
        })),
        options.symbolCodes,
      ),
    );
  if (transform.wmReplacements.length > 0) {
    const wmTotal = current.occurrences
      .filter((occurrence) => occurrence.code === codes.WM)
      .reduce((sum, occurrence) => sum + (occurrence.value ?? 0), 0);
    const wildUpdates = current.occurrences
      .filter((occurrence) => occurrence.code === codes.WL)
      .map((occurrence) => ({
        position: occurrence.position,
        outputCode: codes.WL,
        outputValue: (occurrence.value ?? 0) + wmTotal,
      }));
    if (wildUpdates.length > 0)
      append(
        Object.freeze({
          phase: "wild-multiplier",
          wmPositions: Object.freeze(
            transform.wmReplacements.map((item) => item.position),
          ),
        }),
        applyChanges(current, wildUpdates, options.symbolCodes),
      );
    else
      drafts.push(
        genWinOperation({
          kind: "game002:wild-multiplier-presentation",
          source: options.source,
          payload: Object.freeze({
            phase: "wild-multiplier",
            wmPositions: Object.freeze(
              transform.wmReplacements.map((item) => item.position),
            ),
          }) satisfies Game002TransformPayload,
          businessKey: `${options.flowKey}:wild-multiplier`,
        }),
      );
    append(
      Object.freeze({
        phase: "wm-to-cn",
        replacements: transform.wmReplacements,
      }),
      applyChanges(
        current,
        transform.wmReplacements.map((item) => ({
          position: item.position,
          outputCode: codes.CN,
          outputValue: item.intermediateValue,
        })),
        options.symbolCodes,
      ),
    );
  }
  if (transform.cnUpdates.length > 0)
    append(
      Object.freeze({
        phase: "coin-multiplier",
        cm: transform.cm!,
        updates: transform.cnUpdates,
      }),
      applyChanges(
        current,
        transform.cnUpdates.map((item) => ({
          position: item.position,
          outputCode: codes.CN,
          outputValue: item.outputValue,
        })),
        options.symbolCodes,
      ),
    );
  if (transform.cm)
    append(
      Object.freeze({ phase: "cm-to-cn", cm: transform.cm }),
      applyChanges(
        current,
        [
          {
            position: transform.cm.position,
            outputCode: codes.CN,
            outputValue: transform.cm.outputValue,
          },
        ],
        options.symbolCodes,
      ),
    );
  if (transform.coCollection)
    append(
      Object.freeze({
        phase: "co-collect",
        collection: transform.coCollection,
      }),
      options.finalOutput,
    );
  if (drafts.length === 0)
    throw new Error(`${options.flowKey} transform produced no operations.`);
  if (!snapshotsEqual(current, options.finalOutput))
    throw new Error(`${options.flowKey} atomic transform does not close.`);
  return Object.freeze(drafts);
}

function applyChanges(
  input: SlotOperationSnapshot,
  changes: readonly {
    readonly position: { readonly x: number; readonly y: number };
    readonly outputCode: number;
    readonly outputValue: number | null;
  }[],
  symbolCodes: Readonly<Record<string, number>>,
): SlotOperationSnapshot {
  return applySlotOperationChanges({ input, changes, symbolCodes });
}

function mutationWithOutput<Payload>(
  draft: SlotStateMutationDraftV2<string, 2, SlotStateMutation, Payload>,
  output: SlotOperationSnapshot,
  payload: Payload,
): SlotStateMutationDraftV2 {
  return Object.freeze({
    ...draft,
    output,
    mutations: deriveSlotStateMutations(draft.input, output),
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

function normalizeTransformDraft(
  draft:
    | readonly import("@slotclientengine/gameframeworks").SlotRoundSettledTransformChangeDraft[]
    | import("@slotclientengine/gameframeworks").SlotRoundSettledTransformDraft,
): import("@slotclientengine/gameframeworks").SlotRoundSettledTransformDraft {
  return Array.isArray(draft)
    ? Object.freeze({ changes: draft, relocations: Object.freeze([]) })
    : (draft as import("@slotclientengine/gameframeworks").SlotRoundSettledTransformDraft);
}

function game002Definitions(): readonly SlotOperationDefinitionV2[] {
  const definitions = new Map(
    createBuiltinSlotOperationDefinitionsV2().map((definition) => [
      `${definition.kind}@${definition.version}`,
      definition,
    ]),
  );
  for (const [kind, effect] of [
    ["game002:spin", "scene-landing"],
    ["game002:win", "presentation"],
    ["game002:remove", "state-mutation"],
    ["game002:dropdown", "state-mutation"],
    ["game002:refill", "state-mutation"],
    ["game002:wl-increment", "state-mutation"],
    ["game002:wild-multiplier", "state-mutation"],
    ["game002:wild-multiplier-presentation", "presentation"],
    ["game002:wm-to-cn", "state-mutation"],
    ["game002:coin-multiplier", "state-mutation"],
    ["game002:cm-to-cn", "state-mutation"],
    ["game002:co-collect", "state-mutation"],
    ["game002:win-amount", "presentation"],
    ["game002:freegame-trigger", "presentation"],
    ["game002:freegame-enter", "presentation"],
    ["game002:freegame-spin", "state-mutation"],
    ["game002:freegame-af", "state-mutation"],
    ["game002:freegame-co", "state-mutation"],
    ["game002:freegame-win", "presentation"],
    ["game002:freegame-popup", "presentation"],
    ["game002:freegame-exit", "presentation"],
  ] as const)
    definitions.set(
      `${kind}@2`,
      Object.freeze({
        kind,
        version: 2,
        effect,
        requiredCapabilities: Object.freeze([kind]),
        ...(effect === "scene-landing"
          ? {}
          : { requiresEstablishedScene: true }),
      }),
    );
  return Object.freeze([...definitions.values()]);
}

function snapshotsEqual(
  left: SlotOperationSnapshot,
  right: SlotOperationSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createFreeGameWinGroups(
  spin: Game002FreeGameSpinPlan,
): readonly SymbolCascadeGroup[] {
  return Object.freeze(
    spin.winResults.map((result, resultIndex) => {
      const positions = parseResultPositions(result.pos, spin.outputScene);
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

function sliceGameLogic(source: GameLogic, length: number): GameLogic {
  if (
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    length > source.getStepCount()
  )
    throw new Error(`game002 logic slice length ${length} is invalid.`);
  const steps = Object.freeze(source.getSteps().slice(0, length));
  const getStep = (index: number) => {
    const step = steps[index];
    if (!step) throw new Error(`game002 step[${index}] is out of range.`);
    return step;
  };
  return Object.freeze({
    getGameModuleName: () => source.getGameModuleName(),
    getGameId: () => source.getGameId(),
    getBet: () => source.getBet(),
    getLines: () => source.getLines(),
    getTotalWin: () => source.getTotalWin(),
    getPlayWin: () => source.getPlayWin(),
    getRawMessage: () => source.getRawMessage(),
    getRawGmi: () => source.getRawGmi(),
    getDefaultScene: () => source.getDefaultScene(),
    getRandomNumbers: () => source.getRandomNumbers(),
    getStepCount: () => steps.length,
    getSteps: () => steps,
    getStep,
    hasComponent: (stepIndex: number, name: string) =>
      getStep(stepIndex).hasComponent(name),
    getComponent: (stepIndex: number, name: string) =>
      getStep(stepIndex).getComponent(name),
    getComponentResults: (stepIndex: number, name: string) =>
      getStep(stepIndex).getComponentResults(name),
    getComponentScenes: (stepIndex: number, name: string) =>
      getStep(stepIndex).getComponentScenes(name),
    getComponentOtherScenes: (stepIndex: number, name: string) =>
      getStep(stepIndex).getComponentOtherScenes(name),
    getScene: (stepIndex: number, sceneIndex: number) =>
      getStep(stepIndex).getScene(sceneIndex),
    getOtherScene: (stepIndex: number, sceneIndex: number) =>
      getStep(stepIndex).getOtherScene(sceneIndex),
    getResult: (stepIndex: number, resultIndex: number) =>
      getStep(stepIndex).getResult(resultIndex),
  });
}
