import {
  V5GParticleRuntime,
  sampleLiveParticleSprites,
  type V5GLiveParticleSpriteSample,
  type V5GParticleRuntimeLayer,
} from "../core/particle-runtime.js";
import type { Node, SpriteFrame } from "cc";
import {
  sampleProjectAtTime,
  type SampledLayerState,
} from "../core/project-sampler.js";
import {
  sampleChaserLightSpritesForLayer,
  type VNIChaserLightSpriteSample,
} from "../core/chaser-light-sampler.js";
import {
  sampleSafeGlowSpritesForLayer,
  type VNISafeGlowSpriteSample,
} from "../core/safe-glow-sampler.js";
import {
  sampleDeterministicEffectSpritesForLayer,
  type VNIDeterministicEffectSample,
} from "../core/effect-sampler.js";
import { isDeterministicEffectAnimationType } from "../core/animation-sampler.js";
import { getLayerDisplayAssetId } from "../core/sequence-layer.js";
import {
  createCardCarousel3DSampleBuffer,
  getCardCarousel3DProgress,
  prepareCardCarousel3D,
  sampleCardCarousel3D,
  type VNICardCarousel3DPreparedConfig,
  type VNICardCarousel3DSampleBuffer,
  type VNICardCarousel3DTextureInfo,
} from "../core/card-carousel-3d.js";
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
import type {
  V5GCocosLineSample,
  V5GCocosNodeTransformSnapshot,
  V5GSpriteFrameRegion,
} from "./node-driver.js";
import type {
  V5GAnimationConfig,
  V5GAssetConfig,
  V5GLayerConfig,
} from "../core/types.js";
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
  V5GCocosAttachNodeToTextLayerOptions,
  V5GCocosAttachProjectAssetBetweenLayerGroupsOptions,
  V5GCocosAttachProjectAssetToTextLayerOptions,
  V5GCocosAttachSpriteFrameBetweenLayerGroupsOptions,
  V5GCocosAttachSpriteFrameToTextLayerOptions,
  V5GCocosAttachTextToTextLayerOptions,
  V5GCocosLayerGroupInfo,
  V5GCocosLayerGroupSlot,
  V5GCocosRuntimeDiagnostics,
  V5GCocosSpriteAtlasAssetSource,
  V5GCocosTextLayerTextBinding,
  V5GCocosForceStopParticlesOptions,
  V5GCocosPlayerOptions,
  V5GCocosPlayOptions,
  V5GCocosPlayRangeOptions,
  V5GCocosSegmentedPlaybackEndOptions,
  V5GCocosSegmentedPlaybackPhase,
} from "./types.js";

interface ManagedLayer<TNode, TSpriteFrame> {
  layer: V5GLayerConfig;
  asset: V5GAssetConfig | null;
  /** Stable outer root: sampled x/y/scale/rotation/opacity and masks. */
  node: TNode;
  /** Stable content root: pressure visualRotation only. */
  contentNode: TNode;
  /** Sprite or Label display owned by the runtime. */
  displayNode: TNode;
  textBindingContainer: TNode | null;
  textBindings: TextLayerBindingRecord<TNode>[];
  safeGlowContainer: TNode;
  safeGlowNodes: TNode[];
  chaserLightContainer: TNode;
  chaserLightNodes: TNode[];
  particleContainer: TNode;
  particleNodes: TNode[];
  maskNode: TNode | null;
  spriteFrame: TSpriteFrame | null;
  displayAssets: readonly V5GAssetConfig[];
  displaySpriteFrames: readonly TSpriteFrame[];
  currentDisplayAssetIndex: number;
  deterministicEffectContainer: TNode | null;
  deterministicEffectNodes: TNode[];
  deterministicEffectFrameCache: Map<string, TSpriteFrame>;
  deterministicEffectActiveCount: number;
  deterministicLineActiveCount: number;
  deterministicLineNode: TNode | null;
  cardCarouselRuntimes: CardCarouselRuntime<TNode, TSpriteFrame>[];
}

interface CardCarouselRuntime<TNode, TSpriteFrame> {
  animation: V5GAnimationConfig;
  prepared: VNICardCarousel3DPreparedConfig;
  output: VNICardCarousel3DSampleBuffer;
  container: TNode;
  cardContainers: TNode[];
  sliceNodes: TNode[][];
  sliceFrames: TSpriteFrame[][];
  textureInfos: readonly VNICardCarousel3DTextureInfo[];
  visibleCardCount: number;
}

interface PlaybackBoundary {
  startTime: number;
  endTime: number;
  loop: boolean;
}

type NormalizedPlaybackEvent = readonly [
  id: string,
  time: number,
  once: boolean,
  order: number,
  listener: (event: V5GCocosPlaybackEventContext) => void,
];

const PLAYBACK_EVENT_ID = 0;
const PLAYBACK_EVENT_TIME = 1;
const PLAYBACK_EVENT_ONCE = 2;
const PLAYBACK_EVENT_ORDER = 3;
const PLAYBACK_EVENT_LISTENER = 4;

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

interface TextLayerBindingRecord<TNode> {
  id: string;
  node: TNode;
  originalParent: TNode | null;
  originalLocalTransform: V5GCocosNodeTransformSnapshot;
  destroyOnDetach: boolean;
  hideOriginal: boolean;
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

export class V5GCocosPlayer<TNode = Node, TSpriteFrame = SpriteFrame> {
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
  private readonly textBindingsById = new Map<
    string,
    TextLayerBindingRecord<TNode>
  >();
  private readonly particleRuntime: V5GParticleRuntime;
  private readonly hiddenMaskSourceLayerIds = new Set<string>();
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
  private suppressParticleEmission = false;
  private forceStopParticlesAfterSegmentEnd = false;
  private readonly playbackEventIds: string[] = [];
  private readonly playbackEventTimes: number[] = [];
  private readonly playbackEventOnceFlags: boolean[] = [];
  private readonly playbackEventOrders: number[] = [];
  private readonly playbackEventListeners: Array<
    (event: V5GCocosPlaybackEventContext) => void
  > = [];
  private readonly completeListeners: Array<
    (event: V5GCocosPlaybackCompleteContext) => void
  > = [];
  private loopIndex = 0;
  private nextPlaybackEventOrder = 0;
  private nextTextBindingVersion = 0;

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
          const imageRuntime = this.createLayerRuntimeNode(layer, assetsById);
          const {
            asset,
            spriteFrame,
            node: displayNode,
            displayAssets,
            displaySpriteFrames,
          } = imageRuntime;
          const contentWidth = asset?.width ?? project.stage.width;
          const contentHeight = asset?.height ?? project.stage.height;
          driver.setContentSize(displayNode, contentWidth, contentHeight);
          driver.setAnchorPoint(
            displayNode,
            layer.transform.anchorX,
            layer.transform.anchorY,
          );
          if (layer.type === "image" || layer.type === "sequence") {
            driver.applyBlendMode(
              displayNode,
              getCocosBlendModeConfig(layer.blendMode),
            );
          }
          const node = driver.createNode(layer.name);
          const layerContentNode = driver.createNode(`${layer.name} Content`);
          driver.appendChild(node, layerContentNode);
          driver.appendChild(layerContentNode, displayNode);
          driver.appendChild(groupNode, node);

          const textBindingContainer =
            layer.type === "text"
              ? driver.createNode(`${layer.name} Text Binding`)
              : null;
          if (textBindingContainer) {
            driver.setContentSize(
              textBindingContainer,
              project.stage.width,
              project.stage.height,
            );
            driver.setAnchorPoint(textBindingContainer, 0.5, 0.5);
            driver.appendChild(layerContentNode, textBindingContainer);
          }

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

          const chaserLightContainer = driver.createNode(
            `${layer.name} Chaser Light`,
          );
          driver.setContentSize(
            chaserLightContainer,
            project.stage.width,
            project.stage.height,
          );
          driver.setAnchorPoint(chaserLightContainer, 0.5, 0.5);
          driver.appendChild(groupNode, chaserLightContainer);

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

          const needsDeterministicEffects = layer.animations.some(
            (animation) =>
              animation.enabled &&
              isDeterministicEffectAnimationType(animation.type),
          );
          const deterministicEffectContainer = needsDeterministicEffects
            ? driver.createNode(`${layer.name} Deterministic Effects`)
            : null;
          if (deterministicEffectContainer) {
            driver.setContentSize(
              deterministicEffectContainer,
              project.stage.width,
              project.stage.height,
            );
            driver.setAnchorPoint(deterministicEffectContainer, 0.5, 0.5);
            driver.appendChild(groupNode, deterministicEffectContainer);
          }
          const needsLineNode = layer.animations.some(
            (animation) =>
              animation.enabled && animation.type === "speed_lines",
          );
          if (needsLineNode && !driver.createLineNode) {
            throw new Error(
              `Cocos node driver requires createLineNode() for speed_lines animation on layer "${layer.id}".`,
            );
          }
          const deterministicLineNode = needsLineNode
            ? (driver.createLineNode?.(`${layer.name} Deterministic Lines`) ??
              null)
            : null;
          if (deterministicLineNode) {
            driver.setContentSize(
              deterministicLineNode,
              project.stage.width,
              project.stage.height,
            );
            driver.setAnchorPoint(deterministicLineNode, 0.5, 0.5);
            driver.appendChild(
              deterministicEffectContainer as TNode,
              deterministicLineNode,
            );
          }

          const managed: ManagedLayer<TNode, TSpriteFrame> = {
            layer,
            asset,
            node,
            contentNode: layerContentNode,
            displayNode,
            textBindingContainer,
            textBindings: [],
            safeGlowContainer,
            safeGlowNodes: [],
            chaserLightContainer,
            chaserLightNodes: [],
            particleContainer,
            particleNodes: [],
            maskNode: null,
            spriteFrame,
            displayAssets,
            displaySpriteFrames,
            currentDisplayAssetIndex: 0,
            deterministicEffectContainer,
            deterministicEffectNodes: [],
            deterministicEffectFrameCache: new Map(),
            deterministicEffectActiveCount: 0,
            deterministicLineActiveCount: 0,
            deterministicLineNode,
            cardCarouselRuntimes: [],
          };
          this.layers.set(layer.id, managed);
          this.initializeCardCarouselRuntimes(managed, groupNode);
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

      this.initializeLayerMasks();

      driver.appendChild(this.options.root, stage);
      this.stageNode = stage;
      this.renderDeterministicFrame(this.currentTime);
    } catch (error) {
      this.destroyEffectFrameResources();
      driver.destroyNode(stage);
      this.stageNode = null;
      this.contentNode = null;
      this.particleRootNode = null;
      this.layers.clear();
      this.groupNodesById.clear();
      this.slotNodesByKey.clear();
      this.mountedNodesById.clear();
      this.mountedNodesByNode.clear();
      this.textBindingsById.clear();
      this.hiddenMaskSourceLayerIds.clear();
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
    this.suppressParticleEmission = false;
    this.forceStopParticlesAfterSegmentEnd = false;
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

  requestSegmentedPlaybackEnd(
    options?: V5GCocosSegmentedPlaybackEndOptions,
  ): void {
    assertOptionsObject(options, "V5GCocosPlayer.requestSegmentedPlaybackEnd");
    const forceStopParticles = getOptionalBooleanOption(
      options?.forceStopParticles,
      "V5GCocosPlayer.requestSegmentedPlaybackEnd forceStopParticles",
    );
    if (!this.segmentedPlayback) {
      throw new Error("No active V5G segmented playback.");
    }
    this.segmentedPlayback.requestEnd();
    if (forceStopParticles) {
      this.forceStopParticlesAfterSegmentEnd = true;
    }
    this.playbackPhase = this.segmentedPlayback.getPhase();
    if (!this.isPlaying) {
      this.setPlaying(true);
    }
    this.drainPaused = false;
  }

  forceStopAllParticles(options?: V5GCocosForceStopParticlesOptions): void {
    this.assertInitialized("forceStopAllParticles");
    assertOptionsObject(options, "V5GCocosPlayer.forceStopAllParticles");
    const suppressUntilNextPlayback =
      options?.suppressUntilNextPlayback === undefined
        ? true
        : getOptionalBooleanOption(
            options.suppressUntilNextPlayback,
            "V5GCocosPlayer.forceStopAllParticles suppressUntilNextPlayback",
          );
    this.forceStopAllParticlesInternal({
      suppressUntilNextPlayback,
      finishPendingDrain: true,
    });
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

  attachNodeToTextLayer(
    options: V5GCocosAttachNodeToTextLayerOptions<TNode>,
  ): () => void {
    this.assertInitialized("attachNodeToTextLayer");
    const id = normalizeTextLayerBindingId(options.id);
    if (this.textBindingsById.has(id)) {
      throw new Error(`Duplicate V5G Cocos text layer binding id: ${id}.`);
    }
    if (options.node === null || options.node === undefined) {
      throw new Error(
        "V5GCocosPlayer.attachNodeToTextLayer node must be non-null.",
      );
    }
    const managed = this.requireTextManagedLayer(
      options.layerId,
      "attachNodeToTextLayer",
    );
    const container = managed.textBindingContainer;
    if (!container) {
      throw new Error(
        `V5G Cocos text layer "${options.layerId}" has no binding container.`,
      );
    }
    const record = this.attachTextBindingRecord(
      managed,
      id,
      options.node,
      container,
      options.destroyOnDetach === true,
      options.hideOriginal !== false,
    );
    this.applyTextLayerOriginalVisibility(managed);
    this.renderDeterministicFrame(this.currentTime);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const current = this.textBindingsById.get(id);
      if (current?.version === record.version) {
        this.detachTextBindingRecord(managed, current);
      }
    };
  }

  attachTextToTextLayer(
    options: V5GCocosAttachTextToTextLayerOptions,
  ): V5GCocosTextLayerTextBinding {
    this.assertInitialized("attachTextToTextLayer");
    const node = this.options.driver.createTextNode(
      `V5G Text Binding ${options.id}`,
      options.text,
    );
    try {
      const disposeNode = this.attachNodeToTextLayer({
        id: options.id,
        layerId: options.layerId,
        node,
        hideOriginal: options.hideOriginal,
        destroyOnDetach: true,
      });
      return {
        dispose: disposeNode,
        setText: (text: string) => {
          this.options.driver.setText(node, text);
        },
      };
    } catch (error) {
      this.options.driver.destroyNode(node);
      throw error;
    }
  }

  attachProjectAssetToTextLayer(
    options: V5GCocosAttachProjectAssetToTextLayerOptions,
  ): () => void {
    this.assertInitialized("attachProjectAssetToTextLayer");
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
    const node = this.options.driver.createImageNode(
      `V5G Text Image ${asset.id}`,
      resolvedSpriteFrame.spriteFrame,
    );
    try {
      this.configureTextBindingImageNode(node, asset.width, asset.height);
      return this.attachNodeToTextLayer({
        id: options.id,
        layerId: options.layerId,
        node,
        hideOriginal: options.hideOriginal,
        destroyOnDetach: true,
      });
    } catch (error) {
      this.options.driver.destroyNode(node);
      throw error;
    }
  }

  attachSpriteFrameToTextLayer(
    options: V5GCocosAttachSpriteFrameToTextLayerOptions<TSpriteFrame>,
  ): () => void {
    this.assertInitialized("attachSpriteFrameToTextLayer");
    const node = this.options.driver.createImageNode(
      "V5G Text SpriteFrame",
      options.spriteFrame,
    );
    try {
      this.configureTextBindingImageNode(node, options.width, options.height);
      return this.attachNodeToTextLayer({
        id: options.id,
        layerId: options.layerId,
        node,
        hideOriginal: options.hideOriginal,
        destroyOnDetach: true,
      });
    } catch (error) {
      this.options.driver.destroyNode(node);
      throw error;
    }
  }

  getRuntimeDiagnostics(): V5GCocosRuntimeDiagnostics {
    return {
      particleSpriteCount: this.getRenderedParticleCount(),
      chaserLightSpriteCount: this.getRenderedChaserLightCount(),
      maskNodeCount: this.getRenderedMaskNodeCount(),
      textLayerBindingCount: this.textBindingsById.size,
      mountedNodeCount:
        this.mountedNodesByNode.size + this.textBindingsById.size,
      safeGlowSpriteCount: this.getRenderedSafeGlowCount(),
      liveParticleCount: this.particleRuntime.getLiveParticleCount(),
      deterministicEffectSpriteCount:
        this.getRenderedDeterministicEffectCount(),
      deterministicEffectLineCount: this.getRenderedDeterministicLineCount(),
      cardCarouselCardPoolSize: this.getCardCarouselCardPoolSize(),
      cardCarouselSlicePoolSize: this.getCardCarouselSlicePoolSize(),
      visibleCardCarouselCardCount: this.getVisibleCardCarouselCardCount(),
    };
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
    this.clearTextBindings();
  }

  addPlaybackEvent(options: V5GCocosPlaybackEventOptions): () => void {
    if (typeof options.id !== "string" || options.id.length === 0) {
      throw new Error("V5GCocosPlayer.addPlaybackEvent id must be non-empty.");
    }
    if (this.getPlaybackEventIndex(options.id) >= 0) {
      throw new Error(
        `V5GCocosPlayer.addPlaybackEvent id must be unique: ${options.id}.`,
      );
    }
    if (typeof options.listener !== "function") {
      throw new Error(
        "V5GCocosPlayer.addPlaybackEvent listener must be a function.",
      );
    }

    const time = this.normalizePlaybackPoint(
      options.at,
      "V5GCocosPlayer.addPlaybackEvent",
    );
    this.playbackEventIds.push(options.id);
    this.playbackEventTimes.push(time);
    this.playbackEventOnceFlags.push(options.once ?? false);
    this.playbackEventOrders.push(this.nextPlaybackEventOrder);
    this.playbackEventListeners.push(options.listener);
    this.nextPlaybackEventOrder += 1;

    return () => {
      this.removePlaybackEvent(options.id);
    };
  }

  clearPlaybackEvent(id: string): void {
    if (!this.removePlaybackEvent(id)) {
      throw new Error(`V5GCocosPlayer.clearPlaybackEvent unknown id: ${id}.`);
    }
  }

  clearPlaybackEvents(): void {
    this.clearPlaybackEventRecords();
  }

  private getPlaybackEventIndex(id: string): number {
    return this.playbackEventIds.indexOf(id);
  }

  private removePlaybackEvent(id: string): boolean {
    const index = this.getPlaybackEventIndex(id);
    if (index < 0) return false;
    this.playbackEventIds.splice(index, 1);
    this.playbackEventTimes.splice(index, 1);
    this.playbackEventOnceFlags.splice(index, 1);
    this.playbackEventOrders.splice(index, 1);
    this.playbackEventListeners.splice(index, 1);
    return true;
  }

  private clearPlaybackEventRecords(): void {
    this.playbackEventIds.length = 0;
    this.playbackEventTimes.length = 0;
    this.playbackEventOnceFlags.length = 0;
    this.playbackEventOrders.length = 0;
    this.playbackEventListeners.length = 0;
  }

  private getPlaybackEventSnapshots(): NormalizedPlaybackEvent[] {
    const snapshots: NormalizedPlaybackEvent[] = [];
    for (let index = 0; index < this.playbackEventIds.length; index += 1) {
      const id = this.playbackEventIds[index];
      const time = this.playbackEventTimes[index];
      const once = this.playbackEventOnceFlags[index];
      const order = this.playbackEventOrders[index];
      const listener = this.playbackEventListeners[index];
      if (
        typeof id !== "string" ||
        !Number.isFinite(time) ||
        typeof once !== "boolean" ||
        !Number.isFinite(order) ||
        typeof listener !== "function"
      ) {
        throw new Error("V5GCocosPlayer playback event storage is corrupted.");
      }
      snapshots.push([id, time, once, order, listener]);
    }
    return snapshots;
  }

  onPlaybackComplete(
    listener: (event: V5GCocosPlaybackCompleteContext) => void,
  ): () => void {
    if (typeof listener !== "function") {
      throw new Error(
        "V5GCocosPlayer.onPlaybackComplete listener must be a function.",
      );
    }
    if (this.completeListeners.indexOf(listener) < 0) {
      this.completeListeners.push(listener);
    }
    return () => {
      const listenerIndex = this.completeListeners.indexOf(listener);
      if (listenerIndex >= 0) {
        this.completeListeners.splice(listenerIndex, 1);
      }
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
    this.suppressParticleEmission = false;
    this.forceStopParticlesAfterSegmentEnd = false;
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
    this.clearPlaybackEventRecords();
    this.completeListeners.length = 0;
    this.loopIndex = 0;
    this.drainPaused = false;
    this.suppressParticleEmission = false;
    this.forceStopParticlesAfterSegmentEnd = false;
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
    this.suppressParticleEmission = false;
    this.forceStopParticlesAfterSegmentEnd = false;
    this.particleRuntime.reset();
    if (this.currentTime >= this.options.project.stage.duration) {
      this.renderPlaybackFrame(0, 0);
    }
    this.setPlaying(true);
    if (this.currentTime <= PLAYBACK_EPSILON) {
      this.emitPlaybackEventsAtBoundary(0, 0, {
        startTime: 0,
        endTime: this.options.project.stage.duration,
        loop: this.loop,
      });
    }
  }

  private startRangePlayback(options: V5GCocosPlayRangeOptions): void {
    this.assertInitialized();
    const range = this.normalizePlaybackRange(
      options.range,
      "V5GCocosPlayer.playRange",
    );
    const loop = options.loop ?? this.loop;
    this.activeRange = {
      ...range,
      loop,
    };
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "range";
    this.playbackPhase = "start";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.suppressParticleEmission = false;
    this.forceStopParticlesAfterSegmentEnd = false;
    this.particleRuntime.reset();
    this.renderPlaybackFrame(range.startTime, range.startTime);
    this.setPlaying(true);
    this.emitPlaybackEventsAtBoundary(range.startTime, this.loopIndex, {
      ...range,
      loop,
    });
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
    this.suppressParticleEmission = false;
    this.forceStopParticlesAfterSegmentEnd = false;
    this.particleRuntime.reset();
    this.segmentedPlayback = new V5GSegmentedPlaybackSequence(normalized);
    this.renderPlaybackFrame(0, 0);
    this.setPlaying(true);
    this.emitPlaybackEventsAtBoundary(0, 0, {
      startTime: 0,
      endTime: this.options.project.stage.duration,
      loop: false,
    });
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
          this.emitPlaybackEventsAtBoundary(0, 0, boundary);
          if (timeToEnd <= PLAYBACK_EPSILON) break;
          continue;
        }
        if (previousTime >= duration) {
          this.emitPlaybackEventsAtBoundary(duration, 0, boundary);
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
          this.emitPlaybackEventsAtBoundary(
            range.startTime,
            this.loopIndex,
            range,
          );
          if (timeToEnd <= PLAYBACK_EPSILON) break;
          continue;
        }
        if (previousTime >= range.endTime) {
          this.emitPlaybackEventsAtBoundary(
            range.endTime,
            this.loopIndex,
            range,
          );
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
      if (this.forceStopParticlesAfterSegmentEnd) {
        const duration = this.options.project.stage.duration;
        this.setPlaying(false);
        this.pendingComplete = {
          startTime: 0,
          endTime: duration,
          currentTime: duration,
          loopIndex: result.loopIndex,
        };
        this.applyProjectSample(duration);
        this.options.onTimeChange?.(this.currentTime);
        this.forceStopAllParticlesInternal({
          suppressUntilNextPlayback: false,
          finishPendingDrain: false,
        });
        this.playbackPhase = "complete";
        this.segmentedPlayback?.markParticleDrainComplete();
        this.forceStopParticlesAfterSegmentEnd = false;
        const event = this.pendingComplete;
        this.pendingComplete = null;
        if (event) {
          this.emitPlaybackComplete(event);
        }
        return;
      }
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
      this.emitPlaybackEventsAtBoundary(
        segmented.getLoopStartTime(),
        result.loopIndex,
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
    if (this.suppressParticleEmission) {
      const frame = this.particleRuntime.forceStopAll();
      this.renderParticleSamples(frame.particles);
      this.options.onTimeChange?.(this.currentTime);
      this.finishParticleDrain();
      return;
    }
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

  private forceStopAllParticlesInternal(options: {
    suppressUntilNextPlayback: boolean;
    finishPendingDrain: boolean;
  }): void {
    const wasDraining = this.particleRuntime.isDraining();
    const frame = this.particleRuntime.forceStopAll();
    this.renderParticleSamples(frame.particles);
    this.clearParticles();
    this.suppressParticleEmission = options.suppressUntilNextPlayback;
    if (options.finishPendingDrain && wasDraining) {
      this.playbackPhase = "complete";
      this.segmentedPlayback?.markParticleDrainComplete();
      this.forceStopParticlesAfterSegmentEnd = false;
      this.drainPaused = false;
      const event = this.pendingComplete;
      this.pendingComplete = null;
      if (event) {
        this.emitPlaybackComplete(event);
      }
    }
  }

  private finishParticleDrain(): void {
    this.playbackPhase = "complete";
    this.segmentedPlayback?.markParticleDrainComplete();
    this.forceStopParticlesAfterSegmentEnd = false;
    this.clearParticles();
    const event = this.pendingComplete;
    this.pendingComplete = null;
    if (event) {
      this.emitPlaybackComplete(event);
    }
  }

  private renderDeterministicFrame(time: number): void {
    const sampled = this.applyProjectSample(time);
    const frame = this.suppressParticleEmission
      ? this.particleRuntime.forceStopAll()
      : this.particleRuntime.emit(
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
    const frame = this.suppressParticleEmission
      ? this.particleRuntime.forceStopAll()
      : options.liveParticles
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
      this.updateLayerDisplayAsset(managed, sampledProject.time);
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
      const hideAsMaskSource = this.hiddenMaskSourceLayerIds.has(
        sampledLayer.layerId,
      );
      this.options.driver.setActive(managed.node, sampledLayer.visible);
      this.options.driver.setPosition(managed.contentNode, 0, 0);
      this.options.driver.setScale(managed.contentNode, 1, 1);
      this.options.driver.setRotationDegrees(
        managed.contentNode,
        sampledLayer.visualRotation,
      );
      this.options.driver.setOpacity(managed.contentNode, 255);
      this.options.driver.setActive(managed.contentNode, true);
      this.options.driver.setActive(
        managed.displayNode,
        sampledLayer.renderImageDisplay && !hideAsMaskSource,
      );
      this.applyTextLayerOriginalVisibility(managed);
      if (managed.textBindingContainer) {
        this.options.driver.setPosition(managed.textBindingContainer, 0, 0);
        this.options.driver.setScale(managed.textBindingContainer, 1, 1);
        this.options.driver.setRotationDegrees(managed.textBindingContainer, 0);
        this.options.driver.setOpacity(managed.textBindingContainer, 255);
        this.options.driver.setActive(managed.textBindingContainer, true);
      }
      this.updateMaskSample(managed);
      this.renderSafeGlowSamples(managed, sampledLayer, sampledProject.time);
      this.renderChaserLightSamples(managed, sampledLayer, sampledProject.time);
      this.renderDeterministicEffectSamples(
        managed,
        sampledLayer,
        sampledProject.time,
      );
      this.renderCardCarouselSamples(
        managed,
        sampledLayer,
        sampledProject.time,
      );
    }

    return sampledProject;
  }

  private updateLayerDisplayAsset(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    time: number,
  ): void {
    if (managed.layer.type !== "sequence") return;
    const assetId = getLayerDisplayAssetId(managed.layer, time);
    const index = managed.displayAssets.findIndex(
      (asset) => asset.id === assetId,
    );
    if (index < 0) {
      throw new Error(
        `V5G sequence layer "${managed.layer.id}" is missing resolved frame "${String(assetId)}".`,
      );
    }
    if (index === managed.currentDisplayAssetIndex) return;
    const asset = managed.displayAssets[index];
    const spriteFrame = managed.displaySpriteFrames[index];
    managed.asset = asset;
    managed.spriteFrame = spriteFrame;
    managed.currentDisplayAssetIndex = index;
    this.setRuntimeSpriteFrame(managed.displayNode, spriteFrame, "sequence");
    this.options.driver.setContentSize(
      managed.displayNode,
      asset.width,
      asset.height,
    );
  }

  private renderDeterministicEffectSamples(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    sampledLayer: SampledLayerState,
    time: number,
  ): void {
    if (
      !sampledLayer.hasActiveDeterministicEffect ||
      !managed.asset ||
      !managed.spriteFrame
    ) {
      this.setDeterministicEffectActiveCount(managed, 0);
      this.updateRuntimeLines(managed.deterministicLineNode, []);
      managed.deterministicLineActiveCount = 0;
      return;
    }
    const textureSize = getExpectedSpriteFrameSize(managed.asset);
    const samples = sampleDeterministicEffectSpritesForLayer(
      managed.layer,
      sampledLayer,
      textureSize,
      time,
    );
    const spriteSamples = samples.filter(
      (sample) => sample.kind !== "speed_line",
    );
    const lineSamples = samples.filter(
      (
        sample,
      ): sample is Extract<
        VNIDeterministicEffectSample,
        { kind: "speed_line" }
      > => sample.kind === "speed_line",
    );
    this.ensureDeterministicEffectPool(managed, spriteSamples.length);
    this.setDeterministicEffectActiveCount(managed, spriteSamples.length);
    const emitter = v5gTransformToCocosPosition(sampledLayer.transform);
    for (let index = 0; index < spriteSamples.length; index += 1) {
      const sample = spriteSamples[index];
      const node = managed.deterministicEffectNodes[index];
      let displayScaleX = sample.scaleX;
      let displayScaleY = sample.scaleY;
      if (sample.kind === "wave_distort_slice") {
        const frameKey = [
          managed.currentDisplayAssetIndex,
          sample.rows,
          sample.row,
          sample.frameX,
          sample.frameY,
          sample.frameWidth,
          sample.frameHeight,
        ].join(":");
        let frame = managed.deterministicEffectFrameCache.get(frameKey);
        if (!frame) {
          frame = this.createRuntimeSpriteFrameRegion(managed.spriteFrame, {
            x: sample.frameX,
            y: sample.frameY,
            width: sample.frameWidth,
            height: sample.frameHeight,
          });
          managed.deterministicEffectFrameCache.set(frameKey, frame);
        }
        this.setRuntimeSpriteFrame(node, frame, "wave_distort");
        this.options.driver.setContentSize(
          node,
          sample.frameWidth,
          sample.frameHeight,
        );
        displayScaleX *= managed.asset.width / textureSize.width;
        displayScaleY *= managed.asset.height / textureSize.height;
        this.options.driver.setAnchorPoint(node, 0.5, 0.5);
      } else {
        this.setRuntimeSpriteFrame(
          node,
          managed.spriteFrame,
          "deterministic effect",
        );
        this.options.driver.setContentSize(
          node,
          sample.type === "energy_ring" || sample.type === "slash_light"
            ? managed.asset.width
            : textureSize.width,
          sample.type === "energy_ring" || sample.type === "slash_light"
            ? managed.asset.height
            : textureSize.height,
        );
        this.options.driver.setAnchorPoint(
          node,
          sample.anchorX,
          sample.anchorY,
        );
      }
      this.options.driver.setPosition(
        node,
        emitter.x + sample.x,
        emitter.y - sample.y,
      );
      this.options.driver.setScale(node, displayScaleX, displayScaleY);
      this.options.driver.setRotationDegrees(
        node,
        (-sample.rotation * 180) / Math.PI,
      );
      this.options.driver.setOpacity(node, opacityToCocosOpacity(sample.alpha));
      this.options.driver.applyBlendMode(
        node,
        getCocosBlendModeConfig(sample.blendMode),
      );
      this.options.driver.setActive(node, true);
    }
    this.updateRuntimeLines(
      managed.deterministicLineNode,
      lineSamples.map((sample) => ({
        x1: emitter.x + sample.x1,
        y1: emitter.y - sample.y1,
        x2: emitter.x + sample.x2,
        y2: emitter.y - sample.y2,
        width: sample.lineWidth,
        opacity: sample.alpha,
      })),
    );
    if (lineSamples.length > 0) {
      this.applyRuntimeLineBlendMode(
        managed.deterministicLineNode,
        getCocosBlendModeConfig(lineSamples[0].blendMode),
      );
    }
    managed.deterministicLineActiveCount = lineSamples.length;
  }

  private ensureDeterministicEffectPool(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    size: number,
  ): void {
    if (!managed.spriteFrame && size > 0) {
      throw new Error(
        `V5G deterministic effect layer "${managed.layer.id}" requires a SpriteFrame.`,
      );
    }
    if (!managed.deterministicEffectContainer && size > 0) {
      throw new Error(
        `V5G deterministic effect layer "${managed.layer.id}" is missing its runtime container.`,
      );
    }
    while (managed.deterministicEffectNodes.length < size) {
      const node = this.options.driver.createImageNode(
        `V5G Deterministic Effect ${managed.layer.id}`,
        managed.spriteFrame as TSpriteFrame,
      );
      this.options.driver.appendChild(
        managed.deterministicEffectContainer as TNode,
        node,
      );
      managed.deterministicEffectNodes.push(node);
    }
  }

  private setDeterministicEffectActiveCount(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    size: number,
  ): void {
    managed.deterministicEffectActiveCount = size;
    for (
      let index = size;
      index < managed.deterministicEffectNodes.length;
      index += 1
    ) {
      this.options.driver.setActive(
        managed.deterministicEffectNodes[index],
        false,
      );
    }
  }

  private initializeCardCarouselRuntimes(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    groupNode: TNode,
  ): void {
    if (managed.displaySpriteFrames.length === 0) return;
    for (const animation of managed.layer.animations) {
      if (!animation.enabled || animation.type !== "card_carousel_3d") continue;
      const prepared = prepareCardCarousel3D(animation);
      const container = this.options.driver.createNode(
        `V5G Card Carousel ${managed.layer.id} ${animation.id}`,
      );
      this.options.driver.setContentSize(
        container,
        this.options.project.stage.width,
        this.options.project.stage.height,
      );
      this.options.driver.setAnchorPoint(container, 0.5, 0.5);
      this.options.driver.appendChild(groupNode, container);
      const cardContainers: TNode[] = [];
      const sliceNodes: TNode[][] = [];
      const sliceFrames: TSpriteFrame[][] = [];
      const pendingFrames: TSpriteFrame[] = [];
      try {
        for (
          let cardIndex = 0;
          cardIndex < prepared.cardCount;
          cardIndex += 1
        ) {
          const cardNode = this.options.driver.createNode(
            `V5G Card ${managed.layer.id} ${cardIndex}`,
          );
          this.options.driver.appendChild(container, cardNode);
          const textureIndex = cardIndex % managed.displaySpriteFrames.length;
          const sourceFrame = managed.displaySpriteFrames[textureIndex];
          const asset = managed.displayAssets[textureIndex];
          const sourceSize = getExpectedSpriteFrameSize(asset);
          const nodes: TNode[] = [];
          const frames: TSpriteFrame[] = [];
          for (
            let sliceIndex = 0;
            sliceIndex < prepared.slices;
            sliceIndex += 1
          ) {
            const x0 = (sliceIndex / prepared.slices) * sourceSize.width;
            const x1 = ((sliceIndex + 1) / prepared.slices) * sourceSize.width;
            const frame = this.createRuntimeSpriteFrameRegion(sourceFrame, {
              x: x0,
              y: 0,
              width: x1 - x0,
              height: sourceSize.height,
            });
            pendingFrames.push(frame);
            const node = this.options.driver.createImageNode(
              `V5G Card Slice ${managed.layer.id} ${cardIndex} ${sliceIndex}`,
              frame,
            );
            this.options.driver.setContentSize(
              node,
              x1 - x0,
              sourceSize.height,
            );
            this.options.driver.setAnchorPoint(node, 0.5, 0.5);
            this.options.driver.applyBlendMode(
              node,
              getCocosBlendModeConfig(managed.layer.blendMode),
            );
            this.options.driver.appendChild(cardNode, node);
            nodes.push(node);
            frames.push(frame);
          }
          cardContainers.push(cardNode);
          sliceNodes.push(nodes);
          sliceFrames.push(frames);
        }
        managed.cardCarouselRuntimes.push({
          animation,
          prepared,
          output: createCardCarousel3DSampleBuffer(prepared),
          container,
          cardContainers,
          sliceNodes,
          sliceFrames,
          textureInfos: managed.displayAssets.map((asset) => {
            const size = getExpectedSpriteFrameSize(asset);
            return {
              width: size.width,
              height: size.height,
              frameX: 0,
              frameY: 0,
              frameWidth: size.width,
              frameHeight: size.height,
            };
          }),
          visibleCardCount: 0,
        });
        pendingFrames.length = 0;
      } catch (error) {
        for (const frame of pendingFrames) {
          this.destroyRuntimeSpriteFrameRegion(frame);
        }
        throw error;
      }
    }
  }

  private renderCardCarouselSamples(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    sampledLayer: SampledLayerState,
    time: number,
  ): void {
    for (const runtime of managed.cardCarouselRuntimes) {
      const progress = getCardCarousel3DProgress(runtime.animation, time);
      if (
        progress === null ||
        !sampledLayer.hasActiveCardCarousel3D ||
        sampledLayer.baseOpacity <= 0
      ) {
        this.options.driver.setActive(runtime.container, false);
        runtime.visibleCardCount = 0;
        continue;
      }
      sampleCardCarousel3D(
        runtime.prepared,
        {
          progress,
          emitterX: 0,
          emitterY: 0,
          layerOpacity: sampledLayer.baseOpacity,
          transform: sampledLayer.transform,
          blendMode: sampledLayer.blendMode,
          textures: runtime.textureInfos,
        },
        runtime.output,
      );
      this.options.driver.setActive(runtime.container, true);
      runtime.visibleCardCount = runtime.output.visibleCardCount;
      const emitter = v5gTransformToCocosPosition(sampledLayer.transform);
      for (const cardNode of runtime.cardContainers) {
        this.options.driver.setActive(cardNode, false);
      }
      for (
        let drawIndex = 0;
        drawIndex < runtime.output.visibleCardCount;
        drawIndex += 1
      ) {
        const cardIndex = runtime.output.drawOrder[drawIndex];
        const sample = runtime.output.cards[cardIndex];
        const cardNode = runtime.cardContainers[cardIndex];
        this.options.driver.setActive(cardNode, true);
        this.setRuntimeSiblingIndex(cardNode, drawIndex);
        this.options.driver.setPosition(
          cardNode,
          emitter.x + sample.x,
          emitter.y - sample.y,
        );
        this.options.driver.setRotationDegrees(
          cardNode,
          (-sample.rotation * 180) / Math.PI,
        );
        this.options.driver.setOpacity(
          cardNode,
          opacityToCocosOpacity(sample.alpha),
        );
        const nodes = runtime.sliceNodes[cardIndex];
        for (let sliceIndex = 0; sliceIndex < nodes.length; sliceIndex += 1) {
          const slice = sample.slices[sliceIndex];
          const node = nodes[sliceIndex];
          this.options.driver.setPosition(node, slice.x, -slice.y);
          this.options.driver.setScale(node, slice.scaleX, slice.scaleY);
          this.setRuntimeImageColor(
            node,
            (slice.tint >> 16) & 0xff,
            (slice.tint >> 8) & 0xff,
            slice.tint & 0xff,
          );
          this.options.driver.setActive(node, true);
        }
      }
    }
  }

  private renderSafeGlowSamples(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    sampledLayer: SampledLayerState,
    time: number,
  ): void {
    if (!managed.asset || !managed.spriteFrame) {
      this.clearSafeGlowNodesForLayer(managed);
      return;
    }
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
    if (!managed.asset) return;
    if (managed.layer.type === "sequence" && managed.spriteFrame) {
      this.setRuntimeSpriteFrame(
        node,
        managed.spriteFrame,
        "sequence safe_glow",
      );
    }
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

  private renderChaserLightSamples(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    sampledLayer: SampledLayerState,
    time: number,
  ): void {
    if (!managed.asset || !managed.spriteFrame) {
      this.clearChaserLightNodesForLayer(managed);
      return;
    }
    const chasers = sampleChaserLightSpritesForLayer(
      managed.layer,
      sampledLayer,
      {
        width: managed.asset.width,
        height: managed.asset.height,
      },
      time,
    );

    while (managed.chaserLightNodes.length < chasers.length) {
      const node = this.options.driver.createImageNode(
        `V5G Chaser Light ${managed.layer.id}`,
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
      this.options.driver.appendChild(managed.chaserLightContainer, node);
      managed.chaserLightNodes.push(node);
    }

    for (let index = 0; index < chasers.length; index += 1) {
      const chaser = chasers[index];
      const node = managed.chaserLightNodes[index];
      this.applyChaserLightSample(node, managed, sampledLayer, chaser);
    }

    while (managed.chaserLightNodes.length > chasers.length) {
      const node = managed.chaserLightNodes.pop();
      if (node !== undefined) this.options.driver.destroyNode(node);
    }
  }

  private applyChaserLightSample(
    node: TNode,
    managed: ManagedLayer<TNode, TSpriteFrame>,
    sampledLayer: SampledLayerState,
    chaser: VNIChaserLightSpriteSample,
  ): void {
    if (managed.layer.type === "sequence" && managed.spriteFrame) {
      this.setRuntimeSpriteFrame(
        node,
        managed.spriteFrame,
        "sequence chaser_light",
      );
    }
    if (managed.asset) {
      this.options.driver.setContentSize(
        node,
        managed.asset.width,
        managed.asset.height,
      );
    }
    const position = v5gTransformToCocosPosition(sampledLayer.transform);
    this.options.driver.setPosition(
      node,
      position.x + chaser.x,
      position.y - chaser.y,
    );
    this.options.driver.setScale(node, chaser.scale, chaser.scale);
    this.options.driver.setRotationDegrees(
      node,
      (-chaser.rotation * 180) / Math.PI,
    );
    this.options.driver.setOpacity(node, opacityToCocosOpacity(chaser.alpha));
    this.options.driver.applyBlendMode(
      node,
      getCocosBlendModeConfig(chaser.blendMode),
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
      if (!managed.asset) {
        throw new Error(
          `V5G particle layer "${sampledLayer.layerId}" requires an image asset.`,
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
      if (!managed.asset || !managed.spriteFrame) {
        while (managed.particleNodes.length > 0) {
          const node = managed.particleNodes.pop();
          if (node !== undefined) this.options.driver.destroyNode(node);
        }
        continue;
      }
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
        if (managed.layer.type === "sequence" && managed.spriteFrame) {
          this.setRuntimeSpriteFrame(
            node,
            managed.spriteFrame,
            "sequence particle",
          );
        }
        this.options.driver.setContentSize(
          node,
          managed.asset.width,
          managed.asset.height,
        );
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

  private createLayerRuntimeNode(
    layer: V5GLayerConfig,
    assetsById: ReadonlyMap<string, V5GAssetConfig>,
  ): {
    asset: V5GAssetConfig | null;
    spriteFrame: TSpriteFrame | null;
    node: TNode;
    displayAssets: readonly V5GAssetConfig[];
    displaySpriteFrames: readonly TSpriteFrame[];
  } {
    if (layer.type === "text") {
      return {
        asset: null,
        spriteFrame: null,
        node: this.options.driver.createTextNode(layer.name, layer.text ?? ""),
        displayAssets: [],
        displaySpriteFrames: [],
      };
    }
    const assetIds =
      layer.type === "sequence"
        ? (layer.sequence?.frameAssetIds ?? [])
        : layer.assetId
          ? [layer.assetId]
          : [];
    if (assetIds.length === 0) {
      throw new Error(
        `V5G Cocos ${layer.type} layer "${layer.id}" requires image assets.`,
      );
    }
    const displayAssets = assetIds.map((assetId) => {
      const asset = assetsById.get(assetId);
      if (!asset) {
        throw new Error(
          `V5G Cocos layer "${layer.id}" references missing asset "${assetId}".`,
        );
      }
      return asset;
    });
    const displaySpriteFrames = displayAssets.map((asset) => {
      const resolved = this.resolveSpriteFrame(asset);
      if (resolved.shouldValidateSize) {
        this.assertSpriteFrameSize(asset, resolved.spriteFrame);
      }
      return resolved.spriteFrame;
    });
    const asset = displayAssets[0];
    const spriteFrame = displaySpriteFrames[0];
    return {
      asset,
      spriteFrame,
      node: this.options.driver.createImageNode(layer.name, spriteFrame),
      displayAssets,
      displaySpriteFrames,
    };
  }

  private initializeLayerMasks(): void {
    this.hiddenMaskSourceLayerIds.clear();
    for (const managed of this.layers.values()) {
      const mask = managed.layer.mask;
      if (!mask?.enabled) continue;
      if (mask.compositeMode === "precompose_light_alpha") {
        throw new Error(
          `Cocos runtime cannot support VNI mask compositeMode "precompose_light_alpha" for layer "${managed.layer.id}" with sourceLayerId "${mask.sourceLayerId}" through the copyable standalone runtime. Use "legacy_alpha" or provide a dedicated Cocos mask adapter.`,
        );
      }
      if (!mask.sourceLayerId) {
        throw new Error(
          `VNI mask on layer "${managed.layer.id}" requires sourceLayerId when enabled.`,
        );
      }
      const source = this.layers.get(mask.sourceLayerId);
      if (!source) {
        throw new Error(
          `VNI mask on layer "${managed.layer.id}" references missing source layer "${mask.sourceLayerId}".`,
        );
      }
      const createMask = this.options.driver.createAlphaMaskNode;
      if (!createMask) {
        throw new Error(
          `Cocos node driver does not support VNI legacy_alpha mask for layer "${managed.layer.id}" with sourceLayerId "${mask.sourceLayerId}".`,
        );
      }
      const maskNode = createMask(
        `V5G Mask ${managed.layer.id}`,
        source.displayNode,
        managed.node,
      );
      const groupNode = this.groupNodesById.get(managed.layer.groupId ?? "");
      if (!groupNode) {
        throw new Error(
          `Missing V5G group node for masked layer "${managed.layer.id}".`,
        );
      }
      this.options.driver.appendChild(groupNode, maskNode);
      managed.maskNode = maskNode;
      if (!mask.showSourceLayer) {
        this.hiddenMaskSourceLayerIds.add(mask.sourceLayerId);
      }
    }
  }

  private updateMaskSample(managed: ManagedLayer<TNode, TSpriteFrame>): void {
    if (!managed.maskNode || !managed.layer.mask?.sourceLayerId) return;
    const source = this.layers.get(managed.layer.mask.sourceLayerId);
    if (!source) {
      throw new Error(
        `Missing VNI mask source layer "${managed.layer.mask.sourceLayerId}" for "${managed.layer.id}".`,
      );
    }
    this.options.driver.updateAlphaMaskNode?.(
      managed.maskNode,
      source.displayNode,
      managed.node,
    );
  }

  private configureTextBindingImageNode(
    node: TNode,
    width: number,
    height: number,
  ): void {
    this.assertPositiveFiniteNumber(width, "text layer image width");
    this.assertPositiveFiniteNumber(height, "text layer image height");
    this.options.driver.setContentSize(node, width, height);
    this.options.driver.setAnchorPoint(node, 0.5, 0.5);
    this.options.driver.setPosition(node, 0, 0);
    this.options.driver.setScale(node, 1, 1);
    this.options.driver.setRotationDegrees(node, 0);
    this.options.driver.setOpacity(node, 255);
    this.options.driver.setActive(node, true);
    this.options.driver.applyBlendMode(node, getCocosBlendModeConfig("normal"));
  }

  private setRuntimeSpriteFrame(
    node: TNode,
    spriteFrame: TSpriteFrame,
    context: string,
  ): void {
    const setSpriteFrame = this.options.driver.setImageSpriteFrame;
    if (!setSpriteFrame) {
      throw new Error(
        `Cocos node driver requires setImageSpriteFrame() for ${context}.`,
      );
    }
    setSpriteFrame(node, spriteFrame);
  }

  private createRuntimeSpriteFrameRegion(
    spriteFrame: TSpriteFrame,
    region: V5GSpriteFrameRegion,
  ): TSpriteFrame {
    const createRegion = this.options.driver.createSpriteFrameRegion;
    const destroyRegion = this.options.driver.destroySpriteFrameRegion;
    if (!createRegion || !destroyRegion) {
      throw new Error(
        "Cocos node driver requires createSpriteFrameRegion() and destroySpriteFrameRegion() for sliced VNI effects.",
      );
    }
    return createRegion(spriteFrame, region);
  }

  private destroyRuntimeSpriteFrameRegion(spriteFrame: TSpriteFrame): void {
    const destroyRegion = this.options.driver.destroySpriteFrameRegion;
    if (!destroyRegion) {
      throw new Error(
        "Cocos node driver requires destroySpriteFrameRegion() for sliced VNI effects.",
      );
    }
    destroyRegion(spriteFrame);
  }

  private setRuntimeSiblingIndex(node: TNode, index: number): void {
    const setSiblingIndex = this.options.driver.setSiblingIndex;
    if (!setSiblingIndex) {
      throw new Error(
        "Cocos node driver requires setSiblingIndex() for card_carousel_3d depth order.",
      );
    }
    setSiblingIndex(node, index);
  }

  private setRuntimeImageColor(
    node: TNode,
    red: number,
    green: number,
    blue: number,
  ): void {
    const setImageColor = this.options.driver.setImageColor;
    if (!setImageColor) {
      throw new Error(
        "Cocos node driver requires setImageColor() for card_carousel_3d shading.",
      );
    }
    setImageColor(node, red, green, blue);
  }

  private updateRuntimeLines(
    node: TNode | null,
    lines: readonly V5GCocosLineSample[],
  ): void {
    if (!node) {
      if (lines.length > 0) {
        throw new Error(
          "Cocos speed_lines runtime requires a preallocated line node.",
        );
      }
      return;
    }
    const updateLines = this.options.driver.updateLines;
    if (!updateLines) {
      throw new Error(
        "Cocos node driver requires updateLines() for speed_lines animation.",
      );
    }
    updateLines(node, lines);
  }

  private applyRuntimeLineBlendMode(
    node: TNode | null,
    config: ReturnType<typeof getCocosBlendModeConfig>,
  ): void {
    if (!node) {
      throw new Error("Cocos speed_lines runtime requires a line node.");
    }
    const applyBlendMode = this.options.driver.applyLineBlendMode;
    if (!applyBlendMode) {
      throw new Error(
        "Cocos node driver requires applyLineBlendMode() for speed_lines animation.",
      );
    }
    applyBlendMode(node, config);
  }

  private attachTextBindingRecord(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    id: string,
    node: TNode,
    container: TNode,
    destroyOnDetach: boolean,
    hideOriginal: boolean,
  ): TextLayerBindingRecord<TNode> {
    const originalParent = this.options.driver.getParent(node);
    const record: TextLayerBindingRecord<TNode> = {
      id,
      node,
      originalParent,
      originalLocalTransform: this.options.driver.captureLocalTransform(node),
      destroyOnDetach,
      hideOriginal,
      version: this.nextTextBindingVersion,
    };
    this.nextTextBindingVersion += 1;
    this.options.driver.appendChild(container, node);
    this.options.driver.setPosition(node, 0, 0);
    this.options.driver.setScale(node, 1, 1);
    this.options.driver.setRotationDegrees(node, 0);
    this.options.driver.setOpacity(node, 255);
    this.options.driver.setActive(node, true);
    managed.textBindings.push(record);
    this.textBindingsById.set(id, record);
    return record;
  }

  private detachTextBindingRecord(
    managed: ManagedLayer<TNode, TSpriteFrame>,
    record: TextLayerBindingRecord<TNode>,
  ): void {
    managed.textBindings = managed.textBindings.filter(
      (candidate) => candidate !== record,
    );
    this.textBindingsById.delete(record.id);
    if (record.destroyOnDetach) {
      this.options.driver.destroyNode(record.node);
    } else {
      const parent = this.options.driver.getParent(record.node);
      if (parent) {
        this.options.driver.removeChild(parent, record.node);
      }
      if (
        record.originalParent !== null &&
        this.isDriverNodeValid(record.originalParent)
      ) {
        this.options.driver.appendChild(record.originalParent, record.node);
      }
      this.options.driver.restoreLocalTransform(
        record.node,
        record.originalLocalTransform,
      );
    }
    this.applyTextLayerOriginalVisibility(managed);
    if (this.stageNode !== null) {
      this.renderDeterministicFrame(this.currentTime);
    }
  }

  private clearTextBindings(): void {
    for (const managed of this.layers.values()) {
      for (const binding of [...managed.textBindings]) {
        this.detachTextBindingRecord(managed, binding);
      }
    }
    this.textBindingsById.clear();
  }

  private applyTextLayerOriginalVisibility(
    managed: ManagedLayer<TNode, TSpriteFrame>,
  ): void {
    if (managed.layer.type !== "text") return;
    const shouldHideOriginal = managed.textBindings.some(
      (binding) => binding.hideOriginal,
    );
    if (shouldHideOriginal) {
      this.options.driver.setActive(managed.displayNode, false);
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
    const events = this.getPlaybackEventSnapshots()
      .filter(
        (event) =>
          event[PLAYBACK_EVENT_TIME] >= boundary.startTime &&
          event[PLAYBACK_EVENT_TIME] <= boundary.endTime + PLAYBACK_EPSILON &&
          event[PLAYBACK_EVENT_TIME] > previousTime &&
          event[PLAYBACK_EVENT_TIME] <= currentTime + PLAYBACK_EPSILON,
      )
      .sort(
        (a, b) =>
          a[PLAYBACK_EVENT_TIME] - b[PLAYBACK_EVENT_TIME] ||
          a[PLAYBACK_EVENT_ORDER] - b[PLAYBACK_EVENT_ORDER],
      );

    this.dispatchPlaybackEvents(events, previousTime, currentTime, loopIndex);
  }

  private emitPlaybackEventsAtBoundary(
    time: number,
    loopIndex: number,
    boundary: PlaybackBoundary,
  ): void {
    const events = this.getPlaybackEventSnapshots()
      .filter(
        (event) =>
          event[PLAYBACK_EVENT_TIME] >= boundary.startTime &&
          event[PLAYBACK_EVENT_TIME] <= boundary.endTime + PLAYBACK_EPSILON &&
          event[PLAYBACK_EVENT_TIME] === time,
      )
      .sort(
        (a, b) =>
          a[PLAYBACK_EVENT_TIME] - b[PLAYBACK_EVENT_TIME] ||
          a[PLAYBACK_EVENT_ORDER] - b[PLAYBACK_EVENT_ORDER],
      );

    this.dispatchPlaybackEvents(events, time, time, loopIndex);
  }

  private dispatchPlaybackEvents(
    events: readonly NormalizedPlaybackEvent[],
    previousTime: number,
    currentTime: number,
    loopIndex: number,
  ): void {
    for (const event of events) {
      const id = event[PLAYBACK_EVENT_ID];
      const time = event[PLAYBACK_EVENT_TIME];
      const once = event[PLAYBACK_EVENT_ONCE];
      if (once) {
        this.removePlaybackEvent(id);
      }
      event[PLAYBACK_EVENT_LISTENER]({
        id,
        time,
        previousTime,
        currentTime,
        loopIndex,
      });
    }
  }

  private emitPlaybackComplete(context: V5GCocosPlaybackCompleteContext): void {
    const listeners = this.completeListeners.slice();
    for (let index = 0; index < listeners.length; index += 1) {
      const listener = listeners[index];
      if (typeof listener !== "function") continue;
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
    this.suppressParticleEmission = false;
    this.forceStopParticlesAfterSegmentEnd = false;
    this.particleRuntime.reset();
    this.setPlaying(false);
  }

  private destroyManagedNodes(): void {
    this.clearMountedNodes();
    this.clearSafeGlowNodes();
    this.clearChaserLightNodes();
    this.clearParticles();
    this.clearMaskNodes();
    this.destroyEffectFrameResources();
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
    this.textBindingsById.clear();
    this.hiddenMaskSourceLayerIds.clear();
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

  private requireTextManagedLayer(
    layerId: string,
    apiName: string,
  ): ManagedLayer<TNode, TSpriteFrame> {
    const normalizedLayerId = normalizeLayerId(layerId, apiName);
    const managed = this.layers.get(normalizedLayerId);
    if (!managed) {
      throw new Error(`Unknown V5G text layer id: ${normalizedLayerId}.`);
    }
    if (managed.layer.type !== "text") {
      throw new Error(
        `V5GCocosPlayer.${apiName} requires a text layer, got "${managed.layer.type}" for "${normalizedLayerId}".`,
      );
    }
    return managed;
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
      this.clearSafeGlowNodesForLayer(managed);
    }
  }

  private clearSafeGlowNodesForLayer(
    managed: ManagedLayer<TNode, TSpriteFrame>,
  ): void {
    while (managed.safeGlowNodes.length > 0) {
      const node = managed.safeGlowNodes.pop();
      if (node !== undefined) this.options.driver.destroyNode(node);
    }
  }

  private clearChaserLightNodes(): void {
    for (const managed of this.layers.values()) {
      this.clearChaserLightNodesForLayer(managed);
    }
  }

  private clearChaserLightNodesForLayer(
    managed: ManagedLayer<TNode, TSpriteFrame>,
  ): void {
    while (managed.chaserLightNodes.length > 0) {
      const node = managed.chaserLightNodes.pop();
      if (node !== undefined) this.options.driver.destroyNode(node);
    }
  }

  private clearMaskNodes(): void {
    for (const managed of this.layers.values()) {
      if (managed.maskNode) {
        this.options.driver.clearAlphaMask?.(managed.node, managed.maskNode);
        this.options.driver.destroyNode(managed.maskNode);
        managed.maskNode = null;
      }
    }
  }

  private destroyEffectFrameResources(): void {
    for (const managed of this.layers.values()) {
      for (const frame of managed.deterministicEffectFrameCache.values()) {
        this.destroyRuntimeSpriteFrameRegion(frame);
      }
      managed.deterministicEffectFrameCache.clear();
      for (const runtime of managed.cardCarouselRuntimes) {
        for (const frames of runtime.sliceFrames) {
          for (const frame of frames) {
            this.destroyRuntimeSpriteFrameRegion(frame);
          }
        }
      }
      managed.cardCarouselRuntimes.length = 0;
    }
  }

  private getRenderedParticleCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      count += managed.particleNodes.length;
    }
    return count;
  }

  private getRenderedSafeGlowCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      count += managed.safeGlowNodes.length;
    }
    return count;
  }

  private getRenderedChaserLightCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      count += managed.chaserLightNodes.length;
    }
    return count;
  }

  private getRenderedDeterministicEffectCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      count += managed.deterministicEffectActiveCount;
    }
    return count;
  }

  private getRenderedDeterministicLineCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      count += managed.deterministicLineActiveCount;
    }
    return count;
  }

  private getCardCarouselCardPoolSize(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      for (const runtime of managed.cardCarouselRuntimes) {
        count += runtime.cardContainers.length;
      }
    }
    return count;
  }

  private getCardCarouselSlicePoolSize(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      for (const runtime of managed.cardCarouselRuntimes) {
        for (const slices of runtime.sliceNodes) count += slices.length;
      }
    }
    return count;
  }

  private getVisibleCardCarouselCardCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      for (const runtime of managed.cardCarouselRuntimes) {
        count += runtime.visibleCardCount;
      }
    }
    return count;
  }

  private getRenderedMaskNodeCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      if (managed.maskNode) count += 1;
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

function assertOptionsObject(options: unknown, apiName: string): void {
  if (
    options !== undefined &&
    (options === null || typeof options !== "object" || Array.isArray(options))
  ) {
    throw new Error(`${apiName} options must be an object.`);
  }
}

function getOptionalBooleanOption(value: unknown, field: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }
  return value;
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

function normalizeTextLayerBindingId(id: string): string {
  if (typeof id !== "string") {
    throw new Error("V5G Cocos text layer binding id must be a string.");
  }
  const normalized = id.trim();
  if (normalized.length === 0) {
    throw new Error("V5G Cocos text layer binding id must be non-empty.");
  }
  return normalized;
}

function normalizeLayerId(layerId: string, apiName: string): string {
  if (typeof layerId !== "string") {
    throw new Error(`V5GCocosPlayer.${apiName} layerId must be a string.`);
  }
  const normalized = layerId.trim();
  if (normalized.length === 0) {
    throw new Error(`V5GCocosPlayer.${apiName} layerId must be non-empty.`);
  }
  return normalized;
}
