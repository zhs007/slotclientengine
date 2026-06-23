import * as PIXI from "pixi.js";
import { toPixiBlendMode } from "./blend-mode.js";
import { editorToPixi } from "../core/coordinates.js";
import { parseColorHex } from "../core/validation.js";
import { sampleProjectAtTime } from "../core/project-sampler.js";
import { sampleParticleSpritesForLayer } from "../core/particle-sampler.js";
import {
  applySampledLayerState,
  createLayerInstance,
  getLayerAsset,
  getAssetTextureSize,
  type V5GLayerInstance,
} from "./layer-instance.js";
import type { AssetUrlManifest } from "../core/asset-manifest.js";
import type { SampledLayerState } from "../core/project-sampler.js";
import type { V5GAssetConfig, VNIProjectConfig } from "../core/types.js";

export type VNIPlaybackRange =
  | { unit: "time"; start: number; end?: number }
  | { unit: "frame"; start: number; end?: number; fps: number };

export interface VNIPlayRangeOptions {
  range: VNIPlaybackRange;
  loop?: boolean;
}

export type VNIPlaybackPoint =
  | { unit: "time"; at: number }
  | { unit: "frame"; at: number; fps: number };

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
  container: HTMLElement;
  projectId: string;
  bundleId: string;
  profileId: string;
  profilePurpose: string;
  assetScale: number;
  project: VNIProjectConfig;
  assetUrls: AssetUrlManifest;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
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

export class VNIPlayer {
  private readonly app = new PIXI.Application();
  private readonly stageRoot = new PIXI.Container();
  private readonly stageBackground = new PIXI.Graphics();
  private readonly contentRoot = new PIXI.Container();
  private readonly container: HTMLElement;
  private readonly projectId: string;
  private readonly bundleId: string;
  private readonly profileId: string;
  private readonly profilePurpose: string;
  private readonly assetScale: number;
  private readonly project: VNIProjectConfig;
  private readonly assetUrls: AssetUrlManifest;
  private readonly assetsById: ReadonlyMap<string, V5GAssetConfig>;
  private readonly onTimeChange?: (time: number) => void;
  private readonly onPlayingChange?: (isPlaying: boolean) => void;
  private readonly layerInstances = new Map<string, V5GLayerInstance>();
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;
  private pixelDiagnosticsRafId: number | null = null;
  private lastTickMs = 0;
  private currentTime = 0;
  private loop = true;
  private playing = false;
  private initialized = false;
  private activeRange: ActivePlaybackRange | null = null;
  private readonly playbackMarkers = new Map<string, PlaybackMarker>();
  private readonly playbackCompleteListeners = new Set<
    (event: VNIPlaybackCompleteContext) => void
  >();

  constructor(options: VNIPlayerOptions) {
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
    this.stageRoot.addChild(this.stageBackground, this.contentRoot);

    const texturesByAssetId = await this.loadTextures();
    for (const layer of this.project.layers) {
      const instance = createLayerInstance(
        layer,
        texturesByAssetId,
        this.assetsById,
      );
      this.layerInstances.set(layer.id, instance);
      this.contentRoot.addChild(instance.display, instance.particleDisplay);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.initialized = true;
    this.seek(0);
  }

  play(): void {
    if (this.playing) return;
    if (!this.activeRange && this.currentTime >= this.project.stage.duration) {
      this.seek(0);
    }
    this.playing = true;
    this.lastTickMs = performance.now();
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
    this.activeRange = null;
    this.seek(0);
    if (this.playing) {
      this.lastTickMs = performance.now();
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
    const particleSpriteCount = this.drawParticles(sampled.layers);
    this.updateDiagnostics(
      sampled.layers.filter((layer) => layer.visible).length,
      particleSpriteCount,
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

  update(deltaSeconds: number): void {
    assertPositiveFinite(deltaSeconds, "deltaSeconds");
    if (!this.playing) return;
    if (this.activeRange) {
      this.advanceActiveRange(deltaSeconds);
      return;
    }
    this.advanceFullTimeline(deltaSeconds);
  }

  playRange(options: VNIPlayRangeOptions): void {
    this.assertInitialized("playRange");
    const normalized = normalizePlaybackRange(
      options.range,
      this.project.stage.duration,
    );
    this.activeRange = {
      ...normalized,
      loop: options.loop ?? this.loop,
      loopIndex: 0,
    };
    this.seek(normalized.startTime);
    if (!this.playing) {
      this.play();
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
    if (this.pixelDiagnosticsRafId !== null) {
      cancelAnimationFrame(this.pixelDiagnosticsRafId);
      this.pixelDiagnosticsRafId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.activeRange = null;
    this.playbackMarkers.clear();
    this.playbackCompleteListeners.clear();
    this.clearParticles();
    this.clearDiagnostics();
    this.app.destroy(true);
  }

  private readonly tick = (now: number): void => {
    if (!this.playing) return;
    const deltaSeconds = Math.max(0, (now - this.lastTickMs) / 1000);
    this.lastTickMs = now;
    this.update(deltaSeconds);
    if (this.playing) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  private advanceFullTimeline(deltaSeconds: number): void {
    const duration = this.project.stage.duration;
    let remaining = deltaSeconds;
    while (remaining > 0 && this.playing) {
      const timeToEnd = duration - this.currentTime;
      if (remaining >= timeToEnd) {
        const previousTime = this.currentTime;
        this.seek(duration);
        this.triggerPlaybackEvents(previousTime, duration, 0);
        if (this.loop) {
          remaining -= Math.max(timeToEnd, 0);
          this.seek(0);
          if (timeToEnd <= 0) break;
          continue;
        }
        this.pause();
        this.triggerPlaybackComplete({
          startTime: 0,
          endTime: duration,
          currentTime: duration,
          loopIndex: 0,
        });
        return;
      }
      const previousTime = this.currentTime;
      const nextTime = previousTime + remaining;
      this.seek(nextTime);
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
        this.seek(range.endTime);
        this.triggerPlaybackEvents(
          previousTime,
          range.endTime,
          range.loopIndex,
        );
        if (range.loop) {
          remaining -= Math.max(timeToEnd, 0);
          range.loopIndex += 1;
          this.seek(range.startTime);
          if (timeToEnd <= 0) break;
          continue;
        }
        this.pause();
        this.activeRange = null;
        this.triggerPlaybackComplete({
          startTime: range.startTime,
          endTime: range.endTime,
          currentTime: range.endTime,
          loopIndex: range.loopIndex,
        });
        return;
      }
      const previousTime = this.currentTime;
      const nextTime = previousTime + remaining;
      this.seek(nextTime);
      this.triggerPlaybackEvents(previousTime, nextTime, range.loopIndex);
      return;
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

  private drawParticles(sampledLayers: readonly SampledLayerState[]): number {
    this.clearParticles();
    let particleSpriteCount = 0;
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
      particleSpriteCount += particles.length;
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
        instance.particleDisplay.addChild(sprite);
      }
    }
    return particleSpriteCount;
  }

  private clearParticles(): void {
    for (const instance of this.layerInstances.values()) {
      for (const child of instance.particleDisplay.removeChildren()) {
        child.destroy();
      }
    }
  }

  private updateDiagnostics(
    visibleLayerCount: number,
    particleSpriteCount: number,
  ): void {
    this.container.dataset.vniProjectId = this.projectId;
    this.container.dataset.vniTime = this.currentTime.toFixed(2);
    this.container.dataset.vniVisibleLayers = String(visibleLayerCount);
    this.container.dataset.vniParticleSprites = String(particleSpriteCount);
    this.container.dataset.v5gProjectId = this.projectId;
    this.container.dataset.v5gTime = this.currentTime.toFixed(2);
    this.container.dataset.v5gVisibleLayers = String(visibleLayerCount);
    this.container.dataset.v5gParticleSprites = String(particleSpriteCount);
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
      this.container.dataset.vniPixelSampleError = "missing-webgl-context";
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

    this.container.dataset.vniPixelSamples = String(sampled);
    this.container.dataset.vniNonBackgroundSamples = String(nonBackground);
    this.container.dataset.vniMaxPixelDelta = String(maxDelta);
    delete this.container.dataset.vniPixelSampleError;
    this.container.dataset.v5gPixelSamples = String(sampled);
    this.container.dataset.v5gNonBackgroundSamples = String(nonBackground);
    this.container.dataset.v5gMaxPixelDelta = String(maxDelta);
    delete this.container.dataset.v5gPixelSampleError;
  }

  private clearDiagnostics(): void {
    delete this.container.dataset.vniProjectId;
    delete this.container.dataset.vniTime;
    delete this.container.dataset.vniVisibleLayers;
    delete this.container.dataset.vniParticleSprites;
    delete this.container.dataset.vniPixelSamples;
    delete this.container.dataset.vniNonBackgroundSamples;
    delete this.container.dataset.vniMaxPixelDelta;
    delete this.container.dataset.vniPixelSampleError;
    delete this.container.dataset.v5gProjectId;
    delete this.container.dataset.v5gTime;
    delete this.container.dataset.v5gVisibleLayers;
    delete this.container.dataset.v5gParticleSprites;
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

export type V5GPlayerOptions = VNIPlayerOptions;
export const V5GPlayer = VNIPlayer;

function normalizePlaybackRange(
  range: VNIPlaybackRange,
  duration: number,
): { startTime: number; endTime: number } {
  if (range.unit === "time") {
    const startTime = assertFiniteNumber(range.start, "playback range start");
    const endTime = normalizeOptionalEnd(
      range.end,
      duration,
      "playback range end",
    );
    assertNormalizedRange(startTime, endTime, duration);
    return { startTime, endTime };
  }
  const fps = assertPositiveFinite(range.fps, "playback range fps");
  const startFrame = assertNonNegativeInteger(
    range.start,
    "playback range start frame",
  );
  const endTime =
    range.end === undefined || range.end === -1
      ? duration
      : assertNonNegativeInteger(range.end, "playback range end frame") / fps;
  const startTime = startFrame / fps;
  assertNormalizedRange(startTime, endTime, duration);
  return { startTime, endTime };
}

function normalizePlaybackPoint(
  point: VNIPlaybackPoint,
  duration: number,
  path: string,
): number {
  const time =
    point.unit === "time"
      ? assertFiniteNumber(point.at, `${path} time`)
      : assertNonNegativeInteger(point.at, `${path} frame`) /
        assertPositiveFinite(point.fps, `${path} fps`);
  if (time < 0 || time > duration) {
    throw new Error(`${path} must be within project duration.`);
  }
  return time;
}

function normalizeOptionalEnd(
  value: number | undefined,
  duration: number,
  path: string,
): number {
  if (value === undefined || value === -1) return duration;
  return assertFiniteNumber(value, path);
}

function assertNormalizedRange(
  startTime: number,
  endTime: number,
  duration: number,
): void {
  if (startTime < 0 || !(startTime < endTime) || endTime > duration) {
    throw new Error(
      `Invalid VNI playback range: expected 0 <= start < end <= ${duration}, got ${startTime}..${endTime}.`,
    );
  }
}

function assertFiniteNumber(value: number, path: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function assertPositiveFinite(value: number, path: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, path: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer.`);
  }
  return value;
}
