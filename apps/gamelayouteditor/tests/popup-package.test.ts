import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import {
  commitEditorAssetImport,
  createEditorAssetEntry,
  createEditorAssetsMapFromWorkspace,
  createEmptyEditorAssetWorkspace,
  materializeEditorAssetPayloads,
  reviewEditorAssetImport,
  serializeEditorAssetsMap,
  type EditorAssetRewriteAdapter,
} from "@slotclientengine/editorresource";
import { describe, expect, it } from "vitest";
import { Assets, Texture } from "pixi.js";
import { vi } from "vitest";
import { importPopupPackageZip } from "../src/io/imported-popup-package.js";
import {
  cloneEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { assetBytes, imageManifest } from "./fixtures.js";
import { popupFiles } from "./popup-fixture.js";

describe("gamelayout popup dependency", () => {
  it("strictly imports a self-contained popup and round-trips binding placement", async () => {
    const popup = popupFiles();
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const imported = await importPopupPackageZip(
      createDeterministicZip(await mappedPopupFiles(popup)),
      { decodeImage: async () => ({ width: 1, height: 1 }) },
    );
    expect(imported.manifest.id).toBe("fixture-popup");
    const layoutAssets = new Map([
      ["bg.png", assetBytes.get("assets/bg.png")!],
    ]);
    for (const [path, bytes] of imported.files)
      layoutAssets.set(path, new Uint8Array(bytes));
    const manifest = {
      ...imageManifest,
      nodes: [
        {
          ...imageManifest.nodes[0],
          resource: { ...imageManifest.nodes[0].resource, path: "bg.png" },
        },
      ],
      popups: {
        "fixture-popup": {
          type: "award-celebration" as const,
          manifest: "popup.manifest.json",
          placements: { default: { x: 12, y: -8, scale: 0.9 } },
        },
      },
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            nodeStates: {},
            awardCelebrationPopup: "fixture-popup",
          },
        ],
      },
    };
    const project = manifestToEditorProject(manifest, layoutAssets);
    expect(project.popupDependencies.get("fixture-popup")).toMatchObject({
      id: "fixture-popup",
      placements: { default: { x: 12, y: -8, scale: 0.9 } },
    });
    expect(project.assets.has("popup.manifest.json")).toBe(true);
    expect(editorProjectToManifest(project).popups).toEqual(manifest.popups);
    const clone = cloneEditorProject(project);
    clone.assets.get("popup.manifest.json")![0] = 0;
    expect(project.assets.get("popup.manifest.json")![0]).not.toBe(0);
    load.mockRestore();
    unload.mockRestore();
  });

  it("rejects missing sentinel, orphan entries and unknown manifest fields", async () => {
    await expect(
      importPopupPackageZip(
        createDeterministicZip(new Map([["x.txt", new Uint8Array([1])]])),
      ),
    ).rejects.toThrow(/sentinel/);
    const orphan = await mappedPopupFiles(popupFiles());
    orphan.set("orphan.bin", new Uint8Array([1]));
    await expect(
      importPopupPackageZip(createDeterministicZip(orphan)),
    ).rejects.toThrow(/未声明|exactly match/);
    const invalid = await mappedPopupFiles(popupFiles());
    const manifest = JSON.parse(
      new TextDecoder().decode(invalid.get("popup.manifest.json")),
    );
    manifest.extra = true;
    invalid.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );
    await expect(
      importPopupPackageZip(createDeterministicZip(invalid)),
    ).rejects.toThrow(/unknown key/);
  });
});

async function mappedPopupFiles(
  virtual: ReadonlyMap<string, Uint8Array>,
): Promise<Map<string, Uint8Array>> {
  const root = virtual.get("popup.manifest.json")!;
  const incoming = await Promise.all(
    [...virtual]
      .filter(([key]) => key !== "popup.manifest.json")
      .map(([key, bytes]) =>
        createEditorAssetEntry({
          key,
          mediaType: key.endsWith(".json") ? "application/json" : "image/png",
          bytes,
        }),
      ),
  );
  const empty = createEmptyEditorAssetWorkspace();
  const review = await reviewEditorAssetImport({ workspace: empty, incoming });
  const adapter: EditorAssetRewriteAdapter<null> = {
    cloneProject: () => null,
    collectReferences: () => ({ references: [] }),
    renameReferences: () => null,
  };
  const workspace = (
    await commitEditorAssetImport({
      workspace: empty,
      project: null,
      review,
      adapter,
    })
  ).workspace;
  return new Map([
    ...materializeEditorAssetPayloads(workspace),
    [
      "assets.map.json",
      serializeEditorAssetsMap(createEditorAssetsMapFromWorkspace(workspace)),
    ] as const,
    ["popup.manifest.json", root] as const,
  ]);
}
