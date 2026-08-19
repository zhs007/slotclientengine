import type { IMediaInstance, Sound } from "@pixi/sound";
import type {
  AudioBackend,
  AudioBackendInstance,
  AudioBackendSound,
  AudioBackendSource,
} from "./backend.js";

export function createPixiSoundBackend(): AudioBackend {
  return Object.freeze({
    async prepare(
      sources: readonly AudioBackendSource[],
    ): Promise<AudioBackendSound> {
      if (sources.length === 0)
        throw new Error("audio backend sources must not be empty.");
      const { Sound } = await import("@pixi/sound");
      const audio = document.createElement("audio");
      const source = sources.find(
        ({ mediaType }) =>
          audio.canPlayType(mediaType).replace(/^no$/u, "") !== "",
      );
      if (!source) throw new Error("No supported file type found");
      const sound = Sound.from({
        url: source.url,
        preload: false,
      });
      await waitUntilLoaded(sound);
      return new PixiBackendSound(sound);
    },
    async unlock(): Promise<void> {
      const { sound: soundLibrary } = await import("@pixi/sound");
      const context = soundLibrary.context?.audioContext;
      if (!context) throw new Error("Pixi sound AudioContext is unavailable.");
      await context.resume();
    },
  });
}

class PixiBackendSound implements AudioBackendSound {
  readonly #sound: Sound;
  #destroyed = false;
  constructor(sound: Sound) {
    this.#sound = sound;
  }

  async play(options: {
    readonly loop: boolean;
    readonly volume: number;
  }): Promise<AudioBackendInstance> {
    if (this.#destroyed) throw new Error("Pixi backend sound is destroyed.");
    const instance = await this.#sound.play({
      loop: options.loop,
      volume: options.volume,
    });
    return new PixiBackendInstance(instance);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#sound.stop();
    this.#sound.destroy();
  }
}

class PixiBackendInstance implements AudioBackendInstance {
  readonly #instance: IMediaInstance;
  constructor(instance: IMediaInstance) {
    this.#instance = instance;
  }
  get volume(): number {
    return this.#instance.volume;
  }
  set volume(value: number) {
    this.#instance.volume = value;
  }
  get paused(): boolean {
    return this.#instance.paused;
  }
  set paused(value: boolean) {
    this.#instance.paused = value;
  }
  stop(): void {
    this.#instance.stop();
  }
  onEnded(listener: () => void): () => void {
    this.#instance.once("end", listener);
    return () => this.#instance.off("end" as "stop", listener);
  }
}

function waitUntilLoaded(sound: Sound): Promise<void> {
  if (sound.isLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    sound.media.load((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
