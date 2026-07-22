import { describe, expect, it, vi } from "vitest";
import { ImageStringEditorStore } from "../src/model/editor-store.js";

describe("editor store", () => {
  it("commits and notifies only after validation succeeds", () => {
    const store = new ImageStringEditorStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.transact((draft) => Object.assign(draft, { id: "changed" }));
    expect(store.project.id).toBe("changed");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.replace(store.project);
    expect(listener).toHaveBeenCalledOnce();
    expect(() =>
      store.transact(
        (draft) => Object.assign(draft, { id: "bad" }),
        () => {
          throw new Error("invalid");
        },
      ),
    ).toThrow("invalid");
    expect(store.project.id).toBe("changed");
    expect(listener).toHaveBeenCalledOnce();
  });
});
