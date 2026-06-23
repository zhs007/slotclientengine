import { describe, expect, it } from "vitest";
import {
  V5GSegmentedPlaybackSequence,
  normalizePlaybackRange,
  normalizeSegmentedPlaybackOptions,
} from "../../src/core/playback-sequence";

describe("playback-sequence", () => {
  it("normalizes segmented playback and defaults keepParticlesAlive to true", () => {
    expect(
      normalizeSegmentedPlaybackOptions(
        {
          mode: "segmented",
          loopStart: { unit: "time", at: 1 },
          loopEnd: { unit: "frame", at: 90, fps: 30 },
        },
        4,
      ),
    ).toEqual({
      loopStartTime: 1,
      loopEndTime: 3,
      duration: 4,
      keepParticlesAlive: true,
    });

    expect(
      normalizeSegmentedPlaybackOptions(
        {
          mode: "segmented",
          loopStart: { unit: "time", at: 1 },
          loopEnd: { unit: "time", at: 1 },
          keepParticlesAlive: false,
        },
        4,
      ).keepParticlesAlive,
    ).toBe(false);
  });

  it("rejects illegal segmented and range times without clamping", () => {
    expect(() =>
      normalizeSegmentedPlaybackOptions(
        {
          mode: "segmented",
          loopStart: { unit: "time", at: Number.NaN },
          loopEnd: { unit: "time", at: 2 },
        },
        4,
      ),
    ).toThrow("finite number");
    expect(() =>
      normalizeSegmentedPlaybackOptions(
        {
          mode: "segmented",
          loopStart: { unit: "time", at: 3 },
          loopEnd: { unit: "time", at: 2 },
        },
        4,
      ),
    ).toThrow("loopStart <= loopEnd");
    expect(() =>
      normalizeSegmentedPlaybackOptions(
        {
          mode: "segmented",
          loopStart: { unit: "time", at: 0 },
          loopEnd: { unit: "time", at: 5 },
        },
        4,
      ),
    ).toThrow("within project duration");
    expect(() =>
      normalizePlaybackRange({ unit: "time", start: 1, end: 1 }, 4),
    ).toThrow("start < end");
  });

  it("holds a single-frame loop until the user requests ending", () => {
    const sequence = new V5GSegmentedPlaybackSequence({
      loopStartTime: 1,
      loopEndTime: 1,
      duration: 3,
      keepParticlesAlive: true,
    });

    expect(sequence.advance(0.8)).toMatchObject({
      currentTime: 0.8,
      phase: "start",
      timelineEnded: false,
    });
    expect(sequence.advance(0.4)).toMatchObject({
      currentTime: 1,
      phase: "loop",
      timelineEnded: false,
    });
    expect(sequence.advance(2)).toMatchObject({
      currentTime: 1,
      phase: "loop",
      timelineEnded: false,
    });

    sequence.requestEnd();
    expect(sequence.getPhase()).toBe("ending");
    expect(sequence.advance(2)).toMatchObject({
      currentTime: 3,
      phase: "particle-draining",
      timelineEnded: true,
    });
    sequence.markParticleDrainComplete();
    expect(sequence.getPhase()).toBe("complete");
  });

  it("loops a range without relying on the base loop switch", () => {
    const sequence = new V5GSegmentedPlaybackSequence({
      loopStartTime: 1,
      loopEndTime: 1.5,
      duration: 3,
      keepParticlesAlive: true,
    });

    sequence.advance(1.25);
    expect(sequence.getPhase()).toBe("loop");
    const result = sequence.advance(1.1);
    expect(result.phase).toBe("loop");
    expect(result.currentTime).toBeCloseTo(1.35);
    expect(result.loopIndex).toBe(2);
  });

  it("fails fast when ending is requested outside active segmented playback", () => {
    const sequence = new V5GSegmentedPlaybackSequence({
      loopStartTime: 0,
      loopEndTime: 0,
      duration: 1,
      keepParticlesAlive: true,
    });
    sequence.requestEnd();
    sequence.advance(1);

    expect(() => sequence.requestEnd()).toThrow("Cannot request");
  });
});
