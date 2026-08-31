import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readSymbolArtifactFixtureBytes } from "./artifact-fixtures.js";
import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  createEditorAssetEntry,
  decodeEditorAssetsMap,
} from "@slotclientengine/editorresource";
import { describe, expect, it } from "vitest";
import {
  addSymbolState,
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
  new Uint8Array(readSymbolArtifactFixtureBytes("H1.png"));
const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);
const vniProject = {
  schemaVersion: "VNI_0.010",
  editor: { name: "VNI", version: "VNI_0.010" },
  engineTarget: { name: "cocos_creator", version: "3.8.6" },
  name: "symbol-composite",
  stage: {
    width: 160,
    height: 160,
    coordinate: "center",
    duration: 1,
    backgroundColor: "#000000",
  },
  assets: [],
  layerGroups: [],
  layers: [],
  particles: [],
};

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

  it("strictly imports then removes legacy Symbol audio and its payload", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "legacy-audio.json",
    });
    const exported = await exportSymbolPackageZip(project, {
      loadTextures: false,
    });
    const entries = new Map(
      extractBoundedZip(exported.bytes, { limits: SYMBOL_ZIP_LIMITS }),
    );
    const audio = await createEditorAssetEntry({
      key: "coin.wav",
      bytes: new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
      ]),
      mediaType: "audio/wav",
    });
    const map = JSON.parse(
      new TextDecoder().decode(entries.get("assets.map.json")),
    );
    map.files[audio.key] = {
      path: audio.payloadPath,
      sha256: audio.sha256,
      mediaType: audio.mediaType,
      byteLength: audio.byteLength,
    };
    entries.set("assets.map.json", encode(map));
    entries.set(audio.payloadPath, audio.bytes);
    const packageManifest = JSON.parse(
      new TextDecoder().decode(entries.get("symbols.package.json")),
    );
    packageManifest.resources.push(audio.key);
    entries.set("symbols.package.json", encode(packageManifest));
    const symbolManifest = JSON.parse(
      new TextDecoder().decode(
        entries.get("symbol-state-textures.manifest.json"),
      ),
    );
    symbolManifest.audio.effects = [
      {
        name: "coin",
        asset: {
          sources: [{ path: "coin.wav", mediaType: "audio/wav" }],
        },
        playback: "once",
        offsetSeconds: 0,
        voices: { maxConcurrent: 4, overflow: "restart-oldest" },
        bgm: { kind: "keep" },
      },
    ];
    symbolManifest.symbols.A.audioCues = [{ state: "normal", effect: "coin" }];
    entries.set("symbol-state-textures.manifest.json", encode(symbolManifest));

    const imported = await importSymbolPackageZip(
      createDeterministicZip(entries),
      { loadTextures: false },
    );
    expect(imported.legacyAudioMigration).toEqual({
      effects: 1,
      cues: 1,
      assets: 1,
    });
    expect(imported.project.assetLibrary.records.has("coin.wav")).toBe(false);
    const migratedFiles = extractBoundedZip(
      (
        await exportSymbolPackageZip(imported.project, {
          loadTextures: false,
        })
      ).bytes,
      { limits: SYMBOL_ZIP_LIMITS },
    );
    const migratedManifest = JSON.parse(
      new TextDecoder().decode(
        migratedFiles.get("symbol-state-textures.manifest.json"),
      ),
    );
    expect(migratedManifest.audio).toEqual({ version: 1, effects: [] });
    expect(migratedManifest.symbols.A).not.toHaveProperty("audioCues");
    expect(migratedFiles.has(audio.payloadPath)).toBe(false);
    imported.destroy();
  });

  it("round-trips arbitrary nested resource paths and excludes unused assets", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "fixture.json",
    });
    uploadAssetBatch(project, [
      { path: "base-wild-final.webp", bytes: imageBytes() },
      { path: "drafts/unused.png", bytes: imageBytes() },
    ]);
    setStateVisual(project, "A", "normal", {
      kind: "image",
      imagePath: "base-wild-final.webp",
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
    expect([...exportedFiles.keys()]).not.toContain("base-wild-final.webp");
    expect(
      [...exportedFiles.keys()].some((path) =>
        /^assets\/[a-f0-9]{64}\.webp$/u.test(path),
      ),
    ).toBe(true);
    const imported = await importSymbolPackageZip(first.bytes, {
      loadTextures: false,
    });
    expect(
      imported.project.assetLibrary.records.has("base-wild-final.webp"),
    ).toBe(true);
    expect(imported.project.assetLibrary.records.has("unused.png")).toBe(false);
    imported.destroy();
  });

  it("round-trips composite layer order and mapped leaf resources", async () => {
    const project = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "composite.json",
    });
    uploadAssetBatch(project, [
      { path: "A.png", bytes: imageBytes() },
      { path: "effect.json", bytes: encode(vniProject) },
    ]);
    setStateVisual(project, "A", "normal", {
      kind: "image",
      imagePath: "A.png",
    });
    addSymbolState(project, "A", "win");
    setStateVisual(project, "A", "win", {
      kind: "composite",
      base: "normal",
      layers: [
        {
          id: "back",
          placement: "underlay",
          animation: {
            kind: "vni",
            projectPath: "effect.json",
            startTime: 0,
            endTime: 1,
          },
        },
        {
          id: "front",
          placement: "overlay",
          animation: {
            kind: "vni",
            projectPath: "effect.json",
            startTime: 0,
            endTime: 1,
          },
        },
      ],
    });

    const exported = await exportSymbolPackageZip(project, {
      loadTextures: false,
    });
    const imported = await importSymbolPackageZip(exported.bytes, {
      loadTextures: false,
    });

    expect(imported.project.symbols.get("A")?.states.get("win")).toMatchObject({
      kind: "composite",
      base: "normal",
      layers: [
        { id: "back", placement: "underlay" },
        { id: "front", placement: "overlay" },
      ],
    });
    const files = extractBoundedZip(exported.bytes, {
      limits: SYMBOL_ZIP_LIMITS,
    });
    const assetMap = decodeEditorAssetsMap(files.get("assets.map.json")!);
    expect(Object.keys(assetMap.files).sort()).toEqual([
      "A.png",
      "effect.json",
    ]);
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
    expect(upgradedFiles.has("assets.map.json")).toBe(true);
    for (const path of resources) expect(upgradedFiles.has(path)).toBe(false);
    const upgradedImport = await importSymbolPackageZip(upgraded.bytes, {
      loadTextures: false,
    });
    upgradedImport.destroy();
    imported.destroy();
  });

  it("upgrades a legacy AF Spine package to a re-importable filename-map package", async () => {
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
              skeleton: "./AF.json",
              atlas: "./AF.atlas",
              texture: "./AF.png",
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

  it("preserves distinct logical keys when symbol and VNI images share bytes", async () => {
    const sharedImage = imageBytes();
    const vniProject = new Uint8Array(
      readSymbolArtifactFixtureBytes("L1-wins.json"),
    );
    const parsedVniProject = JSON.parse(
      new TextDecoder().decode(vniProject),
    ) as { assets: readonly { path: string }[] };
    const vniAssetKey = parsedVniProject.assets[0]?.path;
    if (!vniAssetKey) throw new Error("expected L1 win VNI asset fixture");
    const resources = ["A-wins.json", "A.png", vniAssetKey].sort();
    const legacyZip = createDeterministicZip({
      "symbols.package.json": encode({
        version: 1,
        kind: "symbol-package",
        id: "same-content-logical-keys",
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
        states: [],
        symbols: {
          A: {
            normal: "./A.png",
            scale: 1,
            animations: {
              win: {
                kind: "vni",
                project: "./A-wins.json",
                playback: {
                  mode: "range",
                  startTime: 0,
                  endTime: 1,
                  loop: false,
                },
              },
            },
          },
        },
      }),
      "A-wins.json": vniProject,
      "A.png": sharedImage,
      [vniAssetKey]: sharedImage,
    });

    const imported = await importSymbolPackageZip(legacyZip, {
      loadTextures: false,
    });
    const exported = await exportSymbolPackageZip(imported.project, {
      loadTextures: false,
    });
    imported.destroy();
    const files = extractBoundedZip(exported.bytes, {
      limits: SYMBOL_ZIP_LIMITS,
    });
    const assetsMap = decodeEditorAssetsMap(files.get("assets.map.json")!);
    const exportedVniAssetKey = "vni-image.png";
    expect(Object.keys(assetsMap.files).sort()).toEqual(
      ["A-wins.json", "A.png", exportedVniAssetKey].sort(),
    );
    expect(assetsMap.files["A.png"]?.sha256).toBe(
      assetsMap.files[exportedVniAssetKey]?.sha256,
    );
    expect(assetsMap.files["A.png"]?.path.replace(/\.[^.]+$/u, "")).toBe(
      assetsMap.files[exportedVniAssetKey]?.path.replace(/\.[^.]+$/u, ""),
    );

    const reimported = await importSymbolPackageZip(exported.bytes, {
      loadTextures: false,
    });
    expect([...reimported.project.assetLibrary.records.keys()].sort()).toEqual(
      ["A-wins.json", "A.png", exportedVniAssetKey].sort(),
    );
    expect(
      reimported.project.symbols.get("A")?.states.get("win"),
    ).toMatchObject({
      kind: "vni",
      projectPath: "A-wins.json",
    });
    reimported.destroy();
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
        "1": "./1.png",
      },
    });
    const reimported = await importSymbolPackageZip(upgraded.bytes, {
      loadTextures: false,
    });
    reimported.destroy();
    imported.destroy();
  });
});
