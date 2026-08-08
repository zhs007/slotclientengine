import { describe, expect, it } from "vitest";
import type {
  GameLogicStep,
  OtherSceneMatrix,
  SceneMatrix,
  SlotRoundOccurrenceSnapshot,
  SlotRoundSettledCompileContext,
} from "@slotclientengine/gameframeworks";
import { createGame002WlWmMultiplierCompiler } from "../src/wl-wm-multiplier-plan.js";

const WL = 0;
const A = 1;
const WM = 7;
const CN = 8;
const CM = 9;

describe("game002 WL/WM/CM operation compiler", () => {
  it("settles generated WM and CM in server order", () => {
    const input = matrix([
      [A, A],
      [A, A],
    ]);
    const context = createContext({
      stepIndex: 1,
      snapshot: snapshot(
        matrix([
          [WM, A],
          [CM, A],
        ]),
        [
          [null, null],
          [null, null],
        ],
      ),
      scenes: {
        "bg-genwm": matrix([
          [WM, A],
          [A, A],
        ]),
        "bg-gencm": matrix([
          [CN, A],
          [CM, A],
        ]),
      },
    });
    expect(
      compiler().resolveSettledScene({
        stepIndex: 1,
        step: context.step,
        kind: "refill",
        inputScene: input,
      }),
    ).toEqual([
      [WM, A],
      [CM, A],
    ]);
  });

  it("hydrates only visible value symbols from their components", () => {
    const context = createContext({
      stepIndex: 0,
      snapshot: snapshot(
        matrix([
          [WL, A],
          [WM, CM],
        ]),
        [
          [null, null],
          [null, 5],
        ],
      ),
      otherScenes: {
        "bg-genwilds": matrix([
          [2, 91],
          [92, 93],
        ]),
        "bg-setwm": matrix([
          [81, 82],
          [4, 83],
        ]),
        "bg-setcm": matrix([
          [71, 72],
          [73, 5],
        ]),
      },
    });
    expect(compiler().hydrateSettledValues(context)).toEqual([
      { position: { x: 0, y: 0 }, value: 2 },
      { position: { x: 1, y: 0 }, value: 4 },
    ]);
  });

  it("uses the current bg-incwl values and deduplicates repeated win positions", () => {
    const instance = compiler();
    const input = snapshot(matrix([[WL]]), [[2]]);
    instance.compileSettledTransform(
      createContext({
        stepIndex: 0,
        snapshot: input,
        extraComponents: ["bg-win"],
        results: { "bg-win": [{ pos: [0, 0] }, { pos: [0, 0] }] },
      }),
    );
    const result = instance.compileSettledTransform(
      createContext({
        stepIndex: 1,
        snapshot: input,
        otherScenes: { "bg-incwl": matrix([[3]]) },
      }),
    );
    expect(result.draft).toEqual([
      { position: { x: 0, y: 0 }, outputCode: WL, outputValue: 3 },
    ]);
    expect(result.payload?.wlIncrements).toEqual([
      { position: { x: 0, y: 0 }, inputValue: 2, outputValue: 3 },
    ]);
  });

  it("trusts server WM output values instead of recomputing them", () => {
    const result = compiler().compileSettledTransform(
      createContext({
        stepIndex: 2,
        snapshot: snapshot(
          matrix([
            [WL, WM],
            [WL, A],
          ]),
          [
            [2, 3],
            [5, null],
          ],
        ),
        scenes: {
          "bg-wm2cn": matrix([
            [WL, CN],
            [WL, A],
          ]),
        },
        otherScenes: {
          "bg-updwl": matrix([
            [19, 0],
            [23, 0],
          ]),
          "bg-genwmcn": matrix([
            [0, 11],
            [0, 0],
          ]),
        },
      }),
    );
    expect(result.draft).toEqual([
      { position: { x: 0, y: 0 }, outputCode: WL, outputValue: 19 },
      { position: { x: 0, y: 1 }, outputCode: CN, outputValue: 11 },
      { position: { x: 1, y: 0 }, outputCode: WL, outputValue: 23 },
    ]);
    expect(
      result.payload?.wlUpdates.map(({ outputValue }) => outputValue),
    ).toEqual([19, 23]);
  });

  it("uses server CN and CM conversion values", () => {
    const result = compiler().compileSettledTransform(
      createContext({
        stepIndex: 3,
        snapshot: snapshot(matrix([[CN], [CM]]), [[5], [2]]),
        scenes: { "bg-cm2cn": matrix([[CN], [CN]]) },
        otherScenes: {
          "bg-updcn": matrix([[17], [0]]),
          "bg-gencmcn": matrix([[0], [13]]),
        },
      }),
    );
    expect(result.draft).toEqual([
      { position: { x: 0, y: 0 }, outputCode: CN, outputValue: 17 },
      { position: { x: 1, y: 0 }, outputCode: CN, outputValue: 13 },
    ]);
    expect(result.payload?.cm).toEqual({
      position: { x: 1, y: 0 },
      multiplier: 2,
      outputValue: 13,
    });
  });

  it("requires only data consumed by the current WM operation", () => {
    const context = createContext({
      stepIndex: 4,
      snapshot: snapshot(matrix([[WM]]), [[3]]),
      otherScenes: { "bg-genwmcn": matrix([[9]]) },
    });
    expect(() => compiler().compileSettledTransform(context)).toThrow(
      /bg-wm2cn scene is missing/,
    );
  });

  it("does not require later-step WL evidence during plan generation", () => {
    const instance = compiler();
    instance.compileSettledTransform(
      createContext({
        stepIndex: 0,
        snapshot: snapshot(matrix([[WL]]), [[2]]),
        extraComponents: ["bg-win"],
        results: { "bg-win": [{ pos: [0, 0] }] },
      }),
    );
    expect(() => instance.assertComplete()).not.toThrow();
  });
});

function compiler() {
  return createGame002WlWmMultiplierCompiler({
    wlSymbolCode: WL,
    wmSymbolCode: WM,
    cnSymbolCode: CN,
    cmSymbolCode: CM,
  });
}

function createContext(options: {
  stepIndex: number;
  snapshot: SlotRoundOccurrenceSnapshot;
  otherScenes?: Readonly<Record<string, OtherSceneMatrix>>;
  scenes?: Readonly<Record<string, SceneMatrix>>;
  extraComponents?: readonly string[];
  results?: Readonly<
    Record<string, readonly { readonly pos: readonly number[] }[]>
  >;
}): SlotRoundSettledCompileContext {
  const otherScenes = options.otherScenes ?? {};
  const scenes = options.scenes ?? {};
  const names = new Set([
    ...Object.keys(otherScenes),
    ...Object.keys(scenes),
    ...(options.extraComponents ?? []),
  ]);
  const step = {
    getIndex: () => options.stepIndex,
    hasComponent: (name: string) => names.has(name),
    getComponentOtherScenes: (name: string) =>
      otherScenes[name] ? [otherScenes[name]] : [],
    getComponentScenes: (name: string) => (scenes[name] ? [scenes[name]] : []),
    getComponentResults: (name: string) => options.results?.[name] ?? [],
  } as unknown as GameLogicStep;
  return Object.freeze({
    stepIndex: options.stepIndex,
    step,
    input: options.snapshot,
  });
}

function snapshot(
  scene: SceneMatrix,
  values: readonly (readonly (number | null)[])[],
): SlotRoundOccurrenceSnapshot {
  return Object.freeze({
    scene,
    values: matrix(values),
    occurrences: Object.freeze(
      scene.flatMap((column, x) =>
        column.map((code, y) =>
          Object.freeze({
            id: `o-${x}-${y}`,
            code,
            symbol:
              code === WL
                ? "WL"
                : code === WM
                  ? "WM"
                  : code === CN
                    ? "CN"
                    : code === CM
                      ? "CM"
                      : "A",
            value: values[x]![y]!,
            position: Object.freeze({ x, y }),
          }),
        ),
      ),
    ),
  });
}

function matrix<T>(
  value: readonly (readonly T[])[],
): readonly (readonly T[])[] {
  return Object.freeze(value.map((column) => Object.freeze([...column])));
}
