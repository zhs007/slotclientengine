import type * as PIXI from "pixi.js";
import type { AssetUrlManifest } from "../data/asset-manifest.js";
import type { VNIProjectConfig } from "../data/types.js";
import type { VNILayerGroupSlot } from "../data/layer-groups.js";
import {
  VNIRuntime,
  type VNIAttachExternalImageBetweenLayerGroupsOptions,
  type VNIAttachImageBetweenLayerGroupsOptions,
  type VNIAttachImageToTextLayerOptions,
  type VNIAttachNodeBetweenLayerGroupsOptions,
  type VNIAttachNodeToTextLayerOptions,
  type VNIAttachTextToTextLayerOptions,
  type VNILayerGroupInfo,
  type VNIPlayOptions,
  type VNIPlaybackCompleteContext,
  type VNIPlaybackEventOptions,
  type VNIPlaybackState,
  type VNIPlayRangeOptions,
  type VNITextLayerTextBinding,
} from "../core/vni-runtime.js";
import type {
  VNIManualPlaybackSession,
  VNIPlaybackOperation,
} from "../core/manual-playback.js";

export interface VNIViewerOptions {
  readonly parent: PIXI.Container;
  readonly diagnosticsElement?: HTMLElement;
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  readonly viewportScale?: number;
  readonly requestRender?: () => void;
  readonly projectId: string;
  readonly bundleId: string;
  readonly profileId: string;
  readonly profilePurpose: string;
  readonly assetScale: number;
  readonly project: VNIProjectConfig;
  readonly assetUrls: AssetUrlManifest;
  readonly onTimeChange?: (time: number) => void;
  readonly onPlayingChange?: (isPlaying: boolean) => void;
  /** Disables the viewer-owned RAF driver for deterministic host tests. */
  readonly autoTick?: boolean;
}

export class VNIViewer {
  private readonly runtime: VNIRuntime;
  private readonly diagnosticsElement: HTMLElement | undefined;
  private readonly requestRenderCallback: (() => void) | undefined;
  private readonly project: VNIProjectConfig;
  private readonly projectId: string;
  private readonly bundleId: string;
  private readonly profileId: string;
  private readonly profilePurpose: string;
  private readonly assetScale: number;
  private readonly onTimeChange: ((time: number) => void) | undefined;
  private readonly onPlayingChange: ((playing: boolean) => void) | undefined;
  private readonly autoTick: boolean;
  private viewport: { width: number; height: number } | null;
  private viewportScale: number;
  private rafId: number | null = null;
  private lastTickMs = 0;
  private lastReportedTime = Number.NaN;
  private lastReportedPlaying = false;
  private initialized = false;
  private destroyed = false;

  constructor(options: VNIViewerOptions) {
    this.project = options.project;
    this.projectId = options.projectId;
    this.bundleId = options.bundleId;
    this.profileId = options.profileId;
    this.profilePurpose = options.profilePurpose;
    this.assetScale = options.assetScale;
    this.diagnosticsElement = options.diagnosticsElement;
    this.requestRenderCallback = options.requestRender;
    this.onTimeChange = options.onTimeChange;
    this.onPlayingChange = options.onPlayingChange;
    this.autoTick = options.autoTick ?? true;
    this.viewport = options.viewport
      ? normalizeViewportSize(options.viewport)
      : null;
    this.viewportScale = normalizeViewportScale(options.viewportScale ?? 1);
    this.runtime = new VNIRuntime({
      parent: options.parent,
      project: options.project,
      assetUrls: options.assetUrls,
    });
  }

  async init(): Promise<void> {
    this.assertAlive();
    await this.runtime.init();
    this.initialized = true;
    this.applyViewportLayout();
    this.syncViewerState(true);
  }

  getLayerGroups(): readonly VNILayerGroupInfo[] {
    return this.runtime.getLayerGroups();
  }

  getLayerGroupSlots(): readonly VNILayerGroupSlot[] {
    return this.runtime.getLayerGroupSlots();
  }

  attachNodeBetweenLayerGroups(
    options: VNIAttachNodeBetweenLayerGroupsOptions,
  ): () => void {
    const dispose = this.runtime.attachNodeBetweenLayerGroups(options);
    this.syncViewerState(false);
    return () => {
      dispose();
      this.syncViewerState(false);
    };
  }

  attachImageBetweenLayerGroups(
    options: VNIAttachImageBetweenLayerGroupsOptions,
  ): () => void {
    const dispose = this.runtime.attachImageBetweenLayerGroups(options);
    this.syncViewerState(false);
    return () => {
      dispose();
      this.syncViewerState(false);
    };
  }

  async attachExternalImageBetweenLayerGroups(
    options: VNIAttachExternalImageBetweenLayerGroupsOptions,
  ): Promise<() => void> {
    const dispose =
      await this.runtime.attachExternalImageBetweenLayerGroups(options);
    this.syncViewerState(false);
    return () => {
      dispose();
      this.syncViewerState(false);
    };
  }

  attachNodeToTextLayer(options: VNIAttachNodeToTextLayerOptions): () => void {
    const dispose = this.runtime.attachNodeToTextLayer(options);
    this.syncViewerState(false);
    return () => {
      dispose();
      this.syncViewerState(false);
    };
  }

  attachTextToTextLayer(
    options: VNIAttachTextToTextLayerOptions,
  ): VNITextLayerTextBinding {
    const binding = this.runtime.attachTextToTextLayer(options);
    this.syncViewerState(false);
    return {
      setText: (text) => {
        binding.setText(text);
        this.requestRender();
      },
      dispose: () => {
        binding.dispose();
        this.syncViewerState(false);
      },
    };
  }

  async attachImageToTextLayer(
    options: VNIAttachImageToTextLayerOptions,
  ): Promise<() => void> {
    const dispose = await this.runtime.attachImageToTextLayer(options);
    this.syncViewerState(false);
    return () => {
      dispose();
      this.syncViewerState(false);
    };
  }

  detachMountedNode(id: string): void {
    this.runtime.detachMountedNode(id);
    this.syncViewerState(false);
  }

  clearMountedNodes(): void {
    this.runtime.clearMountedNodes();
    this.syncViewerState(false);
  }

  play(options?: VNIPlayOptions): void {
    this.runtime.play(options);
    this.syncViewerState(false);
    this.ensureTicker();
  }

  pause(): void {
    this.runtime.pause();
    this.syncViewerState(false);
    if (!this.runtime.needsUpdate()) this.cancelTicker();
  }

  clearOrphanParticles(): void {
    this.runtime.clearOrphanParticles();
    this.syncViewerState(false);
    if (this.runtime.needsUpdate()) this.ensureTicker();
  }

  restart(): void {
    this.runtime.restart();
    this.syncViewerState(false);
    if (this.runtime.needsUpdate()) this.ensureTicker();
  }

  seek(time: number): void {
    this.runtime.seek(time);
    this.syncViewerState(false);
  }

  setLoop(loop: boolean): void {
    this.runtime.setLoop(loop);
  }

  getLoop(): boolean {
    return this.runtime.getLoop();
  }

  getTime(): number {
    return this.runtime.getTime();
  }

  isPlaying(): boolean {
    return this.runtime.isPlaying();
  }

  getPlaybackState(): VNIPlaybackState {
    return this.runtime.getPlaybackState();
  }

  getDisplayObject(): PIXI.Container {
    return this.runtime.getDisplayObject();
  }

  getProjectSnapshot(): VNIProjectConfig {
    return structuredClone(this.project);
  }

  setViewportSize(width: number, height: number): void {
    this.viewport = normalizeViewportSize({ width, height });
    this.applyViewportLayout();
    this.syncViewerState(false);
  }

  setViewportScale(scale: number): void {
    this.viewportScale = normalizeViewportScale(scale);
    this.applyViewportLayout();
    this.syncViewerState(false);
  }

  getViewportScale(): number {
    return this.viewportScale;
  }

  update(deltaSeconds: number): void {
    this.runtime.update(deltaSeconds);
    this.syncViewerState(false);
  }

  playRange(options: VNIPlayRangeOptions): void {
    this.runtime.playRange(options);
    this.syncViewerState(false);
    this.ensureTicker();
  }

  requestSegmentedPlaybackEnd(): void {
    this.runtime.requestSegmentedPlaybackEnd();
    this.syncViewerState(false);
    this.ensureTicker();
  }

  addPlaybackEvent(options: VNIPlaybackEventOptions): () => void {
    return this.runtime.addPlaybackEvent(options);
  }

  clearPlaybackEvent(id: string): void {
    this.runtime.clearPlaybackEvent(id);
  }

  clearPlaybackEvents(): void {
    this.runtime.clearPlaybackEvents();
  }

  onPlaybackComplete(
    listener: (event: VNIPlaybackCompleteContext) => void,
  ): () => void {
    return this.runtime.onPlaybackComplete(listener);
  }

  createManualPlaybackSession(): VNIManualPlaybackSession {
    const session = this.runtime.createManualPlaybackSession();
    const schedule = (): void => this.ensureTicker();
    return {
      playRange: (options): VNIPlaybackOperation => {
        const operation = session.playRange(options);
        schedule();
        return operation;
      },
      holdTimeline: (options) => session.holdTimeline(options),
      advanceFor: (options): VNIPlaybackOperation => {
        const operation = session.advanceFor(options);
        schedule();
        return operation;
      },
      listAnimations: (options) => session.listAnimations(options),
      getAnimation: (ref) => session.getAnimation(ref),
      getState: () => session.getState(),
      destroy: () => {
        session.destroy();
        this.syncViewerState(false);
        if (this.runtime.needsUpdate()) this.ensureTicker();
      },
    };
  }

  /** @internal Used by the viewer pool adapter. */
  getCoreRuntime(): VNIRuntime {
    return this.runtime;
  }

  /** @internal Applies the viewer transform to a pooled runtime clone. */
  applyViewportToRuntime(runtime: VNIRuntime): void {
    applyViewportTransform(
      runtime.getDisplayObject(),
      this.project,
      this.viewport,
      this.viewportScale,
    );
  }

  /** @internal Drives a pooled runtime with this viewer's render callback. */
  driveRuntime(runtime: VNIRuntime): () => void {
    if (!this.autoTick) return () => undefined;
    let cancelled = false;
    let rafId: number | null = null;
    let lastTickMs = performance.now();
    const tick = (now: number): void => {
      if (cancelled) return;
      const deltaSeconds = (now - lastTickMs) / 1000;
      lastTickMs = now;
      if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
        runtime.update(deltaSeconds);
        this.requestRender();
      }
      if (runtime.needsUpdate()) rafId = requestAnimationFrame(tick);
      else rafId = null;
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelTicker();
    this.runtime.destroy();
    this.initialized = false;
    clearDiagnostics(this.diagnosticsElement);
  }

  private readonly tick = (now: number): void => {
    if (this.destroyed) {
      this.rafId = null;
      return;
    }
    const deltaSeconds = (now - this.lastTickMs) / 1000;
    this.lastTickMs = now;
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.runtime.update(deltaSeconds);
      this.syncViewerState(false);
    }
    if (this.runtime.needsUpdate())
      this.rafId = requestAnimationFrame(this.tick);
    else this.rafId = null;
  };

  private ensureTicker(): void {
    this.assertAlive();
    if (!this.autoTick) return;
    if (this.rafId !== null) return;
    this.lastTickMs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private cancelTicker(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private applyViewportLayout(): void {
    applyViewportTransform(
      this.runtime.getDisplayObject(),
      this.project,
      this.viewport,
      this.viewportScale,
    );
  }

  private syncViewerState(force: boolean): void {
    if (!this.initialized || this.destroyed) return;
    const time = this.runtime.getTime();
    const playing = this.runtime.isPlaying();
    if (force || time !== this.lastReportedTime) {
      this.lastReportedTime = time;
      this.onTimeChange?.(time);
    }
    if (force || playing !== this.lastReportedPlaying) {
      this.lastReportedPlaying = playing;
      this.onPlayingChange?.(playing);
    }
    writeDiagnostics({
      element: this.diagnosticsElement,
      runtime: this.runtime,
      projectId: this.projectId,
      bundleId: this.bundleId,
      profileId: this.profileId,
      profilePurpose: this.profilePurpose,
      assetScale: this.assetScale,
      viewportScale: this.viewportScale,
    });
    this.requestRender();
  }

  private requestRender(): void {
    this.requestRenderCallback?.();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error("VNIViewer has been destroyed.");
  }
}

function applyViewportTransform(
  display: PIXI.Container,
  project: VNIProjectConfig,
  viewport: { readonly width: number; readonly height: number } | null,
  scale: number,
): void {
  if (!viewport) return;
  display.position.set(viewport.width / 2, viewport.height / 2);
  display.pivot.set(project.stage.width / 2, project.stage.height / 2);
  display.scale.set(scale);
}

function normalizeViewportSize(value: {
  readonly width: number;
  readonly height: number;
}): { readonly width: number; readonly height: number } {
  if (
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    !Number.isFinite(value.height) ||
    value.height <= 0
  ) {
    throw new Error("VNIViewer viewport width and height must be positive.");
  }
  return { width: value.width, height: value.height };
}

function normalizeViewportScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      "VNIViewer viewport scale must be a positive finite number.",
    );
  }
  return value;
}

function writeDiagnostics(options: {
  readonly element: HTMLElement | undefined;
  readonly runtime: VNIRuntime;
  readonly projectId: string;
  readonly bundleId: string;
  readonly profileId: string;
  readonly profilePurpose: string;
  readonly assetScale: number;
  readonly viewportScale: number;
}): void {
  const element = options.element;
  if (!element) return;
  const playback = options.runtime.getPlaybackState();
  const inspection = options.runtime.getInspection();
  element.dataset.vniProjectId = options.projectId;
  element.dataset.vniTime = playback.currentTime.toFixed(2);
  element.dataset.vniVisibleLayers = String(inspection.visibleLayerCount);
  element.dataset.vniParticleSprites = String(inspection.particleSpriteCount);
  element.dataset.vniRenderEffectSprites = String(
    inspection.renderEffectSpriteCount,
  );
  element.dataset.vniDeterministicEffectSprites = String(
    inspection.deterministicEffectSpriteCount,
  );
  element.dataset.vniSafeGlowSprites = String(inspection.safeGlowSpriteCount);
  element.dataset.vniChaserLightSprites = String(
    inspection.chaserLightSpriteCount,
  );
  element.dataset.vniMaskSprites = String(inspection.maskSpriteCount);
  element.dataset.vniPlaybackMode = playback.mode;
  element.dataset.vniPlaybackPhase = playback.phase;
  element.dataset.vniParticleDraining = String(playback.isDrainingParticles);
  element.dataset.vniLiveParticles = String(playback.liveParticleCount);
  element.dataset.vniLayerGroups = String(inspection.layerGroupCount);
  element.dataset.vniLayerGroupSlots = String(inspection.layerGroupSlotCount);
  element.dataset.vniViewportScale = String(options.viewportScale);
  element.dataset.vniCardCarouselCards = String(
    inspection.cardCarouselVisibleCards,
  );
  element.dataset.vniCardCarouselSlices = String(
    inspection.cardCarouselVisibleSlices,
  );
  element.dataset.vniCardCarouselCardPool = String(
    inspection.cardCarouselCardPoolSize,
  );
  element.dataset.vniCardCarouselSlicePool = String(
    inspection.cardCarouselSlicePoolSize,
  );
  element.dataset.vniCardCarouselSliceTextures = String(
    inspection.cardCarouselSliceTextureCount,
  );
  element.dataset.vniMountedNodes = String(inspection.mountedNodeCount);
  element.dataset.vniTextLayerBindings = String(
    inspection.textLayerBindingCount,
  );
  element.dataset.v5gProjectId = options.projectId;
  element.dataset.v5gTime = playback.currentTime.toFixed(2);
  element.dataset.v5gVisibleLayers = String(inspection.visibleLayerCount);
  element.dataset.v5gParticleSprites = String(inspection.particleSpriteCount);
  element.dataset.vniBundleId = options.bundleId;
  element.dataset.vniProfileId = options.profileId;
  element.dataset.vniAssetScale = String(options.assetScale);
  element.dataset.vniProfilePurpose = options.profilePurpose;
}

const DIAGNOSTIC_KEYS = [
  "vniProjectId",
  "vniTime",
  "vniVisibleLayers",
  "vniParticleSprites",
  "vniRenderEffectSprites",
  "vniDeterministicEffectSprites",
  "vniSafeGlowSprites",
  "vniChaserLightSprites",
  "vniMaskSprites",
  "vniPlaybackMode",
  "vniPlaybackPhase",
  "vniParticleDraining",
  "vniLiveParticles",
  "vniLayerGroups",
  "vniLayerGroupSlots",
  "vniViewportScale",
  "vniCardCarouselCards",
  "vniCardCarouselSlices",
  "vniCardCarouselCardPool",
  "vniCardCarouselSlicePool",
  "vniCardCarouselSliceTextures",
  "vniMountedNodes",
  "vniTextLayerBindings",
  "v5gProjectId",
  "v5gTime",
  "v5gVisibleLayers",
  "v5gParticleSprites",
  "vniBundleId",
  "vniProfileId",
  "vniAssetScale",
  "vniProfilePurpose",
] as const;

function clearDiagnostics(element: HTMLElement | undefined): void {
  if (!element) return;
  for (const key of DIAGNOSTIC_KEYS) delete element.dataset[key];
}
