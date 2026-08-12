import type { Container } from "pixi.js";
import { SymbolAnimationError } from "./errors.js";

export interface RenderNodePlayOptions {
  readonly signal?: AbortSignal;
}

export interface RenderNode {
  setPosition(position: RenderPoint): void;
  setVisible(visible: boolean): void;
  play(name?: string, options?: RenderNodePlayOptions): Promise<void>;
  stop(): void;
  destroy(): void;
}

export interface RenderPoint {
  readonly x: number;
  readonly y: number;
}

export interface RenderNodeAdapter {
  readonly view: Container;
  play?(name?: string, options?: RenderNodePlayOptions): Promise<void>;
  stop?(): void;
  destroy(): void;
}

const adapters = new WeakMap<RenderNode, RenderNodeAdapter>();

export function createRenderNode(adapter: RenderNodeAdapter): RenderNode {
  let destroyed = false;
  const assertAlive = (): void => {
    if (destroyed) throw new SymbolAnimationError("RenderNode was destroyed.");
  };
  const node = Object.freeze({
    setPosition: (position: RenderPoint) => {
      assertAlive();
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
        throw new SymbolAnimationError(
          "RenderNode position must contain finite coordinates.",
        );
      adapter.view.position.set(position.x, position.y);
    },
    setVisible: (visible: boolean) => {
      assertAlive();
      if (typeof visible !== "boolean")
        throw new SymbolAnimationError(
          "RenderNode visibility must be boolean.",
        );
      adapter.view.visible = visible;
    },
    play: (name?: string, options?: RenderNodePlayOptions) => {
      assertAlive();
      if (options?.signal?.aborted)
        return Promise.reject(
          new SymbolAnimationError("RenderNode playback was aborted."),
        );
      if (!adapter.play)
        return Promise.reject(
          new SymbolAnimationError("RenderNode does not support playback."),
        );
      return adapter.play(name, options);
    },
    stop: () => {
      assertAlive();
      adapter.stop?.();
    },
    destroy: () => {
      if (destroyed) return;
      adapter.view.parent?.removeChild(adapter.view);
      destroyed = true;
      adapter.destroy();
    },
  }) satisfies RenderNode;
  adapters.set(node, adapter);
  return node;
}

export function getRenderNodeAdapter(node: RenderNode): RenderNodeAdapter {
  const adapter = adapters.get(node);
  if (!adapter) {
    throw new SymbolAnimationError(
      "RenderNode was not created by the active RenderCore runtime.",
    );
  }
  return adapter;
}

export function registerRenderNodeAlias(
  node: RenderNode,
  adapter: RenderNodeAdapter,
): void {
  adapters.set(node, adapter);
}
