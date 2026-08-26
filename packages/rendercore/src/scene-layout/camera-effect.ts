import type { Container } from "pixi.js";
import { SceneLayoutError } from "./errors.js";
import type {
  SceneLayoutCameraEffectSession,
  SceneLayoutCameraEffectTarget,
} from "./types.js";

interface CameraValues {
  zoomScale: number;
  shakeX: number;
  shakeY: number;
  shakeFrequencyHz: number;
}

interface CameraSessionState {
  readonly id: number;
  current: CameraValues;
  source: CameraValues;
  target: CameraValues;
  elapsedSeconds: number;
  durationSeconds: number;
  clockSeconds: number;
  releasing: boolean;
  released: boolean;
  completion: ReturnType<typeof createDeferred> | null;
  readonly signal: AbortSignal | undefined;
  readonly abortListener: (() => void) | undefined;
}

export interface SceneLayoutCameraEffectController {
  start(
    target: SceneLayoutCameraEffectTarget,
    options?: { readonly signal?: AbortSignal },
  ): SceneLayoutCameraEffectSession;
  applyViewport(width: number, height: number): void;
  update(deltaSeconds: number): void;
  destroy(): void;
}

const NEUTRAL_VALUES: CameraValues = Object.freeze({
  zoomScale: 1,
  shakeX: 0,
  shakeY: 0,
  shakeFrequencyHz: 1,
});

export function createSceneLayoutCameraEffectController(
  root: Container,
): SceneLayoutCameraEffectController {
  let nextId = 1;
  let viewport: { width: number; height: number } | null = null;
  let destroyed = false;
  const sessions = new Map<number, CameraSessionState>();

  const release = (state: CameraSessionState): void => {
    if (state.released) return;
    state.released = true;
    state.signal?.removeEventListener("abort", state.abortListener!);
    sessions.delete(state.id);
    state.completion?.resolve();
    commit();
  };

  const transition = (
    state: CameraSessionState,
    target: CameraValues,
    durationSeconds: number,
  ): void => {
    state.source = { ...state.current };
    state.target = target;
    state.elapsedSeconds = 0;
    state.durationSeconds = durationSeconds;
    if (durationSeconds === 0) state.current = { ...target };
  };

  const commit = (): void => {
    if (!viewport) return;
    let zoomScale = 1;
    let offsetX = 0;
    let offsetY = 0;
    for (const state of sessions.values()) {
      zoomScale = Math.max(zoomScale, state.current.zoomScale);
      const phase = state.id * 1.618033988749895;
      const radians =
        state.clockSeconds * state.current.shakeFrequencyHz * Math.PI * 2 +
        phase;
      offsetX += Math.sin(radians) * state.current.shakeX;
      offsetY += Math.cos(radians * 1.13) * state.current.shakeY;
    }
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    root.pivot.set(centerX, centerY);
    root.position.set(centerX + offsetX, centerY + offsetY);
    root.scale.set(zoomScale);
  };

  return {
    start(target, options = {}) {
      if (destroyed)
        throw new SceneLayoutError(
          "Scene camera effect runtime was destroyed.",
        );
      if (!viewport)
        throw new SceneLayoutError(
          "Scene camera effect requires an applied viewport.",
        );
      if (options.signal?.aborted)
        throw new SceneLayoutError("Scene camera effect signal is aborted.");
      const normalized = normalizeTarget(target);
      const state: CameraSessionState = {
        id: nextId++,
        current: { ...NEUTRAL_VALUES },
        source: { ...NEUTRAL_VALUES },
        target: toValues(normalized),
        elapsedSeconds: 0,
        durationSeconds: normalized.transitionSeconds,
        clockSeconds: 0,
        releasing: false,
        released: false,
        completion: null,
        signal: options.signal,
        abortListener: undefined,
      };
      if (options.signal) {
        const abortListener = () => release(state);
        Object.assign(state, { abortListener });
        options.signal.addEventListener("abort", abortListener, { once: true });
      }
      sessions.set(state.id, state);
      if (state.durationSeconds === 0) state.current = { ...state.target };
      commit();

      return Object.freeze({
        setTarget(nextTarget: SceneLayoutCameraEffectTarget): void {
          assertSessionActive(state);
          if (state.releasing)
            throw new SceneLayoutError(
              "Finishing scene camera effect cannot be retargeted.",
            );
          const normalizedTarget = normalizeTarget(nextTarget);
          transition(
            state,
            toValues(normalizedTarget),
            normalizedTarget.transitionSeconds,
          );
          commit();
        },
        finish(
          finishOptions: { readonly durationSeconds?: number } = {},
        ): Promise<void> {
          if (state.released) return Promise.resolve();
          if (state.completion) return state.completion.promise;
          const durationSeconds = normalizeDuration(
            finishOptions.durationSeconds ?? normalized.transitionSeconds,
            "Scene camera effect finish durationSeconds",
          );
          state.completion = createDeferred();
          state.releasing = true;
          transition(state, { ...NEUTRAL_VALUES }, durationSeconds);
          if (durationSeconds === 0) release(state);
          return state.completion.promise;
        },
        cancel(): void {
          release(state);
        },
      });
    },

    applyViewport(width, height) {
      viewport = {
        width: normalizePositive(width, "Scene camera viewport width"),
        height: normalizePositive(height, "Scene camera viewport height"),
      };
      commit();
    },

    update(deltaSeconds) {
      if (destroyed) return;
      const delta = normalizeDuration(
        deltaSeconds,
        "Scene camera effect deltaSeconds",
      );
      for (const state of [...sessions.values()]) {
        state.clockSeconds += delta;
        state.elapsedSeconds += delta;
        const progress =
          state.durationSeconds === 0
            ? 1
            : Math.min(1, state.elapsedSeconds / state.durationSeconds);
        state.current = interpolate(state.source, state.target, progress);
        if (state.releasing && progress === 1) release(state);
      }
      commit();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const state of [...sessions.values()]) release(state);
      viewport = null;
      root.pivot.set(0, 0);
      root.position.set(0, 0);
      root.scale.set(1);
    },
  };
}

function assertSessionActive(state: CameraSessionState): void {
  if (state.released)
    throw new SceneLayoutError("Scene camera effect session was released.");
}

function normalizeTarget(
  target: SceneLayoutCameraEffectTarget,
): SceneLayoutCameraEffectTarget {
  const zoomScale = normalizePositive(target.zoomScale, "Camera zoomScale");
  if (zoomScale < 1)
    throw new SceneLayoutError("Camera zoomScale must be at least 1.");
  const shakeX = normalizeDuration(target.shakeX, "Camera shakeX");
  const shakeY = normalizeDuration(target.shakeY, "Camera shakeY");
  const shakeFrequencyHz = normalizePositive(
    target.shakeFrequencyHz,
    "Camera shakeFrequencyHz",
  );
  return Object.freeze({
    zoomScale,
    shakeX,
    shakeY,
    shakeFrequencyHz,
    transitionSeconds: normalizeDuration(
      target.transitionSeconds,
      "Camera transitionSeconds",
    ),
  });
}

function toValues(target: SceneLayoutCameraEffectTarget): CameraValues {
  return {
    zoomScale: target.zoomScale,
    shakeX: target.shakeX,
    shakeY: target.shakeY,
    shakeFrequencyHz: target.shakeFrequencyHz,
  };
}

function interpolate(
  source: CameraValues,
  target: CameraValues,
  progress: number,
): CameraValues {
  const mix = (from: number, to: number) => from + (to - from) * progress;
  return {
    zoomScale: mix(source.zoomScale, target.zoomScale),
    shakeX: mix(source.shakeX, target.shakeX),
    shakeY: mix(source.shakeY, target.shakeY),
    shakeFrequencyHz: mix(source.shakeFrequencyHz, target.shakeFrequencyHz),
  };
}

function normalizePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new SceneLayoutError(`${label} must be a positive finite number.`);
  return value;
}

function normalizeDuration(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new SceneLayoutError(
      `${label} must be a non-negative finite number.`,
    );
  return value;
}

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
