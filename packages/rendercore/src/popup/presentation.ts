import { Container, Graphics } from "pixi.js";
import { calculateMaximizedFocusedArtViewport } from "../viewport/index.js";
import type {
  PopupHostPlacement,
  PopupManifest,
  PopupPresentationSnapshot,
  PopupSize,
} from "./types.js";

const NEUTRAL_PLACEMENT: PopupHostPlacement = Object.freeze({
  x: 0,
  y: 0,
  scale: 1,
});

export interface PopupPresentation {
  readonly container: Container;
  readonly contentRoot: Container;
  applyViewport(
    viewportSize: PopupSize,
    placement?: PopupHostPlacement,
  ): PopupPresentationSnapshot;
  setActive(active: boolean): void;
  destroy(): void;
}

export function createPopupPresentation(
  manifest: PopupManifest,
): PopupPresentation {
  const container = new Container();
  const contentRoot = new Container();
  const v2 = manifest.version === 2 ? manifest : null;
  const backdrop = v2 ? new Graphics() : null;
  let destroyed = false;
  let active = false;
  container.label = `popup ${manifest.id}`;
  contentRoot.label = `popup ${manifest.id} content`;
  if (backdrop) {
    backdrop.label = `popup ${manifest.id} backdrop`;
    backdrop.eventMode = "none";
    backdrop.visible = false;
    container.addChild(backdrop);
  }
  container.addChild(contentRoot);

  return Object.freeze({
    container,
    contentRoot,
    applyViewport(
      viewportSize: PopupSize,
      rawPlacement: PopupHostPlacement = NEUTRAL_PLACEMENT,
    ) {
      assertUsable();
      const viewport = size(viewportSize, "viewportSize");
      const placement = hostPlacement(rawPlacement);
      if (!v2) {
        container.position.set(
          viewport.width / 2 + placement.x,
          viewport.height / 2 + placement.y,
        );
        container.scale.set(placement.scale);
        contentRoot.position.set(0, 0);
        contentRoot.scale.set(1);
        return Object.freeze({
          viewportSize: viewport,
          contentScale: placement.scale,
          contentPosition: Object.freeze({
            x: container.x,
            y: container.y,
          }),
        });
      }

      container.position.set(0, 0);
      container.scale.set(1);
      const artSize = v2.designViewport;
      const focus = v2.adaptation.focus;
      const focusRect = Object.freeze({
        x: artSize.width / 2 - focus.left,
        y: artSize.height / 2 - focus.top,
        width: focus.left + focus.right,
        height: focus.top + focus.bottom,
      });
      const focused = calculateMaximizedFocusedArtViewport({
        artSize,
        pageSize: viewport,
        focusRect,
      });
      const baseScale = Math.min(
        viewport.width / focused.visibleRect.width,
        viewport.height / focused.visibleRect.height,
      );
      const visibleOrigin = Object.freeze({
        x: (viewport.width - focused.visibleRect.width * baseScale) / 2,
        y: (viewport.height - focused.visibleRect.height * baseScale) / 2,
      });
      const contentScale = baseScale * placement.scale;
      const contentPosition = Object.freeze({
        x: snapViewportValue(
          visibleOrigin.x +
            (artSize.width / 2 - focused.visibleRect.x) * baseScale +
            placement.x,
          viewport.width,
        ),
        y: snapViewportValue(
          visibleOrigin.y +
            (artSize.height / 2 - focused.visibleRect.y) * baseScale +
            placement.y,
          viewport.height,
        ),
      });
      contentRoot.position.set(contentPosition.x, contentPosition.y);
      contentRoot.scale.set(contentScale);
      redrawBackdrop(backdrop!, v2.backdrop, viewport, active);
      return Object.freeze({
        viewportSize: viewport,
        contentScale,
        contentPosition,
        focusRectInViewport: Object.freeze({
          x: snapViewportValue(
            visibleOrigin.x + focused.focusRectInViewport.x * baseScale,
            viewport.width,
          ),
          y: snapViewportValue(
            visibleOrigin.y + focused.focusRectInViewport.y * baseScale,
            viewport.height,
          ),
          width: snapViewportValue(
            focused.focusRectInViewport.width * baseScale,
            viewport.width,
          ),
          height: snapViewportValue(
            focused.focusRectInViewport.height * baseScale,
            viewport.height,
          ),
        }),
      });
    },
    setActive(next: boolean) {
      assertUsable();
      active = next;
      if (backdrop) backdrop.visible = next && v2!.backdrop.enabled;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      backdrop?.destroy();
      contentRoot.destroy({ children: false });
      container.destroy({ children: false });
    },
  });

  function assertUsable() {
    if (destroyed) throw new Error("popup presentation was destroyed.");
  }
}

function snapViewportValue(value: number, viewportLength: number): number {
  const tolerance = Math.max(1, viewportLength) * Number.EPSILON * 16;
  for (const boundary of [0, viewportLength / 2, viewportLength])
    if (Math.abs(value - boundary) <= tolerance) return boundary;
  return value;
}

function redrawBackdrop(
  backdrop: Graphics,
  spec: {
    readonly enabled: boolean;
    readonly color: string;
    readonly alpha: number;
  },
  viewport: PopupSize,
  active: boolean,
) {
  backdrop.clear();
  if (spec.enabled)
    backdrop
      .rect(0, 0, viewport.width, viewport.height)
      .fill({ color: spec.color, alpha: spec.alpha });
  backdrop.visible = active && spec.enabled;
}

function size(value: PopupSize, label: string): PopupSize {
  if (
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    !Number.isFinite(value.height) ||
    value.height <= 0
  )
    throw new Error(`${label} must contain positive finite dimensions.`);
  return Object.freeze({ width: value.width, height: value.height });
}

function hostPlacement(value: PopupHostPlacement): PopupHostPlacement {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.scale) ||
    value.scale <= 0
  )
    throw new Error("popup host placement must be finite with positive scale.");
  return Object.freeze({ x: value.x, y: value.y, scale: value.scale });
}
