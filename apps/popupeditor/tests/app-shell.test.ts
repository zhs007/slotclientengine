import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupEditorProject, addLayer } from "../src/model/project.js";

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
const candidate = {
  proposedId: "amount",
  kind: "image-string" as const,
  primarySource: "amount.zip",
  dependencyCount: 1,
  summary: "13 glyphs",
  provenance: {
    sourceNames: ["amount.zip"],
    sourceKind: "zip" as const,
    batchLabel: "test",
  },
  spec: {
    kind: "image-string" as const,
    manifest: "dependencies/image-strings/amount/image-string.manifest.json",
  },
  files: new Map([
    [
      "dependencies/image-strings/amount/image-string.manifest.json",
      new Uint8Array([1]),
    ],
  ]),
  blobs: [],
  errors: [],
};

vi.mock("../src/preview/popup-preview.js", () => ({
  PopupPreview: class {
    constructor() {
      return preview;
    }
  },
}));
vi.mock("../src/io/resource-import.js", async (original) => ({
  ...(await original<typeof import("../src/io/resource-import.js")>()),
  discoverPopupResources: vi.fn(async () => [structuredCloneCandidate()]),
}));
vi.mock("../src/io/popup-zip.js", () => ({
  exportPopupZip: vi.fn(async () => ({
    fileName: "test-popup.zip",
    bytes: new Uint8Array([1]),
    blob: new Blob([new Uint8Array([1])]),
  })),
  importPopupZip: vi.fn(() => validProject()),
}));

describe("PopupEditorApp", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.clearAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  it("renders workspaces, reviews before commit, edits tiers, and drives production preview controls", async () => {
    const { PopupEditorApp } = await import("../src/ui/app-shell.js");
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new PopupEditorApp(root);
    await app.init();
    expect(root.textContent).toContain("Popup Award Celebration Editor");
    expect(root.querySelectorAll('.primary-tabs [role="tab"]')).toHaveLength(3);
    expect(
      root
        .querySelector('[data-tab="resources"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(root.querySelector("header #upload-files")).toBeNull();
    expect(root.querySelector("#workspace #upload-files")).not.toBeNull();
    const upload = root.querySelector<HTMLInputElement>("#upload-files")!;
    Object.defineProperty(upload, "files", {
      value: [new File([new Uint8Array([1])], "amount.zip")],
      configurable: true,
    });
    upload.dispatchEvent(new Event("change"));
    await tick();
    expect(
      (root.querySelector("#import-review") as HTMLDialogElement).open,
    ).toBe(true);
    root.querySelector<HTMLButtonElement>("#review-confirm")!.click();
    expect(root.textContent).toContain("amount");
    expect(root.textContent).toContain("5 个图层绑定");
    const replacement = root.querySelector<HTMLInputElement>(
      '[data-replace-resource="amount"]',
    )!;
    Object.defineProperty(replacement, "files", {
      value: [new File([new Uint8Array([2])], "replacement.zip")],
      configurable: true,
    });
    replacement.dispatchEvent(new Event("change"));
    await tick();
    root.querySelector<HTMLButtonElement>("#review-confirm")!.click();
    expect(root.textContent).toContain("5 个图层绑定");
    root.querySelector<HTMLButtonElement>('[data-tab="tiers"]')!.click();
    expect(root.querySelector("#upload-files")).toBeNull();
    expect(
      root.querySelector('[data-tab="tiers"]')?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      [...root.querySelectorAll<HTMLButtonElement>("[data-tier]")].map(
        (button) => button.querySelector("small")?.textContent,
      ),
    ).toEqual(Array.from({ length: 5 }, () => "1 层"));
    expect(root.querySelector(".tier-tabs")?.getAttribute("role")).toBe(
      "tablist",
    );
    expect(
      [...root.querySelectorAll<HTMLInputElement>("[data-threshold-tier]")].map(
        (input) => Number(input.value),
      ),
    ).toEqual([15, 25, 50]);
    expect(root.querySelector("#tier-boundaries")?.textContent).toContain(
      "raw 0→100→1500→2500→5000",
    );
    expect(root.querySelector("#tier-boundaries")?.textContent).toContain(
      "显示为 0→100→1500→2500→5000",
    );
    expect(root.textContent).toContain("amount-0");
    root.querySelector<HTMLButtonElement>("[data-add-layer]")!.click();
    expect(root.querySelectorAll("[data-delete-layer]")).toHaveLength(1);
    expect(root.textContent).toContain("amount-0");
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
    expect(root.textContent).toContain("五档共享一个 runtime");
    root.querySelector<HTMLInputElement>("#tier-duration")!.value = "2";
    root
      .querySelector<HTMLInputElement>("#tier-duration")!
      .dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>('[data-tab="project"]')!.click();
    expect(root.textContent).toContain("Production manifest preview");
    expect(root.querySelector("#workspace #import-project")).not.toBeNull();
    expect(root.querySelector("header #import-project")).toBeNull();
    expect(root.textContent).not.toContain("尚未形成合法 production manifest");
    const preset = root.querySelector<HTMLSelectElement>(
      "#amount-format-preset",
    )!;
    expect(preset.value).toBe("integer");
    preset.value = "decimal";
    preset.dispatchEvent(new Event("change"));
    expect(
      root.querySelector<HTMLSelectElement>("#amount-format-preset")!.value,
    ).toBe("decimal");
    expect(
      root.querySelector<HTMLInputElement>(
        '[data-project-field="fractionDigits"]',
      )!.value,
    ).toBe("2");
    expect(
      root.querySelector<HTMLInputElement>('[data-project-field="prefix"]')!
        .value,
    ).toBe("");
    for (const [field, value] of [
      ["viewport-width", "900"],
      ["rawScale", "10"],
      ["prefix", "USD "],
    ]) {
      const input = root.querySelector<HTMLInputElement>(
        `[data-project-field="${field}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event("change"));
    }
    const grouping = root.querySelector<HTMLInputElement>(
      '[data-project-field="useGrouping"]',
    )!;
    grouping.checked = false;
    grouping.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>("#preview-build")!.click();
    await tick();
    root.querySelector<HTMLButtonElement>("#preview-play")!.click();
    root.querySelector<HTMLButtonElement>("#preview-advance")!.click();
    root.querySelector<HTMLButtonElement>("#preview-dismiss")!.click();
    root.querySelector<HTMLButtonElement>("#preview-clear")!.click();
    expect(preview.rebuild).toHaveBeenCalled();
    expect(preview.play).toHaveBeenCalled();
    expect(preview.advance).toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>("#export-project")!.click();
    await tick();
    const importer = root.querySelector<HTMLInputElement>("#import-project")!;
    Object.defineProperty(importer, "files", {
      value: [new File([new Uint8Array([1])], "project.zip")],
      configurable: true,
    });
    importer.dispatchEvent(new Event("change"));
    await tick();
    expect(root.textContent).toContain("game-win");
    app.destroy();
    expect(preview.destroy).toHaveBeenCalled();
  });
});

function structuredCloneCandidate() {
  return {
    ...candidate,
    proposedId: candidate.proposedId,
    provenance: {
      ...candidate.provenance,
      sourceNames: [...candidate.provenance.sourceNames],
    },
    files: new Map(
      [...candidate.files].map(([path, bytes]) => [path, bytes.slice()]),
    ),
    blobs: [],
    errors: [],
  };
}
function validProject() {
  const project = createPopupEditorProject();
  project.id = "game-win";
  project.resources.set("amount", {
    id: "amount",
    kind: "image-string",
    provenance: {
      sourceNames: [],
      sourceKind: "package-import",
      batchLabel: "test",
    },
    spec: candidate.spec,
    paths: [...candidate.files.keys()],
  });
  for (const [path, bytes] of candidate.files)
    project.packageFiles.set(path, bytes);
  for (const id of project.tiers.keys()) addLayer(project, id, "amount");
  return project;
}
async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
