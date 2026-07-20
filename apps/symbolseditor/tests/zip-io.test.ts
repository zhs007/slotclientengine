import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import {
  createFromGameConfig,
  setStateVisual,
  uploadAssetBatch,
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
const imageBytes = () =>
  new Uint8Array(
    readFileSync(resolve(process.cwd(), "../../assets/game003-s1/H1.png")),
  );
const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

describe("symbols zip IO", () => {
  it("exports and imports a deterministic transparent-only package", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "fixture.json",
    });
    const first = await exportSymbolPackageZip(project, {
      loadTextures: false,
    });
    const second = await exportSymbolPackageZip(project, {
      loadTextures: false,
    });
    expect(first.bytes).toEqual(second.bytes);
    const imported = await importSymbolPackageZip(first.bytes, {
      loadTextures: false,
    });
    expect(imported.project.symbols.get("A")?.states.get("normal")).toEqual({
      kind: "empty",
      width: 160,
      height: 160,
    });
    expect(imported.project.assetLibrary.records.size).toBe(0);
    imported.destroy();
  });

  it("round-trips arbitrary nested resource paths and excludes unused assets", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "fixture.json",
    });
    uploadAssetBatch(project, [
      { path: "art/base-wild-final.webp", bytes: imageBytes() },
      { path: "drafts/unused.png", bytes: imageBytes() },
    ]);
    setStateVisual(project, "A", "normal", {
      kind: "image",
      imagePath: "art/base-wild-final.webp",
    });
    const first = await exportSymbolPackageZip(project, {
      loadTextures: false,
    });
    const second = await exportSymbolPackageZip(project, {
      loadTextures: false,
    });
    expect(first.bytes).toEqual(second.bytes);
    const exportedFiles = extractBoundedZip(first.bytes, {
      limits: {
        maxEntries: 20,
        maxCompressedBytes: 20 * 1024 * 1024,
        maxFileBytes: 20 * 1024 * 1024,
        maxTotalBytes: 20 * 1024 * 1024,
      },
    });
    expect([...exportedFiles.keys()]).not.toContain("art/base-wild-final.webp");
    expect(
      [...exportedFiles.keys()].some((path) =>
        /^assets\/[a-f0-9]{64}\.png$/u.test(path),
      ),
    ).toBe(true);
    const imported = await importSymbolPackageZip(first.bytes, {
      loadTextures: false,
    });
    expect(
      [...imported.project.assetLibrary.records.keys()].some((path) =>
        /^assets\/[a-f0-9]{64}\.png$/u.test(path),
      ),
    ).toBe(true);
    expect(imported.project.assetLibrary.records.has("drafts/unused.png")).toBe(
      false,
    );
    imported.destroy();
  });

  it("imports the task-100 package shape without filename-driven rebinding", async () => {
    const resources = ["A.disabled.png", "A.png", "A.spinBlur.png"];
    const zip = createDeterministicZip({
      "symbols.package.json": encode({
        version: 1,
        kind: "symbol-package",
        id: "task-100-fixture",
        cellSize: { width: 160, height: 160 },
        entrypoints: {
          gameConfig: "gameconfig.json",
          symbolManifest: "symbol-state-textures.manifest.json",
        },
        resources,
      }),
      "gameconfig.json": encode(gameConfig),
      "symbol-state-textures.manifest.json": encode({
        version: 1,
        states: ["spinBlur", "disabled"],
        settings: {
          spinBlur: { kind: "verticalBoxBlur", kernelHeight: 21 },
          disabled: { kind: "grayscale", brightness: 0.72 },
        },
        symbols: {
          A: {
            normal: "./A.png",
            spinBlur: "./A.spinBlur.png",
            disabled: "./A.disabled.png",
            scale: 1,
          },
        },
      }),
      "A.png": imageBytes(),
      "A.spinBlur.png": imageBytes(),
      "A.disabled.png": imageBytes(),
    });
    const imported = await importSymbolPackageZip(zip, {
      loadTextures: false,
    });
    expect(imported.project.symbols.get("A")?.stateOrder).toEqual([
      "normal",
      "spinBlur",
      "disabled",
    ]);
    expect(imported.project.legacyStateSettings).toEqual({
      spinBlur: { kind: "verticalBoxBlur", kernelHeight: 21 },
      disabled: { kind: "grayscale", brightness: 0.72 },
    });
    expect([...imported.project.assetLibrary.records.keys()].sort()).toEqual(
      resources,
    );
    imported.destroy();
  });
});
