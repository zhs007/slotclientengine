import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  createUploadedVNIProjectBundle,
  type LoadedUploadedVNIProject,
} from "../src/runtime/uploaded-zip-project";
import { createFixtureZip } from "./fixture-zips";

type MutableMinimalProject = ReturnType<typeof createMinimalProject> & {
  schemaVersion: string;
  maskCompositeMode?: "precompose_light_alpha" | "legacy_alpha";
  layers: Array<
    ReturnType<typeof createMinimalProject>["layers"][number] & {
      blendMode: string;
      mask?: {
        enabled: boolean;
        sourceLayerId: string | null;
        mode: "alpha";
        compositeMode: "precompose_light_alpha" | "legacy_alpha";
        showSourceLayer: boolean;
      };
    }
  >;
};

describe("uploaded zip VNI project bundle", () => {
  it("loads roundreel.zip profiles and defaults to runtime_100", () => {
    const bundle = createUploadedVNIProjectBundle(
      readFixtureZip("roundreel.zip"),
      "roundreel.zip",
    );

    expect(bundle.bundleId).toBe("uploaded:roundreel");
    expect(bundle.defaultProfileId).toBe("runtime_100");
    expect(bundle.profiles.map((profile) => profile.id)).toEqual([
      "edit_full",
      "runtime_100",
    ]);

    const runtime = bundle.loadProfile("runtime_100");
    try {
      expect(runtime.project.name).toBe("roundreel");
      expect(runtime.project.schemaVersion).toBe("VNI_0.042");
      expect(runtime.profileId).toBe("runtime_100");
      expect(runtime.profilePurpose).toBe("runtime");
      expect(runtime.assetScale).toBe(1);
      expect(Object.keys(runtime.assetUrls).sort()).toEqual(
        runtime.project.assets.map((asset) => asset.path).sort(),
      );
      expect(
        runtime.insertionAssets.every((asset) =>
          asset.sourcePath.startsWith("runtime_100/assets/"),
        ),
      ).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  it("resolves roundreel assets independently for edit_full and runtime_100", () => {
    const bundle = createUploadedVNIProjectBundle(
      readFixtureZip("roundreel.zip"),
      "roundreel.zip",
    );
    const runtime = bundle.loadProfile("runtime_100");
    const editFull = bundle.loadProfile("edit_full");

    try {
      expect(runtime.profileId).toBe("runtime_100");
      expect(editFull.profileId).toBe("edit_full");
      expect(Object.keys(editFull.assetUrls).sort()).toEqual(
        editFull.project.assets.map((asset) => asset.path).sort(),
      );
      expect(
        editFull.insertionAssets.every((asset) =>
          asset.sourcePath.startsWith("edit_full/assets/"),
        ),
      ).toBe(true);
      expect(editFull.assetUrls).not.toEqual(runtime.assetUrls);
    } finally {
      runtime.dispose();
      editFull.dispose();
    }
  });

  it("loads megawin.zip as a runtime_50 single-project bundle", () => {
    const bundle = createUploadedVNIProjectBundle(
      readFixtureZip("megawin.zip"),
      "megawin.zip",
    );

    expect(bundle.bundleId).toBe("uploaded:megawin");
    expect(bundle.defaultProfileId).toBe("runtime_50");
    expect(bundle.profiles).toHaveLength(1);

    const loaded = bundle.loadProfile("runtime_50");
    try {
      expect(loaded.project.name).toBe("megawin");
      expect(loaded.profileId).toBe("runtime_50");
      expect(loaded.profilePurpose).toBe("runtime");
      expect(loaded.assetScale).toBe(0.5);
      expect(Object.keys(loaded.assetUrls).sort()).toEqual(
        loaded.project.assets.map((asset) => asset.path).sort(),
      );
      expect(
        loaded.insertionAssets.some((asset) =>
          asset.sourcePath.startsWith("__MACOSX/"),
        ),
      ).toBe(false);
    } finally {
      loaded.dispose();
    }
  });

  it("loads VNI_0.045 Pixi precompose_light_alpha projects", () => {
    const project = createMinimalProject("precompose", undefined, [
      { id: "asset_a", path: "assets/a.png" },
      { id: "asset_b", path: "assets/b.png" },
    ]) as MutableMinimalProject;
    project.schemaVersion = "VNI_0.045";
    project.maskCompositeMode = "precompose_light_alpha";
    project.layers[1].blendMode = "add";
    project.layers[1].mask = {
      enabled: true,
      sourceLayerId: "layer_0",
      mode: "alpha",
      compositeMode: "precompose_light_alpha",
      showSourceLayer: false,
    };

    const bundle = createUploadedVNIProjectBundle(
      createProjectZip(project, {
        "assets/b.png": new Uint8Array([1]),
      }),
      "precompose.zip",
    );
    const loaded = bundle.loadProfile("runtime_50");

    try {
      expect(loaded.project.schemaVersion).toBe("VNI_0.045");
      expect(loaded.project.maskCompositeMode).toBe("precompose_light_alpha");
      expect(loaded.project.layers[1].mask?.compositeMode).toBe(
        "precompose_light_alpha",
      );
    } finally {
      loaded.dispose();
    }
  });

  it("rejects Cocos-compatible legacy_alpha uploads before playback", () => {
    const project = createMinimalProject(
      "legacy-mask",
    ) as MutableMinimalProject;
    project.maskCompositeMode = "legacy_alpha";

    expect(() =>
      createUploadedVNIProjectBundle(
        createProjectZip(project),
        "legacy-mask.zip",
      ),
    ).toThrow("project.maskCompositeMode legacy_alpha");
  });

  it("requires exportProfile for single-project zips", () => {
    const { exportProfile: _exportProfile, ...project } =
      createMinimalProject();

    expect(() =>
      createUploadedVNIProjectBundle(createProjectZip(project), "missing.zip"),
    ).toThrow("missing exportProfile");
  });

  it("requires either manifest.json or a root project.json", () => {
    expect(() =>
      createUploadedVNIProjectBundle(
        zipSync({
          "nested/project.json": encodeJson(createMinimalProject()),
          "assets/a.png": new Uint8Array([1]),
        }),
        "nested.zip",
      ),
    ).toThrow("root project.json");
  });

  it("rejects single-project zips with extra project JSON files", () => {
    expect(() =>
      createUploadedVNIProjectBundle(
        createProjectZip(createMinimalProject(), {
          "other.json": encodeJson(createMinimalProject("other")),
        }),
        "extra-json.zip",
      ),
    ).toThrow("extra JSON");
  });

  it("fails when a referenced asset is missing", () => {
    const bundle = createUploadedVNIProjectBundle(
      zipSync({
        "project.json": encodeJson(createMinimalProject()),
      }),
      "missing-asset.zip",
    );

    expect(() => bundle.loadProfile("runtime_50")).toThrow(
      "asset is missing from zip",
    );
  });

  it("rejects unsafe zip entry paths", () => {
    for (const path of ["../project.json", "/project.json", "assets\\a.png"]) {
      expect(() =>
        createUploadedVNIProjectBundle(
          zipSync({
            [path]: encodeJson(createMinimalProject()),
          }),
          "unsafe.zip",
        ),
      ).toThrow(/relative POSIX path|parent segments/u);
    }
  });

  it("rejects duplicate normalized zip entry paths", () => {
    expect(() =>
      createUploadedVNIProjectBundle(
        zipSync({
          "assets/a.png": new Uint8Array([1]),
          "assets/a.png/": new Uint8Array(),
        }),
        "duplicate.zip",
      ),
    ).toThrow("Duplicate zip entry path");
  });

  it("does not guess a default profile when a manifest has multiple runtime exports", () => {
    const runtimeA = createMinimalProject("runtime-a", {
      id: "runtime_a",
      purpose: "runtime",
      assetScale: 1,
    });
    const runtimeB = createMinimalProject("runtime-b", {
      id: "runtime_b",
      purpose: "runtime",
      assetScale: 1,
    });
    const bundle = createUploadedVNIProjectBundle(
      zipSync({
        "manifest.json": encodeJson({
          type: "vni_export_bundle",
          version: "VNI_0.042",
          exports: [
            {
              id: "runtime_a",
              purpose: "runtime",
              assetScale: 1,
              path: "runtime_a/project.json",
            },
            {
              id: "runtime_b",
              purpose: "runtime",
              assetScale: 1,
              path: "runtime_b/project.json",
            },
          ],
        }),
        "runtime_a/project.json": encodeJson(runtimeA),
        "runtime_a/assets/a.png": new Uint8Array([1]),
        "runtime_b/project.json": encodeJson(runtimeB),
        "runtime_b/assets/a.png": new Uint8Array([1]),
      }),
      "multi-runtime.zip",
    );

    expect(bundle.defaultProfileId).toBeNull();
    expect(bundle.profiles.map((profile) => profile.id)).toEqual([
      "runtime_a",
      "runtime_b",
    ]);
  });

  it("releases created Blob URLs on dispose and on profile load failure", () => {
    const createObjectURL = vi.mocked(URL.createObjectURL);
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();

    const loaded = createUploadedVNIProjectBundle(
      readFixtureZip("megawin.zip"),
      "megawin.zip",
    ).loadProfile("runtime_50");
    const createdUrls = createObjectURL.mock.results.map(
      (result) => result.value,
    );
    expect(createdUrls.length).toBe(loaded.project.assets.length);

    loaded.dispose();
    expect(revokeObjectURL).toHaveBeenCalledTimes(createdUrls.length);
    for (const url of createdUrls) {
      expect(revokeObjectURL).toHaveBeenCalledWith(url);
    }

    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    const project = createMinimalProject("bad-extension", undefined, [
      {
        id: "asset_a",
        path: "assets/a.png",
      },
      {
        id: "asset_b",
        path: "assets/b.gif",
      },
    ]);
    const badBundle = createUploadedVNIProjectBundle(
      createProjectZip(project, {
        "assets/b.gif": new Uint8Array([1]),
      }),
      "bad-extension.zip",
    );

    expect(() => badBundle.loadProfile("runtime_50")).toThrow(
      "Unsupported uploaded VNI image asset extension",
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe("uploaded zip viewer resource boundary", () => {
  it("does not keep old bundled resource registration files", () => {
    expect(existsSync("src/config/bundled-projects.ts")).toBe(false);
    expect(existsSync("src/runtime/asset-manifest.ts")).toBe(false);
    expect(existsSync("src/assets/projects")).toBe(false);
    expect(existsSync("src/assets/assets")).toBe(false);
    if (existsSync("src/assets")) {
      expect(listFiles("src/assets")).toEqual(["src/assets/.keepme"]);
    }
  });

  it("keeps tool configuration free of removed src/assets and JSON import contracts", () => {
    expect(readFileSync(".prettierignore", "utf8")).not.toContain("src/assets");
    expect(readFileSync("vite.config.ts", "utf8")).not.toContain(
      "src/assets/**",
    );
    expect(readFileSync("tsconfig.json", "utf8")).not.toContain(
      "src/**/*.json",
    );
  });
});

function readFixtureZip(name: "roundreel.zip" | "megawin.zip"): Uint8Array {
  return createFixtureZip(name);
}

function createProjectZip(
  project: unknown,
  extraEntries: Record<string, Uint8Array> = {},
): Uint8Array {
  return zipSync({
    "project.json": encodeJson(project),
    "assets/a.png": new Uint8Array([1]),
    ...extraEntries,
  });
}

function encodeJson(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}

function createMinimalProject(
  name = "minimal",
  exportProfile:
    | {
        id: string;
        purpose: "editing" | "runtime";
        assetScale: number;
      }
    | undefined = {
    id: "runtime_50",
    purpose: "runtime",
    assetScale: 0.5,
  },
  assets: readonly { id: string; path: string }[] = [
    { id: "asset_a", path: "assets/a.png" },
  ],
) {
  return {
    schemaVersion: "VNI_0.042",
    editor: {
      name: "VNI",
      version: "0.1.0",
    },
    engineTarget: {
      name: "cocos_creator",
      version: "3.8.6",
    },
    name,
    exportProfile,
    stage: {
      width: 100,
      height: 100,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: assets.map((asset) => ({
      id: asset.id,
      type: "image",
      path: asset.path,
      originalName: asset.path.split("/").at(-1) ?? asset.path,
      width: 10,
      height: 10,
    })),
    layerGroups: [
      {
        id: "group_default",
        name: "Default",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: assets.map((asset, index) => ({
      id: `layer_${index}`,
      name: `Layer ${index}`,
      type: "image",
      assetId: asset.id,
      parentId: null,
      groupId: "group_default",
      visible: true,
      locked: false,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      },
      opacity: 1,
      blendMode: "normal",
      animations: [],
      keyframes: [],
    })),
    particles: [],
  };
}

function listFiles(root: string): string[] {
  return readdirSync(root)
    .flatMap((name) => {
      const path = join(root, name);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    })
    .sort();
}
