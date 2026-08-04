import { describe, expect, it } from "vitest";
import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { normalizeEditorPackageZipEntries } from "@slotclientengine/editorresource";
import {
  createFromGameConfig,
  setStateVisual,
} from "../src/model/editor-project.js";
import {
  commitSymbolResourceImport,
  prepareSymbolResourceImport,
} from "../src/model/resource-import.js";
import {
  exportSymbolPackageZip,
  importSymbolPackageZip,
  SYMBOL_ZIP_LIMITS,
} from "../src/io/symbol-package-zip.js";
import {
  createSymbolVniBundleImportSources,
  inspectSymbolVniBundleProfiles,
} from "../src/io/vni-bundle-import.js";
import { readCraveFixture } from "./crave-fixture.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
const gameConfig = {
  paytable: { "1": { code: 1, symbol: "A", pays: [1] } },
  symbolCodes: { A: 1 },
  reels: { main: [[1]] },
};

function vniProject(id: string, purpose: "editing" | "runtime") {
  return {
    schemaVersion: "VNI_0.087",
    editor: { name: "VNI", version: "VNI_0.087" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "L1",
    stage: {
      width: 300,
      height: 300,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "asset-icon",
        type: "image",
        path: "assets/a_asset_image.png",
        originalName: "A.png",
        width: 172,
        height: 130,
        fileWidth: 172,
        fileHeight: 130,
        fileScale: 1,
      },
    ],
    layerGroups: [
      {
        id: "group_default",
        name: "默认组",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [],
    particles: [],
    exportProfile: { id, purpose, assetScale: 1 },
    maskCompositeMode: "precompose_light_alpha",
  };
}

function bundleEntries() {
  const image = readCraveFixture("H1.png");
  return new Map<string, Uint8Array>([
    [
      "manifest.json",
      encode({
        type: "vni_export_bundle",
        version: "VNI_0.087",
        exports: [
          {
            id: "edit_full",
            purpose: "editing",
            assetScale: 1,
            path: "edit_full/l1.json",
          },
          {
            id: "runtime_100",
            purpose: "runtime",
            assetScale: 1,
            path: "runtime_100/l1.json",
          },
        ],
      }),
    ],
    ["edit_full/l1.json", encode(vniProject("edit_full", "editing"))],
    ["edit_full/assets/a_asset_image.png", image],
    ["runtime_100/l1.json", encode(vniProject("runtime_100", "runtime"))],
    ["runtime_100/assets/a_asset_image.png", image],
  ]);
}

describe("Symbols Editor VNI bundle import", () => {
  it("keeps only the selected runtime closure and round-trips it through Symbols ZIP", async () => {
    const wrapped = new Map(
      [...bundleEntries()].map(([path, bytes]) => [`wrapper/${path}`, bytes]),
    );
    wrapped.set("wrapper/.DS_Store", new Uint8Array([0]));
    const zip = createDeterministicZip(wrapped);
    const entries = normalizeEditorPackageZipEntries(
      extractBoundedZip(zip, { limits: SYMBOL_ZIP_LIMITS }),
      ["manifest.json"],
    );
    expect(inspectSymbolVniBundleProfiles(entries)).toMatchObject([
      { id: "runtime_100", assetScale: 1 },
    ]);
    const sources = createSymbolVniBundleImportSources({
      entries,
      containerName: "l1.zip",
    });
    expect(sources.map(({ sourcePath, key }) => ({ sourcePath, key }))).toEqual(
      [
        { sourcePath: "runtime_100/l1.json", key: "l1.json" },
        {
          sourcePath: "runtime_100/assets/a_asset_image.png",
          key: "a_asset_image.png",
        },
      ],
    );

    const active = createFromGameConfig({
      rawGameConfig: gameConfig,
      fileName: "gameconfig.json",
    });
    const prepared = await prepareSymbolResourceImport({
      project: active,
      sources,
    });
    const committed = await commitSymbolResourceImport({
      project: active,
      prepared,
      resolutions: [],
    });
    expect(committed.project.assetLibrary.records.get("l1.json")?.kind).toBe(
      "vni-project",
    );
    expect(committed.project.assetLibrary.records.has("manifest.json")).toBe(
      false,
    );
    expect(
      new TextDecoder().decode(
        committed.project.assetLibrary.records.get("l1.json")!.bytes,
      ),
    ).toContain('"originalName": "A.png"');
    setStateVisual(committed.project, "A", "normal", {
      kind: "vni",
      baseVisual: { kind: "empty", width: 300, height: 300 },
      projectPath: "l1.json",
      startTime: 0,
      endTime: 1,
    });
    const exported = await exportSymbolPackageZip(committed.project, {
      loadTextures: false,
    });
    const reimported = await importSymbolPackageZip(exported.bytes, {
      loadTextures: false,
    });
    try {
      expect(reimported.project.symbols.get("A")?.states.get("normal")).toEqual(
        {
          kind: "vni",
          baseVisual: { kind: "empty", width: 300, height: 300 },
          projectPath: "l1.json",
          startTime: 0,
          endTime: 1,
        },
      );
      expect(reimported.project.assetLibrary.records.has("l1.json")).toBe(true);
      expect(
        reimported.project.assetLibrary.records.has("a_asset_image.png"),
      ).toBe(true);
    } finally {
      reimported.destroy();
    }
  });
});
