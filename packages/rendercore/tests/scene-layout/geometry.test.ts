import { describe, expect, it } from "vitest";
import {
  createSceneLayoutFramePolicy,
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

  it("maximizes the selected game003 orientation focus", () => {
    const landscape = resolveSceneLayoutFrameViewport({
      manifest: game003LayoutFixture,
      pageSize: { width: 1920, height: 1080 },
    });
    expect(landscape.frameDesignSize.width).toBeCloseTo(
      (824 * 1920) / 1080,
      10,
    );
    expect(landscape.frameDesignSize.height).toBe(824);
    expect(landscape.cssSize.width).toBeCloseTo(1920, 10);
    expect(landscape.cssSize.height).toBeCloseTo(1080, 10);
    expect(landscape.offsetX).toBeCloseTo(0, 10);
    expect(landscape.offsetY).toBeCloseTo(0, 10);

    const portrait = resolveSceneLayoutFrameViewport({
      manifest: game003LayoutFixture,
      pageSize: { width: 390, height: 844 },
    });
    expect(portrait.frameDesignSize.width).toBe(1174);
    expect(portrait.frameDesignSize.height).toBeCloseTo((1174 * 844) / 390, 10);
    expect(portrait.cssSize.width).toBe(390);
    expect(portrait.cssSize.height).toBeCloseTo(844, 10);
    expect(portrait.offsetX).toBe(0);
    expect(portrait.offsetY).toBeCloseTo(0, 10);

    const scene = resolveSceneLayoutViewport({
      manifest: game003LayoutFixture,
      viewportSize: portrait.frameDesignSize,
    });
    expect(scene.variantId).toBe("portrait");
    expect(scene.viewportSize).toEqual(portrait.frameDesignSize);
    expect(scene.focusRectInViewport.width).toBe(1130);
  });

  it("regresses layout25 portrait focus at a 299 x 466 page", () => {
    const manifest = structuredClone(game003LayoutFixture) as any;
    manifest.adaptation.variants.landscape = {
      ...manifest.adaptation.variants.landscape,
      artSize: { width: 2000, height: 2000 },
      focusRect: { x: 22, y: 531.5, width: 1954, height: 940 },
      frameFocusRect: { width: 1954, height: 940 },
      minFocusMargin: undefined,
    };
    manifest.adaptation.variants.portrait = {
      ...manifest.adaptation.variants.portrait,
      artSize: { width: 2000, height: 2000 },
      focusRect: { x: 499, y: 253, width: 1056, height: 1435 },
      frameFocusRect: { width: 1056, height: 1435 },
      minFocusMargin: undefined,
    };

    const frame = resolveSceneLayoutFrameViewport({
      manifest,
      pageSize: { width: 299, height: 466 },
    });
    expect(frame.frameDesignSize.width).toBe(1056);
    expect(frame.frameDesignSize.height).toBeCloseTo(1645.80602006689, 10);
    expect(frame.cssSize.width).toBe(299);
    expect(frame.cssSize.height).toBeCloseTo(466, 10);

    const scene = resolveSceneLayoutViewport({
      manifest,
      viewportSize: frame.frameDesignSize,
    });
    expect(scene.variantId).toBe("portrait");
    expect(scene.focusRectInViewport.x).toBe(0);
    expect(scene.focusRectInViewport.width * frame.scale).toBe(299);
    expect(scene.focusRectInViewport.height * frame.scale).toBeCloseTo(
      406.311553030303,
      10,
    );
  });

  it("creates a stateful maximized resolver for orientation layouts", () => {
    const policy = createSceneLayoutFramePolicy(game003LayoutFixture);
    expect(policy.mode).toBe("maximized-focus");
    if (policy.mode !== "maximized-focus") {
      throw new Error("expected maximized-focus frame policy");
    }
    expect(policy.resolveViewportSize({ width: 390, height: 844 })).toEqual({
      width: 1174,
      height: (1174 * 844) / 390,
    });
    expect(policy.resolveViewportSize({ width: 1000, height: 1000 })).toEqual({
      width: 1174,
      height: 1174,
    });
  });

  it("rejects an invalid physical page size", () => {
    expect(() =>
      resolveSceneLayoutFrameViewport({
        manifest: game002LayoutFixture,
        pageSize: { width: 0, height: 1080 },
      }),
    ).toThrow(/pageSize.width/);
  });

  it("resolves a center-origin reel around the art center", () => {
    const manifest = structuredClone(game002LayoutFixture) as any;
    manifest.coordinateOrigin = "center";
    manifest.nodes[0].placements.default = {
      x: -999.5,
      y: -999.5,
      scale: 1,
    };
    manifest.reels.main.placements.default = { x: 0, y: -123 };

    const snapshot = resolveSceneLayoutViewport({
      manifest,
      viewportSize: { width: 2000, height: 2000 },
    });

    expect(snapshot.reels.main).toMatchObject({
      artRect: { x: 640, y: 337, width: 720, height: 1080 },
      viewportRect: { width: 720, height: 1080 },
    });
  });
});
