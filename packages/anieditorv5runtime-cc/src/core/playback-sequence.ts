export type V5GPlaybackRange =
  | { unit: "time"; start: number; end?: number }
  | { unit: "frame"; start: number; end?: number; fps: number };

export type V5GPlaybackPoint =
  | { unit: "time"; at: number }
  | { unit: "frame"; at: number; fps: number };

export interface V5GPlayRangeOptions {
  range: V5GPlaybackRange;
  loop?: boolean;
}

export interface V5GTimelinePlayOptions {
  mode?: "timeline";
}

export interface V5GRangePlayOptions extends V5GPlayRangeOptions {
  mode: "range";
}

export interface V5GSegmentedPlaybackOptions {
  mode: "segmented";
  loopStart: V5GPlaybackPoint;
  loopEnd: V5GPlaybackPoint;
  keepParticlesAlive?: boolean;
}

export interface V5GForceStopParticlesOptions {
  suppressUntilNextPlayback?: boolean;
}

export interface V5GSegmentedPlaybackEndOptions {
  forceStopParticles?: boolean;
}

export type V5GPlayOptions =
  | V5GTimelinePlayOptions
  | V5GRangePlayOptions
  | V5GSegmentedPlaybackOptions;

export type V5GPlaybackMode = "timeline" | "range" | "segmented";

export type V5GSegmentedPlaybackPhase =
  | "idle"
  | "start"
  | "loop"
  | "ending"
  | "particle-draining"
  | "complete";

export interface V5GPlaybackState {
  mode: V5GPlaybackMode;
  phase: V5GSegmentedPlaybackPhase;
  currentTime: number;
  isPlaying: boolean;
  isDrainingParticles: boolean;
  liveParticleCount: number;
  loopIndex: number;
  keepParticlesAlive: boolean;
}

export interface V5GNormalizedPlaybackRange {
  startTime: number;
  endTime: number;
}

export interface V5GNormalizedSegmentedPlayback {
  loopStartTime: number;
  loopEndTime: number;
  duration: number;
  keepParticlesAlive: boolean;
}

export interface V5GSegmentedAdvanceResult {
  previousTime: number;
  currentTime: number;
  phase: V5GSegmentedPlaybackPhase;
  loopIndex: number;
  timelineEnded: boolean;
}

export class V5GSegmentedPlaybackSequence {
  private readonly loopStartTime: number;
  private readonly loopEndTime: number;
  private readonly duration: number;
  readonly keepParticlesAlive: boolean;
  private phase: V5GSegmentedPlaybackPhase = "start";
  private currentTime = 0;
  private loopIndex = 0;
  private endRequested = false;
  private loopElapsedTime = 0;

  constructor(config: V5GNormalizedSegmentedPlayback) {
    this.loopStartTime = config.loopStartTime;
    this.loopEndTime = config.loopEndTime;
    this.duration = config.duration;
    this.keepParticlesAlive = config.keepParticlesAlive;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getPhase(): V5GSegmentedPlaybackPhase {
    return this.phase;
  }

  getLoopIndex(): number {
    return this.loopIndex;
  }

  getLoopStartTime(): number {
    return this.loopStartTime;
  }

  getLoopEndTime(): number {
    return this.loopEndTime;
  }

  getLoopElapsedTime(): number {
    return this.loopElapsedTime;
  }

  requestEnd(): void {
    if (this.phase !== "start" && this.phase !== "loop") {
      throw new Error(
        `Cannot request segmented playback end while phase is "${this.phase}".`,
      );
    }
    this.endRequested = true;
    if (this.phase === "loop") {
      this.phase = "ending";
      this.currentTime = this.loopEndTime;
    }
  }

  advance(deltaSeconds: number): V5GSegmentedAdvanceResult {
    assertPositiveFinite(deltaSeconds, "segmented playback deltaSeconds");
    const previousTime = this.currentTime;
    let remaining = deltaSeconds;
    let timelineEnded = false;

    while (remaining > 0 && !timelineEnded) {
      if (this.phase === "start") {
        const timeToLoopStart = this.loopStartTime - this.currentTime;
        if (remaining < timeToLoopStart) {
          this.currentTime += remaining;
          remaining = 0;
        } else {
          remaining -= Math.max(timeToLoopStart, 0);
          this.currentTime = this.loopStartTime;
          if (this.endRequested) {
            this.phase = "ending";
            this.currentTime = this.loopEndTime;
          } else {
            this.phase = "loop";
          }
        }
      } else if (this.phase === "loop") {
        if (this.endRequested) {
          this.phase = "ending";
          this.currentTime = this.loopEndTime;
          continue;
        }
        this.loopElapsedTime += remaining;
        if (this.loopStartTime === this.loopEndTime) {
          this.currentTime = this.loopStartTime;
          remaining = 0;
        } else {
          const span = this.loopEndTime - this.loopStartTime;
          const advanced = this.currentTime + remaining;
          if (advanced < this.loopEndTime) {
            this.currentTime = advanced;
            remaining = 0;
          } else {
            const overflow = advanced - this.loopEndTime;
            this.loopIndex += 1 + Math.floor(overflow / span);
            this.currentTime = this.loopStartTime + (overflow % span);
            remaining = 0;
          }
        }
      } else if (this.phase === "ending") {
        const timeToEnd = this.duration - this.currentTime;
        if (remaining < timeToEnd) {
          this.currentTime += remaining;
          remaining = 0;
        } else {
          this.currentTime = this.duration;
          this.phase = "particle-draining";
          timelineEnded = true;
          remaining = 0;
        }
      } else {
        remaining = 0;
      }
    }

    return {
      previousTime,
      currentTime: this.currentTime,
      phase: this.phase,
      loopIndex: this.loopIndex,
      timelineEnded,
    };
  }

  markParticleDrainComplete(): void {
    if (this.phase === "particle-draining") {
      this.phase = "complete";
    }
  }
}

export function normalizePlaybackRange(
  range: V5GPlaybackRange,
  duration: number,
): V5GNormalizedPlaybackRange {
  if (range.unit === "time") {
    const startTime = assertFiniteNumber(range.start, "playback range start");
    const endTime = normalizeOptionalEnd(
      range.end,
      duration,
      "playback range end",
    );
    assertNormalizedRange(startTime, endTime, duration);
    return { startTime, endTime };
  }
  const fps = assertPositiveFinite(range.fps, "playback range fps");
  const startFrame = assertNonNegativeInteger(
    range.start,
    "playback range start frame",
  );
  const endTime =
    range.end === undefined || range.end === -1
      ? duration
      : assertNonNegativeInteger(range.end, "playback range end frame") / fps;
  const startTime = startFrame / fps;
  assertNormalizedRange(startTime, endTime, duration);
  return { startTime, endTime };
}

export function normalizePlaybackPoint(
  point: V5GPlaybackPoint,
  duration: number,
  path: string,
): number {
  const time =
    point.unit === "time"
      ? assertFiniteNumber(point.at, `${path} time`)
      : assertNonNegativeInteger(point.at, `${path} frame`) /
        assertPositiveFinite(point.fps, `${path} fps`);
  if (time < 0 || time > duration) {
    throw new Error(`${path} must be within project duration.`);
  }
  return time;
}

export function normalizeSegmentedPlaybackOptions(
  options: V5GSegmentedPlaybackOptions,
  duration: number,
): V5GNormalizedSegmentedPlayback {
  const loopStartTime = normalizePlaybackPoint(
    options.loopStart,
    duration,
    "segmented loopStart",
  );
  const loopEndTime = normalizePlaybackPoint(
    options.loopEnd,
    duration,
    "segmented loopEnd",
  );
  if (loopStartTime > loopEndTime) {
    throw new Error(
      `Invalid V5G segmented playback: expected 0 <= loopStart <= loopEnd <= ${duration}, got ${loopStartTime}..${loopEndTime}.`,
    );
  }
  return {
    loopStartTime,
    loopEndTime,
    duration,
    keepParticlesAlive: options.keepParticlesAlive ?? true,
  };
}

export function assertPositiveFinite(value: number, path: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
  return value;
}

function normalizeOptionalEnd(
  value: number | undefined,
  duration: number,
  path: string,
): number {
  if (value === undefined || value === -1) return duration;
  return assertFiniteNumber(value, path);
}

function assertNormalizedRange(
  startTime: number,
  endTime: number,
  duration: number,
): void {
  if (startTime < 0 || !(startTime < endTime) || endTime > duration) {
    throw new Error(
      `Invalid V5G playback range: expected 0 <= start < end <= ${duration}, got ${startTime}..${endTime}.`,
    );
  }
}

function assertFiniteNumber(value: number, path: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, path: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer.`);
  }
  return value;
}
