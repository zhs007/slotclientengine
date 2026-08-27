import type { ImageStringResource } from "../image-string/core/index.js";
import { createRenderImageString } from "../image-string/core/index.js";
import {
  computeAlignmentOffset,
  createCloneableRenderObject,
  getRenderObjectAdapter,
  registerRenderObjectAlias,
  type CloneableRenderObject,
  type RenderObjectAlignment,
} from "./render-object.js";
import {createContainerRenderAnchor, type RenderAnchor} from "./render-anchor.js";

export interface ImgNumberRenderObject extends CloneableRenderObject {
  setText(text: string): void;
  getText(): string;
  setAnchor(anchor: { readonly x: number; readonly y: number }): void;
  clone(): ImgNumberRenderObject;
  getAnchor(alignment?: RenderObjectAlignment): RenderAnchor;
}

export interface CreateImgNumberRenderObjectOptions {
  readonly resource: ImageStringResource;
  readonly text: string;
  readonly anchor?: { readonly x: number; readonly y: number };
}

interface ImgNumberRenderObjectLifecycle {
  readonly onCreate?: (object: ImgNumberRenderObject) => void;
  readonly onDestroy?: (object: ImgNumberRenderObject) => void;
}

export function createImgNumberRenderObject(
  options: CreateImgNumberRenderObjectOptions,
): ImgNumberRenderObject {
  return createManagedImgNumberRenderObject(options);
}

/** @internal Scene Layout package runtimes use this to keep their cleanup ledger exact. */
export function createManagedImgNumberRenderObject(
  options: CreateImgNumberRenderObjectOptions,
  lifecycle: ImgNumberRenderObjectLifecycle = {},
): ImgNumberRenderObject {
  const renderer = createRenderImageString(options);
  let object!: ImgNumberRenderObject;
  let destroyed = false;
  const clone = (): ImgNumberRenderObject => {
    const geometry = renderer.getGeometry();
    return createManagedImgNumberRenderObject(
      {
        resource: options.resource,
        text: renderer.getText(),
        anchor: geometry.anchor,
      },
      lifecycle,
    );
  };
  const getAnchor = (alignment?: RenderObjectAlignment): RenderAnchor => {
    const adapter = getRenderObjectAdapter(base);
    if (destroyed) return createContainerRenderAnchor(() => adapter.view);
    if (!alignment || alignment === "top-left")
      return createContainerRenderAnchor(() => adapter.view);
    const geometry = renderer.getGeometry();
    const bounds = geometry.logicalBounds;
    const size = {width: bounds.width, height: bounds.height};
    const offset = computeAlignmentOffset(alignment, size);
    const origin = {x: bounds.x, y: bounds.y};
    const getPoint = (): {readonly x: number; readonly y: number} => ({
      x: origin.x + offset.x,
      y: origin.y + offset.y,
    });
    return createContainerRenderAnchor(() => adapter.view, getPoint);
  };
  const base = createCloneableRenderObject({
    view: renderer.container,
    clone,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      renderer.destroy();
      lifecycle.onDestroy?.(object);
    },
  });
  object = Object.freeze({
    ...base,
    setText: (text: string) => renderer.setText(text),
    getText: () => renderer.getText(),
    setAnchor: (anchor: { readonly x: number; readonly y: number }) =>
      renderer.setAnchor(anchor),
    clone,
    getAnchor,
  }) satisfies ImgNumberRenderObject;
  registerRenderObjectAlias(object, getRenderObjectAdapter(base));
  lifecycle.onCreate?.(object);
  return object;
}
