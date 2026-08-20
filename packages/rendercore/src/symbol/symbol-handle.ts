import { Container } from "pixi.js";
import type { RenderAnchor } from "../presentation/render-anchor.js";
import { SymbolAnimationError } from "./errors.js";
import {
  createCloneableRenderObject,
  createRenderObject,
  getRenderObjectAdapter,
  registerRenderObjectAlias,
  type CloneableRenderObject,
  type RenderObject,
  type RenderObjectPlayOptions,
  type RenderPoint,
} from "../presentation/render-object.js";
import type { SymbolPlayer } from "./symbol-player.js";
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

export type SymbolHandlePartRef =
  | { readonly kind: "value" }
  | { readonly kind: "text"; readonly name: string };

export interface SymbolHandle extends CloneableRenderObject {
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
  setText(name: string, text: string): void;
  getText(name: string): string;
  getPart(ref: SymbolHandlePartRef): CloneableRenderObject;
  add(node: RenderObject, options?: SymbolNodeOptions): void;
  remove(node: RenderObject): void;
  clone(options?: SymbolCloneOptions): SymbolHandle;
}

export interface SymbolHandleSource {
  readonly symbol: SymbolPlayer;
  readonly owned: boolean;
  assertUsable(): void;
  clone(): SymbolHandleSource;
  getPosition?: () => RenderPoint;
  getAnchor?: () => RenderAnchor;
  getPresentationSignal?(): AbortSignal | undefined;
  release?(): void;
}

export interface EmptySymbolHandleSource {
  readonly view: Container;
  readonly owned: boolean;
  assertUsable(): void;
  getPosition?: () => RenderPoint;
  getAnchor?: () => RenderAnchor;
}

const DEFAULT_PLAY_OPTIONS: SymbolStatePlaybackOptions = Object.freeze({
  completion: "entered",
});

interface SymbolHandleAdapter {
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

const symbolHandleAdapters = new WeakMap<SymbolHandle, SymbolHandleAdapter>();

export function createSymbolHandle(source: SymbolHandleSource): SymbolHandle {
  const mounted = new Set<RenderObject>();
  let destroyed = false;
  const assertUsable = (): void => {
    if (destroyed)
      throw new SymbolAnimationError("SymbolHandle was destroyed.");
    source.assertUsable();
  };
  const detachMounted = (): void => {
    for (const node of mounted) {
      getRenderObjectAdapter(node).view.parent?.removeChild(
        getRenderObjectAdapter(node).view,
      );
    }
    mounted.clear();
  };

  let render!: SymbolHandle;
  const baseNode = createRenderObject({
    view: source.symbol as Container,
    owned: source.owned,
    assertUsable,
    play: (name, options) => {
      if (options?.loop !== undefined)
        return Promise.reject(
          new SymbolAnimationError(
            "SymbolHandle playback loop is defined by the symbol state manifest.",
          ),
        );
      if (!name)
        return Promise.reject(
          new SymbolAnimationError(
            "SymbolHandle.play() requires an exact symbol state.",
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
          "Borrowed reel SymbolHandle cannot be destroyed.",
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
          "SymbolHandle has no SymbolArea position.",
        );
      return source.getPosition();
    },
    getAnchor: () => {
      assertUsable();
      if (!source.getAnchor)
        throw new SymbolAnimationError(
          "SymbolHandle has no SymbolArea anchor.",
        );
      return source.getAnchor();
    },
    setPosition: (position: RenderPoint) => {
      assertUsable();
      baseNode.setPosition(position);
    },
    setRotation: (rotationDegrees: number) => {
      assertUsable();
      baseNode.setRotation(rotationDegrees);
    },
    setVisible: (visible: boolean) => {
      assertUsable();
      baseNode.setVisible(visible);
    },
    play: (name?: string, options?: RenderObjectPlayOptions) => {
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
          "Borrowed reel SymbolHandle cannot be destroyed.",
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
    setText: (name: string, text: string) => {
      assertUsable();
      source.symbol.setImageStringText(name, text);
    },
    getText: (name: string) => {
      assertUsable();
      return source.symbol.getImageStringText(name);
    },
    getPart: (ref: SymbolHandlePartRef) => createSymbolHandlePart(source, ref),
    add: (node: RenderObject, options: SymbolNodeOptions = {}) => {
      assertUsable();
      if (mounted.has(node))
        throw new SymbolAnimationError("RenderObject is already attached.");
      const adapter = getRenderObjectAdapter(node);
      if (adapter.view.parent)
        throw new SymbolAnimationError(
          "RenderObject is already attached to another parent.",
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
    remove: (node: RenderObject) => {
      assertUsable();
      if (!mounted.delete(node))
        throw new SymbolAnimationError(
          "RenderObject is not attached to this SymbolHandle.",
        );
      getRenderObjectAdapter(node).view.parent?.removeChild(
        getRenderObjectAdapter(node).view,
      );
    },
    clone: (options: SymbolCloneOptions = {}) => {
      assertUsable();
      const clonedSource = source.clone();
      const clone = createSymbolHandle(clonedSource);
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
  }) satisfies SymbolHandle;
  registerRenderObjectAlias(render, getRenderObjectAdapter(baseNode));
  symbolHandleAdapters.set(render, {
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

export function createEmptySymbolHandle(
  source: EmptySymbolHandleSource,
): SymbolHandle {
  const mounted = new Set<RenderObject>();
  let destroyed = false;
  const assertUsable = (): void => {
    if (destroyed)
      throw new SymbolAnimationError("Empty SymbolHandle was destroyed.");
    source.assertUsable();
  };
  const unsupported = (operation: string): never => {
    assertUsable();
    throw new SymbolAnimationError(
      `Empty SymbolHandle does not support ${operation}.`,
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
      getRenderObjectAdapter(node).view.parent?.removeChild(
        getRenderObjectAdapter(node).view,
      );
    mounted.clear();
  };
  const baseNode = createRenderObject({
    view: source.view,
    owned: source.owned,
    assertUsable,
    destroy: () => {
      if (!source.owned)
        throw new SymbolAnimationError(
          "Borrowed reel SymbolHandle cannot be destroyed.",
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
          "SymbolHandle has no SymbolArea position.",
        );
      return source.getPosition();
    },
    getAnchor: () => {
      assertUsable();
      if (!source.getAnchor)
        throw new SymbolAnimationError(
          "SymbolHandle has no SymbolArea anchor.",
        );
      return source.getAnchor();
    },
    setPosition: (position: RenderPoint) => {
      assertUsable();
      baseNode.setPosition(position);
    },
    setRotation: (rotationDegrees: number) => {
      assertUsable();
      baseNode.setRotation(rotationDegrees);
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
          "Borrowed reel SymbolHandle cannot be destroyed.",
        );
      baseNode.destroy();
    },
    setState: () => unsupported("symbol states"),
    playState: () => rejectUnsupported("symbol states"),
    setValue: (value: number | null) => {
      assertUsable();
      if (value !== null)
        throw new SymbolAnimationError(
          "Empty SymbolHandle presentation value must be null.",
        );
    },
    getValue: () => {
      assertUsable();
      return null;
    },
    setText: () => unsupported("image-string text"),
    getText: () => unsupported("image-string text"),
    getPart: () => unsupported("presentation parts"),
    add: (node: RenderObject, options: SymbolNodeOptions = {}) => {
      assertUsable();
      if (mounted.has(node))
        throw new SymbolAnimationError("RenderObject is already attached.");
      const adapter = getRenderObjectAdapter(node);
      if (adapter.view.parent)
        throw new SymbolAnimationError(
          "RenderObject is already attached to another parent.",
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
    remove: (node: RenderObject) => {
      assertUsable();
      if (!mounted.delete(node))
        throw new SymbolAnimationError(
          "RenderObject is not attached to this SymbolHandle.",
        );
      getRenderObjectAdapter(node).view.parent?.removeChild(
        getRenderObjectAdapter(node).view,
      );
    },
    clone: () =>
      createEmptySymbolHandle({
        view: new Container(),
        owned: true,
        assertUsable: () => {},
      }),
  }) satisfies SymbolHandle;
  registerRenderObjectAlias(render, getRenderObjectAdapter(baseNode));
  symbolHandleAdapters.set(render, {
    assertUsable,
    validateValue: (value) => {
      assertUsable();
      if (value !== null)
        throw new SymbolAnimationError(
          "Empty SymbolHandle presentation value must be null.",
        );
    },
    validateStateRequest: () => unsupported("symbol states"),
    validateStatePlayback: () => unsupported("symbol states"),
  });
  return render;
}

function createSymbolHandlePart(
  source: SymbolHandleSource,
  ref: SymbolHandlePartRef,
): CloneableRenderObject {
  source.assertUsable();
  if (ref.kind !== "value" && ref.kind !== "text") {
    throw new SymbolAnimationError(
      `Unknown SymbolHandle part kind "${String((ref as { kind?: unknown }).kind)}".`,
    );
  }
  if (ref.kind === "text" && (typeof ref.name !== "string" || ref.name === ""))
    throw new SymbolAnimationError(
      "SymbolHandle text part requires a non-empty exact name.",
    );
  if (ref.kind === "value") source.symbol.getPresentationValueView();
  else source.symbol.getImageStringTextView(ref.name);
  const assertUsable = (): void => source.assertUsable();
  return createCloneableRenderObject({
    view: () => {
      assertUsable();
      return ref.kind === "value"
        ? source.symbol.getPresentationValueView()
        : source.symbol.getImageStringTextView(ref.name);
    },
    owned: false,
    assertUsable,
    clone: () => {
      assertUsable();
      return ref.kind === "value"
        ? source.symbol.clonePresentationValue()
        : source.symbol.cloneImageStringText(ref.name);
    },
    destroy: () => {},
  });
}

export function getSymbolHandleAdapter(
  render: SymbolHandle,
): SymbolHandleAdapter {
  const adapter = symbolHandleAdapters.get(render);
  if (!adapter)
    throw new SymbolAnimationError(
      "SymbolHandle was not created by the active RenderCore runtime.",
    );
  return adapter;
}
