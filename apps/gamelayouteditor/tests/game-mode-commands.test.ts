import { describe, expect, it } from "vitest";
import {
  createNewEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  addGameMode,
  clearSplashGameMode,
  createGameModeTransition,
  deleteGameMode,
  renameGameMode,
  setGameModeReelEnabled,
  setInitialGameMode,
  setSplashGameMode,
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

  it("keeps main specialization inside the mode and exports latest v8", () => {
    const project = createNewEditorProject();
    setGameModeReelEnabled(project, "BaseGame", false);

    const manifest = editorProjectToManifest(project);
    expect(manifest.version).toBe(8);
    expect(manifest.main).toMatchObject({ columns: 5, rows: 3 });
    expect(manifest.gameModes.modes[0]!.main.enabled).toBe(false);
    expect(manifest).not.toHaveProperty("adaptation");
    expect(manifest).not.toHaveProperty("artSize");
  });

  it("configures Splash without creating a transition", () => {
    const project = createNewEditorProject();
    addGameMode(project, "Splash");
    setSplashGameMode(project, "Splash");

    expect(project.gameModes).toMatchObject({
      initialMode: "BaseGame",
      splashMode: "Splash",
    });
    expect(() => setInitialGameMode(project, "Splash")).toThrow(
      /不能同时配置/u,
    );
    expect(() => deleteGameMode(project, "Splash")).toThrow(/清除 Splash/u);
    expect(project.gameModes.transitions).toEqual([]);
    setSplashGameMode(project, "Splash");
    expect(project.gameModes.transitions).toHaveLength(0);
    const manifest = editorProjectToManifest(project);
    expect(manifest.gameModes.splashMode).toBe("Splash");
    const restored = manifestToEditorProject(manifest, project.assets);
    expect(restored.gameModes.splashMode).toBe("Splash");
    expect(restored.gameModes.initialMode).toBe("BaseGame");
    expect(restored.gameModes.activeModeId).toBe("Splash");
    clearSplashGameMode(project);
    expect(project.gameModes.splashMode).toBeNull();
  });

  it("preserves an existing authored Splash transition", () => {
    const project = createNewEditorProject();
    addGameMode(project, "Welcome");
    createGameModeTransition(project, "Welcome", "BaseGame");
    const transition = project.gameModes.transitions[0]!;
    transition.preludePopupId = "welcome-popup";
    const before = structuredClone(transition);
    setSplashGameMode(project, "Welcome");
    expect(project.gameModes.transitions).toEqual([before]);
    expect(project.gameModes.transitions[0]).toBe(transition);
  });

  it("rejects a conflicting primary target before changing Splash or transitions", () => {
    const project = createNewEditorProject();
    addGameMode(project, "Welcome");
    addGameMode(project, "Other");
    project.gameModes.modes[1]!.primaryActionTargetMode = "Other";
    const before = structuredClone(project);
    expect(() => setSplashGameMode(project, "Welcome")).toThrow(/点击目标/u);
    expect(project).toEqual(before);
    expect(() => setSplashGameMode(project, "BaseGame")).toThrow(
      /不能同时配置/u,
    );
    expect(() => setSplashGameMode(project, "Missing")).toThrow(
      /未知游戏模式/u,
    );
    expect(project).toEqual(before);
  });
});
