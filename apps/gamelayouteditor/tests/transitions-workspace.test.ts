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
      kind: "spine",
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
        preparedTargetMode: null,
        transitionKind: null,
        mediaTimeSeconds: null,
        mediaDurationSeconds: null,
        fadeProgress: null,
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

  it("lists only video resources and derives fade timing and prepared controls", () => {
    const project = createNewEditorProject("orientation-focus");
    project.gameModes.modes.push({
      id: "FreeGame",
      backgroundNodes: { landscape: "bg", portrait: "bg" },
      nodeStates: {},
      symbols: null,
      awardCelebrationPopupId: null,
    });
    project.resources.set("image", {
      id: "image",
      kind: "image",
      path: `assets/${"a".repeat(64)}.png`,
      size: { width: 1, height: 1 },
    });
    project.resources.set("clip", {
      id: "clip",
      kind: "video",
      path: `assets/${"b".repeat(64)}.mp4`,
      mimeType: "video/mp4",
      size: { width: 1280, height: 720 },
      durationSeconds: 3.625,
      hasAudio: true,
    });
    project.gameModes.transitions.push({
      kind: "video",
      fromModeId: "BaseGame",
      toModeId: "FreeGame",
      resourceId: "clip",
      fit: "contain",
      fadeOutSeconds: 0.5,
    });
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
        preparedTargetMode: "FreeGame",
        transitionKind: "video",
        mediaTimeSeconds: null,
        mediaDurationSeconds: 3.625,
        fadeProgress: null,
        stableSymbolPackage: null,
        displayedSymbolPackage: null,
        targetSymbolPackage: null,
        activeBackgroundNodes: ["bg"],
      },
    });
    const resource = host.querySelector(
      "select[data-transition-video-resource]",
    ) as HTMLSelectElement;
    expect([...resource.options].map((option) => option.value)).toEqual([
      "",
      "clip",
    ]);
    expect(host.textContent).toContain("3.125s");
    expect(host.textContent).toContain("1280×720");
    expect(
      (host.querySelector("[data-prepare-transition]") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (
        host.querySelector(
          "[data-cancel-prepared-transition]",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      (host.querySelector("[data-play-transition]") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(host.querySelector("video")).toBeNull();
  });
});
