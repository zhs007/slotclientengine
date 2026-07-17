import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const canvas = document.createElement("canvas");
  const runtime = {
    container: {},
    init: vi.fn(async () => undefined),
    update: vi.fn(),
    applyViewport: vi.fn(() => ({
      variantId: "default",
      artSize: { width: 100, height: 100 },
      viewportSize: { width: 100, height: 100 },
      visibleRect: { x: 0, y: 0, width: 100, height: 100 },
      worldOffset: { x: 0, y: 0 },
      focusRectInViewport: { x: 10, y: 10, width: 80, height: 80 },
      reels: {},
    })),
    destroy: vi.fn(),
  };
  const pkg = {
    resource: {},
    destroy: vi.fn(),
  };
  return {
    canvas,
    runtime,
    pkg,
    validate: vi.fn(async () => pkg),
    resize: vi.fn(),
    stageAdd: vi.fn(),
    stageAddAt: vi.fn(),
    tickerAdd: vi.fn(),
    appDestroy: vi.fn(),
    graphicsClear: vi.fn(),
    resolveFrame: vi.fn(
      ({ pageSize }: { pageSize: { width: number; height: number } }) =>
        pageSize.width === 800 && pageSize.height === 600
          ? {
              pageSize,
              frameDesignSize: { width: 1600, height: 1000 },
              scale: 0.5,
              cssSize: { width: 800, height: 500 },
              offsetX: 0,
              offsetY: 50,
            }
          : {
              pageSize,
              frameDesignSize: pageSize,
              scale: 1,
              cssSize: pageSize,
              offsetX: 0,
              offsetY: 0,
            },
    ),
  };
});

vi.mock("pixi.js", () => ({
  Application: class {
    canvas = state.canvas;
    renderer = { width: 100, height: 100, resize: state.resize };
    stage = { addChild: state.stageAdd, addChildAt: state.stageAddAt };
    ticker = { add: state.tickerAdd };
    init = vi.fn(async () => undefined);
    destroy = state.appDestroy;
  },
  Graphics: class {
    clear = state.graphicsClear;
    destroy = vi.fn();
  },
}));

vi.mock("../src/io/imported-layout-zip.js", () => ({
  validateLayoutAssets: state.validate,
}));

vi.mock("@slotclientengine/rendercore/scene-layout", () => ({
  createSceneLayoutRuntime: () => state.runtime,
  resolveSceneLayoutFrameViewport: state.resolveFrame,
}));

vi.mock("../src/preview/preview-guides.js", () => ({
  drawPreviewGuides: vi.fn(),
}));

import { LayoutPreview } from "../src/preview/layout-preview.js";
import { imageManifest, assetBytes } from "./fixtures.js";

describe("LayoutPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.canvas.removeAttribute("style");
  });

  it("reuses the initialized app across resize, zoom and guide changes", async () => {
    const parent = document.createElement("div");
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    parent.append(host);
    document.body.append(parent, diagnostics);
    const preview = new LayoutPreview(host, diagnostics);
    await preview.init();
    await preview.setLayout(imageManifest, assetBytes);
    preview.setPageSize({ width: 800, height: 600 });
    preview.setZoom(1.5);
    preview.setGuideVisibility({ showFocus: false, showReels: true });
    expect(state.runtime.init).toHaveBeenCalledTimes(1);
    expect(state.resize).toHaveBeenCalled();
    expect(state.runtime.applyViewport).toHaveBeenLastCalledWith({
      width: 1600,
      height: 1000,
    });
    expect(state.resize).toHaveBeenLastCalledWith(1600, 1000);
    expect(state.canvas.style.marginTop).not.toBe("0px");
    expect(diagnostics.textContent).toContain("variant=default");
    expect(diagnostics.textContent).toContain("logical=1600×1000");
    preview.clear();
    expect(diagnostics.textContent).toContain("暂停");
    preview.destroy();
    expect(state.runtime.destroy).toHaveBeenCalled();
    expect(state.appDestroy).toHaveBeenCalled();
  });

  it("rolls back a runtime init failure", async () => {
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    document.body.append(host, diagnostics);
    const preview = new LayoutPreview(host, diagnostics);
    await preview.init();
    state.runtime.init.mockRejectedValueOnce(new Error("bad player"));
    await expect(preview.setLayout(imageManifest, assetBytes)).rejects.toThrow(
      /bad player/,
    );
    expect(state.runtime.destroy).toHaveBeenCalled();
    expect(state.pkg.destroy).toHaveBeenCalled();
    preview.destroy();
  });

  it("discards an older async layout validation instead of replacing the latest preview", async () => {
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    document.body.append(host, diagnostics);
    const preview = new LayoutPreview(host, diagnostics);
    await preview.init();
    const stalePackage = { resource: {}, destroy: vi.fn() };
    let resolveStale!: (value: typeof stalePackage) => void;
    state.validate.mockImplementationOnce(
      () =>
        new Promise<typeof stalePackage>((resolve) => {
          resolveStale = resolve;
        }),
    );
    const stale = preview.setLayout(imageManifest, assetBytes);
    await preview.setLayout(imageManifest, assetBytes);
    resolveStale(stalePackage);
    await stale;
    expect(stalePackage.destroy).toHaveBeenCalledTimes(1);
    expect(state.runtime.init).toHaveBeenCalledTimes(1);
    preview.destroy();
  });
});
