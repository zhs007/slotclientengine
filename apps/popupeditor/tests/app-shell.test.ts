import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addLayer, createPopupEditorProject } from "../src/model/project.js";

const preview = {
  init: vi.fn(async () => {}),
  destroy: vi.fn(),
  rebuild: vi.fn(async () => {}),
  setInput: vi.fn(),
  setAmountFormat: vi.fn(
    (format: { fractionDigits: number; useGrouping: boolean }) => {
      if (
        !Number.isSafeInteger(format.fractionDigits) ||
        format.fractionDigits < 0 ||
        format.fractionDigits > 6
      )
        throw new Error("preview 小数位数必须是 0..6 safe integer。");
    },
  ),
  play: vi.fn(),
  reset: vi.fn(),
  cancelPendingRebuild: vi.fn(),
  setViewport: vi.fn(),
};
const asset = {
  key: "image-string.manifest.json",
  sha256: "0".repeat(64),
  payloadPath: `assets/sha256/${"0".repeat(64)}.json`,
  mediaType: "application/json",
  byteLength: 1,
  bytes: new Uint8Array([1]),
};
const candidate = {
  rootKey: "image-string.manifest.json",
  kind: "image-string" as const,
  primarySource: "image-string.manifest.json",
  dependencyCount: 0,
  summary: "10 glyphs",
  spec: {
    kind: "image-string" as const,
    manifest: "image-string.manifest.json",
  },
  assets: [asset],
  exactKeys: ["image-string.manifest.json"],
  errors: [],
};

vi.mock("../src/preview/popup-preview.js", () => ({
  DEFAULT_POPUP_PREVIEW_AMOUNT_FORMAT: Object.freeze({
    fractionDigits: 0,
    useGrouping: false,
  }),
  PopupPreview: class {
    constructor() {
      return preview;
    }
  },
}));
vi.mock("../src/io/resource-import.js", async (original) => {
  const actual =
    await original<typeof import("../src/io/resource-import.js")>();
  const transaction = {
    assets: {
      items: [
        {
          targetKey: "image-string.manifest.json",
          action: "add",
          references: [],
          sourceKeys: ["image-string.manifest.json"],
        },
      ],
    },
    candidates: [candidate],
  };
  return {
    ...actual,
    inspectVniBundleProfiles: vi.fn(actual.inspectVniBundleProfiles),
    discoverPopupResources: vi.fn(async () => [structuredCloneCandidate()]),
    reviewPopupImportTransaction: vi.fn(async () => transaction),
    commitImportReview: vi.fn(async (project, candidates) => {
      for (const imported of candidates) {
        project.resources.set(imported.rootKey, {
          rootKey: imported.rootKey,
          kind: imported.kind,
          spec: structuredClone(imported.spec),
          keys: [...imported.exactKeys],
        });
        for (const importedAsset of imported.assets)
          project.assets.set(importedAsset.key, {
            ...importedAsset,
            bytes: importedAsset.bytes.slice(),
          });
      }
      return transaction;
    }),
  };
});
vi.mock("../src/io/popup-zip.js", () => ({
  exportPopupZip: vi.fn(async () => ({
    fileName: "test-popup.zip",
    bytes: new Uint8Array([1]),
    blob: new Blob([new Uint8Array([1])]),
  })),
  importPopupZip: vi.fn(async () => validProject()),
}));

describe("PopupEditorApp", () => {
  function createProject(
    root: HTMLElement,
    type: "award-celebration" | "spine" = "award-celebration",
  ) {
    root.querySelector<HTMLButtonElement>("#create-project")!.click();
    root.querySelector<HTMLInputElement>("#create-project-name")!.value =
      "Test Popup";
    root.querySelector<HTMLSelectElement>("#create-project-type")!.value = type;
    root.querySelector<HTMLButtonElement>("#create-project-confirm")!.click();
  }
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.clearAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    Object.defineProperty(window, "confirm", {
      value: vi.fn(() => true),
      configurable: true,
    });
    Object.defineProperty(window, "prompt", {
      value: vi.fn(),
      configurable: true,
    });
  });

  it("validates project ids immediately and preserves semantic button states", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
    createProject(root);

    const resourceTab = root.querySelector<HTMLButtonElement>(
      '[data-tab="resources"]',
    )!;
    const projectTab = root.querySelector<HTMLButtonElement>(
      '[data-tab="project"]',
    )!;
    expect(resourceTab.getAttribute("aria-selected")).toBe("true");
    expect(projectTab.getAttribute("aria-selected")).toBe("false");
    expect(root.querySelector("#preview-build")).toBeNull();

    projectTab.click();
    expect(projectTab.getAttribute("aria-selected")).toBe("true");
    expect(resourceTab.getAttribute("aria-selected")).toBe("false");
    const id = root.querySelector<HTMLInputElement>("#project-id")!;
    expect(id.getAttribute("aria-invalid")).toBe("false");
    id.value = "Bad_Id";
    id.dispatchEvent(new Event("input"));
    expect(id.getAttribute("aria-invalid")).toBe("true");
    expect(id.classList.contains("invalid")).toBe(true);
    expect(id.validationMessage).toContain("lowercase kebab-case");
    expect(root.querySelector<HTMLElement>("#project-id-error")!.hidden).toBe(
      false,
    );
    expect(preview.rebuild).not.toHaveBeenCalled();
    id.dispatchEvent(new Event("change"));
    const rerenderedInvalid =
      root.querySelector<HTMLInputElement>("#project-id")!;
    expect(rerenderedInvalid.getAttribute("aria-invalid")).toBe("true");
    expect(rerenderedInvalid.validationMessage).toContain(
      "lowercase kebab-case",
    );

    rerenderedInvalid.value = "bad-id";
    rerenderedInvalid.dispatchEvent(new Event("input"));
    expect(rerenderedInvalid.getAttribute("aria-invalid")).toBe("false");
    expect(rerenderedInvalid.validationMessage).toBe("");
    rerenderedInvalid.dispatchEvent(new Event("change"));
    expect(root.querySelector<HTMLInputElement>("#project-id")!.value).toBe(
      "bad-id",
    );

    root.querySelector<HTMLButtonElement>('[data-tab="tiers"]')!.click();
    expect(
      root.querySelector<HTMLButtonElement>("[data-add-layer]")!.disabled,
    ).toBe(true);
    app.destroy();
  });

  it("creates a fixed-type v6 project and edits focus-only presentation configuration", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
    expect(root.querySelector("#import-project")).not.toBeNull();
    expect(root.querySelector("#create-project")!.classList).toContain(
      "project-entry-action",
    );
    expect(root.querySelector(".file-action")!.classList).toContain(
      "project-entry-action",
    );
    expect(root.querySelector("nav")!.hasAttribute("hidden")).toBe(true);
    createProject(root, "spine");
    expect(root.querySelector("nav")!.hasAttribute("hidden")).toBe(false);

    root.querySelector<HTMLButtonElement>('[data-tab="project"]')!.click();
    expect(root.textContent).toContain("格式 v7 · Spine 弹窗");
    expect(
      root.querySelectorAll('[data-project-field^="backdrop-state-"]'),
    ).toHaveLength(3);
    expect(
      root.querySelector('[data-project-field="viewport-width"]'),
    ).toBeNull();
    expect(
      root.querySelector('[data-project-field="viewport-height"]'),
    ).toBeNull();
    expect(root.querySelector("#upgrade-project")).toBeNull();
    const change = (field: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(
        `[data-project-field="${field}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event("change"));
    };
    change("project-name", "Renamed Popup");
    change("focus-left", "240");
    change("backdrop-alpha", "0.35");
    const backdrop = root.querySelector<HTMLInputElement>(
      '[data-project-field="backdrop-enabled"]',
    )!;
    backdrop.checked = false;
    backdrop.dispatchEvent(new Event("change"));
    expect(
      root.querySelector<HTMLInputElement>('[data-project-field="focus-left"]')!
        .value,
    ).toBe("240");
    expect(
      root.querySelector<HTMLInputElement>(
        '[data-project-field="backdrop-alpha"]',
      )!.value,
    ).toBe("0.35");

    root.querySelector<HTMLButtonElement>('[data-tab="tiers"]')!.click();
    root.querySelector<HTMLButtonElement>("#add-spine-font-text")!.click();
    const alpha = root.querySelector<HTMLInputElement>(
      '[data-overlay-field="alpha"]',
    )!;
    alpha.value = "0.6";
    alpha.dispatchEvent(new Event("change"));
    expect(
      root.querySelector<HTMLInputElement>(
        '[data-overlay-field="defaultText"]',
      ),
    ).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[data-tab="project"]')!.click();
    root.querySelector<HTMLButtonElement>("#close-project")!.click();
    expect(root.querySelector("#create-project")).not.toBeNull();
    expect(preview.reset).toHaveBeenCalled();
    app.destroy();
  });

  it("uses one flat import entry, reviews atomically, and drives tiers and preview", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
    createProject(root);
    const fractionDigits = root.querySelector<HTMLInputElement>(
      "#preview-fraction-digits",
    )!;
    const useGrouping = root.querySelector<HTMLInputElement>(
      "#preview-use-grouping",
    )!;
    expect(fractionDigits.value).toBe("0");
    expect(fractionDigits.min).toBe("0");
    expect(fractionDigits.max).toBe("6");
    expect(fractionDigits.step).toBe("1");
    expect(useGrouping.checked).toBe(false);
    expect(preview.setAmountFormat).toHaveBeenLastCalledWith({
      fractionDigits: 0,
      useGrouping: false,
    });
    fractionDigits.value = "3";
    fractionDigits.dispatchEvent(new Event("change"));
    useGrouping.checked = true;
    useGrouping.dispatchEvent(new Event("change"));
    expect(preview.setAmountFormat).toHaveBeenLastCalledWith({
      fractionDigits: 3,
      useGrouping: true,
    });
    fractionDigits.value = "";
    fractionDigits.dispatchEvent(new Event("change"));
    expect(root.querySelector("#diagnostics")?.textContent).toContain(
      "preview 小数位数必须是 0..6 safe integer。",
    );
    fractionDigits.value = "3";
    fractionDigits.dispatchEvent(new Event("change"));
    const importer = root.querySelector<HTMLInputElement>("#import-assets")!;
    expect(importer.multiple).toBe(true);
    expect(importer.hasAttribute(`webkit${"directory"}`)).toBe(false);
    expect(root.querySelector("#import-project")).toBeNull();
    expect(root.querySelector("[data-replace-resource]")).toBeNull();

    Object.defineProperty(importer, "files", {
      value: [new File([new Uint8Array([1])], "image-string.manifest.json")],
      configurable: true,
    });
    importer.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(
        (root.querySelector("#import-review") as HTMLDialogElement).open,
      ).toBe(true),
    );
    root.querySelector<HTMLButtonElement>("#review-confirm")!.click();
    await vi.waitFor(() => expect(root.textContent).toContain("5 个图层绑定"));

    root.querySelector<HTMLButtonElement>('[data-tab="tiers"]')!.click();
    expect(
      [...root.querySelectorAll<HTMLButtonElement>("[data-tier]")].map(
        (button) => button.querySelector("small")?.textContent,
      ),
    ).toEqual(Array.from({ length: 5 }, () => "1 层"));
    expect(root.querySelector("#tier-boundaries")?.textContent).toContain(
      "raw 0→100→1500→2500→5000",
    );
    for (const [field, value] of [
      ["order", "2"],
      ["x", "10"],
      ["anchor-x", "0.25"],
    ]) {
      const input = root.querySelector<HTMLInputElement>(
        `[data-layer-field="${field}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event("change"));
    }
    root.querySelector<HTMLInputElement>("#tier-duration")!.value = "2";
    root
      .querySelector<HTMLInputElement>("#tier-duration")!
      .dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>("#add-font-text-layer")!.click();
    expect(root.querySelectorAll('[data-layer-field^="state-"]')).toHaveLength(
      0,
    );
    root.querySelector<HTMLButtonElement>('[data-tier="standard"]')!.click();
    expect(
      root.querySelector<HTMLSelectElement>("#existing-award-layer")!.value,
    ).toBe("layer-0");
    root.querySelector<HTMLButtonElement>("#reuse-award-layer")!.click();
    expect(
      [...root.querySelectorAll("article.card strong")].map(
        ({ textContent }) => textContent,
      ),
    ).toContain("layer-0");

    root.querySelector<HTMLButtonElement>('[data-tab="project"]')!.click();
    const preset = root.querySelector<HTMLSelectElement>(
      "#amount-format-preset",
    )!;
    preset.value = "decimal";
    preset.dispatchEvent(new Event("change"));
    expect(
      root.querySelector<HTMLInputElement>(
        '[data-project-field="fractionDigits"]',
      )!.value,
    ).toBe("2");
    expect(fractionDigits.value).toBe("3");
    expect(useGrouping.checked).toBe(true);
    expect(root.querySelector("#preview-build")).toBeNull();
    root.querySelector<HTMLButtonElement>("#preview-play")!.click();
    expect(root.querySelector("#preview-prompt")).toBeNull();
    expect(root.querySelector("#preview-node-kind")).toBeNull();
    expect(root.querySelector("#preview-node-apply")).toBeNull();
    expect(root.querySelector("#preview-node-reset")).toBeNull();
    expect(root.querySelector("#preview-advance")).toBeNull();
    expect(root.querySelector("#preview-dismiss")).toBeNull();
    expect(root.querySelector("#preview-clear")).toBeNull();
    expect(preview.play).toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>("#export-project")!.click();
    await vi.waitFor(() =>
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled(),
    );
    const { exportPopupZip } = await import("../src/io/popup-zip.js");
    const exportedProject = vi.mocked(exportPopupZip).mock.calls.at(-1)![0];
    expect(exportedProject.amountFormat.fractionDigits).toBe(2);
    expect(exportedProject).not.toHaveProperty("previewAmountFormat");
    app.destroy();
    expect(preview.destroy).toHaveBeenCalled();
  });

  it("auto-selects one VNI runtime and uses a select for multiple runtimes", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const resourceImport = await import("../src/io/resource-import.js");
    const inspect = vi.mocked(resourceImport.inspectVniBundleProfiles);
    const discover = vi.mocked(resourceImport.discoverPopupResources);
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
    createProject(root);
    const importer = root.querySelector<HTMLInputElement>("#import-assets")!;
    const zip = createDeterministicZip(
      new Map([["manifest.json", new TextEncoder().encode("{}")]]),
    );
    const importZip = async (name: string) => {
      Object.defineProperty(importer, "files", {
        value: [new File([zip.slice().buffer], name)],
        configurable: true,
      });
      importer.dispatchEvent(new Event("change"));
    };

    inspect.mockReturnValue([
      {
        id: "runtime_100",
        label: "100% 运行发布包",
        assetScale: 1,
        byteLength: 100,
      },
    ]);
    await importZip("single-runtime.zip");
    await vi.waitFor(() =>
      expect(
        (root.querySelector("#import-review") as HTMLDialogElement).open,
      ).toBe(true),
    );
    expect(
      (root.querySelector("#vni-runtime-choice") as HTMLDialogElement).open,
    ).toBe(false);
    expect(window.prompt).not.toHaveBeenCalled();
    expect(
      discover.mock.calls
        .at(-1)?.[1]
        ?.vniProfileSelections?.get("single-runtime.zip"),
    ).toBe("runtime_100");
    root.querySelector<HTMLButtonElement>("#review-cancel")!.click();

    inspect.mockReturnValue([
      {
        id: "runtime_100",
        label: "100% 运行发布包",
        assetScale: 1,
        byteLength: 100,
      },
      {
        id: "runtime_50",
        label: "50% 运行发布包",
        assetScale: 0.5,
        byteLength: 50,
      },
    ]);
    await importZip("multiple-runtimes.zip");
    const runtimeDialog = root.querySelector(
      "#vni-runtime-choice",
    ) as HTMLDialogElement;
    await vi.waitFor(() => expect(runtimeDialog.open).toBe(true));
    const select = root.querySelector<HTMLSelectElement>(
      "#vni-runtime-select",
    )!;
    expect([...select.options].map(({ value }) => value)).toEqual([
      "runtime_100",
      "runtime_50",
    ]);
    select.value = "runtime_50";
    root.querySelector<HTMLButtonElement>("#vni-runtime-confirm")!.click();
    await vi.waitFor(() =>
      expect(
        (root.querySelector("#import-review") as HTMLDialogElement).open,
      ).toBe(true),
    );
    expect(window.prompt).not.toHaveBeenCalled();
    expect(
      discover.mock.calls
        .at(-1)?.[1]
        ?.vniProfileSelections?.get("multiple-runtimes.zip"),
    ).toBe("runtime_50");
    app.destroy();
  });

  it("imports and edits a fixed Spine project with generic overlays", async () => {
    const { importPopupZip } = await import("../src/io/popup-zip.js");
    vi.mocked(importPopupZip).mockResolvedValueOnce(validSpineProject());
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
    const importer = root.querySelector<HTMLInputElement>("#import-project")!;
    Object.defineProperty(importer, "files", {
      value: [new File([new Uint8Array([1])], "spine-popup.zip")],
      configurable: true,
    });
    importer.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(importPopupZip).toHaveBeenCalled());
    root.querySelector<HTMLButtonElement>('[data-tab="tiers"]')!.click();
    expect(root.textContent).toContain("普通 Spine 弹窗");
    expect(root.querySelector("#project-type")).toBeNull();

    expect(root.querySelector("#spine-prompt-enabled")).toBeNull();
    expect(root.querySelector("#spine-prompt-font")).toBeNull();

    for (const resource of [
      "BG.PNG",
      "effect.json",
      "Spine.json",
      "image-string.manifest.json",
    ]) {
      const select = root.querySelector<HTMLSelectElement>(
        "#spine-overlay-resource",
      )!;
      select.value = resource;
      root.querySelector<HTMLButtonElement>("#add-spine-overlay")!.click();
    }
    root.querySelector<HTMLButtonElement>("#add-spine-font-text")!.click();
    const font = root.querySelector<HTMLSelectElement>("[data-overlay-font]")!;
    font.value = "Prompt.woff2";
    font.dispatchEvent(new Event("change"));
    expect(root.querySelectorAll("[data-delete-overlay]")).toHaveLength(5);

    const fontSize = root.querySelector<HTMLInputElement>(
      '[data-overlay-field="fontSize"]',
    )!;
    fontSize.focus();
    fontSize.value = "96";
    fontSize.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      root.querySelector<HTMLInputElement>('[data-overlay-field="fontSize"]'),
    ).toBe(fontSize);
    expect(document.activeElement).toBe(fontSize);

    const curved = root.querySelector<HTMLInputElement>(
      '[data-overlay-field="curvedEnabled"]',
    )!;
    curved.checked = true;
    curved.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      root.querySelector<HTMLInputElement>('[data-overlay-field="arcDegrees"]')!
        .value,
    ).toBe("30");

    const fillColor = root.querySelector<HTMLInputElement>(
      '[data-overlay-field="fillColor"]',
    )!;
    const fillPicker = root.querySelector<HTMLInputElement>(
      '[data-color-picker-owner="overlay"][data-color-picker-field="fillColor"]',
    )!;
    fillPicker.value = "#123456";
    fillPicker.dispatchEvent(new Event("input"));
    expect(fillColor.value).toBe("#123456");
    expect(font.value).toBe("Prompt.woff2");

    for (const field of ["strokeEnabled", "shadowEnabled"]) {
      const checkbox = root.querySelector<HTMLInputElement>(
        `[data-overlay-field="${field}"]`,
      )!;
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change"));
    }
    expect(root.querySelector("#diagnostics")!.textContent).not.toContain(
      "must be an object",
    );

    const imageId = root.querySelector<HTMLInputElement>(
      '[data-overlay-field="anchor-x"]',
    )!.dataset.overlayId!;
    const attachmentTarget = root.querySelector<HTMLSelectElement>(
      `[data-attachment-owner="overlay"][data-attachment-target-id="${imageId}"]`,
    )!;
    expect(attachmentTarget.textContent).toContain("主 Spine");
    attachmentTarget.value = "spine:main-spine";
    attachmentTarget.dispatchEvent(new Event("change"));
    const attachmentSlot = root.querySelector<HTMLSelectElement>(
      `[data-attachment-owner="overlay"][data-attachment-slot-id="${imageId}"]`,
    )!;
    expect([...attachmentSlot.options].map(({ value }) => value)).toEqual([
      "",
      "Value",
      "Background",
    ]);
    attachmentSlot.value = "Value";
    attachmentSlot.dispatchEvent(new Event("change"));
    expect(
      root.querySelector<HTMLSelectElement>(
        `[data-attachment-owner="overlay"][data-attachment-slot-id="${imageId}"]`,
      )!.value,
    ).toBe("Value");
    for (const [field, value] of [
      ["x", "11"],
      ["order", "12"],
      ["alpha", "0.7"],
      ["anchor-x", "0.25"],
    ]) {
      const input = root.querySelector<HTMLInputElement>(
        `[data-overlay-id="${imageId}"][data-overlay-field="${field}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event("change"));
    }
    const segment = root.querySelector<HTMLInputElement>(
      `[data-overlay-id="${imageId}"][data-overlay-field="state-end"]`,
    )!;
    segment.checked = false;
    segment.dispatchEvent(new Event("change"));
    const vniMode = root.querySelector<HTMLSelectElement>(
      "[data-overlay-vni-mode]",
    )!;
    vniMode.value = "once";
    vniMode.dispatchEvent(new Event("change"));
    expect(root.textContent).toContain("VNI once");
    const fill = root.querySelector<HTMLSelectElement>(
      "[data-overlay-fill-kind]",
    )!;
    fill.value = "linear-gradient";
    fill.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>("[data-delete-overlay]")!.click();
    app.destroy();
  });

  it("reports an unbound VNI as imported draft state instead of an import failure", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const resourceImport = await import("../src/io/resource-import.js");
    const inspect = vi.mocked(resourceImport.inspectVniBundleProfiles);
    const discover = vi.mocked(resourceImport.discoverPopupResources);
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
    createProject(root);
    const importer = root.querySelector<HTMLInputElement>("#import-assets")!;
    const zip = createDeterministicZip(
      new Map([["manifest.json", new TextEncoder().encode("{}")]]),
    );
    inspect.mockReturnValue([
      {
        id: "runtime_100",
        label: "100% 运行发布包",
        assetScale: 1,
        byteLength: 100,
      },
    ]);
    discover.mockResolvedValueOnce([
      {
        rootKey: "crave_bigwin.json",
        kind: "vni",
        primarySource: "crave_bigwin.zip:runtime_100/crave_bigwin.json",
        dependencyCount: 1,
        summary: "900×1600, 3.5s",
        spec: { kind: "vni", project: "crave_bigwin.json" },
        assets: [
          {
            ...asset,
            key: "crave_bigwin.json",
            bytes: new TextEncoder().encode(
              JSON.stringify({ stage: { duration: 3.5 }, assets: [] }),
            ),
          },
        ],
        exactKeys: ["crave_bigwin.json"],
        errors: [],
        profiles: [
          {
            id: "runtime_100",
            label: "100% 运行发布包",
            assetScale: 1,
            byteLength: 100,
          },
        ],
        selectedProfileId: "runtime_100",
      },
    ]);
    Object.defineProperty(importer, "files", {
      value: [new File([zip.slice().buffer], "crave_bigwin.zip")],
      configurable: true,
    });
    importer.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(
        (root.querySelector("#import-review") as HTMLDialogElement).open,
      ).toBe(true),
    );
    root.querySelector<HTMLButtonElement>("#review-confirm")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("#diagnostics")?.textContent).toContain(
        "资源导入成功。未绑定档位：crave_bigwin.json。",
      ),
    );
    expect(root.querySelector("#diagnostics")?.textContent).toContain(
      "项目尚未完成：base、standard、bigwin、superwin、megawin",
    );
    expect(root.querySelector("#diagnostics")?.textContent).not.toContain(
      "layers must be non-empty",
    );
    app.destroy();
  });

  it("recognizes a popup ZIP by sentinel through the same import entry", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
    const fractionDigits = root.querySelector<HTMLInputElement>(
      "#preview-fraction-digits",
    )!;
    const useGrouping = root.querySelector<HTMLInputElement>(
      "#preview-use-grouping",
    )!;
    fractionDigits.value = "2";
    fractionDigits.dispatchEvent(new Event("change"));
    useGrouping.checked = true;
    useGrouping.dispatchEvent(new Event("change"));
    const zip = createDeterministicZip(
      new Map([["popup.manifest.json", new TextEncoder().encode("{}")]]),
    );
    const { extractBoundedZip } =
      await import("@slotclientengine/browserartifactio");
    const { POPUP_ZIP_LIMITS } = await import("../src/io/resource-import.js");
    expect(
      extractBoundedZip(zip, { limits: POPUP_ZIP_LIMITS }).has(
        "popup.manifest.json",
      ),
    ).toBe(true);
    const importer = root.querySelector<HTMLInputElement>("#import-project")!;
    Object.defineProperty(importer, "files", {
      value: [new File([zip.slice().buffer], "project.zip")],
      configurable: true,
    });
    importer.dispatchEvent(new Event("change"));
    const { importPopupZip } = await import("../src/io/popup-zip.js");
    await vi.waitFor(() => expect(importPopupZip).toHaveBeenCalled());
    root.querySelector<HTMLButtonElement>('[data-tab="project"]')!.click();
    expect(root.querySelector<HTMLInputElement>("#project-id")?.value).toBe(
      "game-win",
    );
    expect(fractionDigits.value).toBe("2");
    expect(useGrouping.checked).toBe(true);
    expect(preview.setAmountFormat).toHaveBeenLastCalledWith({
      fractionDigits: 2,
      useGrouping: true,
    });
    root.querySelector<HTMLButtonElement>('[data-tab="tiers"]')!.click();
    expect(root.textContent).toContain("effect.json");
    expect(root.textContent).toContain("Spine.json");
    expect(root.textContent).toContain("BG.PNG");
    const textLayerId = root.querySelector<HTMLInputElement>(
      '[data-layer-field="fontSize"]',
    )!.dataset.layerId!;
    const textInput = (field: string) =>
      root.querySelector<HTMLInputElement>(
        `[data-layer-id="${textLayerId}"][data-layer-field="${field}"]`,
      )!;
    for (const [field, value] of [
      ["name", "congratulations"],
      ["defaultText", "YOU WIN!"],
      ["fontSize", "88"],
      ["letterSpacing", "2"],
      ["arcDegrees", "35"],
      ["strokeWidth", "8"],
      ["shadowAlpha", "0.8"],
      ["rotation", "5"],
    ]) {
      const input = textInput(field);
      input.value = value;
      input.dispatchEvent(new Event("change"));
    }
    const fillKind = root.querySelector<HTMLSelectElement>(
      `[data-layer-fill-kind="${textLayerId}"]`,
    )!;
    fillKind.value = "linear-gradient";
    fillKind.dispatchEvent(new Event("change"));
    for (const [field, value] of [
      ["fillColor", "#fff1a8"],
      ["gradientEndColor", "#ff9900"],
      ["gradientAngle", "45"],
      ["shadowDistance", "9"],
    ]) {
      const input = textInput(field);
      input.value = value;
      input.dispatchEvent(new Event("change"));
    }
    for (const field of ["strokeEnabled", "shadowEnabled"]) {
      const checkbox = textInput(field);
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change"));
    }
    expect(root.querySelector("#diagnostics")!.textContent).not.toContain(
      "must be an object",
    );
    const mode = root.querySelector<HTMLSelectElement>(
      "[data-vni-playback-mode]",
    )!;
    mode.value = "once";
    mode.dispatchEvent(new Event("change"));
    expect(root.textContent).toContain("完整单次 0–3s");
    expect(
      root.querySelector(
        `[data-layer-id="${mode.dataset.layerId}"][data-layer-field="loopStartTime"]`,
      ),
    ).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-tab="project"]')!.click();
    expect(root.textContent).toContain("game-win");
    expect(root.textContent).toContain('"mode": "once"');

    expect(root.querySelector("#project-type")).toBeNull();
    app.destroy();
  });
});

function structuredCloneCandidate() {
  return {
    ...candidate,
    spec: structuredClone(candidate.spec),
    assets: [{ ...asset, bytes: asset.bytes.slice() }],
    exactKeys: [...candidate.exactKeys],
    errors: [],
  };
}

function validProject() {
  const project = createPopupEditorProject();
  project.id = "game-win";
  project.resources.set(candidate.rootKey, {
    rootKey: candidate.rootKey,
    kind: candidate.kind,
    spec: structuredClone(candidate.spec),
    keys: [...candidate.exactKeys],
  });
  project.assets.set(asset.key, { ...asset, bytes: asset.bytes.slice() });
  for (const id of project.tiers.keys())
    addLayer(project, id, candidate.rootKey);
  project.resources.set("BG.PNG", {
    rootKey: "BG.PNG",
    kind: "image",
    spec: { kind: "image", path: "BG.PNG", size: { width: 10, height: 20 } },
    keys: ["BG.PNG"],
  });
  project.resources.set("effect.json", {
    rootKey: "effect.json",
    kind: "vni",
    spec: { kind: "vni", project: "effect.json" },
    keys: ["effect.json"],
  });
  project.resources.set("Spine.json", {
    rootKey: "Spine.json",
    kind: "spine",
    spec: {
      kind: "spine",
      skeleton: "Spine.json",
      atlas: "Spine.atlas",
      textures: { "Spine.png": "Spine.png" },
    },
    keys: ["Spine.json", "Spine.atlas", "Spine.png"],
  });
  const spineSkeleton = new TextEncoder().encode(
    JSON.stringify({
      skeleton: { spine: "4.3.23" },
      bones: [{ name: "root" }],
      slots: [
        { name: "Value", bone: "root" },
        { name: "Background", bone: "root" },
      ],
      skins: [{ name: "default", attachments: {} }],
      animations: { Start: {}, Loop: {}, End: {} },
    }),
  );
  project.assets.set("Spine.json", {
    ...asset,
    key: "Spine.json",
    byteLength: spineSkeleton.byteLength,
    bytes: spineSkeleton,
  });
  const spineAtlas = new TextEncoder().encode(
    "Spine.png\nsize:1,1\nfilter:Linear,Linear\n",
  );
  project.assets.set("Spine.atlas", {
    ...asset,
    key: "Spine.atlas",
    mediaType: "text/plain",
    byteLength: spineAtlas.byteLength,
    bytes: spineAtlas,
  });
  project.assets.set("Spine.png", {
    ...asset,
    key: "Spine.png",
    mediaType: "image/png",
    byteLength: 1,
    bytes: new Uint8Array([1]),
  });
  project.resources.set("Prompt.woff2", {
    rootKey: "Prompt.woff2",
    kind: "font",
    spec: { kind: "font", path: "Prompt.woff2" },
    keys: ["Prompt.woff2"],
  });
  project.assets.set("Prompt.woff2", {
    ...asset,
    key: "Prompt.woff2",
    mediaType: "font/woff2",
    bytes: new Uint8Array([0x77, 0x4f, 0x46, 0x32]),
  });
  project.assets.set("effect.json", {
    ...asset,
    key: "effect.json",
    byteLength: 24,
    bytes: new TextEncoder().encode(JSON.stringify({ stage: { duration: 3 } })),
  });
  addLayer(project, "base", "BG.PNG");
  addLayer(project, "base", "effect.json");
  addLayer(project, "base", "Spine.json");
  addLayer(project, "base", "Prompt.woff2");
  addLayer(project, "base", candidate.rootKey);
  return project;
}

function validSpineProject() {
  const project = validProject();
  project.type = "spine";
  project.backdrop.visibleStates = ["start", "loop", "end"];
  project.spine.resource = "Spine.json";
  project.spine.playback = {
    startAnimation: "Start",
    loopAnimation: "Loop",
    endAnimation: "End",
  };
  return project;
}
