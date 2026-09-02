import type { IMediaInstance, Sound } from "@pixi/sound";
import type {
  AudioBackend,
  AudioBackendActivityState,
  AudioBackendInstance,
  AudioBackendSound,
  AudioBackendSource,
} from "./backend.js";

type PixiSoundModule = typeof import("@pixi/sound");

interface AutoPauseLease {
  readonly module: PixiSoundModule;
  release(): void;
}

let autoPauseLeaseCount = 0;
let originalDisableAutoPause = false;
const AUDIO_DECODE_ATTEMPTS = 2;

export function createPixiSoundBackend(): AudioBackend {
  return new PixiSoundBackend();
}

class PixiSoundBackend implements AudioBackend {
  readonly #activityListeners = new Set<
    (state: AudioBackendActivityState) => void
  >();
  #activity = readInitialActivity();
  #focused = readInitialFocus();
  #pageVisible = true;
  #disposeBrowserEvents: (() => void) | null = null;

  getActivityState(): AudioBackendActivityState {
    return this.#activity;
  }

  observeActivity(
    listener: (state: AudioBackendActivityState) => void,
  ): () => void {
    this.#activityListeners.add(listener);
    if (this.#activityListeners.size === 1) this.attachBrowserEvents();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#activityListeners.delete(listener);
      if (this.#activityListeners.size === 0) {
        this.#disposeBrowserEvents?.();
        this.#disposeBrowserEvents = null;
      }
    };
  }

  async prepare(
    sources: readonly AudioBackendSource[],
  ): Promise<AudioBackendSound> {
    if (sources.length === 0)
      throw new Error("audio backend sources must not be empty.");
    const lease = await acquireAutoPauseLease();
    try {
      const audio = document.createElement("audio");
      const source = sources.find(
        ({ mediaType }) =>
          audio.canPlayType(mediaType).replace(/^no$/u, "") !== "",
      );
      if (!source) throw new Error("No supported file type found");
      const bytes = await fetchAudioBytes(source.url);
      const sound = await decodeAudioBytes(lease.module, bytes, source.url);
      return new PixiBackendSound(sound, lease.release);
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  async unlock(): Promise<void> {
    const lease = await acquireAutoPauseLease();
    try {
      const context = lease.module.sound.context?.audioContext;
      if (!context) throw new Error("Pixi sound AudioContext is unavailable.");
      await context.resume();
    } finally {
      lease.release();
    }
  }

  private attachBrowserEvents(): void {
    const browserWindow = globalThis.window;
    const browserDocument = globalThis.document;
    if (
      typeof browserWindow?.addEventListener !== "function" ||
      typeof browserDocument?.addEventListener !== "function"
    )
      return;
    const onBlur = () => {
      this.#focused = false;
      this.refreshActivity();
    };
    const onFocus = () => {
      this.#focused = true;
      this.refreshActivity();
    };
    const onPageHide = () => {
      this.#pageVisible = false;
      this.refreshActivity();
    };
    const onPageShow = () => {
      this.#pageVisible = true;
      this.refreshActivity();
    };
    const onVisibilityChange = () => this.refreshActivity();
    browserWindow.addEventListener("blur", onBlur);
    browserWindow.addEventListener("focus", onFocus);
    browserWindow.addEventListener("pagehide", onPageHide);
    browserWindow.addEventListener("pageshow", onPageShow);
    browserDocument.addEventListener("visibilitychange", onVisibilityChange);
    this.#disposeBrowserEvents = () => {
      browserWindow.removeEventListener("blur", onBlur);
      browserWindow.removeEventListener("focus", onFocus);
      browserWindow.removeEventListener("pagehide", onPageHide);
      browserWindow.removeEventListener("pageshow", onPageShow);
      browserDocument.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
    };
  }

  private refreshActivity(): void {
    const state =
      this.#focused && this.#pageVisible && documentIsVisible()
        ? "active"
        : "suspended";
    if (state === this.#activity) return;
    this.#activity = state;
    for (const listener of [...this.#activityListeners]) listener(state);
  }
}

class PixiBackendSound implements AudioBackendSound {
  readonly #sound: Sound;
  readonly #releaseAutoPause: () => void;
  #destroyed = false;
  constructor(sound: Sound, releaseAutoPause: () => void) {
    this.#sound = sound;
    this.#releaseAutoPause = releaseAutoPause;
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
    this.#releaseAutoPause();
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

async function acquireAutoPauseLease(): Promise<AutoPauseLease> {
  const module = await import("@pixi/sound");
  if (autoPauseLeaseCount === 0) {
    originalDisableAutoPause = module.sound.disableAutoPause;
    module.sound.disableAutoPause = true;
  }
  autoPauseLeaseCount += 1;
  let active = true;
  return {
    module,
    release: () => {
      if (!active) return;
      active = false;
      autoPauseLeaseCount -= 1;
      if (autoPauseLeaseCount === 0)
        module.sound.disableAutoPause = originalDisableAutoPause;
    },
  };
}

function readInitialActivity(): AudioBackendActivityState {
  return readInitialFocus() && documentIsVisible() ? "active" : "suspended";
}

function readInitialFocus(): boolean {
  const browserDocument = globalThis.document;
  return typeof browserDocument?.hasFocus === "function"
    ? browserDocument.hasFocus()
    : true;
}

function documentIsVisible(): boolean {
  const visibility = globalThis.document?.visibilityState;
  return visibility === undefined || visibility === "visible";
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

async function fetchAudioBytes(url: string): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Failed to fetch audio source "${url}": ${formatError(error)}`,
    );
  }
  if (!response.ok)
    throw new Error(
      `Failed to fetch audio source "${url}": HTTP ${response.status}.`,
    );
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0)
    throw new Error(`Audio source "${url}" is empty.`);
  return bytes;
}

async function decodeAudioBytes(
  module: PixiSoundModule,
  bytes: ArrayBuffer,
  url: string,
): Promise<Sound> {
  let lastError: unknown = new Error("audio decode did not start.");
  for (let attempt = 1; attempt <= AUDIO_DECODE_ATTEMPTS; attempt += 1) {
    const sound = module.Sound.from({
      source: bytes.slice(0),
      preload: false,
    });
    try {
      await waitUntilLoaded(sound);
      return sound;
    } catch (error) {
      lastError = error;
      sound.destroy();
      if (attempt < AUDIO_DECODE_ATTEMPTS) await yieldDecodeRetry();
    }
  }
  throw new Error(
    `Failed to decode audio source "${url}" after ${AUDIO_DECODE_ATTEMPTS} attempts: ${formatError(lastError)}`,
  );
}

function yieldDecodeRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
