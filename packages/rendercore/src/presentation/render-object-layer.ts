import type { Container } from "pixi.js";
import { SymbolAnimationError } from "../symbol/errors.js";
import {
  createContainerRenderAnchor,
  resolveRenderAnchor,
  type RenderAnchor,
} from "./render-anchor.js";
import {
  getRenderObjectAdapter,
  type RenderObject,
  type RenderPoint,
} from "./render-object.js";
import {
  registerPresentationMountTarget,
  type PresentationMountTarget,
} from "./presentation-scope.js";

export interface RenderObjectLayerAddAtOptions {
  readonly anchor: RenderAnchor;
  readonly offset?: RenderPoint;
  readonly order?: number;
}

export interface RenderObjectLayerMoveOptions {
  readonly order?: number;
}

export interface RenderObjectLayerMove {
  /** Restores the original parent/position/order when the object is still here. */
  restore(): void;
}

export interface RenderObjectLayer extends PresentationMountTarget {
  getAnchor(point?: RenderPoint): RenderAnchor;
  resolveAnchor(anchor: RenderAnchor): RenderPoint;
  addAt(node: RenderObject, options: RenderObjectLayerAddAtOptions): void;
  moveHere(
    node: RenderObject,
    options?: RenderObjectLayerMoveOptions,
  ): RenderObjectLayerMove;
}

export interface RenderObjectLayerController {
  readonly layer: RenderObjectLayer;
  detachAll(): void;
}

export function createRenderObjectLayer(options: {
  readonly view: Container | (() => Container);
  readonly label: string;
  readonly assertUsable?: () => void;
  readonly createError?: (message: string) => Error;
}): RenderObjectLayerController {
  const mounted = new Map<RenderObject, Container>();
  const createError =
    options.createError ??
    ((message: string) => new SymbolAnimationError(message));
  const getView = (): Container =>
    typeof options.view === "function" ? options.view() : options.view;
  const resolveView = (): Container => {
    options.assertUsable?.();
    return getView();
  };
  const fail = (message: string): never => {
    throw createError(message);
  };
  const assertOrder = (order: number): void => {
    if (!Number.isSafeInteger(order))
      fail(`${options.label} node order must be a safe integer.`);
  };
  const snapshotPoint = (point: RenderPoint, name: string): RenderPoint => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
      fail(`${options.label} ${name} must contain finite coordinates.`);
    return Object.freeze({ x: point.x, y: point.y });
  };
  const prepareAdd = (
    node: RenderObject,
    order: number,
  ): { readonly target: Container; readonly objectView: Container } => {
    const target = resolveView();
    assertOrder(order);
    if (mounted.has(node))
      fail(`RenderObject is already attached to ${options.label}.`);
    const objectView = getRenderObjectAdapter(node).view;
    if (objectView.parent)
      fail("RenderObject is already attached to another parent.");
    return { target, objectView };
  };
  const commitAdd = (
    node: RenderObject,
    target: Container,
    objectView: Container,
    order: number,
    position?: RenderPoint,
  ): void => {
    const previous = {
      x: objectView.x,
      y: objectView.y,
      zIndex: objectView.zIndex,
    };
    try {
      if (position) objectView.position.set(position.x, position.y);
      objectView.zIndex = order;
      target.addChild(objectView);
      mounted.set(node, objectView);
      layerRegistrations.set(objectView, { target, mounted, node });
    } catch (error) {
      if (objectView.parent === target) target.removeChild(objectView);
      objectView.position.set(previous.x, previous.y);
      objectView.zIndex = previous.zIndex;
      throw error;
    }
  };

  const layer = Object.freeze({
    add: (node: RenderObject, order = 0): void => {
      const prepared = prepareAdd(node, order);
      commitAdd(node, prepared.target, prepared.objectView, order);
    },
    remove: (node: RenderObject): void => {
      resolveView();
      const objectView = mounted.get(node);
      if (!objectView) return;
      mounted.delete(node);
      const target = resolveView();
      if (objectView.parent === target) {
        target.removeChild(objectView);
        layerRegistrations.delete(objectView);
      }
    },
    getAnchor: (point: RenderPoint = { x: 0, y: 0 }): RenderAnchor => {
      const snapshot = snapshotPoint(point, "anchor point");
      resolveView();
      return createContainerRenderAnchor(resolveView, () => snapshot);
    },
    resolveAnchor: (anchor: RenderAnchor): RenderPoint =>
      resolveRenderAnchor(anchor, resolveView()),
    addAt: (
      node: RenderObject,
      addOptions: RenderObjectLayerAddAtOptions,
    ): void => {
      if (!addOptions || typeof addOptions !== "object")
        fail(`${options.label} aligned add options are required.`);
      const order = addOptions.order ?? 0;
      const offset = snapshotPoint(
        addOptions.offset ?? { x: 0, y: 0 },
        "aligned add offset",
      );
      const prepared = prepareAdd(node, order);
      const anchor = resolveRenderAnchor(addOptions.anchor, prepared.target);
      const position = snapshotPoint(
        { x: anchor.x + offset.x, y: anchor.y + offset.y },
        "aligned add position",
      );
      commitAdd(node, prepared.target, prepared.objectView, order, position);
    },
    moveHere: (
      node: RenderObject,
      moveOptions: RenderObjectLayerMoveOptions = {},
    ): RenderObjectLayerMove => {
      const target = resolveView();
      const order = moveOptions.order ?? 0;
      assertOrder(order);
      const objectView = getRenderObjectAdapter(node).view;
      const source = objectView.parent;
      if (!source)
        fail("RenderObject must be attached before it can switch layers.");
      const sourceParent = source as Container;
      if (sourceParent === target)
        fail(`RenderObject is already attached to ${options.label}.`);
      const anchor = resolveRenderAnchor(node.getAnchor(), target);
      const targetPosition = snapshotPoint(anchor, "moved position");
      const previous = Object.freeze({
        source: sourceParent,
        x: objectView.x,
        y: objectView.y,
        zIndex: objectView.zIndex,
      });
      const sourceLayer = layerRegistrations.get(objectView);
      sourceLayer?.mounted.delete(sourceLayer.node);
      let committed = false;
      try {
        sourceParent.removeChild(objectView);
        objectView.position.set(targetPosition.x, targetPosition.y);
        objectView.zIndex = order;
        target.addChild(objectView);
        mounted.set(node, objectView);
        layerRegistrations.set(objectView, { target, mounted, node });
        committed = true;
      } finally {
        if (!committed) {
          objectView.parent?.removeChild(objectView);
          objectView.position.set(previous.x, previous.y);
          objectView.zIndex = previous.zIndex;
          previous.source.addChild(objectView);
          if (sourceLayer) {
            sourceLayer.mounted.set(sourceLayer.node, objectView);
            layerRegistrations.set(objectView, sourceLayer);
          }
        }
      }

      let active = true;
      const restore = (): void => {
        if (!active) return;
        active = false;
        activeMoves.delete(objectView);
        mounted.delete(node);
        if (objectView.parent !== target) return;
        target.removeChild(objectView);
        objectView.position.set(previous.x, previous.y);
        objectView.zIndex = previous.zIndex;
        previous.source.addChild(objectView);
        if (sourceLayer) {
          sourceLayer.mounted.set(sourceLayer.node, objectView);
          layerRegistrations.set(objectView, sourceLayer);
        } else {
          layerRegistrations.delete(objectView);
        }
      };
      const existing = activeMoves.get(objectView);
      existing?.restore();
      const movement = Object.freeze({ restore });
      activeMoves.set(objectView, movement);
      return movement;
    },
  }) satisfies RenderObjectLayer;
  registerPresentationMountTarget(layer, {
    get view(): Container {
      return resolveView();
    },
  });
  return Object.freeze({
    layer,
    detachAll: (): void => {
      const target = getView();
      for (const objectView of mounted.values())
        if (objectView.parent === target) {
          const movement = activeMoves.get(objectView);
          if (movement) movement.restore();
          else {
            objectView.parent.removeChild(objectView);
            layerRegistrations.delete(objectView);
          }
        }
      mounted.clear();
    },
  });
}

interface LayerRegistration {
  readonly target: Container;
  readonly mounted: Map<RenderObject, Container>;
  readonly node: RenderObject;
}

const layerRegistrations = new WeakMap<Container, LayerRegistration>();
const activeMoves = new WeakMap<Container, RenderObjectLayerMove>();

/** @internal Reel owners call this before invalidating a borrowed occurrence. */
export function restoreRenderObjectLayerMove(view: Container): void {
  activeMoves.get(view)?.restore();
}
