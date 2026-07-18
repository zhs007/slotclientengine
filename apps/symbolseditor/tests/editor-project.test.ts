import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSymbolStateTextureManifest } from "@slotclientengine/rendercore/symbol";
import {
  addCustomStateDefinition,
  addSymbolState,
  compileSymbolEditorManifest,
  createFromGameConfig,
  createFromImportedPackage,
  deleteAsset,
  exportSnapshot,
  getAssetReferences,
  getGameConfigSymbols,
  moveSymbolState,
  removeSymbolState,
  replaceAsset,
  setAllSymbolsIncluded,
  setCascadeWinPresentation,
  setStateVisual,
  setSymbolIncluded,
  uploadAssetBatch,
} from "../src/model/editor-project.js";
import { SymbolEditorStore } from "../src/model/editor-store.js";

const gameConfig = {
  paytable: {
    "2": { code: 2, symbol: "B", pays: [1] },
    "1": { code: 1, symbol: "A", pays: [1] },
  },
  symbolCodes: { B: 2, A: 1 },
  reels: { main: [[1, 2]] },
};
const imageBytes = () =>
  new Uint8Array(
    readFileSync(resolve(process.cwd(), "../../assets/game003-s1/H1.png")),
  );
const vniProjectBytes = () =>
  new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: "VNI_0.010",
      editor: { name: "VNI", version: "VNI_0.010" },
      engineTarget: { name: "cocos_creator", version: "3.8.6" },
      name: "neutral-symbol-animation",
      stage: {
        width: 160,
        height: 160,
        coordinate: "center",
        duration: 2,
        backgroundColor: "#000000",
      },
      assets: [],
      layerGroups: [],
      layers: [],
      particles: [],
    }),
  );

describe("symbol editor typed project", () => {
  it("creates code-ordered symbols with only explicit empty normal and exports no resources", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "My Game.json",
    });
    expect(project.id).toBe("my-game");
    expect(getGameConfigSymbols(project).map(({ symbol }) => symbol)).toEqual([
      "A",
      "B",
    ]);
    for (const symbol of project.symbols.values()) {
      expect(symbol.stateOrder).toEqual(["normal"]);
      expect(symbol.states.get("normal")).toEqual({
        kind: "empty",
        width: 160,
        height: 160,
      });
    }
    const snapshot = exportSnapshot(project);
    expect(snapshot.packageManifest.resources).toEqual([]);
    expect(snapshot.symbolManifest).toEqual({
      version: 1,
      states: [],
      symbols: {
        A: {
          normal: { kind: "transparent", width: 160, height: 160 },
          scale: 1,
        },
        B: {
          normal: { kind: "transparent", width: 160, height: 160 },
          scale: 1,
        },
      },
    });
  });

  it("compiles VNI playback from normal, once and loop state lifecycles", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "vni.json",
    });
    uploadAssetBatch(project, [
      { path: "animation/neutral.json", bytes: vniProjectBytes() },
    ]);
    setStateVisual(project, "A", "normal", {
      kind: "vni",
      baseVisual: { kind: "empty", width: 160, height: 160 },
      projectPath: "animation/neutral.json",
      startTime: 0,
      endTime: 2,
    });
    for (const state of ["win", "dropdown"] as const) {
      addSymbolState(project, "A", state);
      setStateVisual(project, "A", state, {
        kind: "vni",
        projectPath: "animation/neutral.json",
        startTime: 0,
        endTime: 2,
      });
    }

    const manifest = compileSymbolEditorManifest(project) as any;
    expect(manifest.symbols.A.animations.normal.playback.loop).toBe(true);
    expect(manifest.symbols.A.animations.win.playback.loop).toBe(false);
    expect(manifest.symbols.A.animations.dropdown.playback.loop).toBe(true);
    expect(() => parseSymbolStateTextureManifest(manifest)).not.toThrow();
  });

  it("supports all/none/invert while retaining excluded symbol drafts", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "x.json",
    });
    setAllSymbolsIncluded(project, "none");
    expect(
      [...project.symbols.values()].every((symbol) => !symbol.included),
    ).toBe(true);
    expect(() => exportSnapshot(project)).toThrow(/display set/);
    setAllSymbolsIncluded(project, "invert");
    expect(
      [...project.symbols.values()].every((symbol) => symbol.included),
    ).toBe(true);
    setSymbolIncluded(project, "B", false);
    expect(project.symbols.get("B")?.states.get("normal")).toBeDefined();
  });

  it("keeps uploads unused until explicit selection and exports only the exact closure", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "x.json",
    });
    uploadAssetBatch(project, [
      { path: "art/wild-final.webp", bytes: imageBytes() },
      { path: "unused/approved.png", bytes: imageBytes() },
    ]);
    expect(getAssetReferences(project)).toEqual([]);
    setStateVisual(project, "A", "normal", {
      kind: "image",
      imagePath: "art/wild-final.webp",
    });
    expect(getAssetReferences(project, "art/wild-final.webp")).toEqual([
      { path: "art/wild-final.webp", location: "A.normal" },
    ]);
    expect(exportSnapshot(project).packageManifest.resources).toEqual([
      "art/wild-final.webp",
    ]);
    expect(() =>
      uploadAssetBatch(project, [
        { path: "art/wild-final.webp", bytes: new Uint8Array([3]) },
        { path: "half-batch.png", bytes: new Uint8Array([4]) },
      ]),
    ).toThrow(/冲突/);
    expect(project.assetLibrary.records.has("half-batch.png")).toBe(false);
    expect(() => deleteAsset(project, "art/wild-final.webp")).toThrow(
      /仍被引用/,
    );
    replaceAsset(project, "art/wild-final.webp", new Uint8Array([9]));
    expect(
      project.assetLibrary.records.get("art/wild-final.webp")?.bytes,
    ).toEqual(new Uint8Array([9]));
    deleteAsset(project, "unused/approved.png");
    expect(project.assetLibrary.records.has("unused/approved.png")).toBe(false);
  });

  it("adds, orders and protects per-symbol custom states and compiles sparse textures", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "x.json",
    });
    addCustomStateDefinition(project, {
      id: "collect",
      phase: "once",
      playback: "once",
    });
    addSymbolState(project, "A", "win");
    addSymbolState(project, "A", "remove");
    addSymbolState(project, "A", "collect");
    addSymbolState(project, "A", "spinBlur");
    uploadAssetBatch(project, [
      { path: "passes/blur-v2.png", bytes: imageBytes() },
    ]);
    setStateVisual(project, "A", "spinBlur", {
      kind: "image",
      imagePath: "passes/blur-v2.png",
    });
    setStateVisual(project, "A", "win", {
      kind: "static",
      durationSeconds: 0.2,
    });
    setStateVisual(project, "A", "remove", {
      kind: "empty-state",
      durationSeconds: 0.1,
    });
    setStateVisual(project, "A", "collect", {
      kind: "static",
      durationSeconds: 0.3,
    });
    setCascadeWinPresentation(project, "A", {
      order: 0,
      playback: { mode: "group", winState: "win", removeState: "remove" },
      summary: { mode: "groupAmount" },
    });
    expect(() => removeSymbolState(project, "A", "win")).toThrow(/cascade/);
    moveSymbolState(project, "A", "collect", -1);
    const raw = compileSymbolEditorManifest(project) as {
      states: string[];
      symbols: Record<string, Record<string, unknown>>;
    };
    expect(raw.states).toEqual(["spinBlur"]);
    expect(raw.symbols.A.spinBlur).toBe("./passes/blur-v2.png");
    expect(raw.symbols.B.spinBlur).toBeUndefined();
    expect(parseSymbolStateTextureManifest(raw).symbols.B.states).toEqual({});
  });

  it("round-trips the production game002 and game003 manifests through typed drafts", () => {
    for (const fixture of [
      {
        id: "game002",
        config: "../../../assets/gamecfg002/gameconfig.json",
        manifest:
          "../../../assets/game002-s3/symbol-state-textures.manifest.json",
      },
      {
        id: "game003",
        config: "../../../assets/gamecfg003/gameconfig.json",
        manifest:
          "../../../assets/game003-s1/symbol-state-textures.manifest.json",
      },
    ]) {
      const rawGameConfig = JSON.parse(
        readFileSync(new URL(fixture.config, import.meta.url), "utf8"),
      );
      const rawManifest = JSON.parse(
        readFileSync(new URL(fixture.manifest, import.meta.url), "utf8"),
      );
      const project = createFromImportedPackage({
        packageManifest: {
          version: 1,
          kind: "symbol-package",
          id: fixture.id,
          cellSize: { width: 200, height: 200 },
          entrypoints: {
            gameConfig: "gameconfig.json",
            symbolManifest: "symbol-state-textures.manifest.json",
          },
          resources: [],
        },
        rawGameConfig,
        rawSymbolManifest: rawManifest,
        assets: new Map(),
      });
      expect(
        parseSymbolStateTextureManifest(compileSymbolEditorManifest(project)),
      ).toEqual(parseSymbolStateTextureManifest(rawManifest));
    }
  });

  it("keeps store transactions atomic when an update throws", () => {
    const store = new SymbolEditorStore();
    store.replace(
      createFromGameConfig({ rawGameConfig: gameConfig, fileName: "x.json" }),
    );
    const before = store.getSnapshot();
    expect(() =>
      store.transact((draft) => {
        draft.cellSize.width = 12;
        throw new Error("stop");
      }),
    ).toThrow("stop");
    expect(store.getSnapshot().revision).toBe(before.revision);
    expect(store.getSnapshot().project?.cellSize.width).toBe(160);
  });
});
