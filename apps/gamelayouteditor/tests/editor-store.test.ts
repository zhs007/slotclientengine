import { describe, expect, it, vi } from "vitest";
import {
  applySymbolPackageCellSize,
  cloneEditorProject,
  createNewEditorProject,
  createSplashFirstEditorProject,
  editorProjectToPreviewManifest,
  editorProjectToManifest,
  manifestToEditorProject,
  resetVariantGeometry,
  updateVariantFocusFromReel,
} from "../src/model/editor-project.js";
import { EditorStore } from "../src/model/editor-store.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("EditorStore", () => {
  it("uses art-relative focus geometry when the active mode has no reel", () => {
    const project = createSplashFirstEditorProject(
      "maximized-focus",
      "maximized-focus",
    );
    resetVariantGeometry(project, "default", { width: 1200, height: 800 });
    expect(project.gameModes.modes[0]?.reelEnabled).toBe(false);
    expect(project.variants.default.focusRect).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    });
    project.variants.default.focusOffsets = {
      left: 100,
      top: 50,
      right: -200,
      bottom: -150,
    };
    updateVariantFocusFromReel(project, "default");
    expect(project.variants.default.focusRect).toEqual({
      x: 100,
      y: 50,
      width: 900,
      height: 600,
    });
  });

  it("upgrades an editable v1 draft to latest v5 without inventing Splash", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    expect(project.gameModes.initialMode).toBe("BaseGame");
    expect(project.gameModes.modes.map((mode) => mode.id)).toEqual([
      "BaseGame",
    ]);
    const exported = editorProjectToManifest(project);
    expect(exported.version).toBe(5);
    expect(exported.runtimeAllocation.modes.BaseGame).toBeDefined();
    expect(exported).not.toHaveProperty("adaptation");
    expect(exported.gameModes.modes[0]).toMatchObject({
      id: "BaseGame",
      adaptation: { mode: "maximized-focus" },
    });
  });

  it("round-trips global event audio while preserving the legacy-audio gate", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    project.assets.set("assets/event-base.mp3", new Uint8Array([1, 2, 3]));
    project.resources.set("assets/event-base.mp3", {
      id: "assets/event-base.mp3",
      kind: "audio",
      path: "assets/event-base.mp3",
      mediaType: "audio/mpeg",
    });
    project.eventAudio = {
      version: 1,
      ignoreLegacyAudio: true,
      bindings: [
        {
          event: "gamelayout:/mode/BaseGame/state/stable/entered",
          endEvent: "gamelayout:/mode/BaseGame/state/stable/exited",
          audio: {
            name: "event-base",
            asset: {
              sources: [
                {
                  path: "assets/event-base.mp3",
                  mediaType: "audio/mpeg",
                },
              ],
            },
            category: "music",
            playback: "loop",
            voices: { maxConcurrent: 1, overflow: "restart-oldest" },
            focus: {},
          },
        },
      ],
    };

    const exported = editorProjectToManifest(project);
    expect(exported.eventAudio).toEqual(project.eventAudio);
    const imported = manifestToEditorProject(exported, project.assets);
    expect(imported.eventAudio).toEqual(project.eventAudio);
    expect(imported.resources.get("assets/event-base.mp3")).toMatchObject({
      kind: "audio",
      path: "assets/event-base.mp3",
    });
  });

  it("starts with a useful 5x3 reel instead of placeholder dimensions", () => {
    const project = createNewEditorProject("maximized-focus");
    expect(project.reel).toMatchObject({
      order: 999,
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

  it("applies package cellSize while preserving independent art geometry", () => {
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
    applySymbolPackageCellSize(bounded, { width: 200, height: 120 });
    expect(bounded.reel.cellWidth).toBe(200);
    expect(bounded.reel.cellHeight).toBe(120);
    expect(bounded.variants.default.focusRect).toEqual({
      x: -60,
      y: -60,
      width: 1120,
      height: 480,
    });
  });

  it("keeps invalid intermediate values and atomically replaces imports", () => {
    const store = new EditorStore(createNewEditorProject("maximized-focus"));
    expect(store.getSnapshot().errors[0]).toContain(
      "选择 Spine 背景时可在 Resource Picker 填写",
    );
    const listener = vi.fn();
    store.subscribe(listener);
    store.transact((draft) => {
      draft.reel.cellWidth = 0;
    });
    expect(store.getSnapshot().project.reel.cellWidth).toBe(0);
    expect(store.getSnapshot().errors[0]).toMatch(/有限正数/);
    store.replace(manifestToEditorProject(imageManifest, assetBytes));
    expect(store.getSnapshot().errors).toEqual([]);
    expect(store.getSnapshot().project.reel.gapX).toBe(5);
    expect(listener).toHaveBeenCalled();
  });

  it("classifies placement edits as geometry and resource changes as structural", () => {
    const store = new EditorStore(
      manifestToEditorProject(imageManifest, assetBytes),
    );
    store.transact((draft) => {
      draft.nodes[0]!.placements.default!.x = 4;
    });
    expect(store.getSnapshot().changeKind).toBe("geometry");
    store.transact((draft) => {
      draft.nodes[0]!.placements.default!.rotation = -90;
      draft.nodes[0]!.placements.default!.center = { x: 0.25, y: 0.75 };
    });
    expect(store.getSnapshot().changeKind).toBe("geometry");

    store.transact((draft) => {
      const resourceId = draft.nodes[0]!.resourceId;
      const resource = draft.resources.get(resourceId)!;
      if (resource.kind === "image")
        draft.resources.set(resourceId, {
          ...resource,
          path: "assets/replaced.png",
        });
    });
    expect(store.getSnapshot().changeKind).toBe("structural");
  });

  it("repairs legacy mode background ordering before strict validation", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    const baseNode = project.nodes[0]!;
    baseNode.id = "base-background";
    baseNode.order = 1;
    project.variants.default.backgroundNode = baseNode.id;
    project.gameModes.modes[0]!.backgroundNodes.default = baseNode.id;
    project.nodes.push({
      ...structuredClone(baseNode),
      id: "free-background",
      order: 0,
    });
    project.gameModes.modes.push({
      ...structuredClone(project.gameModes.modes[0]!),
      id: "FreeGame",
      backgroundNodes: { default: "free-background" },
    });

    const store = new EditorStore(project);

    expect(store.getSnapshot().errors).toEqual([]);
    expect(
      store.getSnapshot().project.nodes.map((node) => [node.id, node.order]),
    ).toEqual([
      ["base-background", 0],
      ["free-background", 1],
    ]);
  });

  it("keeps node orders unique when a reel order collides", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    project.reel.order = 0;
    project.symbolDependencies.set("demo-symbols", {
      packageId: "demo-symbols",
      rootKey: "symbols.package.json",
      keys: ["symbols.package.json"],
    });
    project.assets.set("symbols.package.json", new Uint8Array([1]));
    project.gameModes.modes[0]!.symbols = {
      packageId: "demo-symbols",
      reelSet: "main",
      renderMode: "standard",
    };

    const store = new EditorStore(project);

    expect(store.getSnapshot().errors).toEqual([]);
    expect(store.getSnapshot().project.reel.order).toBe(0);
    expect(store.getSnapshot().project.nodes.map((node) => node.order)).toEqual(
      [1],
    );
  });

  it("deduplicates identical external errors and formats non-Error values", () => {
    const store = new EditorStore(createNewEditorProject("maximized-focus"));
    const validationErrors = store.getSnapshot().errors;
    const listener = vi.fn();
    store.subscribe(listener);
    listener.mockClear();

    store.setExternalError("offline");
    expect(store.getSnapshot().errors).toBe(validationErrors);
    expect(store.getSnapshot().externalError).toBe("offline");
    expect(listener).toHaveBeenCalledOnce();

    store.setExternalError("offline");
    expect(listener).toHaveBeenCalledOnce();

    store.clearExternalError();
    expect(store.getSnapshot().externalError).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
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
    expect(
      editorProjectToManifest(project).gameModes.modes.find(
        (mode) => mode.id === project.gameModes.initialMode,
      )?.adaptation.mode,
    ).toBe("orientation-focus");
    const clone = cloneEditorProject(project);
    clone.assets.get("assets/bg.png")![0] = 99;
    expect(project.assets.get("assets/bg.png")![0]).toBe(137);
  });

  it("builds a strict single-variant draft preview while the other background is missing", () => {
    const project = createNewEditorProject("orientation-focus");
    project.resources.set("bg", {
      id: "bg",
      kind: "image",
      path: "assets/bg.png",
      size: { width: 1000, height: 600 },
    });
    project.assets.set("assets/bg.png", new Uint8Array([1]));
    project.nodes.push({
      id: "bg",
      order: 0,
      resourceId: "bg",
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
    expect(preview?.version).toBe(1);
    if (!preview || preview.version !== 1)
      throw new Error("incomplete preview must use a v1 effective fallback");
    expect(preview.adaptation.mode).toBe("maximized-focus");
    expect(preview.nodes[0].placements.default).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      center: { x: 0.5, y: 0.5 },
    });
  });

  it("deduplicates imported filename-key resources by full material signature while preserving per-node animation", () => {
    const skeleton = new TextEncoder().encode(
      JSON.stringify({
        skeleton: { spine: "4.3.23", width: 100, height: 100 },
        animations: { Idle: {}, Win: {} },
      }),
    );
    const manifest = {
      ...imageManifest,
      nodes: [
        {
          id: "bg",
          order: 0,
          resource: {
            kind: "spine" as const,
            skeleton: "assets/hero.json",
            atlas: "assets/hero.atlas",
            textures: { "hero.png": "assets/hero.png" },
            defaultAnimation: "Idle",
            loop: true as const,
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
        {
          id: "fx",
          order: 1,
          resource: {
            kind: "spine" as const,
            skeleton: "assets/hero.json",
            atlas: "assets/hero.atlas",
            textures: { "hero.png": "assets/hero.png" },
            defaultAnimation: "Win",
            loop: true as const,
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
    };
    const project = manifestToEditorProject(
      manifest,
      new Map([
        ["assets/hero.json", skeleton],
        ["assets/hero.atlas", new Uint8Array([1])],
        ["assets/hero.png", new Uint8Array([2])],
      ]),
    );
    expect(project.resources.size).toBe(1);
    expect(project.nodes[0].resourceId).toBe(project.nodes[1].resourceId);
    expect(
      project.nodes.map((node) =>
        node.playback?.kind === "loop" ? node.playback.animation : "",
      ),
    ).toEqual(["Idle", "Win"]);
    expect(
      editorProjectToManifest(project).nodes.map((node) =>
        node.resource.kind === "spine" && "defaultAnimation" in node.resource
          ? node.resource.defaultAnimation
          : "",
      ),
    ).toEqual(["Idle", "Win"]);
  });
});
