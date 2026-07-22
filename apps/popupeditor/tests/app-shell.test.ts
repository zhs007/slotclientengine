import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addLayer, createPopupEditorProject } from "../src/model/project.js";

const preview = {
  init: vi.fn(async () => {}),
  destroy: vi.fn(),
  rebuild: vi.fn(async () => {}),
  setInput: vi.fn(),
  play: vi.fn(),
  advance: vi.fn(),
  dismiss: vi.fn(),
  dismissImmediately: vi.fn(),
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
    commitImportReview: vi.fn(async (project) => {
      project.resources.set(candidate.rootKey, {
        rootKey: candidate.rootKey,
        kind: candidate.kind,
        spec: structuredClone(candidate.spec),
        keys: [...candidate.exactKeys],
      });
      project.assets.set(asset.key, { ...asset, bytes: asset.bytes.slice() });
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

  it("uses one flat import entry, reviews atomically, and drives tiers and preview", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
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
    root.querySelector<HTMLButtonElement>("#preview-build")!.click();
    await vi.waitFor(() => expect(preview.rebuild).toHaveBeenCalled());
    root.querySelector<HTMLButtonElement>("#preview-play")!.click();
    root.querySelector<HTMLButtonElement>("#preview-advance")!.click();
    root.querySelector<HTMLButtonElement>("#preview-dismiss")!.click();
    root.querySelector<HTMLButtonElement>("#preview-clear")!.click();
    expect(preview.play).toHaveBeenCalled();
    expect(preview.advance).toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>("#export-project")!.click();
    await vi.waitFor(() =>
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled(),
    );
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

  it("recognizes a popup ZIP by sentinel through the same import entry", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
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
    const importer = root.querySelector<HTMLInputElement>("#import-assets")!;
    Object.defineProperty(importer, "files", {
      value: [new File([zip.slice().buffer], "project.zip")],
      configurable: true,
    });
    importer.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(window.confirm).toHaveBeenCalled());
    root.querySelector<HTMLButtonElement>('[data-tab="tiers"]')!.click();
    expect(root.textContent).toContain("effect.json");
    expect(root.textContent).toContain("Spine.json");
    expect(root.textContent).toContain("BG.PNG");
    root.querySelector<HTMLButtonElement>('[data-tab="project"]')!.click();
    expect(root.textContent).toContain("game-win");
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
  project.assets.set("effect.json", {
    ...asset,
    key: "effect.json",
    byteLength: 24,
    bytes: new TextEncoder().encode(JSON.stringify({ stage: { duration: 3 } })),
  });
  addLayer(project, "base", "BG.PNG");
  addLayer(project, "base", "effect.json");
  addLayer(project, "base", "Spine.json");
  return project;
}
