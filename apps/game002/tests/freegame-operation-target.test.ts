import { describe, expect, it, vi } from "vitest";
import type {
  SlotOperationSnapshot,
  SlotOperationV2,
} from "@slotclientengine/gameframeworks";
import type {
  PreparedGridCellVisibleOccurrenceTransferBatch,
  PreparedVisibleOccurrenceReplacement,
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
  it("awaits trigger playback and cancels pending playback during cleanup", async () => {
    const fixture = createFixture();
    const payload = { kind: "trigger", positions: [POSITION] } as const;

    fixture.target.preflight(payload);
    start(fixture.target, payload);
    expect(fixture.target.update(0.1)).toEqual({ completed: false });

    fixture.runtime.resolvePlayback();
    await flushPlayback();
    expect(fixture.target.update(0.1)).toEqual({ completed: true });
    expect(fixture.runtime.requestVisibleSymbolStates).toHaveBeenCalledWith(
      payload.positions,
      "normal",
      "immediate",
    );

    start(fixture.target, payload);
    const signal = fixture.runtime.playbacks.at(-1)!.signal;
    fixture.target.cleanup();
    expect(signal.aborted).toBe(true);
    expect(fixture.target.update).toBeDefined();
  });

  it("surfaces rejected and synchronously failed symbol playback", async () => {
    const fixture = createFixture();
    const payload = { kind: "trigger", positions: [POSITION] } as const;

    start(fixture.target, payload);
    fixture.runtime.rejectPlayback(new Error("playback failed"));
    await flushPlayback();
    expect(() => fixture.target.update(0.1)).toThrow("playback failed");
    fixture.target.cleanup();

    fixture.runtime.playVisibleSymbolStates.mockImplementationOnce(() => {
      throw new Error("playback did not start");
    });
    start(fixture.target, payload);
    await flushPlayback();
    expect(() => fixture.target.update(0.1)).toThrow("playback did not start");
    fixture.target.cleanup();
  });

  it("runs AF and CO replacement transactions across awaited phases", async () => {
    const fixture = createFixture();
    const scene = createScene(CODES.CN);
    fixture.runtime.visibleScene = scene;
    const af: Game002FreeGameOperationPayload = {
      kind: "af",
      positions: [POSITION],
      addedFreeSpins: 3,
    };

    fixture.target.preflight(af);
    start(fixture.target, af, scene, scene, createValues(3));
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    fixture.runtime.resolvePlayback();
    await flushPlayback();
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    fixture.runtime.resolvePlayback();
    await flushPlayback();
    expect(fixture.target.update(0.1)).toEqual({ completed: true });
    expect(fixture.runtime.replacements[0]!.commit).toHaveBeenCalledOnce();
    fixture.target.cleanup();

    const co: Game002FreeGameOperationPayload = {
      kind: "co",
      mainPos: [POSITION],
      routes: [{ source: { x: 1, y: 0 }, target: POSITION }],
    };
    fixture.target.preflight(co);
    start(fixture.target, co, scene, scene, createValues(2));
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    fixture.runtime.resolveAllPlaybacks();
    await flushPlayback();
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    expect(fixture.runtime.transfer.start).toHaveBeenCalledOnce();
    expect(fixture.target.update(0.2)).toEqual({ completed: false });
    expect(fixture.runtime.transfer.setProgress).toHaveBeenCalledWith(0.4);
    fixture.runtime.resolveAllPlaybacks();
    await flushPlayback();
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    expect(fixture.target.update(0.2)).toEqual({ completed: true });
    expect(fixture.runtime.transfer.commit).toHaveBeenCalledOnce();
  });

  it("runs transition, selective spin, win and popup activities", async () => {
    const fixture = createFixture();
    const scene = createScene(CODES.CN);
    fixture.runtime.visibleScene = scene;

    fixture.target.preflight({ kind: "transition", mode: "FreeGame" });
    start(fixture.target, { kind: "transition", mode: "FreeGame" });
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    await flushPlayback();
    expect(fixture.target.update(0.1)).toEqual({ completed: true });
    expect(fixture.background.requestMode).toHaveBeenCalledWith("FreeGame");

    start(
      fixture.target,
      {
        kind: "spin",
        respinNumber: 1,
        remainingFreeSpins: 2,
        spinPositions: [POSITION],
        featurePositions: [],
      },
      scene,
      scene,
    );
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    fixture.runtime.spinning = false;
    expect(fixture.target.update(0.1)).toEqual({ completed: true });

    start(fixture.target, { kind: "win", groups: [] });
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    fixture.cascade.completed = true;
    expect(fixture.target.update(0.1)).toEqual({ completed: true });

    start(fixture.target, {
      kind: "popup",
      betAmountRaw: 1,
      winAmountRaw: 2,
    });
    expect(fixture.target.update(0.1)).toEqual({ completed: false });
    fixture.winAmount.complete = true;
    expect(fixture.target.update(0.1)).toEqual({ completed: true });
  });

  it("preflights required transition and symbol capabilities", () => {
    const fixture = createFixture();
    const missingTransition = createFixture({ transitionSupport: false });

    expect(() =>
      missingTransition.target.preflight({
        kind: "transition",
        mode: "FreeGame",
      }),
    ).toThrow(/mode transition support is missing/);
    fixture.runtime.config.symbolAnimationCapabilities.AF = [];
    expect(() =>
      fixture.target.preflight({
        kind: "af",
        positions: [POSITION],
        addedFreeSpins: 1,
      }),
    ).toThrow(/symbol AF has no "feature" state/);

    const missingRequestMode = createFixture();
    missingRequestMode.background.requestMode = undefined;
    expect(() =>
      missingRequestMode.target.preflight({
        kind: "transition",
        mode: "FreeGame",
      }),
    ).toThrow(/mode transition support is missing/);

    for (const [symbol, state] of [
      ["CO", "feature"],
      ["WL", "feature1"],
      ["WL", "feature2"],
      ["CN", "feature1"],
      ["CN", "feature2"],
    ] as const) {
      const capabilityFixture = createFixture();
      capabilityFixture.runtime.config.symbolAnimationCapabilities[symbol] =
        capabilityFixture.runtime.config.symbolAnimationCapabilities[
          symbol
        ].filter((candidate) => candidate !== state);
      expect(() =>
        capabilityFixture.target.preflight({
          kind: "co",
          mainPos: [POSITION],
          routes: [],
        }),
      ).toThrow(new RegExp(`symbol ${symbol} has no "${state}" state`));
    }
  });

  it("rejects starting a second operation while one is active", () => {
    const fixture = createFixture();
    const payload = { kind: "trigger", positions: [POSITION] } as const;
    expect(() => fixture.target.update(0.1)).toThrow(/payload is missing/);
    start(fixture.target, payload);
    expect(() => start(fixture.target, payload)).toThrow(/already active/);
    fixture.target.cleanup();
  });

  it("destroys partially prepared AF and CO resources", async () => {
    const afFixture = createFixture();
    const firstReplacement = {
      commit: vi.fn(),
      destroy: vi.fn(),
    } as unknown as PreparedVisibleOccurrenceReplacement;
    afFixture.runtime.prepareVisibleOccurrenceReplacement
      .mockReturnValueOnce(firstReplacement)
      .mockImplementationOnce(() => {
        throw new Error("AF prepare failed");
      });
    start(afFixture.target, {
      kind: "af",
      positions: [POSITION, { x: 1, y: 0 }],
      addedFreeSpins: 1,
    });
    afFixture.runtime.resolvePlayback();
    await flushPlayback();
    afFixture.target.update(0.1);
    afFixture.runtime.resolvePlayback();
    await flushPlayback();
    expect(() => afFixture.target.update(0.1)).toThrow("AF prepare failed");
    expect(firstReplacement.destroy).toHaveBeenCalledOnce();
    afFixture.target.cleanup();

    const coFixture = createFixture();
    coFixture.runtime.prepareVisibleOccurrenceTransferBatch.mockImplementationOnce(
      () => {
        throw new Error("CO transfer prepare failed");
      },
    );
    start(coFixture.target, {
      kind: "co",
      mainPos: [POSITION],
      routes: [],
    });
    coFixture.runtime.resolveAllPlaybacks();
    await flushPlayback();
    expect(() => coFixture.target.update(0.1)).toThrow(
      "CO transfer prepare failed",
    );
    expect(
      coFixture.runtime.replacements.at(-1)!.destroy,
    ).toHaveBeenCalledOnce();
    coFixture.target.cleanup();
  });

  it("surfaces asynchronous transition failure and accepts no-op preflight kinds", async () => {
    const fixture = createFixture();
    vi.mocked(fixture.background.prepareModeTransition!).mockRejectedValueOnce(
      "transition failed",
    );
    start(fixture.target, { kind: "transition", mode: "FreeGame" });
    await flushPlayback();
    expect(() => fixture.target.update(0.1)).toThrow("transition failed");
    fixture.target.cleanup();

    for (const payload of [
      {
        kind: "spin",
        respinNumber: 0,
        remainingFreeSpins: 0,
        spinPositions: [],
        featurePositions: [],
      },
      { kind: "win", groups: [] },
      { kind: "popup", betAmountRaw: 1, winAmountRaw: 1 },
    ] as const) {
      expect(() =>
        fixture.target.preflight(payload as Game002FreeGameOperationPayload),
      ).not.toThrow();
    }
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
  const target = new Game002FreeGameOperationTarget({
    runtime: runtime as unknown as Game002ReelRuntime,
    cascadePlayer: cascade as unknown as SymbolCascadePlayer,
    winAmountPlayer: winAmount as unknown as WinAmountAnimationPlayer,
    backgroundPlayer: background as Game002BackgroundPlayer,
  });
  return { target, runtime, cascade, winAmount, background };
}

function start(
  target: Game002FreeGameOperationTarget,
  payload: Game002FreeGameOperationPayload,
  inputScene = createScene(CODES.CN),
  outputScene = inputScene,
  outputValues = createValues(null),
): void {
  const mutation =
    payload.kind === "spin" || payload.kind === "af" || payload.kind === "co";
  const operation = {
    kind: `game002:freegame-${payload.kind}`,
    effect: mutation ? "state-mutation" : "presentation",
    ...(mutation
      ? {
          input: snapshot(inputScene, createValues(null)),
          output: snapshot(outputScene, outputValues),
          mutations: [],
        }
      : {}),
  } as unknown as SlotOperationV2;
  target.start(operation, payload);
}

function snapshot(
  scene: readonly (readonly number[])[],
  values: readonly (readonly (number | null)[])[],
): SlotOperationSnapshot {
  return Object.freeze({ scene, values, occurrences: Object.freeze([]) });
}

class FakeRuntime {
  config = {
    symbolAnimationCapabilities: {
      WL: ["win", "feature1", "feature2"],
      AF: ["feature", "change"],
      CO: ["feature"],
      CN: ["feature1", "feature2"],
    },
  };
  visibleScene = createScene(CODES.CN);
  spinning = false;
  playbacks: Array<{
    signal: AbortSignal;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  replacements: PreparedVisibleOccurrenceReplacement[] = [];
  transfer = createTransfer();
  update = vi.fn();
  requestVisibleSymbolStates = vi.fn();
  setVisibleSymbolImageStringText = vi.fn();
  startSelectiveSpin = vi.fn(() => {
    this.spinning = true;
    return {};
  });
  isSpinning = vi.fn(() => this.spinning);
  getVisualSnapshot = vi.fn(() => ({
    visible: true,
    visibleScene: this.visibleScene,
  }));
  prepareVisibleOccurrenceReplacement = vi.fn(() => {
    const replacement = {
      commit: vi.fn(),
      destroy: vi.fn(),
    } as unknown as PreparedVisibleOccurrenceReplacement;
    this.replacements.push(replacement);
    return replacement;
  });
  prepareVisibleOccurrenceTransferBatch = vi.fn(() => this.transfer);
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
    ) => {
      const started: Promise<void>[] = [];
      try {
        for (const request of requests) {
          const playback = this.playVisibleSymbolStates(
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
  );

  resolvePlayback(): void {
    this.playbacks.shift()?.resolve();
  }

  resolveAllPlaybacks(): void {
    for (const playback of this.playbacks.splice(0)) {
      if (!playback.signal.aborted) playback.resolve();
    }
  }

  rejectPlayback(error: Error): void {
    this.playbacks.pop()!.reject(error);
  }
}

function createTransfer(): PreparedGridCellVisibleOccurrenceTransferBatch {
  return {
    start: vi.fn(),
    setProgress: vi.fn(),
    commit: vi.fn(),
    destroy: vi.fn(),
  } as unknown as PreparedGridCellVisibleOccurrenceTransferBatch;
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
