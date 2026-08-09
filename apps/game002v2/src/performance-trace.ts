import type {
  SlotGamePerformanceEvent,
  SlotGamePerformanceObserver,
} from "@slotclientengine/gameframeworks";

type ExtraStartupPhase =
  | "entering-game"
  | "runtime-init-start"
  | "runtime-init-complete"
  | "initial-scene-committed"
  | "runtime-attached"
  | "first-scene-paint";
type ExtraSpinPhase =
  | "plan-start"
  | "spin-call-complete"
  | "reel-presentation-complete"
  | "feature-states-complete"
  | "wins-complete"
  | "remove-complete"
  | "first-cell-start"
  | "first-cell-paint";

interface TraceRecord {
  readonly traceKind: "startup" | "spin";
  readonly traceId: number;
  readonly phases: Map<string, number>;
  logged: boolean;
}

interface TracePhaseOutput {
  readonly phase: string;
  readonly atMs: number;
  readonly durationMs: number;
  readonly elapsedMs: number;
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
      if (event.traceKind === "spin" && event.phase === "spin-start")
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
  const totalMs = roundMs((ordered.at(-1)?.[1] ?? startedAtMs) - startedAtMs);
  const clickToFirstCellStartMs = durationBetween(
    ordered,
    "command-received",
    "first-cell-start",
  );
  const clickToFirstCellPaintMs = durationBetween(
    ordered,
    "command-received",
    "first-cell-paint",
  );
  const firstCellStartIndex = phases.findIndex(
    ({ phase }) => phase === "first-cell-start",
  );
  const largestBeforeFirstCellStart =
    firstCellStartIndex < 0
      ? null
      : findLargestPhase(phases.slice(0, firstCellStartIndex + 1));
  const largestPhase = findLargestPhase(phases);
  const output = Object.freeze({
    traceKind: record.traceKind,
    traceId: record.traceId,
    status,
    totalMs,
    clickToFirstCellStartMs,
    clickToFirstCellPaintMs,
    largestBeforeFirstCellStart,
    largestPhase,
    phases: Object.freeze(phases),
  });
  log(formatTraceOutput(output), output);
}

function durationBetween(
  ordered: readonly (readonly [string, number])[],
  fromPhase: string,
  toPhase: string,
): number | null {
  const from = ordered.find(([phase]) => phase === fromPhase)?.[1];
  const to = ordered.find(([phase]) => phase === toPhase)?.[1];
  return from === undefined || to === undefined ? null : roundMs(to - from);
}

function findLargestPhase(phases: readonly TracePhaseOutput[]) {
  if (phases.length < 2) return null;
  let largestIndex = 1;
  for (let index = 2; index < phases.length; index += 1) {
    if (phases[index]!.durationMs > phases[largestIndex]!.durationMs)
      largestIndex = index;
  }
  return Object.freeze({
    fromPhase: phases[largestIndex - 1]!.phase,
    toPhase: phases[largestIndex]!.phase,
    durationMs: phases[largestIndex]!.durationMs,
  });
}

function formatTraceOutput(output: {
  readonly traceKind: "startup" | "spin";
  readonly traceId: number;
  readonly status: "complete" | "failed" | "destroyed";
  readonly totalMs: number;
  readonly clickToFirstCellStartMs: number | null;
  readonly clickToFirstCellPaintMs: number | null;
  readonly largestBeforeFirstCellStart: ReturnType<typeof findLargestPhase>;
  readonly largestPhase: ReturnType<typeof findLargestPhase>;
  readonly phases: readonly TracePhaseOutput[];
}): string {
  const metrics = [
    `total=${output.totalMs}ms`,
    output.clickToFirstCellStartMs === null
      ? null
      : `click-to-first-cell-start=${output.clickToFirstCellStartMs}ms`,
    output.clickToFirstCellPaintMs === null
      ? null
      : `click-to-first-cell-paint=${output.clickToFirstCellPaintMs}ms`,
    output.largestBeforeFirstCellStart === null
      ? null
      : `pre-start-largest=${output.largestBeforeFirstCellStart.fromPhase} -> ${output.largestBeforeFirstCellStart.toPhase} (${output.largestBeforeFirstCellStart.durationMs}ms)`,
    output.largestPhase === null
      ? null
      : `largest=${output.largestPhase.fromPhase} -> ${output.largestPhase.toPhase} (${output.largestPhase.durationMs}ms)`,
  ].filter((value): value is string => value !== null);
  const phaseLines = output.phases.map(
    ({ phase, durationMs, elapsedMs }) =>
      `  +${durationMs}ms\t=${elapsedMs}ms\t${phase}`,
  );
  return [
    `[game002v2 timing] ${output.traceKind}#${output.traceId} ${output.status} ${metrics.join(" | ")}`,
    "  duration\telapsed\tphase",
    ...phaseLines,
  ].join("\n");
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
