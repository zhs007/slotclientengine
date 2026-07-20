import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import {
  commitImportReview,
  discoverPopupResources,
} from "../src/io/resource-import.js";
import {
  applyImportedResourceBindings,
  createPopupEditorProject,
  PopupEditorStore,
} from "../src/model/project.js";
import { importPopupZip } from "../src/io/popup-zip.js";

describe("popup resource discovery", () => {
  it("materializes a real VNI closure and keeps unrelated images as independent resources", async () => {
    const projectPath = asset("game003-s1/win-amount/bigwin.json");
    const projectBytes = new Uint8Array(readFileSync(projectPath));
    const project = JSON.parse(new TextDecoder().decode(projectBytes)) as {
      assets: readonly { path: string }[];
    };
    const files = [
      sourceFile("bigwin.json", projectBytes),
      ...project.assets.map(({ path }) =>
        sourceFile(
          path,
          new Uint8Array(readFileSync(resolve(projectPath, "..", path))),
        ),
      ),
    ];
    const review = await discoverPopupResources(files, "directory");
    expect(review[0]).toMatchObject({
      kind: "vni",
      proposedId: "bigwin",
      dependencyCount: project.assets.length,
    });
    const spec = review[0]!.spec;
    expect(spec.kind).toBe("vni");
    if (spec.kind !== "vni") throw new Error("expected VNI");
    const rewritten = new TextDecoder().decode(
      review[0]!.files.get(spec.project),
    );
    expect(rewritten).not.toContain("assets/3_asset_image");
    expect(rewritten).toMatch(/[a-f0-9]{64}\.png/u);
    const mixed = await discoverPopupResources(
      [...files, sourceFile("extra.png", png(1, 1))],
      "directory",
    );
    expect(mixed.map(({ kind, proposedId }) => [kind, proposedId])).toEqual([
      ["vni", "bigwin"],
      ["image", "extra"],
    ]);
  });

  it("discovers the complete game003 win-amount folder as three manifest-ordered VNI resources", async () => {
    const root = asset("game003-s1/win-amount");
    const projectNames = ["bigwin.json", "superwin.json", "megawin.json"];
    const assetPaths = new Set<string>();
    const files = [
      sourceFile(
        "win-amount/win-amount.manifest.json",
        new Uint8Array(readFileSync(resolve(root, "win-amount.manifest.json"))),
      ),
      sourceFile("win-amount/.DS_Store", new Uint8Array([1, 2, 3])),
      sourceFile("win-amount/assets/.DS_Store", new Uint8Array([4, 5, 6])),
    ];
    for (const name of projectNames) {
      const payload = new Uint8Array(readFileSync(resolve(root, name)));
      const project = JSON.parse(new TextDecoder().decode(payload)) as {
        assets: readonly { path: string }[];
      };
      files.push(sourceFile(`win-amount/${name}`, payload));
      for (const asset of project.assets) assetPaths.add(asset.path);
    }
    for (const path of [...assetPaths].sort())
      files.push(
        sourceFile(
          `win-amount/${path}`,
          new Uint8Array(readFileSync(resolve(root, path))),
        ),
      );
    const review = await discoverPopupResources(files, "directory");
    expect(review.map(({ kind, proposedId }) => [kind, proposedId])).toEqual([
      ["vni", "bigwin"],
      ["vni", "superwin"],
      ["vni", "megawin"],
    ]);
    expect(review.every(({ dependencyCount }) => dependencyCount > 0)).toBe(
      true,
    );
    expect(
      review.map(({ suggestedTierBindings }) => suggestedTierBindings),
    ).toEqual([
      [
        {
          tierId: "bigwin",
          countDurationSeconds: 2.9,
          playback: {
            loopStartTime: 1,
            loopEndTime: 2.5,
            keepParticlesAlive: true,
          },
        },
      ],
      [
        {
          tierId: "superwin",
          countDurationSeconds: 2.9,
          playback: {
            loopStartTime: 1,
            loopEndTime: 2.5,
            keepParticlesAlive: true,
          },
        },
      ],
      [
        {
          tierId: "megawin",
          countDurationSeconds: 2.9,
          playback: {
            loopStartTime: 1,
            loopEndTime: 2.5,
            keepParticlesAlive: true,
          },
        },
      ],
    ]);
    const project = createPopupEditorProject();
    commitImportReview(project, review);
    for (const candidate of review)
      applyImportedResourceBindings(
        project,
        candidate.proposedId,
        candidate.suggestedTierBindings,
      );
    expect(
      ["base", "standard", "bigwin", "superwin", "megawin"].map(
        (id) => project.tiers.get(id as any)!.layers.length,
      ),
    ).toEqual([0, 0, 1, 1, 1]);
    expect(
      ["bigwin", "superwin", "megawin"].map(
        (id) => project.tiers.get(id as any)!.thresholdMultiplier,
      ),
    ).toEqual([15, 25, 50]);
    expect(project.tiers.get("superwin")!.layers[0]).toMatchObject({
      resource: "superwin",
      playback: {
        loopStartTime: 1,
        loopEndTime: 2.5,
        keepParticlesAlive: true,
      },
    });
  });

  it("materializes official Spine 4.3 atlas pages and validates metadata", async () => {
    const files = [
      sourceFile("WL.json", bytes("game003-s1/WL.json")),
      sourceFile("Symbol.atlas", bytes("game003-s1/Symbol.atlas")),
      sourceFile("Symbol.png", bytes("game003-s1/Symbol.png")),
    ];
    const review = await discoverPopupResources(files);
    expect(review[0]!.kind).toBe("spine");
    expect(review[0]!.summary).toMatch(/animations/);
    const spec = review[0]!.spec;
    if (spec.kind !== "spine") throw new Error("expected Spine");
    expect(
      new TextDecoder().decode(review[0]!.files.get(spec.atlas)),
    ).not.toContain("Symbol.png");
  });

  it("keeps review/commit atomic on ids, candidate errors and source ambiguity", async () => {
    await expect(
      discoverPopupResources([sourceFile("unknown.txt", new Uint8Array([1]))]),
    ).rejects.toThrow(/无法识别、未引用或不完整/);
    const review = await discoverPopupResources([
      sourceFile("BG_2.PNG", png(2, 3)),
    ]);
    const project = createPopupEditorProject();
    commitImportReview(project, review);
    expect(project.resources.has("bg-2")).toBe(true);
    expect(() => commitImportReview(project, review)).toThrow(/已存在/);
    const bad = [{ ...review[0]!, proposedId: "Bad Id" }];
    expect(() => commitImportReview(project, bad)).toThrow(
      /logical resource id/,
    );
    expect(() =>
      commitImportReview(createPopupEditorProject(), [
        { ...review[0]!, errors: ["broken"] },
      ]),
    ).toThrow(/broken/);
  });

  it("notifies store diagnostics and rejects malformed popup project ZIP", () => {
    const store = new PopupEditorStore();
    const listener = vi.fn();
    const dispose = store.subscribe(listener);
    store.transact((project) => {
      project.id = "Bad";
    });
    expect(listener).toHaveBeenCalled();
    store.replace(createPopupEditorProject());
    dispose();
    expect(() =>
      importPopupZip(
        createDeterministicZip(new Map([["x.txt", new Uint8Array([1])]])),
      ),
    ).toThrow(/sentinel/);
  });
});

function asset(path: string) {
  return resolve(process.cwd(), "../../assets", path);
}
function bytes(path: string) {
  return new Uint8Array(readFileSync(asset(path)));
}
function sourceFile(path: string, payload: Uint8Array): File {
  const file = new File([payload.slice().buffer], path.split("/").at(-1)!);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}
function png(width: number, height: number) {
  const data = new Uint8Array(24);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(data.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return data;
}
