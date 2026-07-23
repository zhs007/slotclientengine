import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as runtime from "../../standalone/anieditorv5runtime-cc";
import type {
  V5GAnimationConfig,
  V5GAssetConfig,
  V5GExportProfileConfig,
  V5GCocosAssetSource,
  V5GCocosCyclicSelectionItem,
  V5GCocosForceStopParticlesOptions,
  V5GCocosSegmentedPlaybackEndOptions,
  V5GCocosSpriteAtlasAssetSource,
  V5GForceStopParticlesOptions,
  V5GLayerConfig,
  V5GSegmentedPlaybackEndOptions,
  V5GTransformConfig,
  VNIChaserLightLayerSampleState,
  VNIChaserLightSpriteSample,
  VNIChaserLightTextureSize,
  VNISafeGlowLayerSampleState,
  VNISafeGlowSpriteSample,
} from "../../standalone/anieditorv5runtime-cc";

describe("standalone runtime import", () => {
  it("exports compressed asset metadata types", () => {
    const profile: V5GExportProfileConfig = {
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
    };
    const asset: V5GAssetConfig = {
      id: "asset",
      type: "image",
      path: "assets/a.png",
      originalName: "a.png",
      width: 100,
      height: 50,
      fileWidth: 50,
      fileHeight: 25,
      fileScale: profile.assetScale,
    };

    expect(asset.fileScale).toBe(profile.assetScale);
  });

  it("exports atlas asset source types", () => {
    const atlasSource: V5GCocosSpriteAtlasAssetSource<string> = {
      atlas: {
        getSpriteFrame(name) {
          return name === "asset" ? "frame" : null;
        },
      },
    };
    const assetSource: V5GCocosAssetSource<string> = atlasSource;

    expect(assetSource.atlas.getSpriteFrame("asset")).toBe("frame");
  });

  it("exports particle force-stop option types", () => {
    const forceStopOptions: V5GForceStopParticlesOptions = {
      suppressUntilNextPlayback: true,
    };
    const cocosForceStopOptions: V5GCocosForceStopParticlesOptions =
      forceStopOptions;
    const segmentedEndOptions: V5GSegmentedPlaybackEndOptions = {
      forceStopParticles: true,
    };
    const cocosSegmentedEndOptions: V5GCocosSegmentedPlaybackEndOptions =
      segmentedEndOptions;

    expect(cocosForceStopOptions.suppressUntilNextPlayback).toBe(true);
    expect(cocosSegmentedEndOptions.forceStopParticles).toBe(true);
  });

  it("exports the Cocos Node carrier contract", () => {
    const item: V5GCocosCyclicSelectionItem<{ readonly id: string }> = {
      key: "bamboo-card-07",
      visual: {
        kind: "node",
        node: { id: "complex-node-root" },
        width: 720,
        height: 720,
        revision: "result-v1",
      },
    };
    expect(item.visual.kind).toBe("node");
    expect(item.visual.width).toBe(720);
  });

  it("exports safe_glow sample types with inherited blend modes", () => {
    const layer: VNISafeGlowLayerSampleState = {
      layerId: "layer",
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      },
      baseOpacity: 1,
      blendMode: "add",
    };
    const sprite: VNISafeGlowSpriteSample = {
      type: "safe_glow",
      layerId: layer.layerId,
      animationId: "safe-glow",
      x: 0,
      y: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      rotation: 0,
      alpha: 0.8,
      blendMode: layer.blendMode,
    };

    expect(sprite.blendMode).toBe("add");
  });

  it("exports chaser_light sample types and fixed-position sampler APIs", () => {
    const transform: V5GTransformConfig = {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    };
    const animation: V5GAnimationConfig = {
      id: "chaser",
      type: "chaser_light",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 1,
      params: {
        totalCount: 2,
        spacing: 80,
        lightDuration: 0.08,
        interval: 0.04,
        trajectory: 0,
        radius: 120,
        centerX: 0,
        centerY: 0,
        endX: 240,
        endY: 0,
        curve: 120,
        lightSize: 40,
        dimAlpha: 0.12,
        keepOriginal: true,
      },
    };
    const layer: V5GLayerConfig = {
      id: "layer",
      name: "Layer",
      type: "image",
      assetId: "asset",
      parentId: null,
      groupId: "group_default",
      visible: true,
      locked: false,
      transform,
      opacity: 1,
      blendMode: "normal",
      animations: [animation],
      keyframes: [],
    };
    const sampledLayer: VNIChaserLightLayerSampleState = {
      layerId: layer.id,
      transform,
      baseOpacity: 1,
      blendMode: layer.blendMode,
    };
    const textureSize: VNIChaserLightTextureSize = {
      width: 100,
      height: 100,
    };

    expect(runtime.getChaserLightProgress(animation, 0.5)).toBe(0.5);
    expect(runtime.hasActiveChaserLightAnimation(layer, 0.5)).toBe(true);

    const start = runtime.sampleChaserLightSpritesForLayer(
      layer,
      sampledLayer,
      textureSize,
      0,
    );
    const later = runtime.sampleChaserLightSpritesForLayer(
      layer,
      sampledLayer,
      textureSize,
      0.12,
    );
    const sprite: VNIChaserLightSpriteSample = start[0];

    expect(later.map(({ x, y, rotation }) => ({ x, y, rotation }))).toEqual(
      start.map(({ x, y, rotation }) => ({ x, y, rotation })),
    );
    expect(sprite).toMatchObject({
      type: "chaser_light",
      x: 0,
      y: -120,
      rotation: 0,
      alpha: 1,
      scale: 0.4504,
      blendMode: "add",
      isLit: true,
    });
    expect(later.filter((item) => item.isLit)[0].x).toBe(start[1].x);
  });

  it("keeps the preview example on atlas filename binding", () => {
    const examplePath = fileURLToPath(
      new URL("../../standalone/V5GPreview.example.ts", import.meta.url),
    );
    const source = readFileSync(examplePath, "utf8");

    expect(source).toContain("@property(SpriteAtlas)");
    expect(source).toContain("V5GPreview.atlas must be assigned.");
    expect(source).not.toContain("assetPrefix");
    expect(source).not.toContain("assetIds");
    expect(source).not.toContain("spriteFrames");
  });

  it("imports directly with only the cc alias and exposes the public API", () => {
    expect(runtime.SUPPORTED_ANIMATION_TYPES).toEqual(
      expect.arrayContaining([
        "idle",
        "scale_in",
        "scale_out",
        "pop",
        "shake",
        "blink",
        "particles",
        "particle_twinkle",
        "particle_wall",
        "particle_combo",
        "chaser_light",
        "shatter",
        "glow",
        "safe_glow",
        "squash_stretch",
      ]),
    );
    expect(runtime.PARTICLE_ANIMATION_TYPES).toEqual([
      "particles",
      "particle_stream",
      "particle_twinkle",
      "particle_wall",
      "particle_combo",
    ]);
    expect(runtime.createV5GCocosPlayer).toBeTypeOf("function");
    expect(runtime.V5GCocosPlayer).toBeTypeOf("function");
    expect(runtime.assertV5GProject).toBeTypeOf("function");
    expect(runtime.validateV5GProject).toBeTypeOf("function");
    expect(runtime.validateCocosV5GProject).toBeTypeOf("function");
    expect(runtime.parseColorHex).toBeTypeOf("function");
    expect(runtime.V5GCocosPlayer.prototype.playRange).toBeTypeOf("function");
    expect(runtime.V5GCocosPlayer.prototype.addPlaybackEvent).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.clearPlaybackEvent).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.clearPlaybackEvents).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.onPlaybackComplete).toBeTypeOf(
      "function",
    );
    expect(
      runtime.V5GCocosPlayer.prototype.requestSegmentedPlaybackEnd,
    ).toBeTypeOf("function");
    expect(runtime.V5GCocosPlayer.prototype.forceStopAllParticles).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.getPlaybackState).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.getLayerGroups).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.getLayerGroupSlots).toBeTypeOf(
      "function",
    );
    expect(
      runtime.V5GCocosPlayer.prototype.attachNodeBetweenLayerGroups,
    ).toBeTypeOf("function");
    expect(
      runtime.V5GCocosPlayer.prototype.attachProjectAssetBetweenLayerGroups,
    ).toBeTypeOf("function");
    expect(
      runtime.V5GCocosPlayer.prototype.attachSpriteFrameBetweenLayerGroups,
    ).toBeTypeOf("function");
    expect(runtime.V5GCocosPlayer.prototype.attachTextToTextLayer).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.attachNodeToTextLayer).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.getRuntimeDiagnostics).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.detachMountedNode).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.detachMountedNodes).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.clearMountedNodes).toBeTypeOf(
      "function",
    );
    expect(runtime.DEFAULT_VNI_LAYER_GROUP_ID).toBe("group_default");
    expect(runtime.normalizeVNIProjectLayerGroups).toBeTypeOf("function");
    expect(runtime.getVNIProjectRenderGroupOrder).toBeTypeOf("function");
    expect(runtime.getVNIProjectLayerGroupSlots).toBeTypeOf("function");
    expect(runtime.assertVNIAdjacentLayerGroupSlot).toBeTypeOf("function");
    expect(runtime.sampleProjectAtTime).toBeTypeOf("function");
    expect(runtime.sampleLayerAtTime).toBeTypeOf("function");
    expect(runtime.sampleLayerAnimationsAtTime).toBeTypeOf("function");
    expect(runtime.getSafeGlowProgress).toBeTypeOf("function");
    expect(runtime.hasActiveSafeGlowAnimation).toBeTypeOf("function");
    expect(runtime.sampleSafeGlowSpritesForLayer).toBeTypeOf("function");
    expect(runtime.getChaserLightProgress).toBeTypeOf("function");
    expect(runtime.hasActiveChaserLightAnimation).toBeTypeOf("function");
    expect(runtime.sampleChaserLightSpritesForLayer).toBeTypeOf("function");
    expect(runtime.sampleParticleSpritesForLayer).toBeTypeOf("function");
    expect(runtime.sampleParticleSpritesForLayerRuntime).toBeTypeOf("function");
    expect(runtime.sampleLiveParticleSprites).toBeTypeOf("function");
    expect(runtime.normalizeSegmentedPlaybackOptions).toBeTypeOf("function");
    expect(runtime.hasActiveParticleAnimation).toBeTypeOf("function");
    expect(runtime.opacityToCocosOpacity(0.5)).toBe(128);
    expect(runtime.v5gTransformToCocosPosition).toBeTypeOf("function");
  });
});
