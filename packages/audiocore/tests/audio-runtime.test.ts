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

describe("audio runtime", () => {
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
      fadeOutSeconds: 0,
      fadeInSeconds: 0,
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
    runtime.update(0);
    expect(runtime.getSnapshot().focus).toBe("pause");
    runtime.stopEffect("pause");
    expect(runtime.getSnapshot().focus).toBe("duck");
    (backend.sounds[1]!.instances[0] ?? backend.sounds[0]!.instances[0])?.end();
    runtime.stopEffect("duck");
    expect(runtime.getSnapshot().focus).toBe("keep");
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
