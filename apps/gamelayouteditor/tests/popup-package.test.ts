import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import { Assets, Texture } from "pixi.js";
import { vi } from "vitest";
import { importPopupPackageZip } from "../src/io/imported-popup-package.js";
import {
  cloneEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { assetBytes, imageManifest } from "./fixtures.js";
import { popupFiles } from "./popup-fixture.js";

describe("gamelayout popup dependency", () => {
  it("strictly imports a self-contained popup and round-trips binding placement", async () => {
    const popup = popupFiles();
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const imported = await importPopupPackageZip(
      createDeterministicZip(popup, { pathPolicy: { requireLowercase: true } }),
      { decodeImage: async () => ({ width: 1, height: 1 }) },
    );
    expect(imported.manifest.id).toBe("fixture-popup");
    const prefix = "dependencies/popups/fixture-popup/";
    const layoutAssets = new Map(assetBytes);
    for (const [path, bytes] of imported.files)
      layoutAssets.set(`${prefix}${path}`, new Uint8Array(bytes));
    const manifest = {
      ...imageManifest,
      popups: {
        "fixture-popup": {
          type: "award-celebration" as const,
          manifest: `${prefix}popup.manifest.json`,
          placements: { default: { x: 12, y: -8, scale: 0.9 } },
        },
      },
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            nodeStates: {},
            awardCelebrationPopup: "fixture-popup",
          },
        ],
      },
    };
    const project = manifestToEditorProject(manifest, layoutAssets);
    expect(project.popupDependencies.get("fixture-popup")).toMatchObject({
      id: "fixture-popup",
      placements: { default: { x: 12, y: -8, scale: 0.9 } },
    });
    expect(project.assets.has(`${prefix}popup.manifest.json`)).toBe(false);
    expect(editorProjectToManifest(project).popups).toEqual(manifest.popups);
    const clone = cloneEditorProject(project);
    clone.popupDependencies
      .get("fixture-popup")!
      .files.get("popup.manifest.json")![0] = 0;
    expect(
      project.popupDependencies
        .get("fixture-popup")!
        .files.get("popup.manifest.json")![0],
    ).not.toBe(0);
    load.mockRestore();
    unload.mockRestore();
  });

  it("rejects missing sentinel, orphan entries and unknown manifest fields", async () => {
    await expect(
      importPopupPackageZip(
        createDeterministicZip(new Map([["x.txt", new Uint8Array([1])]])),
      ),
    ).rejects.toThrow(/sentinel/);
    const orphan = popupFiles();
    orphan.set("orphan.bin", new Uint8Array([1]));
    await expect(
      importPopupPackageZip(createDeterministicZip(orphan)),
    ).rejects.toThrow(/exactly match/);
    const invalid = popupFiles();
    const manifest = JSON.parse(
      new TextDecoder().decode(invalid.get("popup.manifest.json")),
    );
    manifest.extra = true;
    invalid.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );
    await expect(
      importPopupPackageZip(createDeterministicZip(invalid)),
    ).rejects.toThrow(/unknown key/);
  });
});
