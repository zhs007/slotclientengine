import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import {
  importSymbolsZip,
  importSymbolsZipWithFiles,
} from "../src/io/imported-symbol-package.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const canonicalImagePath = `assets/${"a".repeat(64)}.png`;
const canonicalImageKey = `${"a".repeat(64)}.png`;

describe("layout editor symbols package import", () => {
  it("reads the same strict package and exposes deterministic display metadata", async () => {
    const packageManifest = {
      version: 1,
      kind: "symbol-package",
      id: "layout-fixture",
      cellSize: { width: 120, height: 120 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: [canonicalImagePath],
    };
    const zip = createDeterministicZip({
      "symbols.package.json": encode(packageManifest),
      "gameconfig.json": encode({
        paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
        symbolCodes: { A: 0 },
        reels: { main: [[0]] },
      }),
      "symbol-state-textures.manifest.json": encode({
        version: 1,
        states: [],
        symbols: { A: { normal: `./${canonicalImagePath}`, scale: 1 } },
      }),
      [canonicalImagePath]: png,
    });
    const imported = await importSymbolsZipWithFiles(zip, {
      loadTextures: false,
    });
    const { resource } = imported;
    expect(resource.packageManifest.cellSize).toEqual({
      width: 120,
      height: 120,
    });
    expect(resource.displaySymbols).toEqual(["A"]);
    expect(
      [...imported.files.keys()].every((path) => path === path.toLowerCase()),
    ).toBe(true);
    expect(resource.packageManifest.resources).toEqual([canonicalImageKey]);
    expect(resource.rawSymbolManifest).toMatchObject({
      symbols: {
        A: {
          normal: `./${canonicalImageKey}`,
        },
      },
    });
    resource.destroy();
  });

  it("migrates legal uppercase filename keys without lowercasing", async () => {
    const packageManifest = {
      version: 1,
      kind: "symbol-package",
      id: "legacy-symbols",
      cellSize: { width: 160, height: 160 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["AF.disabled.png"],
    };
    const zip = createDeterministicZip({
      "symbols.package.json": encode(packageManifest),
      "gameconfig.json": encode({
        paytable: { "0": { code: 0, symbol: "AF", pays: [1] } },
        symbolCodes: { AF: 0 },
        reels: { main: [[0]] },
      }),
      "symbol-state-textures.manifest.json": encode({
        version: 1,
        states: ["disabled"],
        symbols: {
          AF: {
            normal: { kind: "transparent", width: 160, height: 160 },
            disabled: "./AF.disabled.png",
            scale: 1,
          },
        },
      }),
      "AF.disabled.png": png,
    });

    const imported = await importSymbolsZipWithFiles(zip, {
      loadTextures: false,
    });
    expect(imported.resource.packageManifest.resources).toEqual([
      "AF.disabled.png",
    ]);
    expect(imported.resource.rawSymbolManifest).toMatchObject({
      symbols: { AF: { disabled: "./AF.disabled.png" } },
    });
    imported.resource.destroy();
  });

  it("imports a transparent-only package with an empty resource closure", async () => {
    const zip = createDeterministicZip({
      "symbols.package.json": encode({
        version: 1,
        kind: "symbol-package",
        id: "transparent-layout-fixture",
        cellSize: { width: 160, height: 160 },
        entrypoints: {
          gameConfig: "gameconfig.json",
          symbolManifest: "symbol-state-textures.manifest.json",
        },
        resources: [],
      }),
      "gameconfig.json": encode({
        paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
        symbolCodes: { A: 0 },
        reels: { main: [[0]] },
      }),
      "symbol-state-textures.manifest.json": encode({
        version: 1,
        states: [],
        symbols: {
          A: {
            normal: {
              kind: "transparent",
              width: 160,
              height: 160,
            },
            scale: 1,
          },
        },
      }),
    });
    const resource = await importSymbolsZip(zip, { loadTextures: false });
    expect(resource.packageManifest.resources).toEqual([]);
    expect(resource.displaySymbols).toEqual(["A"]);
    resource.destroy();
  });

  it("migrates a Finder wrapper and macOS metadata before strict Symbols validation", async () => {
    const zip = createDeterministicZip({
      "crave-symbols/symbols.package.json": encode({
        version: 1,
        kind: "symbol-package",
        id: "finder-symbols",
        cellSize: { width: 160, height: 160 },
        entrypoints: {
          gameConfig: "gameconfig.json",
          symbolManifest: "symbol-state-textures.manifest.json",
        },
        resources: [],
      }),
      "crave-symbols/gameconfig.json": encode({
        paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
        symbolCodes: { A: 0 },
        reels: { main: [[0]] },
      }),
      "crave-symbols/symbol-state-textures.manifest.json": encode({
        version: 1,
        states: [],
        symbols: {
          A: {
            normal: { kind: "transparent", width: 160, height: 160 },
            scale: 1,
          },
        },
      }),
      "crave-symbols/.DS_Store": new Uint8Array([1]),
      "__MACOSX/._crave-symbols": new Uint8Array([2]),
      "__MACOSX/crave-symbols/._gameconfig.json": new Uint8Array([3]),
    });
    const imported = await importSymbolsZipWithFiles(zip, {
      loadTextures: false,
    });
    expect(imported.resource.packageManifest.id).toBe("finder-symbols");
    expect([...imported.files.keys()]).toEqual(
      expect.arrayContaining([
        "gameconfig.json",
        "symbol-state-textures.manifest.json",
        "symbols.package.json",
      ]),
    );
    imported.resource.destroy();
  });

  it("rejects a layout zip without guessing its kind", async () => {
    const zip = createDeterministicZip({
      "layout.manifest.json": encode({ version: 1 }),
    });
    await expect(
      importSymbolsZip(zip, { loadTextures: false }),
    ).rejects.toThrow(/symbols.package.json/);
  });

  it("reports invalid package JSON before creating a resource", async () => {
    const zip = createDeterministicZip({
      "symbols.package.json": new TextEncoder().encode("{"),
    });
    await expect(
      importSymbolsZip(zip, { loadTextures: false }),
    ).rejects.toThrow(/symbols.package.json 无效/);
  });
});
