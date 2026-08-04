import { describe, expect, it } from "vitest";
import {
  inspectSymbolVniExportBundle,
  materializeSymbolVniExportBundleRuntime,
} from "../../src/symbol/index.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

function project(
  id: string,
  purpose: "editing" | "runtime",
  assetPath = "assets/icon.png",
) {
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
        path: assetPath,
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

function bundleEntries(options: { readonly extraRuntime?: boolean } = {}) {
  const exports = [
    {
      id: "edit_full",
      purpose: "editing",
      assetScale: 1,
      path: "edit_full/l1.json",
      label: "完整编辑备份",
    },
    {
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
      path: "runtime_100/l1.json",
      label: "100% 运行发布包",
    },
  ];
  const entries = new Map<string, Uint8Array>([
    ["edit_full/l1.json", encode(project("edit_full", "editing"))],
    ["edit_full/assets/icon.png", new Uint8Array([1, 2, 3])],
    ["runtime_100/l1.json", encode(project("runtime_100", "runtime"))],
    ["runtime_100/assets/icon.png", new Uint8Array([4, 5, 6])],
  ]);
  if (options.extraRuntime) {
    exports.push({
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
      path: "runtime_50/l1.json",
      label: "50% 运行发布包",
    });
    const half = project("runtime_50", "runtime");
    half.exportProfile.assetScale = 0.5;
    entries.set("runtime_50/l1.json", encode(half));
    entries.set("runtime_50/assets/icon.png", new Uint8Array([7, 8, 9]));
  }
  entries.set(
    "manifest.json",
    encode({ type: "vni_export_bundle", version: "VNI_0.087", exports }),
  );
  return entries;
}

describe("symbol VNI export bundle", () => {
  it("offers only runtime profiles and materializes the unique runtime closure", () => {
    const entries = bundleEntries();
    expect(inspectSymbolVniExportBundle(entries)).toEqual([
      {
        id: "runtime_100",
        label: "100% 运行发布包",
        assetScale: 1,
        byteLength:
          entries.get("runtime_100/l1.json")!.byteLength +
          entries.get("runtime_100/assets/icon.png")!.byteLength,
      },
    ]);
    const result = materializeSymbolVniExportBundleRuntime({ entries });
    expect(result.project).toMatchObject({
      sourcePath: "runtime_100/l1.json",
      key: "l1.json",
    });
    expect(result.assets).toEqual([
      {
        sourcePath: "runtime_100/assets/icon.png",
        key: "icon.png",
        bytes: new Uint8Array([4, 5, 6]),
      },
    ]);
    const rewritten = JSON.parse(
      new TextDecoder().decode(result.project.bytes),
    );
    expect(rewritten.assets[0]).toMatchObject({
      path: "icon.png",
      originalName: "A.png",
    });
    expect(rewritten.exportProfile).toEqual({
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
    });
  });

  it("requires an explicit valid selection when multiple runtime profiles exist", () => {
    const entries = bundleEntries({ extraRuntime: true });
    expect(() => materializeSymbolVniExportBundleRuntime({ entries })).toThrow(
      /必须明确选择：runtime_100, runtime_50/,
    );
    expect(
      materializeSymbolVniExportBundleRuntime({
        entries,
        selectedProfileId: "runtime_50",
      }).profile.id,
    ).toBe("runtime_50");
    expect(() =>
      materializeSymbolVniExportBundleRuntime({
        entries,
        selectedProfileId: "edit_full",
      }),
    ).toThrow(/VNI runtime 选择无效：edit_full/);
  });

  it("rejects profile mismatch, missing assets, orphan files and flat aliases", () => {
    const mismatch = bundleEntries();
    mismatch.set("runtime_100/l1.json", encode(project("wrong", "runtime")));
    expect(() => inspectSymbolVniExportBundle(mismatch)).toThrow(
      /profile mismatch/,
    );

    const missing = bundleEntries();
    missing.delete("runtime_100/assets/icon.png");
    expect(() => inspectSymbolVniExportBundle(missing)).toThrow(
      /VNI bundle export runtime_100 asset 缺少/,
    );

    const orphan = bundleEntries();
    orphan.set("runtime_100/assets/orphan.png", new Uint8Array([0]));
    expect(() => inspectSymbolVniExportBundle(orphan)).toThrow(/orphan 文件/);

    const alias = bundleEntries();
    const runtime = project("runtime_100", "runtime");
    runtime.assets.push({
      ...runtime.assets[0]!,
      id: "asset-icon-2",
      path: "other/icon.png",
    });
    alias.set("runtime_100/l1.json", encode(runtime));
    alias.set("runtime_100/other/icon.png", new Uint8Array([9]));
    expect(() =>
      materializeSymbolVniExportBundleRuntime({ entries: alias }),
    ).toThrow(/asset filename key collision/);
  });

  it("returns null for a generic manifest without claiming the ZIP", () => {
    expect(
      inspectSymbolVniExportBundle(
        new Map([["manifest.json", encode({ type: "other" })]]),
      ),
    ).toBeNull();
  });

  it("rejects bundles without a runtime and references that escape the ZIP", () => {
    const editingOnly = bundleEntries();
    editingOnly.delete("runtime_100/l1.json");
    editingOnly.delete("runtime_100/assets/icon.png");
    editingOnly.set(
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
        ],
      }),
    );
    expect(() => inspectSymbolVniExportBundle(editingOnly)).toThrow(
      /未声明 purpose=runtime/,
    );

    const escaped = bundleEntries();
    const runtime = project("runtime_100", "runtime", "../../icon.png");
    escaped.set("runtime_100/l1.json", encode(runtime));
    expect(() => inspectSymbolVniExportBundle(escaped)).toThrow(
      /逃出 package 根目录/,
    );
  });
});
