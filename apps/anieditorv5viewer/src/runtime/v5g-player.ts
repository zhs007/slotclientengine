import * as PIXI from "pixi.js";
import { toPixiBlendMode } from "./blend-mode";
import { editorToPixi } from "./coordinates";
import { parseColorHex } from "./validation";
import { sampleProjectAtTime } from "./project-sampler";
import { sampleParticleSpritesForLayer } from "./particle-sampler";
import {
  applySampledLayerState,
  createLayerInstance,
  getLayerAsset,
  getAssetTextureSize,
  type V5GLayerInstance,
} from "./layer-instance";
import type { AssetUrlManifest } from "./asset-manifest";
import type { SampledLayerState } from "./project-sampler";
import type { V5GAssetConfig, V5GProjectConfig } from "../v5g/types";

export interface V5GPlayerOptions {
  container: HTMLElement;
  projectId: string;
  bundleId: string;
  profileId: string;
  profilePurpose: string;
  assetScale: number;
  project: V5GProjectConfig;
  assetUrls: AssetUrlManifest;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

export class V5GPlayer {
  private readonly app = new PIXI.Application();
  private readonly stageRoot = new PIXI.Container();
  private readonly stageBackground = new PIXI.Graphics();
  private readonly contentRoot = new PIXI.Container();
  private readonly particleRoot = new PIXI.Container();
  private readonly container: HTMLElement;
  private readonly projectId: string;
  private readonly bundleId: string;
  private readonly profileId: string;
  private readonly profilePurpose: string;
  private readonly assetScale: number;
  private readonly project: V5GProjectConfig;
  private readonly assetUrls: AssetUrlManifest;
  private readonly assetsById: ReadonlyMap<string, V5GAssetConfig>;
  private readonly onTimeChange?: (time: number) => void;
  private readonly onPlayingChange?: (isPlaying: boolean) => void;
  private readonly layerInstances = new Map<string, V5GLayerInstance>();
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;
  private pixelDiagnosticsRafId: number | null = null;
  private startClockMs = 0;
  private currentTime = 0;
  private loop = true;
  private playing = false;

  constructor(options: V5GPlayerOptions) {
    this.container = options.container;
    this.projectId = options.projectId;
    this.bundleId = options.bundleId;
    this.profileId = options.profileId;
    this.profilePurpose = options.profilePurpose;
    this.assetScale = options.assetScale;
    this.project = options.project;
    this.assetUrls = options.assetUrls;
    this.assetsById = new Map(
      options.project.assets.map((asset) => [asset.id, asset] as const),
    );
    this.onTimeChange = options.onTimeChange;
    this.onPlayingChange = options.onPlayingChange;
  }

  async init(): Promise<void> {
    const backgroundColor = parseColorHex(this.project.stage.backgroundColor);
    await this.app.init({
      backgroundColor,
      resizeTo: this.container,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    this.container.appendChild(this.app.canvas);
    this.drawStageBackground(backgroundColor);
    this.app.stage.addChild(this.stageRoot);
    this.stageRoot.addChild(
      this.stageBackground,
      this.contentRoot,
      this.particleRoot,
    );

    const texturesByAssetId = await this.loadTextures();
    for (const layer of this.project.layers) {
      const instance = createLayerInstance(
        layer,
        texturesByAssetId,
        this.assetsById,
      );
      this.layerInstances.set(layer.id, instance);
      this.contentRoot.addChild(instance.display);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.seek(0);
  }

  play(): void {
    if (this.playing) return;
    if (this.currentTime >= this.project.stage.duration) {
      this.seek(0);
    }
    this.playing = true;
    this.startClockMs = performance.now() - this.currentTime * 1000;
    this.onPlayingChange?.(true);
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.onPlayingChange?.(false);
  }

  restart(): void {
    this.seek(0);
    if (this.playing) {
      this.startClockMs = performance.now();
    }
  }

  seek(time: number): void {
    const sampled = sampleProjectAtTime(this.project, time);
    this.currentTime = sampled.time;
    for (const sampledLayer of sampled.layers) {
      const instance = this.layerInstances.get(sampledLayer.layerId);
      if (!instance) {
        throw new Error(`Missing V5G layer instance: ${sampledLayer.layerId}`);
      }
      applySampledLayerState(instance, sampledLayer, this.project.stage);
    }
    this.drawParticles(sampled.layers);
    this.updateDiagnostics(
      sampled.layers.filter((layer) => layer.visible).length,
    );
    this.onTimeChange?.(this.currentTime);
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

  destroy(): void {
    this.pause();
    if (this.pixelDiagnosticsRafId !== null) {
      cancelAnimationFrame(this.pixelDiagnosticsRafId);
      this.pixelDiagnosticsRafId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.clearParticles();
    this.clearDiagnostics();
    this.app.destroy(true);
  }

  private readonly tick = (now: number): void => {
    if (!this.playing) return;
    const duration = this.project.stage.duration;
    const elapsed = (now - this.startClockMs) / 1000;

    if (elapsed >= duration) {
      if (this.loop) {
        const nextTime = elapsed % duration;
        this.startClockMs = now - nextTime * 1000;
        this.seek(nextTime);
        this.rafId = requestAnimationFrame(this.tick);
        return;
      }
      this.seek(duration);
      this.pause();
      return;
    }

    this.seek(elapsed);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.app.renderer.resize(width, height);

    const padding = width < 720 ? 16 : 32;
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

  private drawStageBackground(backgroundColor: number): void {
    this.stageBackground.clear();
    this.stageBackground
      .rect(0, 0, this.project.stage.width, this.project.stage.height)
      .fill(backgroundColor);
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
    return texture;
  }

  private drawParticles(sampledLayers: readonly SampledLayerState[]): void {
    this.clearParticles();
    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveParticleAnimation) continue;
      const instance = this.layerInstances.get(sampledLayer.layerId);
      if (!instance) {
        throw new Error(`Missing V5G layer instance: ${sampledLayer.layerId}`);
      }
      if (!instance.texture || !instance.textureSize) {
        throw new Error(
          `V5G particle layer "${sampledLayer.layerId}" is missing image texture.`,
        );
      }
      const emitter = editorToPixi(
        sampledLayer.transform.x,
        sampledLayer.transform.y,
        this.project.stage.width,
        this.project.stage.height,
      );
      const particles = sampleParticleSpritesForLayer(
        instance.layer,
        sampledLayer,
        instance.textureSize,
        this.currentTime,
      );
      for (const particle of particles) {
        const sprite = new PIXI.Sprite(instance.texture);
        sprite.anchor.set(0.5);
        sprite.position.set(
          emitter.x + particle.offsetX,
          emitter.y + particle.offsetY,
        );
        sprite.scale.set(particle.scale);
        sprite.rotation = particle.rotation;
        sprite.alpha = particle.alpha;
        sprite.blendMode = toPixiBlendMode(particle.blendMode);
        this.particleRoot.addChild(sprite);
      }
    }
  }

  private clearParticles(): void {
    for (const child of this.particleRoot.removeChildren()) {
      child.destroy();
    }
  }

  private updateDiagnostics(visibleLayerCount: number): void {
    this.container.dataset.v5gProjectId = this.projectId;
    this.container.dataset.v5gTime = this.currentTime.toFixed(2);
    this.container.dataset.v5gVisibleLayers = String(visibleLayerCount);
    this.container.dataset.vniBundleId = this.bundleId;
    this.container.dataset.vniProfileId = this.profileId;
    this.container.dataset.vniAssetScale = String(this.assetScale);
    this.container.dataset.vniProfilePurpose = this.profilePurpose;
    if (this.pixelDiagnosticsRafId !== null) {
      cancelAnimationFrame(this.pixelDiagnosticsRafId);
    }
    this.pixelDiagnosticsRafId = requestAnimationFrame(() => {
      this.pixelDiagnosticsRafId = null;
      this.updatePixelDiagnostics();
    });
  }

  private updatePixelDiagnostics(): void {
    const canvas = this.app.canvas;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) {
      this.container.dataset.v5gPixelSampleError = "missing-webgl-context";
      return;
    }

    const backgroundColor = parseColorHex(this.project.stage.backgroundColor);
    const bg = [
      (backgroundColor >> 16) & 0xff,
      (backgroundColor >> 8) & 0xff,
      backgroundColor & 0xff,
    ];
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixel = new Uint8Array(4);
    let sampled = 0;
    let nonBackground = 0;
    let maxDelta = 0;

    for (let y = 0.2; y <= 0.8; y += 0.1) {
      for (let x = 0.2; x <= 0.8; x += 0.1) {
        gl.readPixels(
          Math.floor(width * x),
          Math.floor(height * y),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        sampled += 1;
        const delta =
          Math.abs(pixel[0] - bg[0]) +
          Math.abs(pixel[1] - bg[1]) +
          Math.abs(pixel[2] - bg[2]);
        maxDelta = Math.max(maxDelta, delta);
        if (delta > 28) nonBackground += 1;
      }
    }

    this.container.dataset.v5gPixelSamples = String(sampled);
    this.container.dataset.v5gNonBackgroundSamples = String(nonBackground);
    this.container.dataset.v5gMaxPixelDelta = String(maxDelta);
    delete this.container.dataset.v5gPixelSampleError;
  }

  private clearDiagnostics(): void {
    delete this.container.dataset.v5gProjectId;
    delete this.container.dataset.v5gTime;
    delete this.container.dataset.v5gVisibleLayers;
    delete this.container.dataset.v5gPixelSamples;
    delete this.container.dataset.v5gNonBackgroundSamples;
    delete this.container.dataset.v5gMaxPixelDelta;
    delete this.container.dataset.v5gPixelSampleError;
    delete this.container.dataset.vniBundleId;
    delete this.container.dataset.vniProfileId;
    delete this.container.dataset.vniAssetScale;
    delete this.container.dataset.vniProfilePurpose;
  }
}
