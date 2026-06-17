import { sampleProjectAtTime } from "../core/project-sampler.js";
import { sampleParticleSpritesForLayer } from "../core/particle-sampler.js";
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
  private contentNode: TNode | null = null;
  private particleRootNode: TNode | null = null;
  private backgroundNode: TNode | null = null;
  private readonly particleNodes: TNode[] = [];
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
    if (
      Math.abs(actualSize.width - asset.width) > SIZE_EPSILON ||
      Math.abs(actualSize.height - asset.height) > SIZE_EPSILON
    ) {
      throw new Error(
        `Cocos SpriteFrame size mismatch for V5G asset "${asset.id}" at "${asset.path}": expected ${asset.width}x${asset.height}, got ${actualSize.width}x${actualSize.height}.`,
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
