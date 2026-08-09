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
    expect(log.mock.calls[0]?.[0]).toBe(
      [
        "[game002v2 timing] startup#0 complete total=15ms | largest=entering-game -> framework-created (5ms)",
        "  duration\telapsed\tphase",
        "  +0ms\t=0ms\tentering-game",
        "  +5ms\t=5ms\tframework-created",
        "  +5ms\t=10ms\tfirst-scene-paint",
        "  +5ms\t=15ms\tconnect-complete",
      ].join("\n"),
    );
    expect(log.mock.calls[0]?.[1]).toMatchObject({
      traceKind: "startup",
      traceId: 0,
      status: "complete",
      totalMs: 15,
      clickToFirstCellStartMs: null,
      clickToFirstCellPaintMs: null,
      largestBeforeFirstCellStart: null,
      largestPhase: {
        fromPhase: "entering-game",
        toPhase: "framework-created",
        durationMs: 5,
      },
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

  it("summarizes click-to-first-cell timing for a spin", () => {
    const log = vi.fn();
    let now = 120;
    const trace = createGame002v2PerformanceTrace(log, () => (now += 1));
    const event = (
      phase: Parameters<typeof trace.observer.onEvent>[0]["phase"],
      atMs: number,
    ) =>
      trace.observer.onEvent({
        traceKind: "spin",
        traceId: 1,
        phase,
        atMs,
      });

    event("command-received", 100);
    event("spin-start", 101);
    event("request-send", 102);
    event("response-received", 118);
    event("adapter-play-start", 120);
    trace.markActiveSpin("plan-start");
    trace.markActiveSpin("spin-call-complete");
    trace.markActiveSpin("first-cell-start");
    trace.markActiveSpin("first-cell-paint");
    event("adapter-play-complete", 300);
    event("spin-complete", 310);

    expect(log.mock.calls[0]?.[0]).toContain("click-to-first-cell-start=23ms");
    expect(log.mock.calls[0]?.[1]).toMatchObject({
      clickToFirstCellStartMs: 23,
      clickToFirstCellPaintMs: 24,
      largestBeforeFirstCellStart: {
        fromPhase: "request-send",
        toPhase: "response-received",
        durationMs: 16,
      },
      largestPhase: {
        fromPhase: "first-cell-paint",
        toPhase: "adapter-play-complete",
        durationMs: 176,
      },
    });
  });
});
