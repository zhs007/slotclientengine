import { describe, expect, it } from "vitest";
import {
  createFromGameConfig,
  replaceUploadedFiles,
  setSymbolIncluded,
} from "../src/model/editor-project.js";
import {
  exportSymbolPackageZip,
  importSymbolPackageZip,
} from "../src/io/symbol-package-zip.js";

const gameConfig = {
  paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
  symbolCodes: { A: 0 },
  reels: { main: [[0]] },
};

describe("symbols zip IO", () => {
  it("exports deterministic bytes and imports atomically with strict closure", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "fixture.json",
    });
    project.manifestDraft = {
      version: 1,
      states: [],
      symbols: { A: { normal: "./A.png", scale: 1 } },
    };
    replaceUploadedFiles(project, [
      { name: "A.png", bytes: new Uint8Array([1, 2, 3]) },
    ]);
    const first = await exportSymbolPackageZip(project, {
      loadTextures: false,
    });
    const second = await exportSymbolPackageZip(project, {
      loadTextures: false,
    });
    expect(first.fileName).toBe("fixture-symbols.zip");
    expect(first.bytes).toEqual(second.bytes);
    const imported = await importSymbolPackageZip(first.bytes, {
      loadTextures: false,
    });
    expect(imported.project.cellSize).toEqual({ width: 160, height: 160 });
    expect(imported.project.assets.get("A.png")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    imported.destroy();
    imported.destroy();
  });
});
