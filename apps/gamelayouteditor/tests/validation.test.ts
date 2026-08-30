import { describe, expect, it } from "vitest";
import { parseSceneLayoutManifestDocument } from "@slotclientengine/rendercore/scene-layout/data";
import {
  createDefaultNodePlacement,
  createNewEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";

describe("editor scene-layout v7 contract", () => {
  it("exports a background-free project as the latest centered manifest", () => {
    const manifest = editorProjectToManifest(createNewEditorProject());

    expect(manifest).toMatchObject({
      version: 7,
      kind: "scene-layout",
      main: {
        columns: 5,
        rows: 3,
        cellSize: { width: 160, height: 160 },
      },
      nodes: [],
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            main: {
              enabled: true,
              variants: {
                landscape: { x: 0, y: 0 },
                portrait: { x: 0, y: 0 },
              },
            },
          },
        ],
      },
    });
    expect(manifest).not.toHaveProperty("adaptation");
    expect(manifest).not.toHaveProperty("artSize");
    expect(manifest.gameModes.modes[0]).not.toHaveProperty("type");
    expect(manifest.gameModes.modes[0]).not.toHaveProperty("backgroundNodes");
  });

  it("keeps focusRect with the main variant", () => {
    const project = createNewEditorProject();
    const landscape = project.gameModes.modes[0]!.mainVariants.landscape;
    landscape.x = 24;
    landscape.y = -18;
    landscape.focusRect = { x: -460, y: -300, width: 920, height: 600 };
    landscape.minFocusMargin.left = 12;

    expect(
      editorProjectToManifest(project).gameModes.modes[0]!.main.variants
        .landscape,
    ).toEqual({
      x: 24,
      y: -18,
      focusRect: { x: -460, y: -300, width: 920, height: 600 },
      minFocusMargin: { left: 12, right: 0, top: 0, bottom: 0 },
    });
  });

  it("exports one or two backgrounds as ordinary image layers", () => {
    const project = createNewEditorProject();
    for (const [index, id] of ["landscape-bg", "portrait-bg"].entries()) {
      project.resources.set(id, {
        id,
        kind: "image",
        path: `${id}.png`,
        size: { width: 100, height: 100 },
      });
      project.assets.set(`${id}.png`, new Uint8Array([index]));
      project.nodes.push({
        id,
        order: index,
        resourceId: id,
        placements: {
          [index === 0 ? "landscape" : "portrait"]:
            createDefaultNodePlacement(),
        },
      });
    }

    const manifest = editorProjectToManifest(project);
    expect(manifest.nodes.map(({ id }) => id)).toEqual([
      "landscape-bg",
      "portrait-bg",
    ]);
    expect(manifest.nodes[0]!.placements).toHaveProperty("landscape");
    expect(manifest.nodes[1]!.placements).toHaveProperty("portrait");
  });

  it("exports mode-scoped ordinary layers without a background role", () => {
    const project = createNewEditorProject();
    project.resources.set("decoration.png", {
      id: "decoration.png",
      kind: "image",
      path: "decoration.png",
      size: { width: 80, height: 40 },
    });
    project.assets.set("decoration.png", new Uint8Array([1]));
    project.nodes.push({
      id: "decoration",
      order: 0,
      resourceId: "decoration.png",
      scope: { BaseGame: ["portrait"] },
      placements: { portrait: createDefaultNodePlacement(10, -20) },
    });

    expect(editorProjectToManifest(project).nodes[0]).toMatchObject({
      id: "decoration",
      scope: { BaseGame: ["portrait"] },
      placements: { portrait: { x: 10, y: -20, center: { x: 0.5, y: 0.5 } } },
    });
  });

  it("imports legacy top-left data with canonical landscape/portrait defaults", () => {
    const legacy = parseSceneLayoutManifestDocument({
      version: 1,
      kind: "scene-layout",
      id: "legacy",
      adaptation: {
        mode: "maximized-focus",
        artSize: { width: 1000, height: 600 },
        focusRect: { x: 100, y: 50, width: 800, height: 500 },
        backgroundNode: "background",
      },
      nodes: [
        {
          id: "background",
          order: 0,
          resource: {
            kind: "image",
            path: "background.png",
            size: { width: 1000, height: 600 },
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
      reels: {
        main: {
          order: 1,
          columns: 5,
          rows: 3,
          cellSize: { width: 100, height: 100 },
          gap: { x: 0, y: 0 },
          placements: { default: { x: 250, y: 150 } },
        },
      },
    });

    const project = manifestToEditorProject(
      legacy,
      new Map([["background.png", new Uint8Array([1])]]),
    );
    const latest = editorProjectToManifest(project);
    expect(latest.version).toBe(7);
    expect(latest.nodes[0]!.placements).toHaveProperty("landscape");
    expect(latest.nodes[0]!.placements).toHaveProperty("portrait");
    expect(latest.gameModes.modes[0]!.main.variants.landscape).toEqual(
      latest.gameModes.modes[0]!.main.variants.portrait,
    );
  });

  it("fails explicitly for invalid main or missing layer resources", () => {
    const invalidMain = createNewEditorProject();
    invalidMain.reel.columns = 0;
    expect(() => editorProjectToManifest(invalidMain)).toThrow(/columns/u);

    const missingResource = createNewEditorProject();
    missingResource.nodes.push({
      id: "missing",
      order: 0,
      resourceId: "missing.png",
      placements: { landscape: createDefaultNodePlacement() },
    });
    expect(() => editorProjectToManifest(missingResource)).toThrow(
      /未知资源|missing\.png/u,
    );
  });
});
