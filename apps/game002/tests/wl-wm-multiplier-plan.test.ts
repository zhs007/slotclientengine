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
const WM = 7;
const CN = 8;
const A = 1;

describe("game002 WL/WM multiplier compiler", () => {
  it("uses bg-genwm scene as the settled spin or refill scene", () => {
    const inputScene = freezeMatrix([
      [A, A],
      [A, A],
    ]);
    const generatedScene = freezeMatrix([
      [WM, A],
      [A, A],
    ]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
    });
    const compileContext = createContext({
      stepIndex: 0,
      snapshot: createSnapshot(inputScene, [
        [null, null],
        [null, null],
      ]),
      scenes: {
        "bg-genwm": generatedScene,
      },
    });

    expect(
      compiler.resolveSettledScene({
        stepIndex: 0,
        step: compileContext.step,
        kind: "spin",
        inputScene,
      }),
    ).toBe(generatedScene);
  });

  it("hydrates newly settled WL and WM values from their own components", () => {
    const scene = freezeMatrix([
      [WL, A],
      [WM, WL],
    ]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
    });
    const context = createContext({
      stepIndex: 0,
      snapshot: createSnapshot(scene, [
        [null, null],
        [null, 5],
      ]),
      otherScenes: {
        "bg-genwilds": freezeMatrix([
          [2, 91],
          [92, 93],
        ]),
        "bg-setwm": freezeMatrix([
          [81, 82],
          [4, 83],
        ]),
      },
    });

    expect(compiler.hydrateSettledValues(context)).toEqual([
      { position: { x: 0, y: 0 }, value: 2 },
      { position: { x: 1, y: 0 }, value: 4 },
    ]);
  });

  it("applies the same post-settle flow to refill WM and updates every carried WL", () => {
    const scene = freezeMatrix([
      [WL, WM],
      [WL, WM],
      [A, A],
    ]);
    const snapshot = createSnapshot(scene, [
      [2, 3],
      [5, 4],
      [null, null],
    ]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
    });
    const context = createContext({
      stepIndex: 1,
      snapshot,
      otherScenes: {
        "bg-updwl": freezeMatrix([
          [9, 71],
          [12, 72],
          [73, 74],
        ]),
        "bg-genwmcn": freezeMatrix([
          [61, 10],
          [62, 20],
          [63, 64],
        ]),
      },
      scenes: {
        "bg-wm2cn": freezeMatrix([
          [WL, CN],
          [WL, CN],
          [A, A],
        ]),
      },
    });

    expect(compiler.compileSettledTransform(context)).toEqual([
      { position: { x: 0, y: 0 }, outputCode: WL, outputValue: 9 },
      { position: { x: 0, y: 1 }, outputCode: CN, outputValue: 10 },
      { position: { x: 1, y: 0 }, outputCode: WL, outputValue: 12 },
      { position: { x: 1, y: 1 }, outputCode: CN, outputValue: 20 },
    ]);
  });

  it("rejects partial WM transform component sets", () => {
    const scene = freezeMatrix([[WM]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
    });
    const context = createContext({
      stepIndex: 2,
      snapshot: createSnapshot(scene, [[3]]),
      otherScenes: {
        "bg-updwl": freezeMatrix([[0]]),
        "bg-genwmcn": freezeMatrix([[9]]),
      },
    });

    expect(() => compiler.compileSettledTransform(context)).toThrow(
      /bg-wm2cn component is required/,
    );
  });

  it("runs the full WM transform when the board has no WL", () => {
    const scene = freezeMatrix([[WM, A]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
    });
    const context = createContext({
      stepIndex: 0,
      snapshot: createSnapshot(scene, [[4, null]]),
      otherScenes: {
        "bg-genwmcn": freezeMatrix([[9, 0]]),
      },
      scenes: {
        "bg-wm2cn": freezeMatrix([[CN, A]]),
      },
    });

    expect(compiler.compileSettledTransform(context)).toEqual([
      { position: { x: 0, y: 0 }, outputCode: CN, outputValue: 9 },
    ]);
    compiler.assertComplete();
  });

  it("defers bg-incwl to the next settled batch before WM processing", () => {
    const scene = freezeMatrix([[WL]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
    });
    expect(
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 0,
          snapshot: createSnapshot(scene, [[2]]),
          otherScenes: { "bg-incwl": freezeMatrix([[3]]) },
          extraComponents: ["bg-win"],
          results: {
            "bg-win": [{ pos: [0, 0] }],
          },
        }),
      ),
    ).toEqual([]);

    expect(
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 1,
          snapshot: createSnapshot(scene, [[2]]),
        }),
      ),
    ).toEqual([{ position: { x: 0, y: 0 }, outputCode: WL, outputValue: 3 }]);
    expect(compiler.getPresentationBatch(1)).toEqual({
      stepIndex: 1,
      wlIncrements: [
        {
          position: { x: 0, y: 0 },
          inputValue: 2,
          outputValue: 3,
        },
      ],
    });
    compiler.assertComplete();
  });

  it("requires bg-incwl for every WL that participates in bg-win", () => {
    const scene = freezeMatrix([[WL]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
    });

    expect(() =>
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 0,
          snapshot: createSnapshot(scene, [[2]]),
          extraComponents: ["bg-win"],
          results: {
            "bg-win": [{ pos: [0, 0] }],
          },
        }),
      ),
    ).toThrow(/bg-incwl is required/);
  });

  it("ignores non-target cells in WL component otherScenes", () => {
    const scene = freezeMatrix([[WL], [A]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
    });

    expect(
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 0,
          snapshot: createSnapshot(scene, [[2], [null]]),
          otherScenes: {
            "bg-incwl": freezeMatrix([[3], [99]]),
          },
          extraComponents: ["bg-win"],
          results: {
            "bg-win": [{ pos: [0, 0] }],
          },
        }),
      ),
    ).toEqual([]);
  });
});

function createContext(options: {
  readonly stepIndex: number;
  readonly snapshot: SlotRoundOccurrenceSnapshot;
  readonly otherScenes?: Readonly<Record<string, OtherSceneMatrix>>;
  readonly scenes?: Readonly<Record<string, SceneMatrix>>;
  readonly extraComponents?: readonly string[];
  readonly results?: Readonly<
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
      otherScenes[name]
        ? Object.freeze([otherScenes[name]])
        : Object.freeze([]),
    getComponentScenes: (name: string) =>
      scenes[name] ? Object.freeze([scenes[name]]) : Object.freeze([]),
    getComponentResults: (name: string) =>
      Object.freeze(options.results?.[name] ?? []),
  } as unknown as GameLogicStep;
  return Object.freeze({
    stepIndex: options.stepIndex,
    step,
    input: options.snapshot,
  });
}

function createSnapshot(
  scene: SceneMatrix,
  values: readonly (readonly (number | null)[])[],
): SlotRoundOccurrenceSnapshot {
  const occurrences = scene.flatMap((column, x) =>
    column.map((code, y) =>
      Object.freeze({
        id: `o-${x}-${y}`,
        code,
        symbol: code === WL ? "WL" : code === WM ? "WM" : "A",
        value: values[x][y],
        position: Object.freeze({ x, y }),
      }),
    ),
  );
  return Object.freeze({
    scene,
    values: freezeMatrix(values),
    occurrences: Object.freeze(occurrences),
  });
}

function freezeMatrix<T>(
  matrix: readonly (readonly T[])[],
): readonly (readonly T[])[] {
  return Object.freeze(matrix.map((column) => Object.freeze([...column])));
}
