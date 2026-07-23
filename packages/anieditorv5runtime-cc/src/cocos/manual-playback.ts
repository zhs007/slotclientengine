import {
  createCardCarousel3DContinuousMotion,
  createCardCarousel3DResolvePlan,
  sampleCardCarousel3DResolveMotion,
  type VNICardCarousel3DMotionSample,
  type VNICardCarousel3DPreparedConfig,
  type VNICardCarousel3DTextureInfo,
} from "../core/card-carousel-3d.js";
import {
  normalizePlaybackPoint,
  normalizePlaybackRange,
} from "../core/playback-sequence.js";
import type { V5GAnimationConfig } from "../core/types.js";
import type {
  V5GCocosCapturedNodeVisual,
  V5GCocosNodeCaptureOptions,
} from "./node-driver.js";
import type { V5GCocosPlaybackPoint, V5GCocosPlaybackRange } from "./types.js";

export type V5GCocosRuntimeAnimationCapability =
  | "continuous-phase"
  | "replaceable-carriers"
  | "cyclic-selection";

export interface V5GCocosAnimationRuntimeRef {
  readonly layerId: string;
  readonly animationId: string;
}

export interface V5GCocosManualAnimationInfo {
  readonly ref: V5GCocosAnimationRuntimeRef;
  readonly layerName: string;
  readonly animationName: string;
  readonly animationType: string;
  readonly capabilities: readonly V5GCocosRuntimeAnimationCapability[];
}

export interface V5GCocosPlaybackOperation {
  readonly completed: Promise<{ readonly reason: "complete" }>;
  cancel(): void;
}

export interface V5GCocosTimelineHoldHandle {
  release(): void;
}

export interface V5GCocosCyclicSelectionItem<TNode> {
  readonly key: string;
  readonly visual: {
    readonly kind: "node";
    readonly node: TNode;
    readonly width: number;
    readonly height: number;
    readonly revision?: string | number;
  };
}

export interface V5GCocosCyclicAuthoredPreviewDescriptor {
  readonly introRange: V5GCocosPlaybackRange;
  readonly continuousHoldPoint: V5GCocosPlaybackPoint;
  readonly continuousPhaseId: string;
  readonly authoredContinuousPreviewDurationSeconds: number;
  readonly endingRange: V5GCocosPlaybackRange;
  readonly authoredTargetCarrierIndex: number;
}

export interface V5GCocosCyclicSelectionState {
  readonly phase:
    | "uncontrolled"
    | "preparing"
    | "configured"
    | "continuous"
    | "selection-pending"
    | "selection-committed"
    | "resolving"
    | "complete"
    | "destroyed";
  readonly continuousElapsedSeconds: number;
  readonly selectedItemKey: string | null;
  readonly selectedCarrierIndex: number | null;
  readonly carrierKeys: readonly string[];
}

export interface V5GCocosCyclicBindingOperation {
  readonly ready: Promise<void>;
  cancel(): void;
}

export interface V5GCocosCyclicSelectionTransaction {
  readonly committed: Promise<{
    readonly itemKey: string;
    readonly carrierIndex: number;
  }>;
  cancel(): void;
}

export interface V5GCocosCyclicSelectionController<TNode> {
  getState(): V5GCocosCyclicSelectionState;
  getAuthoredPreviewDescriptor(): V5GCocosCyclicAuthoredPreviewDescriptor;
  setInitialItems(
    items: readonly V5GCocosCyclicSelectionItem<TNode>[],
  ): V5GCocosCyclicBindingOperation;
  adoptAuthoredItems(): void;
  startContinuousPhase(options: { readonly phaseId: string }): void;
  prepareSelection(options: {
    readonly selectedItem:
      | { readonly key: string }
      | V5GCocosCyclicSelectionItem<TNode>;
  }): V5GCocosCyclicSelectionTransaction;
  prepareAuthoredSelection(): V5GCocosCyclicSelectionTransaction;
  startResolvePhase(): void;
  clear(): void;
}

export interface V5GCocosManualAnimationController<TNode> {
  readonly ref: V5GCocosAnimationRuntimeRef;
  getCapabilities(): readonly V5GCocosRuntimeAnimationCapability[];
  requireCyclicSelection(): V5GCocosCyclicSelectionController<TNode>;
  clearRuntimeOverride(): void;
}

export interface V5GCocosManualPlaybackState {
  readonly phase:
    | "idle"
    | "range"
    | "hold"
    | "continuous"
    | "resolving"
    | "complete"
    | "destroyed";
  readonly currentTime: number;
  readonly hasActiveOperation: boolean;
  readonly hasTimelineHold: boolean;
  readonly activeContinuousAnimationCount: number;
}

export interface V5GCocosManualPlaybackSession<TNode> {
  playRange(options: {
    readonly range: V5GCocosPlaybackRange;
    readonly preserveRuntimeAnimationState?: boolean;
  }): V5GCocosPlaybackOperation;
  holdTimeline(options: {
    readonly at: V5GCocosPlaybackPoint;
  }): V5GCocosTimelineHoldHandle;
  advanceFor(options: {
    readonly durationSeconds: number;
  }): V5GCocosPlaybackOperation;
  listAnimations(options?: {
    readonly capability?: V5GCocosRuntimeAnimationCapability;
  }): readonly V5GCocosManualAnimationInfo[];
  getAnimation(
    ref: V5GCocosAnimationRuntimeRef,
  ): V5GCocosManualAnimationController<TNode>;
  getState(): V5GCocosManualPlaybackState;
  destroy(): void;
}

export class V5GCocosPlaybackCancelledError extends Error {
  constructor(message = "V5G Cocos manual playback operation was cancelled.") {
    super(message);
    this.name = "V5GCocosPlaybackCancelledError";
  }
}

export interface V5GCocosCardCarouselManualRuntime<TSpriteFrame> {
  readonly prepared: VNICardCarousel3DPreparedConfig;
  getAuthoredSources(): readonly {
    readonly spriteFrame: TSpriteFrame;
    readonly info: VNICardCarousel3DTextureInfo;
  }[];
  getCurrentSources(): readonly {
    readonly spriteFrame: TSpriteFrame;
    readonly info: VNICardCarousel3DTextureInfo;
  }[];
  replaceCarrierSource(
    carrierIndex: number,
    spriteFrame: TSpriteFrame,
    width: number,
    height: number,
  ): void;
  isCarrierSafeToReplace(carrierIndex: number): boolean;
  canEverHideCarrier(): boolean;
}

export interface V5GCocosManualAnimationRuntimeRecord<TSpriteFrame> {
  readonly ref: V5GCocosAnimationRuntimeRef;
  readonly layerName: string;
  readonly animationName: string;
  readonly animation: V5GAnimationConfig;
  readonly runtime: V5GCocosCardCarouselManualRuntime<TSpriteFrame>;
  readonly authoredAssetIds: readonly string[];
}

export interface V5GCocosManualPlaybackHost<TNode, TSpriteFrame> {
  getManualDuration(): number;
  getManualAnimationRecords(): readonly V5GCocosManualAnimationRuntimeRecord<TSpriteFrame>[];
  isManualHostNodeValid(node: TNode): boolean;
  captureManualNodeVisual(
    options: V5GCocosNodeCaptureOptions<TNode>,
  ):
    | V5GCocosCapturedNodeVisual<TSpriteFrame>
    | Promise<V5GCocosCapturedNodeVisual<TSpriteFrame>>;
  renderManualFrame(time: number): void;
  triggerManualRangeStart(time: number): void;
  triggerManualRangeEvents(previousTime: number, currentTime: number): void;
  completeManualRange(
    startTime: number,
    endTime: number,
    completed: () => void,
  ): void;
  cancelManualRangeCompletion(): void;
  setManualClockActive(active: boolean): void;
  detachManualSession(
    session: V5GCocosManualPlaybackSessionImpl<TNode, TSpriteFrame>,
  ): void;
}

interface DeferredOperation extends V5GCocosPlaybackOperation {
  resolve(): void;
  reject(error: Error): void;
  isPending(): boolean;
}

interface DeferredBindingOperation extends V5GCocosCyclicBindingOperation {
  resolve(): void;
  reject(error: Error): void;
  isPending(): boolean;
}

interface DeferredTransaction extends V5GCocosCyclicSelectionTransaction {
  resolve(value: { itemKey: string; carrierIndex: number }): void;
  reject(error: Error): void;
  isPending(): boolean;
}

interface ActiveRange {
  readonly startTime: number;
  readonly endTime: number;
  currentTime: number;
  awaitingCompletion: boolean;
  readonly operation: DeferredOperation;
}

interface ActiveAdvance {
  elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly operation: DeferredOperation;
}

interface VisualLease<TNode, TSpriteFrame> {
  readonly node: TNode;
  readonly spriteFrame: TSpriteFrame;
  readonly width: number;
  readonly height: number;
  readonly revision: string | number | undefined;
  release(): void;
}

interface CaptureCacheEntry<TSpriteFrame> {
  refs: number;
  readonly visual: Promise<V5GCocosCapturedNodeVisual<TSpriteFrame>>;
  resolved: V5GCocosCapturedNodeVisual<TSpriteFrame> | null;
}

interface CarrierBinding<TNode, TSpriteFrame> {
  readonly key: string;
  readonly node: TNode | null;
  readonly spriteFrame: TSpriteFrame;
  readonly width: number;
  readonly height: number;
  readonly revision: string | number | undefined;
  readonly lease: VisualLease<TNode, TSpriteFrame> | null;
}

interface PendingSelection<TNode, TSpriteFrame> {
  readonly itemKey: string;
  readonly carrierIndex: number | null;
  readonly transaction: DeferredTransaction;
  lease: VisualLease<TNode, TSpriteFrame> | null;
  capturePending: boolean;
}

const CYCLIC_CAPABILITIES = Object.freeze([
  "continuous-phase",
  "replaceable-carriers",
  "cyclic-selection",
] as const);

export class V5GCocosManualPlaybackSessionImpl<
  TNode,
  TSpriteFrame,
> implements V5GCocosManualPlaybackSession<TNode> {
  private readonly controllers = new Map<
    string,
    V5GCocosManualAnimationControllerImpl<TNode, TSpriteFrame>
  >();
  private activeRange: ActiveRange | null = null;
  private activeAdvance: ActiveAdvance | null = null;
  private holdTime: number | null = null;
  private currentTime = 0;
  private destroyed = false;
  private completed = false;

  constructor(
    private readonly host: V5GCocosManualPlaybackHost<TNode, TSpriteFrame>,
  ) {}

  playRange(options: {
    readonly range: V5GCocosPlaybackRange;
    readonly preserveRuntimeAnimationState?: boolean;
  }): V5GCocosPlaybackOperation {
    this.assertAlive();
    if (this.holdTime !== null) {
      throw new Error(
        "Release the V5G Cocos manual timeline hold before starting a range.",
      );
    }
    this.assertNoOperation();
    if (!options.preserveRuntimeAnimationState) {
      for (const controller of this.controllers.values()) {
        controller.clearRuntimeOverride();
      }
    }
    const range = normalizePlaybackRange(
      options.range,
      this.host.getManualDuration(),
    );
    const operation = createDeferredOperation(() => {
      if (this.activeRange?.operation === operation) {
        this.host.cancelManualRangeCompletion();
        this.activeRange = null;
        this.updateClock();
      }
    });
    this.activeRange = {
      ...range,
      currentTime: range.startTime,
      awaitingCompletion: false,
      operation,
    };
    this.currentTime = range.startTime;
    this.completed = false;
    this.host.renderManualFrame(this.currentTime);
    this.host.triggerManualRangeStart(this.currentTime);
    this.updateClock();
    return operation;
  }

  holdTimeline(options: {
    readonly at: V5GCocosPlaybackPoint;
  }): V5GCocosTimelineHoldHandle {
    this.assertAlive();
    this.assertNoOperation();
    if (this.holdTime !== null) {
      throw new Error("V5G Cocos manual timeline already has an active hold.");
    }
    this.holdTime = normalizePlaybackPoint(
      options.at,
      this.host.getManualDuration(),
      "manual timeline hold",
    );
    this.currentTime = this.holdTime;
    this.host.renderManualFrame(this.currentTime);
    let released = false;
    this.updateClock();
    return {
      release: () => {
        if (released) return;
        released = true;
        if (this.destroyed) return;
        this.holdTime = null;
        this.updateClock();
      },
    };
  }

  advanceFor(options: {
    readonly durationSeconds: number;
  }): V5GCocosPlaybackOperation {
    this.assertAlive();
    this.assertNoOperation();
    if (this.holdTime === null) {
      throw new Error(
        "V5G Cocos manual advanceFor() requires a timeline hold.",
      );
    }
    if (
      !Number.isFinite(options.durationSeconds) ||
      options.durationSeconds <= 0
    ) {
      throw new Error(
        "V5G Cocos manual advanceFor durationSeconds must be a positive finite number.",
      );
    }
    const operation = createDeferredOperation(() => {
      if (this.activeAdvance?.operation === operation) {
        this.activeAdvance = null;
        this.updateClock();
      }
    });
    this.activeAdvance = {
      elapsedSeconds: 0,
      durationSeconds: options.durationSeconds,
      operation,
    };
    this.updateClock();
    return operation;
  }

  listAnimations(options?: {
    readonly capability?: V5GCocosRuntimeAnimationCapability;
  }): readonly V5GCocosManualAnimationInfo[] {
    this.assertAlive();
    const capability = options?.capability;
    return this.host
      .getManualAnimationRecords()
      .map((record) => toAnimationInfo(record))
      .filter(
        (info) =>
          capability === undefined ||
          info.capabilities.indexOf(capability) >= 0,
      );
  }

  getAnimation(
    ref: V5GCocosAnimationRuntimeRef,
  ): V5GCocosManualAnimationController<TNode> {
    this.assertAlive();
    const key = getRefKey(ref);
    const existing = this.controllers.get(key);
    if (existing) return existing;
    const matches = this.host
      .getManualAnimationRecords()
      .filter(
        (record) =>
          record.ref.layerId === ref.layerId &&
          record.ref.animationId === ref.animationId,
      );
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? `Unknown or disabled V5G Cocos runtime animation: ${ref.layerId}/${ref.animationId}.`
          : `Ambiguous V5G Cocos runtime animation: ${ref.layerId}/${ref.animationId}.`,
      );
    }
    const controller = new V5GCocosManualAnimationControllerImpl(
      this.host,
      matches[0],
      () => this.updateClock(),
    );
    this.controllers.set(key, controller);
    return controller;
  }

  getState(): V5GCocosManualPlaybackState {
    let activeCount = 0;
    let hasContinuous = false;
    let hasResolving = false;
    for (const controller of this.controllers.values()) {
      if (controller.isContinuousOrResolving()) activeCount += 1;
      if (controller.isContinuous()) hasContinuous = true;
      if (controller.isResolving()) hasResolving = true;
    }
    let phase: V5GCocosManualPlaybackState["phase"];
    if (this.destroyed) phase = "destroyed";
    else if (this.activeRange) phase = hasResolving ? "resolving" : "range";
    else if (hasContinuous) phase = "continuous";
    else if (this.holdTime !== null) phase = "hold";
    else if (this.completed) phase = "complete";
    else phase = "idle";
    return {
      phase,
      currentTime: this.currentTime,
      hasActiveOperation:
        this.activeRange !== null || this.activeAdvance !== null,
      hasTimelineHold: this.holdTime !== null,
      activeContinuousAnimationCount: activeCount,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.activeRange?.operation.cancel();
    this.activeAdvance?.operation.cancel();
    this.activeRange = null;
    this.activeAdvance = null;
    this.holdTime = null;
    for (const controller of this.controllers.values()) controller.destroy();
    this.controllers.clear();
    this.host.setManualClockActive(false);
    this.host.detachManualSession(this);
  }

  advance(deltaSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "V5G Cocos manual deltaSeconds must be non-negative and finite.",
      );
    }
    if (deltaSeconds === 0) return;
    const runtimeDeltaSeconds =
      this.holdTime !== null && this.activeAdvance
        ? Math.min(
            deltaSeconds,
            this.activeAdvance.durationSeconds -
              this.activeAdvance.elapsedSeconds,
          )
        : deltaSeconds;
    if (runtimeDeltaSeconds > 0) {
      for (const controller of this.controllers.values()) {
        controller.advance(runtimeDeltaSeconds);
      }
    }
    if (this.activeRange) {
      const range = this.activeRange;
      if (range.awaitingCompletion) return;
      const previousTime = range.currentTime;
      range.currentTime = Math.min(
        range.endTime,
        range.currentTime + deltaSeconds,
      );
      this.currentTime = range.currentTime;
      this.host.renderManualFrame(this.currentTime);
      this.host.triggerManualRangeEvents(previousTime, this.currentTime);
      for (const controller of this.controllers.values()) {
        controller.afterRender(this.currentTime);
      }
      if (range.currentTime >= range.endTime) {
        range.awaitingCompletion = true;
        this.host.completeManualRange(range.startTime, range.endTime, () => {
          if (
            this.destroyed ||
            this.activeRange !== range ||
            !range.operation.isPending()
          ) {
            return;
          }
          this.activeRange = null;
          this.completed = true;
          for (const controller of this.controllers.values()) {
            controller.onRangeComplete(this.currentTime);
          }
          range.operation.resolve();
          this.updateClock();
        });
      }
    } else if (this.holdTime !== null) {
      this.currentTime = this.holdTime;
      this.host.renderManualFrame(this.currentTime);
      for (const controller of this.controllers.values()) {
        controller.afterRender(this.currentTime);
      }
    }
    if (this.activeAdvance) {
      const advance = this.activeAdvance;
      advance.elapsedSeconds += runtimeDeltaSeconds;
      if (advance.elapsedSeconds >= advance.durationSeconds) {
        this.activeAdvance = null;
        advance.operation.resolve();
      }
    }
    this.updateClock();
  }

  getControlledMotion(
    ref: V5GCocosAnimationRuntimeRef,
    timelineTime: number,
  ): VNICardCarousel3DMotionSample | null {
    return (
      this.controllers.get(getRefKey(ref))?.getMotion(timelineTime) ?? null
    );
  }

  private updateClock(): void {
    if (this.destroyed) return;
    let controlled = false;
    for (const controller of this.controllers.values()) {
      if (controller.isContinuousOrResolving()) {
        controlled = true;
        break;
      }
    }
    this.host.setManualClockActive(
      (this.activeRange !== null && !this.activeRange.awaitingCompletion) ||
        this.activeAdvance !== null ||
        (this.holdTime !== null && controlled),
    );
  }

  private assertNoOperation(): void {
    if (this.activeRange || this.activeAdvance) {
      throw new Error(
        "V5G Cocos manual playback already has an active operation.",
      );
    }
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("V5G Cocos manual playback session is destroyed.");
    }
  }
}

class V5GCocosManualAnimationControllerImpl<
  TNode,
  TSpriteFrame,
> implements V5GCocosManualAnimationController<TNode> {
  readonly ref: V5GCocosAnimationRuntimeRef;
  private readonly cyclic: V5GCocosCyclicSelectionControllerImpl<
    TNode,
    TSpriteFrame
  >;

  constructor(
    host: V5GCocosManualPlaybackHost<TNode, TSpriteFrame>,
    record: V5GCocosManualAnimationRuntimeRecord<TSpriteFrame>,
    onClockChange: () => void,
  ) {
    this.ref = record.ref;
    this.cyclic = new V5GCocosCyclicSelectionControllerImpl(
      host,
      record,
      onClockChange,
    );
  }

  getCapabilities(): readonly V5GCocosRuntimeAnimationCapability[] {
    return CYCLIC_CAPABILITIES;
  }

  requireCyclicSelection(): V5GCocosCyclicSelectionController<TNode> {
    return this.cyclic;
  }

  clearRuntimeOverride(): void {
    this.cyclic.clearRuntimeOverride();
  }

  advance(deltaSeconds: number): void {
    this.cyclic.advance(deltaSeconds);
  }

  afterRender(time: number): void {
    this.cyclic.afterRender(time);
  }

  onRangeComplete(time: number): void {
    this.cyclic.onRangeComplete(time);
  }

  getMotion(time: number): VNICardCarousel3DMotionSample | null {
    return this.cyclic.getMotion(time);
  }

  isContinuousOrResolving(): boolean {
    return this.cyclic.isContinuousOrResolving();
  }

  isContinuous(): boolean {
    return this.cyclic.isContinuous();
  }

  isResolving(): boolean {
    return this.cyclic.isResolving();
  }

  destroy(): void {
    this.cyclic.destroy();
  }
}

class V5GCocosCyclicSelectionControllerImpl<
  TNode,
  TSpriteFrame,
> implements V5GCocosCyclicSelectionController<TNode> {
  private readonly authoredSources: readonly {
    readonly spriteFrame: TSpriteFrame;
    readonly info: VNICardCarousel3DTextureInfo;
  }[];
  private readonly captureCache = new Map<
    TNode,
    Map<string, CaptureCacheEntry<TSpriteFrame>>
  >();
  private bindings: CarrierBinding<TNode, TSpriteFrame>[] = [];
  private phase: V5GCocosCyclicSelectionState["phase"] = "uncontrolled";
  private continuousElapsedSeconds = 0;
  private motion: VNICardCarousel3DMotionSample | null = null;
  private resolvePlan: ReturnType<
    typeof createCardCarousel3DResolvePlan
  > | null = null;
  private selectedItemKey: string | null = null;
  private selectedCarrierIndex: number | null = null;
  private pending: PendingSelection<TNode, TSpriteFrame> | null = null;
  private initialOperation: DeferredBindingOperation | null = null;
  private destroyed = false;

  constructor(
    private readonly host: V5GCocosManualPlaybackHost<TNode, TSpriteFrame>,
    private readonly record: V5GCocosManualAnimationRuntimeRecord<TSpriteFrame>,
    private readonly onClockChange: () => void,
  ) {
    this.authoredSources = record.runtime.getAuthoredSources();
  }

  getState(): V5GCocosCyclicSelectionState {
    return {
      phase: this.destroyed ? "destroyed" : this.phase,
      continuousElapsedSeconds: this.continuousElapsedSeconds,
      selectedItemKey: this.selectedItemKey,
      selectedCarrierIndex: this.selectedCarrierIndex,
      carrierKeys: this.bindings.map((binding) => binding.key),
    };
  }

  getAuthoredPreviewDescriptor(): V5GCocosCyclicAuthoredPreviewDescriptor {
    this.assertAlive();
    const prepared = this.record.runtime.prepared;
    const start = this.record.animation.startTime;
    const introEnd = start + prepared.introDuration;
    const endingStart = introEnd + prepared.demoIdleDuration;
    return Object.freeze({
      introRange: { unit: "time" as const, start, end: introEnd },
      continuousHoldPoint: { unit: "time" as const, at: introEnd },
      continuousPhaseId: "idle",
      authoredContinuousPreviewDurationSeconds: prepared.demoIdleDuration,
      endingRange: {
        unit: "time" as const,
        start: endingStart,
        end:
          endingStart +
          prepared.fastDuration +
          prepared.stopDuration +
          prepared.holdDuration,
      },
      authoredTargetCarrierIndex: prepared.targetIndex,
    });
  }

  setInitialItems(
    items: readonly V5GCocosCyclicSelectionItem<TNode>[],
  ): V5GCocosCyclicBindingOperation {
    this.assertAlive();
    if (this.phase !== "uncontrolled" && this.phase !== "configured") {
      throw new Error(
        `Cannot set V5G Cocos cyclic initial items while phase is "${this.phase}".`,
      );
    }
    if (this.initialOperation) {
      throw new Error(
        "V5G Cocos cyclic initial item preparation is already active.",
      );
    }
    const count = this.record.runtime.prepared.cardCount;
    if (items.length !== count) {
      throw new Error(
        `V5G Cocos cyclic initial items must contain exactly ${count} entries.`,
      );
    }
    const seenKeys = new Set<string>();
    const seenNodes = new Set<TNode>();
    const normalized = items.map((item) => {
      const key = normalizeItemKey(item.key);
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate V5G Cocos cyclic item key: ${key}.`);
      }
      seenKeys.add(key);
      validateNodeVisual(this.host, item.visual);
      if (seenNodes.has(item.visual.node)) {
        throw new Error(
          "V5G Cocos cyclic initial items cannot reuse the same host Node.",
        );
      }
      seenNodes.add(item.visual.node);
      return { key, visual: item.visual };
    });
    let cancelled = false;
    const operation = createDeferredBindingOperation(() => {
      cancelled = true;
      if (this.initialOperation === operation) {
        this.initialOperation = null;
        if (!this.destroyed) {
          this.phase = this.bindings.length > 0 ? "configured" : "uncontrolled";
        }
      }
    });
    this.initialOperation = operation;
    this.phase = "preparing";
    void Promise.all(
      normalized.map(async (item) => {
        try {
          return {
            ok: true as const,
            key: item.key,
            lease: await this.acquireVisual(item.visual),
          };
        } catch (error) {
          return { ok: false as const, error };
        }
      }),
    ).then((results) => {
      const failed = results.find((result) => !result.ok);
      const prepared = results.filter(
        (result): result is Extract<(typeof results)[number], { ok: true }> =>
          result.ok,
      );
      if (failed) {
        for (const item of prepared) item.lease.release();
        if (operation.isPending()) {
          this.initialOperation = null;
          this.phase = this.bindings.length > 0 ? "configured" : "uncontrolled";
          operation.reject(asError(failed.error));
        }
        return;
      }
      if (cancelled || this.destroyed || !operation.isPending()) {
        for (const item of prepared) item.lease.release();
        return;
      }
      const previous = this.record.runtime.getCurrentSources();
      let replaced = 0;
      try {
        for (let index = 0; index < prepared.length; index += 1) {
          const lease = prepared[index].lease;
          this.record.runtime.replaceCarrierSource(
            index,
            lease.spriteFrame,
            lease.width,
            lease.height,
          );
          replaced += 1;
        }
      } catch (error) {
        for (let index = 0; index < replaced; index += 1) {
          this.record.runtime.replaceCarrierSource(
            index,
            previous[index].spriteFrame,
            previous[index].info.width,
            previous[index].info.height,
          );
        }
        for (const item of prepared) item.lease.release();
        this.initialOperation = null;
        this.phase = this.bindings.length > 0 ? "configured" : "uncontrolled";
        operation.reject(asError(error));
        return;
      }
      this.releaseBindings();
      this.bindings = prepared.map(({ key, lease }) => ({
        key,
        node: lease.node,
        spriteFrame: lease.spriteFrame,
        width: lease.width,
        height: lease.height,
        revision: lease.revision,
        lease,
      }));
      this.initialOperation = null;
      this.phase = "configured";
      this.selectedItemKey = null;
      this.selectedCarrierIndex = null;
      operation.resolve();
    });
    return operation;
  }

  adoptAuthoredItems(): void {
    this.assertAlive();
    if (this.phase !== "uncontrolled" && this.phase !== "configured") {
      throw new Error(
        `Cannot adopt authored items while phase is "${this.phase}".`,
      );
    }
    if (this.record.authoredAssetIds.length === 0) {
      throw new Error(
        "V5G Cocos cyclic authored items require project assets.",
      );
    }
    for (let index = 0; index < this.authoredSources.length; index += 1) {
      const source = this.authoredSources[index];
      this.record.runtime.replaceCarrierSource(
        index,
        source.spriteFrame,
        source.info.width,
        source.info.height,
      );
    }
    this.releaseBindings();
    this.bindings = this.authoredSources.map((source, index) => ({
      key: `authored:${index}:${
        this.record.authoredAssetIds[
          index % this.record.authoredAssetIds.length
        ]
      }`,
      node: null,
      spriteFrame: source.spriteFrame,
      width: source.info.width,
      height: source.info.height,
      revision: undefined,
      lease: null,
    }));
    this.phase = "configured";
    this.selectedItemKey = null;
    this.selectedCarrierIndex = null;
  }

  startContinuousPhase(options: { readonly phaseId: string }): void {
    this.assertAlive();
    if (this.phase !== "configured") {
      throw new Error(
        `Cannot start V5G Cocos cyclic continuous phase while phase is "${this.phase}".`,
      );
    }
    if (options.phaseId !== "idle") {
      throw new Error(
        `Unsupported V5G Cocos cyclic continuous phase: ${options.phaseId}.`,
      );
    }
    this.continuousElapsedSeconds = 0;
    this.motion = createCardCarousel3DContinuousMotion(
      this.record.runtime.prepared,
      0,
    );
    this.phase = "continuous";
    this.onClockChange();
  }

  prepareSelection(options: {
    readonly selectedItem:
      | { readonly key: string }
      | V5GCocosCyclicSelectionItem<TNode>;
  }): V5GCocosCyclicSelectionTransaction {
    this.assertAlive();
    if (this.phase !== "continuous") {
      throw new Error(
        `Cannot prepare V5G Cocos cyclic selection while phase is "${this.phase}".`,
      );
    }
    if (this.pending) {
      throw new Error(
        "V5G Cocos cyclic selection already has a pending transaction.",
      );
    }
    const key = normalizeItemKey(options.selectedItem.key);
    const existingIndex = this.bindings.findIndex(
      (binding) => binding.key === key,
    );
    const hasVisual = "visual" in options.selectedItem;
    if (existingIndex >= 0 && !hasVisual) {
      return this.commitExistingSelection(key, existingIndex);
    }
    if (existingIndex < 0 && !hasVisual) {
      throw new Error(
        `V5G Cocos cyclic selected item "${key}" is not bound and has no visual.`,
      );
    }
    const visual = (options.selectedItem as V5GCocosCyclicSelectionItem<TNode>)
      .visual;
    validateNodeVisual(this.host, visual);
    if (!this.record.runtime.canEverHideCarrier()) {
      throw new Error(
        "V5G Cocos cyclic replacement is impossible because no carrier can become hidden.",
      );
    }
    const transaction = createDeferredTransaction(() => {
      if (this.pending?.transaction === transaction) {
        const lease = this.pending.lease;
        this.pending = null;
        lease?.release();
        if (!this.destroyed) this.phase = "continuous";
      }
    });
    const pending: PendingSelection<TNode, TSpriteFrame> = {
      itemKey: key,
      carrierIndex: existingIndex >= 0 ? existingIndex : null,
      transaction,
      lease: null,
      capturePending: true,
    };
    this.pending = pending;
    this.phase = "selection-pending";
    void this.acquireVisual(visual).then(
      (lease) => {
        if (
          this.destroyed ||
          this.pending !== pending ||
          !transaction.isPending()
        ) {
          lease.release();
          return;
        }
        if (
          existingIndex >= 0 &&
          isSameBindingVisual(this.bindings[existingIndex], lease)
        ) {
          lease.release();
          this.pending = null;
          this.selectedItemKey = key;
          this.selectedCarrierIndex = existingIndex;
          this.phase = "selection-committed";
          transaction.resolve({ itemKey: key, carrierIndex: existingIndex });
          return;
        }
        pending.lease = lease;
        pending.capturePending = false;
      },
      (error) => {
        if (this.pending !== pending || !transaction.isPending()) return;
        this.pending = null;
        this.phase = "continuous";
        transaction.reject(asError(error));
      },
    );
    return transaction;
  }

  prepareAuthoredSelection(): V5GCocosCyclicSelectionTransaction {
    this.assertAlive();
    const target = this.record.runtime.prepared.targetIndex;
    const binding = this.bindings[target];
    if (!binding) {
      throw new Error(
        "V5G Cocos cyclic authored selection requires configured items.",
      );
    }
    return this.prepareSelection({ selectedItem: { key: binding.key } });
  }

  startResolvePhase(): void {
    this.assertAlive();
    if (
      this.phase !== "selection-committed" ||
      this.selectedCarrierIndex === null ||
      !this.motion
    ) {
      throw new Error(
        "V5G Cocos cyclic resolve requires a committed selection and continuous motion.",
      );
    }
    this.resolvePlan = createCardCarousel3DResolvePlan(
      this.record.runtime.prepared,
      this.motion.rotation,
      this.selectedCarrierIndex,
    );
    this.phase = "resolving";
    this.onClockChange();
  }

  clear(): void {
    if (this.destroyed) return;
    this.initialOperation?.cancel();
    this.initialOperation = null;
    this.pending?.transaction.cancel();
    this.pending = null;
    for (let index = 0; index < this.authoredSources.length; index += 1) {
      const source = this.authoredSources[index];
      this.record.runtime.replaceCarrierSource(
        index,
        source.spriteFrame,
        source.info.width,
        source.info.height,
      );
    }
    this.releaseBindings();
    this.bindings = [];
    this.phase = "uncontrolled";
    this.continuousElapsedSeconds = 0;
    this.motion = null;
    this.resolvePlan = null;
    this.selectedItemKey = null;
    this.selectedCarrierIndex = null;
    this.onClockChange();
  }

  clearRuntimeOverride(): void {
    if (this.phase === "uncontrolled" || this.phase === "configured") return;
    this.clear();
  }

  advance(deltaSeconds: number): void {
    if (this.destroyed) return;
    if (
      this.phase === "continuous" ||
      this.phase === "selection-pending" ||
      this.phase === "selection-committed"
    ) {
      this.continuousElapsedSeconds += deltaSeconds;
      this.motion = createCardCarousel3DContinuousMotion(
        this.record.runtime.prepared,
        this.continuousElapsedSeconds,
      );
    }
  }

  afterRender(_time: number): void {
    this.tryCommitPending();
  }

  onRangeComplete(time: number): void {
    if (this.phase !== "resolving") return;
    const descriptor = this.getAuthoredPreviewDescriptor();
    const end =
      descriptor.endingRange.unit === "time"
        ? descriptor.endingRange.end
        : undefined;
    if (end !== undefined && time >= end) this.phase = "complete";
  }

  getMotion(timelineTime: number): VNICardCarousel3DMotionSample | null {
    if (this.phase === "resolving" || this.phase === "complete") {
      if (!this.resolvePlan) return null;
      const descriptor = this.getAuthoredPreviewDescriptor();
      const start =
        descriptor.endingRange.unit === "time"
          ? descriptor.endingRange.start
          : 0;
      return sampleCardCarousel3DResolveMotion(
        this.record.runtime.prepared,
        this.resolvePlan,
        Math.max(0, timelineTime - start),
      );
    }
    return this.motion;
  }

  isContinuousOrResolving(): boolean {
    return (
      this.phase === "continuous" ||
      this.phase === "selection-pending" ||
      this.phase === "selection-committed" ||
      this.phase === "resolving"
    );
  }

  isContinuous(): boolean {
    return (
      this.phase === "continuous" ||
      this.phase === "selection-pending" ||
      this.phase === "selection-committed"
    );
  }

  isResolving(): boolean {
    return this.phase === "resolving";
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clear();
    this.destroyed = true;
    this.phase = "destroyed";
  }

  private commitExistingSelection(
    key: string,
    carrierIndex: number,
  ): V5GCocosCyclicSelectionTransaction {
    const transaction = createDeferredTransaction();
    this.selectedItemKey = key;
    this.selectedCarrierIndex = carrierIndex;
    this.phase = "selection-committed";
    transaction.resolve({ itemKey: key, carrierIndex });
    return transaction;
  }

  private tryCommitPending(): void {
    const pending = this.pending;
    if (
      !pending ||
      pending.capturePending ||
      !pending.lease ||
      !pending.transaction.isPending()
    ) {
      return;
    }
    const candidate =
      pending.carrierIndex ??
      this.bindings.findIndex((_binding, index) =>
        this.record.runtime.isCarrierSafeToReplace(index),
      );
    if (
      candidate < 0 ||
      !this.record.runtime.isCarrierSafeToReplace(candidate)
    ) {
      return;
    }
    const lease = pending.lease;
    try {
      this.record.runtime.replaceCarrierSource(
        candidate,
        lease.spriteFrame,
        lease.width,
        lease.height,
      );
    } catch (error) {
      this.pending = null;
      this.phase = "continuous";
      lease.release();
      pending.transaction.reject(asError(error));
      return;
    }
    this.bindings[candidate]?.lease?.release();
    this.bindings[candidate] = {
      key: pending.itemKey,
      node: lease.node,
      spriteFrame: lease.spriteFrame,
      width: lease.width,
      height: lease.height,
      revision: lease.revision,
      lease,
    };
    this.pending = null;
    this.selectedItemKey = pending.itemKey;
    this.selectedCarrierIndex = candidate;
    this.phase = "selection-committed";
    pending.transaction.resolve({
      itemKey: pending.itemKey,
      carrierIndex: candidate,
    });
  }

  private async acquireVisual(
    visual: V5GCocosCyclicSelectionItem<TNode>["visual"],
  ): Promise<VisualLease<TNode, TSpriteFrame>> {
    const cacheKey = getCaptureCacheKey(visual);
    let byConfig = this.captureCache.get(visual.node);
    if (!byConfig) {
      byConfig = new Map();
      this.captureCache.set(visual.node, byConfig);
    }
    let entry = byConfig.get(cacheKey);
    if (!entry) {
      const capture = Promise.resolve(
        this.host.captureManualNodeVisual({
          node: visual.node,
          width: visual.width,
          height: visual.height,
          revision: visual.revision,
        }),
      ).then((captured) => {
        validateCapturedVisual(captured, visual.width, visual.height);
        const current = byConfig?.get(cacheKey);
        if (current) current.resolved = captured;
        return captured;
      });
      entry = { refs: 0, visual: capture, resolved: null };
      byConfig.set(cacheKey, entry);
    }
    entry.refs += 1;
    let captured: V5GCocosCapturedNodeVisual<TSpriteFrame>;
    try {
      captured = await entry.visual;
    } catch (error) {
      this.releaseCaptureRef(visual.node, cacheKey, entry);
      throw error;
    }
    let released = false;
    return {
      node: visual.node,
      spriteFrame: captured.spriteFrame,
      width: visual.width,
      height: visual.height,
      revision: visual.revision,
      release: () => {
        if (released) return;
        released = true;
        this.releaseCaptureRef(
          visual.node,
          cacheKey,
          entry as CaptureCacheEntry<TSpriteFrame>,
        );
      },
    };
  }

  private releaseCaptureRef(
    node: TNode,
    cacheKey: string,
    entry: CaptureCacheEntry<TSpriteFrame>,
  ): void {
    if (entry.refs <= 0) {
      throw new Error("V5G Cocos captured visual refcount is corrupted.");
    }
    entry.refs -= 1;
    if (entry.refs > 0) return;
    const byConfig = this.captureCache.get(node);
    if (byConfig?.get(cacheKey) === entry) {
      byConfig.delete(cacheKey);
      if (byConfig.size === 0) this.captureCache.delete(node);
    }
    if (entry.resolved) {
      entry.resolved.release();
    } else {
      void entry.visual.then(
        (captured) => captured.release(),
        () => undefined,
      );
    }
  }

  private releaseBindings(): void {
    for (const binding of this.bindings) binding.lease?.release();
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("V5G Cocos cyclic-selection controller is destroyed.");
    }
  }
}

function validateNodeVisual<TNode, TSpriteFrame>(
  host: V5GCocosManualPlaybackHost<TNode, TSpriteFrame>,
  visual: V5GCocosCyclicSelectionItem<TNode>["visual"],
): void {
  if (visual.kind !== "node") {
    throw new Error('V5G Cocos cyclic visual kind must be "node".');
  }
  if (!host.isManualHostNodeValid(visual.node)) {
    throw new Error("V5G Cocos cyclic visual requires a valid host Node.");
  }
  if (
    !Number.isFinite(visual.width) ||
    visual.width <= 0 ||
    !Number.isFinite(visual.height) ||
    visual.height <= 0
  ) {
    throw new Error(
      "V5G Cocos cyclic visual width and height must be finite and positive.",
    );
  }
  if (
    visual.revision !== undefined &&
    typeof visual.revision !== "string" &&
    typeof visual.revision !== "number"
  ) {
    throw new Error(
      "V5G Cocos cyclic visual revision must be a string or number.",
    );
  }
  if (
    typeof visual.revision === "number" &&
    !Number.isFinite(visual.revision)
  ) {
    throw new Error("V5G Cocos cyclic visual numeric revision must be finite.");
  }
}

function validateCapturedVisual<TSpriteFrame>(
  captured: V5GCocosCapturedNodeVisual<TSpriteFrame>,
  width: number,
  height: number,
): void {
  if (
    !captured ||
    !captured.spriteFrame ||
    captured.width !== width ||
    captured.height !== height ||
    typeof captured.release !== "function"
  ) {
    captured?.release?.();
    throw new Error(
      "V5G Cocos node capture returned an invalid visual or logical size.",
    );
  }
}

function isSameBindingVisual<TNode, TSpriteFrame>(
  binding: CarrierBinding<TNode, TSpriteFrame>,
  lease: VisualLease<TNode, TSpriteFrame>,
): boolean {
  return (
    binding.node === lease.node &&
    binding.width === lease.width &&
    binding.height === lease.height &&
    binding.revision === lease.revision &&
    binding.spriteFrame === lease.spriteFrame
  );
}

function getCaptureCacheKey<TNode>(
  visual: V5GCocosCyclicSelectionItem<TNode>["visual"],
): string {
  return `${visual.width}\u0000${visual.height}\u0000${typeof visual.revision}\u0000${String(visual.revision ?? "")}`;
}

function toAnimationInfo<TSpriteFrame>(
  record: V5GCocosManualAnimationRuntimeRecord<TSpriteFrame>,
): V5GCocosManualAnimationInfo {
  return Object.freeze({
    ref: Object.freeze({ ...record.ref }),
    layerName: record.layerName,
    animationName: record.animationName,
    animationType: record.animation.type,
    capabilities: CYCLIC_CAPABILITIES,
  });
}

function createDeferredOperation(onCancel?: () => void): DeferredOperation {
  let pending = true;
  let resolvePromise!: (value: { readonly reason: "complete" }) => void;
  let rejectPromise!: (error: Error) => void;
  const completed = new Promise<{ readonly reason: "complete" }>(
    (resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    },
  );
  return {
    completed,
    resolve: () => {
      if (!pending) return;
      pending = false;
      resolvePromise({ reason: "complete" });
    },
    reject: (error) => {
      if (!pending) return;
      pending = false;
      rejectPromise(error);
    },
    cancel: () => {
      if (!pending) return;
      pending = false;
      onCancel?.();
      rejectPromise(new V5GCocosPlaybackCancelledError());
    },
    isPending: () => pending,
  };
}

function createDeferredBindingOperation(
  onCancel?: () => void,
): DeferredBindingOperation {
  let pending = true;
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    ready,
    resolve: () => {
      if (!pending) return;
      pending = false;
      resolvePromise();
    },
    reject: (error) => {
      if (!pending) return;
      pending = false;
      rejectPromise(error);
    },
    cancel: () => {
      if (!pending) return;
      pending = false;
      onCancel?.();
      rejectPromise(
        new V5GCocosPlaybackCancelledError(
          "V5G Cocos cyclic initial item preparation was cancelled.",
        ),
      );
    },
    isPending: () => pending,
  };
}

function createDeferredTransaction(onCancel?: () => void): DeferredTransaction {
  let pending = true;
  let resolvePromise!: (value: {
    itemKey: string;
    carrierIndex: number;
  }) => void;
  let rejectPromise!: (error: Error) => void;
  const committed = new Promise<{
    itemKey: string;
    carrierIndex: number;
  }>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    committed,
    resolve: (value) => {
      if (!pending) return;
      pending = false;
      resolvePromise(value);
    },
    reject: (error) => {
      if (!pending) return;
      pending = false;
      rejectPromise(error);
    },
    cancel: () => {
      if (!pending) return;
      pending = false;
      onCancel?.();
      rejectPromise(
        new V5GCocosPlaybackCancelledError(
          "V5G Cocos cyclic-selection transaction was cancelled.",
        ),
      );
    },
    isPending: () => pending,
  };
}

function getRefKey(ref: V5GCocosAnimationRuntimeRef): string {
  return `${ref.layerId}\u0000${ref.animationId}`;
}

function normalizeItemKey(value: string): string {
  const key = value.trim();
  if (!key) {
    throw new Error("V5G Cocos cyclic item key must be non-empty.");
  }
  return key;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
