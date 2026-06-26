import {
  V5GParticleRuntime,
  sampleLiveParticleSprites,
  type V5GLiveParticleSpriteSample,
  type V5GParticleRuntimeLayer,
} from "../core/particle-runtime.js";
import {
  sampleProjectAtTime,
  type SampledLayerState,
} from "../core/project-sampler.js";
import {
  sampleSafeGlowSpritesForLayer,
  type VNISafeGlowSpriteSample,
} from "../core/safe-glow-sampler.js";
import {
  assertVNIAdjacentLayerGroupSlot,
  getVNIProjectLayerGroupSlots,
  getVNIProjectRenderGroupOrder,
  type VNILayerGroupSlot,
  type VNIRenderGroupInfo,
} from "../core/layer-groups.js";
import {
  V5GSegmentedPlaybackSequence,
  normalizeSegmentedPlaybackOptions,
} from "../core/playback-sequence.js";
import { validateCocosV5GProject } from "../core/validation.js";
import { getCocosBlendModeConfig } from "./blend-mode.js";
import {
  opacityToCocosOpacity,
  v5gTransformToCocosPosition,
} from "./coordinates.js";
import type { V5GCocosNodeTransformSnapshot } from "./node-driver.js";
import type { V5GAssetConfig, V5GLayerConfig } from "../core/types.js";
import type {
  V5GCocosPlaybackCompleteContext,
  V5GCocosPlaybackEventContext,
  V5GCocosPlaybackEventOptions,
  V5GCocosPlaybackMode,
  V5GCocosPlaybackPoint,
  V5GCocosPlaybackRange,
  V5GCocosPlaybackState,
  V5GCocosAssetResolver,
  V5GCocosAssetSource,
  V5GCocosAttachNodeBetweenLayerGroupsOptions,
  V5GCocosAttachProjectAssetBetweenLayerGroupsOptions,
  V5GCocosAttachSpriteFrameBetweenLayerGroupsOptions,
  V5GCocosLayerGroupInfo,
  V5GCocosLayerGroupSlot,
  V5GCocosSpriteAtlasAssetSource,
  V5GCocosPlayerOptions,
  V5GCocosPlayOptions,
  V5GCocosPlayRangeOptions,
  V5GCocosSegmentedPlaybackPhase,
} from "./types.js";

interface ManagedLayer<TNode, TSpriteFrame> {
  layer: V5GLayerConfig;
  asset: V5GAssetConfig;
  node: TNode;
  safeGlowContainer: TNode;
  safeGlowNodes: TNode[];
  particleContainer: TNode;
  particleNodes: TNode[];
  spriteFrame: TSpriteFrame;
}

interface PlaybackBoundary {
  startTime: number;
  endTime: number;
  loop: boolean;
}

interface NormalizedPlaybackEvent {
  id: string;
  time: number;
  once: boolean;
  order: number;
  listener: (event: V5GCocosPlaybackEventContext) => void;
}

interface PlaybackFrameOptions {
  liveParticles?: boolean;
  liveParticleDeltaSeconds?: number;
}

interface ResolvedSpriteFrame<TSpriteFrame> {
  spriteFrame: TSpriteFrame;
  shouldValidateSize: boolean;
}

interface MountedNodeRecord<TNode> {
  id: string | null;
  node: TNode;
  slotNode: TNode;
  originalParent: TNode | null;
  originalLocalTransform: V5GCocosNodeTransformSnapshot;
  destroyOnDetach: boolean;
  version: number;
}

interface NormalizedMountedNode<TNode> {
  id: string | null;
  node: TNode;
}

interface MountedImageNodeOptions {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: V5GLayerConfig["blendMode"];
}

const SIZE_EPSILON = 0.01;
const PLAYBACK_EPSILON = 1e-9;

function getExpectedSpriteFrameSize(asset: V5GAssetConfig): {
  width: number;
  height: number;
} {
  return {
    width: asset.fileWidth ?? asset.width,
    height: asset.fileHeight ?? asset.height,
  };
}

export class V5GCocosPlayer<TNode, TSpriteFrame> {
  private readonly options: V5GCocosPlayerOptions<TNode, TSpriteFrame>;
  private readonly layers = new Map<
    string,
    ManagedLayer<TNode, TSpriteFrame>
  >();
  private layerGroups: readonly VNIRenderGroupInfo[] = [];
  private layerGroupSlots: readonly VNILayerGroupSlot[] = [];
  private readonly groupNodesById = new Map<string, TNode>();
  private readonly slotNodesByKey = new Map<string, TNode>();
  private readonly mountedNodesById = new Map<
    string,
    MountedNodeRecord<TNode>
  >();
  private readonly mountedNodesByNode = new Map<
    TNode,
    MountedNodeRecord<TNode>
  >();
  private readonly particleRuntime: V5GParticleRuntime;
  private stageNode: TNode | null = null;
  private contentNode: TNode | null = null;
  private particleRootNode: TNode | null = null;
  private currentTime = 0;
  private isPlaying = false;
  private loop: boolean;
  private playbackMode: V5GCocosPlaybackMode = "timeline";
  private playbackPhase: V5GCocosSegmentedPlaybackPhase = "idle";
  private activeRange: PlaybackBoundary | null = null;
  private segmentedPlayback: V5GSegmentedPlaybackSequence | null = null;
  private pendingComplete: V5GCocosPlaybackCompleteContext | null = null;
  private drainPaused = false;
  private readonly playbackEvents = new Map<string, NormalizedPlaybackEvent>();
  private readonly completeListeners = new Set<
    (event: V5GCocosPlaybackCompleteContext) => void
  >();
  private loopIndex = 0;
  private nextPlaybackEventOrder = 0;

  constructor(options: V5GCocosPlayerOptions<TNode, TSpriteFrame>) {
    this.options = options;
    this.loop = options.loop ?? true;
    this.particleRuntime = new V5GParticleRuntime(options.project.layers);
  }

  get time(): number {
    return this.currentTime;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  init(): void {
    this.destroyManagedNodes();
    this.resetPlaybackRuntime();
    validateCocosV5GProject(this.options.project);
    this.layerGroups = getVNIProjectRenderGroupOrder(this.options.project);
    this.layerGroupSlots = getVNIProjectLayerGroupSlots(this.options.project);

    const driver = this.options.driver;
    const project = this.options.project;
    const stage = driver.createNode("V5G Stage");

    try {
      driver.setContentSize(stage, project.stage.width, project.stage.height);
      driver.setAnchorPoint(stage, 0.5, 0.5);

      const content = driver.createNode("V5G Content");
      driver.setContentSize(content, project.stage.width, project.stage.height);
      driver.setAnchorPoint(content, 0.5, 0.5);
      driver.appendChild(stage, content);
      this.contentNode = content;

      const particleRoot = driver.createNode("V5G Particles");
      driver.setContentSize(
        particleRoot,
        project.stage.width,
        project.stage.height,
      );
      driver.setAnchorPoint(particleRoot, 0.5, 0.5);
      driver.appendChild(stage, particleRoot);
      this.particleRootNode = particleRoot;

      const assetsById = new Map(
        project.assets.map((asset) => [asset.id, asset]),
      );
      const layersById = new Map(
        project.layers.map((layer) => [layer.id, layer] as const),
      );
      for (const group of this.layerGroups) {
        const groupNode = driver.createNode(`V5G Group ${group.id}`);
        driver.setContentSize(
          groupNode,
          project.stage.width,
          project.stage.height,
        );
        driver.setAnchorPoint(groupNode, 0.5, 0.5);
        driver.appendChild(content, groupNode);
        this.groupNodesById.set(group.id, groupNode);

        for (const layerId of group.layerIds) {
          const layer = layersById.get(layerId);
          if (!layer) {
            throw new Error(`Missing V5G layer for render group: ${layerId}.`);
          }
          const asset = this.requireImageAsset(layer, assetsById);
          const resolvedSpriteFrame = this.resolveSpriteFrame(asset);
          const spriteFrame = resolvedSpriteFrame.spriteFrame;
          if (resolvedSpriteFrame.shouldValidateSize) {
            this.assertSpriteFrameSize(asset, spriteFrame);
          }

          const node = driver.createImageNode(layer.name, spriteFrame);
          driver.setContentSize(node, asset.width, asset.height);
          driver.setAnchorPoint(
            node,
            layer.transform.anchorX,
            layer.transform.anchorY,
          );
          driver.applyBlendMode(node, getCocosBlendModeConfig(layer.blendMode));
          driver.appendChild(groupNode, node);

          const safeGlowContainer = driver.createNode(
            `${layer.name} Safe Glow`,
          );
          driver.setContentSize(
            safeGlowContainer,
            project.stage.width,
            project.stage.height,
          );
          driver.setAnchorPoint(safeGlowContainer, 0.5, 0.5);
          driver.appendChild(groupNode, safeGlowContainer);

          const particleContainer = driver.createNode(
            `${layer.name} Particles`,
          );
          driver.setContentSize(
            particleContainer,
            project.stage.width,
            project.stage.height,
          );
          driver.setAnchorPoint(particleContainer, 0.5, 0.5);
          driver.appendChild(groupNode, particleContainer);

          this.layers.set(layer.id, {
            layer,
            asset,
            node,
            safeGlowContainer,
            safeGlowNodes: [],
            particleContainer,
            particleNodes: [],
            spriteFrame,
          });
        }

        const slot = this.layerGroupSlots.find(
          (candidate) => candidate.afterGroupId === group.id,
        );
        if (slot) {
          const slotNode = driver.createNode(
            `V5G Slot ${slot.afterGroupId} -> ${slot.beforeGroupId}`,
          );
          driver.setContentSize(
            slotNode,
            project.stage.width,
            project.stage.height,
          );
          driver.setAnchorPoint(slotNode, 0.5, 0.5);
          driver.appendChild(content, slotNode);
          this.slotNodesByKey.set(getLayerGroupSlotKey(slot), slotNode);
        }
      }

      driver.appendChild(this.options.root, stage);
      this.stageNode = stage;
      this.renderDeterministicFrame(this.currentTime);
    } catch (error) {
      driver.destroyNode(stage);
      this.stageNode = null;
      this.contentNode = null;
      this.particleRootNode = null;
      this.layers.clear();
      this.groupNodesById.clear();
      this.slotNodesByKey.clear();
      this.mountedNodesById.clear();
      this.mountedNodesByNode.clear();
      this.layerGroups = [];
      this.layerGroupSlots = [];
      throw error;
    }
  }

  seek(time: number): void {
    this.assertInitialized();
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.particleRuntime.reset();
    this.renderDeterministicFrame(time);
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "V5GCocosPlayer.update(deltaSeconds) requires a non-negative finite number.",
      );
    }
    if (!this.isPlaying) {
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

  play(options?: V5GCocosPlayOptions): void {
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

  playRange(options: V5GCocosPlayRangeOptions): void {
    this.startRangePlayback(options);
  }

  requestSegmentedPlaybackEnd(): void {
    if (!this.segmentedPlayback) {
      throw new Error("No active V5G segmented playback.");
    }
    this.segmentedPlayback.requestEnd();
    this.playbackPhase = this.segmentedPlayback.getPhase();
    if (!this.isPlaying) {
      this.setPlaying(true);
    }
    this.drainPaused = false;
  }

  getPlaybackState(): V5GCocosPlaybackState {
    return {
      mode: this.playbackMode,
      phase: this.getEffectivePlaybackPhase(),
      currentTime: this.currentTime,
      isPlaying: this.isPlaying,
      isDrainingParticles: this.particleRuntime.isDraining(),
      liveParticleCount: this.getRenderedParticleCount(),
      loopIndex: this.segmentedPlayback?.getLoopIndex() ?? this.loopIndex,
      keepParticlesAlive: this.segmentedPlayback?.keepParticlesAlive ?? true,
    };
  }

  getLayerGroups(): readonly V5GCocosLayerGroupInfo[] {
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

  getLayerGroupSlots(): readonly V5GCocosLayerGroupSlot[] {
    return this.layerGroupSlots.map((slot) => Object.freeze({ ...slot }));
  }

  attachNodeBetweenLayerGroups(
    options: V5GCocosAttachNodeBetweenLayerGroupsOptions<TNode>,
  ): () => void {
    this.assertInitialized("attachNodeBetweenLayerGroups");
    const nodes = normalizeMountedNodes(options);
    this.assertMountableNodeIds(nodes);
    const slot = assertVNIAdjacentLayerGroupSlot(
      this.options.project,
      options.afterGroupId,
      options.beforeGroupId,
    );
    const slotNode = this.slotNodesByKey.get(getLayerGroupSlotKey(slot));
    if (!slotNode) {
      throw new Error(
        `Missing V5G Cocos layer group slot container: ${slot.afterGroupId} -> ${slot.beforeGroupId}.`,
      );
    }
    const mountedVersions = nodes.map((node) => {
      const mounted = this.attachMountedNodeRecord(
        node,
        slotNode,
        options.destroyOnDetach === true,
      );
      return { node: mounted.node, version: mounted.version };
    });

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      for (const mountedVersion of mountedVersions) {
        const mounted = this.mountedNodesByNode.get(mountedVersion.node);
        if (mounted?.version === mountedVersion.version) {
          this.detachMountedNodeRecordAndUnregister(mounted);
        }
      }
    };
  }

  attachProjectAssetBetweenLayerGroups(
    options: V5GCocosAttachProjectAssetBetweenLayerGroupsOptions,
  ): () => void {
    this.assertInitialized("attachProjectAssetBetweenLayerGroups");
    const asset = this.options.project.assets.find(
      (candidate) => candidate.id === options.assetId,
    );
    if (!asset) {
      throw new Error(`Unknown V5G asset id: ${options.assetId}.`);
    }
    const resolvedSpriteFrame = this.resolveSpriteFrame(asset);
    if (resolvedSpriteFrame.shouldValidateSize) {
      this.assertSpriteFrameSize(asset, resolvedSpriteFrame.spriteFrame);
    }
    return this.attachRuntimeOwnedImageNode(
      `V5G Mounted Image ${asset.id}`,
      resolvedSpriteFrame.spriteFrame,
      asset.width,
      asset.height,
      options,
    );
  }

  attachSpriteFrameBetweenLayerGroups(
    options: V5GCocosAttachSpriteFrameBetweenLayerGroupsOptions<TSpriteFrame>,
  ): () => void {
    this.assertInitialized("attachSpriteFrameBetweenLayerGroups");
    this.assertPositiveFiniteNumber(
      options.width,
      "V5GCocosPlayer.attachSpriteFrameBetweenLayerGroups width",
    );
    this.assertPositiveFiniteNumber(
      options.height,
      "V5GCocosPlayer.attachSpriteFrameBetweenLayerGroups height",
    );
    return this.attachRuntimeOwnedImageNode(
      "V5G Mounted SpriteFrame",
      options.spriteFrame,
      options.width,
      options.height,
      options,
    );
  }

  detachMountedNode(target: string | TNode): void {
    this.detachMountedNodeRecordAndUnregister(
      this.requireMountedNodeRecord(target),
    );
  }

  detachMountedNodes(targets: readonly (string | TNode)[]): void {
    const mountedNodes = targets.map((target) =>
      this.requireMountedNodeRecord(target),
    );
    const detached = new Set<MountedNodeRecord<TNode>>();
    for (const mounted of mountedNodes) {
      if (!detached.has(mounted)) {
        this.detachMountedNodeRecordAndUnregister(mounted);
        detached.add(mounted);
      }
    }
  }

  clearMountedNodes(): void {
    for (const mounted of [...this.mountedNodesByNode.values()]) {
      this.detachMountedNodeRecordAndUnregister(mounted);
    }
  }

  addPlaybackEvent(options: V5GCocosPlaybackEventOptions): () => void {
    if (typeof options.id !== "string" || options.id.length === 0) {
      throw new Error("V5GCocosPlayer.addPlaybackEvent id must be non-empty.");
    }
    if (this.playbackEvents.has(options.id)) {
      throw new Error(
        `V5GCocosPlayer.addPlaybackEvent id must be unique: ${options.id}.`,
      );
    }
    if (typeof options.listener !== "function") {
      throw new Error(
        "V5GCocosPlayer.addPlaybackEvent listener must be a function.",
      );
    }

    this.playbackEvents.set(options.id, {
      id: options.id,
      time: this.normalizePlaybackPoint(
        options.at,
        "V5GCocosPlayer.addPlaybackEvent",
      ),
      once: options.once ?? false,
      order: this.nextPlaybackEventOrder,
      listener: options.listener,
    });
    this.nextPlaybackEventOrder += 1;

    return () => {
      this.playbackEvents.delete(options.id);
    };
  }

  clearPlaybackEvent(id: string): void {
    if (!this.playbackEvents.delete(id)) {
      throw new Error(`V5GCocosPlayer.clearPlaybackEvent unknown id: ${id}.`);
    }
  }

  clearPlaybackEvents(): void {
    this.playbackEvents.clear();
  }

  onPlaybackComplete(
    listener: (event: V5GCocosPlaybackCompleteContext) => void,
  ): () => void {
    if (typeof listener !== "function") {
      throw new Error(
        "V5GCocosPlayer.onPlaybackComplete listener must be a function.",
      );
    }
    this.completeListeners.add(listener);
    return () => {
      this.completeListeners.delete(listener);
    };
  }

  pause(): void {
    if (this.particleRuntime.isDraining()) {
      this.drainPaused = true;
    }
    this.setPlaying(false);
  }

  restart(): void {
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.particleRuntime.reset();
    this.renderDeterministicFrame(0);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  destroy(): void {
    this.destroyManagedNodes();
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackEvents.clear();
    this.completeListeners.clear();
    this.loopIndex = 0;
    this.drainPaused = false;
    this.particleRuntime.reset();
    this.setPlaying(false);
    this.currentTime = 0;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
  }

  private startTimelinePlayback(): void {
    this.assertInitialized();
    if (this.particleRuntime.isDraining()) {
      this.drainPaused = false;
      return;
    }
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "start";
    this.loopIndex = 0;
    this.particleRuntime.reset();
    if (this.currentTime >= this.options.project.stage.duration) {
      this.renderPlaybackFrame(0, 0);
    }
    this.setPlaying(true);
  }

  private startRangePlayback(options: V5GCocosPlayRangeOptions): void {
    this.assertInitialized();
    const range = this.normalizePlaybackRange(
      options.range,
      "V5GCocosPlayer.playRange",
    );
    this.activeRange = {
      ...range,
      loop: options.loop ?? this.loop,
    };
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "range";
    this.playbackPhase = "start";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.particleRuntime.reset();
    this.renderPlaybackFrame(range.startTime, range.startTime);
    this.setPlaying(true);
  }

  private startSegmentedPlayback(
    options: Extract<V5GCocosPlayOptions, { mode: "segmented" }>,
  ): void {
    this.assertInitialized();
    const normalized = normalizeSegmentedPlaybackOptions(
      options,
      this.options.project.stage.duration,
    );
    this.activeRange = null;
    this.pendingComplete = null;
    this.playbackMode = "segmented";
    this.playbackPhase = "start";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.particleRuntime.reset();
    this.segmentedPlayback = new V5GSegmentedPlaybackSequence(normalized);
    this.renderPlaybackFrame(0, 0);
    this.setPlaying(true);
  }

  private advanceFullTimeline(deltaSeconds: number): void {
    const duration = this.options.project.stage.duration;
    const boundary: PlaybackBoundary = {
      startTime: 0,
      endTime: duration,
      loop: this.loop,
    };
    let remaining = deltaSeconds;

    while (remaining > 0 && this.isPlaying) {
      const timeToEnd = duration - this.currentTime;
      if (remaining >= timeToEnd - PLAYBACK_EPSILON) {
        const previousTime = this.currentTime;
        this.emitPlaybackEventsBetween(previousTime, duration, 0, boundary);
        if (this.loop) {
          remaining -= Math.max(timeToEnd, 0);
          this.renderPlaybackFrame(duration, duration);
          this.renderPlaybackFrame(0, 0);
          if (timeToEnd <= PLAYBACK_EPSILON) break;
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
      this.emitPlaybackEventsBetween(previousTime, nextTime, 0, boundary);
      return;
    }
  }

  private advanceActiveRange(deltaSeconds: number): void {
    const range = this.activeRange;
    if (!range) return;
    let remaining = deltaSeconds;

    while (remaining > 0 && this.isPlaying && this.activeRange === range) {
      const timeToEnd = range.endTime - this.currentTime;
      if (remaining >= timeToEnd - PLAYBACK_EPSILON) {
        const previousTime = this.currentTime;
        this.emitPlaybackEventsBetween(
          previousTime,
          range.endTime,
          this.loopIndex,
          range,
        );
        if (range.loop) {
          remaining -= Math.max(timeToEnd, 0);
          this.renderPlaybackFrame(range.endTime, range.endTime);
          this.loopIndex += 1;
          this.renderPlaybackFrame(range.startTime, range.startTime);
          if (timeToEnd <= PLAYBACK_EPSILON) break;
          continue;
        }
        this.activeRange = null;
        this.startParticleDrain(range.endTime, {
          startTime: range.startTime,
          endTime: range.endTime,
          currentTime: range.endTime,
          loopIndex: this.loopIndex,
        });
        return;
      }

      const previousTime = this.currentTime;
      const nextTime = previousTime + remaining;
      this.renderPlaybackFrame(nextTime, nextTime);
      this.emitPlaybackEventsBetween(
        previousTime,
        nextTime,
        this.loopIndex,
        range,
      );
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
      this.startParticleDrain(this.options.project.stage.duration, {
        startTime: 0,
        endTime: this.options.project.stage.duration,
        currentTime: this.options.project.stage.duration,
        loopIndex: result.loopIndex,
      });
      return;
    }

    const particleTime = segmented.getCurrentTime();
    this.renderPlaybackFrame(result.currentTime, particleTime, {
      liveParticles:
        segmented.keepParticlesAlive && segmented.getPhase() === "loop",
      liveParticleDeltaSeconds: deltaSeconds,
    });
  }

  private triggerSegmentedPlaybackEvents(
    segmented: V5GSegmentedPlaybackSequence,
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
      this.emitPlaybackEventsBetween(
        result.previousTime,
        segmented.getLoopEndTime(),
        Math.max(0, result.loopIndex - 1),
        {
          startTime: segmented.getLoopStartTime(),
          endTime: segmented.getLoopEndTime(),
          loop: true,
        },
      );
      this.emitPlaybackEventsBetween(
        segmented.getLoopStartTime(),
        result.currentTime,
        result.loopIndex,
        {
          startTime: segmented.getLoopStartTime(),
          endTime: segmented.getLoopEndTime(),
          loop: true,
        },
      );
      return;
    }

    this.emitPlaybackEventsBetween(
      result.previousTime,
      result.currentTime,
      result.loopIndex,
      {
        startTime: 0,
        endTime: this.options.project.stage.duration,
        loop: false,
      },
    );
  }

  private startParticleDrain(
    endTime: number,
    completeContext: V5GCocosPlaybackCompleteContext,
  ): void {
    this.setPlaying(false);
    this.currentTime = endTime;
    this.pendingComplete = completeContext;
    this.playbackPhase = "particle-draining";
    const sampled = this.applyProjectSample(endTime);
    const particleLayers = this.getParticleRuntimeLayers(sampled.layers);
    if (particleLayers.length > 0) {
      const endParticles = sampleLiveParticleSprites(particleLayers, endTime);
      if (endParticles.length > 0) {
        this.particleRuntime.emit(particleLayers, endTime);
      }
    }
    const frame = this.particleRuntime.beginDrain();
    this.renderParticleSamples(frame.particles);
    this.options.onTimeChange?.(this.currentTime);
    if (frame.isComplete) {
      this.finishParticleDrain();
      return;
    }
    this.drainPaused = false;
  }

  private advanceParticleDrain(deltaSeconds: number): void {
    const frame = this.particleRuntime.advanceDrain(deltaSeconds);
    this.renderParticleSamples(frame.particles);
    if (frame.isComplete) {
      this.finishParticleDrain();
    }
  }

  private finishParticleDrain(): void {
    this.playbackPhase = "complete";
    this.segmentedPlayback?.markParticleDrainComplete();
    this.clearParticles();
    const event = this.pendingComplete;
    this.pendingComplete = null;
    if (event) {
      this.emitPlaybackComplete(event);
    }
  }

  private renderDeterministicFrame(time: number): void {
    const sampled = this.applyProjectSample(time);
    const frame = this.particleRuntime.emit(
      this.getParticleRuntimeLayers(sampled.layers),
      this.currentTime,
    );
    this.renderParticleSamples(frame.particles);
    this.options.onTimeChange?.(this.currentTime);
  }

  private renderPlaybackFrame(
    nonParticleTime: number,
    particleTime: number,
    options: PlaybackFrameOptions = {},
  ): void {
    const sampled = this.applyProjectSample(nonParticleTime);
    const particleLayers = this.getParticleRuntimeLayers(sampled.layers);
    const frame = options.liveParticles
      ? this.particleRuntime.emitLive(
          particleLayers,
          particleTime,
          options.liveParticleDeltaSeconds ?? 0,
        )
      : this.particleRuntime.emit(particleLayers, particleTime);
    this.renderParticleSamples(frame.particles);
    this.options.onTimeChange?.(this.currentTime);
  }

  private applyProjectSample(time: number): {
    time: number;
    layers: SampledLayerState[];
  } {
    const sampledProject = sampleProjectAtTime(this.options.project, time);
    this.currentTime = sampledProject.time;

    for (const sampledLayer of sampledProject.layers) {
      const managed = this.layers.get(sampledLayer.layerId);
      if (!managed) {
        throw new Error(
          `Missing runtime node for V5G layer "${sampledLayer.layerId}".`,
        );
      }
      const position = v5gTransformToCocosPosition(sampledLayer.transform);
      this.options.driver.setPosition(managed.node, position.x, position.y);
      this.options.driver.setScale(
        managed.node,
        sampledLayer.transform.scaleX,
        sampledLayer.transform.scaleY,
      );
      this.options.driver.setRotationDegrees(
        managed.node,
        sampledLayer.transform.rotation,
      );
      this.options.driver.setOpacity(
        managed.node,
        opacityToCocosOpacity(sampledLayer.opacity),
      );
      this.options.driver.setActive(
        managed.node,
        sampledLayer.renderImageDisplay,
      );
      this.renderSafeGlowSamples(managed, sampledLayer, sampledProject.time);
    }

    return sampledProject;
  }

  private renderSafeGlowSamples(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    sampledLayer: SampledLayerState,
    time: number,
  ): void {
    const safeGlows = sampleSafeGlowSpritesForLayer(
      managed.layer,
      sampledLayer,
      time,
    );

    while (managed.safeGlowNodes.length < safeGlows.length) {
      const node = this.options.driver.createImageNode(
        `V5G Safe Glow ${managed.layer.id}`,
        managed.spriteFrame,
      );
      this.options.driver.setContentSize(
        node,
        managed.asset.width,
        managed.asset.height,
      );
      this.options.driver.setAnchorPoint(
        node,
        managed.layer.transform.anchorX,
        managed.layer.transform.anchorY,
      );
      this.options.driver.applyBlendMode(
        node,
        getCocosBlendModeConfig("normal"),
      );
      this.options.driver.appendChild(managed.safeGlowContainer, node);
      managed.safeGlowNodes.push(node);
    }

    for (let index = 0; index < safeGlows.length; index += 1) {
      const safeGlow = safeGlows[index];
      const node = managed.safeGlowNodes[index];
      this.applySafeGlowSample(node, managed, sampledLayer, safeGlow);
    }

    while (managed.safeGlowNodes.length > safeGlows.length) {
      const node = managed.safeGlowNodes.pop();
      if (node !== undefined) this.options.driver.destroyNode(node);
    }
  }

  private applySafeGlowSample(
    node: TNode,
    managed: ManagedLayer<TNode, TSpriteFrame>,
    sampledLayer: SampledLayerState,
    safeGlow: VNISafeGlowSpriteSample,
  ): void {
    const position = v5gTransformToCocosPosition(sampledLayer.transform);
    this.options.driver.setContentSize(
      node,
      managed.asset.width,
      managed.asset.height,
    );
    this.options.driver.setAnchorPoint(
      node,
      managed.layer.transform.anchorX,
      managed.layer.transform.anchorY,
    );
    this.options.driver.setPosition(
      node,
      position.x + safeGlow.x,
      position.y + safeGlow.y,
    );
    this.options.driver.setScale(node, safeGlow.scaleX, safeGlow.scaleY);
    this.options.driver.setRotationDegrees(
      node,
      (safeGlow.rotation * 180) / Math.PI,
    );
    this.options.driver.setOpacity(node, opacityToCocosOpacity(safeGlow.alpha));
    this.options.driver.applyBlendMode(
      node,
      getCocosBlendModeConfig(safeGlow.blendMode),
    );
    this.options.driver.setActive(node, true);
  }

  private getParticleRuntimeLayers(
    sampledLayers: readonly SampledLayerState[],
  ): V5GParticleRuntimeLayer[] {
    const layers: V5GParticleRuntimeLayer[] = [];
    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveParticleAnimation) continue;
      const managed = this.layers.get(sampledLayer.layerId);
      if (!managed) {
        throw new Error(
          `Missing runtime node for V5G particle layer "${sampledLayer.layerId}".`,
        );
      }
      layers.push({
        layer: managed.layer,
        sampledLayer,
        textureSize: {
          width: managed.asset.width,
          height: managed.asset.height,
        },
      });
    }
    return layers;
  }

  private renderParticleSamples(
    particles: readonly V5GLiveParticleSpriteSample[],
  ): void {
    const particlesByLayer = new Map<string, V5GLiveParticleSpriteSample[]>();
    for (const particle of particles) {
      const layerParticles = particlesByLayer.get(particle.layerId) ?? [];
      layerParticles.push(particle);
      particlesByLayer.set(particle.layerId, layerParticles);
    }

    for (const managed of this.layers.values()) {
      const layerParticles = particlesByLayer.get(managed.layer.id) ?? [];
      while (managed.particleNodes.length < layerParticles.length) {
        const node = this.options.driver.createImageNode(
          `V5G Particle ${managed.layer.id}`,
          managed.spriteFrame,
        );
        this.options.driver.setContentSize(
          node,
          managed.asset.width,
          managed.asset.height,
        );
        this.options.driver.setAnchorPoint(node, 0.5, 0.5);
        this.options.driver.applyBlendMode(
          node,
          getCocosBlendModeConfig(managed.layer.blendMode),
        );
        this.options.driver.appendChild(managed.particleContainer, node);
        managed.particleNodes.push(node);
      }

      for (let index = 0; index < layerParticles.length; index += 1) {
        const particle = layerParticles[index];
        const node = managed.particleNodes[index];
        this.options.driver.setPosition(node, particle.x, particle.y);
        this.options.driver.setScale(node, particle.scale, particle.scale);
        this.options.driver.setRotationDegrees(
          node,
          (particle.rotation * 180) / Math.PI,
        );
        this.options.driver.setOpacity(
          node,
          opacityToCocosOpacity(particle.alpha),
        );
        this.options.driver.applyBlendMode(
          node,
          getCocosBlendModeConfig(particle.blendMode),
        );
        this.options.driver.setActive(node, true);
      }

      while (managed.particleNodes.length > layerParticles.length) {
        const node = managed.particleNodes.pop();
        if (node !== undefined) this.options.driver.destroyNode(node);
      }
    }
  }

  private attachRuntimeOwnedImageNode(
    name: string,
    spriteFrame: TSpriteFrame,
    width: number,
    height: number,
    options: MountedImageNodeOptions & {
      id: string;
      afterGroupId: string;
      beforeGroupId: string;
      destroyOnDetach?: boolean;
    },
  ): () => void {
    const node = this.options.driver.createImageNode(name, spriteFrame);
    try {
      this.configureMountedImageNode(node, width, height, options);
      return this.attachNodeBetweenLayerGroups({
        id: options.id,
        afterGroupId: options.afterGroupId,
        beforeGroupId: options.beforeGroupId,
        node,
        destroyOnDetach: options.destroyOnDetach ?? true,
      });
    } catch (error) {
      this.options.driver.destroyNode(node);
      throw error;
    }
  }

  private configureMountedImageNode(
    node: TNode,
    width: number,
    height: number,
    options: MountedImageNodeOptions,
  ): void {
    this.assertPositiveFiniteNumber(width, "mounted image width");
    this.assertPositiveFiniteNumber(height, "mounted image height");
    const opacity = options.opacity ?? 1;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new Error("mounted image opacity must be in range 0..1.");
    }
    this.options.driver.setContentSize(node, width, height);
    this.options.driver.setAnchorPoint(
      node,
      options.anchorX ?? 0.5,
      options.anchorY ?? 0.5,
    );
    this.options.driver.setPosition(node, options.x ?? 0, options.y ?? 0);
    this.options.driver.setScale(
      node,
      options.scaleX ?? 1,
      options.scaleY ?? 1,
    );
    this.options.driver.setRotationDegrees(node, options.rotation ?? 0);
    this.options.driver.setOpacity(node, opacityToCocosOpacity(opacity));
    this.options.driver.setActive(node, true);
    this.options.driver.applyBlendMode(
      node,
      getCocosBlendModeConfig(options.blendMode ?? "normal"),
    );
  }

  private assertMountableNodeIds(
    nodes: readonly NormalizedMountedNode<TNode>[],
  ): void {
    const idOwners = new Map<string, TNode>();
    const nodeIds = new Map<TNode, string | null>();
    for (const mounted of this.mountedNodesByNode.values()) {
      nodeIds.set(mounted.node, mounted.id);
      if (mounted.id !== null) {
        idOwners.set(mounted.id, mounted.node);
      }
    }
    for (const mounted of nodes) {
      if (mounted.id !== null) {
        const owner = idOwners.get(mounted.id);
        if (owner !== undefined && owner !== mounted.node) {
          throw new Error(
            `Duplicate V5G Cocos mounted node id: ${mounted.id}.`,
          );
        }
      }
      const previousId = nodeIds.get(mounted.node);
      if (previousId !== undefined && previousId !== null) {
        idOwners.delete(previousId);
      }
      nodeIds.set(mounted.node, mounted.id);
      if (mounted.id !== null) {
        idOwners.set(mounted.id, mounted.node);
      }
    }
  }

  private attachMountedNodeRecord(
    mountedNode: NormalizedMountedNode<TNode>,
    slotNode: TNode,
    destroyOnDetach: boolean,
  ): MountedNodeRecord<TNode> {
    const existingById =
      mountedNode.id === null
        ? undefined
        : this.mountedNodesById.get(mountedNode.id);
    if (existingById !== undefined && existingById.node !== mountedNode.node) {
      throw new Error(
        `Duplicate V5G Cocos mounted node id: ${mountedNode.id}.`,
      );
    }

    let mounted = this.mountedNodesByNode.get(mountedNode.node);
    const previousParent = this.options.driver.getParent(mountedNode.node);
    const worldTransform =
      previousParent === null
        ? null
        : this.options.driver.captureWorldTransform(mountedNode.node);
    if (mounted === undefined) {
      mounted = {
        id: null,
        node: mountedNode.node,
        slotNode,
        originalParent: previousParent,
        originalLocalTransform: this.options.driver.captureLocalTransform(
          mountedNode.node,
        ),
        destroyOnDetach,
        version: 0,
      };
      this.mountedNodesByNode.set(mountedNode.node, mounted);
    } else if (mounted.id !== null) {
      this.mountedNodesById.delete(mounted.id);
    }

    mounted.id = mountedNode.id;
    mounted.slotNode = slotNode;
    mounted.destroyOnDetach = destroyOnDetach;
    mounted.version += 1;
    this.options.driver.appendChild(slotNode, mountedNode.node);
    if (worldTransform !== null) {
      this.options.driver.restoreWorldTransform(
        mountedNode.node,
        worldTransform,
      );
    }
    if (mounted.id !== null) {
      this.mountedNodesById.set(mounted.id, mounted);
    }
    return mounted;
  }

  private requireMountedNodeRecord(
    target: string | TNode,
  ): MountedNodeRecord<TNode> {
    if (typeof target === "string") {
      const normalizedId = normalizeMountedNodeId(target);
      const mounted = this.mountedNodesById.get(normalizedId);
      if (!mounted) {
        throw new Error(`Unknown V5G Cocos mounted node id: ${normalizedId}.`);
      }
      return mounted;
    }
    const mounted = this.mountedNodesByNode.get(target);
    if (!mounted) {
      throw new Error("Unknown V5G Cocos mounted node.");
    }
    return mounted;
  }

  private detachMountedNodeRecordAndUnregister(
    mounted: MountedNodeRecord<TNode>,
  ): void {
    this.detachMountedNodeRecord(mounted);
    if (mounted.id !== null) {
      this.mountedNodesById.delete(mounted.id);
    }
    this.mountedNodesByNode.delete(mounted.node);
  }

  private detachMountedNodeRecord(mounted: MountedNodeRecord<TNode>): void {
    const node = mounted.node as TNode | null | undefined;
    if (!this.isDriverNodeValid(node)) return;
    if (mounted.destroyOnDetach) {
      this.options.driver.destroyNode(node);
      return;
    }
    const currentParent = this.options.driver.getParent(node);
    if (currentParent !== null && this.isDriverNodeValid(currentParent)) {
      this.options.driver.removeChild(currentParent, node);
    }
    if (
      mounted.originalParent !== null &&
      this.isDriverNodeValid(mounted.originalParent)
    ) {
      this.options.driver.appendChild(mounted.originalParent, node);
    }
    this.options.driver.restoreLocalTransform(
      node,
      mounted.originalLocalTransform,
    );
  }

  private isDriverNodeValid(node: TNode | null | undefined): node is TNode {
    if (node === null || node === undefined) return false;
    return this.options.driver.isValidNode?.(node) ?? true;
  }

  private normalizePlaybackRange(
    range: V5GCocosPlaybackRange,
    apiName: string,
  ): Omit<PlaybackBoundary, "loop"> {
    if (range.unit === "time") {
      this.assertFiniteNumber(range.start, `${apiName} range.start`);
      const endTime =
        range.end === undefined || range.end === -1
          ? this.options.project.stage.duration
          : range.end;
      this.assertFiniteNumber(endTime, `${apiName} range.end`);
      return this.assertPlaybackRangeTimes(range.start, endTime, apiName);
    }

    if (range.unit === "frame") {
      this.assertNonNegativeInteger(range.start, `${apiName} range.start`);
      this.assertPositiveFiniteNumber(range.fps, `${apiName} range.fps`);
      const endTime =
        range.end === undefined || range.end === -1
          ? this.options.project.stage.duration
          : this.normalizePlaybackFrameEnd(range.end, range.fps, apiName);
      return this.assertPlaybackRangeTimes(
        range.start / range.fps,
        endTime,
        apiName,
      );
    }

    throw new Error(`${apiName} range.unit must be "time" or "frame".`);
  }

  private normalizePlaybackFrameEnd(
    endFrame: number,
    fps: number,
    apiName: string,
  ): number {
    this.assertNonNegativeInteger(endFrame, `${apiName} range.end`);
    return endFrame / fps;
  }

  private normalizePlaybackPoint(
    point: V5GCocosPlaybackPoint,
    apiName: string,
  ): number {
    let time: number;
    if (point.unit === "time") {
      this.assertFiniteNumber(point.at, `${apiName} at`);
      time = point.at;
    } else if (point.unit === "frame") {
      this.assertNonNegativeInteger(point.at, `${apiName} at`);
      this.assertPositiveFiniteNumber(point.fps, `${apiName} fps`);
      time = point.at / point.fps;
    } else {
      throw new Error(`${apiName} at.unit must be "time" or "frame".`);
    }

    const duration = this.options.project.stage.duration;
    if (time < 0 || time > duration) {
      throw new Error(
        `${apiName} at must resolve to a time between 0 and project.stage.duration (${duration}).`,
      );
    }
    return time;
  }

  private assertPlaybackRangeTimes(
    startTime: number,
    endTime: number,
    apiName: string,
  ): Omit<PlaybackBoundary, "loop"> {
    const duration = this.options.project.stage.duration;
    if (startTime < 0) {
      throw new Error(`${apiName} range.start must be >= 0.`);
    }
    if (startTime >= endTime) {
      throw new Error(`${apiName} range.start must be less than range.end.`);
    }
    if (endTime > duration) {
      throw new Error(
        `${apiName} range.end must be <= project.stage.duration (${duration}).`,
      );
    }
    return { startTime, endTime };
  }

  private emitPlaybackEventsBetween(
    previousTime: number,
    currentTime: number,
    loopIndex: number,
    boundary: PlaybackBoundary,
  ): void {
    const events = [...this.playbackEvents.values()]
      .filter(
        (event) =>
          event.time >= boundary.startTime &&
          event.time <= boundary.endTime + PLAYBACK_EPSILON &&
          event.time > previousTime + PLAYBACK_EPSILON &&
          event.time <= currentTime + PLAYBACK_EPSILON,
      )
      .sort((a, b) => a.time - b.time || a.order - b.order);

    for (const event of events) {
      if (event.once) {
        this.playbackEvents.delete(event.id);
      }
      event.listener({
        id: event.id,
        time: event.time,
        previousTime,
        currentTime,
        loopIndex,
      });
    }
  }

  private emitPlaybackComplete(context: V5GCocosPlaybackCompleteContext): void {
    for (const listener of [...this.completeListeners]) {
      listener(context);
    }
  }

  private assertFiniteNumber(value: number, field: string): void {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number.`);
    }
  }

  private assertPositiveFiniteNumber(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${field} must be a positive finite number.`);
    }
  }

  private assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
  }

  private setPlaying(nextPlaying: boolean): void {
    if (this.isPlaying === nextPlaying) return;
    this.isPlaying = nextPlaying;
    this.options.onPlayingChange?.(this.isPlaying);
  }

  private resetPlaybackRuntime(): void {
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
    this.loopIndex = 0;
    this.drainPaused = false;
    this.particleRuntime.reset();
    this.setPlaying(false);
  }

  private destroyManagedNodes(): void {
    this.clearMountedNodes();
    this.clearSafeGlowNodes();
    this.clearParticles();
    if (this.stageNode !== null) {
      this.options.driver.destroyNode(this.stageNode);
    }
    this.stageNode = null;
    this.contentNode = null;
    this.particleRootNode = null;
    this.layers.clear();
    this.groupNodesById.clear();
    this.slotNodesByKey.clear();
    this.mountedNodesById.clear();
    this.mountedNodesByNode.clear();
    this.layerGroups = [];
    this.layerGroupSlots = [];
  }

  private assertInitialized(apiName = "seek/update"): void {
    if (this.stageNode === null) {
      throw new Error(`V5GCocosPlayer must be initialized before ${apiName}.`);
    }
  }

  private requireImageAsset(
    layer: V5GLayerConfig,
    assetsById: ReadonlyMap<string, V5GAssetConfig>,
  ): V5GAssetConfig {
    if (layer.type !== "image" || !layer.assetId) {
      throw new Error(`V5G Cocos layer "${layer.id}" requires an image asset.`);
    }
    const asset = assetsById.get(layer.assetId);
    if (!asset) {
      throw new Error(
        `V5G Cocos layer "${layer.id}" references missing asset "${layer.assetId}".`,
      );
    }
    return asset;
  }

  private assertSpriteFrameSize(
    asset: V5GAssetConfig,
    spriteFrame: TSpriteFrame,
  ): void {
    const actualSize = this.options.driver.getSpriteFrameSize(spriteFrame);
    if (actualSize === null) return;
    const expectedSize = getExpectedSpriteFrameSize(asset);
    if (
      Math.abs(actualSize.width - expectedSize.width) > SIZE_EPSILON ||
      Math.abs(actualSize.height - expectedSize.height) > SIZE_EPSILON
    ) {
      throw new Error(
        `Cocos SpriteFrame size mismatch for V5G asset "${asset.id}" at "${asset.path}": logical ${asset.width}x${asset.height}, expected file ${expectedSize.width}x${expectedSize.height}, got ${actualSize.width}x${actualSize.height}.`,
      );
    }
  }

  private resolveSpriteFrame(
    asset: V5GAssetConfig,
  ): ResolvedSpriteFrame<TSpriteFrame> {
    const source = this.options.assets as
      | V5GCocosAssetSource<TSpriteFrame>
      | null
      | undefined;
    if (isAssetResolver(source)) {
      const spriteFrame = source.getSpriteFrame(asset.path, asset.id);
      if (spriteFrame === null) {
        throw new Error(
          `Missing Cocos SpriteFrame for V5G asset "${asset.id}" at "${asset.path}".`,
        );
      }
      return { spriteFrame, shouldValidateSize: true };
    }

    if (isSpriteAtlasAssetSource(source)) {
      const atlasKey = getAssetFrameNameFromPath(asset.path);
      const spriteFrame = source.atlas.getSpriteFrame(atlasKey);
      if (spriteFrame === null) {
        throw new Error(
          `Missing Cocos SpriteFrame for V5G asset "${asset.id}" at "${asset.path}" using atlas key "${atlasKey}".`,
        );
      }
      return { spriteFrame, shouldValidateSize: false };
    }

    throw new Error(
      "V5GCocosPlayer assets.atlas must provide getSpriteFrame(name).",
    );
  }

  private clearParticles(): void {
    for (const managed of this.layers.values()) {
      while (managed.particleNodes.length > 0) {
        const node = managed.particleNodes.pop();
        if (node !== undefined) this.options.driver.destroyNode(node);
      }
    }
  }

  private clearSafeGlowNodes(): void {
    for (const managed of this.layers.values()) {
      while (managed.safeGlowNodes.length > 0) {
        const node = managed.safeGlowNodes.pop();
        if (node !== undefined) this.options.driver.destroyNode(node);
      }
    }
  }

  private getRenderedParticleCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      count += managed.particleNodes.length;
    }
    return count;
  }

  private getEffectivePlaybackPhase(): V5GCocosSegmentedPlaybackPhase {
    if (this.particleRuntime.isDraining()) return "particle-draining";
    if (this.segmentedPlayback) return this.segmentedPlayback.getPhase();
    return this.playbackPhase;
  }
}

function isAssetResolver<TSpriteFrame>(
  source: V5GCocosAssetSource<TSpriteFrame> | null | undefined,
): source is V5GCocosAssetResolver<TSpriteFrame> {
  return (
    source !== null &&
    source !== undefined &&
    typeof (source as Partial<V5GCocosAssetResolver<TSpriteFrame>>)
      .getSpriteFrame === "function"
  );
}

function getAssetFrameNameFromPath(assetPath: string): string {
  const normalized = assetPath.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  const fileName =
    slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function isSpriteAtlasAssetSource<TSpriteFrame>(
  source: V5GCocosAssetSource<TSpriteFrame> | null | undefined,
): source is V5GCocosSpriteAtlasAssetSource<TSpriteFrame> {
  return (
    source !== null &&
    source !== undefined &&
    typeof (source as Partial<V5GCocosSpriteAtlasAssetSource<TSpriteFrame>>)
      .atlas?.getSpriteFrame === "function"
  );
}

function getLayerGroupSlotKey(slot: VNILayerGroupSlot): string {
  return `${slot.afterGroupId}\u0000${slot.beforeGroupId}`;
}

function normalizeMountedNodes<TNode>(
  options: V5GCocosAttachNodeBetweenLayerGroupsOptions<TNode>,
): readonly NormalizedMountedNode<TNode>[] {
  if (options.node !== undefined && options.nodes !== undefined) {
    throw new Error(
      "V5GCocosPlayer.attachNodeBetweenLayerGroups accepts node or nodes, not both.",
    );
  }
  const nodes =
    options.nodes !== undefined
      ? [...options.nodes]
      : options.node !== undefined
        ? [options.node]
        : [];
  if (nodes.length === 0) {
    throw new Error(
      "V5GCocosPlayer.attachNodeBetweenLayerGroups requires at least one node.",
    );
  }
  if (options.id !== undefined && options.ids !== undefined) {
    throw new Error(
      "V5GCocosPlayer.attachNodeBetweenLayerGroups accepts id or ids, not both.",
    );
  }
  const ids = normalizeMountedNodeIds(options.id, options.ids, nodes.length);
  return nodes.map((node, index) => {
    if (node === null || node === undefined) {
      throw new Error(
        "V5GCocosPlayer.attachNodeBetweenLayerGroups node must be non-null.",
      );
    }
    return { id: ids[index], node };
  });
}

function normalizeMountedNodeIds(
  id: string | undefined,
  ids: readonly string[] | undefined,
  nodeCount: number,
): readonly (string | null)[] {
  if (ids !== undefined) {
    if (ids.length !== nodeCount) {
      throw new Error(
        "V5GCocosPlayer.attachNodeBetweenLayerGroups ids length must match nodes length.",
      );
    }
    return ids.map((candidate) => normalizeMountedNodeId(candidate));
  }
  if (id !== undefined) {
    if (nodeCount !== 1) {
      throw new Error(
        "V5GCocosPlayer.attachNodeBetweenLayerGroups id can only be used with one node; use ids for multiple nodes.",
      );
    }
    return [normalizeMountedNodeId(id)];
  }
  return Array.from({ length: nodeCount }, () => null);
}

function normalizeMountedNodeId(id: string): string {
  if (typeof id !== "string") {
    throw new Error("V5G Cocos mounted node id must be a string.");
  }
  const normalized = id.trim();
  if (normalized.length === 0) {
    throw new Error("V5G Cocos mounted node id must be non-empty.");
  }
  return normalized;
}
