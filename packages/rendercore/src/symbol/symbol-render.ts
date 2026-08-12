import { Container } from "pixi.js";
import type { RenderAnchor } from "../presentation/render-anchor.js";
import { SymbolAnimationError } from "./errors.js";
import {
  createRenderNode,
  getRenderNodeAdapter,
  registerRenderNodeAlias,
  type RenderNode,
  type RenderNodePlayOptions,
  type RenderPoint,
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
  readonly kind: "symbol" | "empty";
  getPosition(): RenderPoint;
  getAnchor(): RenderAnchor;
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
  cloneValue(): RenderNode;
  getValueAnchor(): RenderAnchor;
  setText(name: string, text: string): void;
  getText(name: string): string;
  cloneText(name: string): RenderNode;
  getTextAnchor(name: string): RenderAnchor;
  add(node: RenderNode, options?: SymbolNodeOptions): void;
  remove(node: RenderNode): void;
  clone(options?: SymbolCloneOptions): SymbolRender;
}

export interface SymbolRenderSource {
  readonly symbol: RenderSymbol;
  readonly owned: boolean;
  assertUsable(): void;
  clone(): SymbolRenderSource;
  getPosition?: () => RenderPoint;
  getAnchor?: () => RenderAnchor;
  getPresentationSignal?(): AbortSignal | undefined;
  release?(): void;
}

export interface EmptySymbolRenderSource {
  readonly view: Container;
  readonly owned: boolean;
  assertUsable(): void;
  getPosition?: () => RenderPoint;
  getAnchor?: () => RenderAnchor;
}

const DEFAULT_PLAY_OPTIONS: SymbolStatePlaybackOptions = Object.freeze({
  completion: "entered",
});

interface SymbolRenderAdapter {
  assertUsable(): void;
  validateValue(value: number | null): void;
  validateStateRequest(
    state: SymbolStateId,
    transitionMode?: SymbolStateTransitionMode,
  ): void;
  validateStatePlayback(
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): void;
}

const symbolRenderAdapters = new WeakMap<SymbolRender, SymbolRenderAdapter>();

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
    kind: "symbol" as const,
    getPosition: () => {
      assertUsable();
      if (!source.getPosition)
        throw new SymbolAnimationError(
          "SymbolRender has no SymbolArea position.",
        );
      return source.getPosition();
    },
    getAnchor: () => {
      assertUsable();
      if (!source.getAnchor)
        throw new SymbolAnimationError(
          "SymbolRender has no SymbolArea anchor.",
        );
      return source.getAnchor();
    },
    setPosition: (position: RenderPoint) => {
      assertUsable();
      baseNode.setPosition(position);
    },
    setVisible: (visible: boolean) => {
      assertUsable();
      baseNode.setVisible(visible);
    },
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
      const presentationSignal = source.getPresentationSignal?.();
      return source.symbol.playState(state, {
        ...options,
        ...(options.signal
          ? { signal: options.signal }
          : presentationSignal
            ? { signal: presentationSignal }
            : {}),
      });
    },
    setValue: (value: number | null) => {
      assertUsable();
      source.symbol.setPresentationValue(value);
    },
    getValue: () => {
      assertUsable();
      return source.symbol.getPresentationValue();
    },
    cloneValue: () => {
      assertUsable();
      return source.symbol.clonePresentationValue();
    },
    getValueAnchor: () => {
      assertUsable();
      return source.symbol.getPresentationValueAnchor();
    },
    setText: (name: string, text: string) => {
      assertUsable();
      source.symbol.setImageStringText(name, text);
    },
    getText: (name: string) => {
      assertUsable();
      return source.symbol.getImageStringText(name);
    },
    cloneText: (name: string) => {
      assertUsable();
      return source.symbol.cloneImageStringText(name);
    },
    getTextAnchor: (name: string) => {
      assertUsable();
      return source.symbol.getImageStringTextAnchor(name);
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
  symbolRenderAdapters.set(render, {
    assertUsable,
    validateValue: (value) => {
      assertUsable();
      source.symbol.validatePresentationValue(value);
    },
    validateStateRequest: (state, transitionMode) => {
      assertUsable();
      source.symbol.validateStateRequest(state, transitionMode);
    },
    validateStatePlayback: (state, options) => {
      assertUsable();
      source.symbol.validateStatePlayback(state, options);
    },
  });
  return render;
}

export function createEmptySymbolRender(
  source: EmptySymbolRenderSource,
): SymbolRender {
  const mounted = new Set<RenderNode>();
  let destroyed = false;
  const assertUsable = (): void => {
    if (destroyed)
      throw new SymbolAnimationError("Empty SymbolRender was destroyed.");
    source.assertUsable();
  };
  const unsupported = (operation: string): never => {
    assertUsable();
    throw new SymbolAnimationError(
      `Empty SymbolRender does not support ${operation}.`,
    );
  };
  const rejectUnsupported = (operation: string): Promise<never> => {
    try {
      return Promise.resolve(unsupported(operation));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const detachMounted = (): void => {
    for (const node of mounted)
      getRenderNodeAdapter(node).view.parent?.removeChild(
        getRenderNodeAdapter(node).view,
      );
    mounted.clear();
  };
  const baseNode = createRenderNode({
    view: source.view,
    destroy: () => {
      if (!source.owned)
        throw new SymbolAnimationError(
          "Borrowed reel SymbolRender cannot be destroyed.",
        );
      detachMounted();
      destroyed = true;
      source.view.destroy({ children: false });
    },
  });
  const render = Object.freeze({
    code: -1,
    symbol: "__empty__",
    kind: "empty" as const,
    getPosition: () => {
      assertUsable();
      if (!source.getPosition)
        throw new SymbolAnimationError(
          "SymbolRender has no SymbolArea position.",
        );
      return source.getPosition();
    },
    getAnchor: () => {
      assertUsable();
      if (!source.getAnchor)
        throw new SymbolAnimationError(
          "SymbolRender has no SymbolArea anchor.",
        );
      return source.getAnchor();
    },
    setPosition: (position: RenderPoint) => {
      assertUsable();
      baseNode.setPosition(position);
    },
    setVisible: (visible: boolean) => {
      assertUsable();
      baseNode.setVisible(visible);
    },
    play: () => rejectUnsupported("playback"),
    stop: () => unsupported("playback"),
    destroy: () => {
      assertUsable();
      if (!source.owned)
        throw new SymbolAnimationError(
          "Borrowed reel SymbolRender cannot be destroyed.",
        );
      baseNode.destroy();
    },
    setState: () => unsupported("symbol states"),
    playState: () => rejectUnsupported("symbol states"),
    setValue: (value: number | null) => {
      assertUsable();
      if (value !== null)
        throw new SymbolAnimationError(
          "Empty SymbolRender presentation value must be null.",
        );
    },
    getValue: () => {
      assertUsable();
      return null;
    },
    cloneValue: () => unsupported("presentation values"),
    getValueAnchor: () => unsupported("presentation values"),
    setText: () => unsupported("image-string text"),
    getText: () => unsupported("image-string text"),
    cloneText: () => unsupported("image-string text"),
    getTextAnchor: () => unsupported("image-string text"),
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
      source.view.sortableChildren = true;
      adapter.view.zIndex =
        options.layer === "underlay" ? -1_000_000 + order : order;
      source.view.addChild(adapter.view);
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
    clone: () =>
      createEmptySymbolRender({
        view: new Container(),
        owned: true,
        assertUsable: () => {},
      }),
  }) satisfies SymbolRender;
  registerRenderNodeAlias(render, getRenderNodeAdapter(baseNode));
  symbolRenderAdapters.set(render, {
    assertUsable,
    validateValue: (value) => {
      assertUsable();
      if (value !== null)
        throw new SymbolAnimationError(
          "Empty SymbolRender presentation value must be null.",
        );
    },
    validateStateRequest: () => unsupported("symbol states"),
    validateStatePlayback: () => unsupported("symbol states"),
  });
  return render;
}

export function getSymbolRenderAdapter(
  render: SymbolRender,
): SymbolRenderAdapter {
  const adapter = symbolRenderAdapters.get(render);
  if (!adapter)
    throw new SymbolAnimationError(
      "SymbolRender was not created by the active RenderCore runtime.",
    );
  return adapter;
}
