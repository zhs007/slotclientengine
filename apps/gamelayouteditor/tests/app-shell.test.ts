import { beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";

const previewSpies = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  clear: vi.fn(),
  setLayout: vi.fn(async () => undefined),
  setPageSize: vi.fn(),
  setZoom: vi.fn(),
  setGuideVisibility: vi.fn(),
  setSymbolPackage: vi.fn(async (): Promise<unknown> => null),
  setSelectedReelSet: vi.fn((): unknown => undefined),
  randomizeSymbols: vi.fn((): unknown => undefined),
  setSymbolGrid: vi.fn((): unknown => undefined),
  setOtherSceneBindings: vi.fn(
    (_bindings: readonly unknown[]): unknown => undefined,
  ),
  getSpineNodeStates: vi.fn(
    () =>
      [] as Array<{
        nodeId: string;
        states: string[];
        stableState: string;
        targetState: string | null;
        phase: "stable" | "transitioning";
      }>,
  ),
  requestNodeState: vi.fn(async () => undefined),
  playAwardCelebration: vi.fn(),
  advanceAwardCelebration: vi.fn(),
  dismissAwardCelebrationImmediately: vi.fn(),
  prepareGameModeTransition: vi.fn(
    async (_target: string): Promise<void> => undefined,
  ),
  cancelPreparedGameModeTransition: vi.fn(),
  requestGameMode: vi.fn(async (): Promise<void> => undefined),
  getGameModeSnapshot: vi.fn((): any => null),
  getActiveAwardCelebrationSnapshot: vi.fn((): any => null),
  destroy: vi.fn(),
}));

const ioSpies = vi.hoisted(() => ({
  importZip: vi.fn(),
  exportZip: vi.fn(),
  importSymbolsZipWithFiles: vi.fn(),
  importPopupPackageZip: vi.fn(),
}));

const commandSpies = vi.hoisted(() => ({
  uploadImage: vi.fn(async ({ project, file, resourceId }) => {
    const id = resourceId ?? file.name;
    const resource = {
      id,
      kind: "image" as const,
      path: id,
      size: { width: 100, height: 80 },
    };
    project.resources.set(id, resource);
    project.assets.set(resource.path, new Uint8Array([1, 2, 3]));
    return resource;
  }),
  uploadSpine: vi.fn(async ({ project, resourceId }) => {
    const resource = {
      id: resourceId ?? "hero.json",
      kind: "spine" as const,
      skeleton: "hero.json",
      atlas: "hero.atlas",
      textures: { "hero.png": "hero.png" },
      animationNames: ["Idle", "Win", "Bridge"],
      animationEvents: {
        Idle: [],
        Win: [],
        Bridge: [{ name: "SwitchScene", time: 0.5 }],
      },
      bounds: { width: 400, height: 300 },
    };
    project.resources.set(resource.id, resource);
    project.assets.set(resource.skeleton, new Uint8Array([1]));
    project.assets.set(resource.atlas, new Uint8Array([2]));
    project.assets.set("hero.png", new Uint8Array([3]));
    return resource;
  }),
  uploadVideo: vi.fn(async ({ project, file, resourceId }) => {
    const resource = {
      id: resourceId ?? file.name,
      kind: "video" as const,
      path: file.name,
      mimeType: "video/mp4" as const,
      size: { width: 1280, height: 720 },
      durationSeconds: 3.625,
      hasAudio: true,
    };
    project.resources.set(resource.id, resource);
    project.assets.set(resource.path, new Uint8Array(await file.arrayBuffer()));
    return resource;
  }),
}));

vi.mock("../src/preview/layout-preview.js", () => ({
  LayoutPreview: class {
    pageSize = { width: 1920, height: 1080 };
    zoom = 1;
    init = previewSpies.init;
    clear = previewSpies.clear;
    setLayout = previewSpies.setLayout;
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
    advanceAwardCelebration = previewSpies.advanceAwardCelebration;
    dismissAwardCelebrationImmediately =
      previewSpies.dismissAwardCelebrationImmediately;
    prepareGameModeTransition = previewSpies.prepareGameModeTransition;
    cancelPreparedGameModeTransition =
      previewSpies.cancelPreparedGameModeTransition;
    requestGameMode = previewSpies.requestGameMode;
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
}));

vi.mock("../src/model/resource-commands.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/model/resource-commands.js")>();
  return {
    ...actual,
    uploadImageResource: commandSpies.uploadImage,
    uploadSpineResource: commandSpies.uploadSpine,
    uploadVideoResource: commandSpies.uploadVideo,
  };
});

import { GameLayoutEditorApp } from "../src/ui/app-shell.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("GameLayoutEditorApp workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewSpies.getGameModeSnapshot.mockReturnValue(null);
    previewSpies.getActiveAwardCelebrationSnapshot.mockReturnValue(null);
    previewSpies.requestGameMode.mockResolvedValue(undefined);
    previewSpies.prepareGameModeTransition.mockResolvedValue(undefined);
    previewSpies.setSymbolPackage.mockResolvedValue(null);
    window.confirm = vi.fn(() => true);
    window.prompt = vi.fn((_message, defaultValue) => defaultValue ?? null);
  });

  it("mounts six accessible state workspaces without preview drawers", async () => {
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
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector("[data-upload-resources]")).toBeTruthy();
    expect(root.querySelector("[data-number]")).toBeNull();
    expect(root.querySelector(".symbols-drawer")).toBeNull();
    (tabs[3] as HTMLButtonElement).click();
    expect(
      root.querySelector("[data-symbols-workspace]")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(root.querySelector("[data-import-symbols]")).toBeNull();
    (tabs[0] as HTMLButtonElement).click();
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector("[data-outline-list]")).toBeTruthy();
    expect(root.querySelectorAll(".inspector-inner")).toHaveLength(1);
    tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    expect(tabs[5].getAttribute("aria-selected")).toBe("true");
    tabs[5].dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(tabs[5].getAttribute("aria-selected")).toBe("true");
    app.destroy();
  });

  it("preserves advanced Inspector state and uses one resolution select", async () => {
    const { app, root } = await createApp();
    (
      root.querySelector('[data-workspace-tab="layout"]') as HTMLButtonElement
    ).click();
    const details = root.querySelector(
      '[data-inspector-section="layout:reel:main:advanced"]',
    ) as HTMLDetailsElement;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    const cell = root.querySelector(
      '[data-number="reel.cellWidth"]',
    ) as HTMLInputElement;
    cell.value = "161";
    cell.dispatchEvent(new Event("change"));
    expect(
      (
        root.querySelector(
          '[data-inspector-section="layout:reel:main:advanced"]',
        ) as HTMLDetailsElement
      ).open,
    ).toBe(true);
    expect(root.querySelector("[data-preview-presets]")).toBeNull();
    const resolution = root.querySelector(
      "[data-preview-resolution]",
    ) as HTMLSelectElement;
    resolution.value = "390x844";
    resolution.dispatchEvent(new Event("change"));
    expect(previewSpies.setPageSize).toHaveBeenCalledWith({
      width: 390,
      height: 844,
    });
    const width = root.querySelector(
      "[data-preview-width]",
    ) as HTMLInputElement;
    width.value = "1111";
    width.dispatchEvent(new Event("change"));
    expect(resolution.value).toBe("custom");
    app.destroy();
  });

  it("creates projects only after confirming the single new-project dialog", async () => {
    const { app, root } = await createApp();
    expect(root.querySelectorAll("[data-new-project]")).toHaveLength(1);
    expect(root.querySelector("[data-new-single]")).toBeNull();
    expect(root.querySelector("[data-new-dual]")).toBeNull();
    (root.querySelector("[data-new-project]") as HTMLButtonElement).click();
    expect(
      root.querySelectorAll('input[type="radio"][name="new-project-mode"]'),
    ).toHaveLength(0);
    const modeSelect = root.querySelector(
      "[data-new-project-mode]",
    ) as HTMLSelectElement;
    expect([...modeSelect.options].map((option) => option.value)).toEqual([
      "",
      "maximized-focus",
      "orientation-focus",
    ]);
    expect(
      (root.querySelector("[data-confirm-new-project]") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    (
      root.querySelector("[data-cancel-new-project]") as HTMLButtonElement
    ).click();
    expect(
      root.querySelector("[data-main-state-status]")?.textContent,
    ).toContain("initial=BaseGame");
    (root.querySelector("[data-new-project]") as HTMLButtonElement).click();
    modeSelect.value = "orientation-focus";
    modeSelect.dispatchEvent(new Event("change"));
    (
      root.querySelector("[data-confirm-new-project]") as HTMLButtonElement
    ).click();
    expect(root.querySelector("[data-project-status]")?.textContent).toContain(
      "orientation-focus",
    );
    (root.querySelector("[data-new-project]") as HTMLButtonElement).click();
    expect(modeSelect.value).toBe("");
    (
      root.querySelector("[data-new-project-dialog]") as HTMLDialogElement
    ).dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(root.querySelector("[data-project-status]")?.textContent).toContain(
      "orientation-focus",
    );
    modeSelect.value = "maximized-focus";
    modeSelect.dispatchEvent(new Event("change"));
    (
      root.querySelector("[data-confirm-new-project]") as HTMLButtonElement
    ).click();
    expect(root.querySelector("[data-project-status]")?.textContent).toContain(
      "maximized-focus",
    );
    app.destroy();
  });

  it("keeps the complete state list open and synchronizes successful mode mutations", async () => {
    const { app, root } = await createApp();
    (root.querySelector("[data-manage-modes]") as HTMLButtonElement).click();
    const dialog = root.querySelector(
      "[data-mode-dialog]",
    ) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(
      dialog.querySelector('[data-select-game-mode="BaseGame"]'),
    ).toBeTruthy();
    expect(dialog.textContent).toContain("initial");
    expect(dialog.textContent).toContain("incomplete");
    expect(
      (dialog.querySelector("[data-delete-game-mode]") as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    let input = dialog.querySelector(
      "[data-new-game-mode]",
    ) as HTMLInputElement;
    input.value = "1bad";
    input.dispatchEvent(new Event("input"));
    (dialog.querySelector("[data-add-game-mode]") as HTMLButtonElement).click();
    expect(dialog.textContent).toContain("游戏模式 id");
    expect(dialog.querySelectorAll('[role="option"]')).toHaveLength(1);

    input = dialog.querySelector("[data-new-game-mode]") as HTMLInputElement;
    input.value = "FreeGame";
    input.dispatchEvent(new Event("input"));
    (dialog.querySelector("[data-add-game-mode]") as HTMLButtonElement).click();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(
      dialog
        .querySelector('[data-select-game-mode="FreeGame"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(dialog.textContent).toContain("已创建状态 FreeGame");
    expect(
      (root.querySelector("[data-game-mode]") as HTMLSelectElement).value,
    ).toBe("FreeGame");

    input = dialog.querySelector("[data-new-game-mode]") as HTMLInputElement;
    input.value = "FreeGame";
    input.dispatchEvent(new Event("input"));
    (dialog.querySelector("[data-add-game-mode]") as HTMLButtonElement).click();
    expect(dialog.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(dialog.textContent).toContain("游戏模式已存在：FreeGame");
    expect(
      dialog
        .querySelector('[data-select-game-mode="FreeGame"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");

    input = dialog.querySelector(
      "[data-rename-game-mode-input]",
    ) as HTMLInputElement;
    input.value = "BonusGame";
    input.dispatchEvent(new Event("input"));
    (
      dialog.querySelector("[data-rename-game-mode]") as HTMLButtonElement
    ).click();
    expect(
      dialog.querySelector('[data-select-game-mode="BonusGame"]'),
    ).toBeTruthy();
    expect(
      (root.querySelector("[data-game-mode]") as HTMLSelectElement).value,
    ).toBe("BonusGame");

    (
      dialog.querySelector("[data-set-initial-mode]") as HTMLButtonElement
    ).click();
    expect(
      dialog.querySelector('[data-select-game-mode="BonusGame"]')?.textContent,
    ).toContain("initial");
    (
      dialog.querySelector(
        '[data-select-game-mode="BaseGame"]',
      ) as HTMLButtonElement
    ).click();
    (
      dialog.querySelector("[data-delete-game-mode]") as HTMLButtonElement
    ).click();
    expect(
      dialog.querySelector('[data-select-game-mode="BaseGame"]'),
    ).toBeNull();
    expect(dialog.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(
      (root.querySelector("[data-game-mode]") as HTMLSelectElement).value,
    ).toBe("BonusGame");
    expect(dialog.textContent).toContain("layout 至少必须保留一个游戏模式");
    app.destroy();
  });

  it("imports, places, previews and clears an award popup dependency", async () => {
    ioSpies.importPopupPackageZip.mockReturnValue({
      manifest: { id: "fixture-popup" },
      files: new Map([["popup.manifest.json", new Uint8Array([1])]]),
    });
    const { app, root } = await createApp();
    previewSpies.getGameModeSnapshot.mockReturnValue({
      stableMode: "BaseGame",
      targetMode: null,
      phase: "stable",
    });
    (root.querySelector("[data-play-popup]") as HTMLButtonElement).click();
    const placement = root.querySelector(
      '[data-popup-placement="default"][data-popup-placement-field="x"]',
    ) as HTMLInputElement;
    (
      root.querySelector('[data-workspace-tab="assets"]') as HTMLButtonElement
    ).click();
    const popupZip = zipSync({
      "popup.manifest.json": strToU8("{}"),
    });
    const fileClick = selectFilesOnce([
      new File([popupZip as BlobPart], "popup.zip"),
    ]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(ioSpies.importPopupPackageZip).toHaveBeenCalled(),
    );
    const binding = root.querySelector(
      "[data-mode-popup]",
    ) as HTMLSelectElement;
    binding.value = "fixture-popup";
    binding.dispatchEvent(new Event("change"));
    previewSpies.playAwardCelebration.mockClear();
    placement.value = "12";
    placement.dispatchEvent(new Event("change"));
    const inactivePlacement = root.querySelector(
      '[data-popup-placement="landscape"][data-popup-placement-field="x"]',
    ) as HTMLInputElement;
    inactivePlacement.value = "99";
    inactivePlacement.dispatchEvent(new Event("change"));
    previewSpies.getActiveAwardCelebrationSnapshot.mockReturnValue({
      phase: "counting",
    });
    (root.querySelector("[data-play-popup]") as HTMLButtonElement).click();
    (root.querySelector("[data-advance-popup]") as HTMLButtonElement).click();
    expect(previewSpies.playAwardCelebration).toHaveBeenCalledWith({
      betAmountRaw: 100,
      winAmountRaw: 6000,
    });
    expect(previewSpies.advanceAwardCelebration).toHaveBeenCalled();
    binding.value = "";
    binding.dispatchEvent(new Event("change"));
    (root.querySelector("[data-clear-popup]") as HTMLButtonElement).click();
    (root.querySelector("[data-advance-popup]") as HTMLButtonElement).click();
    fileClick.mockRestore();
    app.destroy();
  });

  it("reports popup import failures without mutating the project", async () => {
    ioSpies.importPopupPackageZip.mockImplementation(() => {
      throw new Error("bad popup");
    });
    const { app, root } = await createApp();
    const popupZip = zipSync({
      "popup.manifest.json": strToU8("{}"),
    });
    const fileClick = selectFilesOnce([
      new File([popupZip as BlobPart], "popup.zip"),
    ]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(root.textContent).toContain("bad popup"));
    fileClick.mockRestore();
    app.destroy();
  });

  it("new projects return to Resources and image upload creates only a resource row", async () => {
    const { app, root } = await createApp();
    (
      root.querySelector('[data-workspace-tab="layout"]') as HTMLButtonElement
    ).click();
    (root.querySelector("[data-new-project]") as HTMLButtonElement).click();
    const newProjectMode = root.querySelector(
      "[data-new-project-mode]",
    ) as HTMLSelectElement;
    newProjectMode.value = "orientation-focus";
    newProjectMode.dispatchEvent(new Event("change"));
    (
      root.querySelector("[data-confirm-new-project]") as HTMLButtonElement
    ).click();
    expect(
      root
        .querySelector('[data-workspace-tab="assets"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    const fileClick = selectFilesOnce([
      new File(["image"], "uploaded.png", { type: "image/png" }),
    ]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(commandSpies.uploadImage).toHaveBeenCalled());
    expect(
      root.querySelector('[data-resource-row="uploaded.png"]'),
    ).toBeTruthy();
    expect(root.textContent).toContain("未创建任何 node");
    expect(
      root.querySelector('[data-outline-key="layer:uploaded"]'),
    ).toBeNull();
    fileClick.mockRestore();
    app.destroy();
  });

  it("adds a reusable resource through an explicit Picker confirmation and focuses one Inspector", async () => {
    const { app, root } = await createAppWithUploadedImage();
    (
      root.querySelector(
        '[data-resource-add-layer="uploaded.png"]',
      ) as HTMLButtonElement
    ).click();
    const dialog = root.querySelector(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(
      dialog.querySelector('[aria-selected="true"]')?.textContent,
    ).toContain("uploaded");
    expect(root.textContent).toContain("不会按文件名或唯一候选自动绑定");
    (
      dialog.querySelector("[data-picker-confirm]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-outline-key="layer:uploaded"]'),
      ).toBeTruthy(),
    );
    expect(
      root
        .querySelector('[data-workspace-tab="layout"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      root.querySelector("[data-inspector-heading]")?.textContent,
    ).toContain("uploaded");
    expect(root.textContent).toContain("资源 uploaded.png 保持可复用");
    expect(dialog.open).toBe(false);
    app.destroy();
  });

  it("cancels Picker without binding and restores the invoking workflow", async () => {
    const { app, root } = await createAppWithUploadedImage();
    const trigger = root.querySelector(
      '[data-resource-background="default"]',
    ) as HTMLButtonElement;
    trigger.click();
    const dialog = root.querySelector(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    (dialog.querySelector("[data-picker-cancel]") as HTMLButtonElement).click();
    expect(dialog.open).toBe(false);
    (
      root.querySelector('[data-workspace-tab="layout"]') as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        '[data-outline-key="background:default"]',
      ) as HTMLButtonElement
    ).click();
    expect(root.textContent).toContain("尚未绑定背景资源");
    expect(
      root.querySelector('[data-outline-key="layer:uploaded"]'),
    ).toBeNull();
    app.destroy();
  });

  it("assigns and clears a background while preserving its filename-key resource", async () => {
    const { app, root } = await createAppWithUploadedImage();
    (
      root.querySelector(
        '[data-resource-background="default"]',
      ) as HTMLButtonElement
    ).click();
    let dialog = root.querySelector(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    (
      dialog.querySelector("[data-picker-confirm]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-inspector-heading]")?.textContent,
      ).toContain("背景"),
    );
    expect(root.textContent).toContain("uploaded");
    expect(previewSpies.setLayout).toHaveBeenCalled();
    (
      root.querySelector("[data-clear-background]") as HTMLButtonElement
    ).click();
    (
      root.querySelector('[data-workspace-tab="assets"]') as HTMLButtonElement
    ).click();
    expect(
      root.querySelector('[data-resource-row="uploaded.png"]'),
    ).toBeTruthy();
    (
      root.querySelector('[data-workspace-tab="layout"]') as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        '[data-outline-key="background:default"]',
      ) as HTMLButtonElement
    ).click();
    expect(root.textContent).toContain("尚未绑定背景资源");
    dialog = root.querySelector("[data-resource-picker]") as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    app.destroy();
  });

  it("captures the edited mode in background Picker and creates stable per-mode node ids", async () => {
    const { app, root } = await createApp();
    (root.querySelector("[data-new-project]") as HTMLButtonElement).click();
    const newProjectMode = root.querySelector(
      "[data-new-project-mode]",
    ) as HTMLSelectElement;
    newProjectMode.value = "orientation-focus";
    newProjectMode.dispatchEvent(new Event("change"));
    (
      root.querySelector("[data-confirm-new-project]") as HTMLButtonElement
    ).click();
    const fileClick = selectFilesOnce([new File(["image"], "shared.png")]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-resource-row="shared.png"]'),
      ).toBeTruthy(),
    );

    (
      root.querySelector(
        '[data-resource-row="shared.png"] [data-resource-background="landscape"]',
      ) as HTMLButtonElement
    ).click();
    let dialog = root.querySelector(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    expect(dialog.textContent).toContain("BaseGame / landscape");
    expect(dialog.querySelector("[data-picker-node-id]")).toBeNull();
    (
      dialog.querySelector("[data-picker-confirm]") as HTMLButtonElement
    ).click();

    (root.querySelector("[data-manage-modes]") as HTMLButtonElement).click();
    const newMode = root.querySelector(
      "[data-new-game-mode]",
    ) as HTMLInputElement;
    newMode.value = "FreeGame";
    newMode.dispatchEvent(new Event("input"));
    (root.querySelector("[data-add-game-mode]") as HTMLButtonElement).click();
    (
      root.querySelector("[data-close-mode-dialog]") as HTMLButtonElement
    ).click();
    (
      root.querySelector('[data-workspace-tab="assets"]') as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        '[data-resource-row="shared.png"] [data-resource-background="landscape"]',
      ) as HTMLButtonElement
    ).click();
    dialog = root.querySelector("[data-resource-picker]") as HTMLDialogElement;
    expect(dialog.textContent).toContain("FreeGame / landscape");
    (
      dialog.querySelector("[data-picker-confirm]") as HTMLButtonElement
    ).click();
    expect(root.textContent).toContain("freegame-landscape-background");

    const mode = root.querySelector("[data-game-mode]") as HTMLSelectElement;
    mode.value = "BaseGame";
    mode.dispatchEvent(new Event("change"));
    expect(root.textContent).toContain("basegame-landscape-background");
    expect(root.textContent).not.toContain("shared-2");
    fileClick.mockRestore();
    app.destroy();
  });

  it("filters, expands and deletes unused resources without creating nodes", async () => {
    const fileClick = selectFilesOnce([
      new File(["a"], "alpha.png"),
      new File(["b"], "beta.png"),
    ]);
    const { app, root } = await createApp();
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(root.querySelectorAll("[data-resource-row]")).toHaveLength(2),
    );
    (
      root.querySelector(
        '[data-toggle-resource="alpha.png"]',
      ) as HTMLButtonElement
    ).click();
    expect(root.textContent).toContain("未引用，不会导出");
    const status = root.querySelector(
      "[data-resource-status]",
    ) as HTMLSelectElement;
    status.value = "unused";
    status.dispatchEvent(new Event("change"));
    const query = root.querySelector(
      "[data-resource-query]",
    ) as HTMLInputElement;
    query.value = "beta";
    query.dispatchEvent(new Event("input"));
    expect(root.querySelector('[data-resource-row="alpha.png"]')).toBeNull();
    (
      root.querySelector(
        '[data-delete-resource="beta.png"]',
      ) as HTMLButtonElement
    ).click();
    expect(root.querySelector('[data-resource-row="beta.png"]')).toBeNull();
    expect(root.textContent).toContain("已删除资源 beta.png");
    fileClick.mockRestore();
    app.destroy();
  });

  it("preserves distinct filename keys without prompting", async () => {
    const fileClick = selectFilesOnce([
      new File(["a"], "same.png"),
      new File(["b"], "same.jpg"),
    ]);
    const prompt = vi.spyOn(window, "prompt");
    const { app, root } = await createApp();
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(root.querySelectorAll("[data-resource-row]")).toHaveLength(2),
    );
    expect(root.querySelector('[data-resource-row="same.png"]')).toBeTruthy();
    expect(root.querySelector('[data-resource-row="same.jpg"]')).toBeTruthy();
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
    fileClick.mockRestore();
    app.destroy();
  });

  it("edits one selected orientation layer, moves, renames, toggles placement and deletes it", async () => {
    const { app, root } = await createApp();
    (root.querySelector("[data-new-project]") as HTMLButtonElement).click();
    const mode = root.querySelector(
      "[data-new-project-mode]",
    ) as HTMLSelectElement;
    mode.value = "orientation-focus";
    mode.dispatchEvent(new Event("change"));
    (
      root.querySelector("[data-confirm-new-project]") as HTMLButtonElement
    ).click();
    const fileClick = selectFilesOnce([new File(["image"], "uploaded.png")]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-resource-row="uploaded.png"]'),
      ).toBeTruthy(),
    );
    (
      root.querySelector(
        '[data-resource-add-layer="uploaded.png"]',
      ) as HTMLButtonElement
    ).click();
    let dialog = root.querySelector(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    (
      dialog.querySelector("[data-picker-confirm]") as HTMLButtonElement
    ).click();
    (root.querySelector("[data-open-add-layer]") as HTMLButtonElement).click();
    dialog = root.querySelector("[data-resource-picker]") as HTMLDialogElement;
    (
      dialog.querySelector(
        '[data-picker-candidate="uploaded.png"]',
      ) as HTMLButtonElement
    ).click();
    dialog = root.querySelector("[data-resource-picker]") as HTMLDialogElement;
    (
      dialog.querySelector("[data-picker-confirm]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-outline-key="layer:uploaded-2"]'),
      ).toBeTruthy(),
    );
    (root.querySelector('[data-move-layer="-1"]') as HTMLButtonElement).click();
    const portrait = root.querySelector(
      '[data-layer-visible="portrait"]',
    ) as HTMLInputElement;
    portrait.checked = false;
    portrait.dispatchEvent(new Event("change"));
    const restored = root.querySelector(
      '[data-layer-visible="portrait"]',
    ) as HTMLInputElement;
    restored.checked = true;
    restored.dispatchEvent(new Event("change"));
    const nodeId = root.querySelector("[data-node-id]") as HTMLInputElement;
    nodeId.value = "renamed-layer";
    nodeId.dispatchEvent(new Event("change"));
    expect(
      root.querySelector('[data-outline-key="layer:renamed-layer"]'),
    ).toBeTruthy();
    (root.querySelector("[data-remove-layer]") as HTMLButtonElement).click();
    expect(
      root.querySelector('[data-outline-key="layer:renamed-layer"]'),
    ).toBeNull();
    expect(root.textContent).toContain("资源仍保留");
    fileClick.mockRestore();
    app.destroy();
  });

  it("requires explicit Spine animation in Picker and edits exact playback in the Inspector", async () => {
    const fileClick = selectFilesOnce([
      new File(["{}"], "hero.json"),
      new File(["hero.png\n"], "hero.atlas"),
      new File(["image"], "hero.png"),
    ]);
    const { app, root } = await createApp();
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-resource-row="hero.json"]'),
      ).toBeTruthy(),
    );
    (
      root.querySelector(
        '[data-resource-add-layer="hero.json"]',
      ) as HTMLButtonElement
    ).click();
    let dialog = root.querySelector(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    const animation = dialog.querySelector(
      "[data-picker-animation]",
    ) as HTMLSelectElement;
    expect(animation.value).toBe("");
    animation.value = "Idle";
    animation.dispatchEvent(new Event("change"));
    (
      dialog.querySelector("[data-picker-confirm]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-layer-animation]")).toBeTruthy(),
    );
    const inspectorAnimation = root.querySelector(
      "[data-layer-animation]",
    ) as HTMLSelectElement;
    inspectorAnimation.value = "Win";
    inspectorAnimation.dispatchEvent(new Event("change"));
    expect(root.textContent).toContain("已设置 animation Win");
    expect(root.querySelector("[data-spine-playback-kind]")).toBeNull();
    expect(root.querySelector("[data-add-spine-state]")).toBeNull();
    (root.querySelector("[data-manage-modes]") as HTMLButtonElement).click();
    const newMode = root.querySelector(
      "[data-new-game-mode]",
    ) as HTMLInputElement;
    newMode.value = "FreeGame";
    newMode.dispatchEvent(new Event("input"));
    (root.querySelector("[data-add-game-mode]") as HTMLButtonElement).click();
    (
      root.querySelector("[data-close-mode-dialog]") as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        '[data-workspace-tab="transitions"]',
      ) as HTMLButtonElement
    ).click();
    const transitionFrom = root.querySelector(
      "[data-new-transition-from]",
    ) as HTMLSelectElement;
    const transitionTo = root.querySelector(
      "[data-new-transition-to]",
    ) as HTMLSelectElement;
    transitionFrom.value = "BaseGame";
    transitionTo.value = "FreeGame";
    (
      root.querySelector("[data-create-transition]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-transition-resource]")).toBeTruthy(),
    );
    const transitionResource = root.querySelector(
      "[data-transition-resource]",
    ) as HTMLSelectElement;
    transitionResource.value = "hero.json";
    transitionResource.dispatchEvent(new Event("change"));
    const transitionAnimation = root.querySelector(
      "[data-transition-animation]",
    ) as HTMLSelectElement;
    transitionAnimation.value = "Bridge";
    transitionAnimation.dispatchEvent(new Event("change"));
    const transitionEvent = root.querySelector(
      "[data-transition-event]",
    ) as HTMLSelectElement;
    expect(transitionEvent.tagName).toBe("SELECT");
    expect(root.querySelector("[data-transition-event] input")).toBeNull();
    transitionEvent.value = "SwitchScene";
    transitionEvent.dispatchEvent(new Event("change"));
    expect(root.textContent).toContain("SwitchScene");
    (
      root.querySelector('[data-workspace-tab="layout"]') as HTMLButtonElement
    ).click();
    (root.querySelector("[data-rebind-layer]") as HTMLButtonElement).click();
    dialog = root.querySelector("[data-resource-picker]") as HTMLDialogElement;
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(dialog.open).toBe(false);
    fileClick.mockRestore();
    app.destroy();
  });

  it("streams transition progress into the Inspector and locks transition editing until completion", async () => {
    let currentSnapshot: any = {
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      targetMode: null,
      phase: "stable",
      transitionPhase: null,
      transition: null,
      preparedTargetMode: null,
      transitionKind: null,
      mediaTimeSeconds: null,
      mediaDurationSeconds: null,
      fadeProgress: null,
      stableSymbolPackage: null,
      displayedSymbolPackage: null,
      targetSymbolPackage: null,
      activeBackgroundNodes: ["background"],
    };
    previewSpies.getGameModeSnapshot.mockImplementation(() => currentSnapshot);
    previewSpies.prepareGameModeTransition.mockImplementation(
      async (target: string) => {
        currentSnapshot = {
          ...currentSnapshot,
          preparedTargetMode: target,
          transitionKind: "spine",
        };
      },
    );
    let finishRequest!: () => void;
    const pendingRequest = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
    let trustedClickActive = false;
    previewSpies.requestGameMode.mockImplementationOnce(() => {
      expect(trustedClickActive).toBe(true);
      currentSnapshot = {
        ...currentSnapshot,
        targetMode: "FreeGame",
        phase: "transitioning",
        transitionPhase: "before-switch",
        transition: { from: "BaseGame", to: "FreeGame" },
        preparedTargetMode: null,
        transitionKind: "spine",
      };
      return pendingRequest;
    });
    const { app, root } = await createApp();
    const backgroundFileClick = selectFilesOnce([
      new File(["background"], "background.png", { type: "image/png" }),
    ]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-resource-row="background.png"]'),
      ).toBeTruthy(),
    );
    backgroundFileClick.mockRestore();
    const fileClick = selectFilesOnce([
      new File(["{}"], "hero.json"),
      new File(["hero.png\n"], "hero.atlas"),
      new File(["image"], "hero.png"),
    ]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-resource-row="hero.json"]'),
      ).toBeTruthy(),
    );
    (
      root.querySelector(
        '[data-resource-row="background.png"] [data-resource-background="default"]',
      ) as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        "[data-resource-picker] [data-picker-confirm]",
      ) as HTMLButtonElement
    ).click();
    (root.querySelector("[data-manage-modes]") as HTMLButtonElement).click();
    const newMode = root.querySelector(
      "[data-new-game-mode]",
    ) as HTMLInputElement;
    newMode.value = "FreeGame";
    newMode.dispatchEvent(new Event("input"));
    (root.querySelector("[data-add-game-mode]") as HTMLButtonElement).click();
    (
      root.querySelector("[data-close-mode-dialog]") as HTMLButtonElement
    ).click();
    (
      root.querySelector('[data-workspace-tab="assets"]') as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        '[data-resource-row="background.png"] [data-resource-background="default"]',
      ) as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        "[data-resource-picker] [data-picker-confirm]",
      ) as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        '[data-workspace-tab="transitions"]',
      ) as HTMLButtonElement
    ).click();
    const from = root.querySelector(
      "[data-new-transition-from]",
    ) as HTMLSelectElement;
    const to = root.querySelector(
      "[data-new-transition-to]",
    ) as HTMLSelectElement;
    from.value = "BaseGame";
    to.value = "FreeGame";
    (
      root.querySelector("[data-create-transition]") as HTMLButtonElement
    ).click();
    const resource = root.querySelector(
      "[data-transition-resource]",
    ) as HTMLSelectElement;
    resource.value = "hero";
    resource.dispatchEvent(new Event("change"));
    const animation = root.querySelector(
      "[data-transition-animation]",
    ) as HTMLSelectElement;
    animation.value = "Bridge";
    animation.dispatchEvent(new Event("change"));
    const transitionEvent = root.querySelector(
      "[data-transition-event]",
    ) as HTMLSelectElement;
    transitionEvent.value = "SwitchScene";
    transitionEvent.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-transition-runtime-status]")?.textContent,
      ).toContain("Spine 转场已准备，可切换"),
    );
    expect(previewSpies.prepareGameModeTransition).toHaveBeenCalledTimes(1);
    trustedClickActive = true;
    (
      root.querySelector("[data-request-transition]") as HTMLButtonElement
    ).click();
    trustedClickActive = false;

    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-transition-runtime-status]")?.textContent,
      ).toContain("转场播放中，尚未切换场景"),
    );
    expect(
      (root.querySelector("[data-transition-kind]") as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (root.querySelector("[data-delete-transition]") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (root.querySelector("[data-create-transition]") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      root.querySelector("[data-main-state-status]")?.textContent,
    ).toContain("转场播放中，尚未切换场景");

    currentSnapshot = {
      ...currentSnapshot,
      displayedMode: "FreeGame",
      transitionPhase: "after-switch",
    };
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-transition-runtime-status]")?.textContent,
      ).toContain("已切换目标场景，等待 once 完成"),
    );

    currentSnapshot = {
      ...currentSnapshot,
      stableMode: "FreeGame",
      targetMode: null,
      phase: "stable",
      transitionPhase: null,
      transition: null,
      transitionKind: null,
      mediaTimeSeconds: null,
      mediaDurationSeconds: null,
      fadeProgress: null,
    };
    finishRequest();
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-transition-runtime-status]")?.textContent,
      ).toContain("转场完成，当前状态：FreeGame"),
    );
    expect(
      (root.querySelector("[data-delete-transition]") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fileClick.mockRestore();
    app.destroy();
  });

  it("automatically prepares an audible video edge and keeps the source stable when play rejects", async () => {
    let currentSnapshot: any = {
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      targetMode: null,
      phase: "stable",
      transitionPhase: null,
      transition: null,
      preparedTargetMode: null,
      transitionKind: null,
      mediaTimeSeconds: null,
      mediaDurationSeconds: null,
      fadeProgress: null,
      stableSymbolPackage: null,
      displayedSymbolPackage: null,
      targetSymbolPackage: null,
      activeBackgroundNodes: ["basegame-default-background"],
    };
    previewSpies.getGameModeSnapshot.mockImplementation(() => currentSnapshot);
    let finishFirstPrepare!: () => void;
    const firstPrepare = new Promise<void>((resolve) => {
      finishFirstPrepare = resolve;
    });
    let finishDestroyPrepare!: () => void;
    const destroyPrepare = new Promise<void>((resolve) => {
      finishDestroyPrepare = resolve;
    });
    let prepareCalls = 0;
    previewSpies.prepareGameModeTransition.mockImplementation(
      async (target: string) => {
        prepareCalls += 1;
        if (prepareCalls === 1) await firstPrepare;
        if (prepareCalls === 3) await destroyPrepare;
        currentSnapshot = {
          ...currentSnapshot,
          preparedTargetMode: target,
          transitionKind: "video",
          mediaDurationSeconds: 3.625,
        };
      },
    );
    previewSpies.cancelPreparedGameModeTransition.mockImplementation(() => {
      currentSnapshot = {
        ...currentSnapshot,
        preparedTargetMode: null,
        transitionKind: null,
        mediaDurationSeconds: null,
      };
    });
    let rejectPlay!: (error: Error) => void;
    const playPending = new Promise<void>((_resolve, reject) => {
      rejectPlay = reject;
    });
    let trustedClickActive = false;
    previewSpies.requestGameMode.mockImplementationOnce(() => {
      expect(trustedClickActive).toBe(true);
      return playPending;
    });

    const { app, root } = await createApp();
    const backgroundClick = selectFilesOnce([
      new File(["background"], "background.png", { type: "image/png" }),
    ]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-resource-row="background.png"]'),
      ).toBeTruthy(),
    );
    backgroundClick.mockRestore();
    (
      root.querySelector(
        '[data-resource-row="background.png"] [data-resource-background="default"]',
      ) as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        "[data-resource-picker] [data-picker-confirm]",
      ) as HTMLButtonElement
    ).click();

    (
      root.querySelector('[data-workspace-tab="assets"]') as HTMLButtonElement
    ).click();
    const videoClick = selectFilesOnce([
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
    ]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(root.querySelector('[data-resource-row="clip.mp4"]')).toBeTruthy(),
    );
    videoClick.mockRestore();

    (root.querySelector("[data-manage-modes]") as HTMLButtonElement).click();
    const newMode = root.querySelector(
      "[data-new-game-mode]",
    ) as HTMLInputElement;
    newMode.value = "FreeGame";
    newMode.dispatchEvent(new Event("input"));
    (root.querySelector("[data-add-game-mode]") as HTMLButtonElement).click();
    (
      root.querySelector("[data-close-mode-dialog]") as HTMLButtonElement
    ).click();
    (
      root.querySelector('[data-workspace-tab="assets"]') as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        '[data-resource-row="background.png"] [data-resource-background="default"]',
      ) as HTMLButtonElement
    ).click();
    (
      root.querySelector(
        "[data-resource-picker] [data-picker-confirm]",
      ) as HTMLButtonElement
    ).click();

    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-preview-transition-status]")?.textContent,
      ).toContain("缺少 BaseGame → FreeGame 直接有向转场"),
    );
    (
      root.querySelector(
        '[data-workspace-tab="transitions"]',
      ) as HTMLButtonElement
    ).click();
    const from = root.querySelector(
      "[data-new-transition-from]",
    ) as HTMLSelectElement;
    const to = root.querySelector(
      "[data-new-transition-to]",
    ) as HTMLSelectElement;
    from.value = "BaseGame";
    to.value = "FreeGame";
    (
      root.querySelector("[data-create-transition]") as HTMLButtonElement
    ).click();
    const kind = root.querySelector(
      "[data-transition-kind]",
    ) as HTMLSelectElement;
    kind.value = "video";
    kind.dispatchEvent(new Event("change"));
    const resource = root.querySelector(
      "[data-transition-video-resource]",
    ) as HTMLSelectElement;
    resource.value = "clip";
    resource.dispatchEvent(new Event("change"));

    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-preview-transition-status]")?.textContent,
      ).toContain("开始准备 MP4 与目标场景"),
    );
    const targetSelect = root.querySelector(
      "[data-preview-game-mode]",
    ) as HTMLSelectElement;
    targetSelect.value = "BaseGame";
    targetSelect.dispatchEvent(new Event("change"));
    finishFirstPrepare();
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-preview-transition-status]")?.textContent,
      ).toContain("当前已是 BaseGame"),
    );
    await vi.waitFor(() =>
      expect(previewSpies.cancelPreparedGameModeTransition).toHaveBeenCalled(),
    );
    targetSelect.value = "FreeGame";
    targetSelect.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-preview-transition-status]")?.textContent,
      ).toContain("MP4 媒体可播放，目标场景已准备"),
    );
    expect(previewSpies.prepareGameModeTransition).toHaveBeenCalledTimes(2);
    trustedClickActive = true;
    (
      root.querySelector("[data-request-preview-mode]") as HTMLButtonElement
    ).click();
    trustedClickActive = false;
    expect(currentSnapshot.targetMode).toBeNull();
    expect(
      root.querySelector("[data-preview-transition-status]")?.textContent,
    ).toContain("开始 MP4 转场");

    currentSnapshot = {
      ...currentSnapshot,
      preparedTargetMode: null,
      transitionKind: null,
      mediaDurationSeconds: null,
    };
    rejectPlay(new Error("NotAllowedError: audible play rejected"));
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-preview-transition-status]")?.textContent,
      ).toContain("NotAllowedError: audible play rejected"),
    );
    expect(currentSnapshot.stableMode).toBe("BaseGame");
    expect(currentSnapshot.displayedMode).toBe("BaseGame");
    expect(currentSnapshot.targetMode).toBeNull();
    targetSelect.value = "BaseGame";
    targetSelect.dispatchEvent(new Event("change"));
    targetSelect.value = "FreeGame";
    targetSelect.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(prepareCalls).toBe(3));
    app.destroy();
    finishDestroyPrepare();
    await Promise.resolve();
    expect(root.childElementCount).toBe(0);
  });

  it("imports and edits an image-string layer through the resource and inspector UI", async () => {
    const manifest = {
      version: 1,
      kind: "image-string",
      id: "digits",
      metrics: { lineHeight: 10, letterSpacing: 0 },
      glyphs: {
        "0": {
          path: "assets/0.png",
          size: { width: 5, height: 10 },
          offset: { x: 0, y: 0 },
        },
        "1": {
          path: "assets/1.png",
          size: { width: 5, height: 10 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    };
    const zip = zipSync({
      "image-string.manifest.json": strToU8(JSON.stringify(manifest)),
      "assets/0.png": new Uint8Array([0]),
      "assets/1.png": new Uint8Array([1]),
    });
    const fileClick = selectFilesOnce([
      new File([zip as BlobPart], "digits.zip", { type: "application/zip" }),
    ]);
    const { app, root } = await createApp();
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-resource-row="image-string.manifest.json"]'),
      ).toBeTruthy(),
    );
    const background = root.querySelector(
      '[data-resource-row="image-string.manifest.json"] [data-resource-background]',
    ) as HTMLButtonElement;
    expect(background).toBeNull();
    (
      root.querySelector(
        '[data-resource-add-layer="image-string.manifest.json"]',
      ) as HTMLButtonElement
    ).click();
    const dialog = root.querySelector(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    (
      dialog.querySelector("[data-picker-confirm]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-image-string-text]")).toBeTruthy(),
    );
    let textInput = root.querySelector(
      "[data-image-string-text]",
    ) as HTMLInputElement;
    textInput.value = "001";
    textInput.dispatchEvent(new Event("change"));
    const anchorX = root.querySelector(
      "[data-image-string-anchor-x]",
    ) as HTMLInputElement;
    anchorX.value = "0.25";
    anchorX.dispatchEvent(new Event("change"));
    textInput = root.querySelector(
      "[data-image-string-text]",
    ) as HTMLInputElement;
    expect(textInput.value).toBe("001");
    textInput.value = "2";
    textInput.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-errors]")?.textContent).toContain(
        "缺少 glyph",
      ),
    );
    fileClick.mockRestore();
    app.destroy();
  });

  it("does not expose low-level preview Spine state controls", async () => {
    const manifest = {
      ...imageManifest,
      nodes: [
        imageManifest.nodes[0],
        {
          id: "scene",
          order: 1,
          resource: {
            kind: "spine" as const,
            skeleton: "assets/scene.json",
            atlas: "assets/scene.atlas",
            textures: { "scene.png": "assets/scene.png" },
            stateMachine: {
              initialState: "BG",
              states: { BG: { animation: "BG" }, FG: { animation: "FG" } },
              transitions: [{ from: "BG", to: "FG", animation: "BG_FG" }],
            },
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
    };
    const assets = new Map(assetBytes);
    assets.set(
      "assets/scene.json",
      new TextEncoder().encode(
        JSON.stringify({
          skeleton: { spine: "4.3.23" },
          animations: { BG: {}, FG: {}, BG_FG: {} },
        }),
      ),
    );
    assets.set("assets/scene.atlas", new Uint8Array([1]));
    assets.set("assets/scene.png", new Uint8Array([2]));
    ioSpies.importZip.mockResolvedValueOnce({
      manifest,
      assets,
      destroy: vi.fn(),
    });
    previewSpies.getSpineNodeStates.mockReturnValue([
      {
        nodeId: "scene",
        states: ["BG", "FG"],
        stableState: "BG",
        targetState: null,
        phase: "stable",
      },
    ]);
    const fileClick = selectFilesOnce([new File(["zip"], "layout.zip")]);
    const { app, root } = await createApp();
    (root.querySelector("[data-import]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(ioSpies.importZip).toHaveBeenCalled());
    expect(root.querySelector('[data-preview-state="FG"]')).toBeNull();
    expect(previewSpies.requestNodeState).not.toHaveBeenCalled();
    fileClick.mockRestore();
    app.destroy();
  });

  it("searches and type-filters Picker candidates without selecting the only result", async () => {
    const { app, root } = await createAppWithUploadedImage();
    const spineClick = selectFilesOnce([
      new File(["{}"], "hero.json"),
      new File(["hero.png\n"], "hero.atlas"),
      new File(["image"], "hero.png"),
    ]);
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(commandSpies.uploadSpine).toHaveBeenCalled());
    (
      root.querySelector('[data-workspace-tab="layout"]') as HTMLButtonElement
    ).click();
    (root.querySelector("[data-open-add-layer]") as HTMLButtonElement).click();
    let dialog = root.querySelector(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    const type = dialog.querySelector(
      "[data-picker-type]",
    ) as HTMLSelectElement;
    type.value = "spine";
    type.dispatchEvent(new Event("change"));
    dialog = root.querySelector("[data-resource-picker]") as HTMLDialogElement;
    expect(dialog.querySelectorAll("[data-picker-candidate]")).toHaveLength(1);
    expect(dialog.querySelector('[aria-selected="true"]')).toBeNull();
    const search = dialog.querySelector(
      "[data-picker-query]",
    ) as HTMLInputElement;
    search.value = "missing";
    search.dispatchEvent(new Event("input"));
    dialog = root.querySelector("[data-resource-picker]") as HTMLDialogElement;
    expect(dialog.textContent).toContain("没有匹配资源");
    (dialog.querySelector("[data-picker-cancel]") as HTMLButtonElement).click();
    spineClick.mockRestore();
    app.destroy();
  });

  it("imports into Layout, exposes outline selection and exports the strict project", async () => {
    const imported = {
      manifest: imageManifest,
      assets: assetBytes,
      destroy: vi.fn(),
    };
    ioSpies.importZip.mockResolvedValueOnce(imported);
    ioSpies.exportZip.mockResolvedValueOnce({
      fileName: "fixture-layout.zip",
      blob: new Blob(["zip"]),
      bytes: new Uint8Array([1]),
    });
    const fileClick = selectFilesOnce([
      new File(["zip"], "fixture-layout.zip"),
    ]);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const { app, root } = await createApp();
    (root.querySelector("[data-import]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(imported.destroy).toHaveBeenCalled());
    expect(
      root
        .querySelector('[data-workspace-tab="layout"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      root
        .querySelector('[data-outline-key="background:default"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      root.querySelector("[data-inspector-heading]")?.textContent,
    ).toContain("背景");
    (root.querySelector("[data-export]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(ioSpies.exportZip).toHaveBeenCalled());
    expect(anchorClick).toHaveBeenCalled();
    fileClick.mockRestore();
    anchorClick.mockRestore();
    app.destroy();
  });

  it("keeps preview page, zoom and guide controls independent of project tabs", async () => {
    const { app, root } = await createApp();
    const width = root.querySelector(
      "[data-preview-width]",
    ) as HTMLInputElement;
    const height = root.querySelector(
      "[data-preview-height]",
    ) as HTMLInputElement;
    width.value = "800";
    height.value = "600";
    width.dispatchEvent(new Event("change"));
    expect(previewSpies.setPageSize).toHaveBeenCalledWith({
      width: 800,
      height: 600,
    });
    (root.querySelector("[data-zoom-in]") as HTMLButtonElement).click();
    const focus = root.querySelector("[data-guide-focus]") as HTMLInputElement;
    focus.checked = false;
    focus.dispatchEvent(new Event("change"));
    expect(previewSpies.setGuideVisibility).toHaveBeenCalledWith({
      showFocus: false,
      showReels: true,
    });
    (
      root.querySelector('[data-workspace-tab="project"]') as HTMLButtonElement
    ).click();
    expect(root.querySelector("[data-preview-width]")).toBe(width);
    app.destroy();
  });

  it("imports, selects, randomizes and clears symbols from the preview drawer", async () => {
    const resource = {
      packageManifest: { id: "symbols", cellSize: { width: 120, height: 120 } },
      destroy: vi.fn(),
    };
    const metadata = {
      packageId: "symbols",
      cellSize: { width: 120, height: 120 },
      displaySymbolCount: 2,
      reelSets: [
        { name: "first", reelCount: 5, compatible: true },
        { name: "second", reelCount: 5, compatible: true },
      ],
      selectedReelSet: undefined,
      status: "pending-selection" as const,
      message: "请选择",
      scene: null,
      availableTargets: {
        A: [{ kind: "image-string-node" as const, name: "amount" }],
        B: [{ kind: "legacy-presentation-value" as const }],
      },
      numberWeightTableNames: ["coin-weight"],
      bindings: [],
      otherScene: null,
    };
    ioSpies.importSymbolsZipWithFiles.mockResolvedValueOnce({
      resource,
      files: new Map([
        ["symbols.package.json", new TextEncoder().encode("{}")],
      ]),
    });
    previewSpies.setSymbolPackage.mockResolvedValueOnce(metadata);
    previewSpies.setSelectedReelSet.mockReturnValueOnce({
      ...metadata,
      selectedReelSet: "first",
      status: "ready",
    });
    previewSpies.randomizeSymbols.mockReturnValueOnce({
      ...metadata,
      selectedReelSet: "first",
      status: "ready",
    });
    previewSpies.setSymbolGrid.mockReturnValue({
      ...metadata,
      selectedReelSet: "first",
      status: "ready",
    });
    previewSpies.setOtherSceneBindings.mockImplementation((bindings) => ({
      ...metadata,
      bindings,
    }));
    const symbolsZip = zipSync({
      "symbols.package.json": strToU8("{}"),
    });
    const fileClick = selectFilesOnce([
      new File([symbolsZip as BlobPart], "symbols.zip"),
    ]);
    const { app, root } = await createApp();
    (
      root.querySelector("[data-upload-resources]") as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(previewSpies.setSymbolPackage).toHaveBeenCalled(),
    );
    await vi.waitFor(() =>
      expect(
        (root.querySelector("[data-reel-set]") as HTMLSelectElement).disabled,
      ).toBe(false),
    );
    const aEnabled = root.querySelector<HTMLInputElement>(
      '[data-other-scene-row="A"] [data-binding-enabled]',
    )!;
    aEnabled.checked = true;
    aEnabled.dispatchEvent(new Event("change"));
    expect(previewSpies.setOtherSceneBindings).toHaveBeenLastCalledWith([
      {
        symbol: "A",
        target: { kind: "image-string-node", name: "amount" },
        source: {
          kind: "number-weight-table",
          tableName: "coin-weight",
        },
      },
    ]);
    const bEnabled = root.querySelector<HTMLInputElement>(
      '[data-other-scene-row="B"] [data-binding-enabled]',
    )!;
    bEnabled.checked = true;
    bEnabled.dispatchEvent(new Event("change"));
    const bSource = root.querySelector<HTMLSelectElement>(
      '[data-other-scene-row="B"] [data-binding-source-kind]',
    )!;
    bSource.value = "fixed-number";
    bSource.dispatchEvent(new Event("change"));
    expect(previewSpies.setOtherSceneBindings).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: "B",
          target: { kind: "legacy-presentation-value" },
          source: { kind: "fixed-number", value: 1 },
        }),
      ]),
    );
    const select = root.querySelector("[data-reel-set]") as HTMLSelectElement;
    select.value = "first";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(
        (root.querySelector("[data-randomize-symbols]") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    (
      root.querySelector("[data-randomize-symbols]") as HTMLButtonElement
    ).click();
    expect(previewSpies.randomizeSymbols).toHaveBeenCalled();
    (root.querySelector("[data-clear-symbols]") as HTMLButtonElement).click();
    expect(previewSpies.setSymbolPackage).toHaveBeenLastCalledWith(null);
    fileClick.mockRestore();
    app.destroy();
  });

  it("surfaces failed import without replacing the current workspace and destroys idempotently", async () => {
    ioSpies.importZip.mockRejectedValueOnce(new Error("bad zip"));
    const fileClick = selectFilesOnce([new File(["bad"], "bad.zip")]);
    const { app, root } = await createApp();
    (root.querySelector("[data-import]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-errors]")?.textContent).toContain(
        "bad zip",
      ),
    );
    expect(
      root
        .querySelector('[data-workspace-tab="assets"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    app.destroy();
    app.destroy();
    expect(previewSpies.destroy).toHaveBeenCalledTimes(1);
    fileClick.mockRestore();
  });
});

async function createApp(): Promise<{
  app: GameLayoutEditorApp;
  root: HTMLElement;
}> {
  const root = document.createElement("div");
  document.body.append(root);
  const app = new GameLayoutEditorApp(root);
  await app.init();
  return { app, root };
}

async function createAppWithUploadedImage(): Promise<{
  app: GameLayoutEditorApp;
  root: HTMLElement;
}> {
  const fileClick = selectFilesOnce([new File(["image"], "uploaded.png")]);
  const result = await createApp();
  (
    result.root.querySelector("[data-upload-resources]") as HTMLButtonElement
  ).click();
  await vi.waitFor(() =>
    expect(
      result.root.querySelector('[data-resource-row="uploaded.png"]'),
    ).toBeTruthy(),
  );
  fileClick.mockRestore();
  return result;
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
