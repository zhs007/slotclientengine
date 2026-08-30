import { describe, expect, it } from "vitest";
import { decodeEditorAssetsMap } from "@slotclientengine/editorresource";
import {
  editorProjectToManifest,
  editorProjectToPreviewManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  bindRuntimeResource,
  getRuntimeResourceKey,
  unbindRuntimeResource,
  uploadJsonDataResources,
} from "../src/model/resource-commands.js";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import {
  extractBoundedZip,
  importLayoutZip,
} from "../src/io/imported-layout-zip.js";
import { getResourcePickerCandidates } from "../src/ui/resource-picker.js";
import { createResourcePickerState } from "../src/ui/resource-picker.js";
import { createEditorUiSession } from "../src/ui/ui-session.js";
import { resourcesWorkspaceMarkup } from "../src/ui/resources-workspace.js";
import { assetBytes, imageManifest } from "./fixtures.js";

const decodeImage = async () => ({ width: 1, height: 1 });

function jsonFile(name: string, value: unknown): File {
  return new File([`${JSON.stringify(value)}\n`], name, {
    type: "application/json",
  });
}

describe("Game Layout Editor JSON program assets", () => {
  it("imports atomically, stays non-visual, and only exports after an exact binding", async () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    const originalResources = project.resources.size;
    await expect(
      uploadJsonDataResources({
        project,
        files: [
          jsonFile("good.json", { ok: true }),
          new File(["{"], "bad.json"),
        ],
      }),
    ).rejects.toThrow(/invalid JSON/);
    expect(project.resources.size).toBe(originalResources);
    expect(project.assets.has("good.json")).toBe(false);

    const [resource] = await uploadJsonDataResources({
      project,
      files: [
        jsonFile("spin-config.json", {
          localReels: [["A", "B"]],
          numberWeights: [{ value: 10, weight: 2 }],
        }),
      ],
    });
    expect(resource).toMatchObject({
      kind: "json",
      path: "spin-config.json",
      rootKind: "object",
    });
    expect(editorProjectToManifest(project).runtimeResources).toBeUndefined();
    expect(
      getResourcePickerCandidates(
        project,
        createResourcePickerState(project, { kind: "add-layer" }),
      ).some(({ resourceId }) => resourceId === resource!.id),
    ).toBe(false);

    bindRuntimeResource(project, resource!.id, "spin-config");
    const manifest = editorProjectToManifest(project);
    expect(manifest.version).toBe(7);
    expect(manifest.runtimeResources?.["spin-config"]).toEqual({
      kind: "json",
      path: "spin-config.json",
    });
    expect(
      editorProjectToPreviewManifest(project, "default")?.runtimeResources,
    ).toBeUndefined();

    const session = createEditorUiSession();
    session.expandedResourceIds.add(resource!.id);
    const markup = resourcesWorkspaceMarkup({
      project,
      session,
      thumbnailUrls: new Map(),
    });
    expect(markup).toContain("导入 JSON data");
    expect(markup).toContain("通过 loadJsonData API 读取");
    expect(markup).not.toContain(`data-resource-add-layer="${resource!.id}"`);
    expect(markup).not.toContain("gamelayout:/resource/json/");

    unbindRuntimeResource(project, resource!.id);
    expect(getRuntimeResourceKey(project, resource!.id)).toBeNull();
    expect(editorProjectToManifest(project).runtimeResources).toBeUndefined();
  });

  it("round-trips opaque bytes through the mapped production ZIP", async () => {
    const mappedManifest = {
      ...imageManifest,
      nodes: imageManifest.nodes.map((node) => ({
        ...node,
        resource: { ...node.resource, path: "bg.png" },
      })),
    };
    const project = manifestToEditorProject(
      mappedManifest,
      new Map([["bg.png", assetBytes.get("assets/bg.png")!]]),
    );
    const source = new TextEncoder().encode(
      '{"kind":"popup","path":"bg.png","localReels":[["A"]]}\n',
    );
    const [resource] = await uploadJsonDataResources({
      project,
      files: [new File([source as BlobPart], "spin-config.json")],
    });
    bindRuntimeResource(project, resource!.id, "spin-config");

    const exported = await exportLayoutZip({
      manifest: editorProjectToManifest(project),
      assets: project.assets,
      decodeImage,
    });
    const entries = extractBoundedZip(exported.bytes);
    const map = decodeEditorAssetsMap(entries.get("assets.map.json")!);
    const packagedPath = map.files["spin-config.json"]!.path;
    expect(entries.get(packagedPath)).toEqual(source);

    const imported = await importLayoutZip(exported.bytes, { decodeImage });
    try {
      expect(
        await imported.packageResource.loadJsonData("spin-config"),
      ).toEqual({
        kind: "popup",
        path: "bg.png",
        localReels: [["A"]],
      });
      const restored = manifestToEditorProject(
        imported.manifest,
        imported.assets,
      );
      expect(restored.resources.get("spin-config.json")).toMatchObject({
        kind: "json",
        rootKind: "object",
      });
      expect(getRuntimeResourceKey(restored, "spin-config.json")).toBe(
        "spin-config",
      );
      expect(restored.assets.get("spin-config.json")).toEqual(source);
    } finally {
      imported.destroy();
    }
  });
});
