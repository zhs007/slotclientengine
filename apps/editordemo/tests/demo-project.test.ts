import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { createDefaultEditorAssetsController } from "@slotclientengine/editorcore/assets/adapters";
import { createEditorAssetsController } from "@slotclientengine/editorcore/assets/core";
import { describe, expect, it } from "vitest";
import {
  DEMO_PROJECT_PATH,
  createDemoProjectArchive,
  openDemoProjectArchive,
} from "../src/demo-project.js";
import {
  createEmptyDemoProject,
  demoProjectHost,
  parseDemoProject,
} from "../src/host.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const LIMITS = {
  maxEntries: 100,
  maxCompressedBytes: 1024 * 1024,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 1024 * 1024,
};

describe("demo project archive", () => {
  it("round-trips catalog, program binding, assets map, and payload", async () => {
    const controller = createDefaultEditorAssetsController({
      project: createEmptyDemoProject(),
      host: demoProjectHost,
    });
    const preparation = await controller.prepareImport([
      source("coin.png", PNG),
    ]);
    await controller.commitImport(preparation);
    await controller.setProgramBinding("coin.png", "coin");

    const first = createDemoProjectArchive(controller);
    const opened = await openDemoProjectArchive(first);
    expect(opened.catalog.roots.get("coin.png")?.kind).toBe("image");
    expect(opened.project.programs).toEqual({ coin: "coin.png" });
    expect(opened.workspace.entries.get("coin.png")?.bytes).toEqual(PNG);

    const restored = createEditorAssetsController({
      project: opened.project,
      host: demoProjectHost,
      initial: opened,
    });
    expect(createDemoProjectArchive(restored)).toEqual(first);
  });

  it("rejects unknown archive manifest fields", async () => {
    const archive = createDemoProjectArchive(
      createEditorAssetsController({
        project: createEmptyDemoProject(),
        host: demoProjectHost,
      }),
    );
    const files = extractBoundedZip(archive, { limits: LIMITS });
    const manifest = JSON.parse(
      new TextDecoder().decode(files.get(DEMO_PROJECT_PATH)!),
    );
    manifest.unknown = true;
    files.set(
      DEMO_PROJECT_PATH,
      new TextEncoder().encode(JSON.stringify(manifest)),
    );
    await expect(
      openDemoProjectArchive(createDeterministicZip(files)),
    ).rejects.toThrow(/fields 无效/u);
  });

  it("rejects orphan payloads", async () => {
    const archive = createDemoProjectArchive(
      createEditorAssetsController({
        project: createEmptyDemoProject(),
        host: demoProjectHost,
      }),
    );
    const files = extractBoundedZip(archive, { limits: LIMITS });
    files.set("assets/orphan.png", PNG);
    await expect(
      openDemoProjectArchive(createDeterministicZip(files)),
    ).rejects.toThrow(/orphan payload/u);
  });
});

describe("demo host", () => {
  it("strictly parses project fields and rewrites program references", async () => {
    expect(() =>
      parseDemoProject({ ...createEmptyDemoProject(), unknown: true }),
    ).toThrow(/fields 无效/u);
    const project = await demoProjectHost.setProgramBinding(
      createEmptyDemoProject(),
      "coin.png",
      "coin",
    );
    const renamed = await demoProjectHost.renameReferences(
      project,
      "coin.png",
      "win.png",
    );
    expect(renamed.programs).toEqual({ coin: "win.png" });
  });
});

function source(name: string, bytes: Uint8Array) {
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    },
  };
}
