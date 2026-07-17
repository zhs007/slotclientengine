import { describe, expect, it, vi } from "vitest";
import {
  applySymbolPackageCellSize,
  cloneEditorProject,
  createNewEditorProject,
  editorProjectToPreviewManifest,
  editorProjectToManifest,
  manifestToEditorProject,
  updateVariantFocusFromReel,
} from "../src/model/editor-project.js";
import { EditorStore } from "../src/model/editor-store.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("EditorStore", () => {
  it("starts with a useful 5x3 reel instead of placeholder dimensions", () => {
    const project = createNewEditorProject("maximized-focus");
    expect(project.reel).toMatchObject({
      columns: 5,
      rows: 3,
      cellWidth: 160,
      cellHeight: 160,
      gapX: 0,
      gapY: 0,
    });
    expect(project.variants.default.focusOffsets).toEqual({
      left: -60,
      top: -60,
      right: 60,
      bottom: 60,
    });
  });

  it("derives focus rect from persistent reel-edge offsets", () => {
    const project = createNewEditorProject("maximized-focus");
    project.variants.default.artSize = { width: 2000, height: 2000 };
    project.reel.placements.default = { x: 600, y: 760 };
    updateVariantFocusFromReel(project, "default");
    expect(project.variants.default.focusRect).toEqual({
      x: 540,
      y: 700,
      width: 920,
      height: 600,
    });

    project.reel.placements.default = { x: 640, y: 700 };
    updateVariantFocusFromReel(project, "default");
    expect(project.variants.default.focusOffsets).toEqual({
      left: -60,
      top: -60,
      right: 60,
      bottom: 60,
    });
    expect(project.variants.default.focusRect).toEqual({
      x: 580,
      y: 640,
      width: 920,
      height: 600,
    });
  });

  it("applies package cellSize while preserving grid topology and rejects art overflow atomically", () => {
    const store = new EditorStore(createNewEditorProject("maximized-focus"));
    store.transact((draft) =>
      applySymbolPackageCellSize(draft, { width: 120, height: 120 }),
    );
    expect(store.getSnapshot().project.reel).toMatchObject({
      columns: 5,
      rows: 3,
      cellWidth: 120,
      cellHeight: 120,
      gapX: 0,
      gapY: 0,
    });

    const fitting = createNewEditorProject("maximized-focus");
    fitting.variants.default.artSize = { width: 2000, height: 2000 };
    fitting.reel.placements.default = { x: 600, y: 700 };
    updateVariantFocusFromReel(fitting, "default");
    applySymbolPackageCellSize(fitting, { width: 120, height: 120 });
    expect(fitting.variants.default.focusRect).toEqual({
      x: 540,
      y: 640,
      width: 720,
      height: 480,
    });

    const bounded = createNewEditorProject("maximized-focus");
    bounded.variants.default.artSize = { width: 500, height: 500 };
    bounded.reel.placements.default = { x: 0, y: 0 };
    updateVariantFocusFromReel(bounded, "default");
    const boundedStore = new EditorStore(bounded);
    expect(() =>
      boundedStore.transact((draft) =>
        applySymbolPackageCellSize(draft, { width: 200, height: 120 }),
      ),
    ).toThrow(/越出 art/);
    expect(boundedStore.getSnapshot().project.reel.cellWidth).toBe(160);
    expect(boundedStore.getSnapshot().project.reel.cellHeight).toBe(160);
  });

  it("keeps invalid intermediate values and atomically replaces imports", () => {
    const store = new EditorStore(createNewEditorProject("maximized-focus"));
    const listener = vi.fn();
    store.subscribe(listener);
    store.transact((draft) => {
      draft.reel.cellWidth = 0;
    });
    expect(store.getSnapshot().project.reel.cellWidth).toBe(0);
    expect(store.getSnapshot().errors[0]).toMatch(/positive/);
    store.replace(manifestToEditorProject(imageManifest, assetBytes));
    expect(store.getSnapshot().errors).toEqual([]);
    expect(store.getSnapshot().project.reel.gapX).toBe(5);
    expect(listener).toHaveBeenCalled();
  });

  it("round-trips an orientation project without sharing asset bytes", () => {
    const dualManifest = {
      ...imageManifest,
      id: "dual",
      adaptation: {
        mode: "orientation-focus" as const,
        variants: {
          landscape: {
            artSize: { width: 100, height: 100 },
            focusRect: { x: 10, y: 10, width: 80, height: 80 },
            frameFocusRect: { width: 80, height: 80 },
            backgroundNode: "bg",
          },
          portrait: {
            artSize: { width: 100, height: 120 },
            focusRect: { x: 10, y: 20, width: 80, height: 80 },
            frameFocusRect: { width: 80, height: 80 },
            minFocusMargin: { left: 5, right: 5 },
            backgroundNode: "bg",
          },
        },
      },
      nodes: [
        {
          ...imageManifest.nodes[0],
          placements: {
            landscape: { x: 0, y: 0, scale: 1 },
            portrait: { x: 0, y: 0, scale: 1 },
          },
        },
      ],
      reels: {
        main: {
          ...imageManifest.reels.main,
          placements: {
            landscape: { x: 20, y: 20 },
            portrait: { x: 20, y: 20 },
          },
        },
      },
    };
    const project = manifestToEditorProject(dualManifest, assetBytes);
    expect(project.variants.landscape.focusOffsets).toEqual({
      left: -10,
      top: -10,
      right: 25,
      bottom: 27,
    });
    expect(project.variants.portrait.minFocusMargin).toEqual({
      left: 5,
      right: 5,
      top: 0,
      bottom: 0,
    });
    expect(editorProjectToManifest(project).adaptation.mode).toBe(
      "orientation-focus",
    );
    const clone = cloneEditorProject(project);
    clone.assets.get("assets/bg.png")![0] = 99;
    expect(project.assets.get("assets/bg.png")![0]).toBe(1);
  });

  it("builds a strict single-variant draft preview while the other background is missing", () => {
    const project = createNewEditorProject("orientation-focus");
    project.nodes.push({
      id: "bg",
      order: 0,
      resource: {
        kind: "image",
        path: "assets/bg.png",
        size: { width: 1000, height: 600 },
      },
      placements: { landscape: { x: 0, y: 0, scale: 1 } },
    });
    project.variants.landscape = {
      ...project.variants.landscape,
      artSize: { width: 1000, height: 600 },
      focusRect: { x: 40, y: 40, width: 920, height: 520 },
      frameFocusRect: { width: 920, height: 520 },
      backgroundNode: "bg",
    };
    project.reel.cellWidth = 120;
    project.reel.cellHeight = 100;
    project.reel.placements.landscape = { x: 200, y: 150 };
    const preview = editorProjectToPreviewManifest(project, "landscape");
    expect(preview?.adaptation.mode).toBe("maximized-focus");
    expect(preview?.nodes[0].placements.default).toEqual({
      x: 0,
      y: 0,
      scale: 1,
    });
  });
});
