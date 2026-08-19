import { describe, expect, it } from "vitest";
import { convertProjectCoordinateOrigin } from "../src/model/coordinate-origin.js";
import {
  createNewEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { EditorStore } from "../src/model/editor-store.js";
import {
  assignBackgroundResource,
  uploadImageResource,
} from "../src/model/resource-commands.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("coordinate origin conversion", () => {
  it("converts images, Spine-style placements, transitions and the reel reversibly", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    project.resources.set("spine", {
      id: "spine",
      kind: "spine",
      skeleton: "assets/spine.json",
      atlas: "assets/spine.atlas",
      textures: { "spine.png": "assets/spine.png" },
      animationNames: ["Idle", "Switch"],
      animationEvents: { Switch: [{ name: "SwitchScene", time: 0 }] },
    });
    project.assets.set("assets/spine.json", new Uint8Array([1]));
    project.assets.set("assets/spine.atlas", new Uint8Array([2]));
    project.assets.set("assets/spine.png", new Uint8Array([3]));
    project.nodes.push({
      id: "overlay",
      order: 1,
      resourceId: "spine",
      playback: { kind: "loop", animation: "Idle", loop: true },
      placements: {
        default: {
          x: 70,
          y: 80,
          scale: 1,
          rotation: 90,
          center: { x: 0.5, y: 0.5 },
        },
      },
      hiddenPlacements: {
        default: {
          x: 90,
          y: 100,
          scale: 1,
          rotation: -180,
          center: { x: 0.25, y: 0.75 },
        },
      },
    });
    const manifestNode = editorProjectToManifest(project).nodes.find(
      (node) => node.id === "overlay",
    )!;
    expect(manifestNode).not.toHaveProperty("hiddenPlacements");
    project.gameModes.transitions.push({
      kind: "spine",
      fromModeId: "BaseGame",
      toModeId: "FreeGame",
      resourceId: "spine",
      animation: "Switch",
      switchEvent: "SwitchScene",
      placements: { default: { x: 60, y: 40, scale: 1 } },
    });
    const original = structuredClone({
      nodes: project.nodes.map((node) => node.placements),
      hiddenNodes: project.nodes.map((node) => node.hiddenPlacements),
      reel: project.reel.placements,
      transitions: project.gameModes.transitions.map(
        (transition) => transition.kind === "spine" && transition.placements,
      ),
    });

    convertProjectCoordinateOrigin(project, "center");

    expect(project.coordinateOrigin).toBe("center");
    expect(project.nodes[0]?.placements.default).toEqual({
      x: -49.5,
      y: -49.5,
      scale: 1,
      rotation: 0,
      center: { x: 0.5, y: 0.5 },
    });
    expect(project.nodes[1]?.placements.default).toEqual({
      x: 20,
      y: 30,
      scale: 1,
      rotation: 90,
      center: { x: 0.5, y: 0.5 },
    });
    expect(project.nodes[1]?.hiddenPlacements?.default).toEqual({
      x: 40,
      y: 50,
      scale: 1,
      rotation: -180,
      center: { x: 0.25, y: 0.75 },
    });
    expect(project.reel.placements.default).toEqual({
      x: -7.5,
      y: -8.5,
    });
    expect(project.gameModes.transitions[0]).toMatchObject({
      placements: { default: { x: 10, y: -10, scale: 1 } },
    });
    convertProjectCoordinateOrigin(project, "top-left");
    expect({
      nodes: project.nodes.map((node) => node.placements),
      hiddenNodes: project.nodes.map((node) => node.hiddenPlacements),
      reel: project.reel.placements,
      transitions: project.gameModes.transitions.map(
        (transition) => transition.kind === "spine" && transition.placements,
      ),
    }).toEqual(original);
  });

  it("keeps the store unchanged when conversion validation fails", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    const store = new EditorStore(project);
    const before = store.getSnapshot();
    const beforeProject = before.project;

    expect(() =>
      store.transact((draft) => {
        draft.variants.default.artSize.width = 0;
        convertProjectCoordinateOrigin(draft, "center");
      }),
    ).toThrow(/artSize/);
    expect(store.getSnapshot()).toMatchObject({ revision: before.revision });
    expect(store.getSnapshot().project).toBe(beforeProject);
  });

  it("converts reel placements for every game mode before changing the global origin", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    project.reel.placements.default = { x: 40, y: 20 };
    const secondMode = structuredClone(project.gameModes.modes[0]!);
    secondMode.id = "FreeGame";
    project.gameModes.modes.push(secondMode);
    const store = new EditorStore(project);

    store.transact((draft) => convertProjectCoordinateOrigin(draft, "center"));

    const centered = store.getSnapshot();
    expect(centered.errors).toEqual([]);
    expect(
      centered.project.gameModes.modes.map(
        (mode) => mode.reelPlacements.default,
      ),
    ).toEqual([
      { x: 12.5, y: -8.5 },
      { x: 12.5, y: -8.5 },
    ]);

    store.transact((draft) =>
      convertProjectCoordinateOrigin(draft, "top-left"),
    );

    expect(store.getSnapshot().errors).toEqual([]);
    expect(
      store
        .getSnapshot()
        .project.gameModes.modes.map((mode) => mode.reelPlacements.default),
    ).toEqual([
      { x: 40, y: 20 },
      { x: 40, y: 20 },
    ]);
  });

  it("preserves independent center-origin reel and focus geometry when art size changes", async () => {
    const project = createNewEditorProject("orientation-focus");
    project.reel.columns = 5;
    project.reel.rows = 5;
    project.reel.cellWidth = 172;
    project.reel.cellHeight = 130;
    project.reel.gapX = 6;
    project.reel.gapY = 0;
    const uploadBackground = async (
      name: string,
      width: number,
      height: number,
    ) =>
      uploadImageResource({
        project,
        file: new File(
          [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
          name,
        ),
        decodeImage: async () => ({ width, height }),
      });
    await uploadBackground("landscape.png", 2000, 1125);
    await uploadBackground("portrait.png", 1174, 2000);
    await uploadBackground("square.png", 2000, 2000);
    assignBackgroundResource({
      project,
      variant: "landscape",
      resourceId: "landscape.png",
    });
    assignBackgroundResource({
      project,
      variant: "portrait",
      resourceId: "portrait.png",
    });
    project.reel.placements.landscape = { x: 682, y: 254 };
    project.variants.landscape.focusRect = {
      x: 22,
      y: 94,
      width: 1954,
      height: 940,
    };
    convertProjectCoordinateOrigin(project, "center");
    assignBackgroundResource({
      project,
      variant: "landscape",
      resourceId: "square.png",
    });

    expect(project.reel.placements.landscape).toEqual({ x: 124, y: 16.5 });
    expect(project.variants.landscape.artSize).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(project.variants.landscape.focusRect).toEqual({
      x: 22,
      y: 94,
      width: 1954,
      height: 940,
    });
    expect(() => editorProjectToManifest(project)).not.toThrow();
  });
});
