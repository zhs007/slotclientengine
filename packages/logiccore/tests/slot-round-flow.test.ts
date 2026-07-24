import { describe, expect, it } from "vitest";
import {
  compileSlotRoundExecutionPlan,
  type GameLogic,
  type GameLogicStep,
  parseServerGameAuthoringSummary,
  parseSlotRoundFlowProfile,
  validateSlotRoundFlowCatalogCompatibility,
} from "../src";

const base = {
  kind: "slot-round-flow",
  version: 1,
  components: {
    spin: "spin-component",
    wins: ["win-component"],
    valueUpdates: ["value-component"],
  },
  amount: {
    cashFields: ["cashWin64", "cashWin"],
    coinFields: ["coinWin64", "coinWin"],
    cashUnit: "cents",
  },
};

describe("slot round flow profile", () => {
  it("keeps reel presentation independent and recursively freezes output", () => {
    const profile = parseSlotRoundFlowProfile({
      ...base,
      cascade: {
        kind: "cascade",
        version: 1,
        components: {
          remove: "remove-component",
          dropdown: "dropdown-component",
          refill: "refill-component",
          stepMarker: "step-component",
        },
        symbols: {
          emptyCode: -1,
          removeExcludedSymbols: ["sticky"],
          dropHeldSymbols: [],
          valueSymbols: ["value"],
          sequentialWinCompanionSymbols: [],
        },
        amount: {
          cashFields: ["cashWin64", "cashWin"],
          coinFields: ["coinWin64", "coinWin"],
          cashUnit: "cents",
        },
      },
    });
    expect(profile.cascade?.symbols.emptyCode).toBe(-1);
    expect(profile).not.toHaveProperty("reel");
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.cascade?.symbols)).toBe(true);
  });

  it("rejects unknown fields, aliases, duplicate roles and invalid amount policy", () => {
    expect(() => parseSlotRoundFlowProfile({ ...base, version: 2 })).toThrow(
      /round.version must be 1/,
    );
    expect(() =>
      parseSlotRoundFlowProfile({ ...base, reelKind: "grid-cell" }),
    ).toThrow(/reelKind is not supported/);
    expect(() =>
      parseSlotRoundFlowProfile({
        ...base,
        components: {
          spin: "spin-component",
          wins: ["spin-component"],
        },
      }),
    ).toThrow(/roles must be unique/);
    expect(() =>
      parseSlotRoundFlowProfile({
        ...base,
        amount: { cashFields: [], cashUnit: "cents" },
      }),
    ).toThrow(/cashFields must not be empty/);
    expect(() =>
      parseSlotRoundFlowProfile({
        ...base,
        cascade: {
          kind: "cascade",
          version: 1,
          components: {
            remove: "remove",
            dropdown: "dropdown",
            refill: "refill",
          },
          symbols: {
            emptyCode: -1,
            removeExcludedSymbols: [],
            dropHeldSymbols: [],
            valueSymbols: [],
          },
          amount: base.amount,
        },
      }),
    ).toThrow(/sequentialWinCompanionSymbols must be an array/);
    expect(() =>
      parseSlotRoundFlowProfile({
        ...base,
        cascade: {
          kind: "cascade",
          version: 1,
          components: {
            remove: "remove",
            dropdown: "dropdown",
            refill: "refill",
          },
          symbols: {
            emptyCode: -1,
            removeExcludedSymbols: ["sticky", "sticky"],
            dropHeldSymbols: [],
            valueSymbols: [],
            sequentialWinCompanionSymbols: [],
          },
          amount: base.amount,
        },
      }),
    ).toThrow(/contains duplicate "sticky"/);
  });

  it("validates explicit catalog role compatibility", () => {
    const summary = parseServerGameAuthoringSummary({
      gameName: "sample",
      gamecode: "code",
      parameter: [],
      betMethod: [
        {
          label: "normal",
          bet: 1,
          totalBetInWins: 1,
          graph: {
            cells: [
              {
                shape: "custom-node",
                id: "spin",
                label: "BasicReels2",
                data: { label: "spin-component" },
              },
              {
                shape: "custom-node",
                id: "win",
                label: "ClusterTrigger",
                data: { label: "win-component" },
              },
              {
                shape: "custom-node",
                id: "value",
                label: "GenSymbolVals2",
                data: { label: "value-component" },
              },
            ],
          },
        },
      ],
    });
    const profile = parseSlotRoundFlowProfile(base);
    expect(() =>
      validateSlotRoundFlowCatalogCompatibility({
        profile,
        catalog: summary.betMethods[0],
      }),
    ).not.toThrow();
    const wrong = parseSlotRoundFlowProfile({
      ...base,
      components: { spin: "win-component", wins: [] },
    });
    expect(() =>
      validateSlotRoundFlowCatalogCompatibility({
        profile: wrong,
        catalog: summary.betMethods[0],
      }),
    ).toThrow(/incompatible server node type/);
  });

  it("validates all policy symbols against the active case-sensitive catalog", () => {
    const profileInput = {
      ...base,
      cascade: {
        kind: "cascade",
        version: 1,
        components: {
          remove: "remove-component",
          dropdown: "dropdown-component",
          refill: "refill-component",
        },
        symbols: {
          emptyCode: -1,
          removeExcludedSymbols: ["Sticky"],
          dropHeldSymbols: [],
          valueSymbols: [],
          sequentialWinCompanionSymbols: [],
        },
        amount: base.amount,
      },
    };
    expect(() =>
      parseSlotRoundFlowProfile(profileInput, {
        activeSymbols: ["sticky"],
      }),
    ).toThrow(/unknown active symbol "Sticky"/);
    expect(() =>
      parseSlotRoundFlowProfile(profileInput, {
        activeSymbols: ["Sticky"],
      }),
    ).not.toThrow();
  });

  it("keeps intersections explicit and independent across policy fields", () => {
    const profile = parseSlotRoundFlowProfile(
      {
        ...base,
        cascade: {
          kind: "cascade",
          version: 1,
          components: {
            remove: "remove",
            dropdown: "dropdown",
            refill: "refill",
          },
          symbols: {
            emptyCode: -1,
            removeExcludedSymbols: ["sticky"],
            dropHeldSymbols: ["sticky"],
            valueSymbols: ["sticky"],
            sequentialWinCompanionSymbols: ["sticky"],
          },
          amount: base.amount,
        },
      },
      { activeSymbols: ["sticky"] },
    );
    expect(profile.cascade?.symbols).toMatchObject({
      removeExcludedSymbols: ["sticky"],
      dropHeldSymbols: ["sticky"],
      valueSymbols: ["sticky"],
      sequentialWinCompanionSymbols: ["sticky"],
    });
  });
});

describe("slot round execution compiler", () => {
  const profile = parseSlotRoundFlowProfile({
    kind: "slot-round-flow",
    version: 1,
    components: {
      spin: "spin",
      wins: ["wins"],
      valueUpdates: ["values"],
    },
    cascade: {
      kind: "cascade",
      version: 1,
      components: {
        remove: "remove",
        dropdown: "dropdown",
        refill: "refill",
        stepMarker: "respin",
      },
      symbols: {
        emptyCode: -1,
        removeExcludedSymbols: ["H"],
        dropHeldSymbols: ["H"],
        valueSymbols: ["V"],
        sequentialWinCompanionSymbols: ["H"],
      },
      amount: {
        cashFields: ["cashWin64", "cashWin"],
        cashUnit: "cents",
      },
    },
    amount: {
      cashFields: ["cashWin64", "cashWin"],
      cashUnit: "cents",
    },
  });

  it("compiles stable identity, held movement and value continuity before mutation", () => {
    const logic = createRoundLogic({
      refillScene: [[0, 2, 1]],
      refillPos: [0, 0],
    });
    const plan = compileSlotRoundExecutionPlan(profile, logic, {
      symbolCodes: { A: 0, H: 1, V: 2 },
      columns: 1,
      rows: 3,
    });
    expect(plan.steps.map((step) => step.kind)).toEqual([
      "win",
      "dropdown",
      "refill",
    ]);
    const dropdown = plan.steps[1];
    expect(dropdown.kind).toBe("dropdown");
    if (dropdown.kind !== "dropdown") throw new Error("expected dropdown");
    expect(dropdown.movements).toEqual([
      expect.objectContaining({
        occurrenceId: "initial:0:0",
        source: { x: 0, y: 0 },
        target: { x: 0, y: 1 },
        symbol: "V",
        value: 5,
      }),
    ]);
    expect(dropdown.heldOccurrenceIds).toEqual(["initial:0:2"]);
    expect(plan.final.scene).toEqual([[0, 2, 1]]);
    expect(plan.final.values).toEqual([[null, 5, null]]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
    expect(Object.isFrozen(plan.final.occurrences)).toBe(true);
  });

  it("fails when refill creates a value occurrence without authoritative data", () => {
    const logic = createRoundLogic({
      refillScene: [[2, 2, 1]],
      refillPos: [0, 0],
    });
    expect(() =>
      compileSlotRoundExecutionPlan(profile, logic, {
        symbolCodes: { A: 0, H: 1, V: 2 },
      }),
    ).toThrow(/missing authoritative value for "V"/);
  });

  it("fails a held occurrence mismatch and an empty-code catalog conflict", () => {
    expect(() =>
      compileSlotRoundExecutionPlan(
        profile,
        createRoundLogic({
          dropdownScene: [[-1, 1, 2]],
          refillScene: [[0, 1, 2]],
          refillPos: [0, 0],
        }),
        { symbolCodes: { A: 0, H: 1, V: 2 } },
      ),
    ).toThrow(/held occurrence/);
    expect(() =>
      compileSlotRoundExecutionPlan(
        parseSlotRoundFlowProfile({
          ...profile,
          cascade: {
            ...profile.cascade!,
            symbols: { ...profile.cascade!.symbols, emptyCode: 0 },
          },
        }),
        createRoundLogic({}),
        { symbolCodes: { A: 0, H: 1, V: 2 } },
      ),
    ).toThrow(/emptyCode 0 conflicts/);
  });

  it("rejects remove/refill/value drift and unapproved companions", () => {
    expect(() =>
      compileSlotRoundExecutionPlan(
        profile,
        createRoundLogic({ removedScene: [[2, 0, 1]] }),
        { symbolCodes: { A: 0, H: 1, V: 2 } },
      ),
    ).toThrow(/remove scene does not match/);
    expect(() =>
      compileSlotRoundExecutionPlan(
        profile,
        createRoundLogic({ refillPos: [0, 1] }),
        { symbolCodes: { A: 0, H: 1, V: 2 } },
      ),
    ).toThrow(/must match dropdown holes exactly/);
    expect(() =>
      compileSlotRoundExecutionPlan(
        profile,
        createRoundLogic({ dropdownValues: [[-1, 9, 0]] }),
        { symbolCodes: { A: 0, H: 1, V: 2 } },
      ),
    ).toThrow(/does not match compiled occurrence state/);
    const noCompanion = parseSlotRoundFlowProfile({
      ...profile,
      cascade: {
        ...profile.cascade!,
        symbols: {
          ...profile.cascade!.symbols,
          sequentialWinCompanionSymbols: [],
        },
      },
    });
    expect(() =>
      compileSlotRoundExecutionPlan(
        noCompanion,
        createRoundLogic({ resultPos: [0, 0, 0, 2] }),
        { symbolCodes: { A: 0, H: 1, V: 2 } },
      ),
    ).toThrow(/unapproved sequential companion "H"/);
  });

  it("accepts authoritative refill values and rejects carried value overwrite", () => {
    const authoritative = compileSlotRoundExecutionPlan(
      profile,
      createRoundLogic({
        refillScene: [[2, 2, 1]],
        refillPos: [0, 0],
        refillValues: [[7, 5, 0]],
      }),
      { symbolCodes: { A: 0, H: 1, V: 2 } },
    );
    expect(authoritative.final.values).toEqual([[7, 5, null]]);
    expect(() =>
      compileSlotRoundExecutionPlan(
        profile,
        createRoundLogic({
          refillValues: [[0, 6, 0]],
        }),
        { symbolCodes: { A: 0, H: 1, V: 2 } },
      ),
    ).toThrow(/refill changed carried occurrence/);
  });

  it("accepts server-owned values on sequential companions without collecting them", () => {
    const plan = compileSlotRoundExecutionPlan(
      profile,
      createRoundLogic({
        initialValues: [[5, 0, 7]],
        refillValues: [[0, 5, 7]],
      }),
      { symbolCodes: { A: 0, H: 1, V: 2 } },
    );
    expect(plan.initial.values).toEqual([[5, null, null]]);
    expect(plan.final.values).toEqual([[null, 5, null]]);
  });

  it("validates policy catalog again at compile time", () => {
    const unknownPolicy = parseSlotRoundFlowProfile({
      ...profile,
      cascade: {
        ...profile.cascade!,
        symbols: {
          ...profile.cascade!.symbols,
          removeExcludedSymbols: ["UNKNOWN"],
        },
      },
    });
    expect(() =>
      compileSlotRoundExecutionPlan(unknownPolicy, createRoundLogic({}), {
        symbolCodes: { A: 0, H: 1, V: 2 },
      }),
    ).toThrow(/unknown active symbol "UNKNOWN"/);
  });
});

function createRoundLogic(options: {
  readonly initialValues?: readonly (readonly number[])[];
  readonly dropdownScene?: readonly (readonly number[])[];
  readonly refillScene?: readonly (readonly number[])[];
  readonly refillPos?: readonly number[];
  readonly removedScene?: readonly (readonly number[])[];
  readonly resultPos?: readonly number[];
  readonly dropdownValues?: readonly (readonly number[])[];
  readonly refillValues?: readonly (readonly number[])[];
}): GameLogic {
  const initial = [[2, 0, 1]];
  const removed = options.removedScene ?? [[2, -1, 1]];
  const dropdown = options.dropdownScene ?? [[-1, 2, 1]];
  const refill = options.refillScene ?? [[0, 2, 1]];
  const result = { pos: options.resultPos ?? [0, 1], cashWin: 100 };
  const step0 = createStep({
    index: 0,
    components: {
      spin: { scenes: [initial] },
      values: { otherScenes: [options.initialValues ?? [[5, 0, 0]]] },
      wins: { results: [result] },
      remove: { scenes: [removed] },
    },
    results: [result],
  });
  const step1 = createStep({
    index: 1,
    components: {
      respin: {},
      dropdown: {
        scenes: [dropdown],
        ...(options.dropdownValues
          ? { otherScenes: [options.dropdownValues] }
          : {}),
      },
      refill: {
        scenes: [refill],
        basic: { pos: options.refillPos ?? [0, 0] },
      },
      ...(options.refillValues
        ? { values: { otherScenes: [options.refillValues] } }
        : {}),
    },
    results: [],
  });
  return {
    getSteps: () => [step0, step1],
  } as unknown as GameLogic;
}

function createStep(options: {
  readonly index: number;
  readonly components: Readonly<
    Record<
      string,
      {
        readonly scenes?: readonly (readonly (readonly number[])[])[];
        readonly otherScenes?: readonly (readonly (readonly number[])[])[];
        readonly results?: readonly Readonly<Record<string, unknown>>[];
        readonly basic?: Readonly<Record<string, unknown>>;
      }
    >
  >;
  readonly results: readonly Readonly<Record<string, unknown>>[];
}): GameLogicStep {
  return {
    getIndex: () => options.index,
    hasComponent: (name: string) => options.components[name] !== undefined,
    getComponent: (name: string) => {
      const component = options.components[name];
      if (!component) return undefined;
      return {
        name,
        raw: {},
        hasBasicComponentData: true,
        basicComponentData: component.basic ?? {},
        usedSceneIndexes: [],
        usedOtherSceneIndexes: [],
        usedResultIndexes:
          component.results?.map((_item, index) => index) ?? [],
      };
    },
    getComponentScenes: (name: string) =>
      options.components[name]?.scenes ?? [],
    getComponentOtherScenes: (name: string) =>
      options.components[name]?.otherScenes ?? [],
    getComponentResults: (name: string) =>
      (options.components[name]?.results ?? []) as never,
    getResult: (index: number) => options.results[index] as never,
  } as unknown as GameLogicStep;
}
