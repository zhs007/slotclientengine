import { describe, expect, it } from "vitest";
import { convertProjectCoordinateOrigin } from "../src/model/coordinate-origin.js";
import { manifestToEditorProject } from "../src/model/editor-project.js";
import { EditorStore } from "../src/model/editor-store.js";
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
    project.nodes.push({
      id: "overlay",
      order: 1,
      resourceId: "spine",
      placements: { default: { x: 70, y: 80, scale: 1 } },
    });
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
    });
    expect(project.nodes[1]?.placements.default).toEqual({
      x: 20,
      y: 30,
      scale: 1,
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
});
