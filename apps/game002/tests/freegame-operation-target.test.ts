import { describe, expect, it, vi } from "vitest";
import type {
  SlotOperationExecutionContext,
  SymbolCascadePlayer,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
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

    const completion = fixture.target.start(payload, fixture.context);
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
    const failure = failed.target.start(
      { kind: "trigger", positions: [POSITION] },
      failed.context,
    );
    failed.runtime.rejectPlayback(new Error("playback failed"));
    await expect(failure).rejects.toThrow("playback failed");

    const aborted = createFixture();
    const completion = aborted.target.start(
      { kind: "trigger", positions: [POSITION] },
      aborted.context,
    );
    aborted.frames.abort();
    await expect(completion).rejects.toThrow("playback aborted");
  });

  it("animates AF and replaces each affected occurrence locally", async () => {
    const fixture = createFixture();
    const scene = createScene(CODES.CN);
    const payload: Game002FreeGameOperationPayload = {
      kind: "af",
      af: {
        positions: [POSITION, { x: 1, y: 0 }],
        addedFreeSpins: 3,
        outputScene: scene,
        outputValues: createValues(3),
      },
    };

    const completion = fixture.target.start(payload, fixture.context);
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

  it("runs CO feature playback, movement barrier and local replacements", async () => {
    const fixture = createFixture();
    const payload: Game002FreeGameOperationPayload = {
      kind: "co",
      co: {
        coPositions: [POSITION],
        sourcePositions: [{ x: 1, y: 0 }],
        transfers: [
          {
            source: { x: 1, y: 0 },
            target: POSITION,
            sourceCode: CODES.CN,
            sourceValue: 2,
            targetCode: CODES.CO,
          },
        ],
        outputScene: createScene(CODES.CN),
        outputValues: createValues(2),
      },
    };

    const completion = fixture.target.start(payload, fixture.context);
    fixture.runtime.resolveAllPlaybacks();
    await flushPlayback();
    fixture.runtime.resolveAllPlaybacks();
    await flushPlayback();
    fixture.frames.frame(0.5);
    await completion;

    expect(fixture.runtime.transferVisibleOccurrences).toHaveBeenCalledOnce();
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
    const scene = createScene(CODES.CN);

    await fixture.target.start(
      { kind: "transition", mode: "FreeGame" },
      fixture.context,
    );
    expect(fixture.background.requestMode).toHaveBeenCalledWith("FreeGame");

    const spin = fixture.target.start(
      {
        kind: "spin",
        spin: {
          inputScene: scene,
          inputValues: createValues(null),
          spinScene: scene,
          spinValues: createValues(null),
          respinNumber: 1,
          remainingFreeSpins: 2,
          spinPositions: [POSITION],
          featurePositions: [],
          outputScene: scene,
          outputValues: createValues(null),
        },
      },
      fixture.context,
    );
    fixture.runtime.spinning = false;
    fixture.frames.frame(0.1);
    await spin;

    const win = fixture.target.start(
      { kind: "win", groups: [] },
      fixture.context,
    );
    fixture.cascade.completed = true;
    fixture.frames.frame(0.1);
    await win;

    const popup = fixture.target.start(
      { kind: "popup", betAmountRaw: 1, winAmountRaw: 2 },
      fixture.context,
    );
    fixture.winAmount.complete = true;
    fixture.frames.frame(0.1);
    await popup;
  });

  it("checks transition support only when that operation executes", async () => {
    const fixture = createFixture({ transitionSupport: false });
    await expect(
      fixture.target.start(
        { kind: "transition", mode: "FreeGame" },
        fixture.context,
      ),
    ).rejects.toThrow(/mode transition support is missing/);
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
    codes: CODES,
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

function createScene(code: number): readonly (readonly number[])[] {
  return Array.from({ length: GAME002_REEL_COUNT }, () =>
    Array.from({ length: GAME002_VISIBLE_ROWS }, () => code),
  );
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
