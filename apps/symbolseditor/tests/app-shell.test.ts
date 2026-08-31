import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import {
  createFromGameConfig,
  type EditorAssetRecord,
} from "../src/model/editor-project.js";
import { exportSymbolPackageZip } from "../src/io/symbol-package-zip.js";
import { readCraveFixture } from "./crave-fixture.js";
import { readSymbolArtifactFixtureBytes } from "./artifact-fixtures.js";

const previewSpies = vi.hoisted(() => ({
  replay: vi.fn(),
  destroy: vi.fn(),
  setResource: vi.fn(async (..._args: unknown[]) => undefined),
}));

const codecSpies = vi.hoisted(() => ({
  decode: vi.fn(),
  encodePng: vi.fn(),
}));

vi.mock("../src/preview/symbol-preview.js", () => ({
  SymbolEditorPreview: class {
    async init() {}
    destroy() {
      previewSpies.destroy();
    }
    clearResource() {}
    replay() {
      previewSpies.replay();
    }
    async setResource(...args: unknown[]) {
      return previewSpies.setResource(...args);
    }
    fitAll() {
      return 1;
    }
    getZoom() {
      return 1;
    }
    setZoom(value: number) {
      return value;
    }
  },
}));

vi.mock("../src/io/browser-image-codec.js", () => ({
  decodeBrowserImage: codecSpies.decode,
  encodeBrowserPng: codecSpies.encodePng,
}));

import {
  SymbolsEditorApp,
  getSharedSpineSlotOptions,
} from "../src/ui/app-shell.js";

const gameConfig = {
  paytable: {
    "2": { code: 2, symbol: "B", pays: [1] },
    "1": { code: 1, symbol: "A", pays: [1] },
  },
  symbolCodes: { B: 2, A: 1 },
  reels: { main: [[1, 2]] },
};

describe("symbols editor app shell", () => {
  let root: HTMLElement;
  let app: SymbolsEditorApp;

  beforeEach(async () => {
    root = document.createElement("div");
    document.body.append(root);
    app = new SymbolsEditorApp(root);
    await app.init();
    codecSpies.decode.mockResolvedValue({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255]),
    });
    codecSpies.encodePng.mockResolvedValue(
      readSymbolArtifactFixtureBytes("H1.png"),
    );
  });

  afterEach(() => {
    app.destroy();
    vi.unstubAllGlobals();
  });

  it("keeps project-only actions disabled before a project exists", () => {
    expect(
      root.querySelector<HTMLButtonElement>("[data-upload]")?.disabled,
    ).toBe(false);
    expect(
      root.querySelector<HTMLButtonElement>("[data-export]")?.disabled,
    ).toBe(true);
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(root.textContent).toContain("建立 Symbols 项目");
  });

  it("creates into the assets workspace and renders only the active workspace", async () => {
    await createProject(root);
    expect(selectedTab(root, "workspace")).toBe("assets");
    expect(root.textContent).toContain("上传不会按文件名自动匹配");
    expect(root.querySelector("[data-symbol-query]")).toBeNull();
    expect(root.querySelector("[data-project-id]")).toBeNull();

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    expect(root.querySelector("[data-symbol-query]")).not.toBeNull();
    expect(root.querySelector("[data-asset-query]")).toBeNull();
    expect(root.querySelector("[data-project-id]")).toBeNull();
  });

  it("does not expose legacy Symbol audio authoring", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    expect(upload.accept).not.toMatch(/audio|wav|mp3|ogg/iu);

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    expect(root.querySelector("[data-new-state-audio-path]")).toBeNull();
    expect(root.querySelector("[data-add-state-audio]")).toBeNull();
    expect(root.querySelectorAll("[data-state-audio-card]")).toHaveLength(0);
  });

  it("imports generic resource ZIPs and reviews conflicting replacements", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const firstBytes = readCraveFixture("H1.png");
    const zip = createDeterministicZip({ "art/H1.png": firstBytes });
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File([zip as BlobPart], "art.zip")],
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("已上传 1 个资源"),
    );
    expect(root.textContent).toContain("H1.png");

    const secondBytes = readCraveFixture("H2.png");
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File([toArrayBuffer(secondBytes)], "H1.png")],
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-import-review]")).not.toBeNull(),
    );
    expect(root.textContent).toContain("替换同名资源（配置不变）");
    click(root, '[data-import-all="keep-both"]');
    click(root, "[data-import-confirm]");
    await vi.waitFor(() => {
      expect(root.querySelector("[data-import-review]")).toBeNull();
      expect(root.textContent).toContain("H1-1.png");
    });
  });

  it("imports only the unique runtime closure from a VNI export bundle", async () => {
    await createProject(root);
    await uploadVniBundle(root, createVniBundleZip());
    await vi.waitFor(() =>
      expect(root.querySelector("[data-feedback]")?.textContent).toContain(
        "已上传 2 个资源",
      ),
    );
    expect(root.textContent).toContain("l1.json");
    expect(root.textContent).toContain("a_asset_image.png");
    expect(root.textContent).not.toContain("manifest.json");
    expect(root.textContent).not.toContain("edit_full");
  });

  it("requires an explicit runtime choice and keeps cancellation mutation-free", async () => {
    await createProject(root);
    const zip = createVniBundleZip({ extraRuntime: true });
    await uploadVniBundle(root, zip);
    await vi.waitFor(() =>
      expect(
        root.querySelector<HTMLDialogElement>("[data-vni-runtime-choice]")
          ?.open,
      ).toBe(true),
    );
    expect(
      root.querySelectorAll("[data-vni-runtime-select] option"),
    ).toHaveLength(2);
    click(root, "[data-vni-runtime-cancel]");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-feedback]")?.textContent).toContain(
        "项目未修改",
      ),
    );
    expect(root.textContent).not.toContain("l1.json");

    await uploadVniBundle(root, zip);
    await vi.waitFor(() =>
      expect(
        root.querySelector<HTMLDialogElement>("[data-vni-runtime-choice]")
          ?.open,
      ).toBe(true),
    );
    const select = root.querySelector<HTMLSelectElement>(
      "[data-vni-runtime-select]",
    )!;
    select.value = "runtime_50";
    click(root, "[data-vni-runtime-confirm]");
    await vi.waitFor(() =>
      expect(root.querySelector("[data-feedback]")?.textContent).toContain(
        "已上传 2 个资源",
      ),
    );
    expect(root.textContent).toContain("l1.json");
  });

  it("opens a Symbols project ZIP through an explicit project review", async () => {
    const source = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "task135-shaped.json",
    });
    const exported = await exportSymbolPackageZip(source, {
      loadTextures: false,
    });
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [
        new File([exported.bytes as BlobPart], "task135-shaped-symbols.zip"),
      ],
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("task135-shaped"),
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("原子替换当前项目"),
    );
  });

  it("surfaces preview initialization failures instead of silently clearing", async () => {
    previewSpies.setResource.mockRejectedValueOnce(
      new Error("preview exploded"),
    );
    await createProject(root);
    await vi.waitFor(() =>
      expect(root.querySelector("[data-errors]")?.textContent).toContain(
        "Symbols 预览初始化失败：preview exploded",
      ),
    );
  });

  it("exposes ARIA tabs and preserves inspector selection across transactions", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    expect(selectedTab(root, "inspector")).toBe("states");
    const included = root.querySelector<HTMLInputElement>(
      '[data-symbol-included="A"]',
    )!;
    included.checked = false;
    included.dispatchEvent(new Event("change", { bubbles: true }));
    expect(selectedTab(root, "workspace")).toBe("symbols");
    expect(selectedTab(root, "inspector")).toBe("states");
  });

  it("adds one state, synchronizes preview, focuses it and shows success feedback", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    click(root, "[data-toggle-add-state]");
    click(root, '[data-add-state-id="win"]');
    await Promise.resolve();
    expect(root.querySelector(".single-state-inspector h2")?.textContent).toBe(
      "win",
    );
    expect(
      root.querySelector<HTMLSelectElement>("[data-preview-state]")?.value,
    ).toBe("win");
    expect(root.querySelector("[data-feedback]")?.textContent).toContain(
      "已为 A 添加 win 状态",
    );
    expect(document.activeElement).toBe(
      root.querySelector("[data-visual-kind]"),
    );
    expect(root.textContent).toContain("explicit empty");
  });

  it("generates blur and disabled independently from the selected symbol normal image", async () => {
    await createProject(root);
    await uploadImage(root, "H1.png");
    bindNormalImage(root, "H1.png");

    const blur = root.querySelector<HTMLButtonElement>(
      '[data-generate-state-texture="spinBlur"]',
    )!;
    const disabled = root.querySelector<HTMLButtonElement>(
      '[data-generate-state-texture="disabled"]',
    )!;
    expect(blur.disabled).toBe(false);
    expect(disabled.disabled).toBe(false);

    blur.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-feedback]")?.textContent).toContain(
        "生成并使用 spinBlur",
      ),
    );
    expect(root.querySelector('[data-select-state="spinBlur"]')).not.toBeNull();
    expect(root.querySelector('[data-select-state="disabled"]')).toBeNull();
    expect(root.querySelector(".single-state-inspector h2")?.textContent).toBe(
      "normal",
    );
    expect(
      root.querySelector<HTMLSelectElement>("[data-preview-state]")?.value,
    ).toBe("spinBlur");

    root
      .querySelector<HTMLButtonElement>(
        '[data-generate-state-texture="disabled"]',
      )!
      .click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-feedback]")?.textContent).toContain(
        "生成并使用 disabled",
      ),
    );
    expect(root.querySelector('[data-select-state="disabled"]')).not.toBeNull();
    expect(codecSpies.decode).toHaveBeenCalledTimes(2);
    expect(codecSpies.encodePng).toHaveBeenCalledTimes(2);
  });

  it("uses the last successful generated or manually uploaded state image", async () => {
    await createProject(root);
    await uploadImage(root, "H1.png");
    bindNormalImage(root, "H1.png");
    click(root, '[data-generate-state-texture="spinBlur"]');
    await vi.waitFor(() =>
      expect(root.textContent).toContain("生成并使用 spinBlur"),
    );

    click(root, '[data-select-state="spinBlur"]');
    click(root, "[data-open-picker]");
    expect(root.textContent).toContain("上传并使用");
    click(root, "[data-picker-upload]");
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const manualBytes = readSymbolArtifactFixtureBytes("H2.png");
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File([manualBytes], "manual.png", { type: "image/png" })],
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.querySelector("[data-feedback]")?.textContent).toContain(
        "已上传并使用 manual.png",
      ),
    );
    click(root, "[data-picker-cancel]");
    expect(root.querySelector(".binding-path")?.textContent).toBe("manual.png");

    click(root, '[data-select-state="normal"]');
    click(root, '[data-generate-state-texture="spinBlur"]');
    await vi.waitFor(() =>
      expect(root.textContent).toContain(
        "已为 A 生成并使用 spinBlur：H1.spinBlur.png",
      ),
    );
    click(root, '[data-select-state="spinBlur"]');
    expect(root.querySelector(".binding-path")?.textContent).toBe(
      "H1.spinBlur.png",
    );
    expect(root.querySelector('[data-select-state="disabled"]')).toBeNull();
  });

  it("preserves horizontal state scroll and reveals a newly selected state", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    click(root, "[data-toggle-add-state]");
    click(root, '[data-add-state-id="win"]');
    const nav = root.querySelector<HTMLElement>(".state-nav")!;
    nav.scrollLeft = 137;
    const included = root.querySelector<HTMLInputElement>(
      '[data-symbol-included="A"]',
    )!;
    included.checked = false;
    included.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector<HTMLElement>(".state-nav")?.scrollLeft).toBe(137);

    click(root, '[data-select-state="win"]');
    await Promise.resolve();
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

  it("offers VNI for normal, once and stable loop states", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    expect(
      root
        .querySelector<HTMLSelectElement>("[data-visual-kind]")
        ?.querySelector('option[value="vni"]'),
    ).not.toBeNull();

    for (const state of ["win", "dropdown"]) {
      click(root, "[data-toggle-add-state]");
      click(root, `[data-add-state-id="${state}"]`);
      expect(
        root
          .querySelector<HTMLSelectElement>("[data-visual-kind]")
          ?.querySelector('option[value="vni"]'),
      ).not.toBeNull();
    }
  });

  it("edits ordered underlay and overlay layers for a composite state", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    expect(
      root
        .querySelector<HTMLSelectElement>("[data-visual-kind]")
        ?.querySelector('option[value="composite"]'),
    ).toBeNull();
    click(root, "[data-add-animation-layer]");

    expect(root.querySelectorAll(".composite-layer-card")).toHaveLength(1);
    expect(
      root.querySelector<HTMLButtonElement>(
        '[data-composite-layer-action="remove"]',
      )?.disabled,
    ).toBe(true);

    click(root, '[data-composite-layer-action="add"]');
    expect(root.querySelectorAll(".composite-layer-card")).toHaveLength(2);
    const secondId = root.querySelector<HTMLInputElement>(
      '[data-composite-layer-field="id"][data-composite-layer-index="1"]',
    )!;
    secondId.value = "glow-back";
    secondId.dispatchEvent(new Event("change", { bubbles: true }));
    const secondPlacement = root.querySelector<HTMLSelectElement>(
      '[data-composite-layer-field="placement"][data-composite-layer-index="1"]',
    )!;
    secondPlacement.value = "underlay";
    secondPlacement.dispatchEvent(new Event("change", { bubbles: true }));
    click(
      root,
      '[data-composite-layer-action="up"][data-composite-layer-index="1"]',
    );

    expect(
      root.querySelector<HTMLInputElement>(
        '[data-composite-layer-field="id"][data-composite-layer-index="0"]',
      )?.value,
    ).toBe("glow-back");
    expect(
      root.querySelector<HTMLSelectElement>(
        '[data-composite-layer-field="placement"][data-composite-layer-index="0"]',
      )?.value,
    ).toBe("underlay");
  });

  it("defaults the only ready Spine atlas without exposing a texture binding", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const files = ["H1.json", "Symbol.atlas", "Symbol.png"].map(
      (name) => new File([readSymbolArtifactFixtureBytes(name)], name),
    );
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: files,
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("已上传 3 个资源"),
    );

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    const kind = root.querySelector<HTMLSelectElement>("[data-visual-kind]")!;
    kind.value = "spine";
    kind.dispatchEvent(new Event("change", { bubbles: true }));

    expect(root.textContent).toContain("Symbol.atlas");
    expect(root.textContent).not.toContain("Texture · 由 Atlas page 自动解析");
    expect(
      root.querySelector('[data-open-picker*="spine-texture"]'),
    ).toBeNull();
  });

  it("imports multiple Spine skeletons that share one atlas and texture", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const names = [
      "CN_1.json",
      "CN_2.json",
      "CN_3.json",
      "CN_4.json",
      "Symbol.atlas",
      "Symbol.png",
    ];
    const files = names.map(
      (name) => new File([toArrayBuffer(readCraveFixture(name))], name),
    );
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: files,
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("已上传 6 个资源"),
    );

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    const kind = root.querySelector<HTMLSelectElement>("[data-visual-kind]")!;
    kind.value = "spine";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
    click(root, '[data-open-picker*="spine-skeleton"]');

    expect(
      [...root.querySelectorAll<HTMLElement>("[data-picker-candidate]")].map(
        (candidate) => candidate.dataset.pickerCandidate,
      ),
    ).toEqual(["CN_1.json", "CN_2.json", "CN_3.json", "CN_4.json"]);
    expect(root.textContent).toContain("Symbol.atlas");
  });

  it("still rejects a Spine import when multiple atlases make the closure ambiguous", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const skeleton = readCraveFixture("CN_1.json");
    const atlas = readCraveFixture("Symbol.atlas");
    const texture = readCraveFixture("Symbol.png");
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [
        new File([toArrayBuffer(skeleton)], "CN_1.json"),
        new File([toArrayBuffer(atlas)], "Symbol.atlas"),
        new File([toArrayBuffer(atlas)], "Other.atlas"),
        new File([toArrayBuffer(texture)], "Symbol.png"),
      ],
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.textContent).toContain("1 skeleton / 2 atlas"),
    );
    expect(root.textContent).not.toContain("已上传 4 个资源");
  });

  it("supports keyboard tab navigation and idempotent destroy", async () => {
    await createProject(root);
    const assets = root.querySelector<HTMLElement>(
      '[data-workspace-tab][data-tab-value="assets"]',
    )!;
    assets.focus();
    assets.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await Promise.resolve();
    expect(selectedTab(root, "workspace")).toBe("symbols");
    expect(document.activeElement?.getAttribute("data-tab-value")).toBe(
      "symbols",
    );
    app.destroy();
    app.destroy();
    expect(root.childElementCount).toBe(0);
  });

  it("keeps picker cancel mutation-free and binds only after confirmation", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const bytes = readSymbolArtifactFixtureBytes("H1.png");
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File([bytes], "H1.png", { type: "image/png" })],
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("已上传 1 个资源"),
    );
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    const kind = root.querySelector<HTMLSelectElement>("[data-visual-kind]")!;
    kind.value = "image";
    kind.dispatchEvent(new Event("change", { bubbles: true }));

    click(root, "[data-open-picker]");
    expect(
      root.querySelector<HTMLDialogElement>("[data-resource-picker]")?.open,
    ).toBe(true);
    click(root, '[data-picker-candidate="H1.png"]');
    click(root, "[data-picker-cancel]");
    expect(root.querySelector(".binding-path")?.textContent).toContain(
      "未选择资源",
    );

    click(root, "[data-open-picker]");
    click(root, '[data-picker-candidate="H1.png"]');
    click(root, "[data-picker-confirm]");
    expect(root.querySelector(".binding-path")?.textContent).toBe("H1.png");
  });

  it("keeps project state definitions separate and exposes new custom states", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="project"]');
    expect(root.querySelector("[data-symbol-query]")).toBeNull();
    const id = root.querySelector<HTMLInputElement>("[data-custom-id]")!;
    id.value = "celebrate";
    root.querySelector<HTMLSelectElement>(
      "[data-custom-after-complete]",
    )!.value = "terminal";
    click(root, "[data-add-custom]");
    expect(root.querySelector("[data-feedback]")?.textContent).toContain(
      "已添加项目状态 celebrate",
    );
    expect(
      root.querySelector<HTMLSelectElement>(
        '[data-state-after-complete="celebrate"]',
      )?.value,
    ).toBe("terminal");

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    click(root, "[data-toggle-add-state]");
    expect(
      root.querySelector('[data-add-state-id="celebrate"]'),
    ).not.toBeNull();
  });

  it("keeps Value and Cascade compact until explicitly enabled", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="value"]');
    expect(root.querySelector("[data-enable-value]")).not.toBeNull();
    expect(root.querySelector(".tier-list")).toBeNull();
    click(root, "[data-enable-value]");
    expect(root.querySelectorAll("[data-tier-index]")).toHaveLength(1);
    expect(root.textContent).not.toContain("Texture · 由 Atlas page 自动解析");
    expect(
      [...root.querySelectorAll("[data-open-picker]")].some((element) =>
        element.getAttribute("data-open-picker")?.includes('"field":"texture"'),
      ),
    ).toBe(false);

    click(root, '[data-inspector-tab][data-tab-value="states"]');
    for (const state of ["win", "remove"]) {
      click(root, "[data-toggle-add-state]");
      click(root, `[data-add-state-id="${state}"]`);
    }
    click(root, '[data-inspector-tab][data-tab-value="cascade"]');
    const mode = root.querySelector<HTMLSelectElement>("[data-cascade-mode]")!;
    mode.value = "group";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.textContent).toContain("groupAmount");
  });

  it("keeps JSON-only tiers and one shared Normal ImgNumber binding", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="value"]');
    click(root, "[data-enable-value]");
    click(
      root,
      '[data-value-action="text-type"][data-text-type="image-string"]',
    );
    expect(root.querySelectorAll(".value-tier-imgnumber")).toHaveLength(1);
    expect(root.querySelectorAll(".value-number-tier")).toHaveLength(1);
    expect(
      root.querySelectorAll("[data-generate-value-spin-blur]"),
    ).toHaveLength(1);
    expect(root.querySelector('[data-value-field="text.prefix"]')).toBeNull();
    expect(root.textContent).toContain("未完成");

    click(root, '[data-value-action="add-tier"]');
    expect(root.querySelectorAll("[data-tier-index]")).toHaveLength(2);
    expect(root.querySelectorAll(".value-tier-imgnumber")).toHaveLength(2);
    expect(root.querySelectorAll(".value-number-tier")).toHaveLength(1);
    expect(root.textContent).toContain("Normal 共享配置");
    const slots = root.querySelectorAll<HTMLSelectElement>(
      "[data-value-image-string-field='slot']",
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]?.value).toBe("");
    const positions = root.querySelectorAll<HTMLInputElement>(
      "[data-value-image-string-field='transform.x']",
    );
    positions[0]!.value = "19";
    positions[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(positions).toHaveLength(1);
    expect(positions[0]?.value).toBe("19");
    expect(root.querySelector("[data-value-field^='text.tiers.']")).toBeNull();
    click(root, '[data-value-action="remove-tier"][data-value-index="1"]');
    expect(root.querySelectorAll(".value-tier-imgnumber")).toHaveLength(1);

    click(root, '[data-value-action="text-type"][data-text-type="image"]');
    expect(root.querySelector(".value-number-tier")).toBeNull();
    expect(
      root.querySelector('[data-value-field="text.prefix"]'),
    ).not.toBeNull();
    expect(root.querySelector('[data-value-field^="text.tiers."]')).toBeNull();
  });

  it("intersects shared slots across ordinary Spine states and value tiers", () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "shared-slots.json",
    });
    const symbol = project.symbols.get("A")!;
    symbol.stateOrder = ["normal", "win"];
    symbol.states.set("normal", createSpineVisual("normal.json", "Idle"));
    symbol.states.set("win", createSpineVisual("win.json", "Win"));
    project.assetLibrary.records.set(
      "normal.json",
      createSpineMetadataRecord("normal.json", ["Body", "Num", "Shared"]),
    );
    project.assetLibrary.records.set(
      "win.json",
      createSpineMetadataRecord("win.json", ["Num", "Shared", "WinOnly"]),
    );
    expect(getSharedSpineSlotOptions(project, symbol)).toEqual([
      "Num",
      "Shared",
    ]);

    symbol.valuePresentation = {
      defaultValues: [1],
      reelStates: {
        normal: { kind: "transparent", width: 160, height: 160 },
        states: {},
      },
      tiers: [
        {
          maxExclusive: 10,
          animation: createSpineManifestAnimation("tier-low.json"),
        },
        { animation: createSpineManifestAnimation("tier-high.json") },
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
    project.assetLibrary.records.set(
      "tier-low.json",
      createSpineMetadataRecord("tier-low.json", ["TierOnly", "Num"]),
    );
    project.assetLibrary.records.set(
      "tier-high.json",
      createSpineMetadataRecord("tier-high.json", ["Num", "HighOnly"]),
    );
    expect(getSharedSpineSlotOptions(project, symbol)).toEqual(["Num"]);
  });

  it("orders tier setup before states and derives tiered state visual kinds", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    const tabs = [
      ...root.querySelectorAll<HTMLElement>("[data-inspector-tab]"),
    ];
    expect(tabs.map((tab) => tab.dataset.tabValue)).toEqual([
      "basic",
      "value",
      "states",
      "image-string",
      "cascade",
    ]);

    click(root, '[data-inspector-tab][data-tab-value="value"]');
    click(root, "[data-enable-value]");
    expect(root.querySelector("[data-tier-normal-animation]")).toBeNull();
    expect(
      root.querySelector('[data-value-field*="animationName"]'),
    ).toBeNull();

    click(root, '[data-inspector-tab][data-tab-value="states"]');
    expect(root.textContent).toContain("Active Spine（全部档位）");
    expect(root.querySelector("[data-tier-normal-animation]")).not.toBeNull();
    expect(root.querySelector("[data-visual-kind]")).toBeNull();

    click(root, "[data-toggle-add-state]");
    click(root, '[data-add-state-id="spinBlur"]');
    expect(root.textContent).toContain("独立静态图片");
    expect(
      root.querySelector('[data-open-picker*="state-image"]'),
    ).not.toBeNull();
  });

  it("uses one preview value to select the configured tier", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const names = ["CN_1.json", "Symbol.atlas", "Symbol.png"];
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: names.map(
        (name) => new File([toArrayBuffer(readCraveFixture(name))], name),
      ),
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("已上传 3 个资源"),
    );

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="value"]');
    click(root, "[data-enable-value]");
    click(root, `[data-open-picker*='"field":"skeleton"']`);
    click(root, '[data-picker-candidate="CN_1.json"]');
    click(root, "[data-picker-confirm]");
    const slot = root.querySelector<HTMLSelectElement>(
      '[data-value-field="text.slot"]',
    )!;
    slot.value = "Num";
    slot.dispatchEvent(new Event("change", { bubbles: true }));

    click(root, '[data-inspector-tab][data-tab-value="states"]');
    const animation = root.querySelector<HTMLSelectElement>(
      "[data-tier-normal-animation]",
    )!;
    animation.value = "Loop";
    animation.dispatchEvent(new Event("change", { bubbles: true }));

    click(root, '[data-inspector-tab][data-tab-value="value"]');
    click(root, '[data-value-action="add-tier"]');
    const previewValues = root.querySelectorAll<HTMLInputElement>(
      "[data-value-preview]",
    );
    expect(previewValues).toHaveLength(1);
    expect(root.querySelector("[data-preview-value]")).toBeNull();
    previewValues[0]!.value = "25";
    previewValues[0]!.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      const cells = previewSpies.setResource.mock.calls.at(-1)?.[1] as
        | Array<Record<string, unknown>>
        | undefined;
      expect(cells?.find((cell) => cell.symbol === "A")).toMatchObject({
        status: "configured",
        value: 25,
      });
    });
    expect(root.textContent).toContain("当前预览档位");
    expect(
      root.querySelector('[data-tier-index="1"].active-preview'),
    ).not.toBeNull();

    const activeValue = root.querySelector<HTMLInputElement>(
      "[data-value-preview]",
    )!;
    activeValue.value = "5";
    activeValue.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      root.querySelector('[data-tier-index="0"].active-preview'),
    ).not.toBeNull();
    await vi.waitFor(() => {
      const cells = previewSpies.setResource.mock.calls.at(-1)?.[1] as
        | Array<Record<string, unknown>>
        | undefined;
      expect(cells?.find((cell) => cell.symbol === "A")).toMatchObject({
        value: 5,
      });
    });

    const invalidValue = root.querySelector<HTMLInputElement>(
      "[data-value-preview]",
    )!;
    invalidValue.value = "0";
    invalidValue.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector("[data-errors]")?.textContent).toContain(
      "positive safe integer",
    );
    const cells = previewSpies.setResource.mock.calls.at(-1)?.[1] as
      | Array<Record<string, unknown>>
      | undefined;
    expect(cells?.find((cell) => cell.symbol === "A")).toMatchObject({
      value: 5,
    });
  });

  it("surfaces protected state deletion as an error without fake success", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    for (const state of ["win", "remove"]) {
      click(root, "[data-toggle-add-state]");
      click(root, `[data-add-state-id="${state}"]`);
    }
    click(root, '[data-inspector-tab][data-tab-value="cascade"]');
    const mode = root.querySelector<HTMLSelectElement>("[data-cascade-mode]")!;
    mode.value = "group";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    click(root, '[data-select-state="win"]');
    click(root, '[data-state-action="remove"]');
    expect(root.querySelector("[data-errors]")?.textContent).toContain(
      "仍被引用",
    );
    expect(root.querySelector(".single-state-inspector h2")?.textContent).toBe(
      "win",
    );
    expect(root.querySelector("[data-feedback]")?.textContent).not.toContain(
      "删除",
    );
  });
});

async function createProject(root: HTMLElement): Promise<void> {
  const input = root.querySelector<HTMLInputElement>("[data-new-input]")!;
  const file = new File([JSON.stringify(gameConfig)], "test-game.json", {
    type: "application/json",
  });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() =>
    expect(
      root.querySelector('[data-workspace-tab][aria-selected="true"]'),
    ).not.toBeNull(),
  );
}

async function uploadImage(root: HTMLElement, name: string): Promise<void> {
  const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
  const bytes = readSymbolArtifactFixtureBytes(name);
  Object.defineProperty(upload, "files", {
    configurable: true,
    value: [new File([bytes], name, { type: "image/png" })],
  });
  upload.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() =>
    expect(root.querySelector("[data-feedback]")?.textContent).toContain(
      "已上传 1 个资源",
    ),
  );
}

function bindNormalImage(root: HTMLElement, path: string): void {
  click(root, '[data-workspace-tab][data-tab-value="symbols"]');
  click(root, '[data-inspector-tab][data-tab-value="states"]');
  const kind = root.querySelector<HTMLSelectElement>("[data-visual-kind]")!;
  kind.value = "image";
  kind.dispatchEvent(new Event("change", { bubbles: true }));
  click(root, "[data-open-picker]");
  click(root, `[data-picker-candidate="${path}"]`);
  click(root, "[data-picker-confirm]");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function click(root: HTMLElement, selector: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing test element ${selector}`);
  element.click();
}

function selectedTab(root: HTMLElement, group: string): string | undefined {
  return (
    root
      .querySelector<HTMLElement>(`[data-${group}-tab][aria-selected="true"]`)
      ?.getAttribute("data-tab-value") ?? undefined
  );
}

function createSpineVisual(skeletonPath: string, animationName: string) {
  return {
    kind: "spine" as const,
    skeletonPath,
    atlasPath: "symbol.atlas",
    texturePath: "symbol.png",
    animationName,
  };
}

function createSpineManifestAnimation(skeleton: string) {
  return {
    kind: "spine" as const,
    skeleton: `./${skeleton}`,
    atlas: "./symbol.atlas",
    texture: "./symbol.png",
    playback: {
      mode: "animation" as const,
      animationName: "Loop",
      loop: true,
    },
  };
}

function createSpineMetadataRecord(
  path: string,
  slotNames: readonly string[],
): EditorAssetRecord {
  return {
    path,
    bytes: new Uint8Array(),
    kind: "spine-skeleton",
    size: 0,
    uploadBatchId: "test",
    metadata: { slotNames },
    diagnostics: [],
  };
}

async function uploadVniBundle(
  root: HTMLElement,
  bytes: Uint8Array,
): Promise<void> {
  const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
  Object.defineProperty(upload, "files", {
    configurable: true,
    value: [new File([bytes as BlobPart], "l1.zip")],
  });
  upload.dispatchEvent(new Event("change", { bubbles: true }));
  await Promise.resolve();
}

function createVniBundleZip(
  options: { readonly extraRuntime?: boolean } = {},
): Uint8Array {
  const image = readCraveFixture("H1.png");
  const exports = [
    {
      id: "edit_full",
      purpose: "editing",
      assetScale: 1,
      path: "edit_full/l1.json",
    },
    {
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
      path: "runtime_100/l1.json",
    },
  ];
  const entries: Record<string, Uint8Array> = {
    "edit_full/l1.json": encodeJson(
      createVniProject("edit_full", "editing", 1),
    ),
    "edit_full/assets/a_asset_image.png": image,
    "runtime_100/l1.json": encodeJson(
      createVniProject("runtime_100", "runtime", 1),
    ),
    "runtime_100/assets/a_asset_image.png": image,
  };
  if (options.extraRuntime) {
    exports.push({
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
      path: "runtime_50/l1.json",
    });
    entries["runtime_50/l1.json"] = encodeJson(
      createVniProject("runtime_50", "runtime", 0.5),
    );
    entries["runtime_50/assets/a_asset_image.png"] = image;
  }
  entries["manifest.json"] = encodeJson({
    type: "vni_export_bundle",
    version: "VNI_0.087",
    exports,
  });
  return createDeterministicZip(entries);
}

function createVniProject(
  id: string,
  purpose: "editing" | "runtime",
  assetScale: number,
) {
  return {
    schemaVersion: "VNI_0.087",
    editor: { name: "VNI", version: "VNI_0.087" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "L1",
    stage: {
      width: 300,
      height: 300,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "asset-image",
        type: "image",
        path: "assets/a_asset_image.png",
        originalName: "A.png",
        width: 172,
        height: 130,
        fileWidth: Math.round(172 * assetScale),
        fileHeight: Math.round(130 * assetScale),
        fileScale: assetScale,
      },
    ],
    layerGroups: [
      {
        id: "group_default",
        name: "默认组",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [],
    particles: [],
    exportProfile: { id, purpose, assetScale },
    maskCompositeMode: "precompose_light_alpha",
  };
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
