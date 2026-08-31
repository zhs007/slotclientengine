import { describe, expect, it } from "vitest";
import type {
  AudioBackend,
  AudioBackendActivityState,
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
  readonly pendingPlayResolvers: Array<(instance: FakeInstance) => void> = [];
  readonly #deferPlay: boolean;
  destroyed = false;
  constructor(deferPlay = false) {
    this.#deferPlay = deferPlay;
  }
  play(): AudioBackendInstance | Promise<AudioBackendInstance> {
    const instance = new FakeInstance();
    this.instances.push(instance);
    if (this.#deferPlay)
      return new Promise((resolve) =>
        this.pendingPlayResolvers.push(() => resolve(instance)),
      );
    return instance;
  }
  resolveNextPlay(): void {
    this.pendingPlayResolvers.shift()?.(this.instances.at(-1)!);
  }
  destroy(): void {
    this.destroyed = true;
  }
}
class FakeBackend implements AudioBackend {
  readonly sounds: FakeSound[] = [];
  readonly activityListeners = new Set<
    (state: AudioBackendActivityState) => void
  >();
  prepareCount = 0;
  unlockCount = 0;
  activity: AudioBackendActivityState = "active";
  deferNextPlay = false;
  getActivityState(): AudioBackendActivityState {
    return this.activity;
  }
  observeActivity(
    listener: (state: AudioBackendActivityState) => void,
  ): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }
  setActivity(activity: AudioBackendActivityState): void {
    if (activity === this.activity) return;
    this.activity = activity;
    for (const listener of [...this.activityListeners]) listener(activity);
  }
  async prepare(): Promise<AudioBackendSound> {
    this.prepareCount += 1;
    const sound = new FakeSound(this.deferNextPlay);
    this.deferNextPlay = false;
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

  it("drops pending, active, and late-starting once effects while suspended", async () => {
    const backend = new FakeBackend();
    const runtime = createAudioRuntime({
      backend,
      effects: {
        active: {
          binding: effect("active", "once"),
          sources: [{ url: "active.mp3", mediaType: "audio/mpeg" }],
        },
        late: {
          binding: effect("late", "once"),
          sources: [{ url: "late.mp3", mediaType: "audio/mpeg" }],
        },
      },
    });
    const active = runtime.playEffect("active", { delaySeconds: 0 });
    await flushMicrotasks();
    expect(active.state).toBe("playing");
    backend.deferNextPlay = true;
    const late = runtime.playEffect("late", { delaySeconds: 0 });
    await flushMicrotasks();
    const sound = backend.sounds[1]!;
    expect(sound.pendingPlayResolvers).toHaveLength(1);

    backend.setActivity("suspended");
    const dropped = runtime.playEffect("active", { delaySeconds: 0 });
    expect(runtime.getSnapshot()).toMatchObject({
      activity: "suspended",
      pendingEffects: 0,
      activeEffects: 0,
    });
    await expect(active.finished).resolves.toBe("stopped");
    await expect(late.finished).resolves.toBe("stopped");
    await expect(dropped.finished).resolves.toBe("stopped");
    expect(backend.sounds[0]!.instances[0]!.stopped).toBe(true);

    sound.resolveNextPlay();
    await flushMicrotasks();
    expect(sound.instances[0]!.stopped).toBe(true);
    backend.setActivity("active");
    expect(sound.instances).toHaveLength(1);
    runtime.destroy();
  });

  it("defers a music request made while suspended until it is still current", async () => {
    const backend = new FakeBackend();
    backend.activity = "suspended";
    const base = parseAudioMusicBindingV1({
      name: "base",
      asset: { sources: [{ path: "base.mp3", mediaType: "audio/mpeg" }] },
      loop: true,
      fadeOutSeconds: 0.1,
      fadeInSeconds: 0.1,
    });
    const bonus = parseAudioMusicBindingV1({
      name: "bonus",
      asset: { sources: [{ path: "bonus.mp3", mediaType: "audio/mpeg" }] },
      loop: true,
      fadeOutSeconds: 0.1,
      fadeInSeconds: 0.1,
    });
    const runtime = createAudioRuntime({
      backend,
      effects: {},
      music: {
        base: {
          binding: base,
          sources: [{ url: "base.mp3", mediaType: "audio/mpeg" }],
        },
        bonus: {
          binding: bonus,
          sources: [{ url: "bonus.mp3", mediaType: "audio/mpeg" }],
        },
      },
    });
    const stale = runtime.requestMusic("base");
    const current = runtime.requestMusic("bonus");
    await flushMicrotasks();
    expect(backend.sounds.flatMap(({ instances }) => instances)).toHaveLength(
      0,
    );

    backend.setActivity("active");
    await Promise.all([stale, current]);
    expect(runtime.getSnapshot().activeMusic).toBe("bonus");
    expect(backend.sounds[0]!.instances).toHaveLength(0);
    expect(backend.sounds[1]!.instances).toHaveLength(1);
    runtime.destroy();
  });

  it("pauses persistent playback, freezes ramps, and resumes only live intent", async () => {
    const backend = new FakeBackend();
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
        ambience: {
          binding: effect("ambience", "loop"),
          sources: [{ url: "ambience.mp3", mediaType: "audio/mpeg" }],
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
    const loop = runtime.playEffect("ambience", { delaySeconds: 0 });
    await flushMicrotasks();
    runtime.update(0.05);
    const musicInstance = backend.sounds[0]!.instances[0]!;
    const loopInstance = backend.sounds[1]!.instances[0]!;
    expect(musicInstance.volume).toBeCloseTo(0.5);

    backend.setActivity("suspended");
    expect(musicInstance.paused).toBe(true);
    expect(loopInstance.paused).toBe(true);
    runtime.update(1);
    expect(musicInstance.volume).toBeCloseTo(0.5);
    loop.stop();
    expect(loopInstance.stopped).toBe(true);

    backend.setActivity("active");
    expect(musicInstance.paused).toBe(false);
    expect(backend.sounds[1]!.instances).toHaveLength(1);
    runtime.update(0.05);
    expect(musicInstance.volume).toBe(1);
    runtime.destroy();
  });

  it("does not let foreground resume override an active BGM pause lease", async () => {
    const backend = new FakeBackend();
    const pause = effect("pause", "loop", {
      kind: "pause",
      fadeOutSeconds: 0.001,
      fadeInSeconds: 0.001,
    });
    const music = parseAudioMusicBindingV1({
      name: "base",
      asset: { sources: [{ path: "base.mp3", mediaType: "audio/mpeg" }] },
      loop: true,
      fadeOutSeconds: 0.001,
      fadeInSeconds: 0.001,
    });
    const runtime = createAudioRuntime({
      backend,
      effects: {
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
    runtime.update(0.001);
    runtime.playEffect("pause", { delaySeconds: 0 });
    await flushMicrotasks();
    runtime.update(0.001);
    const musicInstance = backend.sounds[0]!.instances[0]!;
    expect(musicInstance.paused).toBe(true);

    backend.setActivity("suspended");
    backend.setActivity("active");
    expect(musicInstance.paused).toBe(true);
    runtime.stopEffect("pause");
    expect(musicInstance.paused).toBe(false);
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
