import { beforeEach, describe, expect, it, vi } from "vitest";

const previewSpies = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  clear: vi.fn(),
  setLayout: vi.fn(async (): Promise<void> => undefined),
  applyGeometryManifest: vi.fn(),
  setSelectedLayer: vi.fn(),
  setPageSize: vi.fn(),
  setZoom: vi.fn(),
  setGuideVisibility: vi.fn(),
  setSymbolPackage: vi.fn(async (): Promise<unknown> => null),
  setSelectedReelSet: vi.fn((): unknown => undefined),
  randomizeSymbols: vi.fn((): unknown => undefined),
  setSymbolGrid: vi.fn((): unknown => undefined),
  setOtherSceneBindings: vi.fn((): unknown => undefined),
  getSpineNodeStates: vi.fn(() => []),
  requestNodeState: vi.fn(async () => undefined),
  playAwardCelebration: vi.fn(),
  openPopup: vi.fn(),
  closePopup: vi.fn(async () => undefined),
  getActivePopupAddress: vi.fn((): string | null => null),
  advanceAwardCelebration: vi.fn(),
  dismissAwardCelebrationImmediately: vi.fn(),
  prepareGameModeTransition: vi.fn(async () => undefined),
  cancelPreparedGameModeTransition: vi.fn(),
  requestGameMode: vi.fn(async () => undefined),
  selectAuthoringGameMode: vi.fn(async () => undefined),
  getCurrentVariantId: vi.fn(() => "landscape"),
  requestPrimaryPopupInteraction: vi.fn(() => ({ handled: true })),
  requestPrimaryGameModeAction: vi.fn(async (): Promise<void> => undefined),
  getGameModeSnapshot: vi.fn((): unknown => null),
  getActiveAwardCelebrationSnapshot: vi.fn((): unknown => null),
  destroy: vi.fn(),
}));

const ioSpies = vi.hoisted(() => ({
  importZip: vi.fn(),
  exportZip: vi.fn(),
  importSymbolsZipWithFiles: vi.fn(),
  importPopupPackageZip: vi.fn(),
  findPopupSpineAssetConflicts: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("../src/preview/layout-preview.js", () => ({
  LayoutPreview: class {
    pageSize = { width: 1920, height: 1080 };
    zoom = 1;
    init = previewSpies.init;
    clear = previewSpies.clear;
    setLayout = previewSpies.setLayout;
    applyGeometryManifest = previewSpies.applyGeometryManifest;
    setSelectedLayer = previewSpies.setSelectedLayer;
    setPageSize = previewSpies.setPageSize;
    setZoom = previewSpies.setZoom;
    setGuideVisibility = previewSpies.setGuideVisibility;
    setSymbolPackage = previewSpies.setSymbolPackage;
    setSelectedReelSet = previewSpies.setSelectedReelSet;
    randomizeSymbols = previewSpies.randomizeSymbols;
    setSymbolGrid = previewSpies.setSymbolGrid;
    setOtherSceneBindings = previewSpies.setOtherSceneBindings;
    getSpineNodeStates = previewSpies.getSpineNodeStates;
    requestNodeState = previewSpies.requestNodeState;
    playAwardCelebration = previewSpies.playAwardCelebration;
    openPopup = previewSpies.openPopup;
    closePopup = previewSpies.closePopup;
    getActivePopupAddress = previewSpies.getActivePopupAddress;
    advanceAwardCelebration = previewSpies.advanceAwardCelebration;
    dismissAwardCelebrationImmediately =
      previewSpies.dismissAwardCelebrationImmediately;
    prepareGameModeTransition = previewSpies.prepareGameModeTransition;
    cancelPreparedGameModeTransition =
      previewSpies.cancelPreparedGameModeTransition;
    requestGameMode = previewSpies.requestGameMode;
    selectAuthoringGameMode = previewSpies.selectAuthoringGameMode;
    getCurrentVariantId = previewSpies.getCurrentVariantId;
    requestPrimaryPopupInteraction =
      previewSpies.requestPrimaryPopupInteraction;
    requestPrimaryGameModeAction = previewSpies.requestPrimaryGameModeAction;
    getGameModeSnapshot = previewSpies.getGameModeSnapshot;
    getActiveAwardCelebrationSnapshot =
      previewSpies.getActiveAwardCelebrationSnapshot;
    destroy = previewSpies.destroy;
  },
}));

vi.mock("../src/io/imported-layout-zip.js", () => ({
  importLayoutZip: ioSpies.importZip,
  LAYOUT_ZIP_LIMITS: {
    maxEntries: 4096,
    maxCompressedBytes: 200 * 1024 * 1024,
    maxFileBytes: 50 * 1024 * 1024,
    maxTotalBytes: 500 * 1024 * 1024,
  },
}));
vi.mock("../src/io/exported-layout-zip.js", () => ({
  exportLayoutZip: ioSpies.exportZip,
}));
vi.mock("../src/io/imported-symbol-package.js", () => ({
  importSymbolsZipWithFiles: ioSpies.importSymbolsZipWithFiles,
}));
vi.mock("../src/io/imported-popup-package.js", () => ({
  importPopupPackageZip: ioSpies.importPopupPackageZip,
  findPopupSpineAssetConflicts: ioSpies.findPopupSpineAssetConflicts,
}));

import { GameLayoutEditorApp } from "../src/ui/app-shell.js";
import {
  createDefaultNodePlacement,
  createNewEditorProject,
  editorProjectToManifest,
} from "../src/model/editor-project.js";
import { addGameMode } from "../src/model/game-mode-commands.js";

describe("GameLayoutEditorApp current workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewSpies.getCurrentVariantId.mockReturnValue("landscape");
    previewSpies.setSymbolPackage.mockResolvedValue(null);
    ioSpies.findPopupSpineAssetConflicts.mockResolvedValue([]);
    previewSpies.requestPrimaryGameModeAction.mockResolvedValue(undefined);
    window.confirm = vi.fn(() => true);
    window.prompt = vi.fn((_message, value) => value ?? null);
  });

  it("coalesces pending primary clicks and keeps unchanged modes out of project transactions", async () => {
    previewSpies.getGameModeSnapshot.mockReturnValue({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      phase: "stable",
    });
    const { app, root } = await createApp();
    await vi.waitFor(() =>
      expect(previewSpies.selectAuthoringGameMode).toHaveBeenCalled(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    previewSpies.setLayout.mockClear();
    previewSpies.applyGeometryManifest.mockClear();
    let complete!: () => void;
    previewSpies.requestPrimaryGameModeAction.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const host = root.querySelector<HTMLElement>("[data-preview-host]")!;
    host.click();
    host.click();
    host.click();
    expect(previewSpies.requestPrimaryGameModeAction).toHaveBeenCalledTimes(1);
    complete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(previewSpies.setLayout).not.toHaveBeenCalled();
    expect(previewSpies.applyGeometryManifest).not.toHaveBeenCalled();
    app.destroy();
    previewSpies.getGameModeSnapshot.mockReturnValue(null);
  });

  it("ignores canvas clicks until the project preview is ready", async () => {
    let complete!: () => void;
    previewSpies.setLayout.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const { app, root } = await createApp();
    root.querySelector<HTMLElement>("[data-preview-host]")!.click();
    expect(previewSpies.requestPrimaryGameModeAction).not.toHaveBeenCalled();
    complete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.destroy();
  });

  it("mounts the six accessible workspaces", async () => {
    const { app, root } = await createApp();
    const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "资源",
      "布局",
      "转场",
      "Symbols",
      "BigWin",
      "项目",
    ]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector("[data-upload-resources]")).toBeTruthy();
    app.destroy();
  });

  it("keeps edits made during a refresh pending and coalesces repeated refresh clicks", async () => {
    const { app, root } = await createApp();
    await vi.waitFor(() =>
      expect(
        root.querySelector<HTMLButtonElement>("[data-refresh-preview]")!
          .disabled,
      ).toBe(false),
    );
    root
      .querySelector<HTMLButtonElement>('[data-workspace-tab="layout"]')!
      .click();
    const editColumns = (value: string) => {
      const input = root.querySelector<HTMLInputElement>(
        '[data-number="reel.columns"]',
      )!;
      input.value = value;
      input.dispatchEvent(new Event("change"));
    };
    previewSpies.setLayout.mockClear();
    editColumns("6");
    expect(previewSpies.setLayout).not.toHaveBeenCalled();
    let complete!: () => void;
    previewSpies.setLayout.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const refresh = root.querySelector<HTMLButtonElement>(
      "[data-refresh-preview]",
    )!;
    refresh.click();
    refresh.click();
    expect(previewSpies.setLayout).toHaveBeenCalledTimes(1);
    expect(refresh.disabled).toBe(true);
    editColumns("7");
    complete();
    await vi.waitFor(() => expect(refresh.disabled).toBe(false));
    expect(
      root.querySelector("[data-preview-refresh-status]")!.textContent,
    ).toContain("预览未同步");
    refresh.click();
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-preview-refresh-status]")!.textContent,
      ).toBe("预览已同步"),
    );
    expect(previewSpies.setLayout).toHaveBeenCalledTimes(2);
    expect(previewSpies.setLayout).toHaveBeenLastCalledWith(
      expect.objectContaining({
        main: expect.objectContaining({ columns: 7 }),
      }),
      expect.any(Map),
    );
    app.destroy();
  });

  it("allows retrying failed refreshes and ignores completion after destroy", async () => {
    const { app, root } = await createApp();
    const refresh = root.querySelector<HTMLButtonElement>(
      "[data-refresh-preview]",
    )!;
    await vi.waitFor(() => expect(refresh.disabled).toBe(false));
    previewSpies.setLayout.mockRejectedValueOnce(new Error("refresh failed"));
    refresh.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-errors]")!.textContent).toContain(
        "refresh failed",
      ),
    );
    expect(refresh.disabled).toBe(false);
    expect(
      root.querySelector("[data-preview-refresh-status]")!.textContent,
    ).toContain("预览未同步");
    let complete!: () => void;
    previewSpies.setLayout.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    refresh.click();
    app.destroy();
    complete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.childElementCount).toBe(0);
  });

  it("creates only a centered, untyped BaseGame project", async () => {
    const { app, root } = await createApp();
    (root.querySelector("[data-new-project]") as HTMLButtonElement).click();
    const dialog = root.querySelector(
      "[data-new-project-dialog]",
    ) as HTMLDialogElement;
    expect(dialog.textContent).toContain("新建中心坐标项目");
    expect(dialog.textContent).toContain("默认只创建 BaseGame");
    expect(dialog.querySelector("select")).toBeNull();
    expect(dialog.querySelector("[data-coordinate-origin]")).toBeNull();
    (
      dialog.querySelector("[data-confirm-new-project]") as HTMLButtonElement
    ).click();

    const modes = root.querySelector("[data-game-mode]") as HTMLSelectElement;
    expect([...modes.options].map(({ value }) => value)).toEqual(["BaseGame"]);
    expect(previewSpies.setLayout).toHaveBeenLastCalledWith(
      expect.objectContaining({
        version: 8,
        main: expect.any(Object),
        gameModes: expect.any(Object),
      }),
      expect.any(Map),
    );
    app.destroy();
  });

  it("creates and marks a Splash mode without an intermediate missing-transition error", async () => {
    const { app, root } = await createApp();
    root.querySelector<HTMLButtonElement>("[data-manage-modes]")!.click();
    const input = root.querySelector<HTMLInputElement>("[data-new-game-mode]")!;
    input.value = "Welcome";
    input.dispatchEvent(new Event("input"));
    root.querySelector<HTMLButtonElement>("[data-add-game-mode]")!.click();
    const button = root.querySelector<HTMLButtonElement>(
      "[data-toggle-splash-mode]",
    )!;
    expect(button.textContent).toBe("设为 splash");
    button.click();
    expect(root.querySelector("[data-errors]")!.textContent).toBe("");
    expect(
      root.querySelector("[data-mode-dialog-feedback]")!.textContent,
    ).toContain("未配置转场时直接进入 BaseGame");
    root.querySelector<HTMLButtonElement>("[data-refresh-preview]")!.click();
    await vi.waitFor(() =>
      expect(previewSpies.setLayout).toHaveBeenLastCalledWith(
        expect.objectContaining({
          gameModes: expect.objectContaining({
            splashMode: "Welcome",
            initialMode: "BaseGame",
            transitions: [],
          }),
        }),
        expect.any(Map),
      ),
    );
    app.destroy();
  });

  it("edits centered main geometry without artSize controls", async () => {
    const { app, root } = await createApp();
    (
      root.querySelector('[data-workspace-tab="layout"]') as HTMLButtonElement
    ).click();
    expect(root.textContent).not.toContain("artSize");
    expect(root.querySelector("[data-toggle-coordinate-origin]")).toBeNull();
    expect(
      root.querySelector(
        '[data-number="gameModes.modes.0.mainVariants.landscape.focusRect.x"]',
      ),
    ).toBeNull();
    const focusLeft = root.querySelector(
      '[data-number="gameModes.modes.0.mainVariants.landscape.focusOffsets.left"]',
    ) as HTMLInputElement;
    expect(focusLeft.value).toBe("60");
    const mainX = root.querySelector(
      '[data-number="gameModes.modes.0.mainVariants.landscape.x"]',
    ) as HTMLInputElement;
    mainX.value = "42";
    mainX.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(previewSpies.applyGeometryManifest).toHaveBeenCalled(),
    );
    expect(previewSpies.applyGeometryManifest).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: 8 }),
    );
    focusLeft.value = "75";
    focusLeft.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(previewSpies.applyGeometryManifest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          gameModes: expect.objectContaining({
            modes: expect.arrayContaining([
              expect.objectContaining({
                main: expect.objectContaining({
                  variants: expect.objectContaining({
                    landscape: expect.objectContaining({
                      focusRect: expect.objectContaining({ x: -433 }),
                    }),
                  }),
                }),
              }),
            ]),
          }),
        }),
      ),
    );
    app.destroy();
  });

  it("adds game modes without asking for a mode type", async () => {
    const { app, root } = await createApp();
    (root.querySelector("[data-manage-modes]") as HTMLButtonElement).click();
    const dialog = root.querySelector(
      "[data-mode-dialog]",
    ) as HTMLDialogElement;
    expect(dialog.querySelector("[data-new-game-mode-type]")).toBeNull();
    const id = dialog.querySelector("[data-new-game-mode]") as HTMLInputElement;
    id.value = "FreeGame";
    id.dispatchEvent(new Event("input"));
    (
      root.querySelector(
        "[data-mode-dialog] [data-add-game-mode]",
      ) as HTMLButtonElement
    ).click();
    expect(
      [...root.querySelectorAll<HTMLElement>("[data-select-game-mode]")].map(
        (node) => node.dataset.selectGameMode,
      ),
    ).toEqual(["BaseGame", "FreeGame"]);
    app.destroy();
  });

  it("edits an imported exact mode and orientation scope", async () => {
    const project = createNewEditorProject();
    addGameMode(project, "FreeGame");
    project.resources.set("background.png", {
      id: "background.png",
      kind: "image",
      path: "background.png",
      size: { width: 1, height: 1 },
    });
    project.assets.set("background.png", new Uint8Array([1]));
    project.nodes.push({
      id: "base-bg",
      order: 0,
      resourceId: "background.png",
      scope: { BaseGame: ["landscape", "portrait"] },
      placements: {
        landscape: createDefaultNodePlacement(),
        portrait: createDefaultNodePlacement(),
      },
    });
    const destroyImported = vi.fn();
    ioSpies.importZip.mockResolvedValueOnce({
      manifest: editorProjectToManifest(project),
      assets: project.assets,
      videoMetadata: new Map(),
      nodeIdRenames: [],
      destroy: destroyImported,
    });
    const click = selectFilesOnce([new File(["layout"], "layout.zip")]);
    const { app, root } = await createApp();

    (root.querySelector("[data-import]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-outline-key="layer:base-bg"]'),
      ).toBeTruthy(),
    );
    (
      root.querySelector(
        '[data-outline-key="layer:base-bg"]',
      ) as HTMLButtonElement
    ).click();

    const global = root.querySelector(
      '[data-layer-global="base-bg"]',
    ) as HTMLInputElement;
    expect(global.checked).toBe(false);
    expect(root.textContent).toContain("BaseGame · landscape/portrait");
    const freeLandscape = root.querySelector(
      '[data-layer-node-id="base-bg"][data-layer-scope-mode="FreeGame"][data-layer-scope-variant="landscape"]',
    ) as HTMLInputElement;
    expect(freeLandscape.checked).toBe(false);
    previewSpies.setLayout.mockClear();
    freeLandscape.click();
    expect(previewSpies.setLayout).not.toHaveBeenCalled();
    expect(
      root.querySelector("[data-preview-refresh-status]")!.textContent,
    ).toContain("预览未同步");
    root.querySelector<HTMLButtonElement>("[data-refresh-preview]")!.click();

    await vi.waitFor(() => {
      const lastCall = previewSpies.setLayout.mock.lastCall as unknown as
        | [ReturnType<typeof editorProjectToManifest>]
        | undefined;
      const manifest = lastCall?.[0];
      expect(manifest?.nodes[0]?.scope).toEqual({
        BaseGame: ["landscape", "portrait"],
        FreeGame: ["landscape"],
      });
    });
    await vi.waitFor(() =>
      expect(
        root.querySelector<HTMLButtonElement>("[data-refresh-preview]")!
          .disabled,
      ).toBe(false),
    );
    previewSpies.setLayout.mockClear();
    previewSpies.applyGeometryManifest.mockClear();
    root
      .querySelector<HTMLInputElement>('[data-layer-global="base-bg"]')!
      .click();
    const x = root.querySelector<HTMLInputElement>(
      '[data-number="nodes.0.placements.landscape.x"]',
    )!;
    x.value = "18";
    x.dispatchEvent(new Event("change"));
    expect(previewSpies.setLayout).not.toHaveBeenCalled();
    expect(previewSpies.applyGeometryManifest).not.toHaveBeenCalled();
    expect(root.querySelector("[data-errors]")!.textContent).toBe("");
    root.querySelector<HTMLButtonElement>("[data-refresh-preview]")!.click();
    await vi.waitFor(() =>
      expect(
        root.querySelector<HTMLButtonElement>("[data-refresh-preview]")!
          .disabled,
      ).toBe(false),
    );
    const finalManifest = (
      previewSpies.setLayout.mock.lastCall as unknown as [
        ReturnType<typeof editorProjectToManifest>,
      ]
    )[0];
    expect(finalManifest.nodes[0]).not.toHaveProperty("scope");
    expect(finalManifest.nodes[0]?.placements.landscape?.x).toBe(18);
    expect(destroyImported).toHaveBeenCalledTimes(1);
    app.destroy();
    click.mockRestore();
  });

  it("surfaces a failed import and destroys idempotently", async () => {
    ioSpies.importZip.mockRejectedValueOnce(new Error("bad zip"));
    const click = selectFilesOnce([new File(["bad"], "bad.zip")]);
    const { app, root } = await createApp();
    (root.querySelector("[data-import]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-errors]")?.textContent).toContain(
        "bad zip",
      ),
    );
    app.destroy();
    app.destroy();
    expect(previewSpies.destroy).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});

async function createApp() {
  const root = document.createElement("div");
  document.body.append(root);
  const app = new GameLayoutEditorApp(root);
  await app.init();
  return { app, root };
}

function selectFilesOnce(files: readonly File[]) {
  return vi
    .spyOn(HTMLInputElement.prototype, "click")
    .mockImplementationOnce(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", {
        configurable: true,
        value: files,
      });
      this.dispatchEvent(new Event("change"));
    });
}
