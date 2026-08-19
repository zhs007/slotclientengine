import { describe, expect, it, vi } from "vitest";
import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  createEditorAssetWorkspace,
  createEditorAssetsMapFromWorkspace,
  createEmptyEditorAssetWorkspace,
  materializeEditorAssetPayloads,
  serializeEditorAssetsMap,
} from "@slotclientengine/editorresource";
import {
  DEFAULT_EDITOR_ASSET_INGESTION_LIMITS,
  discoverDefaultEditorAssets,
  createDefaultEditorAssetsController,
  ingestAndDiscoverDefaultEditorAssets,
} from "../src/assets/adapters/index.js";
import { mergeEditorAssetCatalog } from "../src/assets/core/index.js";
import type {
  EditorAssetHostAdapter,
  EditorAssetRootDraft,
} from "../src/assets/data/index.js";
import { mountEditorAssetsView } from "../src/assets/ui/index.js";

describe("default adapters", () => {
  it("allows compressed ZIP sources to reach the stricter payload limits", () => {
    expect(DEFAULT_EDITOR_ASSET_INGESTION_LIMITS.files.maxFileBytes).toBe(
      DEFAULT_EDITOR_ASSET_INGESTION_LIMITS.zip.maxCompressedBytes,
    );
    expect(DEFAULT_EDITOR_ASSET_INGESTION_LIMITS.zip.maxFileBytes).toBe(
      50 * 1024 * 1024,
    );
  });

  it("discovers supported atomic image, audio, and video signatures", async () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 1]);
    const mp4 = new Uint8Array(12);
    mp4.set(new TextEncoder().encode("ftyp"), 4);
    const result = await discoverDefaultEditorAssets({
      sources: [
        loose("coin.png", PNG),
        loose("win.mp3", mp3),
        loose("intro.mp4", mp4),
      ],
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts.map(({ kind }) => kind)).toEqual([
      "image",
      "audio",
      "video",
    ]);

    const invalid = await discoverDefaultEditorAssets({
      sources: [loose("bad.mp3", new Uint8Array([1, 2, 3]))],
    });
    expect(invalid.blockingErrors[0]).toMatch(/signature/u);
  });

  it("discovers a loose VNI project and rewrites its image to a flat key", async () => {
    const result = await discoverDefaultEditorAssets({
      sources: [
        loose("project.json", encode(vniProject("runtime", "runtime"))),
        loose("spark.png", PNG),
      ],
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      kind: "vni",
      key: "project.json",
      exactKeys: ["project.json", "spark.png"],
    });
  });

  it("ingests a mapped ImgNumber ZIP through the single public importer", async () => {
    const manifest = {
      version: 1,
      kind: "image-string",
      id: "digits",
      metrics: { lineHeight: 10, letterSpacing: 0 },
      glyphs: {
        "0": {
          path: "0.png",
          size: { width: 5, height: 10 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    };
    const entries = await mappedEntries([
      { key: "0.png", mediaType: "image/png", bytes: PNG },
    ]);
    entries.set("image-string.manifest.json", encode(manifest));
    const zip = createDeterministicZip(entries);
    const result = await ingestAndDiscoverDefaultEditorAssets({
      files: [source("digits.zip", zip)],
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      kind: "image-string",
      key: "digits-image-string.manifest.json",
    });
    expect(result.drafts[0]!.exactKeys).toEqual([
      "digits-image-string.manifest.json",
      "digits-0.png",
    ]);
  });

  it("requires an explicit runtime profile for a multi-profile VNI ZIP", async () => {
    const entries = vniBundleEntries();
    const sources = zipSources("effects.zip", entries);
    const pending = await discoverDefaultEditorAssets({ sources });
    expect(pending.drafts).toEqual([]);
    expect(pending.profiles.map(({ id }) => id)).toEqual([
      "runtime_100",
      "runtime_50",
    ]);
    expect(pending.blockingErrors[0]).toMatch(/必须明确选择/u);

    const selected = await discoverDefaultEditorAssets({
      sources,
      profileSelections: { "effects.zip": "runtime_50" },
    });
    expect(selected.blockingErrors).toEqual([]);
    expect(selected.drafts[0]).toMatchObject({
      kind: "vni",
      owner: "vni-runtime_50",
    });
  });

  it("discovers a mapped Popup package and keeps its Spine closure internal", async () => {
    const skeleton = encode({
      skeleton: { spine: "4.3.23" },
      slots: [{ name: "coin" }],
      animations: { Start: {}, Idle: {}, End: {} },
    });
    const atlas = new TextEncoder().encode(
      "page.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n",
    );
    const entries = await mappedEntries([
      { key: "hero.json", mediaType: "application/json", bytes: skeleton },
      { key: "hero.atlas", mediaType: "text/plain", bytes: atlas },
      { key: "page.png", mediaType: "image/png", bytes: PNG },
    ]);
    entries.set(
      "popup.manifest.json",
      encode({
        version: 1,
        kind: "popup",
        id: "demo-popup",
        type: "spine",
        designViewport: { width: 100, height: 100 },
        resources: {
          "hero.json": {
            kind: "spine",
            skeleton: "hero.json",
            atlas: "hero.atlas",
            textures: { "page.png": "page.png" },
          },
        },
        spine: {
          resource: "hero.json",
          transform: { x: 0, y: 0, scale: 1 },
          playback: {
            mode: "segmented-animations",
            startAnimation: "Start",
            loopAnimation: "Idle",
            endAnimation: "End",
          },
        },
      }),
    );
    const result = await discoverDefaultEditorAssets({
      sources: zipSources("popup.zip", entries),
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({ kind: "popup" });
    expect(result.drafts[0]!.nodes.some(({ kind }) => kind === "atlas")).toBe(
      true,
    );
    expect(
      result.drafts[0]!.relations.some(({ kind }) => kind === "uses-texture"),
    ).toBe(true);
  });

  it("discovers and namespaces a strict mapped Symbols package", async () => {
    const packageManifest = {
      version: 1,
      kind: "symbol-package",
      id: "demo-symbols",
      cellSize: { width: 100, height: 100 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["A.png"],
    };
    const entries = await mappedEntries([
      {
        key: "gameconfig.json",
        mediaType: "application/json",
        bytes: encode({
          paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
          symbolCodes: { A: 0 },
          reels: { main: [[0]] },
        }),
      },
      {
        key: "symbol-state-textures.manifest.json",
        mediaType: "application/json",
        bytes: encode({
          version: 1,
          states: [],
          symbols: { A: { normal: "./A.png", scale: 1 } },
        }),
      },
      { key: "A.png", mediaType: "image/png", bytes: PNG },
    ]);
    entries.set("symbols.package.json", encode(packageManifest));
    const result = await discoverDefaultEditorAssets({
      sources: zipSources("symbols.zip", entries),
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      kind: "symbols",
      key: "demo-symbols-symbols.package.json",
    });
    expect(result.drafts[0]!.exactKeys).toContain("demo-symbols-A.png");
  });

  it("binds Spine skeleton -> atlas -> page during prepare", async () => {
    const skeleton = new TextEncoder().encode(
      JSON.stringify({
        skeleton: { spine: "4.3.23" },
        slots: [{ name: "coin" }],
        animations: { Idle: {} },
      }),
    );
    const atlas = new TextEncoder().encode(
      "page.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n",
    );
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const result = await discoverDefaultEditorAssets({
      sources: [
        loose("hero.json", skeleton),
        loose("hero.atlas", atlas),
        loose("page.png", png),
      ],
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({ kind: "spine", key: "hero.json" });
    expect(result.drafts[0]!.relations.map(({ kind }) => kind)).toEqual([
      "contains",
      "uses-atlas",
      "uses-texture",
    ]);
  });

  it("rejects unknown loose JSON instead of treating it as a generic asset", async () => {
    const result = await discoverDefaultEditorAssets({
      sources: [loose("unknown.json", new TextEncoder().encode("{}"))],
    });
    expect(result.drafts).toEqual([]);
    expect(result.blockingErrors[0]).toMatch(/无法识别 JSON/u);
  });
});

describe("EditorAssetsView", () => {
  it("virtualizes a 10,000-root tree and destroys its DOM", () => {
    const drafts = Array.from({ length: 10_000 }, (_, index) =>
      atomicDraft(`asset-${String(index).padStart(5, "0")}.png`),
    );
    const catalog = mergeEditorAssetCatalog(
      { roots: new Map(), nodes: new Map(), relations: [] },
      drafts,
    );
    const host: EditorAssetHostAdapter<{ programs: Record<string, string> }> = {
      cloneProject: structuredClone,
      collectReferences: () => [],
      collectProgramBindings: () => [],
      renameReferences: (project) => project,
      setProgramBinding: (project) => project,
    };
    const controller = createDefaultEditorAssetsController({
      project: { programs: {} },
      host,
      initial: {
        catalog,
        workspace: createEmptyEditorAssetWorkspace(),
        project: { programs: {} },
      },
    });
    const root = document.createElement("div");
    document.body.append(root);
    const view = mountEditorAssetsView({ controller, root });
    expect(root.querySelectorAll(".editor-assets-row").length).toBeLessThan(40);
    expect(root.textContent).toContain("10000 roots");
    view.destroy();
    expect(root.childElementCount).toBe(0);
  });

  it("supports selection, preview, keyboard expansion, filters, binding, and deletion", async () => {
    const controller = createTestController();
    const prepared = await controller.prepareImport([source("coin.png", PNG)]);
    await controller.commitImport(prepared);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:coin");
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const root = document.createElement("div");
    document.body.append(root);
    const view = mountEditorAssetsView({ controller, root });

    click(required(root, "[data-select]"));
    expect(
      root.querySelector<HTMLImageElement>(".editor-assets-preview")?.src,
    ).toContain("blob:coin");
    const program = required<HTMLInputElement>(root, "[data-program-name]");
    program.value = "coin";
    click(required(root, "[data-program-save]"));
    await flush();
    expect(controller.snapshot.project.programs).toEqual({ coin: "coin.png" });
    expect(root.textContent).toContain("程序 binding 已保存");

    const tree = required<HTMLElement>(root, ".editor-assets-tree");
    tree.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(root.querySelectorAll(".editor-assets-row")).toHaveLength(2);
    click(root.querySelectorAll<HTMLElement>("[data-select]")[1]!);
    expect(root.textContent).toContain("内部 leaf 只读");

    const search = required<HTMLInputElement>(root, "[data-assets-search]");
    search.value = "missing";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelectorAll(".editor-assets-row")).toHaveLength(0);
    search.value = "coin";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelectorAll(".editor-assets-row").length).toBeGreaterThan(
      0,
    );

    click(required(root, "[data-select]"));
    required<HTMLInputElement>(root, "[data-program-name]").value = "";
    click(required(root, "[data-program-save]"));
    await flush();
    click(required(root, "[data-root-delete]"));
    await flush();
    expect(controller.snapshot.catalog.roots.size).toBe(0);
    view.destroy();
    expect(createUrl).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith("blob:coin");
  });

  it("runs import prepare, review, commit, and cancel from the single file input", async () => {
    const controller = createTestController();
    const root = document.createElement("div");
    document.body.append(root);
    mountEditorAssetsView({ controller, root });
    const input = required<HTMLInputElement>(root, "[data-assets-input]");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [source("first.png", PNG)],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(
      root.querySelector("[data-assets-review]")?.hasAttribute("hidden"),
    ).toBe(false);
    click(required(root, "[data-review-commit]"));
    await flush();
    expect(controller.snapshot.catalog.roots.has("first.png")).toBe(true);

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [source("second.png", PNG)],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    click(required(root, "[data-review-cancel]"));
    expect(controller.snapshot.catalog.roots.has("second.png")).toBe(false);
    expect(root.textContent).toContain("已取消导入");
  });
});

function loose(sourcePath: string, bytes: Uint8Array) {
  return {
    sourcePath,
    key: sourcePath,
    bytes,
    container: "file" as const,
    containerName: sourcePath,
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function source(name: string, bytes: Uint8Array) {
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    },
  };
}

async function mappedEntries(
  inputs: readonly { key: string; mediaType: string; bytes: Uint8Array }[],
): Promise<Map<string, Uint8Array>> {
  const workspace = await createEditorAssetWorkspace(inputs);
  const map = createEditorAssetsMapFromWorkspace(workspace);
  return new Map([
    ...materializeEditorAssetPayloads(workspace),
    [EDITOR_ASSETS_MAP_PATH, serializeEditorAssetsMap(map)] as const,
  ]);
}

function zipSources(
  containerName: string,
  entries: ReadonlyMap<string, Uint8Array>,
) {
  return [...entries].map(([sourcePath, bytes]) => ({
    sourcePath,
    key: sourcePath.replace(/^.*\//u, ""),
    bytes,
    container: "zip" as const,
    containerName,
  }));
}

function vniBundleEntries(): Map<string, Uint8Array> {
  const exports = [
    {
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
      path: "runtime_100/project.json",
      label: "100%",
    },
    {
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
      path: "runtime_50/project.json",
      label: "50%",
    },
  ];
  return new Map([
    [
      "manifest.json",
      encode({ type: "vni_export_bundle", version: "VNI_0.087", exports }),
    ],
    ["runtime_100/project.json", encode(vniProject("runtime_100", "runtime"))],
    ["runtime_100/assets/spark.png", PNG],
    ["runtime_50/project.json", encode(vniProject("runtime_50", "runtime"))],
    ["runtime_50/assets/spark.png", PNG],
  ]);
}

function vniProject(id: string, purpose: "editing" | "runtime") {
  return {
    schemaVersion: "VNI_0.087",
    editor: { name: "VNI", version: "VNI_0.087" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "spark",
    stage: {
      width: 100,
      height: 100,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "spark",
        type: "image",
        path: "assets/spark.png",
        originalName: "spark.png",
        width: 1,
        height: 1,
        fileWidth: 1,
        fileHeight: 1,
        fileScale: 1,
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
    exportProfile: { id, purpose, assetScale: id === "runtime_50" ? 0.5 : 1 },
    maskCompositeMode: "precompose_light_alpha",
  };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function atomicDraft(key: string): EditorAssetRootDraft {
  const rootId = `root:image:${key}`;
  return {
    key,
    kind: "image",
    nodeId: rootId,
    owner: `image:${key}`,
    exactKeys: [key],
    inputs: [],
    nodes: [
      { id: rootId, kind: "image", key, label: key, metadata: {} },
      { id: `file:${key}`, kind: "texture", key, label: key, metadata: {} },
    ],
    relations: [{ from: rootId, to: `file:${key}`, kind: "uses-payload" }],
  };
}

function createTestController() {
  const host: EditorAssetHostAdapter<{ programs: Record<string, string> }> = {
    cloneProject: structuredClone,
    collectReferences: () => [],
    collectProgramBindings: (project) =>
      Object.entries(project.programs).map(([name, rootKey]) => ({
        name,
        rootKey,
        location: `programs.${name}`,
      })),
    renameReferences: (project) => project,
    setProgramBinding: (project, rootKey, name) => ({
      programs: name ? { [name]: rootKey } : {},
    }),
  };
  return createDefaultEditorAssetsController({
    project: { programs: {} },
    host,
  });
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`test missing ${selector}`);
  return element;
}

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
