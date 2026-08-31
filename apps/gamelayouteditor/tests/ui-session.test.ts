import { describe, expect, it } from "vitest";
import { createNewEditorProject } from "../src/model/editor-project.js";
import {
  addLayerFromResource,
  setLayerScopeGlobal,
  setLayerScopeVisibility,
} from "../src/model/resource-commands.js";
import { addGameMode } from "../src/model/game-mode-commands.js";
import {
  createResourcePickerState,
  getResourcePickerCandidates,
} from "../src/ui/resource-picker.js";
import {
  createEditorUiSession,
  defaultLayoutSelection,
  normalizeLayoutSelection,
} from "../src/ui/ui-session.js";
import { layoutWorkspaceMarkup } from "../src/ui/layout-workspace.js";

function projectWithResources() {
  const project = createNewEditorProject();
  project.resources.set("hero", {
    id: "hero",
    kind: "spine",
    skeleton: "assets/hero.json",
    atlas: "assets/hero.atlas",
    textures: { "hero.png": "assets/hero.png" },
    animationNames: ["Idle", "Win"],
    animationEvents: { Idle: [], Win: [] },
    bounds: { width: 3744.3176, height: 2371.955 },
  });
  project.resources.set("background", {
    id: "background",
    kind: "image",
    path: "assets/background.png",
    size: { width: 1000, height: 600 },
  });
  return project;
}

describe("editor UI session and Resource Picker view model", () => {
  it("keeps UI state outside the project and defaults selection to main", () => {
    const session = createEditorUiSession();
    session.resourceQuery = "hero";
    session.expandedResourceIds.add("hero");
    const project = createNewEditorProject();

    expect(session.activeTab).toBe("assets");
    expect(project).not.toHaveProperty("activeTab");
    expect(defaultLayoutSelection(project)).toEqual({
      kind: "reel",
      reelId: "main",
    });
    expect(
      normalizeLayoutSelection(project, { kind: "layer", nodeId: "deleted" }),
    ).toEqual({ kind: "reel", reelId: "main" });
  });

  it("searches structured candidates without guessing an animation", () => {
    const project = projectWithResources();
    const state = createResourcePickerState(project, { kind: "add-layer" });
    expect(state.selectedResourceId).toBe("");
    expect(state.defaultAnimation).toBe("");
    expect(state.variants).toEqual(["landscape", "portrait"]);
    state.query = "hero.json";
    state.type = "spine";
    expect(getResourcePickerCandidates(project, state)).toEqual([
      expect.objectContaining({
        resourceId: "hero",
        kind: "spine",
        status: "ready",
        referenceCount: 0,
      }),
    ]);
  });

  it("preserves a compatible Spine animation when reopening layer rebind", () => {
    const project = projectWithResources();
    addLayerFromResource({
      project,
      resourceId: "hero",
      nodeId: "hero-layer",
      variants: ["landscape"],
      defaultAnimation: "Win",
    });
    const state = createResourcePickerState(
      project,
      { kind: "rebind-layer", nodeId: "hero-layer" },
      "hero",
    );
    expect(state.selectedResourceId).toBe("hero");
    expect(state.defaultAnimation).toBe("Win");
  });

  it("renders ordinary-layer mode scope and orientation visibility", () => {
    const project = projectWithResources();
    addGameMode(project, "FreeGame");
    addLayerFromResource({
      project,
      resourceId: "background",
      nodeId: "free-only",
      variants: ["landscape"],
    });
    setLayerScopeGlobal(project, "free-only", false, "FreeGame");

    const markup = layoutWorkspaceMarkup(
      project,
      { kind: "layer", nodeId: "free-only" },
      "BaseGame",
      createEditorUiSession(),
      "portrait",
    );
    expect(markup).toContain('data-currently-hidden="true"');
    expect(markup).toContain('data-layer-global="free-only"');
    expect(markup).not.toMatch(/data-layer-global="free-only" checked/u);
    expect(markup).toContain('data-layer-scope-mode="FreeGame"');
    expect(markup).toContain('data-layer-scope-variant="landscape"');
    expect(markup).toContain("FreeGame · landscape");

    setLayerScopeVisibility(
      project,
      "free-only",
      "BaseGame",
      "landscape",
      true,
    );
    const multiModeMarkup = layoutWorkspaceMarkup(
      project,
      { kind: "layer", nodeId: "free-only" },
      "BaseGame",
      createEditorUiSession(),
      "landscape",
    );
    expect(multiModeMarkup).not.toContain('data-currently-hidden="true"');
    expect(multiModeMarkup).toContain(
      "BaseGame · landscape；FreeGame · landscape",
    );
  });
});
