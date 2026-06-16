import { sampleProjectAtTime } from "../core/project-sampler.js";
import { validateCocosV5GProject, parseColorHex } from "../core/validation.js";
import { getCocosBlendModeConfig } from "./blend-mode.js";
import {
  opacityToCocosOpacity,
  v5gTransformToCocosPosition,
} from "./coordinates.js";
import type { V5GAssetConfig, V5GLayerConfig } from "../core/types.js";
import type { V5GCocosPlayerOptions } from "./types.js";

interface ManagedLayer<TNode, TSpriteFrame> {
  layer: V5GLayerConfig;
  asset: V5GAssetConfig;
  node: TNode;
  spriteFrame: TSpriteFrame;
}

const SIZE_EPSILON = 0.01;

export class V5GCocosPlayer<TNode, TSpriteFrame> {
  private readonly options: V5GCocosPlayerOptions<TNode, TSpriteFrame>;
  private readonly layers = new Map<
    string,
    ManagedLayer<TNode, TSpriteFrame>
  >();
  private stageNode: TNode | null = null;
  private backgroundNode: TNode | null = null;
  private currentTime = 0;
  private isPlaying = false;
  private loop: boolean;

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
        driver.appendChild(stage, node);

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
      this.options.driver.setActive(managed.node, sampledLayer.visible);
    }

    this.options.onTimeChange?.(this.currentTime);
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "V5GCocosPlayer.update(deltaSeconds) requires a non-negative finite number.",
      );
    }
    if (!this.isPlaying) return;

    const duration = this.options.project.stage.duration;
    let nextTime = this.currentTime + deltaSeconds;
    if (nextTime > duration) {
      if (this.loop) {
        nextTime %= duration;
      } else {
        nextTime = duration;
        this.setPlaying(false);
      }
    }
    this.seek(nextTime);
  }

  play(): void {
    this.setPlaying(true);
  }

  pause(): void {
    this.setPlaying(false);
  }

  restart(): void {
    this.seek(0);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  destroy(): void {
    this.destroyManagedNodes();
    this.setPlaying(false);
    this.currentTime = 0;
  }

  private setPlaying(nextPlaying: boolean): void {
    if (this.isPlaying === nextPlaying) return;
    this.isPlaying = nextPlaying;
    this.options.onPlayingChange?.(this.isPlaying);
  }

  private destroyManagedNodes(): void {
    if (this.stageNode !== null) {
      this.options.driver.destroyNode(this.stageNode);
    }
    this.stageNode = null;
    this.backgroundNode = null;
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
    if (
      Math.abs(actualSize.width - asset.width) > SIZE_EPSILON ||
      Math.abs(actualSize.height - asset.height) > SIZE_EPSILON
    ) {
      throw new Error(
        `Cocos SpriteFrame size mismatch for V5G asset "${asset.id}" at "${asset.path}": expected ${asset.width}x${asset.height}, got ${actualSize.width}x${actualSize.height}.`,
      );
    }
  }
}
