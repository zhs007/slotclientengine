import { describe, expect, it } from "vitest";
import {
  addImageFileToProject,
  addSpineFilesToProject,
  removeNodeFromProject,
} from "../src/model/validation.js";
import { createNewEditorProject } from "../src/model/editor-project.js";

describe("editor upload validation", () => {
  it("adds exact image bytes and protects a referenced background", async () => {
    const project = createNewEditorProject("maximized-focus");
    const file = new File([new Uint8Array([1, 2, 3])], "BG.PNG", {
      type: "image/png",
    });
    const node = await addImageFileToProject({
      project,
      file,
      variants: ["default"],
      backgroundVariant: "default",
      decodeImage: async () => ({ width: 2000, height: 2000 }),
    });
    expect(node.id).toBe("bg");
    expect(project.assets.get("assets/bg.png")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(project.variants.default.artSize).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(project.reel).toMatchObject({
      columns: 5,
      rows: 3,
      cellWidth: 160,
      cellHeight: 160,
      placements: { default: { x: 600, y: 760 } },
    });
    expect(project.variants.default.focusRect).toEqual({
      x: 540,
      y: 700,
      width: 920,
      height: 600,
    });
    expect(project.variants.default.focusOffsets).toEqual({
      left: -60,
      top: -60,
      right: 60,
      bottom: 60,
    });
    expect(() => removeNodeFromProject(project, "bg")).toThrow(/引用/);
    await expect(
      addImageFileToProject({
        project,
        file,
        variants: ["default"],
        decodeImage: async () => ({ width: 2000, height: 2000 }),
      }),
    ).rejects.toThrow(/冲突/);
  });

  it("imports Spine files, rewrites atlas pages and requires explicit animation", async () => {
    const project = createNewEditorProject("orientation-focus");
    const files = [
      new File(
        [
          JSON.stringify({
            skeleton: { spine: "4.3.23" },
            animations: { Idle: {} },
          }),
        ],
        "Hero.JSON",
      ),
      new File(["PAGE.PNG\nsize: 1,1\nfilter: Linear,Linear\n"], "Hero.ATLAS"),
      new File([new Uint8Array([9])], "PAGE.PNG", { type: "image/png" }),
    ];
    const node = await addSpineFilesToProject({
      project,
      files,
      variants: ["landscape", "portrait"],
    });
    expect(node.id).toBe("hero");
    expect(node.animationNames).toEqual(["Idle"]);
    expect(node.resource).toMatchObject({
      kind: "spine",
      defaultAnimation: "",
      textures: { "page.png": "assets/page.png" },
    });
    expect(
      new TextDecoder().decode(project.assets.get("assets/hero.atlas")),
    ).toContain("page.png\nsize:");
    expect(() => removeNodeFromProject(project, "hero")).not.toThrow();
    expect(project.assets.size).toBe(0);
  });

  it("uses Spine skeleton bounds to initialize a background immediately", async () => {
    const project = createNewEditorProject("maximized-focus");
    await addSpineFilesToProject({
      project,
      files: [
        new File(
          [
            JSON.stringify({
              skeleton: { spine: "4.3.23", width: 1200, height: 800 },
              animations: { Idle: {} },
            }),
          ],
          "bg.json",
        ),
        new File(["page.png\nsize: 1,1\n"], "bg.atlas"),
        new File(["x"], "page.png"),
      ],
      variants: ["default"],
      backgroundVariant: "default",
    });
    expect(project.variants.default.artSize).toEqual({
      width: 1200,
      height: 800,
    });
    expect(project.variants.default.focusRect).toEqual({
      x: 140,
      y: 100,
      width: 920,
      height: 600,
    });
  });

  it("rejects incomplete Spine selections", async () => {
    await expect(
      addSpineFilesToProject({
        project: createNewEditorProject("maximized-focus"),
        files: [new File(["{}"], "only.json")],
        variants: ["default"],
      }),
    ).rejects.toThrow(/恰好包含/);
  });

  it("rejects missing/extra atlas pages, missing animations and background reuse", async () => {
    const skeleton = (animations: object) =>
      new File([JSON.stringify({ animations })], "fx.json");
    const atlas = new File(["page.png\nsize: 1,1\n"], "fx.atlas");
    await expect(
      addSpineFilesToProject({
        project: createNewEditorProject("maximized-focus"),
        files: [skeleton({ Idle: {} }), atlas, new File(["x"], "other.png")],
        variants: ["default"],
      }),
    ).rejects.toThrow(/缺少 texture/);
    await expect(
      addSpineFilesToProject({
        project: createNewEditorProject("maximized-focus"),
        files: [
          skeleton({ Idle: {} }),
          atlas,
          new File(["x"], "page.png"),
          new File(["y"], "extra.png"),
        ],
        variants: ["default"],
      }),
    ).rejects.toThrow(/未引用/);
    await expect(
      addSpineFilesToProject({
        project: createNewEditorProject("maximized-focus"),
        files: [skeleton({}), atlas, new File(["x"], "page.png")],
        variants: ["default"],
      }),
    ).rejects.toThrow(/没有 animation/);
    const project = createNewEditorProject("maximized-focus");
    project.variants.default.backgroundNode = "existing";
    await expect(
      addSpineFilesToProject({
        project,
        files: [skeleton({ Idle: {} }), atlas, new File(["x"], "page.png")],
        variants: ["default"],
        backgroundVariant: "default",
      }),
    ).rejects.toThrow(/已经设置/);
    expect(project.nodes).toHaveLength(0);
    expect(project.assets.size).toBe(0);
    expect(() => removeNodeFromProject(project, "unknown")).toThrow(/未知节点/);
  });
});
