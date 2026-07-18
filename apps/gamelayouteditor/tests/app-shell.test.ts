import { beforeEach, describe, expect, it, vi } from "vitest";

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
  destroy: vi.fn(),
}));

const ioSpies = vi.hoisted(() => ({
  importZip: vi.fn(),
  exportZip: vi.fn(),
  importSymbolsZip: vi.fn(),
}));

const commandSpies = vi.hoisted(() => ({
  uploadImage: vi.fn(async ({ project, file }) => {
    const id = file.name.replace(/\.[^.]+$/u, "").toLowerCase();
    const resource = {
      id,
      kind: "image" as const,
      path: `assets/${file.name.toLowerCase()}`,
      size: { width: 100, height: 80 },
    };
    project.resources.set(id, resource);
    project.assets.set(resource.path, new Uint8Array([1, 2, 3]));
    return resource;
  }),
  uploadSpine: vi.fn(async ({ project }) => {
    const resource = {
      id: "hero",
      kind: "spine" as const,
      skeleton: "assets/hero.json",
      atlas: "assets/hero.atlas",
      textures: { "hero.png": "assets/hero.png" },
      animationNames: ["Idle", "Win"],
      bounds: { width: 400, height: 300 },
    };
    project.resources.set(resource.id, resource);
    project.assets.set(resource.skeleton, new Uint8Array([1]));
    project.assets.set(resource.atlas, new Uint8Array([2]));
    project.assets.set("assets/hero.png", new Uint8Array([3]));
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
    destroy = previewSpies.destroy;
  },
}));

vi.mock("../src/io/imported-layout-zip.js", () => ({
  importLayoutZip: ioSpies.importZip,
}));

vi.mock("../src/io/exported-layout-zip.js", () => ({
  exportLayoutZip: ioSpies.exportZip,
}));

vi.mock("../src/io/imported-symbol-package.js", () => ({
  importSymbolsZip: ioSpies.importSymbolsZip,
}));

vi.mock("../src/model/resource-commands.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/model/resource-commands.js")>();
  return {
    ...actual,
    uploadImageResource: commandSpies.uploadImage,
    uploadSpineResource: commandSpies.uploadSpine,
  };
});

import { GameLayoutEditorApp } from "../src/ui/app-shell.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("GameLayoutEditorApp workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewSpies.setSymbolPackage.mockResolvedValue(null);
    window.confirm = vi.fn(() => true);
  });

  it("mounts one accessible three-tab workspace and keeps symbols controls in the preview drawer", async () => {
    const { app, root } = await createApp();
    const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "资源",
      "布局",
      "项目",
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector("[data-upload-images]")).toBeTruthy();
    expect(root.querySelector("[data-number]")).toBeNull();
    expect(
      root.querySelector(".symbols-drawer [data-import-symbols]"),
    ).toBeTruthy();
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector("[data-outline-list]")).toBeTruthy();
    expect(root.querySelectorAll(".inspector-inner")).toHaveLength(1);
    app.destroy();
  });

  it("new projects return to Resources and image upload creates only a resource row", async () => {
    const { app, root } = await createApp();
    (
      root.querySelector('[data-workspace-tab="layout"]') as HTMLButtonElement
    ).click();
    (root.querySelector("[data-new-dual]") as HTMLButtonElement).click();
    expect(
      root
        .querySelector('[data-workspace-tab="assets"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    const fileClick = selectFilesOnce([
      new File(["image"], "uploaded.png", { type: "image/png" }),
    ]);
    (root.querySelector("[data-upload-images]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(commandSpies.uploadImage).toHaveBeenCalled());
    expect(root.querySelector('[data-resource-row="uploaded"]')).toBeTruthy();
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
        '[data-resource-add-layer="uploaded"]',
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
    expect(root.textContent).toContain("资源 uploaded 保持可复用");
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

  it("assigns and clears a background while preserving its logical resource", async () => {
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
    expect(root.querySelector('[data-resource-row="uploaded"]')).toBeTruthy();
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

  it("filters, expands and deletes unused resources without creating nodes", async () => {
    const fileClick = selectFilesOnce([
      new File(["a"], "alpha.png"),
      new File(["b"], "beta.png"),
    ]);
    const { app, root } = await createApp();
    (root.querySelector("[data-upload-images]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelectorAll("[data-resource-row]")).toHaveLength(2),
    );
    (
      root.querySelector('[data-toggle-resource="alpha"]') as HTMLButtonElement
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
    expect(root.querySelector('[data-resource-row="alpha"]')).toBeNull();
    (
      root.querySelector('[data-delete-resource="beta"]') as HTMLButtonElement
    ).click();
    expect(root.querySelector('[data-resource-row="beta"]')).toBeNull();
    expect(root.textContent).toContain("已删除资源 beta");
    fileClick.mockRestore();
    app.destroy();
  });

  it("edits one selected orientation layer, moves, renames, toggles placement and deletes it", async () => {
    const { app, root } = await createApp();
    (root.querySelector("[data-new-dual]") as HTMLButtonElement).click();
    const fileClick = selectFilesOnce([new File(["image"], "uploaded.png")]);
    (root.querySelector("[data-upload-images]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector('[data-resource-row="uploaded"]')).toBeTruthy(),
    );
    (
      root.querySelector(
        '[data-resource-add-layer="uploaded"]',
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
        '[data-picker-candidate="uploaded"]',
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
    (root.querySelector("[data-upload-spine]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector('[data-resource-row="hero"]')).toBeTruthy(),
    );
    (
      root.querySelector(
        '[data-resource-add-layer="hero"]',
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
    (root.querySelector("[data-rebind-layer]") as HTMLButtonElement).click();
    dialog = root.querySelector("[data-resource-picker]") as HTMLDialogElement;
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(dialog.open).toBe(false);
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
    (root.querySelector("[data-upload-spine]") as HTMLButtonElement).click();
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
    };
    ioSpies.importSymbolsZip.mockResolvedValueOnce(resource);
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
    const fileClick = selectFilesOnce([new File(["zip"], "symbols.zip")]);
    const { app, root } = await createApp();
    (root.querySelector("[data-import-symbols]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(previewSpies.setSymbolPackage).toHaveBeenCalled(),
    );
    const select = root.querySelector("[data-reel-set]") as HTMLSelectElement;
    select.value = "first";
    select.dispatchEvent(new Event("change"));
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
    result.root.querySelector("[data-upload-images]") as HTMLButtonElement
  ).click();
  await vi.waitFor(() =>
    expect(
      result.root.querySelector('[data-resource-row="uploaded"]'),
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
