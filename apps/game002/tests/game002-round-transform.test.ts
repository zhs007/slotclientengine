import { describe, expect, it } from "vitest";
import type {
  SlotRoundOccurrenceSnapshot,
  SlotRoundSettledTransformStepPlan,
} from "@slotclientengine/gameframeworks";
import type { SymbolCascadePlayer } from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import { Game002RoundTarget } from "../src/game-adapter.js";
import type { Game002ReelRuntime } from "../src/game-demo.js";

describe("Game002RoundTarget multiplier transform", () => {
  it("rejects an out-of-order or mismatched atomic presentation session", () => {
    const runtime = new TransformRuntime();
    const target = new Game002RoundTarget({
      runtime: runtime.asRuntime(),
      cascadePlayer: {} as SymbolCascadePlayer,
      winAmountPlayer: {} as WinAmountAnimationPlayer,
      wlSymbolCode: 0,
      wmSymbolCode: 7,
      cnSymbolCode: 8,
      cmSymbolCode: 9,
    });
    const step = createTransformStep();
    const batch = {
      stepIndex: 1,
      wlIncrements: [],
      wmReplacements: [
        { position: { x: 1, y: 0 }, intermediateValue: 9, outputValue: 9 },
      ],
      cnUpdates: [],
      cm: null,
      coReplacements: [],
    } as const;
    target.configure({
      sequence: {} as never,
      betAmountRaw: 0,
      winAmountRaw: 0,
    });
    expect(() =>
      target.startAtomicTransformOperation(step, batch, "wm-to-cn"),
    ).toThrow(/must start/);
    target.startAtomicTransformOperation(step, batch, "wild-multiplier");
    expect(() =>
      target.startAtomicTransformOperation(step, { ...batch }, "wm-to-cn"),
    ).toThrow(/does not match/);
    expect(() =>
      target.startAtomicTransformOperation(step, batch, "coin-multiplier"),
    ).toThrow(/cannot start/);
  });
  it("waits for real animation edges before updating WL, changing WM and committing CN", () => {
    const runtime = new TransformRuntime();
    const target = new Game002RoundTarget({
      runtime: runtime.asRuntime(),
      cascadePlayer: {} as SymbolCascadePlayer,
      winAmountPlayer: {} as WinAmountAnimationPlayer,
      wlSymbolCode: 0,
      wmSymbolCode: 7,
      cnSymbolCode: 8,
      cmSymbolCode: 9,
    });
    const step = createTransformStep();
    target.configure({
      sequence: {} as never,
      betAmountRaw: 0,
      winAmountRaw: 0,
    });
    const batch = {
      stepIndex: step.stepIndex,
      wlIncrements: [],
      wmReplacements: [
        { position: { x: 1, y: 0 }, intermediateValue: 9, outputValue: 9 },
      ],
      cnUpdates: [],
      cm: null,
      coReplacements: [],
    } as const;
    target.startAtomicTransformOperation(step, batch, "wild-multiplier");
    expect(runtime.events).toEqual([
      "text:0,0=x2",
      "text:1,0=x3",
      "prepare:1,0:7->8",
      "state:multStart",
    ]);
    expect(
      target.updateAtomicTransformOperation(0, "wild-multiplier").completed,
    ).toBe(false);

    runtime.advanceOnce();
    expect(
      target.updateAtomicTransformOperation(0, "wild-multiplier").completed,
    ).toBe(true);
    expect(runtime.events.slice(-2)).toEqual(["text:0,0=x5", "state:multIdle"]);

    target.startAtomicTransformOperation(step, batch, "wm-to-cn");
    runtime.advanceLoop();
    expect(target.updateAtomicTransformOperation(0, "wm-to-cn").completed).toBe(
      false,
    );
    expect(runtime.events.at(-1)).toBe("state:multEnd");

    runtime.advanceOnce();
    expect(target.updateAtomicTransformOperation(0, "wm-to-cn").completed).toBe(
      false,
    );
    expect(runtime.events.at(-1)).toBe("state:change");

    runtime.advanceOnce();
    expect(target.updateAtomicTransformOperation(0, "wm-to-cn").completed).toBe(
      true,
    );
    expect(runtime.events.at(-1)).toBe("commit:1,0:8");
    expect(runtime.scene[1][0]).toBe(8);
  });

  it("plays WL Start for deferred bg-incwl even when the settled batch has no WM", () => {
    const scene = createScene(1);
    scene[1][0] = 1;
    const runtime = new TransformRuntime(scene);
    const target = new Game002RoundTarget({
      runtime: runtime.asRuntime(),
      cascadePlayer: {} as SymbolCascadePlayer,
      winAmountPlayer: {} as WinAmountAnimationPlayer,
      wlSymbolCode: 0,
      wmSymbolCode: 7,
      cnSymbolCode: 8,
      cmSymbolCode: 9,
    });
    const step = createWlIncrementStep(scene);
    target.configure({
      sequence: {} as never,
      betAmountRaw: 0,
      winAmountRaw: 0,
    });
    const batch = {
      stepIndex: 1,
      wlIncrements: [
        { position: { x: 0, y: 0 }, inputValue: 2, outputValue: 3 },
      ],
      wmReplacements: [],
      cnUpdates: [],
      cm: null,
      coReplacements: [],
    } as const;
    target.startAtomicTransformOperation(step, batch, "wl-increment");
    expect(runtime.events).toEqual([
      "text:0,0=x2",
      "text:0,0=x3",
      "state:appear",
    ]);
    runtime.advanceOnce();
    expect(
      target.updateAtomicTransformOperation(0, "wl-increment").completed,
    ).toBe(true);
  });

  it("plays the complete WM sequence and commits CN when the board has no WL", () => {
    const scene = createScene(1);
    scene[0][0] = 1;
    const runtime = new TransformRuntime(scene);
    const target = new Game002RoundTarget({
      runtime: runtime.asRuntime(),
      cascadePlayer: {} as SymbolCascadePlayer,
      winAmountPlayer: {} as WinAmountAnimationPlayer,
      wlSymbolCode: 0,
      wmSymbolCode: 7,
      cnSymbolCode: 8,
      cmSymbolCode: 9,
    });
    const step = createWmOnlyTransformStep(scene);
    target.configure({
      sequence: {} as never,
      betAmountRaw: 0,
      winAmountRaw: 0,
    });
    target.startSettledTransformOperation(step, {
      stepIndex: step.stepIndex,
      wlIncrements: [],
      wmReplacements: [
        { position: { x: 1, y: 0 }, intermediateValue: 11, outputValue: 11 },
      ],
      cnUpdates: [],
      cm: null,
      coReplacements: [],
    });
    expect(runtime.events).toEqual([
      "text:1,0=x4",
      "prepare:1,0:7->8",
      "state:multStart",
    ]);
    runtime.advanceOnce();
    expect(target.updateSettledTransform(0).completed).toBe(false);
    expect(runtime.events.at(-1)).toBe("state:multIdle");
    runtime.advanceLoop();
    expect(target.updateSettledTransform(0).completed).toBe(false);
    expect(runtime.events.at(-1)).toBe("state:multEnd");
    runtime.advanceOnce();
    expect(target.updateSettledTransform(0).completed).toBe(false);
    expect(runtime.events.at(-1)).toBe("state:change");
    runtime.advanceOnce();
    expect(target.updateSettledTransform(0).completed).toBe(true);
    expect(runtime.events.at(-1)).toBe("commit:1,0:8");
  });

  it("plays CM Feature1, changes all CN values, then converts CM to CN", () => {
    const scene = createScene(1);
    scene[0][0] = 1;
    scene[1][0] = 9;
    scene[2][0] = 8;
    const runtime = new TransformRuntime(scene);
    const target = new Game002RoundTarget({
      runtime: runtime.asRuntime(),
      cascadePlayer: {} as SymbolCascadePlayer,
      winAmountPlayer: {} as WinAmountAnimationPlayer,
      wlSymbolCode: 0,
      wmSymbolCode: 7,
      cnSymbolCode: 8,
      cmSymbolCode: 9,
    });
    const step = createCmTransformStep(scene);
    target.configure({
      sequence: {} as never,
      betAmountRaw: 0,
      winAmountRaw: 0,
    });
    const batch = {
      stepIndex: step.stepIndex,
      wlIncrements: [],
      wmReplacements: [],
      cnUpdates: [{ position: { x: 2, y: 0 }, inputValue: 5, outputValue: 10 }],
      cm: { position: { x: 1, y: 0 }, multiplier: 2, outputValue: 7 },
      coReplacements: [],
    } as const;
    target.startAtomicTransformOperation(step, batch, "coin-multiplier");
    expect(runtime.events).toEqual([
      "text:1,0=x2",
      "prepare:1,0:9->8",
      "state:feature1",
    ]);

    runtime.advanceOnce();
    expect(
      target.updateAtomicTransformOperation(0, "coin-multiplier").completed,
    ).toBe(false);
    expect(runtime.events.at(-1)).toBe("state:featureChange");

    runtime.advanceOnce();
    expect(
      target.updateAtomicTransformOperation(0, "coin-multiplier").completed,
    ).toBe(true);

    target.startAtomicTransformOperation(step, batch, "cm-to-cn");
    expect(runtime.events.at(-1)).toBe("state:change");

    runtime.advanceOnce();
    expect(target.updateAtomicTransformOperation(0, "cm-to-cn").completed).toBe(
      true,
    );
    expect(runtime.events.at(-1)).toBe("commit:1,0:8");
    expect(runtime.scene[1][0]).toBe(8);
  });

  it("commits WM before starting CM and completes CM before the transform", () => {
    const scene = createScene(1);
    scene[0][0] = 1;
    scene[1][0] = 7;
    scene[2][0] = 8;
    scene[3][0] = 9;
    const runtime = new TransformRuntime(scene);
    const target = new Game002RoundTarget({
      runtime: runtime.asRuntime(),
      cascadePlayer: {} as SymbolCascadePlayer,
      winAmountPlayer: {} as WinAmountAnimationPlayer,
      wlSymbolCode: 0,
      wmSymbolCode: 7,
      cnSymbolCode: 8,
      cmSymbolCode: 9,
    });
    const step = createWmCmTransformStep(scene);
    target.configure({
      sequence: {} as never,
      betAmountRaw: 0,
      winAmountRaw: 0,
    });
    const batch = {
      stepIndex: step.stepIndex,
      wlIncrements: [],
      wmReplacements: [
        { position: { x: 1, y: 0 }, intermediateValue: 4, outputValue: 8 },
      ],
      cnUpdates: [
        { position: { x: 1, y: 0 }, inputValue: 4, outputValue: 8 },
        { position: { x: 2, y: 0 }, inputValue: 5, outputValue: 10 },
      ],
      cm: { position: { x: 3, y: 0 }, multiplier: 2, outputValue: 7 },
      coReplacements: [],
    } as const;
    target.startAtomicTransformOperation(step, batch, "wild-multiplier");
    expect(runtime.events.at(-1)).toBe("state:multStart");
    runtime.advanceOnce();
    expect(
      target.updateAtomicTransformOperation(0, "wild-multiplier").completed,
    ).toBe(true);
    target.startAtomicTransformOperation(step, batch, "wm-to-cn");
    runtime.advanceLoop();
    expect(target.updateAtomicTransformOperation(0, "wm-to-cn").completed).toBe(
      false,
    );
    runtime.advanceOnce();
    expect(target.updateAtomicTransformOperation(0, "wm-to-cn").completed).toBe(
      false,
    );
    runtime.advanceOnce();
    expect(target.updateAtomicTransformOperation(0, "wm-to-cn").completed).toBe(
      true,
    );
    expect(runtime.events.at(-1)).toBe("commit:1,0:8");

    target.startAtomicTransformOperation(step, batch, "coin-multiplier");
    expect(runtime.events.at(-1)).toBe("state:feature1");
    runtime.advanceOnce();
    expect(
      target.updateAtomicTransformOperation(0, "coin-multiplier").completed,
    ).toBe(false);
    expect(runtime.events.at(-1)).toBe("state:featureChange");
    runtime.advanceOnce();
    expect(
      target.updateAtomicTransformOperation(0, "coin-multiplier").completed,
    ).toBe(true);
    target.startAtomicTransformOperation(step, batch, "cm-to-cn");
    expect(runtime.events.at(-1)).toBe("state:change");
    runtime.advanceOnce();
    expect(target.updateAtomicTransformOperation(0, "cm-to-cn").completed).toBe(
      true,
    );
    expect(runtime.events.at(-1)).toBe("commit:3,0:8");
  });
});

class TransformRuntime {
  readonly events: string[] = [];
  readonly scene: number[][];
  #loop = 0;
  #once = 0;
  #state = "normal";

  constructor(scene = createScene(1)) {
    this.scene = scene;
  }

  advanceLoop(): void {
    this.#loop += 1;
  }

  advanceOnce(): void {
    this.#once += 1;
  }

  asRuntime(): Game002ReelRuntime {
    return {
      setVisibleSymbolPresentationValue: (
        _x: number,
        _y: number,
        _value: number,
      ) => {},
      setVisibleSymbolImageStringText: (
        x: number,
        y: number,
        _name: string,
        text: string,
      ) => {
        this.events.push(`text:${x},${y}=${text}`);
      },
      hasVisibleSymbolStateCapability: () => true,
      requestVisibleSymbolStates: (
        _positions: readonly { x: number; y: number }[],
        state: string,
      ) => {
        this.#state = state;
        this.events.push(`state:${state}`);
      },
      getVisibleSymbolStateSnapshots: (
        positions: readonly { x: number; y: number }[],
      ) =>
        positions.map(({ x, y }) => ({
          x,
          y,
          code: this.scene[x][y],
          kind: "textured",
          requestedState: this.#state,
          resolvedState: this.#state,
          isOnce: this.#state !== "multIdle",
          loopCompletionCount: this.#loop,
          onceCompletionCount: this.#once,
        })),
      prepareVisibleOccurrenceReplacement: (options: {
        x: number;
        y: number;
        expectedCode: number;
        outputCode: number;
        outputPresentationValue: number | null;
      }) => {
        this.events.push(
          `prepare:${options.x},${options.y}:${options.expectedCode}->${options.outputCode}`,
        );
        return {
          x: options.x,
          y: options.y,
          inputCode: options.expectedCode,
          outputCode: options.outputCode,
          commit: () => {
            this.scene[options.x][options.y] = options.outputCode;
            this.events.push(
              `commit:${options.x},${options.y}:${options.outputCode}`,
            );
          },
          rollback: () => undefined,
          destroy: () => undefined,
        };
      },
      getVisualSnapshot: () => ({
        visible: true,
        spinning: false,
        visibleScene: this.scene,
        requestedStates: [],
        presentationValues: createScene(null),
        reelCount: 6,
        gridCellCount: 54,
        layerX: 0,
        layerY: 0,
        anticipation: {
          active: false,
          landedTriggerCount: 0,
          activationCoordinate: null,
        },
        effects: {
          active: false,
          startedKeys: [],
          completedKeys: [],
        },
      }),
    } as unknown as Game002ReelRuntime;
  }
}

function createTransformStep(): SlotRoundSettledTransformStepPlan {
  const input = createSnapshot(createScene(1), 7, 3, 2);
  const outputScene = createScene(1);
  outputScene[1][0] = 8;
  const output = createSnapshot(outputScene, 8, 9, 5);
  const wlInput = input.occurrences.find((item) => item.position.x === 0)!;
  const wmInput = input.occurrences.find((item) => item.position.x === 1)!;
  const wlOutput = output.occurrences.find((item) => item.position.x === 0)!;
  const cnOutput = output.occurrences.find((item) => item.position.x === 1)!;
  return Object.freeze({
    kind: "settled-transform",
    index: 0,
    stepIndex: 1,
    input,
    output,
    changes: Object.freeze([
      Object.freeze({
        occurrenceId: wlInput.id,
        position: wlInput.position,
        input: wlInput,
        output: wlOutput,
      }),
      Object.freeze({
        occurrenceId: wmInput.id,
        position: wmInput.position,
        input: wmInput,
        output: cnOutput,
      }),
    ]),
    requiredCapabilities: Object.freeze(["settled-transform"] as const),
  });
}

function createWlIncrementStep(
  scene: readonly (readonly number[])[],
): SlotRoundSettledTransformStepPlan {
  const input = createSnapshot(scene, 1, 0, 2);
  const output = createSnapshot(scene, 1, 0, 3);
  const wlInput = input.occurrences.find((item) => item.position.x === 0)!;
  const wlOutput = output.occurrences.find((item) => item.position.x === 0)!;
  return Object.freeze({
    kind: "settled-transform",
    index: 0,
    stepIndex: 1,
    input,
    output,
    changes: Object.freeze([
      Object.freeze({
        occurrenceId: wlInput.id,
        position: wlInput.position,
        input: wlInput,
        output: wlOutput,
      }),
    ]),
    requiredCapabilities: Object.freeze(["settled-transform"] as const),
  });
}

function createWmOnlyTransformStep(
  scene: readonly (readonly number[])[],
): SlotRoundSettledTransformStepPlan {
  const inputValues = createScene<number | null>(null);
  inputValues[1][0] = 4;
  const input = createGenericSnapshot(scene, inputValues);
  const outputScene = scene.map((column) => [...column]);
  outputScene[1][0] = 8;
  const outputValues = createScene<number | null>(null);
  outputValues[1][0] = 11;
  const output = createGenericSnapshot(outputScene, outputValues);
  const wmInput = input.occurrences.find(
    (item) => item.position.x === 1 && item.position.y === 0,
  )!;
  const cnOutput = output.occurrences.find(
    (item) => item.position.x === 1 && item.position.y === 0,
  )!;
  return Object.freeze({
    kind: "settled-transform",
    index: 0,
    stepIndex: 1,
    input,
    output,
    changes: Object.freeze([
      Object.freeze({
        occurrenceId: wmInput.id,
        position: wmInput.position,
        input: wmInput,
        output: cnOutput,
      }),
    ]),
    requiredCapabilities: Object.freeze(["settled-transform"] as const),
  });
}

function createCmTransformStep(
  scene: readonly (readonly number[])[],
): SlotRoundSettledTransformStepPlan {
  const inputValues = createScene<number | null>(null);
  inputValues[1][0] = 2;
  inputValues[2][0] = 5;
  const input = createGenericSnapshot(scene, inputValues);
  const outputScene = scene.map((column) => [...column]);
  outputScene[1][0] = 8;
  const outputValues = createScene<number | null>(null);
  outputValues[1][0] = 7;
  outputValues[2][0] = 10;
  const output = createGenericSnapshot(outputScene, outputValues);
  const positions = [
    Object.freeze({ x: 1, y: 0 }),
    Object.freeze({ x: 2, y: 0 }),
  ];
  return Object.freeze({
    kind: "settled-transform",
    index: 0,
    stepIndex: 1,
    input,
    output,
    changes: Object.freeze(
      positions.map((position) => {
        const occurrenceId = `o-${position.x}-${position.y}`;
        return Object.freeze({
          occurrenceId,
          position,
          input: input.occurrences.find((item) => item.id === occurrenceId)!,
          output: output.occurrences.find((item) => item.id === occurrenceId)!,
        });
      }),
    ),
    requiredCapabilities: Object.freeze(["settled-transform"] as const),
  });
}

function createWmCmTransformStep(
  scene: readonly (readonly number[])[],
): SlotRoundSettledTransformStepPlan {
  const inputValues = createScene<number | null>(null);
  inputValues[1][0] = 3;
  inputValues[2][0] = 5;
  inputValues[3][0] = 2;
  const input = createGenericSnapshot(scene, inputValues);
  const outputScene = scene.map((column) => [...column]);
  outputScene[1][0] = 8;
  outputScene[3][0] = 8;
  const outputValues = createScene<number | null>(null);
  outputValues[1][0] = 8;
  outputValues[2][0] = 10;
  outputValues[3][0] = 7;
  const output = createGenericSnapshot(outputScene, outputValues);
  const positions = [
    Object.freeze({ x: 1, y: 0 }),
    Object.freeze({ x: 2, y: 0 }),
    Object.freeze({ x: 3, y: 0 }),
  ];
  return Object.freeze({
    kind: "settled-transform",
    index: 0,
    stepIndex: 1,
    input,
    output,
    changes: Object.freeze(
      positions.map((position) => {
        const occurrenceId = `o-${position.x}-${position.y}`;
        return Object.freeze({
          occurrenceId,
          position,
          input: input.occurrences.find((item) => item.id === occurrenceId)!,
          output: output.occurrences.find((item) => item.id === occurrenceId)!,
        });
      }),
    ),
    requiredCapabilities: Object.freeze(["settled-transform"] as const),
  });
}

function createGenericSnapshot(
  scene: readonly (readonly number[])[],
  values: readonly (readonly (number | null)[])[],
): SlotRoundOccurrenceSnapshot {
  return Object.freeze({
    scene,
    values,
    occurrences: Object.freeze(
      scene.flatMap((column, x) =>
        column.map((code, y) =>
          Object.freeze({
            id: `o-${x}-${y}`,
            code,
            symbol:
              code === 0
                ? "WL"
                : code === 7
                  ? "WM"
                  : code === 8
                    ? "CN"
                    : code === 9
                      ? "CM"
                      : "A",
            value: values[x][y],
            position: Object.freeze({ x, y }),
          }),
        ),
      ),
    ),
  });
}

function createSnapshot(
  scene: readonly (readonly number[])[],
  transformedCode: number,
  transformedValue: number,
  wlValue: number,
): SlotRoundOccurrenceSnapshot {
  const occurrences = scene.flatMap((column, x) =>
    column.map((code, y) => ({
      id: `o-${x}-${y}`,
      code: x === 1 && y === 0 ? transformedCode : code,
      symbol:
        x === 0 && y === 0
          ? "WL"
          : x === 1 && y === 0
            ? transformedCode === 7
              ? "WM"
              : "CN"
            : "A",
      value:
        x === 0 && y === 0
          ? wlValue
          : x === 1 && y === 0
            ? transformedValue
            : null,
      position: { x, y },
    })),
  );
  return Object.freeze({
    scene,
    values: scene.map((column, x) =>
      column.map((_code, y) =>
        x === 0 && y === 0
          ? wlValue
          : x === 1 && y === 0
            ? transformedValue
            : null,
      ),
    ),
    occurrences,
  }) as SlotRoundOccurrenceSnapshot;
}

function createScene<T>(fill: T): T[][] {
  return Array.from({ length: 6 }, (_column, x) =>
    Array.from({ length: 9 }, (_row, y) =>
      x === 0 && y === 0 ? (0 as T) : x === 1 && y === 0 ? (7 as T) : fill,
    ),
  );
}
