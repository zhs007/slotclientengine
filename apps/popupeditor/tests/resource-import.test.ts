import { describe, expect, it, vi } from "vitest";
import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import {
  commitImportReview,
  discoverPopupResources,
  inspectVniBundleProfiles,
} from "../src/io/resource-import.js";
import {
  applyImportedResourceBindings,
  createPopupEditorProject,
  PopupEditorStore,
} from "../src/model/project.js";
import { importPopupZip } from "../src/io/popup-zip.js";
import {
  getMinecart2SymbolResourcePath,
  readMinecart2LogicalBytes,
  readMinecart2LogicalJson,
  readMinecart2SymbolBytes,
} from "../../../test-utils/minecart2-fixtures.js";

describe("popup flat resource discovery", () => {
  it("discovers validated package font files", async () => {
    const review = await discoverPopupResources([
      sourceFile("Prompt.woff2", new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1])),
    ]);
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({
      kind: "font",
      rootKey: "Prompt.woff2",
      spec: { kind: "font", path: "Prompt.woff2" },
    });
    await expect(
      discoverPopupResources([
        sourceFile("Bad.woff2", new TextEncoder().encode("wOFF")),
      ]),
    ).rejects.toThrow(/signature/);
  });

  it("rewrites a VNI closure to filename keys and preserves unrelated images", async () => {
    const projectBytes = readMinecart2LogicalBytes("big_win0721.json");
    const project = JSON.parse(new TextDecoder().decode(projectBytes)) as {
      assets: readonly { path: string }[];
    };
    const files = [
      sourceFile("bigwin.json", projectBytes),
      ...project.assets.map(({ path }) =>
        sourceFile(path, readMinecart2LogicalBytes(path)),
      ),
    ];
    const review = await discoverPopupResources(files);
    expect(review[0]).toMatchObject({
      kind: "vni",
      rootKey: "bigwin.json",
      dependencyCount: project.assets.length,
    });
    const spec = review[0]!.spec;
    if (spec.kind !== "vni") throw new Error("expected VNI");
    const rewritten = new TextDecoder().decode(
      review[0]!.assets.find(({ key }) => key === spec.project)!.bytes,
    );
    expect(rewritten).not.toContain("../");
    expect(
      JSON.parse(rewritten).assets.every(
        ({ path }: { path: string }) => !path.includes("/"),
      ),
    ).toBe(true);

    const mixed = await discoverPopupResources([
      ...files,
      sourceFile("extra.png", png(1, 1)),
    ]);
    expect(mixed.map(({ kind, rootKey }) => [kind, rootKey])).toEqual([
      ["vni", "bigwin.json"],
      ["image", "extra.png"],
    ]);
  });

  it("uses manifest order for the three win-amount profiles and requires explicit source hygiene", async () => {
    const projectNames = [
      "big_win0721.json",
      "super_win0721.json",
      "mega_win0721.json",
    ];
    const assetPaths = new Map<string, string>();
    const files = [
      sourceFile(
        "win-amount.manifest.json",
        new TextEncoder().encode(
          JSON.stringify({
            version: 1,
            kind: "vni-win-amount-tiers",
            projectGlob: "./{big_win0721,super_win0721,mega_win0721}.json",
            assetGlob: "./assets/*.{png,jpg,jpeg,webp}",
            tiers: projectNames.map((project, index) => ({
              id: ["bigwin", "superwin", "megawin"][index],
              thresholdMultiplier: [15, 25, 50][index],
              project: `./${project}`,
              playback: {
                mode: "segmented",
                durationSeconds: [3.55, 3.5, 3.5][index],
                loopStartTime: 1,
                loopEndTime: 2.5,
                keepParticlesAlive: true,
              },
            })),
          }),
        ),
      ),
    ];
    for (const name of projectNames) {
      const project = structuredClone(readMinecart2LogicalJson(name)) as {
        assets: { path: string }[];
      };
      for (const child of project.assets) {
        const originalPath = child.path;
        const filename = originalPath.split("/").at(-1);
        if (!filename)
          throw new Error(`invalid VNI asset path ${originalPath}`);
        child.path = `assets/${filename}`;
        assetPaths.set(child.path, originalPath);
      }
      files.push(
        sourceFile(name, new TextEncoder().encode(JSON.stringify(project))),
      );
    }
    for (const [path, originalPath] of [...assetPaths].sort())
      files.push(sourceFile(path, readMinecart2LogicalBytes(originalPath)));
    const review = await discoverPopupResources(files);
    expect(review.map(({ rootKey }) => rootKey)).toEqual(projectNames);
    expect(
      review.map(
        ({ suggestedTierBindings }) => suggestedTierBindings?.[0]?.tierId,
      ),
    ).toEqual(["bigwin", "superwin", "megawin"]);
    const project = createPopupEditorProject();
    await commitImportReview(project, review);
    for (const candidate of review)
      applyImportedResourceBindings(
        project,
        candidate.rootKey,
        candidate.suggestedTierBindings,
      );
    expect(project.tiers.get("superwin")!.layers[0]).toMatchObject({
      resource: "super_win0721.json",
      playback: { loopStartTime: 1, loopEndTime: 2.5 },
    });
    await expect(
      discoverPopupResources([
        ...files,
        sourceFile(".DS_Store", new Uint8Array([1, 2, 3])),
      ]),
    ).rejects.toThrow(/无法识别、未引用或不完整/);
  });

  it("defaults to the only runtime and requires selection only for multiple runtimes", async () => {
    const source = readMinecart2LogicalJson("big_win0721.json") as {
      exportProfile: { id: string; purpose: string; assetScale: number };
      assets: readonly { path: string }[];
    };
    const editing = structuredClone(source);
    editing.exportProfile = {
      id: "edit_full",
      purpose: "editing",
      assetScale: 1,
    };
    const full = structuredClone(source);
    full.exportProfile = { id: "full", purpose: "runtime", assetScale: 1 };
    const half = structuredClone(source);
    half.exportProfile = { id: "half", purpose: "runtime", assetScale: 0.5 };
    const entries = new Map<string, Uint8Array>([
      [
        "manifest.json",
        new TextEncoder().encode(
          JSON.stringify({
            type: "vni_export_bundle",
            version: "VNI_0.2",
            exports: [
              {
                id: "edit_full",
                purpose: "editing",
                assetScale: 1,
                path: "edit_full/project.json",
              },
              {
                id: "full",
                purpose: "runtime",
                assetScale: 1,
                path: "profiles/full/project.json",
              },
              {
                id: "half",
                purpose: "runtime",
                assetScale: 0.5,
                path: "profiles/half/project.json",
              },
            ],
          }),
        ),
      ],
      [
        "edit_full/project.json",
        new TextEncoder().encode(JSON.stringify(editing)),
      ],
      [
        "profiles/full/project.json",
        new TextEncoder().encode(JSON.stringify(full)),
      ],
      [
        "profiles/half/project.json",
        new TextEncoder().encode(JSON.stringify(half)),
      ],
    ]);
    for (const directory of ["edit_full", "profiles/full", "profiles/half"])
      for (const child of source.assets)
        entries.set(
          `${directory}/${child.path}`,
          readMinecart2LogicalBytes(child.path),
        );
    const zip = createDeterministicZip(entries);
    expect(inspectVniBundleProfiles(zip)?.map(({ id }) => id)).toEqual([
      "full",
      "half",
    ]);

    const uniqueEntries = new Map(entries);
    uniqueEntries.set(
      "manifest.json",
      new TextEncoder().encode(
        JSON.stringify({
          type: "vni_export_bundle",
          version: "VNI_0.087",
          exports: [
            {
              id: "edit_full",
              purpose: "editing",
              assetScale: 1,
              path: "edit_full/project.json",
            },
            {
              id: "full",
              purpose: "runtime",
              assetScale: 1,
              path: "profiles/full/project.json",
            },
          ],
        }),
      ),
    );
    uniqueEntries.delete("profiles/half/project.json");
    for (const child of source.assets)
      uniqueEntries.delete(`profiles/half/${child.path}`);
    const automatic = await discoverPopupResources([
      sourceFile("stable-export.zip", createDeterministicZip(uniqueEntries)),
    ]);
    expect(automatic[0]).toMatchObject({
      kind: "vni",
      selectedProfileId: "full",
      profiles: [{ id: "full", assetScale: 1 }],
      primarySource: "stable-export.zip:profiles/full/project.json",
    });

    await expect(
      discoverPopupResources([sourceFile("profiles.zip", zip)]),
    ).rejects.toThrow(/多个 VNI runtime.*必须明确选择/);
    const selected = await discoverPopupResources(
      [sourceFile("profiles.zip", zip)],
      { vniProfileSelections: new Map([["profiles.zip", "half"]]) },
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      kind: "vni",
      selectedProfileId: "half",
      profiles: [{ id: "full" }, { id: "half" }],
    });
    expect(selected[0]!.exactKeys).not.toContain("manifest.json");
  });

  it("imports a runtime VNI bundle that contains a JPEG asset", async () => {
    const project = structuredClone(
      readMinecart2LogicalJson("big_win0721.json"),
    ) as {
      exportProfile: { id: string; purpose: string; assetScale: number };
      assets: { path: string }[];
    };
    project.exportProfile = {
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
    };
    const jpegAsset = project.assets[0]!;
    jpegAsset.path = "assets/photo.jpg";
    const entries = new Map<string, Uint8Array>([
      [
        "manifest.json",
        new TextEncoder().encode(
          JSON.stringify({
            type: "vni_export_bundle",
            version: "VNI_0.103",
            exports: [
              {
                id: "runtime_100",
                purpose: "runtime",
                assetScale: 1,
                path: "runtime_100/crave_superwin.json",
              },
            ],
          }),
        ),
      ],
      [
        "runtime_100/crave_superwin.json",
        new TextEncoder().encode(JSON.stringify(project)),
      ],
    ]);
    for (const child of project.assets)
      entries.set(
        `runtime_100/${child.path}`,
        child === jpegAsset ? jpeg() : readMinecart2LogicalBytes(child.path),
      );

    const review = await discoverPopupResources([
      sourceFile("jpeg-runtime.zip", createDeterministicZip(entries)),
    ]);

    expect(review[0]).toMatchObject({
      kind: "vni",
      rootKey: "crave_superwin.json",
      dependencyCount: project.assets.length,
      selectedProfileId: "runtime_100",
    });
    expect(
      review[0]!.assets.find(({ key }) => key === "photo.jpg"),
    ).toMatchObject({
      key: "photo.jpg",
      mediaType: "image/jpeg",
    });
  });

  it("rewrites and validates an official Spine 4.3 closure", async () => {
    const skeleton = getMinecart2SymbolResourcePath("WL", "skeleton");
    const atlas = getMinecart2SymbolResourcePath("WL", "atlas");
    const texture = getMinecart2SymbolResourcePath("WL", "texture");
    const importedTexture = texture.replace(/\.png$/u, ".webp");
    const importedAtlas = new TextEncoder().encode(
      new TextDecoder()
        .decode(readMinecart2SymbolBytes("WL", "atlas"))
        .replace(texture, importedTexture),
    );
    const review = await discoverPopupResources([
      sourceFile(skeleton, readMinecart2SymbolBytes("WL", "skeleton")),
      sourceFile(atlas, importedAtlas),
      sourceFile(importedTexture, readMinecart2SymbolBytes("WL", "texture")),
    ]);
    expect(review[0]).toMatchObject({ kind: "spine", rootKey: skeleton });
    expect(review[0]!.summary).toMatch(/animations/);
    expect(review[0]!.exactKeys).toEqual(
      [atlas, skeleton, importedTexture].sort(),
    );
  });

  it("rejects unknown inputs, aliases, and malformed popup ZIPs", async () => {
    await expect(
      discoverPopupResources([sourceFile("unknown.txt", new Uint8Array([1]))]),
    ).rejects.toThrow(/无法识别、未引用或不完整/);
    await expect(
      discoverPopupResources([
        sourceFile("unknown.bin", new Uint8Array([0xff, 0x00])),
      ]),
    ).rejects.toThrow(/无法识别、未引用或不完整/);
    await expect(
      discoverPopupResources([
        sourceFile("invalid.json", new Uint8Array([0xff, 0xfe])),
      ]),
    ).rejects.toThrow(/invalid\.json 不是合法 JSON/);
    await expect(
      discoverPopupResources([
        sourceFile("A.PNG", png(1, 1)),
        sourceFile("a.png", png(1, 1)),
      ]),
    ).rejects.toThrow(/alias|冲突|collision/i);
    await expect(
      importPopupZip(
        createDeterministicZip(new Map([["x.txt", new Uint8Array([1])]])),
      ),
    ).rejects.toThrow(/sentinel/);
  });

  it("emits store diagnostics without mutating the previous snapshot", () => {
    const store = new PopupEditorStore();
    const listener = vi.fn();
    const dispose = store.subscribe(listener);
    store.transact((project) => {
      project.id = "Bad";
    });
    expect(listener).toHaveBeenCalled();
    store.replace(createPopupEditorProject());
    dispose();
  });
});

function sourceFile(path: string, payload: Uint8Array): File {
  return new File([payload.slice().buffer], path.split("/").at(-1)!);
}
function jpeg() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);
}
function png(width: number, height: number) {
  const data = new Uint8Array(24);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(data.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return data;
}
