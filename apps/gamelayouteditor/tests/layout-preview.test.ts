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

function gridSnapshot(columns = 2, rows = 2) {
  return {
    variantId: "default",
    artSize: { width: 100, height: 100 },
    viewportSize: { width: 100, height: 100 },
    visibleRect: { x: 0, y: 0, width: 100, height: 100 },
    worldOffset: { x: 0, y: 0 },
    focusRectInViewport: { x: 10, y: 10, width: 80, height: 80 },
    reels: {
      main: {
        columns,
        rows,
        cellSize: { width: 20, height: 20 },
        stride: { width: 25, height: 23 },
        viewportRect: { x: 7, y: 11, width: 45, height: 43 },
      },
    },
  };
}

function symbolResource(
  options: {
    reels?: Readonly<Record<string, readonly (readonly number[])[]>>;
    createCatalog?: () => Promise<unknown>;
  } = {},
) {
  const reels = options.reels ?? {
    main: [
      [0, 1],
      [1, 0],
    ],
  };
  const paytable = {
    0: { code: 0, symbol: "A", pays: [1] },
    1: { code: 1, symbol: "B", pays: [1] },
  } as const;
  const renderSymbols: Array<ReturnType<typeof createRenderSymbol>> = [];
  const catalog = {
    createRenderSymbol: vi.fn((symbol: string) => {
      const rendered = createRenderSymbol(symbol);
      renderSymbols.push(rendered);
      return rendered;
    }),
  };
  const resource = {
    packageManifest: {
      id: "symbols-fixture",
      cellSize: { width: 20, height: 20 },
    },
    displaySymbols: ["A", "B"],
    gameConfig: {
      getReelNames: () => Object.keys(reels),
      getReels: (name: string) => ({
        getName: () => name,
        getReelCount: () => reels[name].length,
        getLength: (x: number) => reels[name][x].length,
        get: (x: number, y: number) => {
          const reel = reels[name][x];
          return reel[((y % reel.length) + reel.length) % reel.length];
        },
        normalizeY: (x: number, y: number) => {
          const length = reels[name][x].length;
          return ((y % length) + length) % length;
        },
      }),
      getPaytableEntry: (code: number) =>
        paytable[code as keyof typeof paytable],
      getSymbolCode: (symbol: string) => (symbol === "A" ? 0 : 1),
    },
    symbolManifest: {
      symbols: {
        A: { valuePresentation: { defaultValues: [25] } },
        B: {},
      },
    },
    symbolScales: { A: 1.5, B: 0.75 },
    symbolRenderPriorities: { A: 2, B: 0 },
    createCatalog: vi.fn(options.createCatalog ?? (async () => catalog)),
    destroy: vi.fn(),
  };
  return { resource, catalog, renderSymbols };
}

function createRenderSymbol(symbol: string) {
  return {
    symbol,
    scale: { set: vi.fn() },
    position: { set: vi.fn() },
    zIndex: 0,
    init: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    setPresentationValue: vi.fn(),
  };
}

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
  Container: class {
    addChild = vi.fn();
    removeChildren = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock("@slotclientengine/rendercore/symbol", () => ({
  createSymbolPackageValueControllerFactory: vi.fn(() => undefined),
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
    state.runtime.applyViewport.mockReturnValue({
      variantId: "default",
      artSize: { width: 100, height: 100 },
      viewportSize: { width: 100, height: 100 },
      visibleRect: { x: 0, y: 0, width: 100, height: 100 },
      worldOffset: { x: 0, y: 0 },
      focusRectInViewport: { x: 10, y: 10, width: 80, height: 80 },
      reels: {},
    });
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

  it("atomically replaces and clears an independent symbols package", async () => {
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    document.body.append(host, diagnostics);
    const preview = new LayoutPreview(host, diagnostics);
    await preview.init();
    const { resource } = symbolResource();
    await preview.setSymbolPackage(resource as never, { columns: 2, rows: 2 });
    expect(resource.createCatalog).toHaveBeenCalledOnce();
    expect(preview.getSymbolPreviewSnapshot()).toMatchObject({
      status: "ready",
      selectedReelSet: "main",
    });
    await preview.setSymbolPackage(null);
    expect(resource.destroy).toHaveBeenCalledOnce();

    const broken = {
      createCatalog: vi.fn(async () => {
        throw new Error("bad symbols");
      }),
      destroy: vi.fn(),
    };
    await expect(
      preview.setSymbolPackage(broken as never, { columns: 2, rows: 2 }),
    ).rejects.toThrow(/bad symbols/);
    expect(broken.destroy).toHaveBeenCalledOnce();
    preview.destroy();
  });

  it("samples reel windows, renders runtime geometry and preserves the scene across relayout", async () => {
    state.runtime.applyViewport.mockReturnValue(gridSnapshot());
    const randomSource = {
      nextUint32: vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(0),
    };
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    document.body.append(host, diagnostics);
    const preview = new LayoutPreview(host, diagnostics, { randomSource });
    await preview.init();
    await preview.setLayout(imageManifest, assetBytes);
    const { resource, catalog, renderSymbols } = symbolResource();
    await preview.setSymbolPackage(resource as never, { columns: 2, rows: 2 });
    const sampled = preview.getSymbolPreviewSnapshot()!;
    expect(sampled.scene?.stopYs).toEqual([1, 0]);
    expect(sampled.scene?.symbols).toEqual([
      ["B", "A"],
      ["B", "A"],
    ]);
    expect(catalog.createRenderSymbol).toHaveBeenCalledTimes(4);
    expect(renderSymbols[0].position.set).toHaveBeenCalledWith(17, 21);
    expect(renderSymbols[1].position.set).toHaveBeenCalledWith(42, 21);
    expect(renderSymbols[2].position.set).toHaveBeenCalledWith(17, 44);
    expect(renderSymbols[2].scale.set).toHaveBeenCalledWith(1.5);
    expect(renderSymbols[2].setPresentationValue).toHaveBeenCalledWith(25);
    expect(renderSymbols[2].zIndex).toBe(10);
    preview.setPageSize({ width: 800, height: 600 });
    preview.setGuideVisibility({ showFocus: false, showReels: false });
    expect(preview.getSymbolPreviewSnapshot()?.scene).toBe(sampled.scene);
    expect(randomSource.nextUint32).toHaveBeenCalledTimes(2);
    expect(diagnostics.textContent).toContain("reel=main");
    preview.destroy();
  });

  it("requires explicit selection for multiple compatible sets and randomizes without rebuilding the catalog", async () => {
    const randomSource = { nextUint32: vi.fn(() => 0) };
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    document.body.append(host, diagnostics);
    const preview = new LayoutPreview(host, diagnostics, { randomSource });
    await preview.init();
    const { resource } = symbolResource({
      reels: {
        first: [[0], [1]],
        second: [[1], [0]],
        incompatible: [[0]],
      },
    });
    const pending = await preview.setSymbolPackage(resource as never, {
      columns: 2,
      rows: 2,
    });
    expect(pending).toMatchObject({
      status: "pending-selection",
      selectedReelSet: null,
      scene: null,
    });
    expect(randomSource.nextUint32).not.toHaveBeenCalled();
    const selected = preview.setSelectedReelSet("second");
    expect(selected.scene?.symbols).toEqual([
      ["B", "B"],
      ["A", "A"],
    ]);
    expect(() => preview.setSelectedReelSet("incompatible")).toThrow(
      /不可选择/,
    );
    const firstScene = selected.scene;
    const rerolled = preview.randomizeSymbols();
    expect(rerolled.scene).not.toBe(firstScene);
    expect(resource.createCatalog).toHaveBeenCalledOnce();
    preview.destroy();
  });

  it("keeps stops stable when an otherScene source changes and resamples on randomize", async () => {
    const randomSource = { nextUint32: vi.fn(() => 0) };
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    document.body.append(host, diagnostics);
    const preview = new LayoutPreview(host, diagnostics, { randomSource });
    await preview.init();
    const { resource } = symbolResource();
    const initial = await preview.setSymbolPackage(resource as never, {
      columns: 2,
      rows: 2,
    });
    const initialScene = initial?.scene;
    const initialStops = initialScene?.stopYs;
    const callsAfterScene = randomSource.nextUint32.mock.calls.length;

    const mapped = preview.setOtherSceneBindings([
      {
        symbol: "A",
        target: { kind: "legacy-presentation-value" },
        source: { kind: "fixed-number", value: 25 },
      },
    ]);
    expect(mapped.scene).toBe(initialScene);
    expect(mapped.scene?.stopYs).toBe(initialStops);
    expect(mapped.otherScene?.matrix).toEqual([
      [25, 0],
      [0, 25],
    ]);
    expect(randomSource.nextUint32).toHaveBeenCalledTimes(callsAfterScene);

    const rerolled = preview.randomizeSymbols();
    expect(rerolled.scene).not.toBe(initialScene);
    expect(randomSource.nextUint32).toHaveBeenCalledTimes(callsAfterScene + 2);
    preview.destroy();
  });

  it("resamples on rows changes and pauses on incompatible columns", async () => {
    const randomSource = { nextUint32: vi.fn(() => 0) };
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    document.body.append(host, diagnostics);
    const preview = new LayoutPreview(host, diagnostics, { randomSource });
    await preview.init();
    const { resource } = symbolResource();
    await preview.setSymbolPackage(resource as never, { columns: 2, rows: 2 });
    const resized = preview.setSymbolGrid({ columns: 2, rows: 3 });
    expect(resized?.scene?.rows).toBe(3);
    expect(randomSource.nextUint32).toHaveBeenCalledTimes(4);
    const incompatible = preview.setSymbolGrid({ columns: 3, rows: 3 });
    expect(incompatible).toMatchObject({
      status: "incompatible",
      selectedReelSet: null,
      scene: null,
    });
    expect(incompatible?.message).toContain("columns=3");
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

  it("discards a stale async symbols package and preserves the last complete package on replacement failure", async () => {
    const host = document.createElement("div");
    const diagnostics = document.createElement("div");
    document.body.append(host, diagnostics);
    const preview = new LayoutPreview(host, diagnostics, {
      randomSource: { nextUint32: () => 0 },
    });
    await preview.init();
    const current = symbolResource();
    await preview.setSymbolPackage(current.resource as never, {
      columns: 2,
      rows: 2,
    });

    let resolveCatalog!: (value: unknown) => void;
    const stale = symbolResource({
      createCatalog: () =>
        new Promise((resolve) => {
          resolveCatalog = resolve;
        }),
    });
    const pending = preview.setSymbolPackage(stale.resource as never, {
      columns: 2,
      rows: 2,
    });
    preview.randomizeSymbols();
    resolveCatalog(stale.catalog);
    await expect(pending).resolves.toBeNull();
    expect(stale.resource.destroy).toHaveBeenCalledOnce();
    expect(current.resource.destroy).not.toHaveBeenCalled();

    const incompatible = symbolResource({ reels: { six: [[0], [0], [0]] } });
    await expect(
      preview.setSymbolPackage(incompatible.resource as never, {
        columns: 2,
        rows: 2,
      }),
    ).rejects.toThrow(/没有兼容 reel set/);
    expect(incompatible.resource.destroy).toHaveBeenCalledOnce();
    expect(preview.getSymbolPreviewSnapshot()?.packageId).toBe(
      "symbols-fixture",
    );
    expect(current.resource.destroy).not.toHaveBeenCalled();
    preview.destroy();
  });
});
