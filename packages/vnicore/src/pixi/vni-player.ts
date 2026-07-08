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
  sampleChaserLightSpritesForLayer,
  type VNIChaserLightSpriteSample,
} from "../core/chaser-light-sampler.js";
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
import {
  createPrecomposedLightMaskKey,
  createPrecomposedLightMaskTexture,
  isPrecomposedLightMaskBlendMode,
} from "./precomposed-light-mask.js";
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

export interface VNIAttachNodeToTextLayerOptions {
  id: string;
  layerId: string;
  node: PIXI.Container;
  destroyOnDetach?: boolean;
  hideOriginal?: boolean;
}

export interface VNIAttachTextToTextLayerOptions {
  id: string;
  layerId: string;
  text: string;
  style?: Partial<PIXI.TextStyle>;
  destroyOnDetach?: boolean;
  hideOriginal?: boolean;
}

export interface VNITextLayerTextBinding {
  dispose(): void;
  setText(text: string): void;
}

export interface VNIAttachImageToTextLayerOptions {
  id: string;
  layerId: string;
  assetId?: string;
  imageUrl?: string;
  label?: string;
  destroyOnDetach?: boolean;
  hideOriginal?: boolean;
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
  liveParticleSimulationTime?: number;
  particleLayerTime?: number;
}

interface VNIMountedNode {
  id: string;
  node: PIXI.Container;
  slotContainer: PIXI.Container;
  destroyOnDetach: boolean;
  textLayerId?: string;
  hideOriginal?: boolean;
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

interface VNIPrecomposedLightMaskState {
  key: string;
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
}

export class VNIPlayer {
  private readonly stageRoot = new PIXI.Container();
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
  private readonly slotContainersByKey = new Map<string, PIXI.Container>();
  private readonly mountedNodesById = new Map<string, VNIMountedNode>();
  private readonly particleRuntime: VNIParticleRuntime;
  private texturesByAssetId: ReadonlyMap<string, PIXI.Texture> = new Map();
  private readonly ownedTextures = new Set<PIXI.Texture>();
  private readonly safeGlowSpritesByLayer = new Map<string, PIXI.Container[]>();
  private readonly chaserLightSpritesByLayer = new Map<string, PIXI.Sprite[]>();
  private readonly maskSpritesByTargetLayer = new Map<string, PIXI.Sprite>();
  private readonly maskCacheKeysByTargetLayer = new Map<string, string>();
  private readonly precomposedLightMasksByTargetLayer = new Map<
    string,
    VNIPrecomposedLightMaskState
  >();
  private readonly renderEffectDisplaysByLayer = new Map<
    string,
    PIXI.Container[]
  >();
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
    if (options.project.maskCompositeMode === "legacy_alpha") {
      throw new Error(
        "VNI Pixi runtime does not support Cocos-compatible project.maskCompositeMode legacy_alpha; export a Pixi runtime project with precompose_light_alpha.",
      );
    }
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

    this.texturesByAssetId = await this.loadTextures();
    const layersById = new Map(
      this.project.layers.map((layer) => [layer.id, layer] as const),
    );
    for (const group of this.layerGroups) {
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
        this.stageRoot.addChild(instance.display);
      }
      const slot = this.layerGroupSlots.find(
        (candidate) => candidate.afterGroupId === group.id,
      );
      if (slot) {
        const slotContainer = new PIXI.Container();
        slotContainer.label = `VNI slot ${slot.afterGroupId} -> ${slot.beforeGroupId}`;
        this.slotContainersByKey.set(getLayerGroupSlotKey(slot), slotContainer);
        this.stageRoot.addChild(slotContainer);
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
    const texture = await loadPixiTextureFromUrl(
      imageUrl,
      `VNI external mounted image: ${imageUrl}`,
    );
    return this.attachMountedImageSprite(
      texture,
      `VNI mounted external image ${options.label ?? imageUrl}`,
      {
        ...options,
        compensation: { x: 1, y: 1 },
      },
    );
  }

  attachNodeToTextLayer(options: VNIAttachNodeToTextLayerOptions): () => void {
    this.assertInitialized("attachNodeToTextLayer");
    const id = normalizeMountedNodeId(options.id);
    if (this.mountedNodesById.has(id)) {
      throw new Error(`Duplicate VNI mounted node id: ${id}.`);
    }
    const instance = this.getTextLayerInstance(options.layerId);
    instance.display.addChild(options.node);
    this.mountedNodesById.set(id, {
      id,
      node: options.node,
      slotContainer: instance.display,
      destroyOnDetach: options.destroyOnDetach === true,
      textLayerId: instance.layer.id,
      hideOriginal: options.hideOriginal ?? true,
    });
    this.updateTextLayerOriginalVisibility(instance.layer.id);
    this.updateMountedNodeDiagnostics();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.detachMountedNode(id);
    };
  }

  attachTextToTextLayer(
    options: VNIAttachTextToTextLayerOptions,
  ): VNITextLayerTextBinding {
    const textNode = new PIXI.Text({
      text: options.text,
      style: {
        fill: 0xffffff,
        fontFamily: "Arial, sans-serif",
        fontSize: 72,
        fontWeight: "700",
        stroke: { color: 0x111827, width: 4 },
        ...(options.style ?? {}),
      },
    });
    textNode.label = `VNI text layer replacement ${options.layerId}`;
    textNode.anchor.set(0.5);
    const dispose = this.attachNodeToTextLayer({
      ...options,
      node: textNode,
      destroyOnDetach: options.destroyOnDetach ?? true,
    });
    return {
      dispose,
      setText(text: string): void {
        textNode.text = text;
      },
    };
  }

  async attachImageToTextLayer(
    options: VNIAttachImageToTextLayerOptions,
  ): Promise<() => void> {
    const hasAssetId = typeof options.assetId === "string";
    const hasImageUrl = typeof options.imageUrl === "string";
    if (hasAssetId === hasImageUrl) {
      throw new Error(
        "VNI text layer image replacement requires exactly one of assetId or imageUrl.",
      );
    }
    let texture: PIXI.Texture;
    let compensation = { x: 1, y: 1 };
    let label = options.label ?? options.imageUrl ?? options.assetId ?? "";
    if (hasAssetId) {
      const asset = this.assetsById.get(options.assetId ?? "");
      if (!asset) {
        throw new Error(`Unknown VNI asset id: ${options.assetId}.`);
      }
      const loadedTexture = this.texturesByAssetId.get(asset.id);
      if (!loadedTexture) {
        throw new Error(`VNI asset "${asset.id}" is not loaded.`);
      }
      texture = loadedTexture;
      compensation = getAssetDisplayCompensation(asset, {
        width: Math.round(texture.width),
        height: Math.round(texture.height),
      });
      label = options.label ?? asset.path;
    } else {
      const imageUrl = options.imageUrl?.trim() ?? "";
      if (!imageUrl) {
        throw new Error(
          "VNI text layer image replacement url must be non-empty.",
        );
      }
      texture = await loadPixiTextureFromUrl(
        imageUrl,
        `VNI text layer image replacement: ${imageUrl}`,
      );
    }
    const sprite = new PIXI.Sprite(texture);
    sprite.label = `VNI text layer image ${label}`;
    sprite.anchor.set(0.5);
    sprite.scale.set(compensation.x, compensation.y);
    try {
      return this.attachNodeToTextLayer({
        ...options,
        node: sprite,
        destroyOnDetach: options.destroyOnDetach ?? true,
      });
    } catch (error) {
      sprite.destroy({ children: true });
      throw error;
    }
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
    if (mounted.textLayerId) {
      this.updateTextLayerOriginalVisibility(mounted.textLayerId);
    }
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
    this.clearChaserLights();
    this.clearMasks();
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
    const deltaSeconds = (now - this.lastTickMs) / 1000;
    if (Number.isFinite(now)) {
      this.lastTickMs = now;
    }
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.update(deltaSeconds);
    }
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
    const liveParticles =
      segmented.keepParticlesAlive && segmented.getPhase() === "loop";
    const particleTime = this.getSegmentedParticleSampleTime(segmented);
    this.renderPlaybackFrame(result.currentTime, particleTime, {
      liveParticles,
      liveParticleDeltaSeconds: deltaSeconds,
      liveParticleSimulationTime: liveParticles
        ? this.getSegmentedLiveParticleSimulationTime(segmented)
        : undefined,
      particleLayerTime: liveParticles
        ? this.getSegmentedLiveParticleLayerSampleTime(segmented)
        : undefined,
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

  private getSegmentedLiveParticleSimulationTime(
    segmented: VNISegmentedPlaybackSequence,
  ): number {
    if (segmented.getPhase() !== "loop") return segmented.getCurrentTime();
    return segmented.getLoopStartTime() + segmented.getLoopElapsedTime();
  }

  private getSegmentedLiveParticleLayerSampleTime(
    segmented: VNISegmentedPlaybackSequence,
  ): number {
    if (segmented.getPhase() !== "loop") return segmented.getCurrentTime();
    if (segmented.getLoopStartTime() === segmented.getLoopEndTime()) {
      return segmented.getLoopStartTime();
    }
    if (segmented.getLoopIndex() > 0) {
      return segmented.getLoopEndTime();
    }
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
    const chaserLightSpriteCount = this.renderChaserLightSamples(
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
      chaserLightSpriteCount,
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
    const chaserLightSpriteCount = this.renderChaserLightSamples(
      sampled.layers,
      this.currentTime,
    );
    this.updateDiagnostics(
      sampled.layers.filter((layer) => layer.visible).length,
      particleSpriteCount,
      this.getRenderedRenderEffectCount(),
      safeGlowSpriteCount,
      chaserLightSpriteCount,
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
      this.getRenderedChaserLightCount(),
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
    const texture = await loadPixiTextureFromUrl(
      url,
      `VNI project asset: ${asset.path}`,
    );
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
      if (matteTexture) {
        this.ownedTextures.add(matteTexture);
        return matteTexture;
      }
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
    const chaserLightSpriteCount = this.renderChaserLightSamples(
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
      chaserLightSpriteCount,
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
    const chaserLightSpriteCount = this.renderChaserLightSamples(
      sampled.layers,
      nonParticleTime,
    );
    const particleSampledLayers =
      options.particleLayerTime === undefined ||
      options.particleLayerTime === sampled.time
        ? sampled.layers
        : sampleProjectAtTime(this.project, options.particleLayerTime).layers;
    const particleLayers = this.getParticleRuntimeLayers(
      particleSampledLayers,
      sampled.layers,
    );
    const frame = options.liveParticles
      ? this.particleRuntime.emitLive(
          particleLayers,
          this.project.stage,
          particleTime,
          options.liveParticleDeltaSeconds ?? 0,
          options.liveParticleSimulationTime,
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
      chaserLightSpriteCount,
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
    this.applyLayerMasks(sampled.layers);
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

  private getTextLayerInstance(layerId: string): V5GLayerInstance {
    const instance = this.layerInstances.get(layerId);
    if (!instance) {
      throw new Error(`Unknown VNI text layer id: ${layerId}.`);
    }
    if (instance.layer.type !== "text" || !instance.originalTextDisplay) {
      throw new Error(`VNI layer "${layerId}" is not a text layer.`);
    }
    return instance;
  }

  private updateTextLayerOriginalVisibility(layerId: string): void {
    const instance = this.layerInstances.get(layerId);
    if (!instance?.originalTextDisplay) return;
    const shouldHide = [...this.mountedNodesById.values()].some(
      (mounted) => mounted.textLayerId === layerId && mounted.hideOriginal,
    );
    instance.originalTextDisplay.visible = !shouldHide;
  }

  private applyLayerMasks(sampledLayers: readonly SampledLayerState[]): void {
    const sampledByLayerId = new Map(
      sampledLayers.map((layer) => [layer.layerId, layer] as const),
    );
    const activeNativeTargetLayerIds = new Set<string>();
    const activePrecomposedTargetLayerIds = new Set<string>();

    for (const layer of this.project.layers) {
      const mask = layer.mask;
      const targetInstance = this.layerInstances.get(layer.id);
      if (!targetInstance) continue;
      if (!mask?.enabled) {
        targetInstance.display.mask = null;
        this.clearNativeMaskForTarget(layer.id);
        this.clearPrecomposedLightMask(layer.id);
        continue;
      }
      if (mask.compositeMode === "legacy_alpha") {
        throw new Error(
          `VNI Pixi runtime does not support Cocos-compatible legacy_alpha masks on layer "${layer.id}"; export a Pixi runtime project with precompose_light_alpha.`,
        );
      }
      if (!mask.sourceLayerId) {
        throw new Error(
          `VNI mask on layer "${layer.id}" requires sourceLayerId when enabled.`,
        );
      }
      const sourceInstance = this.layerInstances.get(mask.sourceLayerId);
      const sourceSample = sampledByLayerId.get(mask.sourceLayerId);
      const targetSample = sampledByLayerId.get(layer.id);
      if (!sourceInstance || !sourceSample || !targetSample) {
        throw new Error(
          `VNI mask on layer "${layer.id}" references missing source layer "${mask.sourceLayerId}".`,
        );
      }
      if (
        this.shouldUsePrecomposedLightMask(
          targetInstance,
          sourceInstance,
          targetSample,
        )
      ) {
        targetInstance.display.mask = null;
        this.clearNativeMaskForTarget(layer.id);
        this.applyPrecomposedLightMask(
          targetInstance,
          sourceInstance,
          targetSample,
          sourceSample,
        );
        activePrecomposedTargetLayerIds.add(layer.id);
        if (!mask.showSourceLayer) {
          sourceInstance.display.visible = false;
        }
        continue;
      }
      this.clearPrecomposedLightMask(layer.id);
      if (!sourceInstance.texture || !sourceInstance.textureSize) {
        throw new Error(
          `VNI mask source layer "${sourceInstance.layer.id}" is missing image texture.`,
        );
      }
      const maskSprite = this.getOrCreateMaskSprite(
        targetInstance,
        sourceInstance,
      );
      this.applyMaskSpriteState(maskSprite, sourceInstance, sourceSample);
      targetInstance.display.mask = maskSprite;
      activeNativeTargetLayerIds.add(layer.id);
      if (!mask.showSourceLayer) {
        sourceInstance.display.visible = false;
      }
    }

    for (const [layerId, sprite] of [...this.maskSpritesByTargetLayer]) {
      if (activeNativeTargetLayerIds.has(layerId)) continue;
      this.clearNativeMaskForTarget(layerId);
    }
    for (const layerId of [...this.precomposedLightMasksByTargetLayer.keys()]) {
      if (activePrecomposedTargetLayerIds.has(layerId)) continue;
      this.clearPrecomposedLightMask(layerId);
    }
  }

  private shouldUsePrecomposedLightMask(
    targetInstance: V5GLayerInstance,
    sourceInstance: V5GLayerInstance,
    targetSample: SampledLayerState,
  ): boolean {
    const mask = targetInstance.layer.mask;
    return (
      mask?.enabled === true &&
      mask.compositeMode === "precompose_light_alpha" &&
      targetInstance.layer.type === "image" &&
      sourceInstance.layer.type === "image" &&
      isPrecomposedLightMaskBlendMode(targetSample.blendMode)
    );
  }

  private applyPrecomposedLightMask(
    targetInstance: V5GLayerInstance,
    sourceInstance: V5GLayerInstance,
    targetSample: SampledLayerState,
    sourceSample: SampledLayerState,
  ): void {
    if (!targetInstance.texture || !sourceInstance.texture) {
      throw new Error(
        `VNI precompose_light_alpha mask on layer "${targetInstance.layer.id}" requires image source and target textures.`,
      );
    }
    const targetAsset = getLayerAsset(targetInstance.layer, this.assetsById);
    const sourceAsset = getLayerAsset(sourceInstance.layer, this.assetsById);
    if (!targetAsset || !sourceAsset) {
      throw new Error(
        `VNI precompose_light_alpha mask on layer "${targetInstance.layer.id}" requires image source and target assets.`,
      );
    }
    const input = {
      stage: this.project.stage,
      target: {
        layerId: targetInstance.layer.id,
        asset: targetAsset,
        texture: targetInstance.texture,
        transform: targetSample.transform,
        opacity: targetSample.opacity,
        blendMode: targetSample.blendMode,
      },
      source: {
        layerId: sourceInstance.layer.id,
        asset: sourceAsset,
        texture: sourceInstance.texture,
        transform: sourceSample.transform,
        opacity: sourceSample.opacity,
      },
    };
    const key = createPrecomposedLightMaskKey(input);
    let state = this.precomposedLightMasksByTargetLayer.get(
      targetInstance.layer.id,
    );
    if (!state || state.key !== key) {
      const texture = createPrecomposedLightMaskTexture(input);
      const sprite = new PIXI.Sprite(texture);
      sprite.label = `VNI precomposed light mask ${sourceInstance.layer.id} -> ${targetInstance.layer.id}`;
      sprite.position.set(0, 0);
      sprite.alpha = targetSample.opacity;
      sprite.blendMode = toPixiBlendMode(targetSample.blendMode);
      sprite.visible = targetSample.visible;
      state?.sprite.parent?.removeChild(state.sprite);
      state?.sprite.destroy({ children: true });
      state?.texture.destroy(true);
      state = { key, sprite, texture };
      this.precomposedLightMasksByTargetLayer.set(
        targetInstance.layer.id,
        state,
      );
      this.insertLayerRuntimeDisplay(targetInstance, sprite);
    } else {
      state.sprite.alpha = targetSample.opacity;
      state.sprite.blendMode = toPixiBlendMode(targetSample.blendMode);
      state.sprite.visible = targetSample.visible;
    }
    targetInstance.display.alpha = 0;
    this.maskCacheKeysByTargetLayer.set(targetInstance.layer.id, key);
  }

  private clearNativeMaskForTarget(layerId: string): void {
    const sprite = this.maskSpritesByTargetLayer.get(layerId);
    if (!sprite) return;
    sprite.parent?.removeChild(sprite);
    sprite.destroy({ children: true });
    this.maskSpritesByTargetLayer.delete(layerId);
    this.maskCacheKeysByTargetLayer.delete(layerId);
  }

  private clearPrecomposedLightMask(layerId: string): void {
    const state = this.precomposedLightMasksByTargetLayer.get(layerId);
    if (!state) return;
    state.sprite.parent?.removeChild(state.sprite);
    state.sprite.destroy({ children: true });
    state.texture.destroy(true);
    this.precomposedLightMasksByTargetLayer.delete(layerId);
    this.maskCacheKeysByTargetLayer.delete(layerId);
  }

  private getOrCreateMaskSprite(
    targetInstance: V5GLayerInstance,
    sourceInstance: V5GLayerInstance,
  ): PIXI.Sprite {
    const existing = this.maskSpritesByTargetLayer.get(targetInstance.layer.id);
    if (existing) return existing;
    if (!sourceInstance.texture) {
      throw new Error(
        `VNI mask source layer "${sourceInstance.layer.id}" is missing image texture.`,
      );
    }
    const sprite = new PIXI.Sprite(sourceInstance.texture);
    sprite.label = `VNI mask ${sourceInstance.layer.id} -> ${targetInstance.layer.id}`;
    sprite.anchor.set(
      sourceInstance.layer.transform.anchorX,
      sourceInstance.layer.transform.anchorY,
    );
    (sprite as unknown as { renderable: boolean }).renderable = false;
    this.stageRoot.addChild(sprite);
    this.maskSpritesByTargetLayer.set(targetInstance.layer.id, sprite);
    return sprite;
  }

  private applyMaskSpriteState(
    sprite: PIXI.Sprite,
    sourceInstance: V5GLayerInstance,
    sourceSample: SampledLayerState,
  ): void {
    const position = editorToPixi(
      sourceSample.transform.x,
      sourceSample.transform.y,
      this.project.stage.width,
      this.project.stage.height,
    );
    const asset = getLayerAsset(sourceInstance.layer, this.assetsById);
    if (!asset || !sourceInstance.textureSize) {
      throw new Error(
        `VNI mask source layer "${sourceInstance.layer.id}" is missing image asset.`,
      );
    }
    const compensation = getAssetDisplayCompensation(
      asset,
      sourceInstance.textureSize,
    );
    sprite.position.set(position.x, position.y);
    sprite.scale.set(
      sourceSample.transform.scaleX * compensation.x,
      sourceSample.transform.scaleY * compensation.y,
    );
    sprite.rotation = (sourceSample.transform.rotation * Math.PI) / 180;
    sprite.alpha = sourceSample.opacity;
    sprite.visible = true;
  }

  private getParticleRuntimeLayers(
    sampledLayers: readonly SampledLayerState[],
    activeSampledLayers: readonly SampledLayerState[] = sampledLayers,
  ): VNIParticleRuntimeLayer[] {
    const layers: VNIParticleRuntimeLayer[] = [];
    const sampledLayerById = new Map(
      sampledLayers.map((sampledLayer) => [sampledLayer.layerId, sampledLayer]),
    );
    for (const activeSampledLayer of activeSampledLayers) {
      if (!activeSampledLayer.hasActiveParticleAnimation) continue;
      const sampledLayer =
        sampledLayerById.get(activeSampledLayer.layerId) ?? activeSampledLayer;
      const instance = this.layerInstances.get(activeSampledLayer.layerId);
      if (!instance) {
        throw new Error(
          `Missing V5G layer instance: ${activeSampledLayer.layerId}`,
        );
      }
      if (!instance.textureSize) {
        throw new Error(
          `V5G particle layer "${activeSampledLayer.layerId}" is missing image texture.`,
        );
      }
      layers.push({
        layer: instance.layer,
        sampledLayer: {
          ...sampledLayer,
          hasActiveParticleAnimation: true,
        },
        textureSize: instance.textureSize,
      });
    }
    return layers;
  }

  private insertLayerRuntimeDisplay(
    instance: V5GLayerInstance,
    display: PIXI.Container,
  ): void {
    const parent = instance.display.parent;
    if (!parent) {
      throw new Error(
        `VNI layer "${instance.layer.id}" display is not mounted.`,
      );
    }
    const orderedDisplays = this.getLayerRuntimeDisplayOrder(instance);
    const displayOrderIndex = orderedDisplays.indexOf(display);
    let insertAfter = instance.display;
    const safeDisplayOrderIndex =
      displayOrderIndex >= 0 ? displayOrderIndex : 1;
    for (let index = 0; index < safeDisplayOrderIndex; index += 1) {
      const candidate = orderedDisplays[index];
      if (candidate.parent === parent) {
        insertAfter = candidate;
      }
    }
    const insertAfterIndex = parent.children.indexOf(insertAfter);
    if (insertAfterIndex < 0) {
      parent.addChild(display);
      return;
    }
    parent.addChildAt(
      display,
      Math.min(insertAfterIndex + 1, parent.children.length),
    );
  }

  private getLayerRuntimeDisplayOrder(
    instance: V5GLayerInstance,
  ): PIXI.Container[] {
    const precomposed = this.precomposedLightMasksByTargetLayer.get(
      instance.layer.id,
    )?.sprite;
    return [
      instance.display,
      ...(precomposed ? [precomposed] : []),
      ...(this.safeGlowSpritesByLayer.get(instance.layer.id) ?? []),
      ...(this.renderEffectDisplaysByLayer.get(instance.layer.id) ?? []),
      ...(this.chaserLightSpritesByLayer.get(instance.layer.id) ?? []),
      ...(this.liveParticleSpritesByLayer.get(instance.layer.id) ?? []),
    ];
  }

  private addTrackedRuntimeDisplay<T extends PIXI.Container>(
    instance: V5GLayerInstance,
    displaysByLayer: Map<string, T[]>,
    display: T,
  ): void {
    const displays = displaysByLayer.get(instance.layer.id) ?? [];
    displays.push(display);
    displaysByLayer.set(instance.layer.id, displays);
    this.insertLayerRuntimeDisplay(instance, display);
  }

  private clearTrackedRuntimeDisplays<T extends PIXI.Container>(
    displaysByLayer: Map<string, T[]>,
  ): void {
    for (const displays of displaysByLayer.values()) {
      for (const display of displays) {
        this.destroyRuntimeDisplay(display);
      }
    }
    displaysByLayer.clear();
  }

  private destroyRuntimeDisplay(display: PIXI.Container): void {
    display.parent?.removeChild(display);
    display.destroy({ children: true });
  }

  private renderSafeGlowSamples(
    sampledLayers: readonly SampledLayerState[],
    time: number,
  ): number {
    let spriteCount = 0;
    this.clearTrackedRuntimeDisplays(this.safeGlowSpritesByLayer);

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
    this.addTrackedRuntimeDisplay(
      instance,
      this.safeGlowSpritesByLayer,
      sprite,
    );
  }

  private renderRenderEffectSamples(
    sampledLayers: readonly SampledLayerState[],
    time: number,
  ): number {
    let spriteCount = 0;
    this.clearTrackedRuntimeDisplays(this.renderEffectDisplaysByLayer);

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

  private renderChaserLightSamples(
    sampledLayers: readonly SampledLayerState[],
    time: number,
  ): number {
    const samplesByLayer = new Map<string, VNIChaserLightSpriteSample[]>();
    let sampleCount = 0;
    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveChaserLightAnimation) continue;
      const instance = this.layerInstances.get(sampledLayer.layerId);
      if (!instance) {
        throw new Error(`Missing V5G layer instance: ${sampledLayer.layerId}`);
      }
      if (!instance.texture || !instance.textureSize) {
        throw new Error(
          `V5G chaser_light layer "${sampledLayer.layerId}" is missing image texture.`,
        );
      }
      const samples = sampleChaserLightSpritesForLayer(
        instance.layer,
        sampledLayer,
        instance.textureSize,
        time,
      );
      samplesByLayer.set(sampledLayer.layerId, samples);
      sampleCount += samples.length;
    }

    for (const instance of this.layerInstances.values()) {
      const samples = samplesByLayer.get(instance.layer.id) ?? [];
      if (samples.length === 0) {
        const sprites = this.chaserLightSpritesByLayer.get(instance.layer.id);
        if (sprites) {
          for (const sprite of sprites) {
            this.destroyRuntimeDisplay(sprite);
          }
          this.chaserLightSpritesByLayer.delete(instance.layer.id);
        }
        continue;
      }
      let sprites = this.chaserLightSpritesByLayer.get(instance.layer.id);
      if (!sprites) {
        sprites = [];
        this.chaserLightSpritesByLayer.set(instance.layer.id, sprites);
      }
      while (sprites.length < samples.length) {
        if (!instance.texture) {
          throw new Error(
            `V5G chaser_light layer "${instance.layer.id}" is missing image texture.`,
          );
        }
        const sprite = new PIXI.Sprite(instance.texture);
        sprite.anchor.set(
          instance.layer.transform.anchorX,
          instance.layer.transform.anchorY,
        );
        sprites.push(sprite);
        this.insertLayerRuntimeDisplay(instance, sprite);
      }
      const asset = getLayerAsset(instance.layer, this.assetsById);
      if (!asset || !instance.textureSize) {
        throw new Error(
          `V5G chaser_light layer "${instance.layer.id}" is missing image asset.`,
        );
      }
      const compensation = getAssetDisplayCompensation(
        asset,
        instance.textureSize,
      );
      const sampledLayer = sampledLayers.find(
        (candidate) => candidate.layerId === instance.layer.id,
      );
      if (!sampledLayer) {
        throw new Error(
          `Missing V5G chaser_light sampled layer: ${instance.layer.id}`,
        );
      }
      const emitter = editorToPixi(
        sampledLayer.transform.x,
        sampledLayer.transform.y,
        this.project.stage.width,
        this.project.stage.height,
      );
      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];
        const sprite = sprites[index];
        sprite.position.set(emitter.x + sample.x, emitter.y + sample.y);
        sprite.scale.set(
          sample.scale * compensation.x,
          sample.scale * compensation.y,
        );
        sprite.rotation = sample.rotation;
        sprite.alpha = sample.alpha;
        sprite.blendMode = toPixiBlendMode(sample.blendMode);
        sprite.visible = true;
      }
      while (sprites.length > samples.length) {
        const sprite = sprites.pop();
        if (sprite) {
          this.destroyRuntimeDisplay(sprite);
        }
      }
    }

    return sampleCount;
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
      this.addTrackedRuntimeDisplay(
        instance,
        this.renderEffectDisplaysByLayer,
        sprite,
      );
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
    this.addTrackedRuntimeDisplay(
      instance,
      this.renderEffectDisplaysByLayer,
      piece,
    );
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
      if (layerParticles.length === 0) {
        const sprites = this.liveParticleSpritesByLayer.get(instance.layer.id);
        if (sprites) {
          for (const sprite of sprites) {
            this.destroyRuntimeDisplay(sprite);
          }
          this.liveParticleSpritesByLayer.delete(instance.layer.id);
        }
        continue;
      }
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
        sprites.push(sprite);
        this.insertLayerRuntimeDisplay(instance, sprite);
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
        if (sprite) {
          this.destroyRuntimeDisplay(sprite);
        }
      }
    }

    return particles.length;
  }

  private clearParticles(): void {
    this.clearTrackedRuntimeDisplays(this.liveParticleSpritesByLayer);
  }

  private clearRenderEffects(): void {
    this.clearTrackedRuntimeDisplays(this.renderEffectDisplaysByLayer);
  }

  private clearChaserLights(): void {
    this.clearTrackedRuntimeDisplays(this.chaserLightSpritesByLayer);
  }

  private clearMasks(): void {
    for (const instance of this.layerInstances.values()) {
      instance.display.mask = null;
    }
    for (const layerId of [...this.maskSpritesByTargetLayer.keys()]) {
      this.clearNativeMaskForTarget(layerId);
    }
    for (const layerId of [...this.precomposedLightMasksByTargetLayer.keys()]) {
      this.clearPrecomposedLightMask(layerId);
    }
    this.maskCacheKeysByTargetLayer.clear();
  }

  private clearSafeGlow(): void {
    this.clearTrackedRuntimeDisplays(this.safeGlowSpritesByLayer);
  }

  private getRenderedSafeGlowCount(): number {
    let count = 0;
    for (const sprites of this.safeGlowSpritesByLayer.values()) {
      count += sprites.length;
    }
    return count;
  }

  private getRenderedRenderEffectCount(): number {
    let count = 0;
    for (const displays of this.renderEffectDisplaysByLayer.values()) {
      count += displays.length;
    }
    return count;
  }

  private getRenderedChaserLightCount(): number {
    let count = 0;
    for (const sprites of this.chaserLightSpritesByLayer.values()) {
      count += sprites.length;
    }
    return count;
  }

  private getRenderedMaskCount(): number {
    return (
      this.maskSpritesByTargetLayer.size +
      this.precomposedLightMasksByTargetLayer.size
    );
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
    this.diagnosticsElement.dataset.vniTextLayerBindings = String(
      [...this.mountedNodesById.values()].filter(
        (mounted) => mounted.textLayerId,
      ).length,
    );
  }

  private updateDiagnostics(
    visibleLayerCount: number,
    particleSpriteCount: number,
    renderEffectSpriteCount: number,
    safeGlowSpriteCount: number,
    chaserLightSpriteCount: number,
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
    diagnostics.dataset.vniChaserLightSprites = String(chaserLightSpriteCount);
    diagnostics.dataset.vniMaskSprites = String(this.getRenderedMaskCount());
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
    delete diagnostics.dataset.vniChaserLightSprites;
    delete diagnostics.dataset.vniMaskSprites;
    delete diagnostics.dataset.vniPlaybackMode;
    delete diagnostics.dataset.vniPlaybackPhase;
    delete diagnostics.dataset.vniParticleDraining;
    delete diagnostics.dataset.vniLiveParticles;
    delete diagnostics.dataset.vniLayerGroups;
    delete diagnostics.dataset.vniLayerGroupSlots;
    delete diagnostics.dataset.vniMountedNodes;
    delete diagnostics.dataset.vniTextLayerBindings;
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

async function loadPixiTextureFromUrl(
  url: string,
  context: string,
): Promise<PIXI.Texture> {
  const texture = (await PIXI.Assets.load({
    src: url,
    loadParser: "loadTextures",
  })) as PIXI.Texture | null | undefined;
  assertLoadedTexture(texture, context);
  return texture;
}
