import { sampleProjectAtTime } from "../core/project-sampler.js";
import { sampleParticleSpritesForLayer } from "../core/particle-sampler.js";
import { validateCocosV5GProject, parseColorHex } from "../core/validation.js";
import { getCocosBlendModeConfig } from "./blend-mode.js";
import {
  opacityToCocosOpacity,
  v5gTransformToCocosPosition,
} from "./coordinates.js";
import type { V5GAssetConfig, V5GLayerConfig } from "../core/types.js";
import type {
  V5GCocosPlaybackCompleteContext,
  V5GCocosPlaybackEventContext,
  V5GCocosPlaybackEventOptions,
  V5GCocosPlaybackPoint,
  V5GCocosPlaybackRange,
  V5GCocosPlayerOptions,
  V5GCocosPlayRangeOptions,
} from "./types.js";

interface ManagedLayer<TNode, TSpriteFrame> {
  layer: V5GLayerConfig;
  asset: V5GAssetConfig;
  node: TNode;
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
  private stageNode: TNode | null = null;
  private contentNode: TNode | null = null;
  private particleRootNode: TNode | null = null;
  private backgroundNode: TNode | null = null;
  private readonly particleNodes: TNode[] = [];
  private currentTime = 0;
  private isPlaying = false;
  private loop: boolean;
  private activeRange: PlaybackBoundary | null = null;
  private readonly playbackEvents = new Map<string, NormalizedPlaybackEvent>();
  private readonly completeListeners = new Set<
    (event: V5GCocosPlaybackCompleteContext) => void
  >();
  private loopIndex = 0;
  private nextPlaybackEventOrder = 0;

  constructor(options: V5GCocosPlayerOptions<TNode, TSpriteFrame>) {
    this.options = options;
    this.loop = options.loop ?? true;
  }

  get time(): number {
    return this.currentTime;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  init(): void {
    this.destroyManagedNodes();
    validateCocosV5GProject(this.options.project);

    const driver = this.options.driver;
    const project = this.options.project;
    const stage = driver.createNode("V5G Stage");

    try {
      driver.setContentSize(stage, project.stage.width, project.stage.height);
      driver.setAnchorPoint(stage, 0.5, 0.5);

      const backgroundColor = parseColorHex(project.stage.backgroundColor);
      const background = driver.createBackgroundNode(
        "V5G Background",
        backgroundColor,
        project.stage.width,
        project.stage.height,
      );
      driver.appendChild(stage, background);
      this.backgroundNode = background;

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
      for (const layer of project.layers) {
        const asset = this.requireImageAsset(layer, assetsById);
        const spriteFrame = this.options.assets.getSpriteFrame(
          asset.path,
          asset.id,
        );
        if (spriteFrame === null) {
          throw new Error(
            `Missing Cocos SpriteFrame for V5G asset "${asset.id}" at "${asset.path}".`,
          );
        }
        this.assertSpriteFrameSize(asset, spriteFrame);

        const node = driver.createImageNode(layer.name, spriteFrame);
        driver.setContentSize(node, asset.width, asset.height);
        driver.setAnchorPoint(
          node,
          layer.transform.anchorX,
          layer.transform.anchorY,
        );
        driver.applyBlendMode(node, getCocosBlendModeConfig(layer.blendMode));
        driver.appendChild(content, node);

        this.layers.set(layer.id, {
          layer,
          asset,
          node,
          spriteFrame,
        });
      }

      driver.appendChild(this.options.root, stage);
      this.stageNode = stage;
      this.seek(this.currentTime);
    } catch (error) {
      driver.destroyNode(stage);
      this.stageNode = null;
      this.backgroundNode = null;
      this.contentNode = null;
      this.particleRootNode = null;
      this.layers.clear();
      throw error;
    }
  }

  seek(time: number): void {
    this.assertInitialized();
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
    }

    this.drawParticles(sampledProject.layers);
    this.options.onTimeChange?.(this.currentTime);
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "V5GCocosPlayer.update(deltaSeconds) requires a non-negative finite number.",
      );
    }
    if (!this.isPlaying) return;

    const boundary = this.getPlaybackBoundary();
    const previousTime = this.currentTime;
    const nextTime = previousTime + deltaSeconds;
    if (nextTime < boundary.endTime - PLAYBACK_EPSILON) {
      this.seek(nextTime);
      this.emitPlaybackEventsBetween(
        previousTime,
        nextTime,
        this.loopIndex,
        boundary,
      );
      return;
    }

    this.seek(boundary.endTime);
    this.emitPlaybackEventsBetween(
      previousTime,
      boundary.endTime,
      this.loopIndex,
      boundary,
    );

    if (!boundary.loop) {
      const completeContext: V5GCocosPlaybackCompleteContext = {
        startTime: boundary.startTime,
        endTime: boundary.endTime,
        currentTime: boundary.endTime,
        loopIndex: this.loopIndex,
      };
      this.activeRange = null;
      this.setPlaying(false);
      this.emitPlaybackComplete(completeContext);
      return;
    }

    this.advanceLoopingPlayback(Math.max(0, nextTime - boundary.endTime));
  }

  playRange(options: V5GCocosPlayRangeOptions): void {
    this.assertInitialized();
    const range = this.normalizePlaybackRange(
      options.range,
      "V5GCocosPlayer.playRange",
    );
    this.activeRange = {
      ...range,
      loop: options.loop ?? this.loop,
    };
    this.loopIndex = 0;
    this.seek(range.startTime);
    this.setPlaying(true);
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

  play(): void {
    this.setPlaying(true);
  }

  pause(): void {
    this.setPlaying(false);
  }

  restart(): void {
    this.activeRange = null;
    this.loopIndex = 0;
    this.seek(0);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  destroy(): void {
    this.destroyManagedNodes();
    this.activeRange = null;
    this.playbackEvents.clear();
    this.completeListeners.clear();
    this.loopIndex = 0;
    this.setPlaying(false);
    this.currentTime = 0;
  }

  private advanceLoopingPlayback(overflowSeconds: number): void {
    const boundary = this.getPlaybackBoundary();
    const rangeDuration = boundary.endTime - boundary.startTime;
    let remaining = overflowSeconds;

    while (remaining >= rangeDuration - PLAYBACK_EPSILON) {
      this.loopIndex += 1;
      this.seek(boundary.endTime);
      this.emitPlaybackEventsBetween(
        boundary.startTime,
        boundary.endTime,
        this.loopIndex,
        boundary,
      );
      remaining -= rangeDuration;
    }

    this.loopIndex += 1;
    const clampedRemaining =
      Math.abs(remaining) <= PLAYBACK_EPSILON ? 0 : remaining;
    const nextTime = boundary.startTime + clampedRemaining;
    this.seek(nextTime);
    this.emitPlaybackEventsBetween(
      boundary.startTime,
      nextTime,
      this.loopIndex,
      boundary,
    );
  }

  private getPlaybackBoundary(): PlaybackBoundary {
    return (
      this.activeRange ?? {
        startTime: 0,
        endTime: this.options.project.stage.duration,
        loop: this.loop,
      }
    );
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

  private destroyManagedNodes(): void {
    this.clearParticles();
    if (this.stageNode !== null) {
      this.options.driver.destroyNode(this.stageNode);
    }
    this.stageNode = null;
    this.backgroundNode = null;
    this.contentNode = null;
    this.particleRootNode = null;
    this.layers.clear();
  }

  private assertInitialized(): void {
    if (this.stageNode === null) {
      throw new Error("V5GCocosPlayer must be initialized before seek/update.");
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

  private drawParticles(
    sampledLayers: ReturnType<typeof sampleProjectAtTime>["layers"],
  ): void {
    this.clearParticles();
    const particleRoot = this.particleRootNode;
    if (particleRoot === null) {
      throw new Error("V5GCocosPlayer particle root is not initialized.");
    }

    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveParticleAnimation) continue;
      const managed = this.layers.get(sampledLayer.layerId);
      if (!managed) {
        throw new Error(
          `Missing runtime node for V5G particle layer "${sampledLayer.layerId}".`,
        );
      }
      const emitterPosition = v5gTransformToCocosPosition(
        sampledLayer.transform,
      );
      const particles = sampleParticleSpritesForLayer(
        managed.layer,
        sampledLayer,
        {
          width: managed.asset.width,
          height: managed.asset.height,
        },
        this.currentTime,
      );

      for (const particle of particles) {
        const node = this.options.driver.createImageNode(
          `V5G Particle ${particle.layerId} ${particle.animationId}`,
          managed.spriteFrame,
        );
        this.options.driver.setContentSize(
          node,
          managed.asset.width,
          managed.asset.height,
        );
        this.options.driver.setAnchorPoint(node, 0.5, 0.5);
        this.options.driver.setPosition(
          node,
          emitterPosition.x + particle.offsetX,
          emitterPosition.y + particle.offsetY,
        );
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
        this.options.driver.appendChild(particleRoot, node);
        this.particleNodes.push(node);
      }
    }
  }

  private clearParticles(): void {
    while (this.particleNodes.length > 0) {
      const node = this.particleNodes.pop();
      if (node !== undefined) this.options.driver.destroyNode(node);
    }
  }
}
