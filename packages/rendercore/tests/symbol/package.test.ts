import {
  collectSymbolManifestResourcePaths,
  collectSymbolPackageEntryPaths,
  createSymbolPackageResource,
  createSymbolPackageValueControllerFactory,
  parseSymbolPackageManifest,
  validateSymbolPackageContents,
  validateSymbolPackageGameConfig,
} from "../../src/symbol/package.js";
import { Assets, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

const gameConfig = {
  paytable: {
    "0": { code: 0, symbol: "A", pays: [1] },
    "1": { code: 1, symbol: "B", pays: [1] },
    "2": { code: 2, symbol: "AUX", pays: [1] },
  },
  symbolCodes: { A: 0, B: 1, AUX: 2 },
  reels: { main: [[0, 1, 2]] },
};

const symbolManifest = {
  version: 1,
  states: [],
  symbols: {
    B: { normal: "./B.png", scale: 1 },
    A: { normal: "./A.png", scale: 1 },
  },
};

const packageManifest = {
  version: 1,
  kind: "symbol-package",
  id: "fixture-symbols",
  cellSize: { width: 120.5, height: 121 },
  entrypoints: {
    gameConfig: "gameconfig.json",
    symbolManifest: "symbol-state-textures.manifest.json",
  },
  resources: ["A.png", "B.png"],
};

function files() {
  return new Map<string, Uint8Array>([
    ["symbols.package.json", encode(packageManifest)],
    ["gameconfig.json", encode(gameConfig)],
    ["symbol-state-textures.manifest.json", encode(symbolManifest)],
    ["A.png", new Uint8Array([1])],
    ["B.png", new Uint8Array([2])],
  ]);
}

describe("symbol package manifest", () => {
  it("strictly parses, deep freezes and collects the full entry set", () => {
    const parsed = parseSymbolPackageManifest(packageManifest);
    expect(Object.isFrozen(parsed.cellSize)).toBe(true);
    expect(collectSymbolPackageEntryPaths(parsed)).toEqual([
      "A.png",
      "B.png",
      "gameconfig.json",
      "symbol-state-textures.manifest.json",
      "symbols.package.json",
    ]);
  });

  it("rejects recursive unknown keys and invalid package fields", () => {
    expect(() =>
      parseSymbolPackageManifest({
        ...packageManifest,
        cellSize: { ...packageManifest.cellSize, extra: true },
      }),
    ).toThrow(/unknown key/);
    expect(() =>
      parseSymbolPackageManifest({ ...packageManifest, id: "Bad_ID" }),
    ).toThrow(/kebab-case/);
    expect(() =>
      parseSymbolPackageManifest({
        ...packageManifest,
        resources: ["B.png", "A.png"],
      }),
    ).toThrow(/sorted/);
    expect(() =>
      parseSymbolPackageManifest({ ...packageManifest, version: 2 }),
    ).toThrow(/version/);
    expect(() =>
      parseSymbolPackageManifest({ ...packageManifest, kind: "other" }),
    ).toThrow(/kind/);
    expect(() =>
      parseSymbolPackageManifest({
        ...packageManifest,
        cellSize: { width: 0, height: 121 },
      }),
    ).toThrow(/finite positive/);
    expect(() =>
      parseSymbolPackageManifest({
        ...packageManifest,
        entrypoints: {
          gameConfig: "gameconfig.json",
          symbolManifest: "gameconfig.json",
        },
      }),
    ).toThrow(/must be different/);
    expect(
      parseSymbolPackageManifest({ ...packageManifest, resources: [] })
        .resources,
    ).toEqual([]);
    expect(() =>
      parseSymbolPackageManifest({ ...packageManifest, resources: null }),
    ).toThrow(/must be an array/);
    expect(() =>
      parseSymbolPackageManifest({
        ...packageManifest,
        resources: ["gameconfig.json"],
      }),
    ).toThrow(/must not appear/);
    expect(() =>
      parseSymbolPackageManifest({
        ...packageManifest,
        resources: ["../A.png"],
      }),
    ).toThrow(/invalid/);
    expect(() => parseSymbolPackageManifest(null)).toThrow(/must be an object/);
    expect(() =>
      parseSymbolPackageManifest({
        ...packageManifest,
        entrypoints: { gameConfig: 1, symbolManifest: "manifest.json" },
      }),
    ).toThrow(/must be a string/);
    const { resources: _resources, ...withoutResources } = packageManifest;
    expect(() => parseSymbolPackageManifest(withoutResources)).toThrow(
      /missing key "resources"/,
    );
  });

  it("requires the zip contents to equal the declared closure", () => {
    expect(
      validateSymbolPackageContents({ packageManifest, files: files() }),
    ).toEqual(parseSymbolPackageManifest(packageManifest));
    const extra = files();
    extra.set("extra.png", new Uint8Array());
    expect(() =>
      validateSymbolPackageContents({ packageManifest, files: extra }),
    ).toThrow(/declared closure/);
  });
});

describe("symbol package game config and resources", () => {
  it("allows config-only auxiliary symbols and sorts display symbols by numeric code", () => {
    const result = validateSymbolPackageGameConfig({
      rawGameConfig: gameConfig,
      symbolManifest,
    });
    expect(result.displaySymbols).toEqual(["A", "B"]);
  });

  it("rejects a manifest symbol absent from game config", () => {
    expect(() =>
      validateSymbolPackageGameConfig({
        rawGameConfig: gameConfig,
        symbolManifest: {
          ...symbolManifest,
          symbols: { ...symbolManifest.symbols, C: { normal: "./C.png" } },
        },
      }),
    ).toThrow(/does not exist/);
  });

  it("collects exact direct resources and rejects orphans in a resource", async () => {
    expect(collectSymbolManifestResourcePaths({ symbolManifest })).toEqual([
      "A.png",
      "B.png",
    ]);
    const resource = await createSymbolPackageResource({
      packageManifest,
      files: files(),
      loadTextures: false,
    });
    expect(resource.displaySymbols).toEqual(["A", "B"]);
    expect(resource.packageManifest.cellSize.width).toBe(120.5);
    await expect(resource.createCatalog()).rejects.toThrow(
      /without loaded textures/,
    );
    expect(createSymbolPackageValueControllerFactory(resource, "A")).toBe(
      undefined,
    );
    resource.destroy();
    await expect(resource.createCatalog()).rejects.toThrow(/destroyed/);
    resource.destroy();

    const orphanManifest = {
      ...packageManifest,
      resources: ["A.png", "B.png", "orphan.png"],
    };
    const orphanFiles = files();
    orphanFiles.set("symbols.package.json", encode(orphanManifest));
    orphanFiles.set("orphan.png", new Uint8Array());
    await expect(
      createSymbolPackageResource({
        packageManifest: orphanManifest,
        files: orphanFiles,
        loadTextures: false,
      }),
    ).rejects.toThrow(/orphan/);
  });

  it("forces Pixi's texture parser for extensionless package blob URLs", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.EMPTY as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSymbolPackageResource({
        packageManifest,
        files: files(),
      });
      await resource.createCatalog();
      expect(load).toHaveBeenCalled();
      for (const [request] of load.mock.calls) {
        expect(request).toMatchObject({
          src: expect.stringMatching(/^blob:/u),
          loadParser: "loadTextures",
        });
      }
      resource.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("creates a transparent-only resource, catalog and RenderSymbol with no resource entries", async () => {
    const emptyManifest = {
      version: 1,
      states: [],
      symbols: {
        A: {
          normal: { kind: "transparent", width: 160, height: 160 },
          scale: 1,
          animations: {
            appear: { kind: "empty", durationSeconds: 1 / 60 },
          },
        },
      },
    };
    const emptyPackage = { ...packageManifest, resources: [] };
    const emptyFiles = new Map<string, Uint8Array>([
      ["symbols.package.json", encode(emptyPackage)],
      ["gameconfig.json", encode(gameConfig)],
      ["symbol-state-textures.manifest.json", encode(emptyManifest)],
    ]);
    const resource = await createSymbolPackageResource({
      packageManifest: emptyPackage,
      files: emptyFiles,
    });
    const catalog = await resource.createCatalog();
    const symbol = catalog.createRenderSymbol("A");
    symbol.init();
    symbol.requestState("appear", "immediate");
    expect(symbol.getBaseLayer().visible).toBe(false);
    expect(symbol.getStateSprite().visible).toBe(false);
    expect(symbol.update(1 / 60).onceCompleted).toBe(true);
    expect(symbol.getBaseLayer().visible).toBe(true);
    symbol.destroy();
    resource.destroy();
  });
});
