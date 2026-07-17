import { describe, expect, it } from "vitest";
import {
  resolveSceneLayoutFrameViewport,
  resolveSceneLayoutViewport,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture, game003LayoutFixture } from "./fixtures.js";

describe("scene layout frame geometry", () => {
  it("reproduces game002 maximized-focus logical frame sizing", () => {
    const landscape = resolveSceneLayoutFrameViewport({
      manifest: game002LayoutFixture,
      pageSize: { width: 1920, height: 1080 },
    });
    expect(landscape).toMatchObject({
      frameDesignSize: { width: 2000, height: 1200 },
      scale: 0.9,
      cssSize: { width: 1800, height: 1080 },
      offsetX: 60,
      offsetY: 0,
    });

    const portrait = resolveSceneLayoutFrameViewport({
      manifest: game002LayoutFixture,
      pageSize: { width: 390, height: 844 },
    });
    expect(portrait.frameDesignSize.width).toBe(840);
    expect(portrait.frameDesignSize.height).toBeCloseTo((840 * 844) / 390);
    expect(portrait.cssSize).toEqual({ width: 390, height: 844 });
    expect(portrait.offsetX).toBe(0);
    expect(portrait.offsetY).toBe(0);
  });

  it("reproduces game003 orientation-focus variant and black-bar sizing", () => {
    const landscape = resolveSceneLayoutFrameViewport({
      manifest: game003LayoutFixture,
      pageSize: { width: 1920, height: 1080 },
    });
    expect(landscape).toMatchObject({
      frameDesignSize: { width: 2000, height: 1125 },
      scale: 0.96,
      cssSize: { width: 1920, height: 1080 },
      offsetX: 0,
      offsetY: 0,
    });

    const portrait = resolveSceneLayoutFrameViewport({
      manifest: game003LayoutFixture,
      pageSize: { width: 390, height: 844 },
    });
    expect(portrait.frameDesignSize).toEqual({ width: 1174, height: 2000 });
    expect(portrait.cssSize.width).toBe(390);
    expect(portrait.cssSize.height).toBeCloseTo((2000 * 390) / 1174);
    expect(portrait.offsetX).toBe(0);
    expect(portrait.offsetY).toBeGreaterThan(0);

    const scene = resolveSceneLayoutViewport({
      manifest: game003LayoutFixture,
      viewportSize: portrait.frameDesignSize,
    });
    expect(scene.variantId).toBe("portrait");
    expect(scene.viewportSize).toEqual({ width: 1174, height: 2000 });
  });

  it("rejects an invalid physical page size", () => {
    expect(() =>
      resolveSceneLayoutFrameViewport({
        manifest: game002LayoutFixture,
        pageSize: { width: 0, height: 1080 },
      }),
    ).toThrow(/pageSize.width/);
  });
});
