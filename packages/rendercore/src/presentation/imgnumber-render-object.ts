import type { ImageStringResource } from "../image-string/core/index.js";
import { createRenderImageString } from "../image-string/core/index.js";
import {
  createCloneableRenderObject,
  getRenderObjectAdapter,
  registerRenderObjectAlias,
  type CloneableRenderObject,
} from "./render-object.js";

export interface ImgNumberRenderObject extends CloneableRenderObject {
  setText(text: string): void;
  getText(): string;
  clone(): ImgNumberRenderObject;
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
    clone,
  }) satisfies ImgNumberRenderObject;
  registerRenderObjectAlias(object, getRenderObjectAdapter(base));
  lifecycle.onCreate?.(object);
  return object;
}
