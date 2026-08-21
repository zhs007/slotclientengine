import { SymbolAnimationError } from "../symbol/errors.js";
import type {
  RenderObject,
  RenderPoint,
  RenderScale,
} from "./render-object.js";
import {
  getRenderObjectAdapter,
  registerRenderObjectCleanup,
  type RegisteredRenderObjectAdapter,
} from "./render-object.js";

const ARC_SAMPLES_PER_SEGMENT = 64;

export type RenderObjectMotionPath =
  | { readonly kind: "line" }
  | {
      readonly kind: "cubic-bezier-path";
      readonly segments: readonly {
        readonly control1: RenderPoint;
        readonly control2: RenderPoint;
        readonly end: RenderPoint;
      }[];
    };

export type RenderObjectMotionEasing =
  | { readonly kind: "linear" }
  | {
      readonly kind: "cubic-bezier";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    };

export interface RenderObjectMotionTarget {
  readonly position?: RenderPoint;
  readonly opacity?: number;
  readonly scale?: RenderScale;
  /** Exact clockwise target in degrees; values are not normalized. */
  readonly rotationDegrees?: number;
}

export interface RenderObjectMotionAnimation extends RenderObjectMotionTarget {
  readonly durationSeconds: number;
  readonly easing?: RenderObjectMotionEasing;
  /** Applies only to position. */
  readonly path?: RenderObjectMotionPath;
  readonly signal?: AbortSignal;
}

export interface RenderObjectFadeOptions {
  readonly durationSeconds: number;
  readonly easing?: RenderObjectMotionEasing;
  readonly signal?: AbortSignal;
}

export interface RenderObjectMotion {
  snap(target: RenderObjectMotionTarget): void;
  animate(animation: RenderObjectMotionAnimation): Promise<void>;
  fadeIn(options: RenderObjectFadeOptions): Promise<void>;
  fadeOut(options: RenderObjectFadeOptions): Promise<void>;
  /** Cancels the active animation while preserving its current sampled values. */
  cancel(): void;
}

export interface RenderObjectMotionAttachment {
  detach(): void;
}

export interface RenderObjectMotionRuntime {
  attach(object: RenderObject): RenderObjectMotionAttachment;
  update(deltaSeconds: number): void;
  destroy(): void;
}

export interface RenderObjectMotionState {
  readonly position: RenderPoint;
  readonly opacity: number;
  readonly scale: RenderScale;
  readonly rotationDegrees: number;
}

export interface RenderObjectMotionPropertyAdapter {
  readonly owned: boolean;
  assertUsable(): void;
  capture(): RenderObjectMotionState;
  apply(state: RenderObjectMotionState): void;
}

export interface PreparedRenderObjectPositionMotion {
  sample(progress: number): RenderPoint;
}

interface CubicSegment {
  readonly start: RenderPoint;
  readonly control1: RenderPoint;
  readonly control2: RenderPoint;
  readonly end: RenderPoint;
}

interface ArcSample {
  readonly segmentIndex: number;
  readonly t: number;
  readonly distance: number;
}

interface PreparedAnimation {
  readonly source: RenderObjectMotionState;
  readonly target: RenderObjectMotionState;
  readonly changed: Readonly<{
    position: boolean;
    opacity: boolean;
    scale: boolean;
    rotation: boolean;
  }>;
  readonly durationSeconds: number;
  readonly ease: (progress: number) => number;
  readonly positionMotion: PreparedRenderObjectPositionMotion | null;
  readonly signal?: AbortSignal;
}

interface ActiveAnimation extends PreparedAnimation {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly abortListener?: () => void;
  elapsedSeconds: number;
}

interface RuntimeRegistration {
  readonly runtime: DefaultRenderObjectMotionRuntime;
  readonly binding: RenderObjectMotionBinding;
  readonly adapter: RenderObjectMotionPropertyAdapter;
  readonly childAttachments: Map<RenderObject, RenderObjectMotionAttachment>;
  active: ActiveAnimation | null;
  detached: boolean;
}

export interface RenderObjectMotionBinding {
  registration: RuntimeRegistration | null;
}

export interface RenderObjectMotionRuntimeOptions {
  readonly createError?: (message: string) => Error;
}

export function createRenderObjectMotionRuntime(
  options: RenderObjectMotionRuntimeOptions = {},
): RenderObjectMotionRuntime {
  return new DefaultRenderObjectMotionRuntime(options);
}

/** @internal Each opaque object keeps owner routing without a process-global registry. */
export function createRenderObjectMotionBinding(): RenderObjectMotionBinding {
  return { registration: null };
}

/** @internal Runtime owners use this for opaque authored objects. */
export function attachRenderObjectMotionAdapter(
  runtime: RenderObjectMotionRuntime,
  binding: RenderObjectMotionBinding,
  adapter: RenderObjectMotionPropertyAdapter,
): RenderObjectMotionAttachment {
  if (!(runtime instanceof DefaultRenderObjectMotionRuntime))
    throw new SymbolAnimationError(
      "RenderObject motion runtime was not created by RenderCore.",
    );
  return runtime.attachAdapter(binding, adapter);
}

/** @internal RenderObject construction shares this controller across aliases. */
export function createRenderObjectMotionController(
  binding: RenderObjectMotionBinding,
  assertUsable: () => void,
  detachedAdapter?: RenderObjectMotionPropertyAdapter,
): RenderObjectMotion {
  const requireRegistration = (): RuntimeRegistration => {
    assertUsable();
    const registration = binding.registration;
    if (!registration || registration.detached)
      throw new SymbolAnimationError(
        "RenderObject is not attached to a motion runtime.",
      );
    return registration;
  };
  return Object.freeze({
    snap: (target: RenderObjectMotionTarget): void => {
      assertUsable();
      const registration = binding.registration;
      if (registration && !registration.detached) {
        registration.runtime.snap(registration, target);
        return;
      }
      if (!detachedAdapter)
        throw new SymbolAnimationError(
          "RenderObject is not attached to a motion runtime.",
        );
      const detachedRuntime = new DefaultRenderObjectMotionRuntime({});
      const attachment = detachedRuntime.attachAdapter(
        binding,
        detachedAdapter,
      );
      try {
        detachedRuntime.snap(binding.registration!, target);
      } finally {
        attachment.detach();
        detachedRuntime.destroy();
      }
    },
    animate: (animation: RenderObjectMotionAnimation): Promise<void> => {
      try {
        const registration = requireRegistration();
        return registration.runtime.animate(registration, animation);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    fadeIn: (options: RenderObjectFadeOptions): Promise<void> => {
      try {
        const registration = requireRegistration();
        return registration.runtime.animate(registration, {
          ...options,
          opacity: 1,
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    fadeOut: (options: RenderObjectFadeOptions): Promise<void> => {
      try {
        const registration = requireRegistration();
        return registration.runtime.animate(registration, {
          ...options,
          opacity: 0,
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    cancel: (): void => {
      const registration = requireRegistration();
      registration.runtime.cancel(
        registration,
        "RenderObject motion was cancelled.",
      );
    },
  });
}

/** @internal Direct setters supersede an active animation before mutation. */
export function cancelRenderObjectMotion(
  binding: RenderObjectMotionBinding,
  message: string,
): void {
  const registration = binding.registration;
  registration?.runtime.cancel(registration, message);
}

/** @internal Attachments inherit an already registered parent's clock owner. */
export function attachToRenderObjectMotionOwner(
  ownerAdapter: RegisteredRenderObjectAdapter,
  object: RenderObject,
): RenderObjectMotionAttachment {
  if (ownerAdapter.motionChildren.has(object))
    throw new SymbolAnimationError(
      "RenderObject is already attached to this motion owner.",
    );
  ownerAdapter.motionChildren.add(object);
  let active = true;
  try {
    const owner = ownerAdapter.motionBinding.registration;
    if (owner && !owner.detached) owner.runtime.attachChild(owner, object);
  } catch (error) {
    ownerAdapter.motionChildren.delete(object);
    throw error;
  }
  return Object.freeze({
    detach: (): void => {
      if (!active) return;
      active = false;
      ownerAdapter.motionChildren.delete(object);
      const owner = ownerAdapter.motionBinding.registration;
      if (owner && !owner.detached) owner.runtime.detachChild(owner, object);
    },
  });
}

export function prepareRenderObjectPositionMotion(
  path: RenderObjectMotionPath,
  easing: RenderObjectMotionEasing,
  source: RenderPoint,
  target: RenderPoint,
  createError: (message: string) => Error = (message) =>
    new SymbolAnimationError(message),
): PreparedRenderObjectPositionMotion {
  assertPoint(source, "source", createError);
  assertPoint(target, "target", createError);
  const ease = prepareRenderObjectMotionEasing(easing, createError);
  const segments = prepareSegments(path, source, target, createError);
  const lookup = buildArcLookup(segments, createError);
  return Object.freeze({
    sample: (rawProgress: number): RenderPoint => {
      if (!Number.isFinite(rawProgress) || rawProgress < 0 || rawProgress > 1)
        throw createError(
          "RenderObject motion progress must be between 0 and 1.",
        );
      if (rawProgress === 0) return Object.freeze({ ...source });
      if (rawProgress === 1) return Object.freeze({ ...target });
      return sampleByDistance(segments, lookup, ease(rawProgress));
    },
  });
}

export function prepareRenderObjectMotionEasing(
  easing: RenderObjectMotionEasing,
  createError: (message: string) => Error = (message) =>
    new SymbolAnimationError(message),
): (progress: number) => number {
  if (easing.kind === "linear") return (progress) => progress;
  if (easing.kind !== "cubic-bezier")
    throw createError(
      `Unknown RenderObject motion easing kind "${String((easing as { kind?: unknown }).kind)}".`,
    );
  for (const [name, value] of Object.entries(easing)) {
    if (name !== "kind" && !Number.isFinite(value))
      throw createError(`RenderObject motion easing ${name} must be finite.`);
  }
  if (easing.x1 < 0 || easing.x1 > 1 || easing.x2 < 0 || easing.x2 > 1)
    throw createError(
      "RenderObject motion easing x1/x2 must be between 0 and 1.",
    );
  return (progress) => {
    let lower = 0;
    let upper = 1;
    for (let index = 0; index < 24; index += 1) {
      const candidate = (lower + upper) / 2;
      if (cubic(0, easing.x1, easing.x2, 1, candidate) < progress)
        lower = candidate;
      else upper = candidate;
    }
    return cubic(0, easing.y1, easing.y2, 1, (lower + upper) / 2);
  };
}

class DefaultRenderObjectMotionRuntime implements RenderObjectMotionRuntime {
  readonly #createError: (message: string) => Error;
  readonly #ownedRegistrations = new Set<RuntimeRegistration>();
  #destroyed = false;

  constructor(options: RenderObjectMotionRuntimeOptions) {
    this.#createError =
      options.createError ??
      ((message: string) => new SymbolAnimationError(message));
  }

  attach(object: RenderObject): RenderObjectMotionAttachment {
    const registered = getRenderObjectAdapter(object);
    const attachment = this.attachAdapter(
      registered.motionBinding,
      registered.motionAdapter,
    );
    try {
      const registration = registered.motionBinding.registration!;
      for (const child of registered.motionChildren)
        this.attachChild(registration, child);
    } catch (error) {
      attachment.detach();
      throw error;
    }
    let active = true;
    const unregisterCleanup = registerRenderObjectCleanup(object, () =>
      attachment.detach(),
    );
    return Object.freeze({
      detach: (): void => {
        if (!active) return;
        active = false;
        unregisterCleanup();
        attachment.detach();
      },
    });
  }

  attachAdapter(
    binding: RenderObjectMotionBinding,
    adapter: RenderObjectMotionPropertyAdapter,
  ): RenderObjectMotionAttachment {
    this.assertAlive();
    adapter.assertUsable();
    const existing = binding.registration;
    if (existing && !existing.detached) {
      if (existing.runtime === this)
        throw this.#createError(
          "RenderObject is already attached to this motion runtime.",
        );
      throw this.#createError(
        "RenderObject is already attached to another motion runtime.",
      );
    }
    const registration: RuntimeRegistration = {
      runtime: this,
      binding,
      adapter,
      childAttachments: new Map(),
      active: null,
      detached: false,
    };
    binding.registration = registration;
    this.#ownedRegistrations.add(registration);
    let active = true;
    return Object.freeze({
      detach: (): void => {
        if (!active) return;
        active = false;
        this.detach(registration, "RenderObject motion owner was detached.");
      },
    });
  }

  snap(
    registration: RuntimeRegistration,
    target: RenderObjectMotionTarget,
  ): void {
    this.assertRegistration(registration);
    const prepared = this.prepareTarget(registration.adapter, target);
    this.cancel(registration, "RenderObject motion was superseded by snap.");
    registration.adapter.apply(prepared.target);
  }

  attachChild(registration: RuntimeRegistration, child: RenderObject): void {
    this.assertRegistration(registration);
    if (registration.childAttachments.has(child))
      throw this.#createError(
        "RenderObject child is already attached to this motion owner.",
      );
    registration.childAttachments.set(child, this.attach(child));
  }

  detachChild(registration: RuntimeRegistration, child: RenderObject): void {
    const attachment = registration.childAttachments.get(child);
    if (!attachment) return;
    registration.childAttachments.delete(child);
    attachment.detach();
  }

  animate(
    registration: RuntimeRegistration,
    animation: RenderObjectMotionAnimation,
  ): Promise<void> {
    try {
      this.assertRegistration(registration);
      const prepared = this.prepareAnimation(registration.adapter, animation);
      if (!Object.values(prepared.changed).some(Boolean))
        return Promise.resolve();
      this.cancel(registration, "RenderObject motion was superseded.");
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      let active!: ActiveAnimation;
      const abortListener = animation.signal
        ? () => {
            if (registration.active !== active) return;
            this.cancel(registration, "RenderObject motion was aborted.");
          }
        : undefined;
      active = {
        ...prepared,
        elapsedSeconds: 0,
        resolve,
        reject,
        ...(abortListener ? { abortListener } : {}),
      };
      registration.active = active;
      animation.signal?.addEventListener("abort", abortListener!, {
        once: true,
      });
      return promise;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  update(deltaSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw this.#createError(
        "RenderObject motion deltaSeconds must be finite and non-negative.",
      );
    for (const registration of [...this.#ownedRegistrations]) {
      const active = registration.active;
      if (!active) continue;
      if (active.signal?.aborted) {
        this.cancel(registration, "RenderObject motion was aborted.");
        continue;
      }
      active.elapsedSeconds = Math.min(
        active.durationSeconds,
        active.elapsedSeconds + deltaSeconds,
      );
      const rawProgress = active.elapsedSeconds / active.durationSeconds;
      const easedProgress = active.ease(rawProgress);
      const position = active.changed.position
        ? active.positionMotion!.sample(rawProgress)
        : active.source.position;
      registration.adapter.apply(
        Object.freeze({
          position,
          opacity: active.changed.opacity
            ? interpolate(
                active.source.opacity,
                active.target.opacity,
                easedProgress,
              )
            : active.source.opacity,
          scale: active.changed.scale
            ? Object.freeze({
                x: interpolate(
                  active.source.scale.x,
                  active.target.scale.x,
                  easedProgress,
                ),
                y: interpolate(
                  active.source.scale.y,
                  active.target.scale.y,
                  easedProgress,
                ),
              })
            : active.source.scale,
          rotationDegrees: active.changed.rotation
            ? interpolate(
                active.source.rotationDegrees,
                active.target.rotationDegrees,
                easedProgress,
              )
            : active.source.rotationDegrees,
        }),
      );
      if (active.elapsedSeconds < active.durationSeconds) continue;
      this.finish(registration, active);
    }
  }

  cancel(registration: RuntimeRegistration, message: string): void {
    const active = registration.active;
    if (!active) return;
    registration.active = null;
    active.signal?.removeEventListener("abort", active.abortListener!);
    active.reject(this.#createError(message));
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const registration of [...this.#ownedRegistrations])
      this.detach(registration, "RenderObject motion runtime was destroyed.");
  }

  private prepareAnimation(
    adapter: RenderObjectMotionPropertyAdapter,
    animation: RenderObjectMotionAnimation,
  ): PreparedAnimation {
    if (!animation || typeof animation !== "object")
      throw this.#createError("RenderObject motion animation is required.");
    if (
      !Number.isFinite(animation.durationSeconds) ||
      animation.durationSeconds <= 0
    )
      throw this.#createError(
        "RenderObject motion durationSeconds must be positive and finite.",
      );
    if (animation.signal?.aborted)
      throw this.#createError("RenderObject motion was already aborted.");
    const prepared = this.prepareTarget(adapter, animation);
    if (animation.path && !animation.position)
      throw this.#createError(
        "RenderObject motion path requires a position target.",
      );
    const easing = animation.easing ?? { kind: "linear" };
    const ease = prepareRenderObjectMotionEasing(easing, this.#createError);
    const positionChanged = Boolean(
      animation.position &&
      (prepared.source.position.x !== prepared.target.position.x ||
        prepared.source.position.y !== prepared.target.position.y ||
        animation.path?.kind === "cubic-bezier-path"),
    );
    const changed = Object.freeze({
      position: positionChanged,
      opacity:
        prepared.changed.opacity &&
        prepared.source.opacity !== prepared.target.opacity,
      scale:
        prepared.changed.scale &&
        (prepared.source.scale.x !== prepared.target.scale.x ||
          prepared.source.scale.y !== prepared.target.scale.y),
      rotation:
        prepared.changed.rotation &&
        prepared.source.rotationDegrees !== prepared.target.rotationDegrees,
    });
    const positionMotion = positionChanged
      ? prepareRenderObjectPositionMotion(
          animation.path ?? { kind: "line" },
          easing,
          prepared.source.position,
          prepared.target.position,
          this.#createError,
        )
      : null;
    return Object.freeze({
      ...prepared,
      changed,
      durationSeconds: animation.durationSeconds,
      ease,
      positionMotion,
      ...(animation.signal ? { signal: animation.signal } : {}),
    });
  }

  private prepareTarget(
    adapter: RenderObjectMotionPropertyAdapter,
    target: RenderObjectMotionTarget,
  ): Pick<PreparedAnimation, "source" | "target" | "changed"> {
    adapter.assertUsable();
    if (!adapter.owned)
      throw this.#createError(
        "Borrowed RenderObject cannot use generic property motion; clone it or use an owner presentation scope.",
      );
    if (!target || typeof target !== "object")
      throw this.#createError("RenderObject motion target is required.");
    const changed = Object.freeze({
      position: target.position !== undefined,
      opacity: target.opacity !== undefined,
      scale: target.scale !== undefined,
      rotation: target.rotationDegrees !== undefined,
    });
    if (!Object.values(changed).some(Boolean))
      throw this.#createError(
        "RenderObject motion must target at least one property.",
      );
    if (target.position !== undefined)
      assertPoint(target.position, "position target", this.#createError);
    if (
      target.opacity !== undefined &&
      (!Number.isFinite(target.opacity) ||
        target.opacity < 0 ||
        target.opacity > 1)
    )
      throw this.#createError(
        "RenderObject motion opacity must be between 0 and 1.",
      );
    if (
      target.scale !== undefined &&
      (!Number.isFinite(target.scale.x) || !Number.isFinite(target.scale.y))
    )
      throw this.#createError(
        "RenderObject motion scale must contain finite factors.",
      );
    if (
      target.rotationDegrees !== undefined &&
      !Number.isFinite(target.rotationDegrees)
    )
      throw this.#createError(
        "RenderObject motion rotation must be a finite number of degrees.",
      );
    const source = freezeState(adapter.capture());
    const resolved = freezeState({
      position: target.position ?? source.position,
      opacity: target.opacity ?? source.opacity,
      scale: target.scale ?? source.scale,
      rotationDegrees: target.rotationDegrees ?? source.rotationDegrees,
    });
    return Object.freeze({ source, target: resolved, changed });
  }

  private assertRegistration(registration: RuntimeRegistration): void {
    this.assertAlive();
    if (
      registration.runtime !== this ||
      registration.detached ||
      registration.binding.registration !== registration
    )
      throw this.#createError("RenderObject motion owner is stale.");
    registration.adapter.assertUsable();
  }

  private finish(
    registration: RuntimeRegistration,
    active: ActiveAnimation,
  ): void {
    if (registration.active !== active) return;
    registration.active = null;
    active.signal?.removeEventListener("abort", active.abortListener!);
    active.resolve();
  }

  private detach(registration: RuntimeRegistration, message: string): void {
    if (registration.detached) return;
    registration.detached = true;
    this.cancel(registration, message);
    for (const attachment of registration.childAttachments.values())
      attachment.detach();
    registration.childAttachments.clear();
    this.#ownedRegistrations.delete(registration);
    if (registration.binding.registration === registration)
      registration.binding.registration = null;
  }

  private assertAlive(): void {
    if (this.#destroyed)
      throw this.#createError("RenderObject motion runtime was destroyed.");
  }
}

function freezeState(state: RenderObjectMotionState): RenderObjectMotionState {
  assertPoint(
    state.position,
    "captured position",
    (message) => new SymbolAnimationError(message),
  );
  if (!Number.isFinite(state.opacity) || state.opacity < 0 || state.opacity > 1)
    throw new SymbolAnimationError(
      "RenderObject captured opacity must be between 0 and 1.",
    );
  if (!Number.isFinite(state.scale.x) || !Number.isFinite(state.scale.y))
    throw new SymbolAnimationError(
      "RenderObject captured scale must contain finite factors.",
    );
  if (!Number.isFinite(state.rotationDegrees))
    throw new SymbolAnimationError(
      "RenderObject captured rotation must be finite.",
    );
  return Object.freeze({
    position: Object.freeze({ ...state.position }),
    opacity: state.opacity,
    scale: Object.freeze({ ...state.scale }),
    rotationDegrees: state.rotationDegrees,
  });
}

function prepareSegments(
  path: RenderObjectMotionPath,
  source: RenderPoint,
  target: RenderPoint,
  createError: (message: string) => Error,
): readonly CubicSegment[] {
  if (path.kind === "line")
    return Object.freeze([
      Object.freeze({
        start: source,
        control1: source,
        control2: target,
        end: target,
      }),
    ]);
  if (path.kind !== "cubic-bezier-path")
    throw createError(
      `Unknown RenderObject motion path kind "${String((path as { kind?: unknown }).kind)}".`,
    );
  if (!Array.isArray(path.segments) || path.segments.length === 0)
    throw createError("RenderObject cubic-bezier-path must contain segments.");
  let start = Object.freeze({ ...source });
  const segments = path.segments.map((segment, index) => {
    assertPoint(
      segment.control1,
      `path.segments[${index}].control1`,
      createError,
    );
    assertPoint(
      segment.control2,
      `path.segments[${index}].control2`,
      createError,
    );
    assertPoint(segment.end, `path.segments[${index}].end`, createError);
    const normalized = Object.freeze({
      start,
      control1: Object.freeze({ ...segment.control1 }),
      control2: Object.freeze({ ...segment.control2 }),
      end: Object.freeze({ ...segment.end }),
    });
    start = normalized.end;
    return normalized;
  });
  const end = segments[segments.length - 1]!.end;
  if (end.x !== target.x || end.y !== target.y)
    throw createError(
      "RenderObject cubic-bezier-path must end at target position.",
    );
  return Object.freeze(segments);
}

function buildArcLookup(
  segments: readonly CubicSegment[],
  createError: (message: string) => Error,
): readonly ArcSample[] {
  const samples: ArcSample[] = [{ segmentIndex: 0, t: 0, distance: 0 }];
  let distance = 0;
  let previous = segments[0]!.start;
  segments.forEach((segment, segmentIndex) => {
    for (let index = 1; index <= ARC_SAMPLES_PER_SEGMENT; index += 1) {
      const t = index / ARC_SAMPLES_PER_SEGMENT;
      const point = sampleCubic(segment, t);
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      samples.push({ segmentIndex, t, distance });
      previous = point;
    }
  });
  if (!(distance > 0))
    throw createError("RenderObject motion path must have positive length.");
  return Object.freeze(samples);
}

function sampleByDistance(
  segments: readonly CubicSegment[],
  lookup: readonly ArcSample[],
  progress: number,
): RenderPoint {
  const wanted =
    lookup[lookup.length - 1]!.distance * Math.min(1, Math.max(0, progress));
  let high = lookup.length - 1;
  let low = 0;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (lookup[middle]!.distance < wanted) low = middle;
    else high = middle;
  }
  const before = lookup[low]!;
  const after = lookup[high]!;
  const span = after.distance - before.distance;
  const ratio = span === 0 ? 0 : (wanted - before.distance) / span;
  const segmentIndex = after.segmentIndex;
  const t0 = before.segmentIndex === segmentIndex ? before.t : 0;
  return Object.freeze(
    sampleCubic(segments[segmentIndex]!, t0 + (after.t - t0) * ratio),
  );
}

function sampleCubic(segment: CubicSegment, t: number): RenderPoint {
  return {
    x: cubic(
      segment.start.x,
      segment.control1.x,
      segment.control2.x,
      segment.end.x,
      t,
    ),
    y: cubic(
      segment.start.y,
      segment.control1.y,
      segment.control2.y,
      segment.end.y,
      t,
    ),
  };
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const inverse = 1 - t;
  return (
    inverse ** 3 * a +
    3 * inverse ** 2 * t * b +
    3 * inverse * t ** 2 * c +
    t ** 3 * d
  );
}

function assertPoint(
  value: RenderPoint,
  label: string,
  createError: (message: string) => Error,
): void {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y))
    throw createError(`RenderObject motion ${label} must contain finite x/y.`);
}

function interpolate(source: number, target: number, progress: number): number {
  return source + (target - source) * progress;
}
