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
  it("compiles trigger positions, routes and server-owned output changes", () => {
    const fixture = validFixture();
    const plan = compileFixture(fixture);

    expect(plan?.mainPos).toEqual([{ x: 2, y: 2 }]);
    expect(plan?.routes).toEqual([
      { source: { x: 0, y: 0 }, target: { x: 1, y: 2 } },
      { source: { x: 0, y: 4 }, target: { x: 2, y: 1 } },
      { source: { x: 4, y: 0 }, target: { x: 2, y: 3 } },
      { source: { x: 4, y: 4 }, target: { x: 3, y: 2 } },
    ]);
    expect(plan?.changes).toEqual(
      expect.arrayContaining([
        { position: { x: 0, y: 0 }, outputCode: BN, outputValue: null },
        {
          position: { x: 1, y: 2 },
          outputCode: SELECTED,
          outputValue: null,
        },
        {
          position: { x: 2, y: 2 },
          outputCode: SELECTED,
          outputValue: null,
        },
      ]),
    );
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("returns null when a normal win owns the step or no CO is triggered", () => {
    const fixture = validFixture();
    fixture.components["bg-win"] = {
      results: [{ pos: [2, 2], symbol: CO, cashWin: 1 }],
    };
    expect(compileFixture(fixture)).toBeNull();

    const noTrigger = validFixture();
    delete noTrigger.components["bg-triggerco"];
    expect(compileFixture(noTrigger)).toBeNull();
  });

  it("only performs basic parsing checks for consumed protocol cells", () => {
    const malformed = validFixture();
    malformed.components["bg-co"]!.raw = { pos: [0, 0, 1] };
    expect(() => compileFixture(malformed)).toThrow(/coordinate quadruples/);

    const outOfRange = validFixture();
    outOfRange.components["bg-co"]!.raw = {
      pos: [99, 0, 1, 2, -1],
    };
    expect(() => compileFixture(outOfRange)).toThrow(/is out of range/);

    const missingScene = validFixture();
    missingScene.components["bg-co"]!.scenes = [];
    expect(() => compileFixture(missingScene)).toThrow(/exactly one/);
  });

  it("uses output scene codes instead of reconstructing CO rules", () => {
    const fixture = validFixture();
    const output = mutable(fixture.components["bg-co"]!.scenes![0]!);
    output[0]![0] = OTHER;
    output[1]![2] = OTHER;
    fixture.components["bg-co"]!.scenes = [matrix(output)];

    const plan = compileFixture(fixture);

    expect(plan?.changes.slice(0, 2)).toEqual([
      { position: { x: 0, y: 0 }, outputCode: OTHER, outputValue: null },
      { position: { x: 1, y: 2 }, outputCode: OTHER, outputValue: null },
    ]);
  });

  it("copies value-symbol values only for the affected cells", () => {
    const fixture = validFixture();
    fixture.valueSymbolCodes = new Set([SELECTED]);
    fixture.inputValues[0]![0] = 7;
    fixture.inputValues[0]![4] = 8;
    fixture.inputValues[4]![0] = 9;
    fixture.inputValues[4]![4] = 10;

    const plan = compileFixture(fixture);

    expect(
      plan?.changes.find(({ position }) => position.x === 1 && position.y === 2)
        ?.outputValue,
    ).toBe(7);
    expect(
      plan?.changes.find(({ position }) => position.x === 2 && position.y === 2)
        ?.outputValue,
    ).toBe(1);

    fixture.inputValues[0]![0] = null;
    expect(() => compileFixture(fixture)).toThrow(/positive safe integer/);
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
  const generatedValues = output.map((column) => column.map(() => 0));
  generatedValues[2]![2] = 1;
  return {
    input,
    inputValues: input.map((column) => column.map(() => null)),
    components: {
      "bg-triggerco": { results: [{ pos: [2, 2], symbol: CO }] },
      "bg-co": {
        raw: { pos: validCollectionPos() },
        scenes: [matrix(output)],
      },
      "bg-cogencn": { otherScenes: [matrix(generatedValues)] },
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
    valueSymbolCodes: fixture.valueSymbolCodes,
  });
}

function fakeStep(
  components: Readonly<Record<string, MutableFakeComponent>>,
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
