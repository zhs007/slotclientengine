import type {
  SlotGamePerformanceEvent,
  SlotGamePerformanceObserver,
} from "@slotclientengine/gameframeworks";

type ExtraStartupPhase = "entering-game" | "first-scene-paint";
type ExtraSpinPhase =
  | "plan-start"
  | "spin-call-complete"
  | "first-cell-start"
  | "first-cell-paint";

interface TraceRecord {
  readonly traceKind: "startup" | "spin";
  readonly traceId: number;
  readonly phases: Map<string, number>;
  logged: boolean;
}

export interface Game002v2PerformanceTrace {
  readonly observer: SlotGamePerformanceObserver;
  markStartup(phase: ExtraStartupPhase): void;
  markActiveSpin(phase: ExtraSpinPhase): void;
}

export function createGame002v2PerformanceTrace(
  log: (label: string, value: unknown) => void = console.info,
  now: () => number = () => performance.now(),
): Game002v2PerformanceTrace {
  const startup = createRecord("startup", 0);
  const spins = new Map<number, TraceRecord>();
  let activeSpinId: number | null = null;

  const observer: SlotGamePerformanceObserver = Object.freeze({
    now,
    onEvent(event: SlotGamePerformanceEvent): void {
      const record =
        event.traceKind === "startup"
          ? startup
          : (spins.get(event.traceId) ??
            createAndStoreSpin(spins, event.traceId));
      record.phases.set(event.phase, event.atMs);
      if (event.traceKind === "spin" && event.phase === "adapter-play-start")
        activeSpinId = event.traceId;
      if (event.phase === "failed") emit(record, "failed", log);
      if (event.phase === "destroyed") emit(record, "destroyed", log);
      if (event.phase === "connect-complete") emit(record, "complete", log);
      if (event.phase === "spin-complete") emit(record, "complete", log);
    },
  });

  return Object.freeze({
    observer,
    markStartup(phase: ExtraStartupPhase): void {
      startup.phases.set(phase, now());
    },
    markActiveSpin(phase: ExtraSpinPhase): void {
      if (activeSpinId === null) return;
      const record = spins.get(activeSpinId);
      if (!record || record.logged) return;
      if (!record.phases.has(phase)) record.phases.set(phase, now());
    },
  });
}

function createRecord(
  traceKind: "startup" | "spin",
  traceId: number,
): TraceRecord {
  return { traceKind, traceId, phases: new Map(), logged: false };
}

function createAndStoreSpin(
  spins: Map<number, TraceRecord>,
  traceId: number,
): TraceRecord {
  const record = createRecord("spin", traceId);
  spins.set(traceId, record);
  return record;
}

function emit(
  record: TraceRecord,
  status: "complete" | "failed" | "destroyed",
  log: (label: string, value: unknown) => void,
): void {
  if (record.logged) return;
  record.logged = true;
  const ordered = [...record.phases.entries()].sort(
    ([, left], [, right]) => left - right,
  );
  const startedAtMs = ordered[0]?.[1] ?? 0;
  const phases = ordered.map(([phase, atMs], index) => {
    const previousAtMs = ordered[index - 1]?.[1] ?? startedAtMs;
    return Object.freeze({
      phase,
      atMs: roundMs(atMs),
      durationMs: roundMs(atMs - previousAtMs),
      elapsedMs: roundMs(atMs - startedAtMs),
    });
  });
  log(
    "[game002v2 timing]",
    Object.freeze({
      traceKind: record.traceKind,
      traceId: record.traceId,
      status,
      totalMs: roundMs((ordered.at(-1)?.[1] ?? startedAtMs) - startedAtMs),
      phases: Object.freeze(phases),
    }),
  );
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
