export type VNIPlaybackRange =
  | { unit: "time"; start: number; end?: number }
  | { unit: "frame"; start: number; end?: number; fps: number };

export type VNIPlaybackPoint =
  | { unit: "time"; at: number }
  | { unit: "frame"; at: number; fps: number };

export interface VNIPlayRangeOptions {
  range: VNIPlaybackRange;
  loop?: boolean;
}

export interface VNITimelinePlayOptions {
  mode?: "timeline";
}

export interface VNIRangePlayOptions extends VNIPlayRangeOptions {
  mode: "range";
}

export interface VNISegmentedPlaybackOptions {
  mode: "segmented";
  loopStart: VNIPlaybackPoint;
  loopEnd: VNIPlaybackPoint;
  keepParticlesAlive?: boolean;
}

export type VNIPlayOptions =
  | VNITimelinePlayOptions
  | VNIRangePlayOptions
  | VNISegmentedPlaybackOptions;

export type VNIPlaybackMode = "timeline" | "range" | "segmented";

export type VNISegmentedPlaybackPhase =
  | "idle"
  | "start"
  | "loop"
  | "ending"
  | "particle-draining"
  | "complete";

export interface VNIPlaybackState {
  mode: VNIPlaybackMode;
  phase: VNISegmentedPlaybackPhase;
  currentTime: number;
  isPlaying: boolean;
  isDrainingParticles: boolean;
  liveParticleCount: number;
  loopIndex: number;
  keepParticlesAlive: boolean;
}

export interface VNINormalizedPlaybackRange {
  startTime: number;
  endTime: number;
}

export interface VNINormalizedSegmentedPlayback {
  loopStartTime: number;
  loopEndTime: number;
  duration: number;
  keepParticlesAlive: boolean;
}

export interface VNISegmentedAdvanceResult {
  previousTime: number;
  currentTime: number;
  phase: VNISegmentedPlaybackPhase;
  loopIndex: number;
  timelineEnded: boolean;
}

export class VNISegmentedPlaybackSequence {
  private readonly loopStartTime: number;
  private readonly loopEndTime: number;
  private readonly duration: number;
  readonly keepParticlesAlive: boolean;
  private phase: VNISegmentedPlaybackPhase = "start";
  private currentTime = 0;
  private loopIndex = 0;
  private endRequested = false;
  private loopElapsedTime = 0;

  constructor(config: VNINormalizedSegmentedPlayback) {
    this.loopStartTime = config.loopStartTime;
    this.loopEndTime = config.loopEndTime;
    this.duration = config.duration;
    this.keepParticlesAlive = config.keepParticlesAlive;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getPhase(): VNISegmentedPlaybackPhase {
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

  advance(deltaSeconds: number): VNISegmentedAdvanceResult {
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
  range: VNIPlaybackRange,
  duration: number,
): VNINormalizedPlaybackRange {
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
  point: VNIPlaybackPoint,
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
  options: VNISegmentedPlaybackOptions,
  duration: number,
): VNINormalizedSegmentedPlayback {
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
      `Invalid VNI segmented playback: expected 0 <= loopStart <= loopEnd <= ${duration}, got ${loopStartTime}..${loopEndTime}.`,
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
      `Invalid VNI playback range: expected 0 <= start < end <= ${duration}, got ${startTime}..${endTime}.`,
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
