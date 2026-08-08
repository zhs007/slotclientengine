import type { SlotOperationV2 } from "@slotclientengine/gameframeworks";
import type {
  SlotOperationExecutionContext,
  SymbolCascadePlayer,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import { describe, expect, it, vi } from "vitest";
import { Game002FreeGameOperationTarget } from "../src/freegame-operation-target.js";
import type { Game002FreeGameOperationPayload } from "../src/game002-operation-compiler.js";
import type { Game002ReelRuntime } from "../src/game002-reel-controller.js";
import type { Game002BackgroundPlayer } from "../src/game002-scene-runtime.js";
import {
  GAME002_REEL_COUNT,
  GAME002_VISIBLE_ROWS,
} from "../src/game-layout.js";

const CODES = Object.freeze({ AF: 10, CN: 11, CO: 12, BN: 13 });
const POSITION = Object.freeze({ x: 0, y: 0 });

describe("Game002FreeGameOperationTarget", () => {
  it("runs trigger as one awaited animation and mutation chain", async () => {
    const fixture = createFixture();
    const payload = { kind: "trigger", positions: [POSITION] } as const;

    const completion = fixture.target.start(
      presentationOperation("game002:freegame-trigger", payload),
      payload,
      fixture.context,
    );
    expect(fixture.runtime.playbacks).toHaveLength(1);
    fixture.runtime.resolveAllPlaybacks();
    await completion;

    expect(fixture.runtime.requestVisibleSymbolStates).toHaveBeenCalledWith(
      payload.positions,
      "normal",
      "immediate",
    );
  });

  it("propagates playback rejection and abort", async () => {
    const failed = createFixture();
    const payload = { kind: "trigger", positions: [POSITION] } as const;
    const failure = failed.target.start(
      presentationOperation("game002:freegame-trigger", payload),
      payload,
      failed.context,
    );
    failed.runtime.rejectPlayback(new Error("playback failed"));
    await expect(failure).rejects.toThrow("playback failed");

    const aborted = createFixture();
    const completion = aborted.target.start(
      presentationOperation("game002:freegame-trigger", payload),
      payload,
      aborted.context,
    );
    aborted.frames.abort();
    await expect(completion).rejects.toThrow("playback aborted");
  });

  it("animates AF and applies each operation mutation locally", async () => {
    const fixture = createFixture();
    const positions = [POSITION, { x: 1, y: 0 }] as const;
    const inputScene = createScene(CODES.CN, [
      { ...POSITION, code: CODES.AF },
      { x: 1, y: 0, code: CODES.AF },
    ]);
    const outputScene = createScene(CODES.CN);
    const payload: Game002FreeGameOperationPayload = {
      kind: "af",
      positions,
      addedFreeSpins: 3,
    };
    const operation = mutationOperation(
      "game002:freegame-af",
      payload,
      inputScene,
      outputScene,
      createValues(3),
    );

    const completion = fixture.target.start(
      operation,
      payload,
      fixture.context,
    );
    fixture.runtime.resolveAllPlaybacks();
    await flushPlayback();
    fixture.runtime.resolveAllPlaybacks();
    await completion;

    expect(
      fixture.runtime.setVisibleSymbolImageStringText,
    ).toHaveBeenCalledTimes(2);
    expect(fixture.runtime.replaceVisibleOccurrence).toHaveBeenCalledTimes(2);
    expect(fixture.runtime.replaceVisibleOccurrence).toHaveBeenNthCalledWith(
      1,
      {
        x: 0,
        y: 0,
        expectedCode: CODES.AF,
        outputCode: CODES.CN,
        outputPresentationValue: 3,
      },
    );
  });

  it("runs CO playback, transfer barrier and local main-position mutation", async () => {
    const fixture = createFixture();
    const source = { x: 1, y: 0 } as const;
    const target = { x: 2, y: 0 } as const;
    const inputScene = createScene(CODES.CN, [
      { ...POSITION, code: CODES.CO },
      { ...target, code: CODES.BN },
    ]);
    const outputScene = createScene(CODES.CN, [{ ...source, code: CODES.BN }]);
    const payload: Game002FreeGameOperationPayload = {
      kind: "co",
      mainPos: [POSITION],
      routes: [{ source, target }],
    };
    const operation = mutationOperation(
      "game002:freegame-co",
      payload,
      inputScene,
      outputScene,
      createValues(2),
    );

    const completion = fixture.target.start(
      operation,
      payload,
      fixture.context,
    );
    fixture.runtime.resolveAllPlaybacks();
    await flushPlayback();
    fixture.runtime.resolveAllPlaybacks();
    await flushPlayback();
    fixture.frames.frame(0.5);
    await completion;

    expect(fixture.runtime.transferVisibleOccurrences).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 0.5,
        transfers: [
          {
            source,
            target,
            expectedSourceCode: CODES.CN,
            expectedTargetCode: CODES.BN,
            sourceReplacementCode: CODES.BN,
            sourceReplacementPresentationValue: null,
          },
        ],
      }),
    );
    expect(fixture.runtime.replaceVisibleOccurrence).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      expectedCode: CODES.CO,
      outputCode: CODES.CN,
      outputPresentationValue: 2,
    });
  });

  it("runs transition, spin, win and popup with frame promises", async () => {
    const fixture = createFixture();
    const transition = {
      kind: "transition",
      mode: "FreeGame",
    } as const;
    await fixture.target.start(
      presentationOperation("game002:freegame-enter", transition),
      transition,
      fixture.context,
    );
    expect(fixture.background.requestMode).toHaveBeenCalledWith("FreeGame");

    const scene = createScene(CODES.CN);
    const spinPayload: Game002FreeGameOperationPayload = {
      kind: "spin",
      respinNumber: 1,
      remainingFreeSpins: 2,
      spinPositions: [POSITION],
      featurePositions: [],
    };
    const spin = fixture.target.start(
      mutationOperation(
        "game002:freegame-spin",
        spinPayload,
        scene,
        scene,
        createValues(null),
      ),
      spinPayload,
      fixture.context,
    );
    fixture.runtime.spinning = false;
    fixture.frames.frame(0.1);
    await spin;

    const winPayload = { kind: "win", groups: [] } as const;
    const win = fixture.target.start(
      presentationOperation("game002:freegame-win", winPayload),
      winPayload,
      fixture.context,
    );
    fixture.cascade.completed = true;
    fixture.frames.frame(0.1);
    await win;

    const popupPayload = {
      kind: "popup",
      betAmountRaw: 1,
      winAmountRaw: 2,
    } as const;
    const popup = fixture.target.start(
      presentationOperation("game002:freegame-popup", popupPayload),
      popupPayload,
      fixture.context,
    );
    fixture.winAmount.complete = true;
    fixture.frames.frame(0.1);
    await popup;
  });

  it("checks transition support and mutation effect only when executed", async () => {
    const missingTransition = createFixture({ transitionSupport: false });
    const transition = {
      kind: "transition",
      mode: "FreeGame",
    } as const;
    await expect(
      missingTransition.target.start(
        presentationOperation("game002:freegame-enter", transition),
        transition,
        missingTransition.context,
      ),
    ).rejects.toThrow(/mode transition support is missing/);

    const fixture = createFixture();
    const spin = {
      kind: "spin",
      respinNumber: 1,
      remainingFreeSpins: 0,
      spinPositions: [],
      featurePositions: [],
    } as const;
    await expect(
      fixture.target.start(
        presentationOperation("game002:freegame-spin", spin),
        spin,
        fixture.context,
      ),
    ).rejects.toThrow(/must be a state-mutation operation/);
  });

  it("cleans active presentation owners without operation destroy hooks", () => {
    const fixture = createFixture();
    fixture.target.cleanup();
    expect(fixture.cascade.clear).toHaveBeenCalledOnce();
    expect(fixture.winAmount.dismissImmediately).toHaveBeenCalledOnce();
  });
});

function createFixture(options: { transitionSupport?: boolean } = {}) {
  const runtime = new FakeRuntime();
  const cascade = {
    completed: false,
    prepare: vi.fn(() => ({})),
    start: vi.fn(),
    update: vi.fn(() => ({ completed: cascade.completed })),
    clear: vi.fn(),
  };
  const winAmount = {
    complete: false,
    start: vi.fn(),
    update: vi.fn(() => ({
      completed: winAmount.complete,
      phase: winAmount.complete ? "complete" : "counting",
      displayedAmountRaw: 0,
    })),
    dismissImmediately: vi.fn(),
  };
  const background: Partial<Game002BackgroundPlayer> = {
    prepareModeTransition:
      options.transitionSupport === false ? undefined : vi.fn(async () => {}),
    requestMode:
      options.transitionSupport === false ? undefined : vi.fn(async () => {}),
  };
  const frames = new TestFrameContext();
  const target = new Game002FreeGameOperationTarget({
    runtime: runtime as unknown as Game002ReelRuntime,
    cascadePlayer: cascade as unknown as SymbolCascadePlayer,
    winAmountPlayer: winAmount as unknown as WinAmountAnimationPlayer,
    backgroundPlayer: background as Game002BackgroundPlayer,
  });
  return {
    target,
    runtime,
    cascade,
    winAmount,
    background,
    frames,
    context: frames.context,
  };
}

class TestFrameContext {
  readonly #abort = new AbortController();
  readonly #waiters: Array<{
    update: (deltaSeconds: number) => boolean;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  readonly context: SlotOperationExecutionContext = {
    signal: this.#abort.signal,
    waitForFrame: (update) =>
      new Promise<void>((resolve, reject) => {
        this.#waiters.push({ update, resolve, reject });
      }),
    delay: async () => undefined,
  };

  frame(deltaSeconds: number): void {
    for (const waiter of this.#waiters.splice(0)) {
      if (waiter.update(deltaSeconds)) waiter.resolve();
      else this.#waiters.push(waiter);
    }
  }

  abort(): void {
    this.#abort.abort();
    for (const waiter of this.#waiters.splice(0))
      waiter.reject(new Error("frame wait aborted"));
  }
}

class FakeRuntime {
  spinning = false;
  playbacks: Array<{
    signal: AbortSignal;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  requestVisibleSymbolStates = vi.fn();
  setVisibleSymbolImageStringText = vi.fn();
  replaceVisibleOccurrence = vi.fn();
  startSelectiveSpin = vi.fn(() => {
    this.spinning = true;
    return {};
  });
  isSpinning = vi.fn(() => this.spinning);
  transferVisibleOccurrences = vi.fn(
    async (options: {
      barrier?: Promise<void>;
      waitForFrame: (
        update: (deltaSeconds: number) => boolean,
      ) => Promise<void>;
    }) => {
      await options.barrier;
      await options.waitForFrame(() => true);
    },
  );
  playVisibleSymbolStates = vi.fn(
    (
      _positions: readonly { readonly x: number; readonly y: number }[],
      _state: string,
      options: { readonly signal?: AbortSignal },
    ) =>
      new Promise<void>((resolve, reject) => {
        const signal = options.signal!;
        signal.addEventListener(
          "abort",
          () => reject(new Error("playback aborted")),
          { once: true },
        );
        this.playbacks.push({ signal, resolve, reject });
      }),
  );
  playVisibleSymbolStateBatch = vi.fn(
    (
      requests: readonly Readonly<{
        positions: readonly { readonly x: number; readonly y: number }[];
        state: string;
        options: Readonly<{ completion: string }>;
      }>[],
      options?: Readonly<{ signal?: AbortSignal }>,
    ) =>
      Promise.all(
        requests.map((request) =>
          this.playVisibleSymbolStates(request.positions, request.state, {
            ...request.options,
            signal: options?.signal,
          }),
        ),
      ).then(() => undefined),
  );

  resolveAllPlaybacks(): void {
    for (const playback of this.playbacks.splice(0))
      if (!playback.signal.aborted) playback.resolve();
  }

  rejectPlayback(error: Error): void {
    this.playbacks.pop()!.reject(error);
  }
}

function presentationOperation(
  kind: string,
  payload: Game002FreeGameOperationPayload,
): SlotOperationV2 {
  return {
    kind,
    effect: "presentation",
    payload,
  } as unknown as SlotOperationV2;
}

function mutationOperation(
  kind: string,
  payload: Game002FreeGameOperationPayload,
  inputScene: readonly (readonly number[])[],
  outputScene: readonly (readonly number[])[],
  outputValues: readonly (readonly (number | null)[])[],
): SlotOperationV2 {
  return {
    kind,
    effect: "state-mutation",
    payload,
    input: { scene: inputScene, values: createValues(null) },
    output: { scene: outputScene, values: outputValues },
  } as unknown as SlotOperationV2;
}

function createScene(
  code: number,
  overrides: readonly {
    readonly x: number;
    readonly y: number;
    readonly code: number;
  }[] = [],
): readonly (readonly number[])[] {
  const scene = Array.from({ length: GAME002_REEL_COUNT }, () =>
    Array.from({ length: GAME002_VISIBLE_ROWS }, () => code),
  );
  for (const override of overrides)
    scene[override.x]![override.y] = override.code;
  return scene;
}

function createValues(
  value: number | null,
): readonly (readonly (number | null)[])[] {
  return Array.from({ length: GAME002_REEL_COUNT }, () =>
    Array.from({ length: GAME002_VISIBLE_ROWS }, () => value),
  );
}

async function flushPlayback(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
