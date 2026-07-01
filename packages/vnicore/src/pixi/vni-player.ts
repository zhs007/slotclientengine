import * as PIXI from "pixi.js";
import { toPixiBlendMode } from "./blend-mode.js";
import { editorToPixi } from "../core/coordinates.js";
import { sampleProjectAtTime } from "../core/project-sampler.js";
import {
  assertVNIAdjacentLayerGroupSlot,
  getVNIProjectLayerGroupSlots,
  getVNIProjectRenderGroupOrder,
  type VNILayerGroupSlot,
  type VNIRenderGroupInfo,
} from "../core/layer-groups.js";
import {
  VNIParticleRuntime,
  sampleLiveParticleSprites,
  type VNILiveParticleSpriteSample,
  type VNIParticleRuntimeLayer,
} from "../core/particle-runtime.js";
import {
  VNISegmentedPlaybackSequence,
  assertPositiveFinite,
  normalizePlaybackPoint,
  normalizePlaybackRange,
  normalizeSegmentedPlaybackOptions,
  type VNIPlayOptions,
  type VNIPlaybackMode,
  type VNIPlaybackPoint,
  type VNIPlaybackRange,
  type VNIPlaybackState,
  type VNIPlayRangeOptions,
  type VNISegmentedPlaybackOptions,
  type VNISegmentedPlaybackPhase,
} from "../core/playback-sequence.js";
import {
  sampleRenderEffectSpritesForLayer,
  type VNIRenderEffectSpriteSample,
} from "../core/render-effect-sampler.js";
import {
  sampleSafeGlowSpritesForLayer,
  type VNISafeGlowSpriteSample,
} from "../core/safe-glow-sampler.js";
import {
  applySampledLayerState,
  createLayerInstance,
  getLayerAsset,
  getAssetDisplayCompensation,
  getAssetTextureSize,
  type V5GLayerInstance,
} from "./layer-instance.js";
import {
  deriveAdditiveMatteTexture,
  getAdditiveMatteAssetIds,
  shouldDeriveAdditiveMatteTexture,
} from "./additive-matte-texture.js";
import type { AssetUrlManifest } from "../core/asset-manifest.js";
import type { SampledLayerState } from "../core/project-sampler.js";
import type {
  V5GAssetConfig,
  VNIBlendMode,
  VNIProjectConfig,
} from "../core/types.js";

export type {
  VNIPlayOptions,
  VNIPlaybackMode,
  VNIPlaybackPoint,
  VNIPlaybackRange,
  VNIPlaybackState,
  VNIPlayRangeOptions,
  VNISegmentedPlaybackOptions,
  VNISegmentedPlaybackPhase,
};

export interface VNIPlaybackEventContext {
  id: string;
  time: number;
  previousTime: number;
  currentTime: number;
  loopIndex: number;
}

export interface VNIPlaybackEventOptions {
  id: string;
  at: VNIPlaybackPoint;
  once?: boolean;
  listener: (event: VNIPlaybackEventContext) => void;
}

export interface VNIPlaybackCompleteContext {
  startTime: number;
  endTime: number;
  currentTime: number;
  loopIndex: number;
}

export interface VNIPlayerOptions {
  parent: PIXI.Container;
  diagnosticsElement?: HTMLElement;
  viewport?: {
    readonly width: number;
    readonly height: number;
  };
  requestRender?: () => void;
  projectId: string;
  bundleId: string;
  profileId: string;
  profilePurpose: string;
  assetScale: number;
  project: VNIProjectConfig;
  assetUrls: AssetUrlManifest;
  autoTick?: boolean;
  fitPadding?: number;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

export interface VNILayerGroupInfo {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  layerIds: readonly string[];
  renderIndex: number;
}

export interface VNIAttachNodeBetweenLayerGroupsOptions {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  node: PIXI.Container;
  destroyOnDetach?: boolean;
}

export interface VNIAttachImageBetweenLayerGroupsOptions {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  assetId: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: VNIBlendMode;
  destroyOnDetach?: boolean;
}

export interface VNIAttachExternalImageBetweenLayerGroupsOptions {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  imageUrl: string;
  label?: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: VNIBlendMode;
  destroyOnDetach?: boolean;
}

interface ActivePlaybackRange {
  startTime: number;
  endTime: number;
  loop: boolean;
  loopIndex: number;
}

interface PlaybackMarker {
  id: string;
  time: number;
  once: boolean;
  listener: (event: VNIPlaybackEventContext) => void;
}

interface VNIPlaybackFrameOptions {
  liveParticles?: boolean;
  liveParticleDeltaSeconds?: number;
}

interface VNIMountedNode {
  id: string;
  node: PIXI.Container;
  slotContainer: PIXI.Container;
  destroyOnDetach: boolean;
}

interface VNIMountedImageSpriteOptions {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: VNIBlendMode;
  destroyOnDetach?: boolean;
  compensation: { x: number; y: number };
}

export class VNIPlayer {
  private readonly stageRoot = new PIXI.Container();
  private readonly contentRoot = new PIXI.Container();
  private readonly parent: PIXI.Container;
  private readonly diagnosticsElement: HTMLElement | undefined;
  private readonly requestRenderCallback: (() => void) | undefined;
  private readonly projectId: string;
  private readonly bundleId: string;
  private readonly profileId: string;
  private readonly profilePurpose: string;
  private readonly assetScale: number;
  private readonly project: VNIProjectConfig;
  private readonly assetUrls: AssetUrlManifest;
  private readonly autoTick: boolean;
  private readonly fitPadding: number | undefined;
  private readonly assetsById: ReadonlyMap<string, V5GAssetConfig>;
  private readonly layerGroups: readonly VNIRenderGroupInfo[];
  private readonly layerGroupSlots: readonly VNILayerGroupSlot[];
  private readonly additiveMatteAssetIds: ReadonlySet<string>;
  private readonly onTimeChange?: (time: number) => void;
  private readonly onPlayingChange?: (isPlaying: boolean) => void;
  private readonly layerInstances = new Map<string, V5GLayerInstance>();
  private readonly groupContainersById = new Map<string, PIXI.Container>();
  private readonly slotContainersByKey = new Map<string, PIXI.Container>();
  private readonly mountedNodesById = new Map<string, VNIMountedNode>();
  private readonly particleRuntime: VNIParticleRuntime;
  private texturesByAssetId: ReadonlyMap<string, PIXI.Texture> = new Map();
  private readonly ownedTextures = new Set<PIXI.Texture>();
  private readonly liveParticleSpritesByLayer = new Map<
    string,
    PIXI.Sprite[]
  >();
  private rafId: number | null = null;
  private viewport: { width: number; height: number } | null = null;
  private lastTickMs = 0;
  private currentTime = 0;
  private loop = true;
  private playing = false;
  private drainPaused = false;
  private initialized = false;
  private playbackMode: VNIPlaybackMode = "timeline";
  private playbackPhase: VNISegmentedPlaybackPhase = "idle";
  private activeRange: ActivePlaybackRange | null = null;
  private segmentedPlayback: VNISegmentedPlaybackSequence | null = null;
  private pendingComplete: VNIPlaybackCompleteContext | null = null;
  private readonly playbackMarkers = new Map<string, PlaybackMarker>();
  private readonly playbackCompleteListeners = new Set<
    (event: VNIPlaybackCompleteContext) => void
  >();

  constructor(options: VNIPlayerOptions) {
    this.parent = options.parent;
    this.diagnosticsElement = options.diagnosticsElement;
    this.requestRenderCallback = options.requestRender;
    this.viewport = options.viewport
      ? normalizeViewportSize(options.viewport)
      : null;
    this.projectId = options.projectId;
    this.bundleId = options.bundleId;
    this.profileId = options.profileId;
    this.profilePurpose = options.profilePurpose;
    this.assetScale = options.assetScale;
    this.project = options.project;
    this.assetUrls = options.assetUrls;
    this.autoTick = options.autoTick ?? true;
    this.fitPadding = normalizeFitPadding(options.fitPadding);
    this.assetsById = new Map(
      options.project.assets.map((asset) => [asset.id, asset] as const),
    );
    this.layerGroups = getVNIProjectRenderGroupOrder(options.project);
    this.layerGroupSlots = getVNIProjectLayerGroupSlots(options.project);
    this.additiveMatteAssetIds = getAdditiveMatteAssetIds(options.project);
    this.particleRuntime = new VNIParticleRuntime(options.project.layers);
    this.onTimeChange = options.onTimeChange;
    this.onPlayingChange = options.onPlayingChange;
  }

  async init(): Promise<void> {
    this.parent.addChild(this.stageRoot);
    this.stageRoot.addChild(this.contentRoot);

    this.texturesByAssetId = await this.loadTextures();
    const layersById = new Map(
      this.project.layers.map((layer) => [layer.id, layer] as const),
    );
    for (const group of this.layerGroups) {
      const groupContainer = new PIXI.Container();
      groupContainer.label = `VNI group ${group.id}`;
      this.groupContainersById.set(group.id, groupContainer);
      this.contentRoot.addChild(groupContainer);
      for (const layerId of group.layerIds) {
        const layer = layersById.get(layerId);
        if (!layer) {
          throw new Error(`Missing VNI layer for render group: ${layerId}.`);
        }
        const instance = createLayerInstance(
          layer,
          this.texturesByAssetId,
          this.assetsById,
        );
        this.layerInstances.set(layer.id, instance);
        groupContainer.addChild(
          instance.display,
          instance.safeGlowDisplay,
          instance.effectDisplay,
          instance.particleDisplay,
        );
      }
      const slot = this.layerGroupSlots.find(
        (candidate) => candidate.afterGroupId === group.id,
      );
      if (slot) {
        const slotContainer = new PIXI.Container();
        slotContainer.label = `VNI slot ${slot.afterGroupId} -> ${slot.beforeGroupId}`;
        this.slotContainersByKey.set(getLayerGroupSlotKey(slot), slotContainer);
        this.contentRoot.addChild(slotContainer);
      }
    }

    this.applyViewportLayout();
    this.initialized = true;
    this.renderDeterministicFrame(0);
  }

  getLayerGroups(): readonly VNILayerGroupInfo[] {
    return this.layerGroups.map((group) =>
      Object.freeze({
        id: group.id,
        name: group.name,
        visible: group.visible,
        order: group.order,
        layerIds: group.layerIds,
        renderIndex: group.renderIndex,
      }),
    );
  }

  getLayerGroupSlots(): readonly VNILayerGroupSlot[] {
    return this.layerGroupSlots.map((slot) => Object.freeze({ ...slot }));
  }

  attachNodeBetweenLayerGroups(
    options: VNIAttachNodeBetweenLayerGroupsOptions,
  ): () => void {
    this.assertInitialized("attachNodeBetweenLayerGroups");
    const id = normalizeMountedNodeId(options.id);
    if (this.mountedNodesById.has(id)) {
      throw new Error(`Duplicate VNI mounted node id: ${id}.`);
    }
    const slot = assertVNIAdjacentLayerGroupSlot(
      this.project,
      options.afterGroupId,
      options.beforeGroupId,
    );
    const slotContainer = this.slotContainersByKey.get(
      getLayerGroupSlotKey(slot),
    );
    if (!slotContainer) {
      throw new Error(
        `Missing VNI layer group slot container: ${slot.afterGroupId} -> ${slot.beforeGroupId}.`,
      );
    }
    slotContainer.addChild(options.node);
    this.mountedNodesById.set(id, {
      id,
      node: options.node,
      slotContainer,
      destroyOnDetach: options.destroyOnDetach === true,
    });
    this.updateMountedNodeDiagnostics();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.detachMountedNode(id);
    };
  }

  attachImageBetweenLayerGroups(
    options: VNIAttachImageBetweenLayerGroupsOptions,
  ): () => void {
    this.assertInitialized("attachImageBetweenLayerGroups");
    const asset = this.assetsById.get(options.assetId);
    if (!asset) {
      throw new Error(`Unknown VNI asset id: ${options.assetId}.`);
    }
    const texture = this.texturesByAssetId.get(asset.id);
    if (!texture) {
      throw new Error(`VNI asset "${asset.id}" is not loaded.`);
    }
    const textureSize = {
      width: Math.round(texture.width),
      height: Math.round(texture.height),
    };
    const compensation = getAssetDisplayCompensation(asset, textureSize);
    return this.attachMountedImageSprite(
      texture,
      `VNI mounted image ${asset.id}`,
      {
        ...options,
        compensation,
      },
    );
  }

  async attachExternalImageBetweenLayerGroups(
    options: VNIAttachExternalImageBetweenLayerGroupsOptions,
  ): Promise<() => void> {
    this.assertInitialized("attachExternalImageBetweenLayerGroups");
    const imageUrl = options.imageUrl.trim();
    if (!imageUrl) {
      throw new Error("VNI external mounted image url must be non-empty.");
    }
    const texture = (await PIXI.Assets.load(imageUrl)) as PIXI.Texture;
    assertLoadedTexture(texture, `VNI external mounted image: ${imageUrl}`);
    return this.attachMountedImageSprite(
      texture,
      `VNI mounted external image ${options.label ?? imageUrl}`,
      {
        ...options,
        compensation: { x: 1, y: 1 },
      },
    );
  }

  private attachMountedImageSprite(
    texture: PIXI.Texture,
    label: string,
    options: VNIMountedImageSpriteOptions,
  ): () => void {
    const sprite = new PIXI.Sprite(texture);
    sprite.label = label;
    sprite.anchor.set(options.anchorX ?? 0.5, options.anchorY ?? 0.5);
    sprite.position.set(
      options.x ?? this.project.stage.width / 2,
      options.y ?? this.project.stage.height / 2,
    );
    sprite.scale.set(
      options.compensation.x * (options.scaleX ?? 1),
      options.compensation.y * (options.scaleY ?? 1),
    );
    sprite.rotation = ((options.rotation ?? 0) * Math.PI) / 180;
    sprite.alpha = options.opacity ?? 1;
    sprite.blendMode = toPixiBlendMode(options.blendMode ?? "normal");
    try {
      return this.attachNodeBetweenLayerGroups({
        id: options.id,
        afterGroupId: options.afterGroupId,
        beforeGroupId: options.beforeGroupId,
        node: sprite,
        destroyOnDetach: options.destroyOnDetach ?? true,
      });
    } catch (error) {
      sprite.destroy({ children: true });
      throw error;
    }
  }

  detachMountedNode(id: string): void {
    const normalizedId = normalizeMountedNodeId(id);
    const mounted = this.mountedNodesById.get(normalizedId);
    if (!mounted) {
      throw new Error(`Unknown VNI mounted node id: ${normalizedId}.`);
    }
    mounted.slotContainer.removeChild(mounted.node);
    if (mounted.destroyOnDetach) {
      mounted.node.destroy({ children: true });
    }
    this.mountedNodesById.delete(normalizedId);
    this.updateMountedNodeDiagnostics();
  }

  clearMountedNodes(): void {
    for (const id of [...this.mountedNodesById.keys()]) {
      this.detachMountedNode(id);
    }
  }

  play(options?: VNIPlayOptions): void {
    if (options?.mode === "range") {
      this.startRangePlayback(options);
      return;
    }
    if (options?.mode === "segmented") {
      this.startSegmentedPlayback(options);
      return;
    }
    this.startTimelinePlayback();
  }

  private startTimelinePlayback(): void {
    if (this.playing) return;
    this.assertInitialized("play");
    if (this.particleRuntime.isDraining()) {
      this.drainPaused = false;
      this.ensureTicker();
      return;
    }
    this.playbackMode = "timeline";
    this.playbackPhase = "start";
    if (!this.activeRange && this.currentTime >= this.project.stage.duration) {
      this.renderPlaybackFrame(0, 0);
    }
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.playing = true;
    this.lastTickMs = performance.now();
    this.onPlayingChange?.(true);
    this.ensureTicker();
  }

  pause(): void {
    if (this.particleRuntime.isDraining()) {
      this.drainPaused = true;
    }
    if (!this.playing) return;
    this.playing = false;
    this.cancelTicker();
    this.onPlayingChange?.(false);
  }

  restart(): void {
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
    this.pendingComplete = null;
    this.drainPaused = false;
    this.particleRuntime.reset();
    this.renderDeterministicFrame(0);
    if (this.playing) {
      this.lastTickMs = performance.now();
    }
  }

  seek(time: number): void {
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
    this.drainPaused = false;
    this.particleRuntime.reset();
    this.renderDeterministicFrame(time);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  getLoop(): boolean {
    return this.loop;
  }

  getTime(): number {
    return this.currentTime;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getPlaybackState(): VNIPlaybackState {
    const phase = this.getEffectivePlaybackPhase();
    return {
      mode: this.playbackMode,
      phase,
      currentTime: this.currentTime,
      isPlaying: this.playing,
      isDrainingParticles: this.particleRuntime.isDraining(),
      liveParticleCount: this.getRenderedParticleCount(),
      loopIndex:
        this.segmentedPlayback?.getLoopIndex() ??
        this.activeRange?.loopIndex ??
        0,
      keepParticlesAlive: this.segmentedPlayback?.keepParticlesAlive ?? true,
    };
  }

  getDisplayObject(): PIXI.Container {
    return this.stageRoot;
  }

  setViewportSize(width: number, height: number): void {
    this.viewport = normalizeViewportSize({ width, height });
    this.applyViewportLayout();
    this.requestHostRender();
  }

  update(deltaSeconds: number): void {
    assertPositiveFinite(deltaSeconds, "deltaSeconds");
    if (!this.playing) {
      if (this.particleRuntime.isDraining() && !this.drainPaused) {
        this.advanceParticleDrain(deltaSeconds);
      }
      return;
    }
    if (this.segmentedPlayback) {
      this.advanceSegmentedPlayback(deltaSeconds);
      return;
    }
    if (this.activeRange) {
      this.advanceActiveRange(deltaSeconds);
      return;
    }
    this.advanceFullTimeline(deltaSeconds);
  }

  playRange(options: VNIPlayRangeOptions): void {
    this.startRangePlayback(options);
  }

  requestSegmentedPlaybackEnd(): void {
    if (!this.segmentedPlayback) {
      throw new Error("No active VNI segmented playback.");
    }
    this.segmentedPlayback.requestEnd();
    this.playbackPhase = this.segmentedPlayback.getPhase();
    if (!this.playing) {
      this.playing = true;
      this.drainPaused = false;
      this.lastTickMs = performance.now();
      this.onPlayingChange?.(true);
      this.ensureTicker();
    }
  }

  private startRangePlayback(options: VNIPlayRangeOptions): void {
    this.assertInitialized("playRange");
    const normalized = normalizePlaybackRange(
      options.range,
      this.project.stage.duration,
    );
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.particleRuntime.reset();
    this.playbackMode = "range";
    this.playbackPhase = "start";
    this.activeRange = {
      ...normalized,
      loop: options.loop ?? this.loop,
      loopIndex: 0,
    };
    this.renderPlaybackFrame(normalized.startTime, normalized.startTime);
    if (!this.playing) {
      this.playing = true;
      this.lastTickMs = performance.now();
      this.onPlayingChange?.(true);
      this.ensureTicker();
    } else {
      this.lastTickMs = performance.now();
    }
  }

  private startSegmentedPlayback(options: VNISegmentedPlaybackOptions): void {
    this.assertInitialized("play");
    const normalized = normalizeSegmentedPlaybackOptions(
      options,
      this.project.stage.duration,
    );
    this.activeRange = null;
    this.pendingComplete = null;
    this.particleRuntime.reset();
    this.playbackMode = "segmented";
    this.segmentedPlayback = new VNISegmentedPlaybackSequence(normalized);
    this.playbackPhase = "start";
    this.renderPlaybackFrame(0, 0);
    if (!this.playing) {
      this.playing = true;
      this.lastTickMs = performance.now();
      this.onPlayingChange?.(true);
      this.ensureTicker();
    } else {
      this.lastTickMs = performance.now();
    }
  }

  addPlaybackEvent(options: VNIPlaybackEventOptions): () => void {
    const id = options.id.trim();
    if (!id) {
      throw new Error("VNI playback event id must be a non-empty string.");
    }
    if (this.playbackMarkers.has(id)) {
      throw new Error(`Duplicate VNI playback event id: ${id}.`);
    }
    const time = normalizePlaybackPoint(
      options.at,
      this.project.stage.duration,
      `playback event "${id}"`,
    );
    const marker: PlaybackMarker = {
      id,
      time,
      once: options.once === true,
      listener: options.listener,
    };
    this.playbackMarkers.set(id, marker);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.playbackMarkers.delete(id);
    };
  }

  clearPlaybackEvent(id: string): void {
    if (!this.playbackMarkers.delete(id)) {
      throw new Error(`Unknown VNI playback event id: ${id}.`);
    }
  }

  clearPlaybackEvents(): void {
    this.playbackMarkers.clear();
  }

  onPlaybackComplete(
    listener: (event: VNIPlaybackCompleteContext) => void,
  ): () => void {
    this.playbackCompleteListeners.add(listener);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.playbackCompleteListeners.delete(listener);
    };
  }

  destroy(): void {
    this.pause();
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMarkers.clear();
    this.playbackCompleteListeners.clear();
    this.particleRuntime.reset();
    this.clearMountedNodes();
    this.clearSafeGlow();
    this.clearRenderEffects();
    this.clearParticles();
    this.clearDiagnostics();
    this.stageRoot.parent?.removeChild(this.stageRoot);
    this.stageRoot.destroy({ children: true });
    for (const texture of this.ownedTextures) {
      texture.destroy(true);
    }
    this.ownedTextures.clear();
    this.initialized = false;
  }

  private readonly tick = (now: number): void => {
    if (!this.isTickerNeeded()) {
      this.rafId = null;
      return;
    }
    const deltaSeconds = Math.max(0, (now - this.lastTickMs) / 1000);
    this.lastTickMs = now;
    this.update(deltaSeconds);
    if (this.isTickerNeeded()) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.rafId = null;
    }
  };

  private advanceFullTimeline(deltaSeconds: number): void {
    const duration = this.project.stage.duration;
    let remaining = deltaSeconds;
    while (remaining > 0 && this.playing) {
      const timeToEnd = duration - this.currentTime;
      if (remaining >= timeToEnd) {
        const previousTime = this.currentTime;
        this.triggerPlaybackEvents(previousTime, duration, 0);
        if (this.loop) {
          remaining -= Math.max(timeToEnd, 0);
          this.renderPlaybackFrame(duration, duration);
          this.renderPlaybackFrame(0, 0);
          if (timeToEnd <= 0) break;
          continue;
        }
        this.startParticleDrain(duration, {
          startTime: 0,
          endTime: duration,
          currentTime: duration,
          loopIndex: 0,
        });
        return;
      }
      const previousTime = this.currentTime;
      const nextTime = previousTime + remaining;
      this.renderPlaybackFrame(nextTime, nextTime);
      this.triggerPlaybackEvents(previousTime, nextTime, 0);
      return;
    }
  }

  private advanceActiveRange(deltaSeconds: number): void {
    const range = this.activeRange;
    if (!range) return;
    let remaining = deltaSeconds;
    while (remaining > 0 && this.playing && this.activeRange === range) {
      const timeToEnd = range.endTime - this.currentTime;
      if (remaining >= timeToEnd) {
        const previousTime = this.currentTime;
        this.triggerPlaybackEvents(
          previousTime,
          range.endTime,
          range.loopIndex,
        );
        if (range.loop) {
          remaining -= Math.max(timeToEnd, 0);
          this.renderPlaybackFrame(range.endTime, range.endTime);
          range.loopIndex += 1;
          this.renderPlaybackFrame(range.startTime, range.startTime);
          if (timeToEnd <= 0) break;
          continue;
        }
        this.activeRange = null;
        this.startParticleDrain(range.endTime, {
          startTime: range.startTime,
          endTime: range.endTime,
          currentTime: range.endTime,
          loopIndex: range.loopIndex,
        });
        return;
      }
      const previousTime = this.currentTime;
      const nextTime = previousTime + remaining;
      this.renderPlaybackFrame(nextTime, nextTime);
      this.triggerPlaybackEvents(previousTime, nextTime, range.loopIndex);
      return;
    }
  }

  private advanceSegmentedPlayback(deltaSeconds: number): void {
    const segmented = this.segmentedPlayback;
    if (!segmented) return;
    const result = segmented.advance(deltaSeconds);
    this.playbackPhase = result.phase;
    this.triggerSegmentedPlaybackEvents(segmented, result);
    if (result.timelineEnded) {
      this.startParticleDrain(this.project.stage.duration, {
        startTime: 0,
        endTime: this.project.stage.duration,
        currentTime: this.project.stage.duration,
        loopIndex: result.loopIndex,
      });
      return;
    }
    const particleTime = this.getSegmentedParticleSampleTime(segmented);
    this.renderPlaybackFrame(result.currentTime, particleTime, {
      liveParticles:
        segmented.keepParticlesAlive && segmented.getPhase() === "loop",
      liveParticleDeltaSeconds: deltaSeconds,
    });
  }

  private triggerSegmentedPlaybackEvents(
    segmented: VNISegmentedPlaybackSequence,
    result: {
      previousTime: number;
      currentTime: number;
      loopIndex: number;
    },
  ): void {
    if (
      segmented.getPhase() === "loop" &&
      segmented.getLoopStartTime() < segmented.getLoopEndTime() &&
      result.currentTime < result.previousTime
    ) {
      this.triggerPlaybackEvents(
        result.previousTime,
        segmented.getLoopEndTime(),
        Math.max(0, result.loopIndex - 1),
      );
      this.triggerPlaybackEvents(
        segmented.getLoopStartTime(),
        result.currentTime,
        result.loopIndex,
      );
      return;
    }
    this.triggerPlaybackEvents(
      result.previousTime,
      result.currentTime,
      result.loopIndex,
    );
  }

  private getSegmentedParticleSampleTime(
    segmented: VNISegmentedPlaybackSequence,
  ): number {
    return segmented.getCurrentTime();
  }

  private startParticleDrain(
    endTime: number,
    completeEvent: VNIPlaybackCompleteContext,
  ): void {
    this.playing = false;
    this.currentTime = endTime;
    this.pendingComplete = completeEvent;
    this.playbackPhase = "particle-draining";
    this.onPlayingChange?.(false);
    const sampled = this.applyProjectSample(endTime);
    const safeGlowSpriteCount = this.renderSafeGlowSamples(
      sampled.layers,
      endTime,
    );
    const renderEffectSpriteCount = this.renderRenderEffectSamples(
      sampled.layers,
      endTime,
    );
    const particleLayers = this.getParticleRuntimeLayers(sampled.layers);
    if (particleLayers.length > 0) {
      const endParticles = sampleLiveParticleSprites(
        particleLayers,
        this.project.stage,
        endTime,
      );
      if (endParticles.length > 0) {
        this.particleRuntime.emit(particleLayers, this.project.stage, endTime);
      }
    }
    const frame = this.particleRuntime.beginDrain();
    const particleSpriteCount = this.renderParticleSamples(frame.particles);
    this.updateDiagnostics(
      sampled.layers.filter((layer) => layer.visible).length,
      particleSpriteCount,
      renderEffectSpriteCount,
      safeGlowSpriteCount,
    );
    this.onTimeChange?.(this.currentTime);
    this.renderIfHostDriven();
    if (frame.isComplete) {
      this.finishParticleDrain();
      return;
    }
    this.drainPaused = false;
    this.ensureTicker();
  }

  private advanceParticleDrain(deltaSeconds: number): void {
    const frame = this.particleRuntime.advanceDrain(deltaSeconds);
    const particleSpriteCount = this.renderParticleSamples(frame.particles);
    const sampled = sampleProjectAtTime(this.project, this.currentTime);
    const safeGlowSpriteCount = this.renderSafeGlowSamples(
      sampled.layers,
      this.currentTime,
    );
    this.updateDiagnostics(
      sampled.layers.filter((layer) => layer.visible).length,
      particleSpriteCount,
      this.getRenderedRenderEffectCount(),
      safeGlowSpriteCount,
    );
    if (frame.isComplete) {
      this.finishParticleDrain();
      return;
    }
    this.renderIfHostDriven();
  }

  private finishParticleDrain(): void {
    this.playbackPhase = "complete";
    this.segmentedPlayback?.markParticleDrainComplete();
    this.clearParticles();
    this.updateDiagnostics(
      sampleProjectAtTime(this.project, this.currentTime).layers.filter(
        (layer) => layer.visible,
      ).length,
      0,
      this.getRenderedRenderEffectCount(),
      this.getRenderedSafeGlowCount(),
    );
    this.renderIfHostDriven();
    const event = this.pendingComplete;
    this.pendingComplete = null;
    if (event) {
      this.triggerPlaybackComplete(event);
    }
  }

  private triggerPlaybackEvents(
    previousTime: number,
    currentTime: number,
    loopIndex: number,
  ): void {
    const markers = [...this.playbackMarkers.values()]
      .filter(
        (marker) => marker.time > previousTime && marker.time <= currentTime,
      )
      .sort((a, b) => a.time - b.time);
    for (const marker of markers) {
      if (marker.once) {
        this.playbackMarkers.delete(marker.id);
      }
      marker.listener({
        id: marker.id,
        time: marker.time,
        previousTime,
        currentTime,
        loopIndex,
      });
    }
  }

  private triggerPlaybackComplete(event: VNIPlaybackCompleteContext): void {
    for (const listener of this.playbackCompleteListeners) {
      listener(event);
    }
  }

  private assertInitialized(methodName: string): void {
    if (!this.initialized) {
      throw new Error(`VNIPlayer.${methodName}() requires init() first.`);
    }
  }

  private ensureTicker(): void {
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

  private isTickerNeeded(): boolean {
    return (
      this.playing || (this.particleRuntime.isDraining() && !this.drainPaused)
    );
  }

  private getEffectivePlaybackPhase(): VNISegmentedPlaybackPhase {
    if (this.particleRuntime.isDraining()) return "particle-draining";
    if (this.segmentedPlayback) return this.segmentedPlayback.getPhase();
    return this.playbackPhase;
  }

  private applyViewportLayout(): void {
    const viewport = this.viewport;
    if (!viewport) {
      return;
    }
    const { width, height } = viewport;
    const padding = this.fitPadding ?? (width < 720 ? 16 : 32);
    const fitScale = Math.max(
      0.05,
      Math.min(
        (width - padding * 2) / this.project.stage.width,
        (height - padding * 2) / this.project.stage.height,
      ),
    );
    this.stageRoot.position.set(width / 2, height / 2);
    this.stageRoot.pivot.set(
      this.project.stage.width / 2,
      this.project.stage.height / 2,
    );
    this.stageRoot.scale.set(Number.isFinite(fitScale) ? fitScale : 1);
  }

  private async loadTextures(): Promise<ReadonlyMap<string, PIXI.Texture>> {
    for (const layer of this.project.layers) {
      getLayerAsset(layer, this.assetsById);
    }

    const entries = await Promise.all(
      this.project.assets.map(async (asset) => {
        const texture = await this.loadTexture(asset);
        return [asset.id, texture] as const;
      }),
    );
    return new Map(entries);
  }

  private async loadTexture(asset: V5GAssetConfig): Promise<PIXI.Texture> {
    const url = this.assetUrls[asset.path];
    if (!url) {
      throw new Error(`V5G asset path is missing from manifest: ${asset.path}`);
    }
    const texture = (await PIXI.Assets.load(url)) as PIXI.Texture;
    const width = Math.round(texture.width);
    const height = Math.round(texture.height);
    const expected = getAssetTextureSize(asset);
    if (width !== expected.width || height !== expected.height) {
      throw new Error(
        `VNI asset texture size mismatch for ${asset.id} (${asset.path}): logical ${asset.width}x${asset.height}, expected file ${expected.width}x${expected.height}, got ${width}x${height}.`,
      );
    }
    if (shouldDeriveAdditiveMatteTexture(asset, this.additiveMatteAssetIds)) {
      const matteTexture = deriveAdditiveMatteTexture(texture, asset);
      this.ownedTextures.add(matteTexture);
      return matteTexture;
    }
    return texture;
  }

  private renderDeterministicFrame(time: number): void {
    const sampled = this.applyProjectSample(time);
    const safeGlowSpriteCount = this.renderSafeGlowSamples(
      sampled.layers,
      this.currentTime,
    );
    const renderEffectSpriteCount = this.renderRenderEffectSamples(
      sampled.layers,
      this.currentTime,
    );
    const particles = sampleLiveParticleSprites(
      this.getParticleRuntimeLayers(sampled.layers),
      this.project.stage,
      this.currentTime,
    );
    const particleSpriteCount = this.renderParticleSamples(particles);
    this.updateDiagnostics(
      sampled.layers.filter((layer) => layer.visible).length,
      particleSpriteCount,
      renderEffectSpriteCount,
      safeGlowSpriteCount,
    );
    this.onTimeChange?.(this.currentTime);
    this.renderIfHostDriven();
  }

  private renderPlaybackFrame(
    nonParticleTime: number,
    particleTime: number,
    options: VNIPlaybackFrameOptions = {},
  ): void {
    const sampled = this.applyProjectSample(nonParticleTime);
    const safeGlowSpriteCount = this.renderSafeGlowSamples(
      sampled.layers,
      nonParticleTime,
    );
    const renderEffectSpriteCount = this.renderRenderEffectSamples(
      sampled.layers,
      nonParticleTime,
    );
    const particleLayers = this.getParticleRuntimeLayers(sampled.layers);
    const frame = options.liveParticles
      ? this.particleRuntime.emitLive(
          particleLayers,
          this.project.stage,
          particleTime,
          options.liveParticleDeltaSeconds ?? 0,
        )
      : this.particleRuntime.emit(
          particleLayers,
          this.project.stage,
          particleTime,
        );
    const particleSpriteCount = this.renderParticleSamples(frame.particles);
    this.updateDiagnostics(
      sampled.layers.filter((layer) => layer.visible).length,
      particleSpriteCount,
      renderEffectSpriteCount,
      safeGlowSpriteCount,
    );
    this.onTimeChange?.(this.currentTime);
    this.renderIfHostDriven();
  }

  private applyProjectSample(time: number): {
    time: number;
    layers: SampledLayerState[];
  } {
    const sampled = sampleProjectAtTime(this.project, time);
    this.currentTime = sampled.time;
    for (const sampledLayer of sampled.layers) {
      const instance = this.layerInstances.get(sampledLayer.layerId);
      if (!instance) {
        throw new Error(`Missing V5G layer instance: ${sampledLayer.layerId}`);
      }
      applySampledLayerState(instance, sampledLayer, this.project.stage);
    }
    return sampled;
  }

  private renderIfHostDriven(): void {
    this.requestHostRender();
  }

  private requestHostRender(): void {
    if (this.initialized) {
      this.requestRenderCallback?.();
    }
  }

  private getParticleRuntimeLayers(
    sampledLayers: readonly SampledLayerState[],
  ): VNIParticleRuntimeLayer[] {
    const layers: VNIParticleRuntimeLayer[] = [];
    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveParticleAnimation) continue;
      const instance = this.layerInstances.get(sampledLayer.layerId);
      if (!instance) {
        throw new Error(`Missing V5G layer instance: ${sampledLayer.layerId}`);
      }
      if (!instance.textureSize) {
        throw new Error(
          `V5G particle layer "${sampledLayer.layerId}" is missing image texture.`,
        );
      }
      layers.push({
        layer: instance.layer,
        sampledLayer,
        textureSize: instance.textureSize,
      });
    }
    return layers;
  }

  private renderSafeGlowSamples(
    sampledLayers: readonly SampledLayerState[],
    time: number,
  ): number {
    let spriteCount = 0;
    for (const instance of this.layerInstances.values()) {
      for (const child of instance.safeGlowDisplay.removeChildren()) {
        child.destroy({ children: true });
      }
    }

    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveSafeGlowAnimation) continue;
      const instance = this.layerInstances.get(sampledLayer.layerId);
      if (!instance) {
        throw new Error(`Missing V5G layer instance: ${sampledLayer.layerId}`);
      }
      if (!instance.texture || !instance.textureSize) {
        throw new Error(
          `V5G safe glow layer "${sampledLayer.layerId}" is missing image texture.`,
        );
      }
      const asset = getLayerAsset(instance.layer, this.assetsById);
      if (!asset) {
        throw new Error(
          `V5G safe glow layer "${sampledLayer.layerId}" is missing image asset.`,
        );
      }
      const compensation = getAssetDisplayCompensation(
        asset,
        instance.textureSize,
      );
      const emitter = editorToPixi(
        sampledLayer.transform.x,
        sampledLayer.transform.y,
        this.project.stage.width,
        this.project.stage.height,
      );
      const safeGlows = sampleSafeGlowSpritesForLayer(
        instance.layer,
        sampledLayer,
        time,
      );
      for (const safeGlow of safeGlows) {
        this.renderSafeGlowSprite(
          instance,
          safeGlow,
          emitter,
          compensation,
          sampledLayer,
        );
      }
      spriteCount += safeGlows.length;
    }
    return spriteCount;
  }

  private renderSafeGlowSprite(
    instance: V5GLayerInstance,
    safeGlow: VNISafeGlowSpriteSample,
    emitter: { x: number; y: number },
    compensation: { x: number; y: number },
    sampledLayer: SampledLayerState,
  ): void {
    if (!instance.texture) {
      throw new Error(
        `V5G safe glow layer "${instance.layer.id}" is missing image texture.`,
      );
    }
    const sprite = new PIXI.Sprite(instance.texture);
    sprite.anchor.set(
      sampledLayer.transform.anchorX,
      sampledLayer.transform.anchorY,
    );
    sprite.position.set(emitter.x + safeGlow.x, emitter.y + safeGlow.y);
    sprite.scale.set(
      safeGlow.scaleX * compensation.x,
      safeGlow.scaleY * compensation.y,
    );
    sprite.rotation = safeGlow.rotation;
    sprite.alpha = safeGlow.alpha;
    sprite.blendMode = toPixiBlendMode(safeGlow.blendMode);
    instance.safeGlowDisplay.addChild(sprite);
  }

  private renderRenderEffectSamples(
    sampledLayers: readonly SampledLayerState[],
    time: number,
  ): number {
    let spriteCount = 0;
    for (const instance of this.layerInstances.values()) {
      for (const child of instance.effectDisplay.removeChildren()) {
        child.destroy({ children: true });
      }
    }

    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveRenderEffect) continue;
      const instance = this.layerInstances.get(sampledLayer.layerId);
      if (!instance) {
        throw new Error(`Missing V5G layer instance: ${sampledLayer.layerId}`);
      }
      if (!instance.texture || !instance.textureSize) {
        throw new Error(
          `V5G render effect layer "${sampledLayer.layerId}" is missing image texture.`,
        );
      }
      const asset = getLayerAsset(instance.layer, this.assetsById);
      if (!asset) {
        throw new Error(
          `V5G render effect layer "${sampledLayer.layerId}" is missing image asset.`,
        );
      }
      const compensation = getAssetDisplayCompensation(
        asset,
        instance.textureSize,
      );
      const emitter = editorToPixi(
        sampledLayer.transform.x,
        sampledLayer.transform.y,
        this.project.stage.width,
        this.project.stage.height,
      );
      const effects = sampleRenderEffectSpritesForLayer(
        instance.layer,
        sampledLayer,
        instance.textureSize,
        time,
      );
      for (const effect of effects) {
        this.renderRenderEffectSprite(
          instance,
          effect,
          emitter,
          compensation,
          sampledLayer,
        );
      }
      spriteCount += effects.length;
    }
    return spriteCount;
  }

  private renderRenderEffectSprite(
    instance: V5GLayerInstance,
    effect: VNIRenderEffectSpriteSample,
    emitter: { x: number; y: number },
    compensation: { x: number; y: number },
    sampledLayer: SampledLayerState,
  ): void {
    if (!instance.texture) {
      throw new Error(
        `V5G render effect layer "${instance.layer.id}" is missing image texture.`,
      );
    }
    if (effect.type === "glow") {
      const sprite = new PIXI.Sprite(instance.texture);
      sprite.anchor.set(
        sampledLayer.transform.anchorX,
        sampledLayer.transform.anchorY,
      );
      sprite.position.set(emitter.x + effect.x, emitter.y + effect.y);
      sprite.scale.set(
        effect.scaleX * compensation.x,
        effect.scaleY * compensation.y,
      );
      sprite.rotation = effect.rotation;
      sprite.alpha = effect.alpha;
      sprite.blendMode = toPixiBlendMode(effect.blendMode);
      instance.effectDisplay.addChild(sprite);
      return;
    }

    const piece = new PIXI.Container();
    const sprite = new PIXI.Sprite(instance.texture);
    const mask = new PIXI.Graphics();
    sprite.anchor.set(
      sampledLayer.transform.anchorX,
      sampledLayer.transform.anchorY,
    );
    sprite.position.set(-effect.localX, -effect.localY);
    mask
      .rect(
        -effect.pieceWidth / 2,
        -effect.pieceHeight / 2,
        effect.pieceWidth,
        effect.pieceHeight,
      )
      .fill(0xffffff);
    sprite.mask = mask;
    piece.addChild(sprite, mask);
    piece.position.set(emitter.x + effect.x, emitter.y + effect.y);
    piece.scale.set(effect.scaleX, effect.scaleY);
    piece.rotation = effect.rotation;
    piece.alpha = effect.alpha;
    piece.blendMode = toPixiBlendMode(effect.blendMode);
    instance.effectDisplay.addChild(piece);
  }

  private renderParticleSamples(
    particles: readonly VNILiveParticleSpriteSample[],
  ): number {
    const particlesByLayer = new Map<string, VNILiveParticleSpriteSample[]>();
    for (const particle of particles) {
      const layerParticles = particlesByLayer.get(particle.layerId) ?? [];
      layerParticles.push(particle);
      particlesByLayer.set(particle.layerId, layerParticles);
    }

    for (const instance of this.layerInstances.values()) {
      const layerParticles = particlesByLayer.get(instance.layer.id) ?? [];
      let sprites = this.liveParticleSpritesByLayer.get(instance.layer.id);
      if (!sprites) {
        sprites = [];
        this.liveParticleSpritesByLayer.set(instance.layer.id, sprites);
      }
      while (sprites.length < layerParticles.length) {
        if (!instance.texture) {
          throw new Error(
            `V5G particle layer "${instance.layer.id}" is missing image texture.`,
          );
        }
        const sprite = new PIXI.Sprite(instance.texture);
        sprite.anchor.set(0.5);
        instance.particleDisplay.addChild(sprite);
        sprites.push(sprite);
      }
      for (let index = 0; index < layerParticles.length; index += 1) {
        const particle = layerParticles[index];
        const sprite = sprites[index];
        sprite.position.set(particle.x, particle.y);
        sprite.scale.set(particle.scale);
        sprite.rotation = particle.rotation;
        sprite.alpha = particle.alpha;
        sprite.blendMode = toPixiBlendMode(particle.blendMode);
        sprite.visible = true;
      }
      while (sprites.length > layerParticles.length) {
        const sprite = sprites.pop();
        sprite?.destroy();
      }
    }

    return particles.length;
  }

  private clearParticles(): void {
    for (const instance of this.layerInstances.values()) {
      for (const child of instance.particleDisplay.removeChildren()) {
        child.destroy();
      }
    }
    this.liveParticleSpritesByLayer.clear();
  }

  private clearRenderEffects(): void {
    for (const instance of this.layerInstances.values()) {
      for (const child of instance.effectDisplay.removeChildren()) {
        child.destroy({ children: true });
      }
    }
  }

  private clearSafeGlow(): void {
    for (const instance of this.layerInstances.values()) {
      for (const child of instance.safeGlowDisplay.removeChildren()) {
        child.destroy({ children: true });
      }
    }
  }

  private getRenderedSafeGlowCount(): number {
    let count = 0;
    for (const instance of this.layerInstances.values()) {
      count += instance.safeGlowDisplay.children.length;
    }
    return count;
  }

  private getRenderedRenderEffectCount(): number {
    let count = 0;
    for (const instance of this.layerInstances.values()) {
      count += instance.effectDisplay.children.length;
    }
    return count;
  }

  private getRenderedParticleCount(): number {
    let count = 0;
    for (const sprites of this.liveParticleSpritesByLayer.values()) {
      count += sprites.length;
    }
    return count;
  }

  private updateMountedNodeDiagnostics(): void {
    if (!this.diagnosticsElement) {
      return;
    }
    this.diagnosticsElement.dataset.vniMountedNodes = String(
      this.mountedNodesById.size,
    );
  }

  private updateDiagnostics(
    visibleLayerCount: number,
    particleSpriteCount: number,
    renderEffectSpriteCount: number,
    safeGlowSpriteCount: number,
  ): void {
    const diagnostics = this.diagnosticsElement;
    if (!diagnostics) {
      return;
    }
    diagnostics.dataset.vniProjectId = this.projectId;
    diagnostics.dataset.vniTime = this.currentTime.toFixed(2);
    diagnostics.dataset.vniVisibleLayers = String(visibleLayerCount);
    diagnostics.dataset.vniParticleSprites = String(particleSpriteCount);
    diagnostics.dataset.vniRenderEffectSprites = String(
      renderEffectSpriteCount,
    );
    diagnostics.dataset.vniSafeGlowSprites = String(safeGlowSpriteCount);
    diagnostics.dataset.vniPlaybackMode = this.playbackMode;
    diagnostics.dataset.vniPlaybackPhase = this.getEffectivePlaybackPhase();
    diagnostics.dataset.vniParticleDraining = String(
      this.particleRuntime.isDraining(),
    );
    diagnostics.dataset.vniLiveParticles = String(particleSpriteCount);
    diagnostics.dataset.vniLayerGroups = String(this.layerGroups.length);
    diagnostics.dataset.vniLayerGroupSlots = String(
      this.layerGroupSlots.length,
    );
    this.updateMountedNodeDiagnostics();
    diagnostics.dataset.v5gProjectId = this.projectId;
    diagnostics.dataset.v5gTime = this.currentTime.toFixed(2);
    diagnostics.dataset.v5gVisibleLayers = String(visibleLayerCount);
    diagnostics.dataset.v5gParticleSprites = String(particleSpriteCount);
    diagnostics.dataset.vniBundleId = this.bundleId;
    diagnostics.dataset.vniProfileId = this.profileId;
    diagnostics.dataset.vniAssetScale = String(this.assetScale);
    diagnostics.dataset.vniProfilePurpose = this.profilePurpose;
  }

  private clearDiagnostics(): void {
    const diagnostics = this.diagnosticsElement;
    if (!diagnostics) {
      return;
    }
    delete diagnostics.dataset.vniProjectId;
    delete diagnostics.dataset.vniTime;
    delete diagnostics.dataset.vniVisibleLayers;
    delete diagnostics.dataset.vniParticleSprites;
    delete diagnostics.dataset.vniRenderEffectSprites;
    delete diagnostics.dataset.vniSafeGlowSprites;
    delete diagnostics.dataset.vniPlaybackMode;
    delete diagnostics.dataset.vniPlaybackPhase;
    delete diagnostics.dataset.vniParticleDraining;
    delete diagnostics.dataset.vniLiveParticles;
    delete diagnostics.dataset.vniLayerGroups;
    delete diagnostics.dataset.vniLayerGroupSlots;
    delete diagnostics.dataset.vniMountedNodes;
    delete diagnostics.dataset.v5gProjectId;
    delete diagnostics.dataset.v5gTime;
    delete diagnostics.dataset.v5gVisibleLayers;
    delete diagnostics.dataset.v5gParticleSprites;
    delete diagnostics.dataset.vniBundleId;
    delete diagnostics.dataset.vniProfileId;
    delete diagnostics.dataset.vniAssetScale;
    delete diagnostics.dataset.vniProfilePurpose;
  }
}

function normalizeFitPadding(value: number | undefined): number | undefined {
  if (value === undefined) {
    return value;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      "VNIPlayer fitPadding must be a finite non-negative number.",
    );
  }
  return value;
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
    throw new Error("VNIPlayer viewport width and height must be positive.");
  }
  return Object.freeze({
    width: value.width,
    height: value.height,
  });
}

export type V5GPlayerOptions = VNIPlayerOptions;
export const V5GPlayer = VNIPlayer;

function getLayerGroupSlotKey(slot: {
  afterGroupId: string;
  beforeGroupId: string;
}): string {
  return `${slot.afterGroupId}\u0000${slot.beforeGroupId}`;
}

function normalizeMountedNodeId(id: string): string {
  const normalized = id.trim();
  if (!normalized) {
    throw new Error("VNI mounted node id must be a non-empty string.");
  }
  return normalized;
}

function assertLoadedTexture(
  texture: PIXI.Texture | null | undefined,
  context: string,
): asserts texture is PIXI.Texture {
  if (
    !texture ||
    !Number.isFinite(texture.width) ||
    !Number.isFinite(texture.height)
  ) {
    throw new Error(`${context} failed to load a valid Pixi texture.`);
  }
}
