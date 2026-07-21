import { describe, expect, it } from "vitest";
import {
  createNewEditorProject,
  type EditorGameModeTransitionDraft,
} from "../src/model/editor-project.js";
import { transitionsWorkspaceMarkup } from "../src/ui/transitions-workspace.js";

describe("transitions workspace", () => {
  it("uses strict resource/animation/event selects and excludes duplicate event names", () => {
    const project = createNewEditorProject("maximized-focus");
    project.gameModes.modes.push({
      id: "FreeGame",
      backgroundNodes: { default: "background" },
      nodeStates: {},
      symbols: null,
      awardCelebrationPopupId: null,
    });
    project.resources.set("bridge", {
      id: "bridge",
      kind: "spine",
      skeleton: "assets/bridge.json",
      atlas: "assets/bridge.atlas",
      textures: { "bridge.png": "assets/bridge.png" },
      animationNames: ["BG_FG"],
      animationEvents: {
        BG_FG: [
          { name: "SwitchScene", time: 0.5 },
          { name: "Duplicate", time: 0.2 },
          { name: "Duplicate", time: 0.8 },
        ],
      },
      bounds: { width: 1000, height: 1000 },
    });
    const transition: EditorGameModeTransitionDraft = {
      fromModeId: "BaseGame",
      toModeId: "FreeGame",
      resourceId: "bridge",
      animation: "BG_FG",
      switchEvent: "SwitchScene",
      placements: { default: { x: 500, y: 500, scale: 1 } },
    };
    project.gameModes.transitions.push(transition);
    const host = document.createElement("div");
    host.innerHTML = transitionsWorkspaceMarkup({
      project,
      selectedKey: "BaseGame::FreeGame",
      snapshot: {
        stableMode: "BaseGame",
        displayedMode: "BaseGame",
        targetMode: null,
        phase: "stable",
        transitionPhase: null,
        transition: null,
        stableSymbolPackage: null,
        displayedSymbolPackage: null,
        targetSymbolPackage: null,
        activeBackgroundNodes: ["background"],
      },
    });

    expect(host.querySelector("select[data-transition-resource]")).toBeTruthy();
    expect(
      host.querySelector("select[data-transition-animation]"),
    ).toBeTruthy();
    const event = host.querySelector(
      "select[data-transition-event]",
    ) as HTMLSelectElement;
    expect([...event.options].map((option) => option.value)).toEqual([
      "",
      "SwitchScene",
    ]);
    expect(host.querySelector("input[data-transition-event]")).toBeNull();
    expect(host.textContent).toContain("Duplicate × 2");
    expect(
      (host.querySelector("[data-play-transition]") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
