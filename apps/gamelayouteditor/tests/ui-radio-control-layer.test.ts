import { describe, expect, it } from "vitest";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import { importLayoutZip } from "../src/io/imported-layout-zip.js";
import {
  createNewEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  addRadioControlLayer,
  getLayoutResourceReferences,
  rebindRadioControlResource,
  replaceImageResource,
} from "../src/model/resource-commands.js";
import { inspectEditorWorkspaceRuntimeEventCatalog } from "../src/model/editor-runtime-event-catalog.js";
import { layoutWorkspaceMarkup } from "../src/ui/layout-workspace.js";
import { createEditorUiSession } from "../src/ui/ui-session.js";

function projectWithImages() {
  const project = createNewEditorProject();
  for (const [id, width] of [
    ["flag-off.png", 145],
    ["flag-on.png", 145],
    ["wrong-size.png", 100],
  ] as const) {
    project.resources.set(id, {
      id,
      kind: "image",
      path: id,
      size: { width, height: 50 },
    });
    project.assets.set(id, new Uint8Array([1, 2, 3]));
  }
  return project;
}

describe("Game Layout Editor radio UI-control layer", () => {
  it("authors two exact image roots and round-trips the v7 union", () => {
    const project = projectWithImages();
    addRadioControlLayer({
      project,
      nodeId: "splash-flag",
      offResourceId: "flag-off.png",
      onResourceId: "flag-on.png",
      variants: ["landscape", "portrait"],
    });
    expect(getLayoutResourceReferences(project, "flag-off.png")).toEqual([
      expect.objectContaining({
        nodeId: "splash-flag",
        role: "ui-control-off",
      }),
    ]);
    expect(getLayoutResourceReferences(project, "flag-on.png")).toEqual([
      expect.objectContaining({
        nodeId: "splash-flag",
        role: "ui-control-on",
      }),
    ]);

    const manifest = editorProjectToManifest(project);
    expect(manifest.version).toBe(7);
    expect(manifest.nodes[0]).toMatchObject({
      id: "splash-flag",
      uiControl: {
        kind: "radio",
        off: { path: "flag-off.png", size: { width: 145, height: 50 } },
        on: { path: "flag-on.png", size: { width: 145, height: 50 } },
      },
    });
    const restored = manifestToEditorProject(manifest, project.assets);
    expect(restored.nodes[0]).toMatchObject({
      layerType: "ui-control",
      uiControl: {
        kind: "radio",
        offResourceId: "flag-off.png",
        onResourceId: "flag-on.png",
      },
    });
  });

  it("keeps both state images in the production ZIP round-trip", async () => {
    const project = projectWithImages();
    addRadioControlLayer({
      project,
      nodeId: "splash-flag",
      offResourceId: "flag-off.png",
      onResourceId: "flag-on.png",
      variants: ["landscape", "portrait"],
    });
    const exported = await exportLayoutZip({
      manifest: editorProjectToManifest(project),
      assets: project.assets,
      decodeImage: async () => ({ width: 145, height: 50 }),
    });
    const imported = await importLayoutZip(exported.bytes, {
      decodeImage: async () => ({ width: 145, height: 50 }),
    });
    expect([...imported.assets.keys()]).toEqual(
      expect.arrayContaining(["flag-off.png", "flag-on.png"]),
    );
    expect(imported.manifest.nodes[0]).toMatchObject({
      uiControl: {
        kind: "radio",
        off: { path: "flag-off.png" },
        on: { path: "flag-on.png" },
      },
    });
    imported.destroy();
  });

  it("shows an explicit UI-control category and exposes shared catalog events", () => {
    const project = projectWithImages();
    addRadioControlLayer({
      project,
      nodeId: "splash-flag",
      offResourceId: "flag-off.png",
      onResourceId: "flag-on.png",
      variants: ["landscape", "portrait"],
    });
    const markup = layoutWorkspaceMarkup(
      project,
      { kind: "layer", nodeId: "splash-flag" },
      "BaseGame",
      createEditorUiSession(),
      "landscape",
    );
    expect(markup).toContain("UI 控件 / 单选框");
    expect(markup).toContain("data-open-add-radio");
    expect(markup).toContain('data-rebind-radio="off"');
    const catalog = inspectEditorWorkspaceRuntimeEventCatalog({
      manifest: editorProjectToManifest(project),
      workspaceFiles: project.assets,
    });
    expect(
      catalog.entries
        .filter((entry) => entry.family === "ui-control-state")
        .map((entry) => entry.descriptor.address),
    ).toEqual([
      "gamelayout:/ui-control/splash-flag/radio/state/off/entered",
      "gamelayout:/ui-control/splash-flag/radio/state/on/entered",
    ]);
  });

  it("rejects an incompatible state image without mutating the binding", () => {
    const project = projectWithImages();
    const node = addRadioControlLayer({
      project,
      nodeId: "splash-flag",
      offResourceId: "flag-off.png",
      onResourceId: "flag-on.png",
      variants: ["landscape"],
    });
    expect(() =>
      rebindRadioControlResource({
        project,
        nodeId: node.id,
        state: "on",
        resourceId: "wrong-size.png",
      }),
    ).toThrow(/尺寸必须相同/);
    expect(node.uiControl.onResourceId).toBe("flag-on.png");
  });

  it("rejects an incompatible image replacement before mutating assets", async () => {
    const project = projectWithImages();
    addRadioControlLayer({
      project,
      nodeId: "splash-flag",
      offResourceId: "flag-off.png",
      onResourceId: "flag-on.png",
      variants: ["landscape"],
    });
    const before = project.assets.get("flag-on.png")!.slice();
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    await expect(
      replaceImageResource({
        project,
        resourceId: "flag-on.png",
        file: new File([png], "flag-on.png", { type: "image/png" }),
        decodeImage: async () => ({ width: 100, height: 50 }),
      }),
    ).rejects.toThrow(/尺寸必须相同/);
    expect(project.resources.get("flag-on.png")).toMatchObject({
      size: { width: 145, height: 50 },
    });
    expect(project.assets.get("flag-on.png")).toEqual(before);
  });
});
