import type { Container } from "pixi.js";
import { SymbolAnimationError } from "../symbol/errors.js";
import {
  createContainerRenderAnchor,
  type RenderAnchor,
} from "./render-anchor.js";
import {
  cancelRenderObjectMotion,
  createRenderObjectMotionBinding,
  createRenderObjectMotionController,
  type RenderObjectMotion,
  type RenderObjectMotionBinding,
  type RenderObjectMotionPropertyAdapter,
} from "./render-object-motion.js";
import type { RenderObjectLayer } from "./render-object-layer.js";

export type RenderObjectAlignment =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface RenderObjectPlayOptions {
  readonly signal?: AbortSignal;
  /** Plays continuously. The returned Promise resolves after the first loop. */
  readonly loop?: boolean;
}

export interface RenderPoint {
  readonly x: number;
  readonly y: number;
}

export interface RenderScale {
  readonly x: number;
  readonly y: number;
}

export type RenderObjectChildLayerRef =
  | {
      readonly kind: "spine-slot";
      readonly slot: string;
      readonly followSlotColor?: boolean;
    }
  | {
      readonly kind: "vni-text-layer";
      readonly layerId: string;
    };

export interface RenderObject {
  setPosition(position: RenderPoint): void;
  /** Sets local opacity in the inclusive 0..1 range. */
  setOpacity(opacity: number): void;
  /** Sets the object's local clockwise rotation in degrees. */
  setRotation(rotationDegrees: number): void;
  /** Sets the object's local scale; negative factors mirror that axis. */
  setScale(scale: RenderScale): void;
  setVisible(visible: boolean): void;
  readonly motion: RenderObjectMotion;
  play(name?: string, options?: RenderObjectPlayOptions): Promise<void>;
  stop(): void;
  /** Returns an exact opaque child parent owned by this RenderObject. */
  getChildLayer(ref: RenderObjectChildLayerRef): RenderObjectLayer;
  /**
   * Returns the display origin when alignment is omitted, or a live point in
   * the object's current local bounds when alignment is provided.
   */
  getAnchor(alignment?: RenderObjectAlignment): RenderAnchor;
  destroy(): void;
}

export interface CloneableRenderObject extends RenderObject {
  clone(): CloneableRenderObject;
}

export interface RenderObjectAdapter {
  readonly view: Container | (() => Container);
  readonly owned?: boolean;
  /** Supplies logical bounds when Pixi visual bounds are not the object contract. */
  readonly getAlignmentBounds?: (view: Container) => {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  assertUsable?(): void;
  /** Advances object-owned playback while the object is mounted to an owner clock. */
  update?(deltaSeconds: number): void;
  play?(name?: string, options?: RenderObjectPlayOptions): Promise<void>;
  stop?(): void;
  readonly spineSlots?: RenderObjectSpineSlotAdapter;
  getChildLayer?(ref: RenderObjectChildLayerRef): RenderObjectLayer;
  destroy(): void;
}

export interface RenderObjectSpineSlotAdapter {
  attach(options: {
    readonly slot: string;
    readonly object: Container;
    readonly followSlotColor?: boolean;
  }): void;
  remove(object: Container): void;
}

export interface CloneableRenderObjectAdapter extends RenderObjectAdapter {
  clone(): CloneableRenderObject;
}

export interface RegisteredRenderObjectAdapter {
  readonly view: Container;
  readonly owned: boolean;
  assertUsable(): void;
  update?(deltaSeconds: number): void;
  play?(name?: string, options?: RenderObjectPlayOptions): Promise<void>;
  stop?(): void;
  readonly spineSlots?: RenderObjectSpineSlotAdapter;
  getChildLayer?(ref: RenderObjectChildLayerRef): RenderObjectLayer;
  readonly motionChildren: Set<RenderObject>;
  readonly motionBinding: RenderObjectMotionBinding;
  readonly motionAdapter: RenderObjectMotionPropertyAdapter;
  destroy(): void;
}

const adapters = new WeakMap<RenderObject, RegisteredRenderObjectAdapter>();
const cleanupByAdapter = new WeakMap<
  RegisteredRenderObjectAdapter,
  Set<() => void>
>();

export function createRenderObject(adapter: RenderObjectAdapter): RenderObject {
  return createRenderObjectBase(adapter);
}

export function createCloneableRenderObject(
  adapter: CloneableRenderObjectAdapter,
): CloneableRenderObject {
  const base = createRenderObjectBase(adapter);
  const object = Object.freeze({
    ...base,
    clone: () => {
      getRenderObjectAdapter(base).assertUsable();
      return adapter.clone();
    },
  }) satisfies CloneableRenderObject;
  registerRenderObjectAlias(object, getRenderObjectAdapter(base));
  return object;
}

function createRenderObjectBase(adapter: RenderObjectAdapter): RenderObject {
  let destroyed = false;
  const motionBinding = createRenderObjectMotionBinding();
  const resolveView = (): Container =>
    typeof adapter.view === "function" ? adapter.view() : adapter.view;
  const assertUsable = (): void => {
    if (destroyed)
      throw new SymbolAnimationError("RenderObject was destroyed.");
    adapter.assertUsable?.();
  };
  const registered = Object.freeze({
    get view(): Container {
      assertUsable();
      return resolveView();
    },
    owned: adapter.owned ?? true,
    assertUsable,
    ...(adapter.update ? { update: adapter.update } : {}),
    ...(adapter.play ? { play: adapter.play } : {}),
    ...(adapter.stop ? { stop: adapter.stop } : {}),
    ...(adapter.spineSlots ? { spineSlots: adapter.spineSlots } : {}),
    ...(adapter.getChildLayer ? { getChildLayer: adapter.getChildLayer } : {}),
    motionChildren: new Set<RenderObject>(),
    motionBinding,
    motionAdapter: Object.freeze({
      owned: adapter.owned ?? true,
      assertUsable,
      capture: () => {
        assertUsable();
        const view = resolveView();
        return Object.freeze({
          position: Object.freeze({ x: view.x, y: view.y }),
          opacity: view.alpha,
          scale: Object.freeze({ x: view.scale.x, y: view.scale.y }),
          rotationDegrees: view.angle,
        });
      },
      apply: (
        state: import("./render-object-motion.js").RenderObjectMotionState,
      ) => {
        assertUsable();
        const view = resolveView();
        view.position.set(state.position.x, state.position.y);
        view.alpha = state.opacity;
        view.scale.set(state.scale.x, state.scale.y);
        view.angle = state.rotationDegrees;
      },
    }),
    destroy: adapter.destroy,
  }) satisfies RegisteredRenderObjectAdapter;
  let object!: RenderObject;
  const motion = createRenderObjectMotionController(
    motionBinding,
    assertUsable,
    registered.motionAdapter,
  );
  object = Object.freeze({
    setPosition: (position: RenderPoint) => {
      assertUsable();
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
        throw new SymbolAnimationError(
          "RenderObject position must contain finite coordinates.",
        );
      cancelRenderObjectMotion(
        motionBinding,
        "RenderObject motion was superseded by a direct position change.",
      );
      resolveView().position.set(position.x, position.y);
    },
    setOpacity: (opacity: number) => {
      assertUsable();
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
        throw new SymbolAnimationError(
          "RenderObject opacity must be between 0 and 1.",
        );
      cancelRenderObjectMotion(
        motionBinding,
        "RenderObject motion was superseded by a direct opacity change.",
      );
      resolveView().alpha = opacity;
    },
    setRotation: (rotationDegrees: number) => {
      assertUsable();
      if (!Number.isFinite(rotationDegrees))
        throw new SymbolAnimationError(
          "RenderObject rotation must be a finite number of degrees.",
        );
      cancelRenderObjectMotion(
        motionBinding,
        "RenderObject motion was superseded by a direct rotation change.",
      );
      resolveView().angle = rotationDegrees;
    },
    setScale: (scale: RenderScale) => {
      assertUsable();
      if (!Number.isFinite(scale.x) || !Number.isFinite(scale.y))
        throw new SymbolAnimationError(
          "RenderObject scale must contain finite factors.",
        );
      cancelRenderObjectMotion(
        motionBinding,
        "RenderObject motion was superseded by a direct scale change.",
      );
      resolveView().scale.set(scale.x, scale.y);
    },
    setVisible: (visible: boolean) => {
      assertUsable();
      if (typeof visible !== "boolean")
        throw new SymbolAnimationError(
          "RenderObject visibility must be boolean.",
        );
      resolveView().visible = visible;
    },
    motion,
    play: (name?: string, options?: RenderObjectPlayOptions) => {
      assertUsable();
      if (options?.signal?.aborted)
        return Promise.reject(
          new SymbolAnimationError("RenderObject playback was aborted."),
        );
      if (options?.loop !== undefined && typeof options.loop !== "boolean")
        return Promise.reject(
          new SymbolAnimationError(
            "RenderObject playback loop must be boolean.",
          ),
        );
      if (!adapter.play)
        return Promise.reject(
          new SymbolAnimationError("RenderObject does not support playback."),
        );
      return adapter.play(name, options);
    },
    stop: () => {
      assertUsable();
      adapter.stop?.();
    },
    getChildLayer: (ref: RenderObjectChildLayerRef) => {
      assertUsable();
      if (!ref || typeof ref !== "object")
        throw new SymbolAnimationError(
          "RenderObject child layer reference is required.",
        );
      if (!adapter.getChildLayer)
        throw new SymbolAnimationError(
          "RenderObject does not expose child layers.",
        );
      return adapter.getChildLayer(ref);
    },
    getAnchor: (alignment?: RenderObjectAlignment) => {
      assertUsable();
      if (alignment === undefined)
        return createContainerRenderAnchor(() => registered.view);
      assertRenderObjectAlignment(alignment);
      return createContainerRenderAnchor(
        () => registered.view,
        (view) =>
          resolveAlignmentPoint(
            alignment,
            adapter.getAlignmentBounds?.(view) ?? view.getLocalBounds(),
          ),
      );
    },
    destroy: () => {
      if (destroyed) return;
      assertUsable();
      if (!registered.owned)
        throw new SymbolAnimationError(
          "Borrowed RenderObject cannot be destroyed.",
        );
      const view = resolveView();
      runRenderObjectCleanup(registered);
      cancelRenderObjectMotion(
        motionBinding,
        "RenderObject was destroyed during motion.",
      );
      view.parent?.removeChild(view);
      destroyed = true;
      adapter.destroy();
    },
  }) satisfies RenderObject;
  adapters.set(object, registered);
  return object;
}

function assertRenderObjectAlignment(alignment: RenderObjectAlignment): void {
  switch (alignment) {
    case "top-left":
    case "top-center":
    case "top-right":
    case "center-left":
    case "center":
    case "center-right":
    case "bottom-left":
    case "bottom-center":
    case "bottom-right":
      return;
    default:
      throw new SymbolAnimationError(
        `Unknown RenderObject alignment "${String(alignment)}".`,
      );
  }
}

function resolveAlignmentPoint(
  alignment: RenderObjectAlignment,
  bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): RenderPoint {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width < 0 ||
    bounds.height < 0
  )
    throw new SymbolAnimationError(
      "RenderObject alignment bounds must be finite with non-negative size.",
    );
  const centerX = bounds.x + bounds.width * 0.5;
  const right = bounds.x + bounds.width;
  const centerY = bounds.y + bounds.height * 0.5;
  const bottom = bounds.y + bounds.height;
  switch (alignment) {
    case "top-left":
      return { x: bounds.x, y: bounds.y };
    case "top-center":
      return { x: centerX, y: bounds.y };
    case "top-right":
      return { x: right, y: bounds.y };
    case "center-left":
      return { x: bounds.x, y: centerY };
    case "center":
      return { x: centerX, y: centerY };
    case "center-right":
      return { x: right, y: centerY };
    case "bottom-left":
      return { x: bounds.x, y: bottom };
    case "bottom-center":
      return { x: centerX, y: bottom };
    case "bottom-right":
      return { x: right, y: bottom };
  }
}

export function getRenderObjectAdapter(
  object: RenderObject,
): RegisteredRenderObjectAdapter {
  const adapter = adapters.get(object);
  if (!adapter) {
    throw new SymbolAnimationError(
      "RenderObject was not created by the active RenderCore runtime.",
    );
  }
  return adapter;
}

export function registerRenderObjectAlias(
  object: RenderObject,
  adapter: RegisteredRenderObjectAdapter,
): void {
  adapters.set(object, adapter);
}

/** @internal Presentation capabilities use this to release relationships before destroy. */
export function registerRenderObjectCleanup(
  object: RenderObject,
  cleanup: () => void,
): () => void {
  const adapter = getRenderObjectAdapter(object);
  let callbacks = cleanupByAdapter.get(adapter);
  if (!callbacks) {
    callbacks = new Set();
    cleanupByAdapter.set(adapter, callbacks);
  }
  callbacks.add(cleanup);
  return () => callbacks?.delete(cleanup);
}

function runRenderObjectCleanup(adapter: RegisteredRenderObjectAdapter): void {
  const callbacks = cleanupByAdapter.get(adapter);
  if (!callbacks) return;
  cleanupByAdapter.delete(adapter);
  for (const cleanup of [...callbacks]) cleanup();
}

/** @internal RenderObject pools reset a live instance without changing destroy semantics. */
export function resetRenderObjectForReuse(object: RenderObject): void {
  const adapter = getRenderObjectAdapter(object);
  adapter.assertUsable();
  runRenderObjectCleanup(adapter);
  cancelRenderObjectMotion(
    adapter.motionBinding,
    "RenderObject motion was cancelled while returning to its pool.",
  );
  adapter.stop?.();
  const view = adapter.view;
  view.parent?.removeChild(view);
  view.position.set(0, 0);
  view.alpha = 1;
  view.angle = 0;
  view.scale.set(1, 1);
  view.visible = true;
  view.zIndex = 0;
}
