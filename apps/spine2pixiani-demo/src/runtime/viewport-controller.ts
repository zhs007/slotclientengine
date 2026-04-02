export type ViewportPoint = {
  x: number;
  y: number;
};

export type ViewportState = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  panX: number;
  panY: number;
};

export function createViewportState(input?: Partial<ViewportState>): ViewportState {
  const minZoom = input?.minZoom ?? 0.6;
  const maxZoom = input?.maxZoom ?? 2.4;
  const zoom = clampZoom(input?.zoom ?? 1, minZoom, maxZoom);

  return {
    zoom,
    minZoom,
    maxZoom,
    panX: input?.panX ?? 0,
    panY: input?.panY ?? 0
  };
}

export function panViewport(state: ViewportState, panX: number, panY: number): ViewportState {
  return {
    ...state,
    panX,
    panY
  };
}

export function zoomViewportAtPoint(
  state: ViewportState,
  factor: number,
  anchor: ViewportPoint
): ViewportState {
  const nextZoom = clampZoom(state.zoom * factor, state.minZoom, state.maxZoom);
  if (nextZoom === state.zoom) {
    return state;
  }

  const zoomRatio = nextZoom / state.zoom;

  return {
    ...state,
    zoom: nextZoom,
    panX: anchor.x - (anchor.x - state.panX) * zoomRatio,
    panY: anchor.y - (anchor.y - state.panY) * zoomRatio
  };
}

function clampZoom(value: number, minZoom: number, maxZoom: number) {
  return Math.min(maxZoom, Math.max(minZoom, value));
}