import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectSymbolManifestResourcePaths,
  createSymbolPackageResource,
} from "../../src/symbol/package.js";

describe("production symbol package fixtures", () => {
  it.each([
    {
      id: "game002-s3",
      assetDirectory: "assets/game002-s3",
      gameConfig: "assets/gamecfg002/gameconfig.json",
      cellSize: { width: 120, height: 120 },
      displayCount: 13,
    },
    {
      id: "game003-s1",
      assetDirectory: "assets/game003-s1",
      gameConfig: "assets/gamecfg003/gameconfig.json",
      cellSize: { width: 165, height: 130 },
      displayCount: 14,
    },
  ])(
    "validates the exact $id manifest/VNI/Spine/value closure",
    async (fixture) => {
      const repository = resolve(process.cwd(), "../..");
      const symbolManifestPath = resolve(
        repository,
        fixture.assetDirectory,
        "symbol-state-textures.manifest.json",
      );
      const rawSymbolManifest = JSON.parse(
        await readFile(symbolManifestPath, "utf8"),
      );
      const files = new Map<string, Uint8Array>();
      const direct = collectSymbolManifestResourcePaths({
        symbolManifest: rawSymbolManifest,
      });
      for (const path of direct) {
        files.set(
          path,
          new Uint8Array(
            await readFile(resolve(repository, fixture.assetDirectory, path)),
          ),
        );
      }
      const resources = collectSymbolManifestResourcePaths({
        symbolManifest: rawSymbolManifest,
        files,
      });
      for (const path of resources) {
        if (!files.has(path)) {
          files.set(
            path,
            new Uint8Array(
              await readFile(resolve(repository, fixture.assetDirectory, path)),
            ),
          );
        }
      }
      const packageManifest = {
        version: 1,
        kind: "symbol-package",
        id: fixture.id,
        cellSize: fixture.cellSize,
        entrypoints: {
          gameConfig: "gameconfig.json",
          symbolManifest: "symbol-state-textures.manifest.json",
        },
        resources,
      } as const;
      files.set(
        "gameconfig.json",
        new Uint8Array(await readFile(resolve(repository, fixture.gameConfig))),
      );
      files.set(
        "symbol-state-textures.manifest.json",
        new TextEncoder().encode(JSON.stringify(rawSymbolManifest)),
      );
      files.set(
        "symbols.package.json",
        new TextEncoder().encode(JSON.stringify(packageManifest)),
      );
      const resource = await createSymbolPackageResource({
        packageManifest,
        files,
        loadTextures: false,
      });
      expect(resource.displaySymbols).toHaveLength(fixture.displayCount);
      expect(resource.packageManifest.cellSize).toEqual(fixture.cellSize);
      resource.destroy();
    },
  );
});
