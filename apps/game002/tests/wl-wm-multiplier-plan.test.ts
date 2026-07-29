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
const CM = 9;
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
      cmSymbolCode: CM,
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
      cmSymbolCode: CM,
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
      cmSymbolCode: CM,
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
      cmSymbolCode: CM,
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
      cmSymbolCode: CM,
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
      cmSymbolCode: CM,
    });
    expect(
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
    ).toEqual([]);

    expect(
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 1,
          snapshot: createSnapshot(scene, [[2]]),
          otherScenes: { "bg-incwl": freezeMatrix([[3]]) },
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
      wmReplacements: [],
      cnUpdates: [],
      cm: null,
      coReplacements: [],
    });
    compiler.assertComplete();
  });

  it("chains consecutive winning WL increments from the settled output value", () => {
    const scene = freezeMatrix([[WL]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
    });
    expect(
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 0,
          snapshot: createSnapshot(scene, [[1]]),
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
          snapshot: createSnapshot(scene, [[1]]),
          extraComponents: ["bg-win"],
          otherScenes: { "bg-incwl": freezeMatrix([[2]]) },
          results: {
            "bg-win": [{ pos: [0, 0] }],
          },
        }),
      ),
    ).toEqual([{ position: { x: 0, y: 0 }, outputCode: WL, outputValue: 2 }]);

    expect(
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 2,
          snapshot: createSnapshot(scene, [[2]]),
          otherScenes: { "bg-incwl": freezeMatrix([[3]]) },
        }),
      ),
    ).toEqual([{ position: { x: 0, y: 0 }, outputCode: WL, outputValue: 3 }]);
    expect(compiler.getPresentationBatch(2)?.wlIncrements).toEqual([
      {
        position: { x: 0, y: 0 },
        inputValue: 2,
        outputValue: 3,
      },
    ]);
    compiler.assertComplete();
  });

  it("requires bg-incwl for every WL that participates in bg-win", () => {
    const scene = freezeMatrix([[WL]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
    });

    expect(
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
    ).toEqual([]);
    expect(() =>
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 1,
          snapshot: createSnapshot(scene, [[2]]),
        }),
      ),
    ).toThrow(
      /step\[1\] bg-incwl is required.*preceding bg-win.*sourceStep=0, 0,0, code=0, symbol="WL", multiplier=2.*result\[0\]=\[0,0\].*after dropdown and before refill/,
    );
  });

  it("ignores non-target cells in WL component otherScenes", () => {
    const scene = freezeMatrix([[WL], [A]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
    });

    expect(
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 0,
          snapshot: createSnapshot(scene, [[2], [null]]),
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
          snapshot: createSnapshot(scene, [[2], [null]]),
          otherScenes: {
            "bg-incwl": freezeMatrix([[3], [99]]),
          },
        }),
      ),
    ).toEqual([{ position: { x: 0, y: 0 }, outputCode: WL, outputValue: 3 }]);
  });

  it("rejects bg-incwl before a preceding step has a winning WL", () => {
    const scene = freezeMatrix([[WL]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
    });

    expect(() =>
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 0,
          snapshot: createSnapshot(scene, [[2]]),
          otherScenes: { "bg-incwl": freezeMatrix([[3]]) },
        }),
      ),
    ).toThrow(/bg-incwl has no winning WL from the preceding step/);
  });

  it("composes simultaneous WM and CM generation in WM then CM order", () => {
    const messages: string[] = [];
    const inputScene = freezeMatrix([
      [A, A],
      [A, A],
    ]);
    const generatedWmScene = freezeMatrix([
      [WM, A],
      [A, A],
    ]);
    const generatedCmScene = freezeMatrix([
      [CN, A],
      [CM, A],
    ]);
    const settledScene = freezeMatrix([
      [WM, A],
      [CM, A],
    ]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
      logDiagnostic: (message) => messages.push(message),
    });
    const context = createContext({
      stepIndex: 1,
      snapshot: createSnapshot(settledScene, [
        [null, null],
        [null, null],
      ]),
      scenes: {
        "bg-genwm": generatedWmScene,
        "bg-gencm": generatedCmScene,
      },
    });

    expect(
      compiler.resolveSettledScene({
        stepIndex: 1,
        step: context.step,
        kind: "refill",
        inputScene,
      }),
    ).toEqual(settledScene);
    expect(messages).toEqual([
      "settled step[1] kind=refill source=bg-genwm+bg-gencm(staged); flow=CO-settled->WM->CM->CO-collect; bg-genwm=present; bg-gencm=present; bg-genco=missing",
    ]);
  });

  it("uses bg-gencm only after the simultaneous WM stage has completed", () => {
    const settledScene = freezeMatrix([
      [WM, A],
      [CM, A],
    ]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
    });
    const context = createContext({
      stepIndex: 0,
      snapshot: createSnapshot(settledScene, [
        [3, null],
        [2, null],
      ]),
      scenes: {
        "bg-genwm": freezeMatrix([
          [WM, A],
          [A, A],
        ]),
        "bg-wm2cn": freezeMatrix([
          [CN, A],
          [A, A],
        ]),
        "bg-gencm": freezeMatrix([
          [CN, A],
          [CM, A],
        ]),
        "bg-cm2cn": freezeMatrix([
          [CN, A],
          [CN, A],
        ]),
      },
      otherScenes: {
        "bg-genwmcn": freezeMatrix([
          [4, 0],
          [0, 0],
        ]),
        "bg-updcn": freezeMatrix([
          [8, 0],
          [0, 0],
        ]),
        "bg-gencmcn": freezeMatrix([
          [0, 0],
          [7, 0],
        ]),
      },
    });

    expect(compiler.compileSettledTransform(context)).toEqual([
      { position: { x: 0, y: 0 }, outputCode: CN, outputValue: 8 },
      { position: { x: 1, y: 0 }, outputCode: CN, outputValue: 7 },
    ]);
    expect(compiler.getPresentationBatch(0)?.wmReplacements).toEqual([
      {
        position: { x: 0, y: 0 },
        intermediateValue: 4,
        outputValue: 8,
      },
    ]);
    expect(compiler.getPresentationBatch(0)?.cm).toEqual({
      position: { x: 1, y: 0 },
      multiplier: 2,
      outputValue: 7,
    });
  });

  it("settles bg-genco CO before animation and does not compile a terminal replacement", () => {
    const inputScene = freezeMatrix([[A]]);
    const generatedCoScene = freezeMatrix([[10]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
      coSymbolCode: 10,
    });
    const context = createContext({
      stepIndex: 0,
      snapshot: createSnapshot(generatedCoScene, [[null]]),
      scenes: {
        "bg-genco": generatedCoScene,
      },
    });

    expect(
      compiler.resolveSettledScene({
        stepIndex: 0,
        step: context.step,
        kind: "spin",
        inputScene,
      }),
    ).toEqual(generatedCoScene);
    expect(compiler.compileSettledTransform(context)).toEqual([]);
    expect(compiler.getPresentationBatch(0)).toBeUndefined();
  });

  it("keeps WM until bg-wm2cn and reconciles bg-genco only after the CN value exists", () => {
    const inputScene = freezeMatrix([[WM], [10]]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
      coSymbolCode: 10,
    });
    const context = createContext({
      stepIndex: 0,
      snapshot: createSnapshot(inputScene, [[500], [null]]),
      scenes: {
        "bg-wm2cn": freezeMatrix([[CN], [A]]),
        "bg-genco": freezeMatrix([[CN], [10]]),
      },
      otherScenes: {
        "bg-genwmcn": freezeMatrix([[500], [0]]),
      },
    });

    expect(compiler.compileSettledTransform(context)).toEqual([
      { position: { x: 0, y: 0 }, outputCode: CN, outputValue: 500 },
    ]);
    expect(compiler.getPresentationBatch(0)).toMatchObject({
      wmReplacements: [
        {
          position: { x: 0, y: 0 },
          intermediateValue: 500,
          outputValue: 500,
        },
      ],
      coReplacements: [],
    });
  });

  it("hydrates one CM from bg-setcm and rejects multiple CM occurrences", () => {
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
    });
    const scene = freezeMatrix([[CM, A]]);
    expect(
      compiler.hydrateSettledValues(
        createContext({
          stepIndex: 1,
          snapshot: createSnapshot(scene, [[null, null]]),
          scenes: { "bg-gencm": scene },
          otherScenes: { "bg-setcm": freezeMatrix([[3, 91]]) },
        }),
      ),
    ).toEqual([{ position: { x: 0, y: 0 }, value: 3 }]);

    const multipleCmScene = freezeMatrix([[CM, CM]]);
    expect(() =>
      compiler.hydrateSettledValues(
        createContext({
          stepIndex: 2,
          snapshot: createSnapshot(multipleCmScene, [[null, null]]),
          scenes: { "bg-gencm": multipleCmScene },
          otherScenes: { "bg-setcm": freezeMatrix([[2, 3]]) },
        }),
      ),
    ).toThrow(/at most one CM/);
  });

  it("processes WM before CM, multiplies every CN and then converts CM", () => {
    const scene = freezeMatrix([
      [WM, CN],
      [CM, A],
    ]);
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
    });
    const context = createContext({
      stepIndex: 1,
      snapshot: createSnapshot(scene, [
        [3, 5],
        [2, null],
      ]),
      scenes: {
        "bg-wm2cn": freezeMatrix([
          [CN, CN],
          [CM, A],
        ]),
        "bg-cm2cn": freezeMatrix([
          [CN, CN],
          [CN, A],
        ]),
      },
      otherScenes: {
        "bg-genwmcn": freezeMatrix([
          [4, 91],
          [92, 93],
        ]),
        "bg-updcn": freezeMatrix([
          [8, 10],
          [94, 95],
        ]),
        "bg-gencmcn": freezeMatrix([
          [96, 97],
          [7, 98],
        ]),
      },
    });

    expect(compiler.compileSettledTransform(context)).toEqual([
      { position: { x: 0, y: 0 }, outputCode: CN, outputValue: 8 },
      { position: { x: 0, y: 1 }, outputCode: CN, outputValue: 10 },
      { position: { x: 1, y: 0 }, outputCode: CN, outputValue: 7 },
    ]);
    expect(compiler.getPresentationBatch(1)).toEqual({
      stepIndex: 1,
      wlIncrements: [],
      wmReplacements: [
        {
          position: { x: 0, y: 0 },
          intermediateValue: 4,
          outputValue: 8,
        },
      ],
      cnUpdates: [
        {
          position: { x: 0, y: 0 },
          inputValue: 4,
          outputValue: 8,
        },
        {
          position: { x: 0, y: 1 },
          inputValue: 5,
          outputValue: 10,
        },
      ],
      cm: {
        position: { x: 1, y: 0 },
        multiplier: 2,
        outputValue: 7,
      },
      coReplacements: [],
    });
    compiler.assertComplete();
  });

  it("supports a refill CM with no prior CN and rejects unsafe CN products", () => {
    const compiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode: WL,
      wmSymbolCode: WM,
      cnSymbolCode: CN,
      cmSymbolCode: CM,
    });
    expect(
      compiler.compileSettledTransform(
        createContext({
          stepIndex: 1,
          snapshot: createSnapshot(freezeMatrix([[CM]]), [[3]]),
          scenes: { "bg-cm2cn": freezeMatrix([[CN]]) },
          otherScenes: { "bg-gencmcn": freezeMatrix([[7]]) },
        }),
      ),
    ).toEqual([{ position: { x: 0, y: 0 }, outputCode: CN, outputValue: 7 }]);

    expect(() =>
      createGame002WlWmMultiplierCompiler({
        wlSymbolCode: WL,
        wmSymbolCode: WM,
        cnSymbolCode: CN,
        cmSymbolCode: CM,
      }).compileSettledTransform(
        createContext({
          stepIndex: 2,
          snapshot: createSnapshot(freezeMatrix([[CN, CM]]), [
            [Number.MAX_SAFE_INTEGER, 2],
          ]),
          scenes: { "bg-cm2cn": freezeMatrix([[CN, CN]]) },
          otherScenes: {
            "bg-updcn": freezeMatrix([[1, 91]]),
            "bg-gencmcn": freezeMatrix([[92, 7]]),
          },
        }),
      ),
    ).toThrow(/safe integer range/);
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
