import { describe, expect, it } from "vitest";
import {
  getAssetDisplayCompensation,
  getAssetTextureSize,
} from "../../src/runtime/layer-instance";
import type { V5GAssetConfig } from "../../src/v5g/types";

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
});
