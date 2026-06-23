import { describe, expect, it } from "vitest";
import { toPixiBlendMode } from "../../src/pixi/blend-mode";
import {
  getAssetDisplayCompensation,
  getAssetTextureSize,
  getLayerAsset,
} from "../../src/pixi/layer-instance";
import type {
  V5GAssetConfig,
  V5GBlendMode,
  V5GLayerConfig,
} from "../../src/core/types";

function asset(overrides: Partial<V5GAssetConfig> = {}): V5GAssetConfig {
  return {
    id: "asset",
    type: "image",
    path: "assets/asset.png",
    originalName: "asset.png",
    width: 730,
    height: 735,
    ...overrides,
  };
}

const transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

function imageLayer(overrides: Partial<V5GLayerConfig> = {}): V5GLayerConfig {
  return {
    id: "layer",
    name: "Layer",
    type: "image",
    assetId: "asset",
    parentId: null,
    visible: true,
    locked: false,
    transform,
    opacity: 1,
    blendMode: "normal",
    animations: [],
    keyframes: [],
    ...overrides,
  };
}

describe("asset scale runtime helpers", () => {
  it("uses logical size as texture size for legacy full-size assets", () => {
    const fullAsset = asset();

    expect(getAssetTextureSize(fullAsset)).toEqual({
      width: 730,
      height: 735,
    });
    expect(
      getAssetDisplayCompensation(fullAsset, { width: 730, height: 735 }),
    ).toEqual({ x: 1, y: 1 });
  });

  it("uses fileWidth and fileHeight for runtime texture size", () => {
    const runtimeAsset = asset({
      fileWidth: 365,
      fileHeight: 368,
      fileScale: 0.5,
    });

    expect(getAssetTextureSize(runtimeAsset)).toEqual({
      width: 365,
      height: 368,
    });
    expect(
      getAssetDisplayCompensation(runtimeAsset, { width: 365, height: 368 }),
    ).toEqual({
      x: 730 / 365,
      y: 735 / 368,
    });
  });

  it("fails fast when display compensation cannot be computed", () => {
    expect(() =>
      getAssetDisplayCompensation(asset(), { width: 0, height: 735 }),
    ).toThrow("Invalid V5G asset display compensation");
  });

  it("resolves layer assets and blend modes with fail-fast errors", () => {
    const assetsById = new Map([["asset", asset()]]);
    expect(getLayerAsset(imageLayer(), assetsById)?.id).toBe("asset");
    expect(
      getLayerAsset(imageLayer({ type: "text", assetId: null }), assetsById),
    ).toBeNull();
    expect(() =>
      getLayerAsset(imageLayer({ assetId: null }), assetsById),
    ).toThrow("requires assetId");
    expect(() =>
      getLayerAsset(imageLayer({ assetId: "missing" }), assetsById),
    ).toThrow("references missing asset");

    expect(toPixiBlendMode("screen")).toBe("screen");
    expect(() => toPixiBlendMode("unknown" as V5GBlendMode)).toThrow(
      "Unsupported V5G blendMode",
    );
  });
});
