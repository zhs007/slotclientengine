import { describe, expect, it, vi } from "vitest";
import { createNewEditorProject } from "../src/model/editor-project.js";
import { EditorStore } from "../src/model/editor-store.js";
import { addGameMode } from "../src/model/game-mode-commands.js";
import { setLayerScopeGlobal } from "../src/model/resource-commands.js";

describe("EditorStore", () => {
  it("starts with a valid background-free centered project", () => {
    const store = new EditorStore(createNewEditorProject());
    expect(store.getSnapshot()).toMatchObject({
      errors: [],
      revision: 0,
      changeKind: "initial",
    });
  });

  it("classifies main placement and focus-outset edits as geometry", () => {
    const store = new EditorStore(createNewEditorProject());
    store.transact((project) => {
      project.gameModes.modes[0]!.mainVariants.landscape.x = 40;
      project.gameModes.modes[0]!.mainVariants.landscape.focusOffsets.left = 100;
    });
    expect(store.getSnapshot()).toMatchObject({
      errors: [],
      revision: 1,
      changeKind: "geometry",
    });
  });

  it("preserves authored focus outsets when the main grid changes", () => {
    const project = createNewEditorProject();
    project.gameModes.modes[0]!.mainVariants.landscape.focusOffsets = {
      left: 10,
      top: 20,
      right: 30,
      bottom: 40,
    };
    const store = new EditorStore(project);

    store.transact((draft) => {
      draft.reel.columns = 6;
    });

    const snapshot = store.getSnapshot();
    expect(
      snapshot.project.gameModes.modes[0]!.mainVariants.landscape.focusOffsets,
    ).toEqual({ left: 10, top: 20, right: 30, bottom: 40 });
    expect(
      snapshot.project.gameModes.modes[0]!.mainVariants.landscape,
    ).not.toHaveProperty("focusRect");
  });

  it("classifies immutable main-grid edits as structural", () => {
    const store = new EditorStore(createNewEditorProject());
    store.transact((project) => {
      project.reel.columns = 6;
    });
    expect(store.getSnapshot()).toMatchObject({
      errors: [],
      revision: 1,
      changeKind: "structural",
    });
  });

  it("classifies ordinary-layer scope edits as structural", () => {
    const project = createNewEditorProject();
    addGameMode(project, "FreeGame");
    project.resources.set("background.png", {
      id: "background.png",
      kind: "image",
      path: "background.png",
      size: { width: 1, height: 1 },
    });
    project.assets.set("background.png", new Uint8Array([1]));
    project.nodes.push({
      id: "background",
      order: 0,
      resourceId: "background.png",
      placements: {
        landscape: { x: 0, y: 0, scale: 1 },
        portrait: { x: 0, y: 0, scale: 1 },
      },
    });
    const store = new EditorStore(project);

    store.transact((draft) =>
      setLayerScopeGlobal(draft, "background", false, "BaseGame"),
    );

    expect(store.getSnapshot()).toMatchObject({
      errors: [],
      revision: 1,
      changeKind: "structural",
    });
  });

  it("reports validation and external errors without mutating prior snapshots", () => {
    const store = new EditorStore(createNewEditorProject());
    const first = store.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.transact((project) => {
      project.reel.columns = 0;
    });
    expect(store.getSnapshot().errors[0]).toMatch(/columns|positive/u);
    expect(first.errors).toEqual([]);
    store.setExternalError(new Error("preview failed"));
    expect(store.getSnapshot().externalError).toBe("preview failed");
    store.clearExternalError();
    expect(store.getSnapshot().externalError).toBeNull();
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
