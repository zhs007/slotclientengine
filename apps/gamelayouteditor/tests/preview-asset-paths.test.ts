import { describe, expect, it } from "vitest";
import {
  editorProjectToPreviewManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { collectLayoutPreviewAssetPaths } from "../src/ui/preview-asset-paths.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("layout preview asset paths", () => {
  it("includes the complete referenced Symbols dependency closure", () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
    const keys = [
      "symbols.package.json",
      "gameconfig.json",
      "symbol-state-textures.manifest.json",
      "A.png",
    ];
    for (const key of keys) project.assets.set(key, new Uint8Array([1]));
    project.symbolDependencies.set("symbols", {
      packageId: "symbols",
      rootKey: "symbols.package.json",
      keys,
    });
    project.gameModes.modes[0]!.symbols = {
      packageId: "symbols",
      reelSet: "main",
      renderMode: "standard",
    };
    project.reel.order = 1;
    const manifest = editorProjectToPreviewManifest(project, "default", true);
    expect(manifest).not.toBeNull();

    expect([...collectLayoutPreviewAssetPaths(project, manifest!)]).toEqual(
      expect.arrayContaining(keys),
    );
  });
});
