import { describe, expect, it } from "vitest";
import type {
  AudioBackend,
  AudioBackendInstance,
  AudioBackendSound,
} from "../src/core/index.js";
import {
  createAudioCueTimeline,
  createAudioRuntime,
} from "../src/core/index.js";
import {
  parseAudioEffectBindingV1,
  parseAudioEventTrackBindingV1,
  parseAudioMusicBindingV1,
} from "../src/data/index.js";

class FakeInstance implements AudioBackendInstance {
  volume = 1;
  paused = false;
  stopped = false;
  readonly listeners = new Set<() => void>();
  stop(): void {
    this.stopped = true;
  }
  onEnded(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  end(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
class FakeSound implements AudioBackendSound {
  readonly instances: FakeInstance[] = [];
  destroyed = false;
  play(): AudioBackendInstance {
    const instance = new FakeInstance();
    this.instances.push(instance);
    return instance;
  }
  destroy(): void {
    this.destroyed = true;
  }
}
class FakeBackend implements AudioBackend {
  readonly sounds: FakeSound[] = [];
  prepareCount = 0;
  unlockCount = 0;
  async prepare(): Promise<AudioBackendSound> {
    this.prepareCount += 1;
    const sound = new FakeSound();
    this.sounds.push(sound);
    return sound;
  }
  async unlock(): Promise<void> {
    this.unlockCount += 1;
  }
}

function effect(
  name: string,
  playback: "once" | "loop",
  bgm: unknown = { kind: "keep" },
) {
  return parseAudioEffectBindingV1({
    name,
    asset: { sources: [{ path: `${name}.mp3`, mediaType: "audio/mpeg" }] },
    playback,
    offsetSeconds: 0.5,
    voices: { maxConcurrent: playback === "loop" ? 1 : 2, overflow: "reject" },
    bgm,
  });
}

function track(
  name: string,
  path: string,
  category: "music" | "effect",
  focus: unknown = {},
) {
  return parseAudioEventTrackBindingV1({
    name,
    asset: { sources: [{ path, mediaType: "audio/mpeg" }] },
    category,
    playback: "once",
    voices: { maxConcurrent: 8, overflow: "restart-oldest" },
    focus,
  });
}

describe("audio runtime", () => {
  it("emits music lifecycle only after start and fade-out stop", async () => {
    const backend = new FakeBackend();
    const music = parseAudioMusicBindingV1({
      name: "base",
      asset: { sources: [{ path: "base.mp3", mediaType: "audio/mpeg" }] },
      loop: true,
      fadeOutSeconds: 0.5,
      fadeInSeconds: 0.1,
    });
    const runtime = createAudioRuntime({
      backend,
      effects: {},
      music: {
        base: {
          binding: music,
          sources: [{ url: "base.mp3", mediaType: "audio/mpeg" }],
        },
      },
    });
    const events: string[] = [];
    runtime.observeMusic((event) =>
      events.push(`${event.name}:${event.phase}`),
    );
    await runtime.requestMusic("base");
    expect(events).toEqual(["base:started"]);
    runtime.update(0.1);
    await runtime.requestMusic(null);
    runtime.update(0.49);
    expect(events).toEqual(["base:started"]);
    runtime.update(0.01);
    expect(events).toEqual(["base:started", "base:stopped"]);
    runtime.destroy();
  });

  it("deduplicates prepare, cancels pending delay, and deduplicates loop", async () => {
    const backend = new FakeBackend();
    const loop = effect("coin", "loop");
    const runtime = createAudioRuntime({
      backend,
      effects: {
        "award.coin": {
          binding: loop,
          sources: [{ url: "coin.mp3", mediaType: "audio/mpeg" }],
        },
      },
    });
    await Promise.all([
      runtime.prepare(["award.coin"]),
      runtime.prepare(["award.coin"]),
    ]);
    expect(backend.prepareCount).toBe(1);
    const first = runtime.playEffect("award.coin");
    expect(runtime.playEffect("award.coin")).toBe(first);
    runtime.update(0.25);
    runtime.stopEffect("award.coin");
    await expect(first.finished).resolves.toBe("stopped");
    expect(runtime.getSnapshot().activeEffects).toBe(0);
    runtime.destroy();
  });

  it("keeps pause over duck until the final holder releases", async () => {
    const backend = new FakeBackend();
    const duck = effect("duck", "once", {
      kind: "duck",
      targetGain: 0.25,
      attackSeconds: 0,
      releaseSeconds: 0,
    });
    const pause = effect("pause", "loop", {
      kind: "pause",
      fadeOutSeconds: 0.001,
      fadeInSeconds: 0.001,
    });
    const music = parseAudioMusicBindingV1({
      name: "base",
      asset: { sources: [{ path: "base.mp3", mediaType: "audio/mpeg" }] },
      loop: true,
      fadeOutSeconds: 0.1,
      fadeInSeconds: 0.1,
    });
    const runtime = createAudioRuntime({
      backend,
      effects: {
        duck: {
          binding: duck,
          sources: [{ url: "duck.mp3", mediaType: "audio/mpeg" }],
        },
        pause: {
          binding: pause,
          sources: [{ url: "pause.mp3", mediaType: "audio/mpeg" }],
        },
      },
      music: {
        base: {
          binding: music,
          sources: [{ url: "base.mp3", mediaType: "audio/mpeg" }],
        },
      },
    });
    await runtime.requestMusic("base");
    runtime.update(0.1);
    runtime.playEffect("duck", { delaySeconds: 0 });
    runtime.playEffect("pause", { delaySeconds: 0 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    runtime.update(0.001);
    expect(runtime.getSnapshot().focus).toBe("pause");
    runtime.stopEffect("pause");
    expect(runtime.getSnapshot().focus).toBe("duck");
    (backend.sounds[1]!.instances[0] ?? backend.sounds[0]!.instances[0])?.end();
    runtime.stopEffect("duck");
    expect(runtime.getSnapshot().focus).toBe("keep");
    runtime.destroy();
  });

  it("applies event focus leases by category and restores targets on release", async () => {
    const backend = new FakeBackend();
    const music = parseAudioMusicBindingV1({
      name: "base",
      asset: { sources: [{ path: "base.mp3", mediaType: "audio/mpeg" }] },
      loop: true,
      fadeOutSeconds: 0.001,
      fadeInSeconds: 0.001,
    });
    const runtime = createAudioRuntime({
      backend,
      effects: {},
      music: {
        base: {
          binding: music,
          sources: [{ url: "base.mp3", mediaType: "audio/mpeg" }],
        },
      },
      tracks: {
        coin: {
          binding: track("coin", "coin.mp3", "effect"),
          sources: [{ url: "coin.mp3", mediaType: "audio/mpeg" }],
        },
        bigwin: {
          binding: track("bigwin", "bigwin.mp3", "effect", {
            bgm: { targetGain: 0.5 },
            effects: { scope: "all", targetGain: 0.25 },
          }),
          sources: [{ url: "bigwin.mp3", mediaType: "audio/mpeg" }],
        },
      },
    });
    await runtime.requestMusic("base");
    runtime.update(0.001);
    runtime.playTrack("coin");
    await flushMicrotasks();
    const owner = runtime.playTrack("bigwin");
    await flushMicrotasks();
    runtime.update(0);
    expect(backend.sounds[0]!.instances[0]!.volume).toBe(0.5);
    expect(backend.sounds[1]!.instances[0]!.volume).toBe(0.25);
    expect(backend.sounds[2]!.instances[0]!.volume).toBe(1);
    owner.stop();
    expect(backend.sounds[0]!.instances[0]!.volume).toBe(1);
    expect(backend.sounds[1]!.instances[0]!.volume).toBe(1);
    runtime.destroy();
  });

  it("same-audio focus lowers earlier matching voices but not its owner", async () => {
    const backend = new FakeBackend();
    const runtime = createAudioRuntime({
      backend,
      effects: {},
      tracks: {
        coin: {
          binding: track("coin", "coin.mp3", "effect", {
            effects: { scope: "same-audio", targetGain: 0.5 },
          }),
          sources: [{ url: "coin.mp3", mediaType: "audio/mpeg" }],
        },
      },
    });
    runtime.playTrack("coin");
    await flushMicrotasks();
    const second = runtime.playTrack("coin");
    await flushMicrotasks();
    runtime.update(0);
    expect(backend.sounds[0]!.instances.map(({ volume }) => volume)).toEqual([
      0.5, 1,
    ]);
    second.stop();
    expect(backend.sounds[0]!.instances[0]!.volume).toBe(1);
    runtime.destroy();
  });

  it("uses owner playback time for cues", () => {
    const fired: string[] = [];
    const timeline = createAudioCueTimeline({
      cues: [
        { id: "now", effect: "a", offsetSeconds: 0 },
        { id: "later", effect: "b", offsetSeconds: 1 },
      ],
      sink: ({ id }) => fired.push(id),
    });
    timeline.update(0);
    timeline.update(0.5);
    timeline.update(1);
    expect(fired).toEqual(["now", "later"]);
    timeline.cancel();
    timeline.update(2);
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}
