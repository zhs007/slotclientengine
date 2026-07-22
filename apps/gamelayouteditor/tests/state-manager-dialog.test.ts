import { describe, expect, it } from "vitest";
import { createNewEditorProject } from "../src/model/editor-project.js";
import { addGameMode } from "../src/model/game-mode-commands.js";
import {
  normalizeStateManagerSelection,
  stateManagerDialogMarkup,
} from "../src/ui/state-manager-dialog.js";

describe("state manager dialog", () => {
  it("renders every declared mode in order with initial, selection and readiness", () => {
    const project = createNewEditorProject("maximized-focus");
    project.nodes.push({
      id: "base-background",
      order: 0,
      resourceId: "background",
      placements: { default: { x: 0, y: 0, scale: 1 } },
    });
    project.gameModes.modes[0]!.backgroundNodes.default = "base-background";
    addGameMode(project, "FreeGame");
    const host = document.createElement("div");
    host.innerHTML = stateManagerDialogMarkup({
      project,
      selectedModeId: "FreeGame",
      newModeId: "BonusGame",
      renameModeId: "FreeGame2",
      feedback: "",
    });

    const options = [...host.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((option) => option.dataset.selectGameMode)).toEqual([
      "BaseGame",
      "FreeGame",
    ]);
    expect(options[0]!.textContent).toContain("initial");
    expect(options[0]!.textContent).toContain("ready");
    expect(options[1]!.getAttribute("aria-selected")).toBe("true");
    expect(options[1]!.textContent).toContain("incomplete");
    expect(
      (host.querySelector("[data-delete-game-mode]") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("falls back to initial and explains why the only or initial mode cannot be deleted", () => {
    const project = createNewEditorProject("orientation-focus");
    expect(normalizeStateManagerSelection(project, "Missing")).toBe("BaseGame");
    const host = document.createElement("div");
    host.innerHTML = stateManagerDialogMarkup({
      project,
      selectedModeId: "Missing",
      newModeId: "",
      renameModeId: "BaseGame",
      feedback: "",
    });
    expect(host.textContent).toContain("layout 至少必须保留一个游戏模式");
    expect(
      (host.querySelector("[data-delete-game-mode]") as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    addGameMode(project, "FreeGame");
    host.innerHTML = stateManagerDialogMarkup({
      project,
      selectedModeId: "BaseGame",
      newModeId: "",
      renameModeId: "BaseGame",
      feedback: "",
    });
    expect(host.textContent).toContain(
      "删除 initial mode 前必须先选择其它 initial mode",
    );
  });
});
