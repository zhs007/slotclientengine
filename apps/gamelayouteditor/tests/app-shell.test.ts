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

const validationSpies = vi.hoisted(() => ({
  addImage: vi.fn(async ({ project, variants, backgroundVariant }) => {
    const node = {
      id: "uploaded",
      order: project.nodes.length,
      resource: {
        kind: "image",
        path: "assets/uploaded.png",
        size: { width: 10, height: 10 },
      },
      placements: Object.fromEntries(
        variants.map((variant: string) => [variant, { x: 0, y: 0, scale: 1 }]),
      ),
    };
    project.nodes.push(node);
    project.assets.set("assets/uploaded.png", new Uint8Array([1]));
    if (backgroundVariant) {
      project.variants[backgroundVariant].backgroundNode = node.id;
      project.variants[backgroundVariant].artSize = { width: 10, height: 10 };
      project.variants[backgroundVariant].focusRect = {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      };
      project.variants[backgroundVariant].frameFocusRect = {
        width: 10,
        height: 10,
      };
      project.reel.cellWidth = 1;
      project.reel.cellHeight = 1;
      project.reel.placements[backgroundVariant] = { x: 2, y: 3 };
    }
    return node;
  }),
  addSpine: vi.fn(async ({ project, variants }) => {
    const node = {
      id: "spine-layer",
      order: project.nodes.length,
      resource: {
        kind: "spine",
        skeleton: "assets/spine-layer.json",
        atlas: "assets/spine-layer.atlas",
        textures: { "page.png": "assets/page.png" },
        defaultAnimation: "",
        loop: true,
      },
      animationNames: ["Idle", "Win"],
      placements: Object.fromEntries(
        variants.map((variant: string) => [variant, { x: 0, y: 0, scale: 1 }]),
      ),
    };
    project.nodes.push(node);
    project.assets.set("assets/spine-layer.json", new Uint8Array([1]));
    project.assets.set("assets/spine-layer.atlas", new Uint8Array([2]));
    project.assets.set("assets/page.png", new Uint8Array([3]));
    return node;
  }),
  remove: vi.fn((project, nodeId) => {
    project.nodes = project.nodes.filter(
      (node: { id: string }) => node.id !== nodeId,
    );
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

vi.mock("../src/model/validation.js", () => ({
  addImageFileToProject: validationSpies.addImage,
  addSpineFilesToProject: validationSpies.addSpine,
  removeNodeFromProject: validationSpies.remove,
}));

import { GameLayoutEditorApp } from "../src/ui/app-shell.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("GameLayoutEditorApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewSpies.setSymbolPackage.mockResolvedValue(null);
  });

  it("renders accessible controls, switches modes and keeps invalid form data", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
    expect(root.querySelector("[data-new-single]")).toBeTruthy();
    expect(root.querySelector("[data-reel-set]")).toBeTruthy();
    expect(root.querySelector("[data-randomize-symbols]")).toBeTruthy();
    expect(root.textContent).toContain("maximized-focus");
    expect(
      (
        root.querySelector(
          '[data-number="variants.default.focusOffsets.left"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("-60");
    (root.querySelector("[data-new-dual]") as HTMLButtonElement).click();
    expect(root.textContent).toContain("orientation-focus");
    expect(root.textContent).toContain("landscape 背景");
    const columns = root.querySelector(
      '[data-number="reel.columns"]',
    ) as HTMLInputElement;
    columns.value = "0";
    columns.dispatchEvent(new Event("change"));
    expect(root.querySelector("[data-errors]")?.textContent).toMatch(
      /positive/,
    );
    expect(previewSpies.clear).toHaveBeenCalled();
    app.destroy();
    expect(previewSpies.destroy).toHaveBeenCalled();
  });

  it("imports symbols atomically, renders reel metadata and delegates selection and randomization", async () => {
    const resource = {
      packageManifest: {
        id: "symbols-fixture",
        cellSize: { width: 120, height: 130 },
      },
      destroy: vi.fn(),
    };
    const pending = {
      packageId: "symbols-fixture",
      cellSize: { width: 120, height: 130 },
      displaySymbolCount: 2,
      reelSets: [
        { name: "first", reelCount: 5, compatible: true },
        { name: "second", reelCount: 5, compatible: true },
        {
          name: "six",
          reelCount: 6,
          compatible: false,
          reason: "需要 5 reels，实际为 6",
        },
      ],
      selectedReelSet: null,
      status: "pending-selection",
      message: "有 2 个兼容 reel set，请显式选择。",
      scene: null,
    } as const;
    const ready = {
      ...pending,
      selectedReelSet: "second",
      status: "ready",
      message: "ready",
      scene: {
        reelSetName: "second",
        columns: 5,
        rows: 3,
        stopYs: [1, 2, 3, 4, 5],
        codes: [[0], [0], [0], [0], [0]],
        symbols: [["A"], ["B"], ["A"], ["B"], ["A"]],
      },
    } as const;
    ioSpies.importSymbolsZip.mockResolvedValueOnce(resource);
    previewSpies.setSymbolPackage.mockResolvedValueOnce(pending);
    previewSpies.setSymbolGrid.mockReturnValue(pending);
    previewSpies.setSelectedReelSet.mockReturnValue(ready);
    previewSpies.randomizeSymbols.mockReturnValue(ready);
    const zipFile = new File(["zip"], "symbols.zip");
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, "files", {
          configurable: true,
          value: [zipFile],
        });
        this.dispatchEvent(new Event("change"));
      });
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
    (root.querySelector("[data-import-symbols]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(previewSpies.setSymbolPackage).toHaveBeenCalledWith(resource, {
        columns: 5,
        rows: 3,
      }),
    );
    expect(
      root.querySelector("[data-symbols-metadata]")?.textContent,
    ).toContain("symbols-fixture · cell 120×130");
    const selector = root.querySelector("[data-reel-set]") as HTMLSelectElement;
    expect(selector.disabled).toBe(false);
    expect(selector.options[3].disabled).toBe(true);
    selector.value = "second";
    selector.dispatchEvent(new Event("change"));
    expect(previewSpies.setSelectedReelSet).toHaveBeenCalledWith("second");
    expect(
      (root.querySelector("[data-randomize-symbols]") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    (
      root.querySelector("[data-randomize-symbols]") as HTMLButtonElement
    ).click();
    expect(previewSpies.randomizeSymbols).toHaveBeenCalledOnce();
    expect(root.querySelector("[data-symbols-scene]")?.textContent).toContain(
      "stops=[1, 2, 3, 4, 5]",
    );
    (root.querySelector("[data-clear-symbols]") as HTMLButtonElement).click();
    expect(previewSpies.setSymbolPackage).toHaveBeenLastCalledWith(null);
    expect(
      root.querySelector("[data-symbols-metadata]")?.textContent,
    ).toContain("未导入");
    app.destroy();
    click.mockRestore();
  });

  it("keeps the previous symbols metadata when a replacement import fails", async () => {
    const resource = {
      packageManifest: {
        id: "old-symbols",
        cellSize: { width: 100, height: 100 },
      },
      destroy: vi.fn(),
    };
    const ready = {
      packageId: "old-symbols",
      cellSize: { width: 100, height: 100 },
      displaySymbolCount: 1,
      reelSets: [{ name: "main", reelCount: 5, compatible: true }],
      selectedReelSet: "main",
      status: "ready",
      message: "ready",
      scene: {
        reelSetName: "main",
        columns: 5,
        rows: 3,
        stopYs: [0, 0, 0, 0, 0],
        codes: [[0], [0], [0], [0], [0]],
        symbols: [["A"], ["A"], ["A"], ["A"], ["A"]],
      },
    } as const;
    ioSpies.importSymbolsZip
      .mockResolvedValueOnce(resource)
      .mockRejectedValueOnce(new Error("replacement invalid"));
    previewSpies.setSymbolPackage.mockResolvedValueOnce(ready);
    previewSpies.setSymbolGrid.mockReturnValue(ready);
    const zipFile = new File(["zip"], "symbols.zip");
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, "files", {
          configurable: true,
          value: [zipFile],
        });
        this.dispatchEvent(new Event("change"));
      });
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
    (root.querySelector("[data-import-symbols]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(
        root.querySelector("[data-symbols-metadata]")?.textContent,
      ).toContain("old-symbols"),
    );
    (root.querySelector("[data-import-symbols]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-errors]")?.textContent).toContain(
        "replacement invalid",
      ),
    );
    expect(
      root.querySelector("[data-symbols-metadata]")?.textContent,
    ).toContain("old-symbols");
    app.destroy();
    click.mockRestore();
  });

  it("preserves expanded editor sections across field commits", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
    const reelDetails = root.querySelector(
      '[data-details-key="reel-main"]',
    ) as HTMLDetailsElement;
    const variantDetails = root.querySelector(
      '[data-details-key="variant-default"]',
    ) as HTMLDetailsElement;
    reelDetails.open = true;
    variantDetails.open = true;

    const cellWidth = root.querySelector(
      '[data-number="reel.cellWidth"]',
    ) as HTMLInputElement;
    cellWidth.value = "140";
    cellWidth.dispatchEvent(new Event("change"));

    expect(
      (
        root.querySelector(
          '[data-details-key="reel-main"]',
        ) as HTMLDetailsElement
      ).open,
    ).toBe(true);
    expect(
      (
        root.querySelector(
          '[data-details-key="variant-default"]',
        ) as HTMLDetailsElement
      ).open,
    ).toBe(true);
    app.destroy();
  });

  it("atomically imports a valid zip and exports the validated project", async () => {
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
    const zipFile = new File(["zip"], "fixture-layout.zip", {
      type: "application/zip",
    });
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, "files", {
          configurable: true,
          value: [zipFile],
        });
        this.dispatchEvent(new Event("change"));
      });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
    (root.querySelector("[data-import]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(ioSpies.importZip).toHaveBeenCalled());
    expect(root.textContent).toContain("已加载 bg");
    expect(imported.destroy).toHaveBeenCalled();
    (root.querySelector("[data-export]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(ioSpies.exportZip).toHaveBeenCalled());
    expect(anchorClick).toHaveBeenCalled();
    app.destroy();
    click.mockRestore();
    anchorClick.mockRestore();
  });

  it("updates preview controls without mutating project fields", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
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
    expect(previewSpies.setZoom).toHaveBeenCalled();
    (root.querySelector("[data-zoom-out]") as HTMLButtonElement).click();
    (root.querySelector("[data-zoom-reset]") as HTMLButtonElement).click();
    const focus = root.querySelector("[data-guide-focus]") as HTMLInputElement;
    focus.checked = false;
    focus.dispatchEvent(new Event("change"));
    expect(previewSpies.setGuideVisibility).toHaveBeenCalledWith({
      showFocus: false,
      showReels: true,
    });
    const reel = root.querySelector("[data-guide-reel]") as HTMLInputElement;
    reel.checked = false;
    reel.dispatchEvent(new Event("change"));
    app.destroy();
  });

  it("handles background/layer uploads, animation selection, visibility and deletion", async () => {
    const selectedFiles = [
      [new File(["image"], "uploaded.png")],
      [new File(["{}"], "layer.json"), new File(["atlas"], "layer.atlas")],
    ];
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, "files", {
          configurable: true,
          value: selectedFiles.shift() ?? [],
        });
        this.dispatchEvent(new Event("change"));
      });
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
    (root.querySelector("[data-new-dual]") as HTMLButtonElement).click();
    (
      root.querySelector('[data-bg-image="landscape"]') as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(validationSpies.addImage).toHaveBeenCalled());
    expect(root.textContent).toContain("已加载 uploaded");
    await vi.waitFor(() => expect(previewSpies.setLayout).toHaveBeenCalled());
    (root.querySelector("[data-add-spine]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(validationSpies.addSpine).toHaveBeenCalled());
    const select = root.querySelector("[data-animation]") as HTMLSelectElement;
    select.value = "Idle";
    select.dispatchEvent(new Event("change"));
    const portraitVisible = root.querySelector(
      '[data-visible="portrait"][data-node-index="1"]',
    ) as HTMLInputElement;
    portraitVisible.checked = false;
    portraitVisible.dispatchEvent(new Event("change"));
    portraitVisible.checked = true;
    portraitVisible.dispatchEvent(new Event("change"));
    const moveUp = root.querySelector(
      '[data-move-node="-1"][data-node-index="1"]',
    ) as HTMLButtonElement;
    moveUp.click();
    expect(root.textContent).toContain("spine-layer");
    const deleteButton = root.querySelector(
      '[data-delete-node="spine-layer"]',
    ) as HTMLButtonElement;
    deleteButton.click();
    expect(validationSpies.remove).toHaveBeenCalledWith(
      expect.anything(),
      "spine-layer",
    );
    app.destroy();
    click.mockRestore();
  });

  it("covers empty file selections and the single-mode layer upload branch", async () => {
    const selections = [[], [new File(["image"], "layer.png")]];
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, "files", {
          configurable: true,
          value: selections.shift() ?? [],
        });
        this.dispatchEvent(new Event("change"));
      });
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
    (root.querySelector("[data-add-image]") as HTMLButtonElement).click();
    await Promise.resolve();
    expect(validationSpies.addImage).not.toHaveBeenCalled();
    (root.querySelector("[data-add-image]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(validationSpies.addImage).toHaveBeenCalled());
    expect(validationSpies.addImage.mock.calls.at(-1)?.[0]).toMatchObject({
      variants: ["default"],
    });
    app.destroy();
    app.destroy();
    click.mockRestore();
  });

  it("surfaces import, export and custom preview failures", async () => {
    ioSpies.importZip.mockRejectedValueOnce(new Error("bad zip"));
    const zipFile = new File(["bad"], "bad.zip");
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, "files", {
          configurable: true,
          value: [zipFile],
        });
        this.dispatchEvent(new Event("change"));
      });
    const root = document.createElement("div");
    document.body.append(root);
    const app = new GameLayoutEditorApp(root);
    await app.init();
    (root.querySelector("[data-import]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-errors]")?.textContent).toContain(
        "bad zip",
      ),
    );
    (root.querySelector("[data-export]") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-errors]")?.textContent).toContain(
        "禁止导出",
      ),
    );
    const width = root.querySelector(
      "[data-preview-width]",
    ) as HTMLInputElement;
    previewSpies.setPageSize.mockImplementationOnce(() => {
      throw new Error("preview width must be positive");
    });
    width.value = "0";
    width.dispatchEvent(new Event("change"));
    expect(root.querySelector("[data-errors]")?.textContent).toContain(
      "positive",
    );
    app.destroy();
    click.mockRestore();
  });
});
