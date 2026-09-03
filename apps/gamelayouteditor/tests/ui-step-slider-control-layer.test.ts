import { describe, expect, it } from "vitest";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import { importLayoutZip } from "../src/io/imported-layout-zip.js";
import {
  createNewEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import {
  addStepSliderControlLayer,
  configureStepSliderControl,
  getLayoutResourceReferences,
  rebindStepSliderControlResource,
} from "../src/model/resource-commands.js";
import { inspectEditorWorkspaceRuntimeEventCatalog } from "../src/model/editor-runtime-event-catalog.js";
import { layoutWorkspaceMarkup } from "../src/ui/layout-workspace.js";
import { createEditorUiSession } from "../src/ui/ui-session.js";

function projectWithSliderImages() {
  const project = createNewEditorProject();
  for (const [id, width, height] of [
    ["fastplay-bar.png", 336, 50],
    ["fastplay-tag.png", 46, 46],
    ["wide-tag.png", 400, 46],
    ["alternate-tag.png", 40, 40],
  ] as const) {
    project.resources.set(id, {
      id,
      kind: "image",
      path: id,
      size: { width, height },
    });
    project.assets.set(id, new Uint8Array([width & 0xff, height]));
  }
  return project;
}

function sliderImageDecoder() {
  const sizes = [
    { width: 336, height: 50 },
    { width: 46, height: 46 },
  ];
  return async () => sizes.shift()!;
}

describe("Game Layout Editor step-slider UI-control layer", () => {
  it("authors two typed image roots and round-trips the v7 union", () => {
    const project = projectWithSliderImages();
    addStepSliderControlLayer({
      project,
      nodeId: "fast-play",
      trackResourceId: "fastplay-bar.png",
      thumbResourceId: "fastplay-tag.png",
      variants: ["landscape", "portrait"],
    });

    expect(getLayoutResourceReferences(project, "fastplay-bar.png")).toEqual([
      expect.objectContaining({
        nodeId: "fast-play",
        role: "ui-control-track",
      }),
    ]);
    expect(getLayoutResourceReferences(project, "fastplay-tag.png")).toEqual([
      expect.objectContaining({
        nodeId: "fast-play",
        role: "ui-control-thumb",
      }),
    ]);

    const manifest = editorProjectToManifest(project);
    expect(manifest.version).toBe(8);
    expect(manifest.nodes[0]).toMatchObject({
      id: "fast-play",
      uiControl: {
        kind: "step-slider",
        track: {
          path: "fastplay-bar.png",
          size: { width: 336, height: 50 },
        },
        thumb: {
          path: "fastplay-tag.png",
          size: { width: 46, height: 46 },
        },
        steps: 3,
        snapDurationSeconds: 0.12,
      },
    });
    const restored = manifestToEditorProject(manifest, project.assets);
    expect(restored.nodes[0]).toMatchObject({
      layerType: "ui-control",
      uiControl: {
        kind: "step-slider",
        trackResourceId: "fastplay-bar.png",
        thumbResourceId: "fastplay-tag.png",
        steps: 3,
        snapDurationSeconds: 0.12,
      },
    });
  });

  it("keeps track and thumb through the production ZIP round-trip", async () => {
    const project = projectWithSliderImages();
    addStepSliderControlLayer({
      project,
      nodeId: "fast-play",
      trackResourceId: "fastplay-bar.png",
      thumbResourceId: "fastplay-tag.png",
      variants: ["landscape", "portrait"],
    });
    const exported = await exportLayoutZip({
      manifest: editorProjectToManifest(project),
      assets: project.assets,
      decodeImage: sliderImageDecoder(),
    });
    const imported = await importLayoutZip(exported.bytes, {
      decodeImage: sliderImageDecoder(),
    });
    try {
      expect([...imported.assets.keys()]).toEqual(
        expect.arrayContaining(["fastplay-bar.png", "fastplay-tag.png"]),
      );
      expect(imported.manifest.nodes[0]).toMatchObject({
        uiControl: {
          kind: "step-slider",
          track: { path: "fastplay-bar.png" },
          thumb: { path: "fastplay-tag.png" },
          steps: 3,
        },
      });
    } finally {
      imported.destroy();
    }
  });

  it("shows explicit authoring controls and all exact档位 events", () => {
    const project = projectWithSliderImages();
    addStepSliderControlLayer({
      project,
      nodeId: "fast-play",
      trackResourceId: "fastplay-bar.png",
      thumbResourceId: "fastplay-tag.png",
      variants: ["landscape", "portrait"],
    });
    const markup = layoutWorkspaceMarkup(
      project,
      { kind: "layer", nodeId: "fast-play" },
      "BaseGame",
      createEditorUiSession(),
      "landscape",
    );
    expect(markup).toContain("UI 控件 / 多档选择框");
    expect(markup).toContain("data-open-add-step-slider");
    expect(markup).toContain('data-rebind-step-slider="track"');
    expect(markup).toContain("uiControl.steps");
    expect(markup).toContain("uiControl.snapDurationSeconds");

    const catalog = inspectEditorWorkspaceRuntimeEventCatalog({
      manifest: editorProjectToManifest(project),
      workspaceFiles: project.assets,
    });
    expect(
      catalog.entries
        .filter((entry) => entry.family === "ui-control-state")
        .map((entry) => entry.descriptor.address),
    ).toEqual([
      "gamelayout:/ui-control/fast-play/step-slider/state/0/entered",
      "gamelayout:/ui-control/fast-play/step-slider/state/1/entered",
      "gamelayout:/ui-control/fast-play/step-slider/state/2/entered",
    ]);
  });

  it("validates configuration and rebinds either image transactionally", () => {
    const project = projectWithSliderImages();
    const node = addStepSliderControlLayer({
      project,
      nodeId: "fast-play",
      trackResourceId: "fastplay-bar.png",
      thumbResourceId: "fastplay-tag.png",
      variants: ["landscape"],
    });
    expect(() =>
      configureStepSliderControl({
        project,
        nodeId: node.id,
        steps: 1,
        snapDurationSeconds: 0.12,
      }),
    ).toThrow(/至少 2/);
    expect(node.uiControl.steps).toBe(3);
    expect(() =>
      rebindStepSliderControlResource({
        project,
        nodeId: node.id,
        role: "thumb",
        resourceId: "wide-tag.png",
      }),
    ).toThrow(/宽度必须大于/);
    expect(node.uiControl.thumbResourceId).toBe("fastplay-tag.png");

    rebindStepSliderControlResource({
      project,
      nodeId: node.id,
      role: "thumb",
      resourceId: "alternate-tag.png",
    });
    configureStepSliderControl({
      project,
      nodeId: node.id,
      steps: 5,
      snapDurationSeconds: 0.2,
    });
    expect(node.uiControl).toMatchObject({
      thumbResourceId: "alternate-tag.png",
      steps: 5,
      snapDurationSeconds: 0.2,
    });
  });

  it("rejects shrinking away an Event audio bound档位", () => {
    const project = projectWithSliderImages();
    const node = addStepSliderControlLayer({
      project,
      nodeId: "fast-play",
      trackResourceId: "fastplay-bar.png",
      thumbResourceId: "fastplay-tag.png",
      variants: ["landscape"],
    });
    project.resources.set("snap.mp3", {
      id: "snap.mp3",
      kind: "audio",
      path: "snap.mp3",
      mediaType: "audio/mpeg",
    });
    project.assets.set("snap.mp3", new Uint8Array([1]));
    project.eventAudio = {
      ...project.eventAudio,
      bindings: [
        {
          event: "gamelayout:/ui-control/fast-play/step-slider/state/2/entered",
          audio: {
            name: "slider-snap",
            asset: {
              sources: [{ path: "snap.mp3", mediaType: "audio/mpeg" }],
            },
            category: "effect",
            playback: "once",
            voices: { maxConcurrent: 1, overflow: "restart-oldest" },
            focus: {},
          },
        },
      ],
    };

    expect(() =>
      configureStepSliderControl({
        project,
        nodeId: node.id,
        steps: 2,
        snapDurationSeconds: 0.12,
      }),
    ).toThrow(/播放 event 不存在/);
    expect(node.uiControl.steps).toBe(3);
  });
});
