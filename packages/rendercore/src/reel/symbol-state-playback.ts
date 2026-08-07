export function startSymbolStatePlaybackBatch(
  starters: readonly ((signal: AbortSignal) => Promise<void>)[],
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(asAbortError(signal.reason));
  }
  const controller = new AbortController();
  const abortListener = signal
    ? () => controller.abort(signal.reason)
    : undefined;
  signal?.addEventListener("abort", abortListener!, { once: true });

  const started: Promise<void>[] = [];
  try {
    for (const start of starters) {
      const promise = start(controller.signal);
      void promise.catch(() => undefined);
      started.push(promise);
    }
  } catch (error) {
    controller.abort(error);
    signal?.removeEventListener("abort", abortListener!);
    return Promise.reject(error);
  }

  return Promise.all(started)
    .then(() => undefined)
    .catch((error: unknown) => {
      controller.abort(error);
      throw error;
    })
    .finally(() => {
      signal?.removeEventListener("abort", abortListener!);
    });
}

function asAbortError(reason: unknown): Error {
  return reason instanceof Error
    ? reason
    : new Error("Symbol state playback batch was aborted.");
}
