import type * as PIXI from "pixi.js";
import {
  createCardCarousel3DContinuousMotion,
  createCardCarousel3DResolvePlan,
  sampleCardCarousel3DResolveMotion,
  type VNICardCarousel3DMotionSample,
} from "../core/card-carousel-3d.js";
import {
  normalizePlaybackPoint,
  normalizePlaybackRange,
  type VNIPlaybackPoint,
  type VNIPlaybackRange,
} from "../core/playback-sequence.js";
import type { V5GAnimationConfig } from "../core/types.js";
import type { VNICardCarousel3DPixiRuntime } from "./card-carousel-3d-renderer.js";

export type VNIRuntimeAnimationCapability =
  | "continuous-phase"
  | "replaceable-carriers"
  | "cyclic-selection";

export interface VNIAnimationRuntimeRef {
  readonly layerId: string;
  readonly animationId: string;
}

export interface VNIManualAnimationInfo {
  readonly ref: VNIAnimationRuntimeRef;
  readonly layerName: string;
  readonly animationName: string;
  readonly animationType: string;
  readonly capabilities: readonly VNIRuntimeAnimationCapability[];
}

export interface VNIPlaybackOperationComplete {
  readonly reason: "complete";
}

export interface VNIPlaybackOperation {
  readonly completed: Promise<VNIPlaybackOperationComplete>;
  cancel(): void;
}

export interface VNITimelineHoldHandle {
  release(): void;
}

export interface VNIManualPlayRangeOptions {
  readonly range: VNIPlaybackRange;
  readonly preserveRuntimeAnimationState?: boolean;
}

export interface VNIManualPlaybackState {
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

export interface VNICyclicSelectionItem {
  readonly key: string;
  readonly visual:
    | {
        readonly kind: "project-asset";
        readonly assetId: string;
      }
    | {
        readonly kind: "texture";
        readonly texture: PIXI.Texture;
      };
}

export interface VNICyclicAuthoredPreviewDescriptor {
  readonly introRange: VNIPlaybackRange;
  readonly continuousHoldPoint: VNIPlaybackPoint;
  readonly continuousPhaseId: string;
  readonly authoredContinuousPreviewDurationSeconds: number;
  readonly endingRange: VNIPlaybackRange;
  readonly authoredTargetCarrierIndex: number;
}

export interface VNICyclicSelectionState {
  readonly phase:
    | "uncontrolled"
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

export interface VNICyclicSelectionTransaction {
  readonly committed: Promise<{
    readonly itemKey: string;
    readonly carrierIndex: number;
  }>;
  cancel(): void;
}

export interface VNICyclicSelectionController {
  getState(): VNICyclicSelectionState;
  getAuthoredPreviewDescriptor(): VNICyclicAuthoredPreviewDescriptor;
  setInitialItems(items: readonly VNICyclicSelectionItem[]): void;
  adoptAuthoredItems(): void;
  startContinuousPhase(options: { readonly phaseId: string }): void;
  prepareSelection(options: {
    readonly selectedItem: { readonly key: string } | VNICyclicSelectionItem;
  }): VNICyclicSelectionTransaction;
  prepareAuthoredSelection(): VNICyclicSelectionTransaction;
  startResolvePhase(): void;
  clear(): void;
}

export interface VNIManualAnimationController {
  readonly ref: VNIAnimationRuntimeRef;
  getCapabilities(): readonly VNIRuntimeAnimationCapability[];
  requireCyclicSelection(): VNICyclicSelectionController;
  clearRuntimeOverride(): void;
}

export interface VNIManualPlaybackSession {
  playRange(options: VNIManualPlayRangeOptions): VNIPlaybackOperation;
  holdTimeline(options: {
    readonly at: VNIPlaybackPoint;
  }): VNITimelineHoldHandle;
  advanceFor(options: {
    readonly durationSeconds: number;
  }): VNIPlaybackOperation;
  listAnimations(options?: {
    readonly capability?: VNIRuntimeAnimationCapability;
  }): readonly VNIManualAnimationInfo[];
  getAnimation(ref: VNIAnimationRuntimeRef): VNIManualAnimationController;
  getState(): VNIManualPlaybackState;
  destroy(): void;
}

export class VNIPlaybackCancelledError extends Error {
  constructor(message = "VNI manual playback operation was cancelled.") {
    super(message);
    this.name = "VNIPlaybackCancelledError";
  }
}

export interface VNIManualAnimationRuntimeRecord {
  readonly ref: VNIAnimationRuntimeRef;
  readonly layerName: string;
  readonly animationName: string;
  readonly animation: V5GAnimationConfig;
  readonly runtime: VNICardCarousel3DPixiRuntime;
  readonly authoredAssetIds: readonly string[];
}

export interface VNIManualPlaybackHost {
  getManualDuration(): number;
  getManualAnimationRecords(): readonly VNIManualAnimationRuntimeRecord[];
  getManualProjectTexture(assetId: string): PIXI.Texture;
  renderManualFrame(time: number): void;
  triggerManualRangeEvents(previousTime: number, currentTime: number): void;
  completeManualRange(
    startTime: number,
    endTime: number,
    completed: () => void,
  ): void;
  cancelManualRangeCompletion(): void;
  setManualClockActive(active: boolean): void;
  detachManualSession(session: VNIManualPlaybackSessionImpl): void;
}

interface DeferredOperation extends VNIPlaybackOperation {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly isPending: () => boolean;
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

const CYCLIC_CAPABILITIES = Object.freeze([
  "continuous-phase",
  "replaceable-carriers",
  "cyclic-selection",
] as const);

export class VNIManualPlaybackSessionImpl implements VNIManualPlaybackSession {
  private readonly controllers = new Map<
    string,
    VNIManualAnimationControllerImpl
  >();
  private activeRange: ActiveRange | null = null;
  private activeAdvance: ActiveAdvance | null = null;
  private holdTime: number | null = null;
  private currentTime = 0;
  private destroyed = false;
  private completed = false;

  constructor(private readonly host: VNIManualPlaybackHost) {}

  playRange(options: VNIManualPlayRangeOptions): VNIPlaybackOperation {
    this.assertAlive();
    if (this.holdTime !== null) {
      throw new Error(
        "Release the VNI manual timeline hold before starting a range.",
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
    this.updateClock();
    return operation;
  }

  holdTimeline(options: {
    readonly at: VNIPlaybackPoint;
  }): VNITimelineHoldHandle {
    this.assertAlive();
    this.assertNoOperation();
    if (this.holdTime !== null) {
      throw new Error("VNI manual timeline already has an active hold.");
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
  }): VNIPlaybackOperation {
    this.assertAlive();
    this.assertNoOperation();
    if (this.holdTime === null) {
      throw new Error("VNI manual advanceFor() requires a timeline hold.");
    }
    if (
      !Number.isFinite(options.durationSeconds) ||
      options.durationSeconds <= 0
    ) {
      throw new Error(
        "VNI manual advanceFor durationSeconds must be a positive finite number.",
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
    readonly capability?: VNIRuntimeAnimationCapability;
  }): readonly VNIManualAnimationInfo[] {
    this.assertAlive();
    const capability = options?.capability;
    return this.host
      .getManualAnimationRecords()
      .map((record) => toAnimationInfo(record))
      .filter(
        (info) =>
          capability === undefined || info.capabilities.includes(capability),
      );
  }

  getAnimation(ref: VNIAnimationRuntimeRef): VNIManualAnimationController {
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
          ? `Unknown or disabled VNI runtime animation: ${ref.layerId}/${ref.animationId}.`
          : `Ambiguous VNI runtime animation: ${ref.layerId}/${ref.animationId}.`,
      );
    }
    const controller = new VNIManualAnimationControllerImpl(
      this.host,
      matches[0],
      () => this.updateClock(),
    );
    this.controllers.set(key, controller);
    return controller;
  }

  getState(): VNIManualPlaybackState {
    const activeControllers = [...this.controllers.values()].filter(
      (controller) => controller.isContinuousOrResolving(),
    );
    let phase: VNIManualPlaybackState["phase"];
    if (this.destroyed) phase = "destroyed";
    else if (this.activeRange)
      phase = activeControllers.some((value) => value.isResolving())
        ? "resolving"
        : "range";
    else if (activeControllers.some((value) => value.isContinuous()))
      phase = "continuous";
    else if (this.holdTime !== null) phase = "hold";
    else if (this.completed) phase = "complete";
    else phase = "idle";
    return {
      phase,
      currentTime: this.currentTime,
      hasActiveOperation:
        this.activeRange !== null || this.activeAdvance !== null,
      hasTimelineHold: this.holdTime !== null,
      activeContinuousAnimationCount: activeControllers.length,
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
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        "VNI manual deltaSeconds must be a positive finite number.",
      );
    }
    const runtimeDeltaSeconds =
      this.holdTime !== null && this.activeAdvance
        ? Math.min(
            deltaSeconds,
            this.activeAdvance.durationSeconds -
              this.activeAdvance.elapsedSeconds,
          )
        : deltaSeconds;
    for (const controller of this.controllers.values()) {
      controller.advance(runtimeDeltaSeconds);
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
      advance.elapsedSeconds += deltaSeconds;
      if (advance.elapsedSeconds >= advance.durationSeconds) {
        this.activeAdvance = null;
        advance.operation.resolve();
      }
    }
    this.updateClock();
  }

  getControlledMotion(
    ref: VNIAnimationRuntimeRef,
    timelineTime: number,
  ): VNICardCarousel3DMotionSample | null {
    return (
      this.controllers.get(getRefKey(ref))?.getMotion(timelineTime) ?? null
    );
  }

  private updateClock(): void {
    if (this.destroyed) return;
    const continuous = [...this.controllers.values()].some((controller) =>
      controller.isContinuousOrResolving(),
    );
    this.host.setManualClockActive(
      (this.activeRange !== null && !this.activeRange.awaitingCompletion) ||
        this.activeAdvance !== null ||
        (this.holdTime !== null && continuous),
    );
  }

  private assertNoOperation(): void {
    if (this.activeRange || this.activeAdvance) {
      throw new Error("VNI manual playback already has an active operation.");
    }
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("VNI manual playback session is destroyed.");
    }
  }
}

class VNIManualAnimationControllerImpl implements VNIManualAnimationController {
  readonly ref: VNIAnimationRuntimeRef;
  private readonly cyclic: VNICyclicSelectionControllerImpl;

  constructor(
    host: VNIManualPlaybackHost,
    record: VNIManualAnimationRuntimeRecord,
    onClockChange: () => void,
  ) {
    this.ref = record.ref;
    this.cyclic = new VNICyclicSelectionControllerImpl(
      host,
      record,
      onClockChange,
    );
  }

  getCapabilities(): readonly VNIRuntimeAnimationCapability[] {
    return CYCLIC_CAPABILITIES;
  }

  requireCyclicSelection(): VNICyclicSelectionController {
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

interface CarrierBinding {
  readonly key: string;
  readonly texture: PIXI.Texture;
}

interface PendingSelection {
  readonly itemKey: string;
  readonly texture: PIXI.Texture;
  readonly carrierIndex: number | null;
  readonly transaction: DeferredTransaction;
}

interface DeferredTransaction extends VNICyclicSelectionTransaction {
  readonly resolve: (value: { itemKey: string; carrierIndex: number }) => void;
  readonly reject: (error: Error) => void;
  readonly isPending: () => boolean;
}

class VNICyclicSelectionControllerImpl implements VNICyclicSelectionController {
  private readonly authoredTextures: readonly PIXI.Texture[];
  private bindings: CarrierBinding[] = [];
  private phase: VNICyclicSelectionState["phase"] = "uncontrolled";
  private continuousElapsedSeconds = 0;
  private motion: VNICardCarousel3DMotionSample | null = null;
  private resolvePlan: ReturnType<
    typeof createCardCarousel3DResolvePlan
  > | null = null;
  private selectedItemKey: string | null = null;
  private selectedCarrierIndex: number | null = null;
  private pending: PendingSelection | null = null;
  private destroyed = false;

  constructor(
    private readonly host: VNIManualPlaybackHost,
    private readonly record: VNIManualAnimationRuntimeRecord,
    private readonly onClockChange: () => void,
  ) {
    this.authoredTextures = record.runtime.getCarrierTextures();
  }

  getState(): VNICyclicSelectionState {
    return {
      phase: this.destroyed ? "destroyed" : this.phase,
      continuousElapsedSeconds: this.continuousElapsedSeconds,
      selectedItemKey: this.selectedItemKey,
      selectedCarrierIndex: this.selectedCarrierIndex,
      carrierKeys: this.bindings.map((binding) => binding.key),
    };
  }

  getAuthoredPreviewDescriptor(): VNICyclicAuthoredPreviewDescriptor {
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

  setInitialItems(items: readonly VNICyclicSelectionItem[]): void {
    this.assertAlive();
    if (this.phase !== "uncontrolled" && this.phase !== "configured") {
      throw new Error(
        `Cannot set cyclic initial items while phase is "${this.phase}".`,
      );
    }
    const count = this.record.runtime.prepared.cardCount;
    if (items.length !== count) {
      throw new Error(
        `VNI cyclic initial items must contain exactly ${count} entries.`,
      );
    }
    const seen = new Set<string>();
    const next = items.map((item) => {
      const key = normalizeItemKey(item.key);
      if (seen.has(key)) {
        throw new Error(`Duplicate VNI cyclic item key: ${key}.`);
      }
      seen.add(key);
      return { key, texture: this.resolveVisual(item.visual) };
    });
    const previousTextures = this.record.runtime.getCarrierTextures();
    try {
      for (let index = 0; index < next.length; index += 1) {
        this.record.runtime.replaceCarrierTexture(index, next[index].texture);
      }
    } catch (error) {
      for (let index = 0; index < previousTextures.length; index += 1) {
        this.record.runtime.replaceCarrierTexture(
          index,
          previousTextures[index],
        );
      }
      throw error;
    }
    this.bindings = next;
    this.phase = "configured";
    this.selectedItemKey = null;
    this.selectedCarrierIndex = null;
  }

  adoptAuthoredItems(): void {
    this.assertAlive();
    const assetIds = this.record.authoredAssetIds;
    if (assetIds.length === 0) {
      throw new Error("VNI cyclic authored items require project assets.");
    }
    this.setInitialItems(
      Array.from(
        { length: this.record.runtime.prepared.cardCount },
        (_, index) => ({
          key: `authored:${index}:${assetIds[index % assetIds.length]}`,
          visual: {
            kind: "project-asset" as const,
            assetId: assetIds[index % assetIds.length],
          },
        }),
      ),
    );
  }

  startContinuousPhase(options: { readonly phaseId: string }): void {
    this.assertAlive();
    if (this.phase !== "configured") {
      throw new Error(
        `Cannot start cyclic continuous phase while phase is "${this.phase}".`,
      );
    }
    if (options.phaseId !== "idle") {
      throw new Error(
        `Unsupported VNI cyclic continuous phase: ${options.phaseId}.`,
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
    readonly selectedItem: { readonly key: string } | VNICyclicSelectionItem;
  }): VNICyclicSelectionTransaction {
    this.assertAlive();
    if (this.phase !== "continuous") {
      throw new Error(
        `Cannot prepare cyclic selection while phase is "${this.phase}".`,
      );
    }
    if (this.pending) {
      throw new Error(
        "VNI cyclic selection already has a pending transaction.",
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
        `VNI cyclic selected item "${key}" is not bound and has no visual.`,
      );
    }
    const texture = this.resolveVisual(
      (options.selectedItem as VNICyclicSelectionItem).visual,
    );
    if (
      existingIndex >= 0 &&
      this.bindings[existingIndex].texture === texture
    ) {
      return this.commitExistingSelection(key, existingIndex);
    }
    if (!this.record.runtime.canEverHideCarrier()) {
      throw new Error(
        "VNI cyclic replacement is impossible because no carrier can become hidden.",
      );
    }
    const transaction = createDeferredTransaction(() => {
      if (this.pending?.transaction === transaction) {
        this.pending = null;
        if (!this.destroyed) this.phase = "continuous";
      }
    });
    this.pending = {
      itemKey: key,
      texture,
      carrierIndex: existingIndex >= 0 ? existingIndex : null,
      transaction,
    };
    this.phase = "selection-pending";
    this.tryCommitPending();
    return transaction;
  }

  prepareAuthoredSelection(): VNICyclicSelectionTransaction {
    this.assertAlive();
    const target = this.record.runtime.prepared.targetIndex;
    const binding = this.bindings[target];
    if (!binding) {
      throw new Error(
        "VNI cyclic authored selection requires adopted authored items.",
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
        "VNI cyclic resolve requires a committed selection and continuous motion.",
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
    this.pending?.transaction.cancel();
    this.pending = null;
    for (let index = 0; index < this.authoredTextures.length; index += 1) {
      this.record.runtime.replaceCarrierTexture(
        index,
        this.authoredTextures[index],
      );
    }
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
  ): VNICyclicSelectionTransaction {
    const transaction = createDeferredTransaction();
    this.selectedItemKey = key;
    this.selectedCarrierIndex = carrierIndex;
    this.phase = "selection-committed";
    transaction.resolve({ itemKey: key, carrierIndex });
    return transaction;
  }

  private tryCommitPending(): void {
    const pending = this.pending;
    if (!pending || !pending.transaction.isPending()) return;
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
    this.record.runtime.replaceCarrierTexture(candidate, pending.texture);
    this.bindings[candidate] = {
      key: pending.itemKey,
      texture: pending.texture,
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

  private resolveVisual(
    visual: VNICyclicSelectionItem["visual"],
  ): PIXI.Texture {
    if (visual.kind === "project-asset") {
      return this.host.getManualProjectTexture(visual.assetId);
    }
    assertTexture(visual.texture);
    return visual.texture;
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("VNI cyclic-selection controller is destroyed.");
    }
  }
}

function toAnimationInfo(
  record: VNIManualAnimationRuntimeRecord,
): VNIManualAnimationInfo {
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
  let resolvePromise!: (value: VNIPlaybackOperationComplete) => void;
  let rejectPromise!: (error: Error) => void;
  const completed = new Promise<VNIPlaybackOperationComplete>(
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
      rejectPromise(new VNIPlaybackCancelledError());
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
        new VNIPlaybackCancelledError(
          "VNI cyclic-selection transaction was cancelled.",
        ),
      );
    },
    isPending: () => pending,
  };
}

function getRefKey(ref: VNIAnimationRuntimeRef): string {
  return `${ref.layerId}\u0000${ref.animationId}`;
}

function normalizeItemKey(value: string): string {
  const key = value.trim();
  if (!key) throw new Error("VNI cyclic item key must be non-empty.");
  return key;
}

function assertTexture(texture: PIXI.Texture): void {
  if (
    !texture ||
    !texture.source ||
    !texture.frame ||
    !Number.isFinite(texture.width) ||
    !Number.isFinite(texture.height) ||
    texture.width <= 0 ||
    texture.height <= 0 ||
    texture.frame.width <= 0 ||
    texture.frame.height <= 0
  ) {
    throw new Error(
      "VNI cyclic-selection texture must have a valid source and finite positive dimensions/frame.",
    );
  }
}
