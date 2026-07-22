import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

describe("popup flat resource discovery", () => {
  it("rewrites a VNI closure to filename keys and preserves unrelated images", async () => {
    const projectPath = asset("game003-s1/win-amount/bigwin.json");
    const projectBytes = new Uint8Array(readFileSync(projectPath));
    const project = JSON.parse(new TextDecoder().decode(projectBytes)) as {
      assets: readonly { path: string }[];
    };
    const files = [
      sourceFile("bigwin.json", projectBytes),
      ...project.assets.map(({ path }) =>
        sourceFile(
          path,
          new Uint8Array(readFileSync(resolve(projectPath, "..", path))),
        ),
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
    expect(rewritten).not.toContain("assets/");
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
    const root = asset("game003-s1/win-amount");
    const projectNames = ["bigwin.json", "superwin.json", "megawin.json"];
    const assetPaths = new Set<string>();
    const files = [
      sourceFile(
        "win-amount.manifest.json",
        new Uint8Array(readFileSync(resolve(root, "win-amount.manifest.json"))),
      ),
    ];
    for (const name of projectNames) {
      const payload = new Uint8Array(readFileSync(resolve(root, name)));
      const project = JSON.parse(new TextDecoder().decode(payload)) as {
        assets: readonly { path: string }[];
      };
      files.push(sourceFile(name, payload));
      for (const child of project.assets) assetPaths.add(child.path);
    }
    for (const path of [...assetPaths].sort())
      files.push(
        sourceFile(path, new Uint8Array(readFileSync(resolve(root, path)))),
      );
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
      resource: "superwin.json",
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
    const root = asset("game003-s1/win-amount");
    const source = JSON.parse(
      new TextDecoder().decode(bytes("game003-s1/win-amount/bigwin.json")),
    ) as {
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
          new Uint8Array(readFileSync(resolve(root, child.path))),
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

  it("rewrites and validates an official Spine 4.3 closure", async () => {
    const review = await discoverPopupResources([
      sourceFile("WL.json", bytes("game003-s1/WL.json")),
      sourceFile("Symbol.atlas", bytes("game003-s1/Symbol.atlas")),
      sourceFile("Symbol.png", bytes("game003-s1/Symbol.png")),
    ]);
    expect(review[0]).toMatchObject({ kind: "spine", rootKey: "WL.json" });
    expect(review[0]!.summary).toMatch(/animations/);
    expect(review[0]!.exactKeys).toEqual([
      "Symbol.atlas",
      "Symbol.png",
      "WL.json",
    ]);
  });

  it("rejects unknown inputs, aliases, and malformed popup ZIPs", async () => {
    await expect(
      discoverPopupResources([sourceFile("unknown.txt", new Uint8Array([1]))]),
    ).rejects.toThrow(/无法识别、未引用或不完整/);
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

function asset(path: string) {
  return resolve(process.cwd(), "../../assets", path);
}
function bytes(path: string) {
  return new Uint8Array(readFileSync(asset(path)));
}
function sourceFile(path: string, payload: Uint8Array): File {
  return new File([payload.slice().buffer], path.split("/").at(-1)!);
}
function png(width: number, height: number) {
  const data = new Uint8Array(24);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(data.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return data;
}
