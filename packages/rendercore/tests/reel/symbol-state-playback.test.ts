import { describe, expect, it } from "vitest";
import { startSymbolStatePlaybackBatch } from "../../src/reel/symbol-state-playback.js";

describe("symbol state playback batch", () => {
  it("resolves all starters and rejects synchronous and asynchronous failures", async () => {
    await expect(
      startSymbolStatePlaybackBatch([
        async () => undefined,
        async () => undefined,
      ]),
    ).resolves.toBeUndefined();

    const synchronous = new Error("synchronous");
    await expect(
      startSymbolStatePlaybackBatch([
        () => {
          throw synchronous;
        },
      ]),
    ).rejects.toBe(synchronous);

    const asynchronous = new Error("asynchronous");
    await expect(
      startSymbolStatePlaybackBatch([async () => Promise.reject(asynchronous)]),
    ).rejects.toBe(asynchronous);
  });

  it("honors caller aborts before and during playback", async () => {
    const preAborted = new AbortController();
    preAborted.abort("stopped");
    await expect(
      startSymbolStatePlaybackBatch([], preAborted.signal),
    ).rejects.toThrow(/was aborted/);

    const reason = new Error("caller aborted");
    const controller = new AbortController();
    const running = startSymbolStatePlaybackBatch(
      [
        (signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      ],
      controller.signal,
    );
    controller.abort(reason);
    await expect(running).rejects.toBe(reason);

    const alreadyFailed = new AbortController();
    alreadyFailed.abort(reason);
    await expect(
      startSymbolStatePlaybackBatch([], alreadyFailed.signal),
    ).rejects.toBe(reason);
  });
});
