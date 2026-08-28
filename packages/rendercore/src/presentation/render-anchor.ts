import type { Container } from "pixi.js";
import type { RenderPoint } from "./render-object.js";
import { ReelError } from "../reel/errors.js";

export interface RenderAnchor {
  readonly kind: "render-anchor";
}

export interface NamedRenderAnchorSource {
  getNodeAnchor(id: string): RenderAnchor;
}

export function getNamedRenderAnchor(
  source: NamedRenderAnchorSource,
  id: string,
): RenderAnchor {
  return source.getNodeAnchor(id);
}

interface RenderAnchorAdapter {
  resolve(target: Container): RenderPoint;
}

const adapters = new WeakMap<RenderAnchor, RenderAnchorAdapter>();

export function createContainerRenderAnchor(
  owner: Container | (() => Container),
  getPoint: (owner: Container) => RenderPoint = () => ({ x: 0, y: 0 }),
): RenderAnchor {
  const anchor = Object.freeze({ kind: "render-anchor" as const });
  adapters.set(anchor, {
    resolve: (target) => {
      const resolvedOwner = typeof owner === "function" ? owner() : owner;
      const point = getPoint(resolvedOwner);
      assertPoint(point);
      const global = resolvedOwner.toGlobal(point);
      const local = target.toLocal(global);
      return Object.freeze({ x: local.x, y: local.y });
    },
  });
  return anchor;
}

export function createNodeRenderAnchor(owner: Container): RenderAnchor {
  return createContainerRenderAnchor(owner);
}

export function combineRenderAnchors(
  anchors: readonly RenderAnchor[],
): RenderAnchor {
  if (anchors.length === 0)
    throw new ReelError("RenderAnchor group must not be empty.");
  const anchor = Object.freeze({ kind: "render-anchor" as const });
  adapters.set(anchor, {
    resolve: (target) => {
      const points = anchors.map((item) => resolveRenderAnchor(item, target));
      return Object.freeze({
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      });
    },
  });
  return anchor;
}

export function resolveRenderAnchor(
  anchor: RenderAnchor,
  target: Container,
): RenderPoint {
  const adapter = adapters.get(anchor);
  if (!adapter)
    throw new ReelError(
      "RenderAnchor was not created by the active RenderCore runtime.",
    );
  return adapter.resolve(target);
}

function assertPoint(point: RenderPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new ReelError("RenderAnchor resolved to non-finite coordinates.");
}
