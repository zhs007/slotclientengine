import { describe, expect, it } from "vitest";
import {
  activateEditorGameMode,
  createNewEditorProject,
  createSplashFirstEditorProject,
  editorProjectToManifest,
} from "../src/model/editor-project.js";
import {
  addGameMode,
  bindGameModeBackground,
  bindGameModeSymbols,
  bindGameModePopup,
  deleteGameMode,
  deletePopupDependency,
  importPopupDependency,
  importSymbolDependency,
  deleteSymbolDependency,
  replaceSymbolDependency,
  renameGameMode,
  replacePopupDependency,
  createGameModeTransition,
  deleteGameModeTransition,
  setInitialGameMode,
  setGameModeReelEnabled,
  setGameModeTransitionKind,
  setGameModeTransitionPreludePopup,
  setGameModeVideoTransitionFadeOut,
  setGameModeVideoTransitionResource,
  setPopupPlacement,
  setPopupProgrammatic,
} from "../src/model/game-mode-commands.js";

describe("game mode and popup dependency commands", () => {
  it("keeps the reel switch explicit and rejects disabling a Symbols-bound mode", () => {
    const project = createNewEditorProject("maximized-focus");
    setGameModeReelEnabled(project, "BaseGame", false);
    expect(project.gameModes.modes[0]?.reelEnabled).toBe(false);
    project.gameModes.modes[0]!.symbols = {
      packageId: "symbols",
      reelSet: "main",
      renderMode: "standard",
    };
    expect(() => setGameModeReelEnabled(project, "BaseGame", false)).toThrow(
      /Symbols/,
    );
  });

  it("creates Splash as the explicit initial click-through mode with independent adaptation", () => {
    const project = createSplashFirstEditorProject(
      "orientation-focus",
      "maximized-focus",
    );
    expect(project.gameModes.initialMode).toBe("Splash");
    expect(project.gameModes.activeModeId).toBe("Splash");
    expect(project.gameModes.modes).toMatchObject([
      {
        id: "Splash",
        mode: "orientation-focus",
        reelEnabled: false,
        primaryActionTargetMode: "BaseGame",
      },
      {
        id: "BaseGame",
        mode: "maximized-focus",
        reelEnabled: true,
        primaryActionTargetMode: null,
      },
    ]);
    expect(project.gameModes.transitions).toEqual([
      expect.objectContaining({
        kind: "none",
        fromModeId: "Splash",
        toModeId: "BaseGame",
      }),
    ]);
  });

  it("keeps different package ids in independent filename-key namespaces", () => {
    const project = createNewEditorProject("maximized-focus");
    importPopupDependency(project, popup("base-win", 1));
    importPopupDependency(project, popup("free-win", 2));
    expect(project.assets.get("base-win-popup.manifest.json")?.[0]).toBe(1);
    expect(project.assets.get("free-win-popup.manifest.json")?.[0]).toBe(2);
    replacePopupDependency(project, "base-win", popup("base-win", 3));
    expect(project.assets.get("base-win-popup.manifest.json")?.[0]).toBe(3);
    expect(project.assets.get("free-win-popup.manifest.json")?.[0]).toBe(2);
  });

  it("adds, renames, selects and deletes generic modes atomically", () => {
    const project = createNewEditorProject("maximized-focus");
    addGameMode(project, "FreeGame", project.mode);
    project.nodes.push({
      id: "free-only",
      order: 0,
      resourceId: "unused",
      gameMode: "FreeGame",
      placements: { default: { x: 0, y: 0, scale: 1, rotation: 0 } },
    });
    expect(project.gameModes.modes.map((mode) => mode.id)).toEqual([
      "BaseGame",
      "FreeGame",
    ]);
    expect(project.gameModes.modes[1]!.backgroundNodes).toEqual({
      default: "",
    });
    expect(() => addGameMode(project, "FreeGame", project.mode)).toThrow(
      /已存在/,
    );
    expect(() => addGameMode(project, "bad id", project.mode)).toThrow(
      /必须匹配/,
    );
    renameGameMode(project, "FreeGame", "FG");
    expect(project.nodes[0].gameMode).toBe("FG");
    renameGameMode(project, "FG", "FG");
    expect(() => renameGameMode(project, "FG", "BaseGame")).toThrow(/已存在/);
    setInitialGameMode(project, "FG");
    expect(project.gameModes.initialMode).toBe("FG");
    renameGameMode(project, "FG", "FreeGame");
    expect(project.nodes[0].gameMode).toBe("FreeGame");
    expect(project.gameModes.initialMode).toBe("FreeGame");
    expect(() => deleteGameMode(project, "FreeGame")).toThrow(/initial/);
    setInitialGameMode(project, "BaseGame");
    expect(() => deleteGameMode(project, "FreeGame")).toThrow(/普通图层引用/);
    project.nodes[0].gameMode = undefined;
    deleteGameMode(project, "FreeGame");
    expect(() => deleteGameMode(project, "BaseGame")).toThrow(/至少/);
    expect(() => renameGameMode(project, "Missing", "Other")).toThrow(/未知/);
    expect(() => setInitialGameMode(project, "Missing")).toThrow(/未知/);
    addGameMode(project, "Other", project.mode);
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
    expect(project.assets.get("celebration-popup.manifest.json")![0]).toBe(9);
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

  it("keeps any Popup type for programmatic use without a direct binding", () => {
    const project = createNewEditorProject("maximized-focus");
    const imported = {
      manifest: { id: "free-game", type: "spine" } as never,
      rootKey: "free-game-popup.manifest.json",
      files: new Map([["free-game-popup.manifest.json", new Uint8Array([1])]]),
      sourceSpineAssets: [],
    };
    importPopupDependency(project, imported);
    expect(project.programmaticPopupIds.size).toBe(0);
    expect(() => bindGameModePopup(project, "BaseGame", "free-game")).toThrow(
      /award-celebration/,
    );
    setPopupProgrammatic(project, "free-game", true);
    expect(project.programmaticPopupIds.has("free-game")).toBe(true);
    expect(() => deletePopupDependency(project, "free-game")).toThrow(
      /程序 Popup/,
    );
    setPopupProgrammatic(project, "free-game", false);
    deletePopupDependency(project, "free-game");
  });

  it("registers single-state only as an independent popup", () => {
    const project = createNewEditorProject("maximized-focus");
    importPopupDependency(project, {
      manifest: { id: "freeform", type: "single-state" } as never,
      rootKey: "freeform-popup.manifest.json",
      files: new Map([["freeform-popup.manifest.json", new Uint8Array([1])]]),
      sourceSpineAssets: [],
    });
    expect(() => bindGameModePopup(project, "BaseGame", "freeform")).toThrow(
      /award-celebration/,
    );
    setPopupProgrammatic(project, "freeform", true);
    expect(project.programmaticPopupIds.has("freeform")).toBe(true);
  });

  it("keeps an unbound award Popup for programmatic use", () => {
    const project = createNewEditorProject("maximized-focus");
    project.resources.set("art", {
      id: "art",
      kind: "image",
      path: "assets/art.png",
      size: { width: 100, height: 100 },
    });
    project.assets.set("assets/art.png", new Uint8Array([1]));
    project.nodes.push({
      id: "base-background",
      order: 0,
      resourceId: "art",
      placements: { default: { x: 0, y: 0, scale: 1 } },
    });
    bindGameModeBackground(project, "BaseGame", "default", "base-background");
    importPopupDependency(project, popup("program-award", 1));
    setPopupProgrammatic(project, "program-award", true);
    expect(project.programmaticPopupIds.has("program-award")).toBe(true);
    expect(editorProjectToManifest(project).popups).toHaveProperty(
      "program-award.type",
      "award-celebration",
    );
  });

  it("allocates a distinct popup root order from 2000", () => {
    const project = createNewEditorProject("maximized-focus");
    importPopupDependency(project, popup("base-popup", 1));
    importPopupDependency(project, popup("free-entry", 2));
    expect(
      [...project.popupDependencies.values()].map(({ order }) => order),
    ).toEqual([2000, 2001]);
  });

  it("binds a Spine popup to one directed Spine transition", () => {
    const project = createNewEditorProject("maximized-focus");
    addGameMode(project, "FreeGame", project.mode);
    createGameModeTransition(project, "BaseGame", "FreeGame");
    const transition = project.gameModes.transitions[0]!;
    importPopupDependency(project, {
      manifest: { id: "free-entry", type: "spine" } as never,
      rootKey: "free-entry-popup.manifest.json",
      files: new Map([["free-entry-popup.manifest.json", new Uint8Array([1])]]),
      sourceSpineAssets: [],
    });
    setGameModeTransitionPreludePopup(project, transition, "free-entry");
    expect(transition).toMatchObject({ preludePopupId: "free-entry" });
    expect(() => deletePopupDependency(project, "free-entry")).toThrow(
      /BaseGame -> FreeGame/,
    );
    setGameModeTransitionPreludePopup(project, transition, null);
    deletePopupDependency(project, "free-entry");
  });

  it("keeps stable modes state-free and rewrites directed transition references", () => {
    const project = createNewEditorProject("maximized-focus");
    addGameMode(project, "FreeGame", project.mode);
    createGameModeTransition(project, "BaseGame", "FreeGame");
    expect(project.gameModes.transitions).toHaveLength(1);
    expect(() => deleteGameMode(project, "FreeGame")).toThrow(/转场引用/);
    renameGameMode(project, "FreeGame", "FG");
    expect(project.gameModes.transitions[0]).toMatchObject({
      fromModeId: "BaseGame",
      toModeId: "FG",
    });
    deleteGameModeTransition(project, "BaseGame", "FG");
    deleteGameMode(project, "FG");
    expect(project.gameModes.modes[0].nodeStates).toEqual({});
  });

  it("switches transition presentation as a clean discriminated union", () => {
    const project = createNewEditorProject("orientation-focus");
    project.resources.set("clip", {
      id: "clip",
      kind: "video",
      path: `assets/${"a".repeat(64)}.mp4`,
      mimeType: "video/mp4",
      size: { width: 1280, height: 720 },
      durationSeconds: 3.625,
      hasAudio: true,
    });
    addGameMode(project, "FreeGame", project.mode);
    createGameModeTransition(project, "BaseGame", "FreeGame");
    project.gameModes.transitions[0]!.preludePopupId = "shared-prelude";
    const none = setGameModeTransitionKind(
      project,
      project.gameModes.transitions[0]!,
      "none",
    );
    expect(none).toEqual({
      kind: "none",
      fromModeId: "BaseGame",
      toModeId: "FreeGame",
      preludePopupId: "shared-prelude",
    });
    const video = setGameModeTransitionKind(project, none, "video");
    setGameModeVideoTransitionResource(project, video, "clip");
    setGameModeVideoTransitionFadeOut(project, video, 0.5);
    expect(video).not.toHaveProperty("animation");
    expect(video).not.toHaveProperty("placements");
    expect(video.preludePopupId).toBe("shared-prelude");
    expect(() =>
      setGameModeVideoTransitionFadeOut(project, video, 3.625),
    ).toThrow(/小于视频实际时长/);
    const spine = setGameModeTransitionKind(project, video, "spine");
    expect(spine).toMatchObject({
      kind: "spine",
      resourceId: "",
      animation: "",
      switchEvent: "",
      placements: {
        landscape: { x: 0, y: 0, scale: 1 },
        portrait: { x: 0, y: 0, scale: 1 },
      },
    });
    expect(spine).not.toHaveProperty("fit");
    expect(spine).not.toHaveProperty("fadeOutSeconds");
  });

  it("owns per-mode background and Symbols bindings with reference protection", () => {
    const project = createNewEditorProject("maximized-focus");
    project.resources.set("bg-art", {
      id: "bg-art",
      kind: "image",
      path: "assets/bg.png",
      size: { width: 100, height: 100 },
    });
    project.nodes.push({
      id: "bg",
      order: 0,
      resourceId: "bg-art",
      placements: { default: { x: 0, y: 0, scale: 1 } },
    });
    bindGameModeBackground(project, "BaseGame", "default", "bg");
    expect(project.gameModes.modes[0].backgroundNodes).toEqual({
      default: "bg",
    });
    expect(project.variants.default.backgroundNode).toBe("bg");
    expect(() =>
      bindGameModeBackground(project, "BaseGame", "portrait", "bg"),
    ).toThrow(/不使用/);
    expect(() =>
      bindGameModeBackground(project, "BaseGame", "default", "missing"),
    ).toThrow(/未知背景/);

    const imported = symbolPackage("demo-symbols", 1);
    importSymbolDependency(project, imported);
    expect(() => importSymbolDependency(project, imported)).toThrow(/已存在/);
    bindGameModeSymbols(project, "BaseGame", {
      packageId: "demo-symbols",
      reelSet: "main",
      renderMode: "standard",
    });
    expect(project.gameModes.modes[0].symbols?.packageId).toBe("demo-symbols");
    expect(project.reel.order).toBe(999);
    expect(() => deleteSymbolDependency(project, "demo-symbols")).toThrow(
      /BaseGame/,
    );
    expect(() =>
      bindGameModeSymbols(project, "BaseGame", {
        packageId: "missing",
        reelSet: "main",
        renderMode: "standard",
      }),
    ).toThrow(/未知 Symbols/);
    expect(() =>
      replaceSymbolDependency(
        project,
        "demo-symbols",
        symbolPackage("other", 2),
      ),
    ).toThrow(/必须保持/);
    bindGameModeSymbols(project, "BaseGame", null);
    deleteSymbolDependency(project, "demo-symbols");
    expect(project.symbolDependencies.size).toBe(0);
  });

  it("isolates different Symbols owners and replaces only same-id bytes", () => {
    const project = createNewEditorProject("maximized-focus");
    const first = symbolPackage("first-symbols", 1);
    const second = symbolPackage("second-symbols", 2);
    importSymbolDependency(project, first);
    importSymbolDependency(project, second);

    expect(project.assets.get(first.rootKey)).toEqual(new Uint8Array([1]));
    expect(project.assets.get(second.rootKey)).toEqual(new Uint8Array([2]));
    expect(project.symbolDependencies.size).toBe(2);

    replaceSymbolDependency(
      project,
      "first-symbols",
      symbolPackage("first-symbols", 3),
    );

    expect(project.assets.get(first.rootKey)).toEqual(new Uint8Array([3]));
    expect(project.assets.get(second.rootKey)).toEqual(new Uint8Array([2]));
  });

  it("allows an exclusive Symbols replacement to change filename-key casing", () => {
    const project = createNewEditorProject("maximized-focus");
    const previous = symbolPackage("game002-s3", 1);
    previous.files.set(
      "pkg-10-game002-s3-af_spinblur.png",
      new Uint8Array([1]),
    );
    importSymbolDependency(project, previous);

    const replacement = symbolPackage("game002-s3", 2);
    replacement.files.set(
      "pkg-10-game002-s3-AF_spinBlur.png",
      new Uint8Array([2]),
    );
    replaceSymbolDependency(project, "game002-s3", replacement);

    expect(project.assets.has("pkg-10-game002-s3-af_spinblur.png")).toBe(false);
    expect(project.assets.get("pkg-10-game002-s3-AF_spinBlur.png")).toEqual(
      new Uint8Array([2]),
    );
  });

  it("still rejects a filename-key case alias owned by another dependency", () => {
    const project = createNewEditorProject("maximized-focus");
    const first = symbolPackage("first-symbols", 1);
    first.files.set("shared-image.png", new Uint8Array([1]));
    importSymbolDependency(project, first);

    const second = symbolPackage("second-symbols", 2);
    second.files.set("SHARED-IMAGE.png", new Uint8Array([2]));

    expect(() => importSymbolDependency(project, second)).toThrow(/大小写冲突/);
    expect(project.symbolDependencies.has("second-symbols")).toBe(false);
  });

  it("never aliases a new mode to the currently edited background nodes", () => {
    const project = createNewEditorProject("orientation-focus");
    project.gameModes.modes[0]!.backgroundNodes = {
      landscape: "base-landscape",
      portrait: "base-portrait",
    };
    project.variants.landscape.backgroundNode = "base-landscape";
    project.variants.portrait.backgroundNode = "base-portrait";

    addGameMode(project, "FreeGame", project.mode);

    expect(project.gameModes.modes[1]!.backgroundNodes).toEqual({
      landscape: "",
      portrait: "",
    });
    expect(project.gameModes.modes[0]!.backgroundNodes).toEqual({
      landscape: "base-landscape",
      portrait: "base-portrait",
    });
  });

  it("removes only the deleted mode's orphaned background nodes", () => {
    const project = createNewEditorProject("maximized-focus");
    project.resources.set("art", {
      id: "art",
      kind: "image",
      path: "assets/art.png",
      size: { width: 100, height: 100 },
    });
    project.nodes.push(
      {
        id: "base-background",
        order: 0,
        resourceId: "art",
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
      {
        id: "free-background",
        order: 1,
        resourceId: "art",
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
    );
    bindGameModeBackground(project, "BaseGame", "default", "base-background");
    addGameMode(project, "FreeGame", project.mode);
    bindGameModeBackground(project, "FreeGame", "default", "free-background");

    deleteGameMode(project, "FreeGame");

    expect(project.nodes.map((node) => node.id)).toEqual(["base-background"]);
    expect(project.resources.has("art")).toBe(true);
  });

  it("keeps the initial mode backgrounds below every other mode background", () => {
    const project = createNewEditorProject("orientation-focus");
    project.resources.set("art", {
      id: "art",
      kind: "image",
      path: "assets/art.png",
      size: { width: 100, height: 100 },
    });
    project.nodes.push(
      {
        id: "base-landscape",
        order: 2,
        resourceId: "art",
        placements: { landscape: { x: 0, y: 0, scale: 1 } },
      },
      {
        id: "free-landscape",
        order: 0,
        resourceId: "art",
        placements: { landscape: { x: 0, y: 0, scale: 1 } },
      },
      {
        id: "base-portrait",
        order: 3,
        resourceId: "art",
        placements: { portrait: { x: 0, y: 0, scale: 1 } },
      },
      {
        id: "free-portrait",
        order: 1,
        resourceId: "art",
        placements: { portrait: { x: 0, y: 0, scale: 1 } },
      },
    );
    addGameMode(project, "FreeGame", project.mode);
    bindGameModeBackground(project, "BaseGame", "landscape", "base-landscape");
    bindGameModeBackground(project, "BaseGame", "portrait", "base-portrait");
    bindGameModeBackground(project, "FreeGame", "landscape", "free-landscape");
    bindGameModeBackground(project, "FreeGame", "portrait", "free-portrait");
    expect(project.nodes.map((node) => node.id)).toEqual([
      "base-landscape",
      "base-portrait",
      "free-landscape",
      "free-portrait",
    ]);

    setInitialGameMode(project, "FreeGame");
    expect(project.nodes.map((node) => node.id)).toEqual([
      "free-landscape",
      "free-portrait",
      "base-landscape",
      "base-portrait",
    ]);
    activateEditorGameMode(project, "FreeGame");
    expect(project.variants.landscape.backgroundNode).toBe("free-landscape");
    expect(project.variants.portrait.backgroundNode).toBe("free-portrait");
  });
});

function popup(id: string, marker: number) {
  return {
    manifest: { id, type: "award-celebration" } as never,
    rootKey: `${id}-popup.manifest.json`,
    files: new Map([[`${id}-popup.manifest.json`, new Uint8Array([marker])]]),
    sourceSpineAssets: [],
  };
}

function symbolPackage(id: string, marker: number) {
  return {
    resource: {
      packageManifest: { id },
    } as never,
    rootKey: `${id}-symbols.package.json`,
    files: new Map([[`${id}-symbols.package.json`, new Uint8Array([marker])]]),
  };
}
