import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { serializeEditorAssetsMap } from "@slotclientengine/editorresource";
import { describe, expect, it } from "vitest";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import { importLayoutZip } from "../src/io/imported-layout-zip.js";
import { importPopupObjectPackageZip } from "../src/io/imported-popup-object-package.js";
import {
  createNewEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  deletePopupObjectDependency,
  importPopupObjectDependency,
  setTapInfoObjectDependency,
} from "../src/model/game-mode-commands.js";
import { projectWorkspaceMarkup } from "../src/ui/project-workspace.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

async function objectZip(name = "tap-to-continue"): Promise<Uint8Array> {
  return createDeterministicZip(
    new Map([
      [
        "popup-object.manifest.json",
        encode({
          version: 1,
          kind: "popup-object",
          name,
          resources: {},
          layers: [],
        }),
      ],
      [
        "assets.map.json",
        serializeEditorAssetsMap({
          version: 1,
          kind: "editor-assets",
          files: {},
        }),
      ],
    ]),
  );
}

describe("gamelayout tap info Popup Object dependency", () => {
  it("imports without auto-selecting, round-trips the explicit binding, and protects selected deletion", async () => {
    const imported = await importPopupObjectPackageZip(await objectZip());
    const project = createNewEditorProject();
    importPopupObjectDependency(project, imported);

    expect(project.tapInfoObjectName).toBeNull();
    expect(editorProjectToManifest(project)).not.toHaveProperty(
      "tapInfoObject",
    );

    setTapInfoObjectDependency(project, imported.manifest.name);
    const manifest = editorProjectToManifest(project);
    expect(manifest.tapInfoObject).toEqual({ manifest: imported.rootKey });
    const markup = projectWorkspaceMarkup(project, []);
    expect(markup).toContain("data-tap-info-object");
    expect(markup).toContain(
      `<option value="${imported.manifest.name}" selected>`,
    );
    const reopened = manifestToEditorProject(manifest, project.assets);
    expect(reopened.tapInfoObjectName).toBe(imported.manifest.name);
    expect(
      reopened.popupObjectDependencies.get(imported.manifest.name),
    ).toEqual(project.popupObjectDependencies.get(imported.manifest.name));

    const exported = await exportLayoutZip({
      manifest,
      assets: project.assets,
      tapInfoObjectFiles: new Map([
        ["popup-object.manifest.json", project.assets.get(imported.rootKey)!],
      ]),
    });
    const importedLayout = await importLayoutZip(exported.bytes);
    try {
      expect(importedLayout.packageResource.tapInfoObject?.manifest.name).toBe(
        imported.manifest.name,
      );
      expect(
        manifestToEditorProject(importedLayout.manifest, importedLayout.assets)
          .tapInfoObjectName,
      ).toBe(imported.manifest.name);
    } finally {
      importedLayout.destroy();
    }

    expect(() =>
      deletePopupObjectDependency(project, imported.manifest.name),
    ).toThrow(/仍被 Tap info/);
    setTapInfoObjectDependency(project, null);
    deletePopupObjectDependency(project, imported.manifest.name);
    expect(project.popupObjectDependencies.size).toBe(0);
    expect(project.assets.has(imported.rootKey)).toBe(false);
  });

  it("rejects extra files instead of retaining object orphans", async () => {
    const entries = new Map<string, Uint8Array>([
      [
        "popup-object.manifest.json",
        encode({
          version: 1,
          kind: "popup-object",
          name: "tap-to-continue",
          resources: {},
          layers: [],
        }),
      ],
      [
        "assets.map.json",
        serializeEditorAssetsMap({
          version: 1,
          kind: "editor-assets",
          files: {},
        }),
      ],
      ["orphan.bin", new Uint8Array([1])],
    ]);
    await expect(
      importPopupObjectPackageZip(createDeterministicZip(entries)),
    ).rejects.toThrow(/unexpected|closure|extra|未声明/i);
  });
});
