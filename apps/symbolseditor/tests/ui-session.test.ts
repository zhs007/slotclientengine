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

  it("keeps validated per-tier preview values in session only", () => {
    const project = createProject();
    configureValueTiers(project, "A");
    configureValueTiers(project, "B");
    const session = new SymbolsEditorUiSession();
    session.resetForNewProject(project);

    expect(session.getTierPreviewValue(project, "A", 0)).toBe(5);
    expect(session.getTierPreviewValue(project, "A", 1)).toBe(25);
    expect(session.getPreviewValue(project, "A")).toBe(5);

    session.setTierPreviewValue(project, "A", 1, 42);
    expect(session.getActivePreviewTier(project, "A")).toBe(1);
    expect(session.getPreviewValue(project, "A")).toBe(42);
    expect(() => session.setTierPreviewValue(project, "A", 1, 9)).toThrow(
      /Tier 2.*\[10, \+∞\)/,
    );
    expect(session.getPreviewValue(project, "A")).toBe(42);
    expect(session.getPreviewValue(project, "B")).toBe(5);

    const presentation = project.symbols.get("A")!.valuePresentation!;
    project.symbols.get("A")!.valuePresentation = {
      ...presentation,
      tiers: [
        { ...presentation.tiers[0]!, maxExclusive: 50 },
        presentation.tiers[1]!,
      ],
    };
    session.normalize(project);
    expect(session.getTierPreviewValue(project, "A", 1)).toBe(50);

    session.resetForImport(project);
    expect(session.getActivePreviewTier(project, "A")).toBe(0);
    expect(session.getPreviewValue(project, "A")).toBe(5);
  });
});

function configureValueTiers(
  project: ReturnType<typeof createProject>,
  symbolName: string,
): void {
  project.symbols.get(symbolName)!.valuePresentation = {
    defaultValues: [5, 25],
    reelStates: {
      normal: { kind: "transparent", width: 160, height: 160 },
      states: {},
    },
    tiers: [
      {
        maxExclusive: 10,
        animation: {
          kind: "spine",
          skeleton: "./low.json",
          atlas: "./symbol.atlas",
          texture: "./symbol.png",
          playback: { mode: "animation", animationName: "Loop", loop: true },
        },
      },
      {
        animation: {
          kind: "spine",
          skeleton: "./high.json",
          atlas: "./symbol.atlas",
          texture: "./symbol.png",
          playback: { mode: "animation", animationName: "Loop", loop: true },
        },
      },
    ],
    text: {
      type: "font",
      slot: "Num",
      x: 0,
      y: 0,
      fontFamily: "Arial",
      fontSize: 24,
      fontWeight: "700",
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 1,
    },
  };
}
