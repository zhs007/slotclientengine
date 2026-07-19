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
    root.querySelector<HTMLButtonElement>('[data-tab="tiers"]')!.click();
    root.querySelector<HTMLButtonElement>("[data-add-layer]")!.click();
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
    const segment = root.querySelector<HTMLInputElement>(
      '[data-layer-field="segment-start"]',
    )!;
    segment.checked = false;
    segment.dispatchEvent(new Event("change"));
    root.querySelector<HTMLInputElement>("#tier-duration")!.value = "2";
    root
      .querySelector<HTMLInputElement>("#tier-duration")!
      .dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>('[data-tab="project"]')!.click();
    expect(root.textContent).toContain("Production manifest preview");
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
