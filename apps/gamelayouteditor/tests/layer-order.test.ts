import { describe, expect, it } from "vitest";
import {
  createNewEditorProject,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { EditorStore } from "../src/model/editor-store.js";
import {
  setNodeOrder,
  setPopupOrder,
  setReelOrder,
} from "../src/model/layer-order.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("scene layer order", () => {
  it("edits ordinary layers across the reel and rejects exact conflicts", () => {
    const project = createNewEditorProject("maximized-focus");
    project.nodes.push(
      {
        id: "bg",
        order: 0,
        resourceId: "bg",
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
      {
        id: "overlay",
        order: 1,
        resourceId: "overlay",
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
    );
    project.gameModes.modes[0]!.backgroundNodes.default = "bg";
    project.popupDependencies.set("entry", {
      id: "entry",
      type: "spine",
      rootKey: "entry-popup.manifest.json",
      keys: ["entry-popup.manifest.json"],
      order: 2000,
      placements: { default: { x: 0, y: 0, scale: 1 } },
    });

    setNodeOrder(project, "overlay", 1000);
    expect(project.nodes[1]!.order).toBe(1000);
    expect(() => setNodeOrder(project, "overlay", 999)).toThrow(/main reel/);
    expect(() => setReelOrder(project, 1000)).toThrow(/图层 overlay/);
    expect(() => setPopupOrder(project, "entry", 1000)).toThrow(/图层 overlay/);
    expect(() => setPopupOrder(project, "entry", 500)).toThrow(/大于全部图层/);
    setPopupOrder(project, "entry", 2001);
    expect(project.popupDependencies.get("entry")?.order).toBe(2001);
  });

  it("preserves sparse authored order through unrelated store transactions", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    project.nodes.push({
      id: "overlay",
      order: 1000,
      resourceId: "bg",
      placements: { default: { x: 1, y: 2, scale: 1 } },
    });
    const store = new EditorStore(project);
    store.transact((draft) => {
      draft.nodes.find((node) => node.id === "overlay")!.placements.default!.x =
        5;
    });
    expect(
      store.getSnapshot().project.nodes.find((node) => node.id === "overlay")
        ?.order,
    ).toBe(1000);
  });
});
