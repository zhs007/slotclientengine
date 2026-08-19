import { describe, expect, it } from "vitest";
import { createDefaultEditorAssetsController } from "../src/assets/adapters/index.js";
import { computeEditorAssetUsage } from "../src/assets/core/index.js";
import type { EditorAssetsController } from "../src/assets/core/index.js";
import type { EditorAssetHostAdapter } from "../src/assets/data/index.js";

interface Project {
  references: string[];
  programs: Record<string, string>;
}

const host: EditorAssetHostAdapter<Project> = {
  cloneProject: structuredClone,
  collectReferences: (project) =>
    project.references.map((rootKey) => ({
      rootKey,
      location: `ref:${rootKey}`,
    })),
  collectProgramBindings: (project) =>
    Object.entries(project.programs).map(([name, rootKey]) => ({
      rootKey,
      name,
      location: `program:${name}`,
    })),
  renameReferences: (project, from, to) => ({
    ...project,
    references: project.references.map((key) => (key === from ? to : key)),
    programs: Object.fromEntries(
      Object.entries(project.programs).map(([name, key]) => [
        name,
        key === from ? to : key,
      ]),
    ),
  }),
  setProgramBinding: (project, rootKey, name) => ({
    ...project,
    programs: name ? { ...project.programs, [name]: rootKey } : {},
  }),
  validateProject(project, catalog) {
    for (const key of [
      ...project.references,
      ...Object.values(project.programs),
    ])
      if (!catalog.roots.has(key)) throw new Error(`missing root ${key}`);
  },
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

describe("EditorAssetsController", () => {
  it("imports, binds, exports deduplicated payload, renames, and deletes atomically", async () => {
    const controller = createDefaultEditorAssetsController({
      project: { references: [], programs: {} },
      host,
    });
    await importFiles(controller, [source("A.png", PNG), source("B.png", PNG)]);
    expect([...controller.snapshot.catalog.roots.keys()]).toEqual([
      "A.png",
      "B.png",
    ]);
    await controller.setProgramBinding("A.png", "coin");
    const usage = computeEditorAssetUsage({
      catalog: controller.snapshot.catalog,
      project: controller.snapshot.project,
      host,
    });
    expect(usage.byRootKey.get("A.png")?.programBindings[0]?.name).toBe("coin");
    expect(controller.materializePayloads(["A.png", "B.png"]).size).toBe(1);
    await expect(controller.deleteRoot("A.png")).rejects.toThrow(/仍被使用/u);
    await controller.setProgramBinding("A.png", null);
    await controller.renameRoot("A.png", "Renamed.png");
    expect(controller.snapshot.catalog.roots.has("Renamed.png")).toBe(true);
    await controller.deleteRoot("Renamed.png");
    expect(controller.snapshot.workspace.entries.has("Renamed.png")).toBe(
      false,
    );
    controller.destroy();
    expect(() => controller.createExportPlan()).toThrow(/销毁/u);
  });

  it("requires explicit overwrite resolution and supports atomic keep-both", async () => {
    const controller = createDefaultEditorAssetsController({
      project: { references: [], programs: {} },
      host,
    });
    await importFiles(controller, [source("A.png", PNG)]);
    const other = new Uint8Array([...PNG.slice(0, -1), 2]);
    const preparation = await controller.prepareImport([
      source("A.png", other),
    ]);
    await expect(controller.commitImport(preparation)).rejects.toThrow(
      /尚未选择/u,
    );
    await controller.commitImport(preparation, [
      { itemIndex: 0, resolution: "keep-both" },
    ]);
    expect([...controller.snapshot.catalog.roots.keys()].sort()).toEqual([
      "A-1.png",
      "A.png",
    ]);
  });

  it("keeps the previous snapshot when host candidate validation fails", async () => {
    const controller = createDefaultEditorAssetsController({
      project: { references: [], programs: {} },
      host: {
        ...host,
        validateProject: () => {
          throw new Error("host rejected candidate");
        },
      },
    });
    const preparation = await controller.prepareImport([source("A.png", PNG)]);
    await expect(controller.commitImport(preparation)).rejects.toThrow(
      /host rejected candidate/u,
    );
    expect(controller.snapshot.catalog.roots.size).toBe(0);
    expect(controller.snapshot.workspace.entries.size).toBe(0);
  });
});

async function importFiles(
  controller: EditorAssetsController<Project>,
  files: ReturnType<typeof source>[],
) {
  const preparation = await controller.prepareImport(files);
  expect(preparation.blockingErrors).toEqual([]);
  await controller.commitImport(preparation);
}

function source(name: string, bytes: Uint8Array) {
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.slice().buffer;
    },
  };
}
