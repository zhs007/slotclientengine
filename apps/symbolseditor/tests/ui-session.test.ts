import { describe, expect, it } from "vitest";
import {
  addSymbolState,
  createFromGameConfig,
  removeSymbolState,
} from "../src/model/editor-project.js";
import { SymbolsEditorUiSession } from "../src/ui/ui-session.js";

const gameConfig = {
  paytable: {
    "2": { code: 2, symbol: "B", pays: [1] },
    "1": { code: 1, symbol: "A", pays: [1] },
  },
  symbolCodes: { B: 2, A: 1 },
  reels: { main: [[1, 2]] },
};

function createProject() {
  return createFromGameConfig({
    rawGameConfig: gameConfig,
    fileName: "session.json",
  });
}

describe("symbols editor UI session", () => {
  it("uses assets for a new project and symbols for an imported project", () => {
    const project = createProject();
    const session = new SymbolsEditorUiSession();
    session.resetForNewProject(project);
    expect(session.workspace).toBe("assets");
    expect(session.selectedSymbol).toBe("A");

    session.resetForImport(project);
    expect(session.workspace).toBe("symbols");
    expect(session.inspector).toBe("basic");
    expect(session.selectedState).toBe("normal");
  });

  it("keeps workspace filters across transactions and normalizes removed state", () => {
    const project = createProject();
    const session = new SymbolsEditorUiSession();
    session.resetForNewProject(project);
    session.workspace = "symbols";
    session.inspector = "states";
    session.assetQuery = "wild";
    session.expandedAssets.add("missing.png");
    addSymbolState(project, "A", "win");
    session.selectedState = "win";
    session.previewState = "win";
    session.normalize(project);
    expect(session.workspace).toBe("symbols");
    expect(session.inspector).toBe("states");
    expect(session.assetQuery).toBe("wild");

    removeSymbolState(project, "A", "win");
    session.normalize(project);
    expect(session.selectedState).toBe("normal");
    expect(session.previewState).toBe("win");
    expect(session.expandedAssets.size).toBe(0);
  });

  it("clears picker and transient state on project replacement", () => {
    const project = createProject();
    const session = new SymbolsEditorUiSession();
    session.resetForNewProject(project);
    session.picker = {
      context: { kind: "state-image", symbol: "A", state: "normal" },
      query: "a",
    };
    session.transientMessage = "done";
    session.resetForImport(project);
    expect(session.picker).toBeNull();
    expect(session.transientMessage).toBe("");
  });
});
