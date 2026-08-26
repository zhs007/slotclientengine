import { SymbolAnimationError } from "../symbol/errors.js";
import {
  createRenderObject,
  getRenderObjectAdapter,
  registerRenderObjectAlias,
  resetRenderObjectForReuse,
  type RenderObject,
} from "./render-object.js";

export interface RenderObjectPool<T extends RenderObject = RenderObject> {
  /** Returns a pooled object whose destroy() resets and returns it to this pool. */
  create(prepare?: (object: T) => void): Promise<T>;
  destroy(): void;
}

export interface CreateRenderObjectPoolOptions<
  T extends RenderObject = RenderObject,
> {
  readonly create: () => T | Promise<T>;
  readonly decorate?: (base: RenderObject, source: T) => T;
  readonly createError?: (message: string) => Error;
}

interface PoolSlot<T extends RenderObject> {
  readonly object: T;
  state: "idle" | "acquired" | "destroyed";
  acquiredObject: RenderObject | null;
}

/**
 * Owns reusable RenderObjects while exposing a fresh stale-aware capability for
 * every checkout. The pool starts empty and grows only to observed concurrency.
 */
export function createRenderObjectPool(
  options: CreateRenderObjectPoolOptions,
): RenderObjectPool;
export function createRenderObjectPool<T extends RenderObject>(
  options: CreateRenderObjectPoolOptions<T>,
): RenderObjectPool<T>;
export function createRenderObjectPool<T extends RenderObject>(
  options: CreateRenderObjectPoolOptions<T>,
): RenderObjectPool<T> {
  const createError =
    options.createError ??
    ((message: string) => new SymbolAnimationError(message));
  const slots = new Set<PoolSlot<T>>();
  const idle: PoolSlot<T>[] = [];
  let destroyed = false;

  const assertAlive = (): void => {
    if (destroyed) throw createError("RenderObject pool was destroyed.");
  };

  const destroySlot = (slot: PoolSlot<T>): void => {
    if (slot.state === "destroyed") return;
    slot.state = "destroyed";
    slots.delete(slot);
    const index = idle.indexOf(slot);
    if (index >= 0) idle.splice(index, 1);
    slot.object.destroy();
  };

  const createSlot = async (): Promise<PoolSlot<T>> => {
    const object = await options.create();
    let adapter;
    try {
      adapter = getRenderObjectAdapter(object);
      adapter.assertUsable();
      if (!adapter.owned)
        throw createError("RenderObject pool requires caller-owned objects.");
      if (adapter.view.parent)
        throw createError("RenderObject pool requires detached objects.");
    } catch (error) {
      try {
        if (adapter?.owned) object.destroy();
      } catch {
        // Preserve the validation error.
      }
      throw error;
    }
    if (destroyed) {
      object.destroy();
      throw createError("RenderObject pool was destroyed during create().");
    }
    const slot: PoolSlot<T> = {
      object,
      state: "acquired",
      acquiredObject: null,
    };
    slots.add(slot);
    return slot;
  };

  const acquireSlot = (slot: PoolSlot<T>, prepare?: (object: T) => void): T => {
    slot.state = "acquired";
    let active = true;
    let acquiredObject!: RenderObject;
    const assertAcquired = (): void => {
      if (!active || slot.state !== "acquired")
        throw createError("Pooled RenderObject is stale.");
      getRenderObjectAdapter(slot.object).assertUsable();
    };
    const source = getRenderObjectAdapter(slot.object);
    acquiredObject = createRenderObject({
      view: () => {
        assertAcquired();
        return source.view;
      },
      owned: true,
      assertUsable: assertAcquired,
      ...(source.update
        ? { update: (deltaSeconds: number) => source.update!(deltaSeconds) }
        : {}),
      ...(source.play
        ? {
            play: (name, playOptions) => slot.object.play(name, playOptions),
          }
        : {}),
      stop: () => slot.object.stop(),
      ...(source.spineSlots ? { spineSlots: source.spineSlots } : {}),
      ...(source.getChildLayer
        ? { getChildLayer: (ref) => slot.object.getChildLayer(ref) }
        : {}),
      destroy: () => {
        if (!active) return;
        active = false;
        slot.acquiredObject = null;
        try {
          resetRenderObjectForReuse(slot.object);
          if (destroyed) destroySlot(slot);
          else {
            slot.state = "idle";
            idle.push(slot);
          }
        } catch (error) {
          try {
            destroySlot(slot);
          } catch {
            // Preserve the reset error.
          }
          throw error;
        }
      },
    });
    let result: T;
    try {
      prepare?.(slot.object);
      result = options.decorate
        ? options.decorate(acquiredObject, slot.object)
        : (acquiredObject as T);
      if (result !== acquiredObject)
        registerRenderObjectAlias(
          result,
          getRenderObjectAdapter(acquiredObject),
        );
    } catch (error) {
      active = false;
      destroySlot(slot);
      throw error;
    }
    slot.acquiredObject = result;
    return result;
  };

  return Object.freeze({
    create: async (prepare?: (object: T) => void): Promise<T> => {
      assertAlive();
      const slot = idle.pop() ?? (await createSlot());
      assertAlive();
      return acquireSlot(slot, prepare);
    },
    destroy: (): void => {
      if (destroyed) return;
      destroyed = true;
      for (const slot of [...slots]) {
        if (slot.acquiredObject) slot.acquiredObject.destroy();
        else destroySlot(slot);
      }
      idle.length = 0;
    },
  });
}
