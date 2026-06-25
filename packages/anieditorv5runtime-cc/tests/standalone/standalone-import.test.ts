import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as runtime from "../../standalone/anieditorv5runtime-cc";
import type {
  V5GAssetConfig,
  V5GExportProfileConfig,
  V5GCocosAssetSource,
  V5GCocosSpriteAtlasAssetSource,
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
        "shatter",
        "glow",
        "safe_glow",
        "squash_stretch",
      ]),
    );
    expect(runtime.PARTICLE_ANIMATION_TYPES).toEqual([
      "particles",
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
    expect(runtime.sampleParticleSpritesForLayer).toBeTypeOf("function");
    expect(runtime.sampleParticleSpritesForLayerRuntime).toBeTypeOf("function");
    expect(runtime.sampleLiveParticleSprites).toBeTypeOf("function");
    expect(runtime.normalizeSegmentedPlaybackOptions).toBeTypeOf("function");
    expect(runtime.hasActiveParticleAnimation).toBeTypeOf("function");
    expect(runtime.opacityToCocosOpacity(0.5)).toBe(128);
    expect(runtime.v5gTransformToCocosPosition).toBeTypeOf("function");
  });
});
