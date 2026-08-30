import { describe, expect, it, vi } from "vitest";
import { createNewEditorProject } from "../src/model/editor-project.js";
import { EditorStore } from "../src/model/editor-store.js";

describe("EditorStore", () => {
  it("starts with a valid background-free centered project", () => {
    const store = new EditorStore(createNewEditorProject());
    expect(store.getSnapshot()).toMatchObject({
      errors: [],
      revision: 0,
      changeKind: "initial",
    });
  });

  it("classifies main placement and focus-rect edits as geometry", () => {
    const store = new EditorStore(createNewEditorProject());
    store.transact((project) => {
      project.gameModes.modes[0]!.mainVariants.landscape.x = 40;
      project.gameModes.modes[0]!.mainVariants.landscape.focusRect.x = -500;
    });
    expect(store.getSnapshot()).toMatchObject({
      errors: [],
      revision: 1,
      changeKind: "geometry",
    });
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
