import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import { exportPopupZip, importPopupZip } from "../src/io/popup-zip.js";
import {
  commitImportReview,
  discoverPopupResources,
  replaceResourceFromReview,
  POPUP_ZIP_LIMITS,
} from "../src/io/resource-import.js";
import {
  addLayer,
  createPopupEditorProject,
  projectToManifest,
  resourceReferenceCount,
  removeLogicalResource,
} from "../src/model/project.js";

describe("popup editor resource-first project", () => {
  it("starts with fixed five tiers and explicit 15/30/50 defaults but cannot export without amount coverage", () => {
    const project = createPopupEditorProject();
    expect([...project.tiers.keys()]).toEqual([
      "base",
      "standard",
      "bigwin",
      "superwin",
      "megawin",
    ]);
    expect(
      ["bigwin", "superwin", "megawin"].map(
        (id) => project.tiers.get(id as any)!.thresholdMultiplier,
      ),
    ).toEqual([15, 30, 50]);
    expect(() => projectToManifest(project)).toThrow(
      /layers must be non-empty/,
    );
  });

  it("reviews standalone ImgNumber, commits atomically, and exports deterministic round trips", async () => {
    const zip = imageStringZip();
    const file = new File([zip.slice().buffer], "amount.zip", {
      type: "application/zip",
    });
    const review = await discoverPopupResources([file]);
    expect(review[0]).toMatchObject({
      proposedId: "amount",
      kind: "image-string",
      dependencyCount: 13,
    });
    const directoryReview = await discoverPopupResources(
      [
        ...extractBoundedZip(zip, {
          limits: POPUP_ZIP_LIMITS,
          pathPolicy: { requireLowercase: true },
        }),
      ].map(([path, bytes]) => {
        const nested = new File(
          [bytes.slice().buffer],
          path.split("/").at(-1)!,
        );
        Object.defineProperty(nested, "webkitRelativePath", {
          value: `amount/${path}`,
        });
        return nested;
      }),
      "directory",
    );
    expect(directoryReview[0]).toMatchObject({
      proposedId: "amount",
      kind: "image-string",
      dependencyCount: 13,
    });
    const project = createPopupEditorProject();
    expect(project.resources.size).toBe(0);
    commitImportReview(project, review);
    expect(resourceReferenceCount(project, "amount")).toBe(0);
    for (const tier of project.tiers.keys()) addLayer(project, tier, "amount");
    expect(projectToManifest(project).resources.amount.kind).toBe(
      "image-string",
    );
    const first = await exportPopupZip(project, { prepare: false });
    const second = await exportPopupZip(project, { prepare: false });
    expect(first.bytes).toEqual(second.bytes);
    const imported = importPopupZip(first.bytes);
    expect(projectToManifest(imported)).toEqual(projectToManifest(project));
  });

  it("content-addresses PNG by bytes and upload does not bind a layer", async () => {
    const png = pngHeader(2, 3);
    const review = await discoverPopupResources([
      new File([png.buffer], "BG_2.PNG"),
    ]);
    expect(review[0]!.proposedId).toBe("bg-2");
    expect(review[0]!.spec).toMatchObject({
      kind: "image",
      size: { width: 2, height: 3 },
    });
    expect((review[0]!.spec as { path: string }).path).toMatch(
      /^assets\/[a-f0-9]{64}\.png$/u,
    );
    const project = createPopupEditorProject();
    commitImportReview(project, review);
    expect(
      [...project.tiers.values()].flatMap((tier) => tier.layers),
    ).toHaveLength(0);

    const oldPath = project.resources.get("bg-2")!.paths[0]!;
    const replacement = await discoverPopupResources([
      new File([pngHeader(4, 5).buffer], "replacement.png"),
    ]);
    replaceResourceFromReview(project, "bg-2", replacement[0]!);
    expect(project.resources.get("bg-2")!.spec).toMatchObject({
      kind: "image",
      size: { width: 4, height: 5 },
    });
    expect(project.packageFiles.has(oldPath)).toBe(false);
    expect(project.blobs.size).toBe(1);
    removeLogicalResource(project, "bg-2");
    expect(project.packageFiles.size).toBe(0);
    expect(project.blobs.size).toBe(0);
  });
});

function imageStringZip() {
  const characters = [..."$,.0123456789"];
  const glyphs = Object.fromEntries(
    characters.map((character, index) => [
      character,
      {
        path: `assets/g${index}.png`,
        size: { width: 1, height: 1 },
        offset: { x: 0, y: 0 },
      },
    ]),
  );
  const manifest = {
    version: 1,
    kind: "image-string",
    id: "amount",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs,
    fixedAdvanceGroups: [],
  };
  const entries = new Map<string, Uint8Array>([
    [
      "image-string.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    ],
  ]);
  characters.forEach((_, index) =>
    entries.set(`assets/g${index}.png`, pngHeader(1, 1)),
  );
  return createDeterministicZip(entries, {
    pathPolicy: { requireLowercase: true },
  });
}
function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
