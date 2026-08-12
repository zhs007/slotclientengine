import type { Container } from "pixi.js";
import { SymbolAnimationError } from "./errors.js";
import {
  createRenderNode,
  getRenderNodeAdapter,
  registerRenderNodeAlias,
  type RenderNode,
  type RenderNodePlayOptions,
} from "./render-node.js";
import type { RenderSymbol } from "./render-symbol.js";
import type {
  SymbolStateId,
  SymbolStatePlaybackOptions,
  SymbolStateTransitionMode,
} from "./types.js";

export interface SymbolNodeOptions {
  readonly layer?: "underlay" | "overlay";
  readonly order?: number;
}

export interface SymbolCloneOptions {
  readonly state?: "normal" | "current";
}

export interface SymbolRender extends RenderNode {
  readonly code: number;
  readonly symbol: string;
  setState(
    state: SymbolStateId,
    transitionMode?: SymbolStateTransitionMode,
  ): void;
  playState(
    state: SymbolStateId,
    options?: SymbolStatePlaybackOptions,
  ): Promise<void>;
  setValue(value: number | null): void;
  getValue(): number | null;
  add(node: RenderNode, options?: SymbolNodeOptions): void;
  remove(node: RenderNode): void;
  clone(options?: SymbolCloneOptions): SymbolRender;
}

export interface SymbolRenderSource {
  readonly symbol: RenderSymbol;
  readonly owned: boolean;
  assertUsable(): void;
  clone(): SymbolRenderSource;
  release?(): void;
}

const DEFAULT_PLAY_OPTIONS: SymbolStatePlaybackOptions = Object.freeze({
  completion: "entered",
});

export function createSymbolRender(source: SymbolRenderSource): SymbolRender {
  const mounted = new Set<RenderNode>();
  let destroyed = false;
  const assertUsable = (): void => {
    if (destroyed)
      throw new SymbolAnimationError("SymbolRender was destroyed.");
    source.assertUsable();
  };
  const detachMounted = (): void => {
    for (const node of mounted) {
      getRenderNodeAdapter(node).view.parent?.removeChild(
        getRenderNodeAdapter(node).view,
      );
    }
    mounted.clear();
  };

  let render!: SymbolRender;
  const baseNode = createRenderNode({
    view: source.symbol as Container,
    play: (name, options) => {
      if (!name)
        return Promise.reject(
          new SymbolAnimationError(
            "SymbolRender.play() requires an exact symbol state.",
          ),
        );
      return source.symbol.playState(name, {
        completion: "entered",
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    },
    stop: () => source.symbol.returnToDefaultState(),
    destroy: () => {
      if (!source.owned) {
        throw new SymbolAnimationError(
          "Borrowed reel SymbolRender cannot be destroyed.",
        );
      }
      detachMounted();
      destroyed = true;
      source.release?.();
    },
  });
  render = Object.freeze({
    code: source.symbol.code,
    symbol: source.symbol.symbol,
    play: (name?: string, options?: RenderNodePlayOptions) => {
      assertUsable();
      return baseNode.play(name, options);
    },
    stop: () => {
      assertUsable();
      baseNode.stop();
    },
    destroy: () => {
      assertUsable();
      if (!source.owned)
        throw new SymbolAnimationError(
          "Borrowed reel SymbolRender cannot be destroyed.",
        );
      baseNode.destroy();
    },
    setState: (
      state: SymbolStateId,
      transitionMode: SymbolStateTransitionMode = "boundary",
    ) => {
      assertUsable();
      source.symbol.requestState(state, transitionMode);
    },
    playState: (
      state: SymbolStateId,
      options: SymbolStatePlaybackOptions = DEFAULT_PLAY_OPTIONS,
    ) => {
      assertUsable();
      return source.symbol.playState(state, options);
    },
    setValue: (value: number | null) => {
      assertUsable();
      source.symbol.setPresentationValue(value);
    },
    getValue: () => {
      assertUsable();
      return source.symbol.getPresentationValue();
    },
    add: (node: RenderNode, options: SymbolNodeOptions = {}) => {
      assertUsable();
      if (mounted.has(node))
        throw new SymbolAnimationError("RenderNode is already attached.");
      const adapter = getRenderNodeAdapter(node);
      if (adapter.view.parent)
        throw new SymbolAnimationError(
          "RenderNode is already attached to another parent.",
        );
      const order = options.order ?? 0;
      if (!Number.isSafeInteger(order))
        throw new SymbolAnimationError("Symbol node order must be an integer.");
      adapter.view.zIndex = order;
      const parent =
        options.layer === "underlay"
          ? source.symbol.getGameUnderlayLayer()
          : source.symbol.getGameOverlayLayer();
      parent.sortableChildren = true;
      parent.addChild(adapter.view);
      mounted.add(node);
    },
    remove: (node: RenderNode) => {
      assertUsable();
      if (!mounted.delete(node))
        throw new SymbolAnimationError(
          "RenderNode is not attached to this SymbolRender.",
        );
      getRenderNodeAdapter(node).view.parent?.removeChild(
        getRenderNodeAdapter(node).view,
      );
    },
    clone: (options: SymbolCloneOptions = {}) => {
      assertUsable();
      const clonedSource = source.clone();
      const clone = createSymbolRender(clonedSource);
      clone.setValue(source.symbol.getPresentationValue());
      if (options.state === "current") {
        const snapshot = source.symbol.getStateSnapshot();
        if (snapshot.pendingState !== null || snapshot.isOnce) {
          clone.destroy();
          throw new SymbolAnimationError(
            "Cannot clone a pending or once-playing symbol state.",
          );
        }
        clone.setState(snapshot.requestedState, "immediate");
      }
      return clone;
    },
  }) satisfies SymbolRender;
  registerRenderNodeAlias(render, getRenderNodeAdapter(baseNode));
  return render;
}
