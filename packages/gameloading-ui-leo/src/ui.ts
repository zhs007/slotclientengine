import type {
  GameLoadingUi,
  GameLoadingUiCreateContext,
  GameLoadingUiFactory,
  GameLoadingUiSnapshot,
} from "@slotclientengine/gameloading";
import { createLeoProgressStyles, normalizeLeoProgress } from "./progress.js";
import { createLeoLoadingStyles } from "./styles.js";

export interface LeoGameLoadingUiOptions {
  readonly introDurationMs?: number;
  readonly gifLoadTimeoutMs?: number;
  readonly progressRevealDurationMs?: number;
  readonly exitDurationMs?: number;
}

interface NormalizedOptions {
  readonly introDurationMs: number;
  readonly gifLoadTimeoutMs: number;
  readonly progressRevealDurationMs: number;
  readonly exitDurationMs: number;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  introDurationMs: 3200,
  gifLoadTimeoutMs: 5000,
  progressRevealDurationMs: 1200,
  exitDurationMs: 100,
});
const PROGRESS_READY = 99;
const PROGRESS_FRAME_MS = 16;
const ASSET_URLS = Object.freeze({
  gif: new URL("../assets/loading2.gif", import.meta.url).href,
  logo: new URL("../assets/logo_1.webp", import.meta.url).href,
  radial: new URL("../assets/a2.webp", import.meta.url).href,
  horizontal: new URL("../assets/a3.webp", import.meta.url).href,
});
let nextInstanceId = 0;

export function createLeoGameLoadingUi(
  options: LeoGameLoadingUiOptions = {},
): GameLoadingUiFactory {
  const normalizedOptions = normalizeOptions(options);
  return Object.freeze({
    create: ({ root }: GameLoadingUiCreateContext) =>
      createUi(root, normalizedOptions),
  });
}

function createUi(
  root: HTMLElement,
  options: NormalizedOptions,
): GameLoadingUi {
  const document = root.ownerDocument;
  const window = document.defaultView;
  if (!window) {
    throw new Error("Leo loading UI requires a document window.");
  }
  const instanceId = `sce-leo-loading-${++nextInstanceId}`;
  const selector = `[data-sce-leo-loading="${instanceId}"]`;
  const style = document.createElement("style");
  style.dataset.sceLeoLoadingStyle = instanceId;
  style.textContent = createLeoLoadingStyles(selector);
  document.head.append(style);

  const container = document.createElement("div");
  container.className = "sce-leo-loading";
  container.dataset.sceLeoLoading = instanceId;
  container.style.setProperty(
    "--sce-leo-exit-duration",
    `${options.exitDurationMs}ms`,
  );
  const frame = document.createElement("div");
  frame.className = "sce-leo-loading__frame";
  const logo = createImage(
    document,
    "sce-leo-loading__logo",
    "Leo",
    ASSET_URLS.logo,
  );
  logo.dataset.visible = "true";
  const intro = createImage(
    document,
    "sce-leo-loading__intro",
    "",
    ASSET_URLS.gif,
  );
  const radial = createImage(
    document,
    "sce-leo-loading__progress-art sce-leo-loading__radial",
    "",
    ASSET_URLS.radial,
  );
  const horizontal = createImage(
    document,
    "sce-leo-loading__progress-art sce-leo-loading__horizontal",
    "",
    ASSET_URLS.horizontal,
  );
  const errorText = document.createElement("div");
  errorText.className = "sce-leo-loading__error";
  errorText.setAttribute("role", "alert");
  errorText.setAttribute("aria-live", "polite");
  frame.append(logo, intro, radial, horizontal);
  container.append(frame, errorText);
  root.replaceChildren(container);

  let destroyed = false;
  let progressVisible = false;
  let preloadTimer: number | undefined;
  let introTimer: number | undefined;
  let progressTimer: number | undefined;
  let exitTimer: number | undefined;
  let targetProgress = 0;
  let renderedProgress = 0;
  let previousProgressTime = 0;
  let readyResolved = false;
  let resolveReady: () => void = () => undefined;
  let resolveExit: (() => void) | undefined;
  const readyToComplete = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const preloadImage = new window.Image();

  const renderProgress = (progress: number) => {
    const progressStyles = createLeoProgressStyles(progress);
    radial.style.clipPath = progressStyles.radialClipPath;
    horizontal.style.clipPath = progressStyles.horizontalClipPath;
  };
  const resolveVisualReady = () => {
    if (
      readyResolved ||
      !progressVisible ||
      targetProgress < PROGRESS_READY ||
      renderedProgress < PROGRESS_READY
    ) {
      return;
    }
    readyResolved = true;
    resolveReady();
  };
  const stopProgressTimer = () => {
    if (progressTimer === undefined) {
      return;
    }
    window.clearInterval(progressTimer);
    progressTimer = undefined;
  };
  const advanceProgress = () => {
    if (destroyed) {
      stopProgressTimer();
      return;
    }
    const currentTime = window.performance.now();
    const elapsed = Math.max(0, currentTime - previousProgressTime);
    previousProgressTime = currentTime;
    const nextProgress =
      renderedProgress +
      (elapsed * PROGRESS_READY) / options.progressRevealDurationMs;
    renderedProgress =
      targetProgress - nextProgress <= 1e-9
        ? targetProgress
        : Math.min(targetProgress, nextProgress);
    renderProgress(renderedProgress);
    resolveVisualReady();
    if (renderedProgress >= targetProgress) {
      stopProgressTimer();
    }
  };
  const startProgressReveal = () => {
    if (!progressVisible || renderedProgress >= targetProgress) {
      resolveVisualReady();
      return;
    }
    if (options.progressRevealDurationMs === 0) {
      renderedProgress = targetProgress;
      renderProgress(renderedProgress);
      resolveVisualReady();
      return;
    }
    if (progressTimer !== undefined) {
      return;
    }
    previousProgressTime = window.performance.now();
    progressTimer = window.setInterval(advanceProgress, PROGRESS_FRAME_MS);
  };
  renderProgress(0);

  const finishIntro = () => {
    if (destroyed || progressVisible) {
      return;
    }
    progressVisible = true;
    renderProgress(renderedProgress);
    logo.dataset.visible = "false";
    intro.dataset.visible = "false";
    radial.dataset.visible = "true";
    horizontal.dataset.visible = "true";
    startProgressReveal();
  };
  const beginIntro = (showGif: boolean) => {
    if (destroyed || introTimer !== undefined) {
      return;
    }
    if (preloadTimer !== undefined) {
      window.clearTimeout(preloadTimer);
      preloadTimer = undefined;
    }
    preloadImage.onload = null;
    preloadImage.onerror = null;
    if (showGif) {
      logo.dataset.visible = "false";
      intro.dataset.visible = "true";
    }
    introTimer = window.setTimeout(finishIntro, options.introDurationMs);
  };
  preloadImage.onload = () => beginIntro(true);
  preloadImage.onerror = () => beginIntro(false);
  preloadTimer = window.setTimeout(
    () => beginIntro(false),
    options.gifLoadTimeoutMs,
  );
  preloadImage.src = ASSET_URLS.gif;
  if (preloadImage.complete) {
    beginIntro(preloadImage.naturalWidth > 0);
  }

  return {
    readyToComplete,
    update(snapshot: GameLoadingUiSnapshot): void {
      if (destroyed) {
        return;
      }
      targetProgress = Math.max(
        targetProgress,
        normalizeLeoProgress(snapshot.progress),
      );
      startProgressReveal();
      errorText.textContent = snapshot.error ?? "";
    },
    playExit(): Promise<void> {
      if (destroyed || options.exitDurationMs === 0) {
        return Promise.resolve();
      }
      container.classList.add("sce-leo-loading--exiting");
      return new Promise((resolve) => {
        resolveExit = resolve;
        exitTimer = window.setTimeout(() => {
          exitTimer = undefined;
          resolveExit = undefined;
          resolve();
        }, options.exitDurationMs);
      });
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      preloadImage.onload = null;
      preloadImage.onerror = null;
      preloadImage.src = "";
      if (preloadTimer !== undefined) {
        window.clearTimeout(preloadTimer);
      }
      if (introTimer !== undefined) {
        window.clearTimeout(introTimer);
      }
      stopProgressTimer();
      if (exitTimer !== undefined) {
        window.clearTimeout(exitTimer);
      }
      readyResolved = true;
      resolveReady();
      resolveExit?.();
      style.remove();
      container.remove();
    },
  };
}

function createImage(
  document: Document,
  classNames: string,
  alt: string,
  src: string,
): HTMLImageElement {
  const image = document.createElement("img");
  image.className = `sce-leo-loading__art ${classNames}`;
  image.alt = alt;
  image.src = src;
  return image;
}

function normalizeOptions(options: LeoGameLoadingUiOptions): NormalizedOptions {
  return Object.freeze({
    introDurationMs: normalizeDuration(
      options.introDurationMs,
      DEFAULT_OPTIONS.introDurationMs,
      "introDurationMs",
    ),
    gifLoadTimeoutMs: normalizeDuration(
      options.gifLoadTimeoutMs,
      DEFAULT_OPTIONS.gifLoadTimeoutMs,
      "gifLoadTimeoutMs",
    ),
    progressRevealDurationMs: normalizeDuration(
      options.progressRevealDurationMs,
      DEFAULT_OPTIONS.progressRevealDurationMs,
      "progressRevealDurationMs",
    ),
    exitDurationMs: normalizeDuration(
      options.exitDurationMs,
      DEFAULT_OPTIONS.exitDurationMs,
      "exitDurationMs",
    ),
  });
}

function normalizeDuration(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const normalized = value ?? fallback;
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(
      `Leo loading ${label} must be a finite non-negative number.`,
    );
  }
  return normalized;
}
