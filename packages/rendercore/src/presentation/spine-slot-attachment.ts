import { SymbolAnimationError } from "../symbol/errors.js";
import {
  getRenderObjectAdapter,
  registerRenderObjectCleanup,
  type RenderObject,
} from "./render-object.js";
import {
  attachToRenderObjectMotionOwner,
  type RenderObjectMotionAttachment,
} from "./render-object-motion.js";

export interface SpineSlotRenderObjectAttachment {
  detach(): void;
}

export interface AttachRenderObjectToSpineSlotOptions {
  readonly spine: RenderObject;
  readonly child: RenderObject;
  readonly slot: string;
  readonly followSlotColor?: boolean;
}

interface ActiveAttachment {
  detached: boolean;
}

const attachedChildren = new WeakMap<object, ActiveAttachment>();

/**
 * Attaches an owned detached RenderObject to an exact slot of an owned
 * program Spine RenderObject. Neither object transfers destroy ownership.
 */
export function attachRenderObjectToSpineSlot(
  options: AttachRenderObjectToSpineSlotOptions,
): SpineSlotRenderObjectAttachment {
  if (!options || typeof options !== "object")
    throw new SymbolAnimationError(
      "Spine slot attachment options are required.",
    );
  if (options.spine === options.child)
    throw new SymbolAnimationError(
      "A RenderObject cannot attach to its own Spine slot.",
    );
  if (
    typeof options.slot !== "string" ||
    options.slot.length === 0 ||
    options.slot !== options.slot.trim()
  )
    throw new SymbolAnimationError(
      "Spine slot attachment requires an exact non-empty slot name.",
    );
  if (
    options.followSlotColor !== undefined &&
    typeof options.followSlotColor !== "boolean"
  )
    throw new SymbolAnimationError(
      "Spine slot followSlotColor must be boolean.",
    );

  const spine = getRenderObjectAdapter(options.spine);
  const child = getRenderObjectAdapter(options.child);
  if (!spine.owned || !child.owned)
    throw new SymbolAnimationError(
      "Spine slot attachment requires owned RenderObjects.",
    );
  if (!spine.spineSlots)
    throw new SymbolAnimationError(
      "Target RenderObject does not support Spine slot attachment.",
    );
  if (child.view.parent)
    throw new SymbolAnimationError(
      "Spine slot child RenderObject must be detached.",
    );
  if (attachedChildren.has(child))
    throw new SymbolAnimationError(
      "RenderObject is already attached to a Spine slot.",
    );

  spine.spineSlots.attach({
    slot: options.slot,
    object: child.view,
    ...(options.followSlotColor === undefined
      ? {}
      : { followSlotColor: options.followSlotColor }),
  });

  let motionAttachment: RenderObjectMotionAttachment | null = null;
  try {
    motionAttachment = attachToRenderObjectMotionOwner(
      spine,
      options.child,
    );
  } catch (error) {
    spine.spineSlots.remove(child.view);
    throw error;
  }

  const active: ActiveAttachment = { detached: false };
  attachedChildren.set(child, active);
  let unregisterSpineCleanup = () => {};
  let unregisterChildCleanup = () => {};
  const detach = (): void => {
    if (active.detached) return;
    active.detached = true;
    attachedChildren.delete(child);
    unregisterSpineCleanup();
    unregisterChildCleanup();
    motionAttachment?.detach();
    spine.spineSlots!.remove(child.view);
  };
  unregisterSpineCleanup = registerRenderObjectCleanup(options.spine, detach);
  unregisterChildCleanup = registerRenderObjectCleanup(options.child, detach);
  return Object.freeze({ detach });
}
