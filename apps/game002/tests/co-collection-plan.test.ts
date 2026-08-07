import { describe, expect, it } from "vitest";
import type {
  GameLogicStep,
  SceneMatrix,
  WinResult,
} from "@slotclientengine/gameframeworks";
import { compileGame002CoCollectionPlan } from "../src/co-collection-plan.js";

const CO = 10;
const BN = 12;
const SELECTED = 3;
const OTHER = 4;

describe("game002 CO collection compiler", () => {
  it("compiles four disjoint source relocations and authoritative BN output", () => {
    const input = matrix([
      [SELECTED, OTHER, OTHER, OTHER, SELECTED],
      [OTHER, OTHER, OTHER, OTHER, OTHER],
      [OTHER, OTHER, CO, OTHER, OTHER],
      [OTHER, OTHER, OTHER, OTHER, OTHER],
      [SELECTED, OTHER, OTHER, OTHER, SELECTED],
    ]);
    const output = mutable(input);
    const sources = [
      [0, 0],
      [0, 4],
      [4, 0],
      [4, 4],
    ] as const;
    const targets = [
      [1, 2],
      [2, 1],
      [2, 3],
      [3, 2],
    ] as const;
    sources.forEach(([x, y]) => (output[x]![y] = BN));
    targets.forEach(([x, y]) => (output[x]![y] = SELECTED));
    output[2]![2] = SELECTED;
    const other = output.map((column) =>
      column.map((code) => (code === BN ? -1 : 0)),
    );
    const pos: number[] = sources.flatMap(([sourceX, sourceY], index) => [
      sourceX,
      sourceY,
      targets[index]![0],
      targets[index]![1],
    ]);
    pos.push(-1);
    const step = fakeStep({
      "bg-triggerco": { results: [{ pos: [2, 2], symbol: CO }] },
      "bg-co": { raw: { pos }, scenes: [output], otherScenes: [other] },
      "bg-cogencn": { otherScenes: [other] },
      "bg-win2": {
        results: [
          {
            pos: [2, 2, ...targets.flatMap((position) => position)],
            symbol: SELECTED,
            mul: 5,
            cashWin: 0,
          },
        ],
      },
      "bg-bn": {
        results: [
          {
            pos: sources.flatMap((position) => position),
            symbol: BN,
            cashWin: 0,
          },
        ],
      },
    });

    const plan = compileGame002CoCollectionPlan({
      stepIndex: 0,
      step,
      inputScene: input,
      inputValues: input.map((column) => column.map(() => null)),
      coSymbolCode: CO,
      bnSymbolCode: BN,
      valueSymbolCodes: new Set(),
    });

    expect(plan?.segments).toHaveLength(1);
    expect(plan?.segments[0]?.transfers).toHaveLength(4);
    expect(plan?.transform.relocations).toEqual(
      sources.map(([x, y], index) => ({
        source: { x, y },
        target: { x: targets[index]![0], y: targets[index]![1] },
      })),
    );
    expect(plan?.sourcePositions).toEqual(sources.map(([x, y]) => ({ x, y })));
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("gives an actual bg-win result priority over CO collection", () => {
    const input = matrix([[CO]]);
    const step = fakeStep({
      "bg-win": {
        results: [{ pos: [0, 0], symbol: CO, cashWin: 1 }],
      },
    });
    expect(
      compileGame002CoCollectionPlan({
        stepIndex: 0,
        step,
        inputScene: input,
        inputValues: [[null]],
        coSymbolCode: CO,
        bnSymbolCode: BN,
        valueSymbolCodes: new Set(),
      }),
    ).toBeNull();
  });

  it("rejects incomplete, malformed, and ambiguous collection protocols", () => {
    const noCollection = validFixture();
    noCollection.components = {};
    expect(compileFixture(noCollection)).toBeNull();

    const missingTrigger = validFixture();
    delete missingTrigger.components["bg-triggerco"];
    expect(() => compileFixture(missingTrigger)).toThrow(
      /requires bg-triggerco/,
    );

    const noTriggeredCo = validFixture();
    noTriggeredCo.components["bg-triggerco"] = {
      results: [{ pos: [1, 1], symbol: OTHER }],
    };
    delete noTriggeredCo.components["bg-co"];
    delete noTriggeredCo.components["bg-cogencn"];
    delete noTriggeredCo.components["bg-win2"];
    delete noTriggeredCo.components["bg-bn"];
    expect(compileFixture(noTriggeredCo)).toBeNull();

    const unexpectedCollection = validFixture();
    unexpectedCollection.components["bg-triggerco"] = {
      results: [{ pos: [1, 1], symbol: OTHER }],
    };
    expect(() => compileFixture(unexpectedCollection)).toThrow(
      /has no triggered CO/,
    );

    const missingComponent = validFixture();
    delete missingComponent.components["bg-co"];
    expect(() => compileFixture(missingComponent)).toThrow(
      /requires component "bg-co"/,
    );

    const missingGeneratedCn = validFixture();
    delete missingGeneratedCn.components["bg-cogencn"];
    expect(() => compileFixture(missingGeneratedCn)).toThrow(
      /requires component "bg-cogencn"/,
    );

    const invalidRaw = validFixture();
    invalidRaw.components["bg-co"]!.raw = [];
    expect(() => compileFixture(invalidRaw)).toThrow(/must be an object/);

    const invalidPos = validFixture();
    invalidPos.components["bg-co"]!.raw = { pos: "bad" };
    expect(() => compileFixture(invalidPos)).toThrow(/must be an array/);

    const emptySegment = validFixture();
    emptySegment.components["bg-co"]!.raw = { pos: [-1] };
    expect(() => compileFixture(emptySegment)).toThrow(/empty segment/);

    const shortSegment = validFixture();
    shortSegment.components["bg-co"]!.raw = { pos: [0, 0, 1, 2] };
    expect(() => compileFixture(shortSegment)).toThrow(
      /must contain 4\.\.8 transfers/,
    );

    const malformedSegment = validFixture();
    malformedSegment.components["bg-co"]!.raw = {
      pos: [...validCollectionPos().slice(0, -2), -1],
    };
    expect(() => compileFixture(malformedSegment)).toThrow(
      /coordinate quadruples/,
    );

    const outOfRange = validFixture();
    const outOfRangePos = validCollectionPos();
    outOfRangePos[0] = 9;
    outOfRange.components["bg-co"]!.raw = { pos: outOfRangePos };
    expect(() => compileFixture(outOfRange)).toThrow(/is out of range/);

    const reusedSource = validFixture();
    const reusedPos = validCollectionPos();
    reusedPos[4] = reusedPos[0]!;
    reusedPos[5] = reusedPos[1]!;
    reusedSource.components["bg-co"]!.raw = { pos: reusedPos };
    expect(() => compileFixture(reusedSource)).toThrow(
      /is reused across the collection batch/,
    );

    const ambiguousCo = validFixture();
    const ambiguousPos = validCollectionPos();
    ambiguousPos[2] = 4;
    ambiguousPos[3] = 1;
    ambiguousCo.components["bg-co"]!.raw = { pos: ambiguousPos };
    expect(() => compileFixture(ambiguousCo)).toThrow(
      /must map to exactly one CO/,
    );
  });

  it("rejects authoritative output, win2, and BN mismatches", () => {
    const sceneMismatch = validFixture();
    const changedScene = mutable(
      sceneMismatch.components["bg-co"]!.scenes![0]!,
    );
    changedScene[1]![1] = SELECTED;
    sceneMismatch.components["bg-co"]!.scenes = [matrix(changedScene)];
    expect(() => compileFixture(sceneMismatch)).toThrow(
      /bg-co scene\[1\]\[1\]/,
    );

    const valueMismatch = validFixture();
    const changedValues = mutable(
      valueMismatch.components["bg-co"]!.otherScenes![0]!,
    );
    changedValues[1]![1] = 2;
    valueMismatch.components["bg-co"]!.otherScenes = [matrix(changedValues)];
    expect(() => compileFixture(valueMismatch)).toThrow(
      /must be 0 or -1 for a non-value symbol/,
    );

    const generatedValueMismatch = validFixture();
    const changedGeneratedValues = mutable(
      generatedValueMismatch.components["bg-cogencn"]!.otherScenes![0]!,
    );
    changedGeneratedValues[1]![1] = 2;
    generatedValueMismatch.components["bg-cogencn"]!.otherScenes = [
      matrix(changedGeneratedValues),
    ];
    expect(() => compileFixture(generatedValueMismatch)).toThrow(
      /bg-cogencn otherScene\[1\]\[1\]/,
    );

    const wrongWinSymbol = validFixture();
    wrongWinSymbol.components["bg-win2"]!.results = [
      { pos: [2, 2], symbol: OTHER, mul: 1 },
    ];
    expect(() => compileFixture(wrongWinSymbol)).toThrow(
      /must match a collected symbol code/,
    );

    const missingWinPosition = validFixture();
    missingWinPosition.components["bg-win2"]!.results = [
      { pos: [2, 2], symbol: SELECTED, mul: 1 },
    ];
    expect(() => compileFixture(missingWinPosition)).toThrow(
      /do not include collected position/,
    );

    const wrongBnPositions = validFixture();
    wrongBnPositions.components["bg-bn"]!.results = [
      { pos: [0, 0], symbol: BN, cashWin: 0 },
    ];
    expect(() => compileFixture(wrongBnPositions)).toThrow(
      /must exactly match the collected source positions/,
    );
  });

  it("preserves a value symbol value across source relocation", () => {
    const fixture = validFixture();
    fixture.inputValues[0]![0] = 7;
    fixture.inputValues[0]![4] = 8;
    fixture.inputValues[4]![0] = 9;
    fixture.inputValues[4]![4] = 10;
    const intermediateValues = mutable(
      fixture.components["bg-co"]!.otherScenes![0]!,
    );
    intermediateValues[1]![2] = 7;
    intermediateValues[2]![1] = 8;
    intermediateValues[2]![3] = 9;
    intermediateValues[3]![2] = 10;
    fixture.components["bg-co"]!.otherScenes = [matrix(intermediateValues)];
    const generatedValues = mutable(intermediateValues);
    generatedValues[2]![2] = 11;
    fixture.components["bg-cogencn"]!.otherScenes = [matrix(generatedValues)];
    fixture.valueSymbolCodes = new Set([SELECTED]);

    const plan = compileFixture(fixture);

    expect(plan?.segments[0]?.transfers[0]?.sourceValue).toBe(7);
    expect(
      plan?.transform.changes.find(
        ({ position }) => position.x === 1 && position.y === 2,
      )?.outputValue,
    ).toBe(7);

    const invalidValue = validFixture();
    invalidValue.valueSymbolCodes = new Set([SELECTED]);
    expect(() => compileFixture(invalidValue)).toThrow(/must be positive/);
  });
});

interface MutableFakeComponent {
  raw?: unknown;
  scenes?: readonly SceneMatrix[];
  otherScenes?: readonly SceneMatrix[];
  results?: readonly WinResult[];
}

interface ValidFixture {
  input: SceneMatrix;
  inputValues: (number | null)[][];
  components: Record<string, MutableFakeComponent>;
  valueSymbolCodes: ReadonlySet<number>;
}

function validFixture(): ValidFixture {
  const input = matrix([
    [SELECTED, OTHER, OTHER, OTHER, SELECTED],
    [OTHER, OTHER, OTHER, OTHER, OTHER],
    [OTHER, OTHER, CO, OTHER, OTHER],
    [OTHER, OTHER, OTHER, OTHER, OTHER],
    [SELECTED, OTHER, OTHER, OTHER, SELECTED],
  ]);
  const output = mutable(input);
  for (const [x, y] of [
    [0, 0],
    [0, 4],
    [4, 0],
    [4, 4],
  ])
    output[x]![y] = BN;
  for (const [x, y] of [
    [1, 2],
    [2, 1],
    [2, 2],
    [2, 3],
    [3, 2],
  ])
    output[x]![y] = SELECTED;
  const intermediateValues: number[][] = output.map((column) =>
    column.map((code) => (code === BN ? -1 : 0)),
  );
  const generatedValues: number[][] = intermediateValues.map((column) => [
    ...column,
  ]);
  generatedValues[2]![2] = 1;
  return {
    input,
    inputValues: input.map((column) => column.map(() => null)),
    components: {
      "bg-triggerco": { results: [{ pos: [2, 2], symbol: CO }] },
      "bg-co": {
        raw: { pos: validCollectionPos() },
        scenes: [matrix(output)],
        otherScenes: [matrix(intermediateValues)],
      },
      "bg-cogencn": {
        otherScenes: [matrix(generatedValues)],
      },
      "bg-win2": {
        results: [
          {
            pos: [2, 2, 1, 2, 2, 1, 2, 3, 3, 2],
            symbol: SELECTED,
            mul: 5,
            cashWin: 0,
          },
        ],
      },
      "bg-bn": {
        results: [
          {
            pos: [0, 0, 0, 4, 4, 0, 4, 4],
            symbol: BN,
            cashWin: 0,
          },
        ],
      },
    },
    valueSymbolCodes: new Set(),
  };
}

function validCollectionPos(): number[] {
  return [0, 0, 1, 2, 0, 4, 2, 1, 4, 0, 2, 3, 4, 4, 3, 2, -1];
}

function compileFixture(fixture: ValidFixture) {
  return compileGame002CoCollectionPlan({
    stepIndex: 0,
    step: fakeStep(fixture.components),
    inputScene: fixture.input,
    inputValues: fixture.inputValues,
    coSymbolCode: CO,
    bnSymbolCode: BN,
    valueSymbolCodes: fixture.valueSymbolCodes,
  });
}

function fakeStep(
  components: Readonly<
    Record<
      string,
      {
        readonly raw?: unknown;
        readonly scenes?: readonly SceneMatrix[];
        readonly otherScenes?: readonly SceneMatrix[];
        readonly results?: readonly WinResult[];
      }
    >
  >,
): GameLogicStep {
  return {
    getIndex: () => 0,
    hasComponent: (name: string) => components[name] !== undefined,
    getComponent: (name: string) => {
      const component = components[name];
      if (!component) return undefined;
      return {
        name,
        raw: component.raw ?? {},
        hasBasicComponentData: true,
        basicComponentData: {
          usedScenes: [],
          usedOtherScenes: [],
          usedResults: [],
        },
        usedSceneIndexes: [],
        usedOtherSceneIndexes: [],
        usedResultIndexes: [],
      };
    },
    getComponentScenes: (name: string) => components[name]?.scenes ?? [],
    getComponentOtherScenes: (name: string) =>
      components[name]?.otherScenes ?? [],
    getComponentResults: (name: string) => components[name]?.results ?? [],
  } as unknown as GameLogicStep;
}

function matrix(value: number[][]): SceneMatrix {
  return Object.freeze(value.map((column) => Object.freeze([...column])));
}

function mutable(value: SceneMatrix): number[][] {
  return value.map((column) => [...column]);
}
