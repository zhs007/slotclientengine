import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import { exportPopupZip, importPopupZip } from "../src/io/popup-zip.js";
import {
  commitImportReview,
  discoverPopupResources,
  POPUP_ZIP_LIMITS,
} from "../src/io/resource-import.js";
import {
  addLayer,
  applyImportedResourceBindings,
  createPopupAmountFormat,
  createPopupEditorProject,
  detectPopupAmountFormatPreset,
  projectToManifest,
  removePopupResource,
  resourceReferenceCount,
} from "../src/model/project.js";

describe("popup editor filename-key project", () => {
  it("keeps the five-tier amount contract", () => {
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
        (id) => project.tiers.get(id as "bigwin")!.thresholdMultiplier,
      ),
    ).toEqual([15, 25, 50]);
    expect(detectPopupAmountFormatPreset(project.amountFormat)).toBe("integer");
    const decimal = createPopupAmountFormat("decimal");
    expect(detectPopupAmountFormatPreset(decimal)).toBe("decimal");
    expect(detectPopupAmountFormatPreset({ ...decimal, prefix: "$" })).toBe(
      "custom",
    );
    expect(() => projectToManifest(project)).toThrow(
      /layers must be non-empty/,
    );
  });

  it("imports ImgNumber through the common review and exports deterministic mapped ZIPs", async () => {
    const review = await discoverPopupResources([
      new File([imageStringZip().slice().buffer], "amount.zip"),
    ]);
    expect(review[0]).toMatchObject({
      rootKey: "image-string.manifest.json",
      kind: "image-string",
      dependencyCount: 10,
    });
    expect(review[0]!.exactKeys).toEqual([
      "g0.png",
      "g1.png",
      "g2.png",
      "g3.png",
      "g4.png",
      "g5.png",
      "g6.png",
      "g7.png",
      "g8.png",
      "g9.png",
      "image-string.manifest.json",
    ]);
    const project = createPopupEditorProject();
    await commitImportReview(project, review);
    applyImportedResourceBindings(project, review[0]!.rootKey);
    expect(resourceReferenceCount(project, review[0]!.rootKey)).toBe(5);
    addLayer(project, "base", review[0]!.rootKey);
    expect(project.tiers.get("base")!.layers).toHaveLength(1);

    const first = await exportPopupZip(project, { prepare: false });
    const second = await exportPopupZip(project, { prepare: false });
    expect(first.bytes).toEqual(second.bytes);
    const entries = extractBoundedZip(first.bytes, {
      limits: POPUP_ZIP_LIMITS,
    });
    expect(entries.has("assets.map.json")).toBe(true);
    expect([...entries.keys()].some((path) => path.startsWith("assets/"))).toBe(
      true,
    );
    expect(
      [...entries.keys()].some((path) => path.startsWith("dependencies/")),
    ).toBe(false);
    const imported = await importPopupZip(first.bytes, { prepare: false });
    expect(projectToManifest(imported)).toEqual(projectToManifest(project));
    expect([...imported.assets.keys()].sort()).toEqual(
      [...project.assets.keys()].sort(),
    );
  });

  it("overwrites same-name bytes by default and garbage-collects an unbound resource", async () => {
    const project = createPopupEditorProject();
    const first = await discoverPopupResources([
      new File([png(2, 3).buffer], "BG.PNG"),
    ]);
    await commitImportReview(project, first);
    expect(project.resources.get("BG.PNG")!.spec).toMatchObject({
      kind: "image",
      size: { width: 2, height: 3 },
    });
    const replacement = await discoverPopupResources([
      new File([png(4, 5).buffer], "BG.PNG"),
    ]);
    const transaction = await commitImportReview(project, replacement);
    expect(transaction.assets.items[0]).toMatchObject({
      targetKey: "BG.PNG",
      action: "overwrite",
    });
    expect(project.resources.get("BG.PNG")!.spec).toMatchObject({
      kind: "image",
      size: { width: 4, height: 5 },
    });
    expect(project.assets.size).toBe(1);
    removePopupResource(project, "BG.PNG");
    expect(project.resources.size).toBe(0);
    expect(project.assets.size).toBe(0);
  });

  it("builds every layer kind and rejects unsafe resource operations", () => {
    const project = createPopupEditorProject();
    project.resources.set("amount.json", {
      rootKey: "amount.json",
      kind: "image-string",
      spec: { kind: "image-string", manifest: "amount.json" },
      keys: ["amount.json"],
    });
    project.resources.set("BG.PNG", {
      rootKey: "BG.PNG",
      kind: "image",
      spec: {
        kind: "image",
        path: "BG.PNG",
        size: { width: 10, height: 20 },
      },
      keys: ["BG.PNG"],
    });
    project.resources.set("effect.json", {
      rootKey: "effect.json",
      kind: "vni",
      spec: { kind: "vni", project: "effect.json" },
      keys: ["effect.json"],
    });
    project.resources.set("Spine.json", {
      rootKey: "Spine.json",
      kind: "spine",
      spec: {
        kind: "spine",
        skeleton: "Spine.json",
        atlas: "Spine.atlas",
        textures: { "Spine.png": "Spine.png" },
      },
      keys: ["Spine.json", "Spine.atlas", "Spine.png"],
    });
    for (const key of project.resources.keys()) addLayer(project, "base", key);
    expect(project.tiers.get("base")!.layers.map(({ kind }) => kind)).toEqual([
      "image-string",
      "image",
      "vni",
      "spine",
    ]);
    addLayer(project, "base", "amount.json");
    expect(
      project.tiers
        .get("base")!
        .layers.filter(({ kind }) => kind === "image-string"),
    ).toHaveLength(1);
    applyImportedResourceBindings(project, "amount.json");
    applyImportedResourceBindings(project, "amount.json");
    expect(resourceReferenceCount(project, "amount.json")).toBe(5);
    expect(() => removePopupResource(project, "BG.PNG")).toThrow(/仍被/);
    expect(() => removePopupResource(project, "missing.png")).toThrow(/不存在/);
    expect(() => addLayer(project, "base", "missing.png")).toThrow(
      /resource\/tier/,
    );
    expect(() => applyImportedResourceBindings(project, "missing.png")).toThrow(
      /不存在/,
    );
    expect(() =>
      applyImportedResourceBindings(project, "BG.PNG", [
        {
          tierId: "bigwin",
          countDurationSeconds: 3,
          playback: {
            loopStartTime: 1,
            loopEndTime: 2,
            keepParticlesAlive: false,
          },
        },
      ]),
    ).toThrow(/只能应用到 VNI/);
    applyImportedResourceBindings(project, "effect.json", [
      {
        tierId: "bigwin",
        countDurationSeconds: 3,
        playback: {
          loopStartTime: 1,
          loopEndTime: 2,
          keepParticlesAlive: false,
        },
      },
    ]);
    expect(
      project.tiers
        .get("bigwin")!
        .layers.find(({ resource }) => resource === "effect.json"),
    ).toMatchObject({
      resource: "effect.json",
      playback: { keepParticlesAlive: false },
    });
  });
});

function imageStringZip() {
  const characters = [..."0123456789"];
  const manifest = {
    version: 1,
    kind: "image-string",
    id: "amount",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs: Object.fromEntries(
      characters.map((character, index) => [
        character,
        {
          path: `assets/g${index}.png`,
          size: { width: 1, height: 1 },
          offset: { x: 0, y: 0 },
        },
      ]),
    ),
    fixedAdvanceGroups: [],
  };
  const entries = new Map<string, Uint8Array>([
    [
      "image-string.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    ],
  ]);
  characters.forEach((_, index) =>
    entries.set(`assets/g${index}.png`, png(1, 1)),
  );
  return createDeterministicZip(entries, {
    pathPolicy: { requireLowercase: true },
  });
}

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
