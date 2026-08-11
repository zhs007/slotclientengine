import { ReelError } from "./errors.js";
import type {
  VisibleOccurrenceMotion,
  VisibleOccurrencePoint,
} from "./types.js";

const ARC_SAMPLES_PER_SEGMENT = 64;

interface CubicSegment {
  readonly start: VisibleOccurrencePoint;
  readonly control1: VisibleOccurrencePoint;
  readonly control2: VisibleOccurrencePoint;
  readonly end: VisibleOccurrencePoint;
}

interface ArcSample {
  readonly segmentIndex: number;
  readonly t: number;
  readonly distance: number;
}

export interface PreparedVisibleOccurrenceMotion {
  readonly durationMs: number;
  readonly stacking: VisibleOccurrenceMotion["stacking"];
  sample(rawProgress: number): VisibleOccurrencePoint;
}

export function prepareVisibleOccurrenceMotion(
  motion: VisibleOccurrenceMotion,
  source: VisibleOccurrencePoint,
  target: VisibleOccurrencePoint,
): PreparedVisibleOccurrenceMotion {
  assertPoint(source, "source");
  assertPoint(target, "target");
  if (!Number.isFinite(motion.durationMs) || motion.durationMs <= 0)
    throw new ReelError(
      "Visible occurrence motion durationMs must be positive and finite.",
    );
  const stacking = normalizeStacking(motion.stacking);
  const ease = prepareEasing(motion.easing);
  const segments = prepareSegments(motion.path, source, target);
  const lookup = buildArcLookup(segments);
  return Object.freeze({
    durationMs: motion.durationMs,
    stacking,
    sample: (rawProgress: number): VisibleOccurrencePoint => {
      if (!Number.isFinite(rawProgress) || rawProgress < 0 || rawProgress > 1)
        throw new ReelError(
          "Visible occurrence motion progress must be between 0 and 1.",
        );
      if (rawProgress === 0) return Object.freeze({ ...source });
      if (rawProgress === 1) return Object.freeze({ ...target });
      return sampleByDistance(segments, lookup, ease(rawProgress));
    },
  });
}

function prepareSegments(
  path: VisibleOccurrenceMotion["path"],
  source: VisibleOccurrencePoint,
  target: VisibleOccurrencePoint,
): readonly CubicSegment[] {
  if (path.kind === "line")
    return Object.freeze([
      Object.freeze({
        start: source,
        control1: source,
        control2: target,
        end: target,
      }),
    ]);
  if (path.kind !== "cubic-bezier-path")
    throw new ReelError(
      `Unknown visible occurrence motion path kind "${String((path as { kind?: unknown }).kind)}".`,
    );
  if (!Array.isArray(path.segments) || path.segments.length === 0)
    throw new ReelError(
      "Visible occurrence cubic-bezier-path must contain segments.",
    );
  let start = Object.freeze({ ...source });
  const segments = path.segments.map((segment, index) => {
    assertPoint(segment.control1, `path.segments[${index}].control1`);
    assertPoint(segment.control2, `path.segments[${index}].control2`);
    assertPoint(segment.end, `path.segments[${index}].end`);
    const normalized = Object.freeze({
      start,
      control1: Object.freeze({ ...segment.control1 }),
      control2: Object.freeze({ ...segment.control2 }),
      end: Object.freeze({ ...segment.end }),
    });
    start = normalized.end;
    return normalized;
  });
  const end = segments[segments.length - 1]!.end;
  if (end.x !== target.x || end.y !== target.y)
    throw new ReelError(
      "Visible occurrence cubic-bezier-path must end at target geometry.",
    );
  return Object.freeze(segments);
}

function prepareEasing(
  easing: VisibleOccurrenceMotion["easing"],
): (progress: number) => number {
  if (easing.kind === "linear") return (progress) => progress;
  if (easing.kind !== "cubic-bezier")
    throw new ReelError(
      `Unknown visible occurrence time easing kind "${String((easing as { kind?: unknown }).kind)}".`,
    );
  for (const [name, value] of Object.entries(easing)) {
    if (name !== "kind" && !Number.isFinite(value))
      throw new ReelError(`Visible occurrence easing ${name} must be finite.`);
  }
  if (easing.x1 < 0 || easing.x1 > 1 || easing.x2 < 0 || easing.x2 > 1)
    throw new ReelError(
      "Visible occurrence easing x1/x2 must be between 0 and 1.",
    );
  return (progress) => {
    let lower = 0;
    let upper = 1;
    for (let index = 0; index < 24; index += 1) {
      const candidate = (lower + upper) / 2;
      if (cubic(0, easing.x1, easing.x2, 1, candidate) < progress)
        lower = candidate;
      else upper = candidate;
    }
    return cubic(0, easing.y1, easing.y2, 1, (lower + upper) / 2);
  };
}

function buildArcLookup(
  segments: readonly CubicSegment[],
): readonly ArcSample[] {
  const samples: ArcSample[] = [{ segmentIndex: 0, t: 0, distance: 0 }];
  let distance = 0;
  let previous = segments[0]!.start;
  segments.forEach((segment, segmentIndex) => {
    for (let index = 1; index <= ARC_SAMPLES_PER_SEGMENT; index += 1) {
      const t = index / ARC_SAMPLES_PER_SEGMENT;
      const point = sampleCubic(segment, t);
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      samples.push({ segmentIndex, t, distance });
      previous = point;
    }
  });
  if (!(distance > 0))
    throw new ReelError(
      "Visible occurrence motion path must have positive length.",
    );
  return Object.freeze(samples);
}

function sampleByDistance(
  segments: readonly CubicSegment[],
  lookup: readonly ArcSample[],
  progress: number,
): VisibleOccurrencePoint {
  const wanted =
    lookup[lookup.length - 1]!.distance * Math.min(1, Math.max(0, progress));
  let high = lookup.length - 1;
  let low = 0;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (lookup[middle]!.distance < wanted) low = middle;
    else high = middle;
  }
  const before = lookup[low]!;
  const after = lookup[high]!;
  const span = after.distance - before.distance;
  const ratio = span === 0 ? 0 : (wanted - before.distance) / span;
  const segmentIndex = after.segmentIndex;
  const t0 = before.segmentIndex === segmentIndex ? before.t : 0;
  return Object.freeze(
    sampleCubic(segments[segmentIndex]!, t0 + (after.t - t0) * ratio),
  );
}

function sampleCubic(segment: CubicSegment, t: number): VisibleOccurrencePoint {
  return {
    x: cubic(
      segment.start.x,
      segment.control1.x,
      segment.control2.x,
      segment.end.x,
      t,
    ),
    y: cubic(
      segment.start.y,
      segment.control1.y,
      segment.control2.y,
      segment.end.y,
      t,
    ),
  };
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const inverse = 1 - t;
  return (
    inverse ** 3 * a +
    3 * inverse ** 2 * t * b +
    3 * inverse * t ** 2 * c +
    t ** 3 * d
  );
}

function normalizeStacking(
  stacking: VisibleOccurrenceMotion["stacking"],
): VisibleOccurrenceMotion["stacking"] {
  if (stacking.layer !== "above-symbols" && stacking.layer !== "above-effects")
    throw new ReelError(
      `Unknown visible occurrence stacking layer "${String(stacking.layer)}".`,
    );
  if (!Number.isSafeInteger(stacking.order) || stacking.order < 0)
    throw new ReelError(
      "Visible occurrence stacking order must be a non-negative safe integer.",
    );
  return Object.freeze({ ...stacking });
}

function assertPoint(value: VisibleOccurrencePoint, label: string): void {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y))
    throw new ReelError(`Visible occurrence ${label} must contain finite x/y.`);
}
