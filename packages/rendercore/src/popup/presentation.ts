import { Container, Graphics } from "pixi.js";
import {
  calculateMaximizedFocusedArtViewport,
  calculateUnboundedMaximizedFocusedViewport,
} from "../viewport/index.js";
import type {
  PopupHostPlacement,
  PopupManifest,
  PopupPresentationSnapshot,
  PopupSize,
  PopupVisibilityState,
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
  setState(state: PopupVisibilityState | null): void;
  destroy(): void;
}

export interface PopupBackdropController {
  readonly view: Graphics;
  update(
    owner: object,
    spec: Exclude<PopupManifest, { readonly version: 1 }>["backdrop"],
    viewport: PopupSize,
    active: boolean,
    state: PopupVisibilityState | null,
  ): void;
  release(owner: object): void;
  destroy(): void;
}

export function createPopupBackdropController(
  label = "shared popup backdrop",
): PopupBackdropController {
  const view = new Graphics();
  let currentOwner: object | null = null;
  let destroyed = false;
  view.label = label;
  view.eventMode = "none";
  view.visible = false;
  return Object.freeze({
    view,
    update(
      owner: object,
      spec: Exclude<PopupManifest, { readonly version: 1 }>["backdrop"],
      viewport: PopupSize,
      active: boolean,
      state: PopupVisibilityState | null,
    ) {
      assertUsable();
      if (!active) {
        if (currentOwner === owner) {
          currentOwner = null;
          view.visible = false;
        }
        return;
      }
      currentOwner = owner;
      redrawBackdrop(view, spec, viewport, true, state);
    },
    release(owner: object) {
      if (destroyed || currentOwner !== owner) return;
      currentOwner = null;
      view.visible = false;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      currentOwner = null;
      view.destroy();
    },
  });

  function assertUsable() {
    if (destroyed) throw new Error("popup backdrop controller was destroyed.");
  }
}

export function createPopupPresentation(
  manifest: PopupManifest,
  options: { readonly backdropController?: PopupBackdropController } = {},
): PopupPresentation {
  const container = new Container();
  const contentRoot = new Container();
  const modern = manifest.version === 1 ? null : manifest;
  const ownedBackdrop =
    modern && !options.backdropController
      ? createPopupBackdropController(`popup ${manifest.id} backdrop`)
      : null;
  const backdrop = modern
    ? (options.backdropController ?? ownedBackdrop!)
    : null;
  const backdropOwner = Object.freeze({});
  let destroyed = false;
  let active = false;
  let state: PopupVisibilityState | null = null;
  let appliedViewport: PopupSize | null = null;
  container.label = `popup ${manifest.id}`;
  contentRoot.label = `popup ${manifest.id} content`;
  if (ownedBackdrop) container.addChild(ownedBackdrop.view);
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
      appliedViewport = viewport;
      if (!modern) {
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
      const focus = modern.adaptation.focus;
      const artSize = modern.version === 2 ? modern.designViewport : null;
      const focusRect = Object.freeze({
        x: (artSize ? artSize.width / 2 : 0) - focus.left,
        y: (artSize ? artSize.height / 2 : 0) - focus.top,
        width: focus.left + focus.right,
        height: focus.top + focus.bottom,
      });
      const focused = artSize
        ? calculateMaximizedFocusedArtViewport({
            artSize,
            pageSize: viewport,
            focusRect,
          })
        : calculateUnboundedMaximizedFocusedViewport({
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
            ((artSize ? artSize.width / 2 : 0) - focused.visibleRect.x) *
              baseScale +
            placement.x,
          viewport.width,
        ),
        y: snapViewportValue(
          visibleOrigin.y +
            ((artSize ? artSize.height / 2 : 0) - focused.visibleRect.y) *
              baseScale +
            placement.y,
          viewport.height,
        ),
      });
      contentRoot.position.set(contentPosition.x, contentPosition.y);
      contentRoot.scale.set(contentScale);
      backdrop!.update(backdropOwner, modern.backdrop, viewport, active, state);
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
      if (backdrop && appliedViewport)
        backdrop.update(
          backdropOwner,
          modern!.backdrop,
          appliedViewport,
          next,
          state,
        );
      else if (backdrop && !next) backdrop.release(backdropOwner);
    },
    setState(next: PopupVisibilityState | null) {
      assertUsable();
      state = next;
      if (backdrop && appliedViewport)
        backdrop.update(
          backdropOwner,
          modern!.backdrop,
          appliedViewport,
          active,
          state,
        );
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      backdrop?.release(backdropOwner);
      ownedBackdrop?.destroy();
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
  state: PopupVisibilityState | null,
) {
  backdrop.clear();
  if (spec.enabled)
    backdrop
      .rect(0, 0, viewport.width, viewport.height)
      .fill({ color: spec.color, alpha: spec.alpha });
  backdrop.visible =
    active &&
    spec.enabled &&
    (!("visibleStates" in spec) ||
      (state !== null &&
        (spec.visibleStates as readonly PopupVisibilityState[]).includes(
          state,
        )));
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
