import { describe, expect, it } from "vitest";
import {
  createNewEditorProject,
  editorProjectToManifest,
} from "../src/model/editor-project.js";
import {
  addGameMode,
  createGameModeTransition,
  deleteGameMode,
  renameGameMode,
  setGameModeReelEnabled,
  setInitialGameMode,
} from "../src/model/game-mode-commands.js";

describe("game mode commands", () => {
  it("adds untyped modes with centered landscape and portrait main geometry", () => {
    const project = createNewEditorProject();
    addGameMode(project, "FreeGame");

    const mode = project.gameModes.modes[1]!;
    expect(mode).toMatchObject({
      id: "FreeGame",
      mainEnabled: true,
      mainVariants: {
        landscape: { x: 0, y: 0 },
        portrait: { x: 0, y: 0 },
      },
    });
    expect(mode).not.toHaveProperty("type");
    expect(mode).not.toHaveProperty("backgroundNodes");
  });

  it("renames every mode reference, including ordinary-layer scope", () => {
    const project = createNewEditorProject();
    addGameMode(project, "FreeGame");
    project.nodes.push({
      id: "free-decoration",
      order: 0,
      resourceId: "decoration.png",
      scope: {
        BaseGame: ["portrait"],
        FreeGame: ["landscape"],
      },
      placements: {},
    });
    project.gameModes.modes[0]!.primaryActionTargetMode = "FreeGame";
    createGameModeTransition(project, "BaseGame", "FreeGame");

    renameGameMode(project, "FreeGame", "BonusGame");

    expect(project.gameModes.modes.map(({ id }) => id)).toEqual([
      "BaseGame",
      "BonusGame",
    ]);
    expect(project.nodes[0]!.scope).toEqual({
      BaseGame: ["portrait"],
      BonusGame: ["landscape"],
    });
    expect(project.gameModes.modes[0]!.primaryActionTargetMode).toBe(
      "BonusGame",
    );
    expect(project.gameModes.transitions[0]).toMatchObject({
      fromModeId: "BaseGame",
      toModeId: "BonusGame",
    });
  });

  it("refuses deletion while a mode is referenced by an ordinary layer", () => {
    const project = createNewEditorProject();
    addGameMode(project, "FreeGame");
    project.nodes.push({
      id: "free-decoration",
      order: 0,
      resourceId: "decoration.png",
      scope: { FreeGame: ["portrait"] },
      placements: {},
    });

    expect(() => deleteGameMode(project, "FreeGame")).toThrow(
      /普通图层.*free-decoration/u,
    );
  });

  it("changes the initial mode and deletes an unreferenced mode", () => {
    const project = createNewEditorProject();
    addGameMode(project, "FreeGame");
    setInitialGameMode(project, "FreeGame");
    setInitialGameMode(project, "BaseGame");
    deleteGameMode(project, "FreeGame");
    expect(project.gameModes.initialMode).toBe("BaseGame");
    expect(project.gameModes.modes.map(({ id }) => id)).toEqual(["BaseGame"]);
  });

  it("prevents self and duplicate transitions", () => {
    const project = createNewEditorProject();
    addGameMode(project, "FreeGame");
    expect(() =>
      createGameModeTransition(project, "BaseGame", "BaseGame"),
    ).toThrow(/自循环/u);
    createGameModeTransition(project, "BaseGame", "FreeGame");
    expect(() =>
      createGameModeTransition(project, "BaseGame", "FreeGame"),
    ).toThrow(/已存在/u);
  });

  it("keeps main specialization inside the mode and exports latest v7", () => {
    const project = createNewEditorProject();
    setGameModeReelEnabled(project, "BaseGame", false);

    const manifest = editorProjectToManifest(project);
    expect(manifest.version).toBe(7);
    expect(manifest.main).toMatchObject({ columns: 5, rows: 3 });
    expect(manifest.gameModes.modes[0]!.main.enabled).toBe(false);
    expect(manifest).not.toHaveProperty("adaptation");
    expect(manifest).not.toHaveProperty("artSize");
  });
});
