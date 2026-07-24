import {
  createDeterministicZip,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import {
  EDITOR_ASSETS_MAP_PATH,
  assertEditorAdapterProfilesChosen,
  assertEditorAssetKey,
  assertUniqueEditorAssetKeys,
  basenameFromSourcePath,
  chooseEditorAdapterProfile,
  cloneEditorAssetWorkspace,
  commitEditorAssetImport,
  createEditorAssetEntry,
  createEditorAssetsMapFromWorkspace,
  createEmptyEditorAssetWorkspace,
  decodeEditorAssetsMap,
  deleteEditorAsset,
  discoverEditorAdapterCandidates,
  editorAssetKeyCollisionToken,
  exactEditorAssetClosure,
  ingestEditorResourceSources,
  materializeEditorAssetPayloads,
  normalizeEditorPackageZipEntries,
  parseEditorAssetsMap,
  renameEditorAsset,
  resolveEditorAssetMapEntry,
  resolveEditorAssetsMapPackage,
  reviewEditorAssetImport,
  serializeEditorAssetsMap,
  validateEditorAssetsMapPackage,
  type EditorAssetRewriteAdapter,
  type EditorAssetWorkspace,
  type EditorImportReview,
  type EditorReferenceGraph,
} from "../src/index.js";

const bytes = (...values: number[]) => new Uint8Array(values);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1);
const OTHER_PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 2);

interface Project {
  refs: string[];
  valid?: boolean;
}

const adapter: EditorAssetRewriteAdapter<Project> = {
  cloneProject: (project) => structuredClone(project),
  collectReferences: (project) => ({
    references: project.refs.map((key, index) => ({
      key,
      location: `refs[${index}]`,
    })),
  }),
  renameReferences: (project, from, to) => ({
    ...project,
    refs: project.refs.map((key) => (key === from ? to : key)),
  }),
  validateProject: (project, workspace) => {
    if (project.valid === false) throw new Error("project validation failed");
    for (const key of project.refs)
      if (!workspace.entries.has(key)) throw new Error(`missing ${key}`);
  },
};

async function committed(
  inputs: readonly { key: string; mediaType: string; bytes: Uint8Array }[],
  project: Project = { refs: [] },
): Promise<{
  workspace: EditorAssetWorkspace;
  project: Project;
  review: EditorImportReview;
}> {
  const empty = createEmptyEditorAssetWorkspace();
  const review = await reviewEditorAssetImport({
    workspace: empty,
    incoming: inputs,
  });
  const result = await commitEditorAssetImport({
    workspace: empty,
    project,
    review,
    adapter,
  });
  return { ...result, review };
}

describe("filename key contract", () => {
  it("preserves legal basename spelling and Unicode NFC", () => {
    for (const key of ["BG.jpg", "my glyph_1.png", "中奖.png", "a.b.json"])
      expect(assertEditorAssetKey(key)).toBe(key);
    expect(editorAssetKeyCollisionToken("BG.jpg")).toBe("bg.jpg");
    expect(basenameFromSourcePath("nested/BG.jpg")).toBe("BG.jpg");
    expect(basenameFromSourcePath("nested\\BG.jpg")).toBe("BG.jpg");
  });

  it.each([
    "",
    ".",
    "..",
    "folder/a.png",
    "folder\\a.png",
    "a\0.png",
    "a\n.png",
    "noext",
    ".png",
  ])("rejects illegal key %j", (key) =>
    expect(() => assertEditorAssetKey(key)).toThrow(),
  );

  it("rejects non-NFC and case-fold collisions", () => {
    expect(() => assertEditorAssetKey("e\u0301.png")).toThrow(/NFC/u);
    expect(() => assertUniqueEditorAssetKeys(["BG.jpg", "bg.jpg"])).toThrow(
      /collision/u,
    );
    expect(assertUniqueEditorAssetKeys(["BG.jpg", "中奖.png"])).toEqual([
      "BG.jpg",
      "中奖.png",
    ]);
  });
});

describe("assets.map.json", () => {
  it("serializes deterministically and resolves deduplicated payloads", async () => {
    const { workspace } = await committed([
      { key: "B.png", mediaType: "image/png", bytes: PNG },
      { key: "A.png", mediaType: "image/png", bytes: PNG },
    ]);
    const map = createEditorAssetsMapFromWorkspace(workspace);
    const encoded = serializeEditorAssetsMap(map);
    expect(decodeEditorAssetsMap(encoded)).toEqual(map);
    expect(Object.keys(map.files)).toEqual(["A.png", "B.png"]);
    expect(map.files["A.png"]!.path).toBe(map.files["B.png"]!.path);
    const payloads = materializeEditorAssetPayloads(workspace);
    expect(payloads.size).toBe(1);
    const packageFiles = new Map(payloads);
    packageFiles.set(EDITOR_ASSETS_MAP_PATH, encoded);
    const resolved = await validateEditorAssetsMapPackage({
      map,
      files: packageFiles,
    });
    expect([...resolved.keys()]).toEqual(["A.png", "B.png"]);
    expect(resolveEditorAssetMapEntry(map, "A.png").sha256).toHaveLength(64);
    expect(() => resolveEditorAssetMapEntry(map, "missing.png")).toThrow(
      /未声明/u,
    );
  });

  it("uses canonical jpg payload extension for a jpeg key", async () => {
    const entry = await createEditorAssetEntry({
      key: "Photo.JPEG",
      mediaType: "image/jpeg",
      bytes: bytes(0xff, 0xd8, 1),
    });
    expect(entry.payloadPath).toMatch(/\.jpg$/u);
  });

  it.each([
    null,
    {},
    { version: 2, kind: "editor-assets", files: {} },
    { version: 1, kind: "bad", files: {} },
    { version: 1, kind: "editor-assets", files: [], extra: true },
  ])("rejects malformed root %#", (value) => {
    expect(() => parseEditorAssetsMap(value)).toThrow();
  });

  it("rejects bad entries and unknown fields", () => {
    const digest = "a".repeat(64);
    const base = {
      path: `assets/${digest}.png`,
      sha256: digest,
      mediaType: "image/png",
      byteLength: 1,
    };
    const root = (entry: unknown) => ({
      version: 1,
      kind: "editor-assets",
      files: { "A.png": entry },
    });
    expect(() => parseEditorAssetsMap(root({ ...base, extra: true }))).toThrow(
      /fields/u,
    );
    expect(() =>
      parseEditorAssetsMap(root({ ...base, sha256: "bad" })),
    ).toThrow(/SHA-256/u);
    expect(() => parseEditorAssetsMap(root({ ...base, path: 4 }))).toThrow(
      /path/u,
    );
    expect(() =>
      parseEditorAssetsMap(root({ ...base, path: `assets/${digest}.jpg` })),
    ).toThrow(/不一致/u);
    expect(() =>
      parseEditorAssetsMap(root({ ...base, mediaType: "bad" })),
    ).toThrow(/mediaType/u);
    expect(() =>
      parseEditorAssetsMap(root({ ...base, byteLength: -1 })),
    ).toThrow(/byteLength/u);
    expect(() =>
      parseEditorAssetsMap({
        version: 1,
        kind: "editor-assets",
        files: { "A.png": base, "a.png": base },
      }),
    ).toThrow(/collision/u);
  });

  it("rejects missing, corrupt and orphan payloads", async () => {
    const { workspace } = await committed([
      { key: "A.png", mediaType: "image/png", bytes: PNG },
    ]);
    const map = createEditorAssetsMapFromWorkspace(workspace);
    await expect(
      validateEditorAssetsMapPackage({ map, files: new Map() }),
    ).rejects.toThrow(/缺失/u);
    const path = map.files["A.png"]!.path;
    await expect(
      validateEditorAssetsMapPackage({
        map,
        files: new Map([[path, bytes(1)]]),
      }),
    ).rejects.toThrow(/byteLength/u);
    const sameLength = PNG.slice();
    sameLength[sameLength.length - 1] = 9;
    await expect(
      validateEditorAssetsMapPackage({
        map,
        files: new Map([[path, sameLength]]),
      }),
    ).rejects.toThrow(/SHA-256/u);
    await expect(
      validateEditorAssetsMapPackage({
        map,
        files: new Map([
          [path, PNG],
          [`assets/${"b".repeat(64)}.png`, PNG],
        ]),
      }),
    ).rejects.toThrow(/orphan/u);
    await expect(
      validateEditorAssetsMapPackage({
        map,
        files: new Map([
          [path, PNG],
          ["unknown.json", bytes(1)],
        ]),
      }),
    ).rejects.toThrow(/control file/u);
    await expect(
      validateEditorAssetsMapPackage({
        map,
        files: new Map([
          [path, PNG],
          ["root.json", bytes(1)],
        ]),
        allowControlPaths: ["root.json"],
      }),
    ).resolves.toHaveProperty("size", 1);
  });

  it("resolves runtime payloads without auditing size, digest or orphans", async () => {
    const { workspace } = await committed([
      { key: "A.png", mediaType: "image/png", bytes: PNG },
    ]);
    const map = createEditorAssetsMapFromWorkspace(workspace);
    const path = map.files["A.png"]!.path;
    const changed = bytes(1);
    const resolved = resolveEditorAssetsMapPackage({
      map,
      files: new Map([
        [path, changed],
        [`assets/${"b".repeat(64)}.png`, PNG],
        ["unknown.json", bytes(2)],
      ]),
    });
    expect(resolved.get("A.png")?.bytes).toEqual(changed);
    expect(() =>
      resolveEditorAssetsMapPackage({ map, files: new Map() }),
    ).toThrow(/缺失/u);
  });

  it("wraps invalid JSON and byte input diagnostics", () => {
    expect(() => decodeEditorAssetsMap(bytes(0xff))).toThrow(
      /assets.map.json/u,
    );
    expect(() => decodeEditorAssetsMap(null as unknown as Uint8Array)).toThrow(
      /Uint8Array/u,
    );
  });
});

describe("workspace review and transactions", () => {
  it("classifies add, no-op and overwrite while retaining existing spelling", async () => {
    const initial = await committed([
      { key: "BG.png", mediaType: "image/png", bytes: PNG },
    ]);
    const graph: EditorReferenceGraph = {
      references: [{ key: "BG.png", location: "nodes.base.background" }],
    };
    const noop = await reviewEditorAssetImport({
      workspace: initial.workspace,
      incoming: [{ key: "bg.png", mediaType: "image/png", bytes: PNG }],
      references: graph,
    });
    expect(noop.items[0]).toMatchObject({
      action: "noop",
      targetKey: "BG.png",
    });
    const overwrite = await reviewEditorAssetImport({
      workspace: initial.workspace,
      incoming: [{ key: "bg.png", mediaType: "image/png", bytes: OTHER_PNG }],
      references: graph,
    });
    expect(overwrite.items[0]).toMatchObject({
      action: "overwrite",
      targetKey: "BG.png",
    });
    expect(overwrite.items[0]!.references[0]!.location).toBe(
      "nodes.base.background",
    );
    const result = await commitEditorAssetImport({
      workspace: initial.workspace,
      project: { refs: ["BG.png"] },
      review: overwrite,
      adapter,
    });
    expect(result.workspace.entries.get("BG.png")!.bytes).toEqual(OTHER_PNG);
    expect(result.project.refs).toEqual(["BG.png"]);
  });

  it("merges identical flattened batch keys and blocks different bytes", async () => {
    const empty = createEmptyEditorAssetWorkspace();
    const merged = await reviewEditorAssetImport({
      workspace: empty,
      incoming: [
        { key: "A.png", mediaType: "image/png", bytes: PNG },
        { key: "a.png", mediaType: "image/png", bytes: PNG },
      ],
    });
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]!.sourceKeys).toEqual(["A.png", "a.png"]);
    const blocked = await reviewEditorAssetImport({
      workspace: empty,
      incoming: [
        { key: "A.png", mediaType: "image/png", bytes: PNG },
        { key: "a.png", mediaType: "image/png", bytes: OTHER_PNG },
      ],
    });
    expect(blocked.canCommit).toBe(false);
    expect(blocked.items.at(-1)!.action).toBe("rename-required");
    await expect(
      commitEditorAssetImport({
        workspace: empty,
        project: { refs: [] },
        review: blocked,
        adapter,
      }),
    ).rejects.toThrow(/blocking/u);
  });

  it("rolls back when project validation or async prepare fails", async () => {
    const empty = createEmptyEditorAssetWorkspace();
    const review = await reviewEditorAssetImport({
      workspace: empty,
      incoming: [{ key: "A.png", mediaType: "image/png", bytes: PNG }],
    });
    await expect(
      commitEditorAssetImport({
        workspace: empty,
        project: { refs: [], valid: false },
        review,
        adapter,
      }),
    ).rejects.toThrow(/validation/u);
    await expect(
      commitEditorAssetImport({
        workspace: empty,
        project: { refs: [] },
        review,
        adapter,
        prepare: () => Promise.reject(new Error("prepare failed")),
      }),
    ).rejects.toThrow(/prepare failed/u);
    expect(empty.entries.size).toBe(0);
  });

  it("renames typed references atomically and rejects collision/type mismatch", async () => {
    const base = await committed(
      [
        { key: "A.png", mediaType: "image/png", bytes: PNG },
        { key: "B.png", mediaType: "image/png", bytes: OTHER_PNG },
      ],
      { refs: [] },
    );
    const result = await renameEditorAsset({
      workspace: base.workspace,
      project: { refs: ["A.png"] },
      from: "A.png",
      to: "Hero.png",
      adapter,
    });
    expect(result.project.refs).toEqual(["Hero.png"]);
    expect(result.workspace.entries.has("A.png")).toBe(false);
    expect(result.workspace.entries.get("Hero.png")!.sha256).toBe(
      await sha256Hex(PNG),
    );
    await expect(
      renameEditorAsset({
        workspace: base.workspace,
        project: { refs: [] },
        from: "A.png",
        to: "b.png",
        adapter,
      }),
    ).rejects.toThrow(/已存在/u);
    await expect(
      renameEditorAsset({
        workspace: base.workspace,
        project: { refs: [] },
        from: "A.png",
        to: "A.json",
        adapter,
      }),
    ).rejects.toThrow(/不兼容/u);
  });

  it("blocks referenced delete and retains shared payload for another key", async () => {
    const base = await committed([
      { key: "A.png", mediaType: "image/png", bytes: PNG },
      { key: "B.png", mediaType: "image/png", bytes: PNG },
    ]);
    expect(() =>
      deleteEditorAsset({
        workspace: base.workspace,
        project: { refs: ["A.png"] },
        key: "A.png",
        adapter,
      }),
    ).toThrow(/refs\[0\]/u);
    const next = deleteEditorAsset({
      workspace: base.workspace,
      project: { refs: [] },
      key: "A.png",
      adapter,
    });
    expect(next.entries.has("B.png")).toBe(true);
    expect(materializeEditorAssetPayloads(next).size).toBe(1);
  });

  it("returns exact closure, deduplicates repeated keys, and clones bytes", async () => {
    const base = await committed([
      { key: "A.png", mediaType: "image/png", bytes: PNG },
      { key: "B.png", mediaType: "image/png", bytes: OTHER_PNG },
    ]);
    expect(
      exactEditorAssetClosure(base.workspace, {
        references: [
          { key: "B.png", location: "b" },
          { key: "A.png", location: "a" },
          { key: "A.png", location: "a2" },
        ],
      }),
    ).toEqual(["A.png", "B.png"]);
    const cloned = cloneEditorAssetWorkspace(base.workspace);
    expect(() =>
      (cloned.entries as Map<string, unknown>).set("C.png", {}),
    ).toThrow(/只读/u);
    expect(() =>
      createEditorAssetsMapFromWorkspace(base.workspace, ["bad.png"]),
    ).toThrow(/不存在/u);
  });
});

describe("bounded files/ZIP ingestion and adapters", () => {
  const limits = {
    files: { maxEntries: 4, maxFileBytes: 1024, maxTotalBytes: 2048 },
    zip: {
      maxEntries: 4,
      maxCompressedBytes: 1024,
      maxFileBytes: 512,
      maxTotalBytes: 1024,
    },
  };
  const file = (name: string, data: Uint8Array) => ({
    name,
    size: data.byteLength,
    arrayBuffer: async () => data.slice().buffer,
  });

  it("flattens ZIP paths without preserving directories", async () => {
    const zip = createDeterministicZip(
      new Map([
        ["profile/project.json", bytes(123, 125)],
        ["profile/assets/Hero.png", PNG],
      ]),
    );
    const output = await ingestEditorResourceSources({
      files: [file("bundle.zip", zip)],
      limits,
    });
    expect(output.map(({ key }) => key)).toEqual(["Hero.png", "project.json"]);
    expect(output.every(({ container }) => container === "zip")).toBe(true);
    const direct = await ingestEditorResourceSources({
      files: [file("Direct.png", PNG)],
      limits,
    });
    expect(direct[0]).toMatchObject({ key: "Direct.png", container: "file" });
  });

  it("migrates macOS metadata and one Finder wrapper before strict package validation", () => {
    const normalized = normalizeEditorPackageZipEntries(
      new Map([
        ["crave-symbols/symbols.package.json", bytes(1)],
        ["crave-symbols/gameconfig.json", bytes(2)],
        ["crave-symbols/assets/value.png", PNG],
        ["__MACOSX/._crave-symbols", bytes(3)],
        ["__MACOSX/crave-symbols/._gameconfig.json", bytes(4)],
        ["crave-symbols/.DS_Store", bytes(5)],
      ]),
      ["symbols.package.json"],
    );
    expect([...normalized.keys()]).toEqual([
      "symbols.package.json",
      "gameconfig.json",
      "assets/value.png",
    ]);
    expect(() =>
      normalizeEditorPackageZipEntries(
        new Map([["__MACOSX/._only", bytes(1)]]),
        ["symbols.package.json"],
      ),
    ).toThrow(/只包含 macOS metadata/u);
  });

  it("checks declared file size before accepting reads", async () => {
    await expect(
      ingestEditorResourceSources({
        files: [
          {
            name: "A.png",
            size: PNG.byteLength + 1,
            arrayBuffer: async () => PNG.buffer,
          },
        ],
        limits,
      }),
    ).rejects.toThrow(/预检/u);
  });

  it("requires explicit multi-profile choice", async () => {
    const candidate = {
      adapterId: "vni",
      rootKey: "project.json",
      exactKeys: ["project.json", "Hero.png"],
      parsed: {},
      profiles: [
        { id: "1x", label: "100%", byteLength: 20, scale: 1 },
        { id: "2x", label: "200%", byteLength: 40, scale: 2 },
      ],
      diagnostics: [],
    } as const;
    const discovered = await discoverEditorAdapterCandidates({
      files: [],
      adapters: [{ id: "vni", discover: () => [candidate] }],
    });
    expect(() => assertEditorAdapterProfilesChosen(discovered)).toThrow(
      /明确选择/u,
    );
    const chosen = chooseEditorAdapterProfile(candidate, "2x");
    expect(chosen.selectedProfileId).toBe("2x");
    expect(() => chooseEditorAdapterProfile(candidate, "bad")).toThrow(
      /未找到/u,
    );
    expect(() => assertEditorAdapterProfilesChosen([chosen])).not.toThrow();
  });

  it("rejects adapter identity errors and ambiguous claims", async () => {
    await expect(
      discoverEditorAdapterCandidates({
        files: [],
        adapters: [
          {
            id: "one",
            discover: () => [
              {
                adapterId: "wrong",
                rootKey: "A.json",
                exactKeys: ["A.json"],
                parsed: {},
                diagnostics: [],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/adapterId/u);
    await expect(
      discoverEditorAdapterCandidates({
        files: [],
        adapters: [
          {
            id: "one",
            discover: () => [
              {
                adapterId: "one",
                rootKey: "A.json",
                exactKeys: ["Shared.png"],
                parsed: {},
                diagnostics: [],
              },
              {
                adapterId: "one",
                rootKey: "B.json",
                exactKeys: ["shared.png"],
                parsed: {},
                diagnostics: [],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/多个/u);
  });
});
