import { describe, expect, it } from "vitest";
import type { SlotOperationSnapshot } from "@slotclientengine/gameframeworks";
import type { SymbolCascadePlayer } from "@slotclientengine/rendercore";
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
    const wild = operation("game002:wild-multiplier", input, wildOutput, {
      type: "driven-change",
      mainPos: [{ x: 1, y: 0 }],
      pos: [{ x: 0, y: 0 }],
    });

    target.startAtomicTransform(wild);
    expect(runtime.events).toEqual(["state:multStart"]);
    runtime.advanceOnce();
    await flushPlayback();
    expect(runtime.events).toContain("state:multIdle");
    runtime.advanceLoop();
    await flushPlayback();
    expect(target.updateAtomicTransform(wild).completed).toBe(true);

    const outputScene = createScene(1);
    outputScene[1][0] = 8;
    const wmOutput = createSnapshot(outputScene, 8, 9, 5);
    const wm = operation("game002:wm-to-cn", wildOutput, wmOutput, {
      type: "change",
      pos: [{ x: 1, y: 0 }],
    });
    target.startAtomicTransform(wm);
    runtime.advanceOnce();
    await flushPlayback();
    expect(runtime.events.at(-1)).toBe("state:change");
    runtime.advanceOnce();
    await flushPlayback();
    expect(target.updateAtomicTransform(wm).completed).toBe(true);
    expect(runtime.scene[1][0]).toBe(8);
  });

  it("plays WL increment only from its minimal payload", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const input = createSnapshot(createScene(1), 7, 3, 2);
    const output = createSnapshot(createScene(1), 7, 3, 3);
    const operationValue = operation("game002:wl-increment", input, output, {
      type: "change",
      pos: [{ x: 0, y: 0 }],
    });

    target.startAtomicTransform(operationValue);
    expect(runtime.events).toContain("text:0,0=x3");
    runtime.advanceOnce();
    await flushPlayback();
    expect(target.updateAtomicTransform(operationValue).completed).toBe(true);
  });

  it("aborts playback without restoring a prior snapshot", async () => {
    const runtime = new TransformRuntime();
    const target = createTarget(runtime);
    const input = createSnapshot(createScene(1), 7, 3, 2);
    const output = createSnapshot(createScene(1), 7, 3, 5);
    const operationValue = operation("game002:wild-multiplier", input, output, {
      type: "driven-change",
      mainPos: [{ x: 1, y: 0 }],
      pos: [{ x: 0, y: 0 }],
    });
    target.startAtomicTransform(operationValue);
    const signal = runtime.pendingSignals[0]!;
    target.cleanup();
    expect(signal.aborted).toBe(true);
    await flushPlayback();
    expect(runtime.scene).toEqual(input.scene);
  });

  it("rejects missing animation capability before presentation mutation", () => {
    const runtime = new TransformRuntime();
    runtime.missingState = "change";
    const target = createTarget(runtime);
    const input = createSnapshot(createScene(1), 7, 3, 2);
    const outputScene = createScene(1);
    outputScene[1][0] = 8;
    const output = createSnapshot(outputScene, 8, 9, 2);
    const operationValue = operation("game002:wm-to-cn", input, output, {
      type: "change",
      pos: [{ x: 1, y: 0 }],
    });
    expect(() => target.preflightAtomicTransform(operationValue)).toThrow(
      /no "change"/,
    );
    expect(runtime.events).toEqual([]);
  });
});

function createTarget(runtime: TransformRuntime): Game002RoundTarget {
  return new Game002RoundTarget({
    runtime: runtime.asRuntime(),
    cascadePlayer: { clear: () => undefined } as SymbolCascadePlayer,
    winAmountPlayer: {
      dismissImmediately: () => undefined,
    } as WinAmountAnimationPlayer,
    wlSymbolCode: 0,
    wmSymbolCode: 7,
    cmSymbolCode: 9,
  });
}

function operation(
  kind: string,
  input: SlotOperationSnapshot,
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
    input,
    output,
    mutations: Object.freeze([]),
    requiredCapabilities: Object.freeze([kind]),
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

function createSnapshot(
  scene: readonly (readonly number[])[],
  transformedCode: number,
  transformedValue: number,
  wlValue: number,
): SlotOperationSnapshot {
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
  }) as SlotOperationSnapshot;
}

function createScene<T>(fill: T): T[][] {
  return Array.from({ length: 6 }, (_column, x) =>
    Array.from({ length: 9 }, (_row, y) =>
      x === 0 && y === 0 ? (0 as T) : x === 1 && y === 0 ? (7 as T) : fill,
    ),
  );
}
