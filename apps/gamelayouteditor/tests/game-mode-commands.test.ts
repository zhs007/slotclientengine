import { describe, expect, it } from "vitest";
import { createNewEditorProject } from "../src/model/editor-project.js";
import {
  addGameMode,
  bindGameModePopup,
  deleteGameMode,
  deletePopupDependency,
  importPopupDependency,
  renameGameMode,
  replacePopupDependency,
  setGameModeNodeState,
  setInitialGameMode,
  setPopupPlacement,
  synchronizeGameModeNodeStates,
} from "../src/model/game-mode-commands.js";
import {
  renameNode,
  renameSpineState,
} from "../src/model/resource-commands.js";

describe("game mode and popup dependency commands", () => {
  it("adds, renames, selects and deletes generic modes atomically", () => {
    const project = createNewEditorProject("maximized-focus");
    addGameMode(project, "FreeGame");
    expect(project.gameModes.modes.map((mode) => mode.id)).toEqual([
      "BaseGame",
      "FreeGame",
    ]);
    expect(() => addGameMode(project, "FreeGame")).toThrow(/已存在/);
    expect(() => addGameMode(project, "bad id")).toThrow(/必须匹配/);
    renameGameMode(project, "FreeGame", "FG");
    renameGameMode(project, "FG", "FG");
    expect(() => renameGameMode(project, "FG", "BaseGame")).toThrow(/已存在/);
    setInitialGameMode(project, "FG");
    expect(project.gameModes.initialMode).toBe("FG");
    renameGameMode(project, "FG", "FreeGame");
    expect(project.gameModes.initialMode).toBe("FreeGame");
    expect(() => deleteGameMode(project, "FreeGame")).toThrow(/initial/);
    setInitialGameMode(project, "BaseGame");
    deleteGameMode(project, "FreeGame");
    expect(() => deleteGameMode(project, "BaseGame")).toThrow(/至少/);
    expect(() => renameGameMode(project, "Missing", "Other")).toThrow(/未知/);
    expect(() => setInitialGameMode(project, "Missing")).toThrow(/未知/);
    addGameMode(project, "Other");
    expect(() => deleteGameMode(project, "Missing")).toThrow(/未知/);
  });

  it("imports without binding, replaces by exact id and protects references", () => {
    const project = createNewEditorProject("orientation-focus");
    const imported = popup("celebration", 1);
    importPopupDependency(project, imported);
    expect(project.gameModes.modes[0].awardCelebrationPopupId).toBeNull();
    expect(project.popupDependencies.get("celebration")?.placements).toEqual({
      landscape: { x: 0, y: 0, scale: 1 },
      portrait: { x: 0, y: 0, scale: 1 },
    });
    expect(() => importPopupDependency(project, imported)).toThrow(/已存在/);
    bindGameModePopup(project, "BaseGame", "celebration");
    expect(() => deletePopupDependency(project, "celebration")).toThrow(
      /BaseGame/,
    );
    const placement = project.popupDependencies.get("celebration")!.placements;
    setPopupPlacement(project, "celebration", "landscape", {
      x: 12,
      y: -8,
      scale: 0.9,
    });
    replacePopupDependency(project, "celebration", popup("celebration", 9));
    expect(project.popupDependencies.get("celebration")!.placements).toBe(
      placement,
    );
    expect(
      project.popupDependencies
        .get("celebration")!
        .files.get("popup.manifest.json")![0],
    ).toBe(9);
    expect(() =>
      replacePopupDependency(project, "celebration", popup("other", 2)),
    ).toThrow(/必须保持/);
    expect(() =>
      replacePopupDependency(project, "missing", popup("missing", 2)),
    ).toThrow(/未知/);
    expect(() =>
      setPopupPlacement(project, "missing", "portrait", {
        x: 0,
        y: 0,
        scale: 1,
      }),
    ).toThrow(/未知/);
    expect(() =>
      setPopupPlacement(project, "celebration", "portrait", {
        x: 0,
        y: 0,
        scale: 0,
      }),
    ).toThrow(/正数 scale/);
    bindGameModePopup(project, "BaseGame", null);
    deletePopupDependency(project, "celebration");
    expect(() => deletePopupDependency(project, "celebration")).toThrow(/未知/);
    expect(project.popupDependencies.size).toBe(0);
    expect(() => bindGameModePopup(project, "BaseGame", "missing")).toThrow(
      /未知 Popup/,
    );
  });

  it("keeps every mode synchronized with exact stateful nodes", () => {
    const project = createNewEditorProject("maximized-focus");
    project.nodes.push({
      id: "bg",
      order: 0,
      resourceId: "bg-resource",
      playback: {
        kind: "state-machine",
        initialState: "BG",
        states: [
          { id: "BG", animation: "BG" },
          { id: "FG", animation: "FG" },
        ],
        transitions: [],
      },
      placements: {},
    });
    project.resources.set("bg-resource", {
      id: "bg-resource",
      kind: "spine",
      skeleton: "assets/bg.json",
      atlas: "assets/bg.atlas",
      textures: { "bg.png": "assets/bg.png" },
      animationNames: ["BG", "FG"],
    });
    synchronizeGameModeNodeStates(project);
    addGameMode(project, "FreeGame");
    setGameModeNodeState(project, "FreeGame", "bg", "FG");
    expect(project.gameModes.modes[1].nodeStates).toEqual({ bg: "FG" });
    renameNode(project, "bg", "scene");
    synchronizeGameModeNodeStates(project);
    expect(project.gameModes.modes[1].nodeStates).toEqual({ scene: "FG" });
    renameSpineState(project, "scene", "FG", "Free");
    expect(project.gameModes.modes[1].nodeStates).toEqual({ scene: "Free" });
    expect(() => setInitialGameMode(project, "FreeGame")).toThrow(/初始状态/);
    expect(() =>
      setGameModeNodeState(project, "BaseGame", "scene", "Free"),
    ).toThrow(/initial mode/);
    expect(() =>
      setGameModeNodeState(project, "FreeGame", "scene", "Missing"),
    ).toThrow(/不存在稳定状态/);
    project.nodes[0].playback = { kind: "loop", animation: "BG" };
    synchronizeGameModeNodeStates(project);
    expect(
      project.gameModes.modes.every(
        (mode) => Object.keys(mode.nodeStates).length === 0,
      ),
    ).toBe(true);
  });
});

function popup(id: string, marker: number) {
  return {
    manifest: { id } as never,
    files: new Map([["popup.manifest.json", new Uint8Array([marker])]]),
  };
}
