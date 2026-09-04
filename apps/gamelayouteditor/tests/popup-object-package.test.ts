import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { serializeEditorAssetsMap } from "@slotclientengine/editorresource";
import { describe, expect, it } from "vitest";
import {
  exportLayoutZip,
  normalizeLayoutFilenameKeys,
  normalizeMappedLayoutFilenameKeys,
} from "../src/io/exported-layout-zip.js";
import { parsePopupObjectManifest } from "@slotclientengine/rendercore/popup/editor";
import { importLayoutZip } from "../src/io/imported-layout-zip.js";
import { importPopupObjectPackageZip } from "../src/io/imported-popup-object-package.js";
import {
  createEditorGameModeDraft,
  createNewEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { addLayerFromResource } from "../src/model/resource-commands.js";
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
  it.each(["export", "reimport"])(
    "preserves mixed-case font keys and references during %s",
    async (operation) => {
      const rootKey = "pkg-13-taptocontinue-popup-object.manifest.json";
      const fontKey = "pkg-13-taptocontinue-Fredoka-Bold.ttf";
      const object = {
        version: 1,
        kind: "popup-object",
        name: "taptocontinue",
        resources: { [fontKey]: { kind: "font", path: fontKey } },
        layers: [
          {
            id: "font-0",
            kind: "text",
            order: 0,
            alpha: 1,
            resource: fontKey,
            defaultText: fontKey,
            anchor: { x: 0.5, y: 0.5 },
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            attachment: { kind: "popup-root" },
            style: {
              fontSize: 34,
              letterSpacing: 0,
              arcDegrees: 0,
              fill: { kind: "solid", color: "#ffffff" },
              widthRange: { minWidth: 0, maxWidth: 0 },
            },
          },
        ],
      };
      const manifest = {
        ...editorProjectToManifest(createNewEditorProject()),
        tapInfoObject: { manifest: rootKey },
      };
      const fontBytes = new Uint8Array([1, 2, 3]);
      const files = new Map([
        [rootKey, encode(object)],
        [fontKey, fontBytes],
      ]);
      const normalize =
        operation === "export"
          ? normalizeLayoutFilenameKeys
          : normalizeMappedLayoutFilenameKeys;
      const normalized = await normalize(manifest, files);
      const result = parsePopupObjectManifest(
        JSON.parse(new TextDecoder().decode(normalized.assets.get(rootKey))),
      );
      expect(result.resources).toEqual({
        [fontKey]: { kind: "font", path: fontKey },
      });
      expect(result.layers[0]).toMatchObject({
        resource: fontKey,
        defaultText: fontKey,
      });
      expect(normalized.assets.get(fontKey)).toEqual(fontBytes);
      expect(files.get(rootKey)).toEqual(encode(object));
      expect(files.has(fontKey)).toBe(true);
    },
  );

  it("imports without auto-selecting, round-trips the explicit binding, and protects selected deletion", async () => {
    const imported = await importPopupObjectPackageZip(await objectZip());
    const project = createNewEditorProject();
    importPopupObjectDependency(project, imported);
    expect(project.resources.get(imported.rootKey)).toMatchObject({
      kind: "popup-object",
      manifestPath: imported.rootKey,
    });

    expect(project.tapInfoObjectName).toBeNull();
    expect(editorProjectToManifest(project)).not.toHaveProperty(
      "tapInfoObject",
    );

    setTapInfoObjectDependency(project, imported.manifest.name);
    const node = addLayerFromResource({
      project,
      resourceId: imported.rootKey,
      nodeId: "tap-info",
      variants: ["landscape", "portrait"],
    });
    project.gameModes.modes.push(createEditorGameModeDraft("Splash", false));
    project.gameModes.splashMode = "Splash";
    project.gameModes.transitions.push({
      fromModeId: "Splash",
      toModeId: "BaseGame",
      kind: "none",
      preludePopupId: null,
    });
    node.scope = { Splash: ["landscape", "portrait"] };
    node.placements.landscape = {
      x: 123,
      y: 456,
      scale: 1,
      rotation: 0,
      center: { x: 0.5, y: 0.5 },
    };
    const manifest = editorProjectToManifest(project);
    expect(manifest.tapInfoObject).toEqual({ manifest: imported.rootKey });
    expect(manifest.nodes[0]).toMatchObject({
      id: "tap-info",
      order: 2000,
      resource: { kind: "popup-object", manifest: imported.rootKey },
      placements: { landscape: { x: 123, y: 456 } },
      scope: { Splash: ["landscape", "portrait"] },
    });
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
    expect(reopened.resources.get(imported.rootKey)?.kind).toBe("popup-object");

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
    project.nodes.splice(0);
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
