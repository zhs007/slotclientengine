import { describe, expect, it, vi } from "vitest";
import { createGame002v2PerformanceTrace } from "../src/performance-trace.js";

describe("game002v2 performance trace", () => {
  it("emits one structured, additive record per completed trace", () => {
    const log = vi.fn();
    let now = 0;
    const trace = createGame002v2PerformanceTrace(log, () => (now += 5));
    trace.markStartup("entering-game");
    trace.observer.onEvent({
      traceKind: "startup",
      traceId: 0,
      phase: "framework-created",
      atMs: (now += 5),
    });
    trace.markStartup("first-scene-paint");
    trace.observer.onEvent({
      traceKind: "startup",
      traceId: 0,
      phase: "connect-complete",
      atMs: (now += 5),
    });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[1]).toMatchObject({
      traceKind: "startup",
      traceId: 0,
      status: "complete",
      totalMs: 15,
    });
    expect(log.mock.calls[0]?.[1].phases).toEqual([
      { phase: "entering-game", atMs: 5, durationMs: 0, elapsedMs: 0 },
      {
        phase: "framework-created",
        atMs: 10,
        durationMs: 5,
        elapsedMs: 5,
      },
      {
        phase: "first-scene-paint",
        atMs: 15,
        durationMs: 5,
        elapsedMs: 10,
      },
      {
        phase: "connect-complete",
        atMs: 20,
        durationMs: 5,
        elapsedMs: 15,
      },
    ]);
  });
});
