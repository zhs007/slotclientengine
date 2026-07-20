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
  SYMBOL_ZIP_LIMITS,
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
    const upgraded = await exportSymbolPackageZip(imported.project, {
      loadTextures: false,
    });
    const upgradedFiles = extractBoundedZip(upgraded.bytes, {
      limits: SYMBOL_ZIP_LIMITS,
    });
    expect(
      [...upgradedFiles.keys()].every((path) => path === path.toLowerCase()),
    ).toBe(true);
    for (const path of resources) expect(upgradedFiles.has(path)).toBe(false);
    const upgradedImport = await importSymbolPackageZip(upgraded.bytes, {
      loadTextures: false,
    });
    upgradedImport.destroy();
    imported.destroy();
  });

  it("upgrades a legacy AF Spine package to a re-importable hash-flat package", async () => {
    const legacyGameConfig = {
      paytable: { "0": { code: 0, symbol: "AF", pays: [1] } },
      symbolCodes: { AF: 0 },
      reels: { main: [[0]] },
    };
    const legacyPackageManifest = {
      version: 1,
      kind: "symbol-package",
      id: "legacy-af-spine",
      cellSize: { width: 160, height: 160 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["AF.atlas", "AF.json", "AF.png"],
    };
    const legacyZip = createDeterministicZip({
      "symbols.package.json": encode(legacyPackageManifest),
      "gameconfig.json": encode(legacyGameConfig),
      "symbol-state-textures.manifest.json": encode({
        version: 1,
        states: ["appear"],
        symbols: {
          AF: {
            normal: { kind: "transparent", width: 160, height: 160 },
            scale: 1,
            animations: {
              appear: {
                kind: "spine",
                skeleton: "./AF.json",
                atlas: "./AF.atlas",
                texture: "./AF.png",
                playback: {
                  mode: "animation",
                  animationName: "Start",
                  loop: false,
                },
              },
            },
          },
        },
      }),
      "AF.json": encode({
        skeleton: { spine: "4.3.23", width: 1, height: 1 },
        bones: [{ name: "root" }],
        slots: [],
        skins: [{ name: "default", attachments: {} }],
        animations: { Start: {} },
      }),
      "AF.atlas": new TextEncoder().encode(
        "AF.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n",
      ),
      "AF.png": imageBytes(),
    });

    const imported = await importSymbolPackageZip(legacyZip, {
      loadTextures: false,
    });
    const upgraded = await exportSymbolPackageZip(imported.project, {
      loadTextures: false,
    });
    const upgradedFiles = extractBoundedZip(upgraded.bytes, {
      limits: SYMBOL_ZIP_LIMITS,
    });
    const upgradedManifest = JSON.parse(
      new TextDecoder().decode(
        upgradedFiles.get("symbol-state-textures.manifest.json"),
      ),
    );
    expect(
      [...upgradedFiles.keys()].every((path) => path === path.toLowerCase()),
    ).toBe(true);
    expect(upgradedManifest).toMatchObject({
      symbols: {
        AF: {
          animations: {
            appear: {
              skeleton: expect.stringMatching(
                /^\.\/assets\/[a-f0-9]{64}\.json$/u,
              ),
              atlas: expect.stringMatching(
                /^\.\/assets\/[a-f0-9]{64}\.atlas$/u,
              ),
              texture: expect.stringMatching(
                /^\.\/assets\/[a-f0-9]{64}\.png$/u,
              ),
            },
          },
        },
      },
    });
    const reimported = await importSymbolPackageZip(upgraded.bytes, {
      loadTextures: false,
    });
    reimported.destroy();
    imported.destroy();
  });

  it("upgrades legacy full-value images such as 1.png to an exact hash mapping", async () => {
    const resources = ["1.png", "CN.atlas", "CN.json", "CN.png"].sort();
    const packageManifest = {
      version: 1,
      kind: "symbol-package",
      id: "legacy-cn-values",
      cellSize: { width: 160, height: 160 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources,
    };
    const legacyZip = createDeterministicZip({
      "symbols.package.json": encode(packageManifest),
      "gameconfig.json": encode({
        paytable: { "0": { code: 0, symbol: "CN", pays: [1] } },
        symbolCodes: { CN: 0 },
        reels: { main: [[0]] },
      }),
      "symbol-state-textures.manifest.json": encode({
        version: 1,
        states: [],
        symbols: {
          CN: {
            scale: 1,
            valuePresentation: {
              defaultValues: [1],
              reelStates: {
                normal: { kind: "transparent", width: 160, height: 160 },
              },
              tiers: [
                {
                  animation: {
                    kind: "spine",
                    skeleton: "./CN.json",
                    atlas: "./CN.atlas",
                    texture: "./CN.png",
                    playback: {
                      mode: "animation",
                      animationName: "Loop",
                      loop: true,
                    },
                  },
                },
              ],
              text: {
                type: "image",
                slot: "Num",
                x: 0,
                y: 0,
                prefix: "./",
              },
            },
          },
        },
      }),
      "1.png": imageBytes(),
      "CN.json": encode({
        skeleton: { spine: "4.3.23", width: 1, height: 1 },
        bones: [{ name: "root" }],
        slots: [{ name: "Num", bone: "root" }],
        skins: [{ name: "default", attachments: {} }],
        animations: { Loop: {} },
      }),
      "CN.atlas": new TextEncoder().encode(
        "CN.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n",
      ),
      "CN.png": imageBytes(),
    });

    const imported = await importSymbolPackageZip(legacyZip, {
      loadTextures: false,
    });
    const upgraded = await exportSymbolPackageZip(imported.project, {
      loadTextures: false,
    });
    const upgradedFiles = extractBoundedZip(upgraded.bytes, {
      limits: SYMBOL_ZIP_LIMITS,
    });
    const upgradedManifest = JSON.parse(
      new TextDecoder().decode(
        upgradedFiles.get("symbol-state-textures.manifest.json"),
      ),
    );
    expect(upgradedFiles.has("1.png")).toBe(false);
    expect(upgradedManifest.symbols.CN.valuePresentation.text).toEqual({
      type: "image",
      slot: "Num",
      x: 0,
      y: 0,
      images: {
        "1": expect.stringMatching(/^\.\/assets\/[a-f0-9]{64}\.png$/u),
      },
    });
    const reimported = await importSymbolPackageZip(upgraded.bytes, {
      loadTextures: false,
    });
    reimported.destroy();
    imported.destroy();
  });
});
