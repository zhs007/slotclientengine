import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import { importSymbolsZip } from "../src/io/imported-symbol-package.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

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
      resources: ["A.png"],
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
        symbols: { A: { normal: "./A.png", scale: 1 } },
      }),
      "A.png": new Uint8Array([1, 2, 3]),
    });
    const resource = await importSymbolsZip(zip, { loadTextures: false });
    expect(resource.packageManifest.cellSize).toEqual({
      width: 120,
      height: 120,
    });
    expect(resource.displaySymbols).toEqual(["A"]);
    resource.destroy();
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
