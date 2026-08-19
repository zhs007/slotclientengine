import { describe, expect, it } from "vitest";
import {
  computeEditorAssetUsage,
  createEmptyEditorAssetCatalog,
  mergeEditorAssetCatalog,
  projectEditorAssetTree,
  validateEditorAssetCatalog,
} from "../src/assets/core/index.js";
import type {
  EditorAssetHostAdapter,
  EditorAssetRootDraft,
} from "../src/assets/data/index.js";

interface Project {
  references: string[];
  programs: Readonly<Record<string, string>>;
}

const host: EditorAssetHostAdapter<Project> = {
  cloneProject: structuredClone,
  collectReferences: (project) =>
    project.references.map((rootKey) => ({
      rootKey,
      location: `node:${rootKey}`,
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
  }),
  setProgramBinding: (project, rootKey, name) => ({
    ...project,
    programs: name ? { ...project.programs, [name]: rootKey } : {},
  }),
};

describe("asset catalog", () => {
  it("projects shared leaves below multiple roots without duplicating identity", () => {
    const catalog = mergeEditorAssetCatalog(createEmptyEditorAssetCatalog(), [
      spineDraft("A.json"),
      spineDraft("B.json"),
    ]);
    expect(catalog.nodes.has("file:shared.atlas")).toBe(true);
    expect(
      [...catalog.nodes.keys()].filter((id) => id === "file:page.png"),
    ).toHaveLength(1);
    const collapsed = projectEditorAssetTree({ catalog, expanded: new Set() });
    expect(collapsed.map(({ rootKey }) => rootKey)).toEqual([
      "A.json",
      "B.json",
    ]);
    const expanded = projectEditorAssetTree({
      catalog,
      expanded: new Set([
        "root:A.json",
        "root:A.json/0:contains:file:A.json",
        "root:A.json/0:contains:file:A.json/0:uses-atlas:file:shared.atlas",
        "root:B.json",
        "root:B.json/0:contains:file:B.json",
        "root:B.json/0:contains:file:B.json/0:uses-atlas:file:shared.atlas",
      ]),
    });
    expect(expanded.filter(({ node }) => node.key === "page.png")).toHaveLength(
      2,
    );
  });

  it("derives direct, programmatic, and transitive usage", () => {
    const catalog = mergeEditorAssetCatalog(createEmptyEditorAssetCatalog(), [
      spineDraft("A.json"),
      spineDraft("B.json"),
    ]);
    const usage = computeEditorAssetUsage({
      catalog,
      project: {
        references: ["A.json"],
        programs: { celebration: "B.json" },
      },
      host,
    });
    expect(usage.byRootKey.get("A.json")?.directReferences).toHaveLength(1);
    expect(usage.byRootKey.get("B.json")?.programBindings[0]?.name).toBe(
      "celebration",
    );
    expect(usage.byNodeId.get("file:page.png")?.inheritedFromRoots).toEqual([
      "A.json",
      "B.json",
    ]);
  });

  it("rejects relation cycles", () => {
    const draft = spineDraft("A.json");
    const catalog = {
      roots: new Map([[draft.key, draft]]),
      nodes: new Map(draft.nodes.map((node) => [node.id, node])),
      relations: [
        ...draft.relations,
        { from: "file:page.png", to: draft.nodeId, kind: "contains" as const },
      ],
    };
    expect(() => validateEditorAssetCatalog(catalog)).toThrow(/cycle/u);
  });
});

function spineDraft(key: string): EditorAssetRootDraft {
  const rootId = `root:spine:${key}`;
  return {
    key,
    kind: "spine",
    nodeId: rootId,
    owner: `spine:${key}`,
    exactKeys: [key, "shared.atlas", "page.png"],
    inputs: [],
    nodes: [
      { id: rootId, kind: "spine", key, label: key, metadata: {} },
      { id: `file:${key}`, kind: "skeleton", key, label: key, metadata: {} },
      {
        id: "file:shared.atlas",
        kind: "atlas",
        key: "shared.atlas",
        label: "shared.atlas",
        metadata: {},
      },
      {
        id: "file:page.png",
        kind: "texture",
        key: "page.png",
        label: "page.png",
        metadata: {},
      },
    ],
    relations: [
      { from: rootId, to: `file:${key}`, kind: "contains" },
      { from: `file:${key}`, to: "file:shared.atlas", kind: "uses-atlas" },
      { from: "file:shared.atlas", to: "file:page.png", kind: "uses-texture" },
    ],
  };
}
