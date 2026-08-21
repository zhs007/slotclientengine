import type { Container } from "pixi.js";
import type {
  VisibleOccurrenceMotionPath,
  VisibleOccurrenceTimeEasing,
} from "../reel/types.js";
import type {
  RenderObject,
  RenderPoint,
  RenderScale,
} from "./render-object.js";
import type { RenderObjectMotionEasing } from "./render-object-motion.js";
import type { RenderAnchor } from "./render-anchor.js";

export type PresentationNodeOwnership = "detach" | "destroy";

export interface PresentationNodeMountOptions {
  readonly ownership: PresentationNodeOwnership;
  readonly anchor?: RenderAnchor;
  readonly offset?: RenderPoint;
  readonly order?: number;
}

export interface PresentationMotionOptions {
  readonly to: RenderAnchor;
  readonly durationSeconds: number;
  readonly path?: VisibleOccurrenceMotionPath;
  readonly easing?: VisibleOccurrenceTimeEasing;
}

export interface PresentationObjectAnimationOptions {
  readonly to?: RenderAnchor;
  readonly opacity?: number;
  readonly scale?: RenderScale;
  readonly rotationDegrees?: number;
  readonly durationSeconds: number;
  readonly path?: VisibleOccurrenceMotionPath;
  readonly easing?: RenderObjectMotionEasing;
}

export interface PresentationTransferOptions
  extends PresentationNodeMountOptions, PresentationMotionOptions {
  readonly from: RenderAnchor;
}

export interface PresentationMountTarget {
  add(node: RenderObject, order?: number): void;
  remove(node: RenderObject): void;
}

export interface PresentationScopeContext {
  delay(seconds: number): Promise<void>;
  mount(
    target: PresentationMountTarget,
    node: RenderObject,
    options: PresentationNodeMountOptions,
  ): void;
  unmount(node: RenderObject): void;
  withNode<T>(
    target: PresentationMountTarget,
    node: RenderObject,
    options: PresentationNodeMountOptions,
    playback: () => Promise<T>,
  ): Promise<T>;
  move(node: RenderObject, options: PresentationMotionOptions): Promise<void>;
  animate(
    node: RenderObject,
    options: PresentationObjectAnimationOptions,
  ): Promise<void>;
  transfer(
    target: PresentationMountTarget,
    node: RenderObject,
    options: PresentationTransferOptions,
  ): Promise<void>;
}

export interface PresentationMountTargetAdapter {
  readonly view: Container;
}

const targetAdapters = new WeakMap<
  PresentationMountTarget,
  PresentationMountTargetAdapter
>();

export function registerPresentationMountTarget(
  target: PresentationMountTarget,
  adapter: PresentationMountTargetAdapter,
): void {
  targetAdapters.set(target, adapter);
}

export function getPresentationMountTargetAdapter(
  target: PresentationMountTarget,
): PresentationMountTargetAdapter {
  const adapter = targetAdapters.get(target);
  if (!adapter)
    throw new Error(
      "Presentation mount target was not created by the active RenderCore runtime.",
    );
  return adapter;
}
