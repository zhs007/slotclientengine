import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("export manifest", () => {
  it("references existing animation projects and sliced asset files", async () => {
    const manifestPath = new URL("../../public/exported/manifest.json", import.meta.url);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      animations: Array<{ projectPath: string }>;
      assetCount: number;
    };
    const project = JSON.parse(await readFile(new URL("../../public/exported/project.json", import.meta.url), "utf8")) as {
      layers: Array<{ asset: string }>;
    };

    expect(manifest.assetCount).toBeGreaterThan(0);
    expect(manifest.animations.length).toBeGreaterThan(0);

    await Promise.all(
      manifest.animations.map(async (animation) => {
        await access(new URL(`../../public/exported/${animation.projectPath.replace(/^\.\//, "")}`, import.meta.url));
      })
    );

    await Promise.all(
      project.layers.map(async (layer) => {
        await access(new URL(`../../public/exported/${layer.asset.replace(/^\.\//, "")}`, import.meta.url));
      })
    );
  });
});