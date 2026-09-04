import { describe, expect, it, vi } from "vitest";
import { createNewEditorProject } from "../src/model/editor-project.js";
import { EditorStore } from "../src/model/editor-store.js";
import { addGameMode } from "../src/model/game-mode-commands.js";
import { setLayerScopeGlobal } from "../src/model/resource-commands.js";

describe("EditorStore", () => {
  it("reuses payloads for configuration edits without copying or scanning bytes", () => {
    const project = createNewEditorProject();
    const bytes = new Uint8Array(1024 * 1024);
    project.assets.set("unused.bin", bytes);
    const store = new EditorStore(project);
    const before = store.getSnapshot();
    const slice = vi.spyOn(bytes, "slice");
    const every = vi.spyOn(bytes, "every");
    store.transactConfiguration((draft) => {
      draft.gameModes.modes[0]!.mainVariants.landscape.x = 42;
    });
    expect(store.getSnapshot().project.assets).toBe(before.project.assets);
    expect(store.getSnapshot().changeKind).toBe("geometry");
    expect(before.project.gameModes.modes[0]!.mainVariants.landscape.x).toBe(0);
    expect(slice).not.toHaveBeenCalled();
    expect(every).not.toHaveBeenCalled();
  });

  it("rejects payload access in configuration commands and rolls back", () => {
    const store = new EditorStore(createNewEditorProject());
    const before = store.getSnapshot();
    expect(() =>
      store.transactConfiguration((draft) => {
        draft.id = "changed";
        draft.assets.clear();
      }),
    ).toThrow("配置事务不能访问资源 bytes");
    expect(() =>
      store.transactConfiguration((draft) => {
        draft.assets = new Map();
      }),
    ).toThrow("配置事务不能修改资源 bytes");
    expect(store.getSnapshot()).toEqual(before);
  });

  it("keeps byte mutation and failure isolated in full resource transactions", () => {
    const project = createNewEditorProject();
    project.assets.set("unused.bin", new Uint8Array([1]));
    const store = new EditorStore(project);
    const before = store.getSnapshot();
    expect(() =>
      store.transact((draft) => {
        draft.assets.get("unused.bin")![0] = 2;
        throw new Error("cancel");
      }),
    ).toThrow("cancel");
    expect(before.project.assets.get("unused.bin")![0]).toBe(1);
    store.transact((draft) => {
      draft.assets.get("unused.bin")![0] = 3;
    });
    expect(store.getSnapshot().changeKind).toBe("structural");
    expect(store.getSnapshot().project.assets.get("unused.bin")![0]).toBe(3);
    expect(before.project.assets.get("unused.bin")![0]).toBe(1);
  });

  it("selects an authoring mode without copying assets or changing the preview revision", () => {
    const project = createNewEditorProject();
    addGameMode(project, "FreeGame");
    const bytes = new Uint8Array([1, 2, 3]);
    project.assets.set("unused.bin", bytes);
    const store = new EditorStore(project);
    const before = store.getSnapshot();
    const slice = vi.spyOn(bytes, "slice");
    const listener = vi.fn();
    store.subscribe(listener);

    store.selectGameMode("FreeGame");
    const after = store.getSnapshot();
    expect(after.project.gameModes.activeModeId).toBe("FreeGame");
    expect(before.project.gameModes.activeModeId).toBe("BaseGame");
    expect(after.revision).toBe(before.revision);
    expect(after.project.assets).toBe(before.project.assets);
    expect(slice).not.toHaveBeenCalled();
    store.selectGameMode("FreeGame");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(() => store.selectGameMode("missing")).toThrow("未知游戏模式");
    expect(store.getSnapshot().project).toBe(after.project);
  });

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
