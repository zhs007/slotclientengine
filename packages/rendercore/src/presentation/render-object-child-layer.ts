import { Container } from "pixi.js";
import { SymbolAnimationError } from "../symbol/errors.js";
import {
  getRenderObjectAdapter,
  registerRenderObjectCleanup,
  type RenderObject,
} from "./render-object.js";
import {
  createRenderObjectLayer,
  type RenderObjectLayer,
  type RenderObjectLayerController,
} from "./render-object-layer.js";
import { attachToRenderObjectMotionOwner } from "./render-object-motion.js";

export interface RenderObjectChildLayerController {
  readonly layer: RenderObjectLayer;
  destroy(): void;
}

/** @internal Adapts an exact Spine/VNI attachment point to RenderObjectLayer. */
export function createRenderObjectChildLayer(options: {
  readonly owner: RenderObject;
  readonly label: string;
  attach(view: Container): void;
  detach(view: Container): void;
  readonly createError?: (message: string) => Error;
}): RenderObjectChildLayerController {
  const ownerAdapter = getRenderObjectAdapter(options.owner);
  ownerAdapter.assertUsable();
  const view = new Container();
  view.label = options.label;
  view.sortableChildren = true;
  let destroyed = false;
  const createError =
    options.createError ??
    ((message: string) => new SymbolAnimationError(message));
  const assertUsable = (): void => {
    ownerAdapter.assertUsable();
    if (destroyed) throw createError(`${options.label} was destroyed.`);
  };
  options.attach(view);
  let controller: RenderObjectLayerController;
  try {
    controller = createRenderObjectLayer({
      view,
      label: options.label,
      assertUsable,
      createError,
      attachMotion: (child) =>
        attachToRenderObjectMotionOwner(ownerAdapter, child),
    });
  } catch (error) {
    options.detach(view);
    view.destroy({ children: false });
    throw error;
  }
  let unregisterCleanup = () => {};
  const destroy = (): void => {
    if (destroyed) return;
    unregisterCleanup();
    controller.detachAll();
    options.detach(view);
    destroyed = true;
    view.destroy({ children: false });
  };
  unregisterCleanup = registerRenderObjectCleanup(options.owner, destroy);
  return Object.freeze({ layer: controller.layer, destroy });
}
