import type { Container } from "pixi.js";
import { SymbolAnimationError } from "../symbol/errors.js";
import {
  createContainerRenderAnchor,
  type RenderAnchor,
} from "./render-anchor.js";

export interface RenderObjectPlayOptions {
  readonly signal?: AbortSignal;
}

export interface RenderPoint {
  readonly x: number;
  readonly y: number;
}

export interface RenderObject {
  setPosition(position: RenderPoint): void;
  setVisible(visible: boolean): void;
  play(name?: string, options?: RenderObjectPlayOptions): Promise<void>;
  stop(): void;
  getAnchor(): RenderAnchor;
  destroy(): void;
}

export interface CloneableRenderObject extends RenderObject {
  clone(): CloneableRenderObject;
}

export interface RenderObjectAdapter {
  readonly view: Container | (() => Container);
  readonly owned?: boolean;
  assertUsable?(): void;
  play?(name?: string, options?: RenderObjectPlayOptions): Promise<void>;
  stop?(): void;
  destroy(): void;
}

export interface CloneableRenderObjectAdapter extends RenderObjectAdapter {
  clone(): CloneableRenderObject;
}

export interface RegisteredRenderObjectAdapter {
  readonly view: Container;
  readonly owned: boolean;
  assertUsable(): void;
  play?(name?: string, options?: RenderObjectPlayOptions): Promise<void>;
  stop?(): void;
  destroy(): void;
}

const adapters = new WeakMap<RenderObject, RegisteredRenderObjectAdapter>();

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
    ...(adapter.play ? { play: adapter.play } : {}),
    ...(adapter.stop ? { stop: adapter.stop } : {}),
    destroy: adapter.destroy,
  }) satisfies RegisteredRenderObjectAdapter;
  let object!: RenderObject;
  object = Object.freeze({
    setPosition: (position: RenderPoint) => {
      assertUsable();
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
        throw new SymbolAnimationError(
          "RenderObject position must contain finite coordinates.",
        );
      resolveView().position.set(position.x, position.y);
    },
    setVisible: (visible: boolean) => {
      assertUsable();
      if (typeof visible !== "boolean")
        throw new SymbolAnimationError(
          "RenderObject visibility must be boolean.",
        );
      resolveView().visible = visible;
    },
    play: (name?: string, options?: RenderObjectPlayOptions) => {
      assertUsable();
      if (options?.signal?.aborted)
        return Promise.reject(
          new SymbolAnimationError("RenderObject playback was aborted."),
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
    getAnchor: () => {
      assertUsable();
      return createContainerRenderAnchor(() => registered.view);
    },
    destroy: () => {
      if (destroyed) return;
      assertUsable();
      if (!registered.owned)
        throw new SymbolAnimationError(
          "Borrowed RenderObject cannot be destroyed.",
        );
      const view = resolveView();
      view.parent?.removeChild(view);
      destroyed = true;
      adapter.destroy();
    },
  }) satisfies RenderObject;
  adapters.set(object, registered);
  return object;
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
