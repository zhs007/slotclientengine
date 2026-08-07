import { describe, expect, it, vi } from "vitest";
import {
  createPresentationTransactionRunner,
  type PresentationTransactionCommand,
} from "../../src/slot-operation/index.js";

function immutableProgram(commands: readonly PresentationTransactionCommand[]) {
  return Object.freeze({ commands: Object.freeze(commands) });
}

describe("presentation transaction runner", () => {
  it("preflights the complete program before starting playback", async () => {
    const started = vi.fn();
    const runner = createPresentationTransactionRunner();
    const result = runner.start(
      immutableProgram([
        { kind: "await", preflight: vi.fn(), start: started },
        {
          kind: "commit",
          preflight: () => {
            throw new Error("missing capability");
          },
          prepare: vi.fn(),
        },
      ]),
    );
    await expect(result).rejects.toThrow("missing capability");
    expect(started).not.toHaveBeenCalled();
  });

  it("runs await, commit and ticker-driven progress in strict order", async () => {
    const events: string[] = [];
    let resolvePlayback!: () => void;
    const playback = new Promise<void>((resolve) => {
      resolvePlayback = resolve;
    });
    const runner = createPresentationTransactionRunner();
    const completion = runner.start(
      immutableProgram([
        {
          kind: "await",
          preflight: () => events.push("preflight-await"),
          start: () => {
            events.push("await");
            return playback;
          },
        },
        {
          kind: "commit",
          preflight: () => events.push("preflight-commit"),
          prepare: () => ({
            commit: () => events.push("commit"),
            rollback: () => events.push("rollback"),
            destroy: () => events.push("destroy-commit"),
          }),
        },
        {
          kind: "progress",
          durationSeconds: 2,
          preflight: () => events.push("preflight-progress"),
          prepare: () => ({
            start: () => events.push("progress-start"),
            setProgress: (value) => events.push(`progress:${value}`),
            commit: () => events.push("progress-commit"),
            rollback: () => events.push("progress-rollback"),
            destroy: () => events.push("destroy-progress"),
          }),
        },
      ]),
    );
    expect(events).toEqual([
      "preflight-await",
      "preflight-commit",
      "preflight-progress",
      "await",
    ]);
    resolvePlayback();
    await Promise.resolve();
    expect(events).toContain("commit");
    runner.update(1);
    runner.update(1);
    await expect(completion).resolves.toBeUndefined();
    expect(events).toEqual([
      "preflight-await",
      "preflight-commit",
      "preflight-progress",
      "await",
      "commit",
      "destroy-commit",
      "progress-start",
      "progress:0",
      "progress:0.5",
      "progress:1",
      "progress-commit",
      "destroy-progress",
    ]);
  });

  it("rolls back the current uncommitted transaction on failure", async () => {
    const events: string[] = [];
    const runner = createPresentationTransactionRunner();
    const completion = runner.start(
      immutableProgram([
        {
          kind: "progress",
          durationSeconds: 1,
          preflight: () => undefined,
          prepare: () => ({
            start: () => events.push("start"),
            setProgress: (progress) => {
              if (progress > 0) throw new Error("progress failed");
            },
            commit: () => events.push("commit"),
            rollback: () => events.push("rollback"),
            destroy: () => events.push("destroy"),
          }),
        },
      ]),
    );
    runner.update(0.5);
    await expect(completion).rejects.toThrow("progress failed");
    expect(events).toEqual(["start", "rollback", "destroy"]);
  });

  it("holds progress before commit until its parallel barrier settles", async () => {
    const progress: number[] = [];
    let resolveBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      resolveBarrier = resolve;
    });
    const commit = vi.fn();
    const runner = createPresentationTransactionRunner();
    const completion = runner.start(
      immutableProgram([
        {
          kind: "progress",
          durationSeconds: 1,
          preflight: () => undefined,
          await: () => barrier,
          prepare: () => ({
            start: () => undefined,
            setProgress: (value) => progress.push(value),
            commit,
            rollback: () => undefined,
            destroy: () => undefined,
          }),
        },
      ]),
    );

    runner.update(2);
    expect(progress).toEqual([0, 0.9]);
    expect(commit).not.toHaveBeenCalled();

    resolveBarrier();
    await Promise.resolve();
    runner.update(0);
    await expect(completion).resolves.toBeUndefined();
    expect(progress).toEqual([0, 0.9, 1]);
    expect(commit).toHaveBeenCalledOnce();
  });

  it("aborts active playback and ignores late settlement", async () => {
    let signal!: AbortSignal;
    let resolvePlayback!: () => void;
    const playback = new Promise<void>((resolve) => {
      resolvePlayback = resolve;
    });
    const runner = createPresentationTransactionRunner();
    const completion = runner.start(
      immutableProgram([
        {
          kind: "await",
          preflight: () => undefined,
          start: (received) => {
            signal = received;
            return playback;
          },
        },
      ]),
    );
    runner.cleanup("next-program");
    expect(signal.aborted).toBe(true);
    await expect(completion).rejects.toThrow("next-program cleanup");
    resolvePlayback();
    await Promise.resolve();
    expect(runner.getSnapshot().phase).toBe("idle");
  });

  it("destroys idempotently and rejects future programs", async () => {
    const runner = createPresentationTransactionRunner();
    runner.destroy();
    runner.destroy();
    await expect(runner.start(immutableProgram([]))).rejects.toThrow(
      "destroyed",
    );
  });
});
