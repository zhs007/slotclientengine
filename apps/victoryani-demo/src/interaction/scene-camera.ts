import type { Container } from "pixi.js";

export const DEFAULT_CAMERA_SCALE = 1;
export const DEFAULT_CAMERA_MIN_SCALE = 0.5;
export const DEFAULT_CAMERA_MAX_SCALE = 3;
export const CAMERA_ZOOM_SENSITIVITY = 0.0015;

export type CameraPointer = {
  clientX: number;
  clientY: number;
  pointerId: number;
};

export type SceneCameraState = {
  isActive: boolean;
  isDragging: boolean;
  x: number;
  y: number;
  scale: number;
  minScale: number;
  maxScale: number;
  dragStartClientX: number;
  dragStartClientY: number;
  dragStartCameraX: number;
  dragStartCameraY: number;
  pointerId: number | null;
};

export type SceneCameraStateOptions = Partial<Pick<SceneCameraState, "isActive" | "x" | "y" | "scale" | "minScale" | "maxScale">>;

export type SceneCameraViewport = {
  designWidth: number;
  designHeight: number;
};

export function clampCameraScale(scale: number, minScale = DEFAULT_CAMERA_MIN_SCALE, maxScale = DEFAULT_CAMERA_MAX_SCALE) {
  const safeMin = Number.isFinite(minScale) ? minScale : DEFAULT_CAMERA_MIN_SCALE;
  const safeMax = Number.isFinite(maxScale) ? Math.max(safeMin, maxScale) : DEFAULT_CAMERA_MAX_SCALE;
  const safeScale = Number.isFinite(scale) ? scale : DEFAULT_CAMERA_SCALE;
  return Math.min(safeMax, Math.max(safeMin, safeScale));
}

export function createSceneCameraState(options: SceneCameraStateOptions = {}): SceneCameraState {
  const minScale = options.minScale ?? DEFAULT_CAMERA_MIN_SCALE;
  const maxScale = options.maxScale ?? DEFAULT_CAMERA_MAX_SCALE;

  return {
    isActive: options.isActive ?? false,
    isDragging: false,
    x: options.x ?? 0,
    y: options.y ?? 0,
    scale: clampCameraScale(options.scale ?? DEFAULT_CAMERA_SCALE, minScale, maxScale),
    minScale,
    maxScale,
    dragStartClientX: 0,
    dragStartClientY: 0,
    dragStartCameraX: 0,
    dragStartCameraY: 0,
    pointerId: null
  };
}

export function setSceneCameraActive(state: SceneCameraState, isActive: boolean): SceneCameraState {
  if (state.isActive === isActive && (!state.isDragging || isActive)) {
    return state;
  }

  if (!isActive) {
    return {
      ...state,
      isActive: false,
      isDragging: false,
      pointerId: null
    };
  }

  return {
    ...state,
    isActive: true
  };
}

export function startSceneCameraDrag(state: SceneCameraState, pointer: CameraPointer): SceneCameraState {
  return {
    ...state,
    isActive: true,
    isDragging: true,
    dragStartClientX: pointer.clientX,
    dragStartClientY: pointer.clientY,
    dragStartCameraX: state.x,
    dragStartCameraY: state.y,
    pointerId: pointer.pointerId
  };
}

export function updateSceneCameraDrag(
  state: SceneCameraState,
  pointer: Pick<CameraPointer, "clientX" | "clientY">,
  layoutScale: number
): SceneCameraState {
  if (!state.isDragging) {
    return state;
  }

  const safeLayoutScale = Number.isFinite(layoutScale) && layoutScale > 0 ? layoutScale : 1;

  return {
    ...state,
    x: state.dragStartCameraX + (pointer.clientX - state.dragStartClientX) / safeLayoutScale,
    y: state.dragStartCameraY + (pointer.clientY - state.dragStartClientY) / safeLayoutScale
  };
}

export function endSceneCameraDrag(state: SceneCameraState): SceneCameraState {
  if (!state.isDragging && state.pointerId === null) {
    return state;
  }

  return {
    ...state,
    isDragging: false,
    pointerId: null
  };
}

export function zoomSceneCamera(state: SceneCameraState, deltaY: number): SceneCameraState {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return state;
  }

  const nextScale = clampCameraScale(state.scale * Math.exp(-deltaY * CAMERA_ZOOM_SENSITIVITY), state.minScale, state.maxScale);
  if (nextScale === state.scale) {
    return state;
  }

  return {
    ...state,
    scale: nextScale
  };
}

export function resetSceneCamera(state: SceneCameraState): SceneCameraState {
  return {
    ...state,
    isDragging: false,
    x: 0,
    y: 0,
    scale: clampCameraScale(DEFAULT_CAMERA_SCALE, state.minScale, state.maxScale),
    pointerId: null
  };
}

export function applySceneCamera(container: Container, state: SceneCameraState, viewport: SceneCameraViewport) {
  const offsetX = viewport.designWidth * (1 - state.scale) * 0.5 + state.x;
  const offsetY = viewport.designHeight * (1 - state.scale) * 0.5 + state.y;

  container.position.set(offsetX, offsetY);
  container.scale.set(state.scale);
}