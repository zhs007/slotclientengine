import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSymbolStateTextureManifest } from "@slotclientengine/rendercore/symbol";
import {
  addCustomStateDefinition,
  addStateAnimationLayer,
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
  setSymbolImageStringNodes,
  setSymbolIncluded,
  setValuePresentation,
  uploadAssetBatch,
} from "../src/model/editor-project.js";
import { SymbolEditorStore } from "../src/model/editor-store.js";
import { readCraveFixtureJson } from "./crave-fixture.js";
import {
  readMinecart2LogicalJson,
  readMinecart2SymbolFixtureBytes,
} from "../../../test-utils/minecart2-fixtures.js";

const gameConfig = {
  paytable: {
    "2": { code: 2, symbol: "B", pays: [1] },
    "1": { code: 1, symbol: "A", pays: [1] },
  },
  symbolCodes: { B: 2, A: 1 },
  reels: { main: [[1, 2]] },
};
const imageBytes = () => readMinecart2SymbolFixtureBytes("H1.png");
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
  it("loads legacy v1 completion behavior and exports canonical v2 definitions", () => {
    const project = createFromImportedPackage({
      packageManifest: {
        version: 1,
        kind: "symbol-package",
        id: "legacy",
        cellSize: { width: 160, height: 160 },
        entrypoints: {
          gameConfig: "game.json",
          symbolManifest: "symbol-state-textures.manifest.json",
        },
        resources: [],
      },
      rawGameConfig: gameConfig,
      rawSymbolManifest: {
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
      },
      assets: new Map(),
    });

    expect(
      project.stateDefinitions.find((definition) => definition.id === "remove"),
    ).toMatchObject({ afterComplete: "terminal" });
    expect(
      project.stateDefinitions.find((definition) => definition.id === "win"),
    ).toMatchObject({ afterComplete: "return-to-default" });
    expect(compileSymbolEditorManifest(project)).toMatchObject({
      version: 2,
      settings: { stateDefinitions: expect.any(Array) },
    });
  });

  it("compiles direct ImgNumber targets and sparse special image mappings", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "direct-imgnumber.json",
    });
    setSymbolImageStringNodes(project, "A", [
      {
        name: "coin-value",
        resource: "./image-string.manifest.json",
        targets: [{ state: "normal" }],
        initialText: "150",
        specialValueImages: [{ value: 200, image: "./mini.png" }],
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: true,
      },
    ]);
    const raw = compileSymbolEditorManifest(project) as any;
    expect(raw.symbols.A.imageStringNodes[0]).toMatchObject({
      targets: [{ state: "normal" }],
      specialValueImages: [{ value: 200, image: "./mini.png" }],
    });
    expect(
      parseSymbolStateTextureManifest(raw).symbols.A.imageStringNodes[0],
    ).toMatchObject({ targets: [{ state: "normal" }] });
  });

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
    expect(snapshot.symbolManifest).toMatchObject({
      version: 2,
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
    expect(
      (snapshot.symbolManifest as any).settings.stateDefinitions.find(
        (definition: any) => definition.id === "remove",
      ),
    ).toMatchObject({ afterComplete: "terminal" });
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

  it("round-trips explicit normal/stateTexture composite animation layers", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "composite.json",
    });
    uploadAssetBatch(project, [
      { path: "A.png", bytes: imageBytes() },
      { path: "effects.json", bytes: vniProjectBytes() },
    ]);
    setStateVisual(project, "A", "normal", {
      kind: "composite",
      base: "normal",
      baseVisual: { kind: "image", imagePath: "A.png" },
      layers: [
        {
          id: "back-glow",
          placement: "underlay",
          animation: {
            kind: "vni",
            projectPath: "effects.json",
            startTime: 0,
            endTime: 2,
          },
        },
      ],
    });
    addSymbolState(project, "A", "win");
    setStateVisual(project, "A", "win", {
      kind: "composite",
      base: "stateTexture",
      stateTexturePath: "A.png",
      layers: [
        {
          id: "front-burst",
          placement: "overlay",
          animation: {
            kind: "vni",
            projectPath: "effects.json",
            startTime: 0,
            endTime: 2,
          },
        },
      ],
    });

    const snapshot = exportSnapshot(project);
    const raw = snapshot.symbolManifest as any;
    expect(raw.states).toEqual(["win"]);
    expect(raw.symbols.A.normal).toBe("./A.png");
    expect(raw.symbols.A.win).toBe("./A.png");
    expect(raw.symbols.A.animations.normal).toMatchObject({
      kind: "composite",
      base: { kind: "normal" },
      layers: [{ id: "back-glow", placement: "underlay" }],
    });
    expect(raw.symbols.A.animations.win).toMatchObject({
      kind: "composite",
      base: { kind: "stateTexture" },
      layers: [{ id: "front-burst", placement: "overlay" }],
    });
    const imported = createFromImportedPackage({
      packageManifest: snapshot.packageManifest,
      rawGameConfig: snapshot.rawGameConfig,
      rawSymbolManifest: snapshot.symbolManifest,
      assets: snapshot.assets,
    });
    expect(
      parseSymbolStateTextureManifest(compileSymbolEditorManifest(imported)),
    ).toEqual(parseSymbolStateTextureManifest(snapshot.symbolManifest));
    expect(getAssetReferences(imported, "effects.json")).toEqual([
      { path: "effects.json", location: "A.normal" },
      { path: "effects.json", location: "A.win" },
    ]);
  });

  it("adds layers without re-entering existing image or animation bindings", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "legacy.json",
    });
    setStateVisual(project, "A", "normal", {
      kind: "spine",
      baseVisual: { kind: "image", imagePath: "A.png" },
      skeletonPath: "symbol.json",
      atlasPath: "symbol.atlas",
      texturePath: "symbol.png",
      animationName: "Idle",
      transform: { x: 3, scale: 0.8 },
    });
    addStateAnimationLayer(project, "A", "normal", {
      id: "layer-2",
      placement: "underlay",
      animation: {
        kind: "vni",
        projectPath: "glow.json",
        startTime: 0,
        endTime: 1,
      },
    });
    addSymbolState(project, "A", "win");
    setStateVisual(project, "A", "win", {
      kind: "image",
      imagePath: "A-win.png",
    });
    addStateAnimationLayer(project, "A", "win", {
      id: "layer-1",
      placement: "overlay",
      animation: {
        kind: "vni",
        projectPath: "burst.json",
        startTime: 0,
        endTime: 1,
      },
    });

    expect(project.symbols.get("A")?.states.get("normal")).toEqual({
      kind: "composite",
      base: "normal",
      baseVisual: { kind: "image", imagePath: "A.png" },
      layers: [
        {
          id: "layer-1",
          placement: "overlay",
          animation: {
            kind: "spine",
            skeletonPath: "symbol.json",
            atlasPath: "symbol.atlas",
            texturePath: "symbol.png",
            animationName: "Idle",
            transform: { x: 3, scale: 0.8 },
          },
        },
        {
          id: "layer-2",
          placement: "underlay",
          animation: {
            kind: "vni",
            projectPath: "glow.json",
            startTime: 0,
            endTime: 1,
          },
        },
      ],
    });
    expect(project.symbols.get("A")?.states.get("win")).toEqual({
      kind: "composite",
      base: "stateTexture",
      stateTexturePath: "A-win.png",
      layers: [
        {
          id: "layer-1",
          placement: "overlay",
          animation: {
            kind: "vni",
            projectPath: "burst.json",
            startTime: 0,
            endTime: 1,
          },
        },
      ],
    });
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
      { path: "wild-final.webp", bytes: imageBytes() },
      { path: "unused/approved.png", bytes: imageBytes() },
    ]);
    expect(getAssetReferences(project)).toEqual([]);
    setStateVisual(project, "A", "normal", {
      kind: "image",
      imagePath: "wild-final.webp",
    });
    expect(getAssetReferences(project, "wild-final.webp")).toEqual([
      { path: "wild-final.webp", location: "A.normal" },
    ]);
    expect(exportSnapshot(project).packageManifest.resources).toEqual([
      "wild-final.webp",
    ]);
    uploadAssetBatch(project, [
      { path: "wild-final.webp", bytes: new Uint8Array([3]) },
      { path: "half-batch.png", bytes: new Uint8Array([4]) },
    ]);
    expect(project.assetLibrary.records.has("half-batch.png")).toBe(true);
    expect(project.assetLibrary.records.get("wild-final.webp")?.bytes).toEqual(
      new Uint8Array([3]),
    );
    expect(() => deleteAsset(project, "wild-final.webp")).toThrow(/仍被引用/);
    replaceAsset(project, "wild-final.webp", new Uint8Array([9]));
    expect(project.assetLibrary.records.get("wild-final.webp")?.bytes).toEqual(
      new Uint8Array([9]),
    );
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
      afterComplete: "return-to-default",
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
        manifest: null,
      },
      {
        id: "game003",
        config: null,
        manifest: "minecart2",
      },
    ]) {
      const rawGameConfig = fixture.config
        ? JSON.parse(
            readFileSync(new URL(fixture.config, import.meta.url), "utf8"),
          )
        : readMinecart2LogicalJson("gameconfig.json");
      const rawManifest = fixture.manifest
        ? fixture.manifest === "minecart2"
          ? readMinecart2LogicalJson("symbol-state-textures.manifest.json")
          : JSON.parse(
              readFileSync(new URL(fixture.manifest, import.meta.url), "utf8"),
            )
        : readCraveFixtureJson("symbol-state-textures.manifest.json");
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

  it("shares normal animation while preserving independent ImgNumber tier bindings", () => {
    const rawGameConfig = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "../../assets/gamecfg002/gameconfig.json"),
        "utf8",
      ),
    );
    const rawManifest = readCraveFixtureJson(
      "symbol-state-textures.manifest.json",
    );
    const project = createFromImportedPackage({
      packageManifest: {
        version: 1,
        kind: "symbol-package",
        id: "game002-shared-tier-contract",
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
    const cn = project.symbols.get("CN")!;
    const value = structuredClone(cn.valuePresentation!);
    (
      value.tiers[1]!.animation.playback as { animationName: string }
    ).animationName = "Idle";
    setValuePresentation(project, "CN", value);
    expect(() => compileSymbolEditorManifest(project)).toThrow(
      /共用同一个 normal animation/,
    );

    const restored = structuredClone(
      parseSymbolStateTextureManifest(rawManifest).symbols.CN
        .valuePresentation!,
    );
    if (restored.text.type !== "image-string" || !("tiers" in restored.text))
      throw new Error("expected game002 CN image-string presentation");
    const secondBinding = restored.text.tiers[1] as unknown as {
      slot: string;
      transform: { x: number };
      specialValueImages: Array<{ value: number; image: string }>;
    };
    secondBinding.slot = "other";
    secondBinding.transform.x = 17;
    secondBinding.specialValueImages = [{ value: 250, image: "./mini.png" }];
    setValuePresentation(project, "CN", restored);
    const compiled = parseSymbolStateTextureManifest(
      compileSymbolEditorManifest(project),
    ).symbols.CN.valuePresentation!;
    if (compiled.text.type !== "image-string" || !("tiers" in compiled.text))
      throw new Error("expected image-string presentation");
    expect(compiled.text.tiers[1]).toMatchObject({
      slot: "other",
      transform: { x: 17 },
      specialValueImages: [{ value: 250, image: "./mini.png" }],
    });
    expect(compiled.text.tiers[0]?.slot).not.toBe("other");

    const shared = structuredClone(restored) as any;
    shared.text = {
      type: "image-string",
      tierResources: restored.text.tiers.map((binding) => binding.resource),
      slot: "shared-num",
      anchor: { x: 0.5, y: 0.5 },
      transform: { x: 3, y: -4, scale: 0.75 },
      followSlotColor: true,
      specialValueImages: [{ value: 250, image: "./mini.png" }],
    };
    setValuePresentation(project, "CN", shared);
    const sharedCompiled = parseSymbolStateTextureManifest(
      compileSymbolEditorManifest(project),
    ).symbols.CN.valuePresentation!.text;
    expect(sharedCompiled).toMatchObject({
      type: "image-string",
      slot: "shared-num",
      transform: { x: 3, y: -4, scale: 0.75 },
    });
    expect(
      sharedCompiled.type === "image-string" &&
        "tierResources" in sharedCompiled
        ? sharedCompiled.tierResources
        : [],
    ).toHaveLength(restored.tiers.length);
  });

  it("derives tiered states as shared active Spine or independent static images", () => {
    const project = createFromGameConfig({
      rawGameConfig: {
        paytable: { "1": { code: 1, symbol: "A", pays: [1] } },
        symbolCodes: { A: 1 },
        reels: { main: [[1]] },
      },
      fileName: "tiered.json",
    });
    const sourceManifest = parseSymbolStateTextureManifest(
      readCraveFixtureJson("symbol-state-textures.manifest.json"),
    );
    setValuePresentation(
      project,
      "A",
      structuredClone(sourceManifest.symbols.CN.valuePresentation!),
    );
    addSymbolState(project, "A", "win");
    addSymbolState(project, "A", "spinBlur");
    expect(project.symbols.get("A")?.states.get("win")).toEqual({
      kind: "activeSpine",
      animationName: "",
    });
    expect(project.symbols.get("A")?.states.get("spinBlur")).toEqual({
      kind: "image",
      imagePath: "",
    });
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
