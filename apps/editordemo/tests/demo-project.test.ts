import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { createDefaultEditorAssetsController } from "@slotclientengine/editorcore/assets/adapters";
import { createEditorAssetsController } from "@slotclientengine/editorcore/assets/core";
import { mountEditorGameLayoutEventDialog } from "@slotclientengine/editorcore/assets/ui";
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

describe("demo Game Layout event dialog", () => {
  it("shows symbol-state and spin lifecycle as distinct event families", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const entry = (
      family: "symbol-state" | "symbols-state-batch" | "spin-lifecycle",
    ) => {
      const ownerAddress: `gamelayout:/${string}` =
        family === "spin-lifecycle"
          ? "gamelayout:/reel/main"
          : "gamelayout:/symbol-package/base";
      const address: `gamelayout:/${string}` =
        family === "spin-lifecycle"
          ? "gamelayout:/reel/main/spin/reel-spin/lifecycle/started"
          : family === "symbol-state"
            ? "gamelayout:/symbol-package/base/symbol/A/instance/reel/main/x/0/y/0/state/win/entered"
            : "gamelayout:/symbol-package/base/symbolsstatebatch/A/win";
      return {
        descriptor: {
          address,
          kind: "event" as const,
          ownerAddress,
          authored: true,
          capability: "event" as const,
          detail: { eventFamily: family },
        },
        family,
        facets:
          family === "spin-lifecycle"
            ? [
                { key: "reel", value: "main" },
                { key: "spin", value: "reel-spin" },
                { key: "scope", value: "spin" },
                { key: "lifecycle", value: "started" },
              ]
            : [
                { key: "symbol-package", value: "base" },
                { key: "symbol", value: "A" },
                { key: "state", value: "win" },
              ],
        dispatchAddresses: [address],
      };
    };
    const dialog = mountEditorGameLayoutEventDialog({
      root,
      sources: [{ key: "layout.manifest.json", label: "Demo Layout" }],
      inspectCatalog: () => ({
        rootKey: "layout.manifest.json",
        entries: [
          entry("symbol-state"),
          entry("symbols-state-batch"),
          entry("spin-lifecycle"),
        ],
      }),
      onConfirm() {},
    });

    dialog.open();
    const sourceSelect =
      root.querySelector<HTMLSelectElement>("[data-event-root]")!;
    sourceSelect.value = "layout.manifest.json";
    sourceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await expect.poll(() => root.textContent).toContain("3 个可侦听 event");
    root.querySelector<HTMLButtonElement>('[data-event-action="add"]')!.click();
    expect(root.textContent).toContain("Symbol 状态");
    expect(root.textContent).toContain("批量图标状态");
    expect(root.textContent).toContain("Spin 生命周期");
    dialog.destroy();
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
