import { panViewport, zoomViewportAtPoint, type ViewportPoint, type ViewportState } from "./viewport-controller.js";

export type ViewportTransformTarget = {
  position: {
    set: (x: number, y: number) => void;
  };
  scale: {
    set: (x: number, y?: number) => void;
  };
};

export type ViewportInteractionState = {
  isActive: boolean;
  isDragging: boolean;
  pointerId: number | null;
  dragStartClientX: number;
  dragStartClientY: number;
  dragStartPanX: number;
  dragStartPanY: number;
};

export type ViewportDragStart = {
  pointerId: number;
  clientX: number;
  clientY: number;
  panX: number;
  panY: number;
};

export type ViewportDragUpdate = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

export type ViewportWheelZoomInput = {
  deltaY: number;
  anchor: ViewportPoint;
  isPointerInsideStage: boolean;
  zoomStep?: number;
};

export function createViewportInteractionState(
  input?: Partial<ViewportInteractionState>
): ViewportInteractionState {
  return {
    isActive: input?.isActive ?? false,
    isDragging: input?.isDragging ?? false,
    pointerId: input?.pointerId ?? null,
    dragStartClientX: input?.dragStartClientX ?? 0,
    dragStartClientY: input?.dragStartClientY ?? 0,
    dragStartPanX: input?.dragStartPanX ?? 0,
    dragStartPanY: input?.dragStartPanY ?? 0
  };
}

export function applyViewportTransform(target: ViewportTransformTarget, state: ViewportState) {
  target.position.set(state.panX, state.panY);
  target.scale.set(state.zoom);
}

export function activateViewportInteraction(state: ViewportInteractionState): ViewportInteractionState {
  return {
    ...state,
    isActive: true
  };
}

export function deactivateViewportInteraction(state: ViewportInteractionState): ViewportInteractionState {
  return resetViewportDrag(state, false);
}

export function beginViewportDrag(
  state: ViewportInteractionState,
  input: ViewportDragStart
): ViewportInteractionState {
  return {
    ...state,
    isActive: true,
    isDragging: true,
    pointerId: input.pointerId,
    dragStartClientX: input.clientX,
    dragStartClientY: input.clientY,
    dragStartPanX: input.panX,
    dragStartPanY: input.panY
  };
}

export function updateViewportDrag(
  state: ViewportInteractionState,
  viewportState: ViewportState,
  input: ViewportDragUpdate
) {
  if (!state.isDragging || state.pointerId !== input.pointerId) {
    return {
      interactionState: state,
      viewportState
    };
  }

  const deltaX = input.clientX - state.dragStartClientX;
  const deltaY = input.clientY - state.dragStartClientY;

  return {
    interactionState: state,
    viewportState: panViewport(viewportState, state.dragStartPanX + deltaX, state.dragStartPanY + deltaY)
  };
}

export function endViewportDrag(state: ViewportInteractionState, pointerId?: number): ViewportInteractionState {
  if (pointerId !== undefined && state.pointerId !== null && state.pointerId !== pointerId) {
    return state;
  }

  return resetViewportDrag(state, state.isActive);
}

export function canZoomViewport(state: ViewportInteractionState, isPointerInsideStage: boolean) {
  return state.isActive && isPointerInsideStage;
}

export function zoomViewportWithWheel(
  viewportState: ViewportState,
  interactionState: ViewportInteractionState,
  input: ViewportWheelZoomInput
) {
  if (input.deltaY === 0 || !canZoomViewport(interactionState, input.isPointerInsideStage)) {
    return {
      handled: false,
      viewportState
    };
  }

  const zoomStep = input.zoomStep ?? 1.1;
  const factor = input.deltaY < 0 ? zoomStep : 1 / zoomStep;

  return {
    handled: true,
    viewportState: zoomViewportAtPoint(viewportState, factor, input.anchor)
  };
}

function resetViewportDrag(state: ViewportInteractionState, isActive: boolean): ViewportInteractionState {
  return {
    ...state,
    isActive,
    isDragging: false,
    pointerId: null,
    dragStartClientX: 0,
    dragStartClientY: 0,
    dragStartPanX: 0,
    dragStartPanY: 0
  };
}