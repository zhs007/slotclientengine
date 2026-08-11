import type {
  RenderViewportRect,
  RenderViewportSize,
} from "./focused-art-viewport.js";

export interface UnboundedMaximizedFocusedViewportOptions {
  readonly pageSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
}

export interface UnboundedMaximizedFocusedViewport {
  readonly viewportSize: RenderViewportSize;
  readonly visibleRect: RenderViewportRect;
  readonly worldOffset: { readonly x: number; readonly y: number };
  readonly focusRectInViewport: RenderViewportRect;
}

/**
 * Projects a finite authored focus rect into an unbounded authored plane.
 * The focus is contained by the page and the remaining page aspect extends
 * equally around the focus center without finite art-bound clamping.
 */
export function calculateUnboundedMaximizedFocusedViewport(
  options: UnboundedMaximizedFocusedViewportOptions,
): UnboundedMaximizedFocusedViewport {
  const pageSize = size(options.pageSize, "pageSize");
  const focusRect = rect(options.focusRect, "focusRect");
  const focusScale = Math.min(
    pageSize.width / focusRect.width,
    pageSize.height / focusRect.height,
  );
  const viewportSize = freezeSize({
    width: pageSize.width / focusScale,
    height: pageSize.height / focusScale,
  });
  const visibleRect = freezeRect({
    x: focusRect.x + focusRect.width / 2 - viewportSize.width / 2,
    y: focusRect.y + focusRect.height / 2 - viewportSize.height / 2,
    width: viewportSize.width,
    height: viewportSize.height,
  });
  return Object.freeze({
    viewportSize,
    visibleRect,
    worldOffset: Object.freeze({ x: -visibleRect.x, y: -visibleRect.y }),
    focusRectInViewport: freezeRect({
      x: focusRect.x - visibleRect.x,
      y: focusRect.y - visibleRect.y,
      width: focusRect.width,
      height: focusRect.height,
    }),
  });
}

function size(value: RenderViewportSize, label: string) {
  if (
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    !Number.isFinite(value.height) ||
    value.height <= 0
  )
    throw new Error(`${label} must contain positive finite dimensions.`);
  return freezeSize(value);
}

function rect(value: RenderViewportRect, label: string) {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    !Number.isFinite(value.height) ||
    value.height <= 0
  )
    throw new Error(
      `${label} must contain finite coordinates and positive finite dimensions.`,
    );
  return freezeRect(value);
}

function freezeSize(value: RenderViewportSize): RenderViewportSize {
  return Object.freeze({ width: value.width, height: value.height });
}

function freezeRect(value: RenderViewportRect): RenderViewportRect {
  return Object.freeze({
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  });
}
