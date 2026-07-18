import { describe, expect, it } from "vitest";
import { createNewEditorProject } from "../src/model/editor-project.js";
import {
  addLayerFromResource,
  assignBackgroundResource,
} from "../src/model/resource-commands.js";
import {
  createResourcePickerState,
  getResourcePickerCandidates,
} from "../src/ui/resource-picker.js";
import {
  createEditorUiSession,
  defaultLayoutSelection,
  normalizeLayoutSelection,
} from "../src/ui/ui-session.js";

function projectWithResources() {
  const project = createNewEditorProject("orientation-focus");
  project.resources.set("hero", {
    id: "hero",
    kind: "spine",
    skeleton: "assets/hero.json",
    atlas: "assets/hero.atlas",
    textures: { "hero.png": "assets/hero.png" },
    animationNames: ["Idle", "Win"],
  });
  project.resources.set("background", {
    id: "background",
    kind: "image",
    path: "assets/background.png",
    size: { width: 1000, height: 600 },
  });
  project.assets.set("assets/hero.json", new Uint8Array([1]));
  project.assets.set("assets/hero.atlas", new Uint8Array([2]));
  project.assets.set("assets/hero.png", new Uint8Array([3]));
  project.assets.set("assets/background.png", new Uint8Array([4]));
  return project;
}

describe("editor UI session and Resource Picker view model", () => {
  it("starts new sessions in Assets without leaking UI state into the project", () => {
    const session = createEditorUiSession();
    session.resourceQuery = "hero";
    session.expandedResourceIds.add("hero");
    session.symbolsDrawerOpen = true;
    const project = createNewEditorProject("maximized-focus");
    expect(session.activeTab).toBe("assets");
    expect(project).not.toHaveProperty("activeTab");
    expect(project).not.toHaveProperty("resourceQuery");
    expect(project).not.toHaveProperty("symbolsDrawerOpen");
  });

  it("normalizes deleted selections and prefers imported backgrounds", () => {
    const project = projectWithResources();
    assignBackgroundResource({
      project,
      variant: "landscape",
      resourceId: "background",
      nodeId: "landscape-bg",
    });
    expect(defaultLayoutSelection(project)).toEqual({
      kind: "background",
      variant: "landscape",
    });
    expect(
      normalizeLayoutSelection(project, {
        kind: "layer",
        nodeId: "deleted",
      }),
    ).toEqual({ kind: "background", variant: "landscape" });
  });

  it("searches and filters structured candidates without auto-selecting or guessing animation", () => {
    const project = projectWithResources();
    const state = createResourcePickerState(project, { kind: "add-layer" });
    expect(state.selectedResourceId).toBe("");
    expect(state.defaultAnimation).toBe("");
    state.query = "hero.json";
    state.type = "spine";
    expect(getResourcePickerCandidates(project, state)).toEqual([
      expect.objectContaining({
        resourceId: "hero",
        kind: "spine",
        primaryPath: "assets/hero.json",
        status: "ready",
        referenceCount: 0,
      }),
    ]);
  });

  it("reports references and incomplete no-bounds Spine background candidates", () => {
    const project = projectWithResources();
    addLayerFromResource({
      project,
      resourceId: "hero",
      nodeId: "hero-layer",
      variants: ["landscape"],
      defaultAnimation: "Idle",
    });
    const state = createResourcePickerState(project, {
      kind: "assign-background",
      variant: "portrait",
    });
    state.query = "hero";
    expect(getResourcePickerCandidates(project, state)[0]).toMatchObject({
      resourceId: "hero",
      status: "incomplete",
      referenceCount: 1,
    });
  });
});
