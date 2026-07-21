import { Container, Sprite, Texture, VideoSource } from "pixi.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";

export interface SceneLayoutTransitionVideoPlayer {
  readonly view: Container;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly currentTimeSeconds: number;
  readonly ended: boolean;
  readonly fatalError: SceneLayoutError | null;
  prepare(): Promise<void>;
  /** Invokes the underlying audible media play() before returning. */
  play(): Promise<void>;
  applyViewport(viewportSize: RenderViewportSize): void;
  destroy(): void;
}

export interface CreateSceneLayoutTransitionVideoPlayerOptions {
  readonly url: string;
  readonly fadeOutSeconds: number;
  readonly onDiagnostic?: (
    diagnostic: SceneLayoutTransitionVideoDiagnostic,
  ) => void;
  readonly createVideoElement?: () => HTMLVideoElement;
  readonly createPresentation?: (
    video: HTMLVideoElement,
    onTextureUpdate?: () => void,
  ) => {
    readonly view: Container;
    readonly ready?: Promise<void>;
    destroy(): void;
  };
}

export interface SceneLayoutTransitionVideoDiagnostic {
  readonly sequence: number;
  readonly event: string;
  readonly currentTimeSeconds: number | null;
  readonly durationSeconds: number | null;
  readonly readyState: number;
  readonly networkState: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly seeking: boolean;
  readonly muted: boolean;
  readonly volume: number;
  readonly playbackRate: number;
  readonly size: string;
  readonly presentedFrames: number;
  readonly presentedMediaTimeSeconds: number | null;
  readonly pixiTextureUpdates: number;
  readonly detail?: string;
}

export function createSceneLayoutTransitionVideoPlayer(
  options: CreateSceneLayoutTransitionVideoPlayerOptions,
): SceneLayoutTransitionVideoPlayer {
  return new BrowserSceneLayoutTransitionVideoPlayer(options);
}

class BrowserSceneLayoutTransitionVideoPlayer implements SceneLayoutTransitionVideoPlayer {
  readonly #url: string;
  readonly #fadeOutSeconds: number;
  readonly #video: HTMLVideoElement;
  readonly #createPresentation: NonNullable<
    CreateSceneLayoutTransitionVideoPlayerOptions["createPresentation"]
  >;
  readonly #onDiagnostic:
    | CreateSceneLayoutTransitionVideoPlayerOptions["onDiagnostic"]
    | undefined;
  readonly #mediaEventListeners = new Map<string, EventListener>();
  #presentation: ReturnType<
    NonNullable<
      CreateSceneLayoutTransitionVideoPlayerOptions["createPresentation"]
    >
  > | null = null;
  #fatalError: SceneLayoutError | null = null;
  #prepared = false;
  #destroyed = false;
  #diagnosticSequence = 0;
  #presentedFrames = 0;
  #presentedMediaTimeSeconds: number | null = null;
  #lastReportedFrameSecond = -1;
  #pixiTextureUpdates = 0;
  #lastReportedTextureSecond = -1;
  #videoFrameRequestHandle: number | null = null;
  readonly #onFatal = (event: Event): void => {
    if (this.#destroyed) return;
    const mediaError = this.#video.error;
    const detail = mediaError?.message ? `: ${mediaError.message}` : "";
    this.#fatalError = new SceneLayoutError(
      `Scene transition video ${event.type}${detail}.`,
    );
  };

  constructor(options: CreateSceneLayoutTransitionVideoPlayerOptions) {
    this.#url = options.url;
    this.#fadeOutSeconds = options.fadeOutSeconds;
    const createVideo =
      options.createVideoElement ??
      (() => {
        if (typeof document === "undefined")
          throw new SceneLayoutError(
            "A browser HTMLVideoElement is required for video transitions.",
          );
        return document.createElement("video");
      });
    this.#video = createVideo();
    this.#createPresentation =
      options.createPresentation ?? createPixiVideoPresentation;
    this.#onDiagnostic = options.onDiagnostic;
    this.attachDiagnosticListeners();
    this.emitDiagnostic("created");
  }

  get view(): Container {
    if (!this.#presentation)
      throw new SceneLayoutError("Scene transition video is not prepared.");
    return this.#presentation.view;
  }

  get durationSeconds(): number {
    return this.#video.duration;
  }

  get width(): number {
    return this.#video.videoWidth;
  }

  get height(): number {
    return this.#video.videoHeight;
  }

  get currentTimeSeconds(): number {
    return this.#video.currentTime;
  }

  get ended(): boolean {
    return this.#video.ended;
  }

  get fatalError(): SceneLayoutError | null {
    return this.#fatalError;
  }

  async prepare(): Promise<void> {
    this.assertAlive();
    if (this.#prepared)
      throw new SceneLayoutError("Scene transition video is already prepared.");
    if (!this.#video.canPlayType("video/mp4"))
      throw new SceneLayoutError("This browser cannot play video/mp4.");
    configureAudibleInlineVideo(this.#video);
    this.#video.preload = "auto";
    this.#video.addEventListener("error", this.#onFatal);
    this.#video.addEventListener("abort", this.#onFatal);
    this.#video.src = this.#url;
    this.emitDiagnostic("prepare-load");
    try {
      await waitForVideoReadiness(this.#video);
      this.assertAlive();
      validateMetadata(this.#video, this.#fadeOutSeconds);
      this.#presentation = this.#createPresentation(
        this.#video,
        this.recordPixiTextureUpdate,
      );
      await this.#presentation.ready;
      this.assertAlive();
      this.#presentation.view.label = "scene-transition-video";
      this.#prepared = true;
      this.emitDiagnostic("prepared");
    } catch (error) {
      this.emitDiagnostic("prepare-rejected", formatError(error));
      this.destroy();
      throw asSceneLayoutError(error);
    }
  }

  play(): Promise<void> {
    this.assertAlive();
    if (!this.#prepared)
      throw new SceneLayoutError("Scene transition video is not prepared.");
    configureAudibleInlineVideo(this.#video);
    this.#video.currentTime = 0;
    this.startVideoFrameDiagnostics();
    this.emitDiagnostic("play-invoked");
    // Deliberately invoke play synchronously in the trusted caller stack.
    const result = this.#video.play();
    return Promise.resolve(result).then(
      () => {
        this.emitDiagnostic("play-resolved");
      },
      (error: unknown) => {
        this.emitDiagnostic("play-rejected", formatError(error));
        throw asSceneLayoutError(error);
      },
    );
  }

  applyViewport(viewportSize: RenderViewportSize): void {
    this.assertAlive();
    const view = this.view;
    const scale = Math.min(
      viewportSize.width / this.width,
      viewportSize.height / this.height,
    );
    view.position.set(viewportSize.width / 2, viewportSize.height / 2);
    view.scale.set(scale);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.emitDiagnostic("destroy");
    this.stopVideoFrameDiagnostics();
    for (const [event, listener] of this.#mediaEventListeners)
      this.#video.removeEventListener(event, listener);
    this.#mediaEventListeners.clear();
    this.#video.removeEventListener("error", this.#onFatal);
    this.#video.removeEventListener("abort", this.#onFatal);
    this.#video.pause();
    this.#video.removeAttribute("src");
    this.#video.load();
    this.#presentation?.view.parent?.removeChild(this.#presentation.view);
    this.#presentation?.destroy();
    this.#presentation = null;
    this.#prepared = false;
  }

  private assertAlive(): void {
    if (this.#destroyed)
      throw new SceneLayoutError(
        "Scene transition video player was destroyed.",
      );
  }

  private attachDiagnosticListeners(): void {
    if (!this.#onDiagnostic) return;
    for (const event of VIDEO_DIAGNOSTIC_EVENTS) {
      const listener = (): void => {
        const mediaError = this.#video.error;
        const detail = mediaError
          ? `mediaError code=${mediaError.code}${mediaError.message ? ` message=${mediaError.message}` : ""}`
          : undefined;
        this.emitDiagnostic(`media-${event}`, detail);
      };
      this.#mediaEventListeners.set(event, listener);
      this.#video.addEventListener(event, listener);
    }
  }

  private startVideoFrameDiagnostics(): void {
    if (
      !this.#onDiagnostic ||
      typeof this.#video.requestVideoFrameCallback !== "function" ||
      this.#videoFrameRequestHandle !== null
    )
      return;
    const observeFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (this.#destroyed) return;
      this.#presentedFrames += 1;
      this.#presentedMediaTimeSeconds = metadata.mediaTime;
      const second = Math.floor(metadata.mediaTime);
      if (
        this.#presentedFrames <= 3 ||
        second !== this.#lastReportedFrameSecond
      ) {
        this.#lastReportedFrameSecond = second;
        this.emitDiagnostic(
          "presented-frame",
          `callback=${this.#presentedFrames} browserPresentedFrames=${metadata.presentedFrames}`,
        );
      }
      this.#videoFrameRequestHandle =
        this.#video.requestVideoFrameCallback(observeFrame);
    };
    this.#videoFrameRequestHandle =
      this.#video.requestVideoFrameCallback(observeFrame);
  }

  private stopVideoFrameDiagnostics(): void {
    if (this.#videoFrameRequestHandle === null) return;
    this.#video.cancelVideoFrameCallback(this.#videoFrameRequestHandle);
    this.#videoFrameRequestHandle = null;
  }

  private emitDiagnostic(event: string, detail?: string): void {
    this.#onDiagnostic?.(
      Object.freeze({
        sequence: ++this.#diagnosticSequence,
        event,
        currentTimeSeconds: finiteOrNull(this.#video.currentTime),
        durationSeconds: finiteOrNull(this.#video.duration),
        readyState: this.#video.readyState,
        networkState: this.#video.networkState,
        paused: this.#video.paused,
        ended: this.#video.ended,
        seeking: this.#video.seeking,
        muted: this.#video.muted,
        volume: this.#video.volume,
        playbackRate: this.#video.playbackRate,
        size: `${this.#video.videoWidth}x${this.#video.videoHeight}`,
        presentedFrames: this.#presentedFrames,
        presentedMediaTimeSeconds: this.#presentedMediaTimeSeconds,
        pixiTextureUpdates: this.#pixiTextureUpdates,
        ...(detail ? { detail } : {}),
      }),
    );
  }

  readonly recordPixiTextureUpdate = (): void => {
    this.#pixiTextureUpdates += 1;
    const second = Math.floor(this.#video.currentTime);
    if (
      this.#pixiTextureUpdates <= 3 ||
      second !== this.#lastReportedTextureSecond
    ) {
      this.#lastReportedTextureSecond = second;
      this.emitDiagnostic("pixi-texture-update");
    }
  };
}

const VIDEO_DIAGNOSTIC_EVENTS = Object.freeze([
  "loadstart",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "canplaythrough",
  "play",
  "playing",
  "waiting",
  "stalled",
  "suspend",
  "pause",
  "seeking",
  "seeked",
  "timeupdate",
  "ended",
  "error",
  "abort",
]);

function configureAudibleInlineVideo(video: HTMLVideoElement): void {
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.muted = false;
  video.volume = 1;
  video.loop = false;
}

function waitForVideoReadiness(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 3) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      video.removeEventListener("abort", onAbort);
    };
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new SceneLayoutError("Scene transition video failed to load."));
    };
    const onAbort = (): void => {
      cleanup();
      reject(new SceneLayoutError("Scene transition video load was aborted."));
    };
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
    video.addEventListener("abort", onAbort);
    video.load();
  });
}

function validateMetadata(
  video: HTMLVideoElement,
  fadeOutSeconds: number,
): void {
  if (!Number.isFinite(video.duration) || video.duration <= 0)
    throw new SceneLayoutError(
      "Scene transition video duration must be finite and positive.",
    );
  if (
    !Number.isSafeInteger(video.videoWidth) ||
    video.videoWidth <= 0 ||
    !Number.isSafeInteger(video.videoHeight) ||
    video.videoHeight <= 0
  )
    throw new SceneLayoutError(
      "Scene transition video dimensions must be positive integers.",
    );
  if (fadeOutSeconds >= video.duration)
    throw new SceneLayoutError(
      `Scene transition fadeOutSeconds ${fadeOutSeconds} must be less than media duration ${video.duration}.`,
    );
}

function createPixiVideoPresentation(
  video: HTMLVideoElement,
  onTextureUpdate?: () => void,
): {
  readonly view: Container;
  readonly ready: Promise<void>;
  destroy(): void;
} {
  const source = new VideoSource({
    resource: video,
    autoLoad: false,
    autoPlay: false,
    loop: false,
    muted: false,
    playsinline: true,
    preload: true,
  });
  if (onTextureUpdate) source.on("update", onTextureUpdate);
  // autoLoad=false is required so this owned element is not loaded or played a
  // second time. Explicit load is still mandatory: Pixi installs its play/pause
  // listeners here, which drive per-frame video texture uploads.
  const ready = source.load().then(() => undefined);
  const texture = new Texture({ source });
  const sprite = new Sprite({ texture, anchor: 0.5 });
  return {
    view: sprite,
    ready,
    destroy(): void {
      if (onTextureUpdate) source.off("update", onTextureUpdate);
      sprite.destroy();
      texture.destroy(true);
    },
  };
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asSceneLayoutError(error: unknown): SceneLayoutError {
  return error instanceof SceneLayoutError
    ? error
    : new SceneLayoutError(
        error instanceof Error ? error.message : String(error),
      );
}
