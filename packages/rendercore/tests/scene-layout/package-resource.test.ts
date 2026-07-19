import { Assets, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  collectSceneLayoutPackagePaths,
  createSceneLayoutPackageResource,
  loadSceneLayoutPackageFromUrl,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

const imageStringManifest = {
  version: 1,
  kind: "image-string",
  id: "digits",
  metrics: { lineHeight: 1, letterSpacing: 0 },
  glyphs: {
    "0": {
      path: "assets/0.png",
      size: { width: 1, height: 1 },
      offset: { x: 0, y: 0 },
    },
    "1": {
      path: "assets/1.png",
      size: { width: 1, height: 1 },
      offset: { x: 0, y: 0 },
    },
  },
  fixedAdvanceGroups: [],
};

const dependencyPath =
  "dependencies/image-strings/digits/image-string.manifest.json";

const packageManifest = {
  ...game002LayoutFixture,
  nodes: [
    game002LayoutFixture.nodes[0],
    {
      id: "first",
      order: 1,
      resource: {
        kind: "image-string" as const,
        manifest: dependencyPath,
        text: "001",
        anchor: { x: 0.5, y: 0.5 },
      },
      placements: { default: { x: 10, y: 20, scale: 1 } },
    },
    {
      id: "second",
      order: 2,
      resource: {
        kind: "image-string" as const,
        manifest: dependencyPath,
        text: "10",
        anchor: { x: 0, y: 1 },
      },
      placements: { default: { x: 30, y: 40, scale: 1 } },
    },
  ],
};

function packageFiles(): Map<string, Uint8Array> {
  return new Map([
    ["assets/bg.png", new Uint8Array([1])],
    [dependencyPath, encode(imageStringManifest)],
    ["dependencies/image-strings/digits/assets/0.png", new Uint8Array([2])],
    ["dependencies/image-strings/digits/assets/1.png", new Uint8Array([3])],
  ]);
}

describe("scene layout package resources", () => {
  it("collects an exact transitive closure and shares nested image-string resources", async () => {
    const files = packageFiles();
    expect(
      collectSceneLayoutPackagePaths({ manifest: packageManifest, files }),
    ).toEqual([
      "assets/bg.png",
      "dependencies/image-strings/digits/assets/0.png",
      "dependencies/image-strings/digits/assets/1.png",
      dependencyPath,
    ]);
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: packageManifest,
        files,
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
      expect(Object.keys(resource.imageStrings)).toEqual([dependencyPath]);
      expect(resource.layout.imageStringResources[dependencyPath]).toBe(
        resource.imageStrings[dependencyPath],
      );
      expect(load).toHaveBeenCalledTimes(2);
      await resource.destroy();
      await resource.destroy();
      expect(unload).toHaveBeenCalledOnce();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("rejects orphan files, dependency id drift and missing glyphs before runtime", async () => {
    const extra = packageFiles();
    extra.set("assets/orphan.png", new Uint8Array([9]));
    expect(() =>
      collectSceneLayoutPackagePaths({
        manifest: packageManifest,
        files: extra,
      }),
    ).toThrow(/精确一致/);

    const wrongId = packageFiles();
    wrongId.set(
      dependencyPath,
      encode({ ...imageStringManifest, id: "other" }),
    );
    expect(() =>
      collectSceneLayoutPackagePaths({
        manifest: packageManifest,
        files: wrongId,
      }),
    ).toThrow(/id mismatch/);

    const missingGlyphManifest = {
      ...packageManifest,
      nodes: packageManifest.nodes.map((node) =>
        node.id === "first"
          ? {
              ...node,
              resource: { ...node.resource, text: "2" },
            }
          : node,
      ),
    };
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    try {
      await expect(
        createSceneLayoutPackageResource({
          manifest: missingGlyphManifest,
          files: packageFiles(),
          decodeImage: async () => ({ width: 1, height: 1 }),
        }),
      ).rejects.toThrow(/缺少 glyph/);
    } finally {
      load.mockRestore();
    }
  });

  it("loads only the exact CDN subtree while preserving URL query/hash isolation", async () => {
    const files = packageFiles();
    const responses = new Map<string, Uint8Array>([
      ["layout.manifest.json", encode(packageManifest)],
      ...files,
    ]);
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requested.push(url.href);
      const path = url.pathname.slice("/cdn/layouts/demo/".length);
      const bytes = responses.get(path);
      return bytes
        ? new Response(bytes as BodyInit)
        : new Response("missing", { status: 404 });
    });
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await loadSceneLayoutPackageFromUrl({
        manifestUrl:
          "https://cdn.example.com/cdn/layouts/demo/layout.manifest.json?v=7#release",
        fetchImpl,
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
      expect(requested).toEqual([
        "https://cdn.example.com/cdn/layouts/demo/layout.manifest.json?v=7#release",
        "https://cdn.example.com/cdn/layouts/demo/assets/bg.png",
        `https://cdn.example.com/cdn/layouts/demo/${dependencyPath}`,
        "https://cdn.example.com/cdn/layouts/demo/dependencies/image-strings/digits/assets/0.png",
        "https://cdn.example.com/cdn/layouts/demo/dependencies/image-strings/digits/assets/1.png",
      ]);
      await resource.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("rejects unsupported package URLs and precise HTTP failures", async () => {
    await expect(
      loadSceneLayoutPackageFromUrl({
        manifestUrl: "file:///layout.manifest.json",
      }),
    ).rejects.toThrow(/http or https/);
    await expect(
      loadSceneLayoutPackageFromUrl({
        manifestUrl: "https://cdn.example.com/layout.manifest.json",
        fetchImpl: async () => new Response("missing", { status: 404 }),
      }),
    ).rejects.toThrow(/HTTP 404/);
    await expect(
      loadSceneLayoutPackageFromUrl({
        manifestUrl: "https://cdn.example.com/layout.manifest.json",
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow(/offline/);
  });

  it("loads the root manifest from files and reports malformed JSON and UTF-8", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const files = new Map(packageFiles());
      files.set("layout.manifest.json", encode(packageManifest));
      const resource = await createSceneLayoutPackageResource({
        files,
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
      await resource.destroy();

      await expect(
        createSceneLayoutPackageResource({
          files: new Map([
            ["layout.manifest.json", new TextEncoder().encode("{")],
          ]),
        }),
      ).rejects.toThrow(/JSON/);
      await expect(
        createSceneLayoutPackageResource({
          files: new Map([
            ["layout.manifest.json", new Uint8Array([0xff, 0xfe])],
          ]),
        }),
      ).rejects.toThrow(/UTF-8/);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });
});
