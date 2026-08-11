import { describe, expect, it } from "vitest";
import type { SlotOperationSnapshot } from "@slotclientengine/gameframeworks";
import type { SymbolCascadePlayer } from "@slotclientengine/rendercore";
import type { SlotOperationExecutionContext } from "@slotclientengine/rendercore";
import type {
  VisibleSymbolStatePlaybackBatchOptions,
  VisibleSymbolStatePlaybackRequest,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import { Game002RoundTarget } from "../src/game-adapter.js";
import type { Game002TransformPayload } from "../src/game002-operation-compiler.js";
import type { Game002TransformOperation } from "../src/game002-operation-compiler.js";
import type { Game002ReelRuntime } from "../src/game002-reel-controller.js";

describe("Game002RoundTarget atomic multiplier programs", () => {
  it("runs WM animation and replacement as independent operations", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const input = createSnapshot(createScene(1), 7, 3, 2);
    const wildOutput = createSnapshot(createScene(1), 7, 3, 5);
    const wild = operation("game002:wild-multiplier", wildOutput, {
      type: "driven-change",
      mainPos: [{ x: 1, y: 0 }],
      pos: [{ x: 0, y: 0 }],
    });

    const wildCompletion = target.startAtomicTransform(wild, context(input));
    expect(runtime.events).toEqual(["state:multStart"]);
    runtime.advanceOnce();
    await flushPlayback();
    expect(runtime.events).toContain("state:multIdle");
    runtime.advanceLoop();
    await flushPlayback();
    await wildCompletion;

    const outputScene = createScene(1);
    outputScene[1][0] = 8;
    const wmOutput = createSnapshot(outputScene, 8, 9, 5);
    const wm = operation("game002:wm-to-cn", wmOutput, {
      type: "change",
      pos: [{ x: 1, y: 0 }],
    });
    const wmCompletion = target.startAtomicTransform(wm, context(wildOutput));
    runtime.advanceOnce();
    await flushPlayback();
    expect(runtime.events.at(-1)).toBe("state:change");
    runtime.advanceOnce();
    await flushPlayback();
    await wmCompletion;
    expect(runtime.scene[1][0]).toBe(8);
  });

  it("plays WL increment only from its minimal payload", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const input = createSnapshot(createScene(1), 7, 3, 2);
    const output = createSnapshot(createScene(1), 7, 3, 3);
    const operationValue = operation("game002:wl-increment", output, {
      type: "change",
      pos: [{ x: 0, y: 0 }],
    });

    const completion = target.startAtomicTransform(
      operationValue,
      context(input),
    );
    expect(runtime.events).toContain("text:0,0=x3");
    runtime.advanceOnce();
    await flushPlayback();
    await completion;
  });

  it("aborts playback without restoring a prior snapshot", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const input = createSnapshot(createScene(1), 7, 3, 2);
    const output = createSnapshot(createScene(1), 7, 3, 5);
    const operationValue = operation("game002:wild-multiplier", output, {
      type: "driven-change",
      mainPos: [{ x: 1, y: 0 }],
      pos: [{ x: 0, y: 0 }],
    });
    const abort = new AbortController();
    const completion = target.startAtomicTransform(
      operationValue,
      context(input, abort),
    );
    const signal = runtime.pendingSignals[0]!;
    abort.abort();
    target.cleanup();
    expect(signal.aborted).toBe(true);
    await expect(completion).rejects.toThrow(/aborted/);
    expect(runtime.scene).toEqual(input.scene);
  });

  it("rejects a missing animation when the affected position starts", async () => {
    const runtime = new TransformRuntime();
    runtime.missingState = "change";
    const target = createTarget(runtime);
    const input = createSnapshot(createScene(1), 7, 3, 2);
    const outputScene = createScene(1);
    outputScene[1][0] = 8;
    const output = createSnapshot(outputScene, 8, 9, 2);
    const operationValue = operation("game002:wm-to-cn", output, {
      type: "change",
      pos: [{ x: 1, y: 0 }],
    });
    const completion = target.startAtomicTransform(
      operationValue,
      context(input),
    );
    runtime.advanceOnce();
    await expect(completion).rejects.toThrow(/no "change"/);
    expect(runtime.events).toEqual(["state:multEnd"]);
  });

  it("animates and mutates every CN in its own coin-multiplier chain", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const input = createSnapshot(createScene(1), 8, 3, 2);
    const output = createSnapshot(createScene(1), 8, 6, 2);
    const operationValue = operation("game002:coin-multiplier", output, {
      type: "driven-change",
      mainPos: [{ x: 2, y: 0 }],
      pos: [{ x: 1, y: 0 }],
    });

    const completion = target.startAtomicTransform(
      operationValue,
      context(input),
    );
    expect(runtime.events).toEqual(["state:feature1"]);
    runtime.advanceOnce();
    await flushPlayback();
    expect(runtime.events.at(-1)).toBe("state:featureChange");
    expect(runtime.events).not.toContain("value:1,0=6");
    runtime.advanceOnce();
    await completion;
    expect(runtime.events.at(-1)).toBe("value:1,0=6");
  });

  it("runs CM replacement and CO transfer as direct async chains", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const cmScene = createScene(1);
    cmScene[1][0] = 9;
    runtime.scene[1]![0] = 9;
    const cmOutputScene = cmScene.map((column) => [...column]);
    cmOutputScene[1]![0] = 8;
    const cm = operation(
      "game002:cm-to-cn",
      createSnapshot(cmOutputScene, 8, 4, 2),
      { type: "change", pos: [{ x: 1, y: 0 }] },
    );

    const cmCompletion = target.startAtomicTransform(
      cm,
      context(createSnapshot(cmScene, 9, 4, 2)),
    );
    runtime.advanceOnce();
    await cmCompletion;
    expect(runtime.scene[1]![0]).toBe(8);

    const inputScene = createScene(1);
    inputScene[1]![0] = 8;
    inputScene[2]![0] = 10;
    runtime.scene[2]![0] = 10;
    const outputScene = inputScene.map((column) => [...column]);
    outputScene[1]![0] = 12;
    outputScene[2]![0] = 8;
    outputScene[3]![0] = 8;
    const inputValues = createScene<number | null>(null);
    inputValues[1]![0] = 4;
    const outputValues = createScene<number | null>(null);
    outputValues[2]![0] = 4;
    outputValues[3]![0] = 4;
    const co = operation(
      "game002:co-collect",
      createExactSnapshot(outputScene, outputValues),
      {
        type: "transfer",
        mainPos: [{ x: 2, y: 0 }],
        routes: [{ source: { x: 1, y: 0 }, target: { x: 3, y: 0 } }],
      },
    );

    const coCompletion = target.startAtomicTransform(
      co,
      context(createExactSnapshot(inputScene, inputValues)),
    );
    runtime.advanceOnce();
    await flushPlayback();
    expect(runtime.events).toContain("transfer:1");
    runtime.advanceOnce();
    await coCompletion;
    expect(runtime.scene[1]![0]).toBe(12);
    expect(runtime.scene[2]![0]).toBe(8);
    expect(runtime.scene[3]![0]).toBe(8);
  });

  it("rejects concurrent and unknown transform programs", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const snapshot = createSnapshot(createScene(1), 7, 3, 2);
    const active = target.startAtomicTransform(
      operation("game002:wild-multiplier", snapshot, {
        type: "driven-change",
        mainPos: [{ x: 1, y: 0 }],
        pos: [],
      }),
      context(snapshot),
    );
    await expect(
      target.startAtomicTransform(
        operation("game002:wl-increment", snapshot, {
          type: "change",
          pos: [],
        }),
        context(snapshot),
      ),
    ).rejects.toThrow(/cannot start while active/);
    runtime.rejectPending(new Error("stop active transform"));
    await expect(active).rejects.toThrow(/stop active transform/);

    await expect(
      target.startAtomicTransform(
        operation("game002:unknown", snapshot, {
          type: "change",
          pos: [],
        }),
        context(snapshot),
      ),
    ).rejects.toThrow(/not a game002 change operation/);
  });

  it("fails locally for invalid active-operation inputs", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const snapshot = createSnapshot(createScene(1), 7, 3, 2);

    expect(() => target.isInitialSpinComplete()).toThrow(/not active/);
    expect(() => target.updateWin()).toThrow(/not active/);
    expect(() => target.isDropdownComplete()).toThrow(/not active/);
    target.applyReleaseOnlyPositions([]);
    target.applyReleaseOnlyPositions([{ x: 0, y: 0 }]);
    target.startCompletionAmounts(1, 0);
    expect(target.isCompletionComplete()).toBe(true);
    target.startCompletionAmounts(1, 1);
    expect(target.isCompletionComplete()).toBe(false);
    target.cleanup();

    const presentation = {
      ...operation("game002:wl-increment", snapshot, {
        type: "change",
        pos: [],
      }),
      effect: "presentation",
    } as unknown as Game002TransformOperation;
    await expect(
      target.startAtomicTransform(presentation, context(snapshot)),
    ).rejects.toThrow(/state-mutation/);

    for (const payload of [
      undefined,
      { type: "driven-change", mainPos: [], pos: [] },
    ])
      await expect(
        target.startAtomicTransform(
          {
            ...operation("game002:wl-increment", snapshot, {
              type: "change",
              pos: [],
            }),
            payload,
          } as unknown as Game002TransformOperation,
          context(snapshot),
        ),
      ).rejects.toThrow(/must use a change payload/);

    for (const value of [null, 0, 1.5]) {
      const output = createSnapshot(
        createScene(1),
        7,
        3,
        value as unknown as number,
      );
      await expect(
        target.startAtomicTransform(
          operation("game002:wl-increment", output, {
            type: "change",
            pos: [{ x: 0, y: 0 }],
          }),
          context(snapshot),
        ),
      ).rejects.toThrow(/positive safe integer/);
    }
  });
});

function createTarget(runtime: TransformRuntime): Game002RoundTarget {
  return new Game002RoundTarget({
    runtime: runtime.asRuntime(),
    cascadePlayer: {
      clear: () => undefined,
      prepare: () => ({}),
      start: () => undefined,
    } as unknown as SymbolCascadePlayer,
    winAmountPlayer: {
      dismissImmediately: () => undefined,
      start: () => undefined,
    } as unknown as WinAmountAnimationPlayer,
    wlSymbolCode: 0,
    wmSymbolCode: 7,
    cmSymbolCode: 9,
  });
}

function operation(
  kind: string,
  output: SlotOperationSnapshot,
  payload: Game002TransformPayload,
): Game002TransformOperation {
  return Object.freeze({
    kind,
    version: 2,
    effect: "state-mutation",
    source: Object.freeze({
      kind: "server-component",
      stepIndex: 1,
      bindings: Object.freeze({}),
    }),
    payload: Object.freeze(payload),
    output,
    businessKey: kind,
    operationIndex: 0,
  }) as unknown as Game002TransformOperation;
}

async function flushPlayback(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

interface PendingTransformPlayback {
  readonly completion: "once-complete" | "next-loop-complete";
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
}

class TransformRuntime {
  readonly events: string[] = [];
  readonly scene: number[][];
  missingState: string | null = null;
  failNextSynchronously = false;
  ignoreAbort = false;
  anticipation = false;
  #loop = 0;
  #once = 0;
  #state = "normal";
  #pending: PendingTransformPlayback[] = [];

  constructor(scene = createScene(1)) {
    this.scene = scene;
  }

  advanceLoop(): void {
    this.#loop += 1;
    this.completePlayback("next-loop-complete");
  }

  advanceOnce(): void {
    this.#once += 1;
    this.completePlayback("once-complete");
  }

  get pendingSignals(): readonly AbortSignal[] {
    return this.#pending.flatMap((entry) =>
      entry.signal ? [entry.signal] : [],
    );
  }

  rejectPending(error: unknown): void {
    const pending = this.#pending.splice(0);
    for (const entry of pending) entry.reject(error);
  }

  asRuntime(): Game002ReelRuntime {
    const playVisibleSymbolStates = (
      _positions: readonly { x: number; y: number }[],
      state: string,
      options: {
        completion: "entered" | "once-complete" | "next-loop-complete";
        signal?: AbortSignal;
      },
    ) => {
      if (this.failNextSynchronously) {
        this.failNextSynchronously = false;
        throw new Error("transform playback did not start");
      }
      if (state === this.missingState)
        throw new Error(`transform position has no "${state}" animation`);
      this.#state = state;
      this.events.push(`state:${state}`);
      const completion = options.completion;
      if (completion === "entered") return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const entry: PendingTransformPlayback = {
          completion,
          resolve,
          reject,
          ...(options.signal ? { signal: options.signal } : {}),
        };
        const abortListener = options.signal
          ? () => {
              if (this.ignoreAbort) return;
              this.#pending = this.#pending.filter(
                (candidate) => candidate !== entry,
              );
              reject(
                options.signal?.reason instanceof Error
                  ? options.signal.reason
                  : new Error("test symbol playback aborted"),
              );
            }
          : undefined;
        if (abortListener) {
          Object.assign(entry, { abortListener });
          options.signal!.addEventListener("abort", abortListener, {
            once: true,
          });
        }
        this.#pending.push(entry);
      });
    };
    return {
      resetPresentationState: () => undefined,
      spinToScene: () => undefined,
      isAnticipationActive: () => this.anticipation,
      createCascadeDropPlan: () => ({ totalSeconds: 1 }),
      createCascadeDropdownPlan: () => ({ totalSeconds: 0 }),
      startCascadeDrop: () => undefined,
      getCurrentScene: () => this.scene,
      applyScene: (scene: readonly (readonly number[])[]) => {
        this.scene.splice(
          0,
          this.scene.length,
          ...scene.map((column) => [...column]),
        );
        return Object.freeze(scene.map(() => 0));
      },
      setVisibleSymbolPresentationValue: (
        x: number,
        y: number,
        value: number,
      ) => {
        this.events.push(`value:${x},${y}=${value}`);
      },
      setVisibleSymbolImageStringText: (
        x: number,
        y: number,
        _name: string,
        text: string,
      ) => {
        this.events.push(`text:${x},${y}=${text}`);
      },
      hasVisibleSymbolStateCapability: (
        _x: number,
        _y: number,
        state: string,
      ) => state !== this.missingState,
      requestVisibleSymbolStates: (
        _positions: readonly { x: number; y: number }[],
        state: string,
      ) => {
        this.#state = state;
        this.events.push(`state:${state}`);
      },
      playVisibleSymbolStates,
      playVisibleSymbolStateBatch: (
        requests: readonly VisibleSymbolStatePlaybackRequest[],
        options?: VisibleSymbolStatePlaybackBatchOptions,
      ) => {
        const started: Promise<void>[] = [];
        try {
          for (const request of requests) {
            const playback = playVisibleSymbolStates(
              request.positions,
              request.state,
              { ...request.options, signal: options?.signal },
            );
            void playback.catch(() => undefined);
            started.push(playback);
          }
        } catch (error) {
          return Promise.reject(error);
        }
        return Promise.all(started).then(() => undefined);
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
      replaceVisibleOccurrence: (options: {
        x: number;
        y: number;
        outputCode: number;
        outputPresentationValue: number | null;
      }) => {
        this.scene[options.x][options.y] = options.outputCode;
        this.events.push(
          `replace:${options.x},${options.y}:${options.outputCode}`,
        );
      },
      releaseVisibleSymbols: () => undefined,
      transferVisibleOccurrences: async (options: {
        transfers: readonly {
          source: { x: number; y: number };
          target: { x: number; y: number };
          sourceReplacementCode: number;
        }[];
        barrier: Promise<void>;
        waitForFrame: (
          update: (deltaSeconds: number) => boolean,
        ) => Promise<void>;
      }) => {
        this.events.push(`transfer:${options.transfers.length}`);
        await options.barrier;
        await options.waitForFrame(() => true);
        for (const transfer of options.transfers) {
          const sourceCode = this.scene[transfer.source.x]![transfer.source.y]!;
          this.scene[transfer.target.x]![transfer.target.y] = sourceCode;
          this.scene[transfer.source.x]![transfer.source.y] =
            transfer.sourceReplacementCode;
        }
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

  private completePlayback(
    completion: "once-complete" | "next-loop-complete",
  ): void {
    const completed = this.#pending.filter(
      (entry) => entry.completion === completion,
    );
    this.#pending = this.#pending.filter(
      (entry) => entry.completion !== completion,
    );
    for (const entry of completed) {
      if (entry.signal && entry.abortListener) {
        entry.signal.removeEventListener("abort", entry.abortListener);
      }
      entry.resolve();
    }
  }
}

function context(
  input: SlotOperationSnapshot,
  abort = new AbortController(),
): SlotOperationExecutionContext {
  return {
    input,
    signal: abort.signal,
    waitForFrame: async (update) => {
      if (!update(0.5)) throw new Error("test frame did not complete");
    },
    delay: async () => undefined,
  };
}

function createSnapshot(
  scene: readonly (readonly number[])[],
  transformedCode: number,
  transformedValue: number,
  wlValue: number,
): SlotOperationSnapshot {
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
  }) as SlotOperationSnapshot;
}

function createExactSnapshot(
  scene: readonly (readonly number[])[],
  values: readonly (readonly (number | null)[])[],
): SlotOperationSnapshot {
  return Object.freeze({
    scene,
    values,
  }) as SlotOperationSnapshot;
}

function createScene<T>(fill: T): T[][] {
  return Array.from({ length: 6 }, (_column, x) =>
    Array.from({ length: 9 }, (_row, y) =>
      x === 0 && y === 0 ? (0 as T) : x === 1 && y === 0 ? (7 as T) : fill,
    ),
  );
}
