import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { createSceneLayoutTransitionVideoPlayer } from "../../src/scene-layout/video-transition-player.js";

class FakeVideoElement extends EventTarget {
  duration = 3.625;
  videoWidth = 1280;
  videoHeight = 720;
  currentTime = 0;
  ended = false;
  paused = true;
  seeking = false;
  networkState = 1;
  error = null;
  readyState = 0;
  src = "";
  preload = "";
  playsInline = false;
  muted = true;
  volume = 0;
  loop = true;
  readonly attributes = new Set<string>();
  #nextFrameHandle = 1;
  readonly #frameCallbacks = new Map<number, VideoFrameRequestCallback>();
  readonly play = vi.fn(() => {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  });
  readonly pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
  readonly canPlayType = vi.fn(() => "probably");
  readonly load = vi.fn(() => {
    if (this.src) {
      this.readyState = 3;
      this.dispatchEvent(new Event("canplay"));
    }
  });

  setAttribute(name: string): void {
    this.attributes.add(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "src") this.src = "";
  }

  requestVideoFrameCallback(callback: VideoFrameRequestCallback): number {
    const handle = this.#nextFrameHandle++;
    this.#frameCallbacks.set(handle, callback);
    return handle;
  }

  cancelVideoFrameCallback(handle: number): void {
    this.#frameCallbacks.delete(handle);
  }

  presentFrame(mediaTime: number, presentedFrames: number): void {
    const [entry] = this.#frameCallbacks;
    if (!entry) throw new Error("No pending video frame callback.");
    const [handle, callback] = entry;
    this.#frameCallbacks.delete(handle);
    this.currentTime = mediaTime;
    callback(0, {
      mediaTime,
      presentedFrames,
    } as VideoFrameCallbackMetadata);
  }
}

describe("scene layout transition video player", () => {
  it("prepares browser media, invokes audible inline play, contains and drains", async () => {
    const video = new FakeVideoElement();
    const presentation = { view: new Container(), destroy: vi.fn() };
    const player = createSceneLayoutTransitionVideoPlayer({
      url: "blob:clip",
      fadeOutSeconds: 0.5,
      createVideoElement: () => video as unknown as HTMLVideoElement,
      createPresentation: () => presentation,
    });
    await player.prepare();
    expect(video.src).toBe("blob:clip");
    expect(video.canPlayType).toHaveBeenCalledWith("video/mp4");
    expect(video.playsInline).toBe(true);
    expect(video.attributes.has("playsinline")).toBe(true);
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    expect(video.loop).toBe(false);
    const pending = player.play();
    expect(video.play).toHaveBeenCalledTimes(1);
    await pending;
    player.applyViewport({ width: 600, height: 800 });
    expect(presentation.view.position).toMatchObject({ x: 300, y: 400 });
    expect(presentation.view.scale.x).toBeCloseTo(600 / 1280);
    player.destroy();
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.src).toBe("");
    expect(presentation.destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported media and metadata/fade mismatches", async () => {
    const unsupported = new FakeVideoElement();
    unsupported.canPlayType.mockReturnValue("");
    const unsupportedPlayer = createSceneLayoutTransitionVideoPlayer({
      url: "blob:unsupported",
      fadeOutSeconds: 0.5,
      createVideoElement: () => unsupported as unknown as HTMLVideoElement,
      createPresentation: () => ({ view: new Container(), destroy: vi.fn() }),
    });
    await expect(unsupportedPlayer.prepare()).rejects.toThrow(/cannot play/);

    const tooShort = new FakeVideoElement();
    tooShort.duration = 0.5;
    const tooShortPlayer = createSceneLayoutTransitionVideoPlayer({
      url: "blob:short",
      fadeOutSeconds: 0.5,
      createVideoElement: () => tooShort as unknown as HTMLVideoElement,
      createPresentation: () => ({ view: new Container(), destroy: vi.fn() }),
    });
    await expect(tooShortPlayer.prepare()).rejects.toThrow(
      /less than media duration/,
    );
    expect(tooShort.pause).toHaveBeenCalledTimes(1);
    expect(tooShort.src).toBe("");
  });

  it("awaits presentation readiness and reports real presented video frames", async () => {
    const video = new FakeVideoElement();
    const diagnostics: { event: string; presentedFrames: number }[] = [];
    let resolvePresentation!: () => void;
    let reportTextureUpdate!: () => void;
    const presentationReady = new Promise<void>((resolve) => {
      resolvePresentation = resolve;
    });
    const player = createSceneLayoutTransitionVideoPlayer({
      url: "blob:diagnostic",
      fadeOutSeconds: 0.5,
      createVideoElement: () => video as unknown as HTMLVideoElement,
      createPresentation: (_video, onTextureUpdate) => {
        reportTextureUpdate = onTextureUpdate!;
        return {
          view: new Container(),
          ready: presentationReady,
          destroy: vi.fn(),
        };
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    let prepared = false;
    const preparing = player.prepare().then(() => {
      prepared = true;
    });
    await Promise.resolve();
    expect(prepared).toBe(false);
    resolvePresentation();
    await preparing;
    await player.play();
    reportTextureUpdate();
    video.presentFrame(0.033, 1);
    reportTextureUpdate();
    video.presentFrame(0.066, 2);
    expect(diagnostics.map(({ event }) => event)).toEqual(
      expect.arrayContaining([
        "prepared",
        "play-invoked",
        "media-play",
        "media-playing",
        "play-resolved",
        "pixi-texture-update",
        "presented-frame",
      ]),
    );
    expect(diagnostics.at(-1)).toMatchObject({
      event: "presented-frame",
      presentedFrames: 2,
      pixiTextureUpdates: 2,
    });
    player.destroy();
  });
});
