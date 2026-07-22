import { Assets, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createImageStringResource,
  createImageStringResourceFromFiles,
  createImageStringResourceFromResolvedFiles,
  createRenderImageString,
  loadImageStringResourceFromUrl,
  resolveImageStringPackageFiles,
  validateImageStringPackageContents,
} from "../../src/image-string/index.js";
import { imageStringManifestFixture } from "./fixtures.js";
import { createMappedPackageFiles } from "../editor-assets-map-fixture.js";

const encoder = new TextEncoder();

function files(): Map<string, Uint8Array> {
  return new Map([
    [
      "image-string.manifest.json",
      encoder.encode(JSON.stringify(imageStringManifestFixture)),
    ],
    ...Object.values(imageStringManifestFixture.glyphs).map(
      (glyph) => [glyph.path, new Uint8Array([1, 2, 3])] as const,
    ),
  ]);
}

describe("image-string resource", () => {
  it("validates exact package closure", () => {
    expect(
      validateImageStringPackageContents({
        manifest: imageStringManifestFixture,
        files: files(),
      }).id,
    ).toBe("neutral-glyphs");
    const orphan = files();
    orphan.set("assets/orphan.png", new Uint8Array());
    expect(() =>
      validateImageStringPackageContents({
        manifest: imageStringManifestFixture,
        files: orphan,
      }),
    ).toThrow("多余");
  });

  it("decodes and checks every declared image size", async () => {
    const resource = await createImageStringResourceFromFiles({
      files: files(),
      decodeImage: async (_blob, path) => {
        const glyph = Object.values(imageStringManifestFixture.glyphs).find(
          (candidate) => candidate.path === path,
        )!;
        return glyph.size;
      },
      loadTexture: async () => new Texture({ source: Texture.EMPTY.source }),
    });
    expect(resource.destroyed).toBe(false);
    await resource.destroy();
    expect(resource.destroyed).toBe(true);
    expect(() => resource.assertUsable()).toThrow("已销毁");
  });

  it("resolves filename-key packages through one assets map for files and CDN URLs", async () => {
    const manifest = {
      ...imageStringManifestFixture,
      glyphs: Object.fromEntries(
        Object.entries(imageStringManifestFixture.glyphs).map(
          ([character, glyph]) => [
            character,
            { ...glyph, path: glyph.path.split("/").at(-1)! },
          ],
        ),
      ),
    };
    const assets = new Map(
      Object.values(manifest.glyphs).map(
        (glyph) => [glyph.path, new Uint8Array([1, 2, 3])] as const,
      ),
    );
    const root = encoder.encode(JSON.stringify(manifest));
    const mapped = await createMappedPackageFiles({
      controls: new Map([["image-string.manifest.json", root]]),
      assets,
    });
    const resolved = await resolveImageStringPackageFiles({
      manifest,
      files: mapped.files,
    });
    expect(resolved.mapped).toBe(true);
    const direct = await createImageStringResourceFromResolvedFiles({
      manifest,
      files: resolved.files,
      decodeImage: async (_blob, path) =>
        Object.values(manifest.glyphs).find((glyph) => glyph.path === path)!
          .size,
      loadTexture: async () => new Texture({ source: Texture.EMPTY.source }),
    });
    await direct.destroy();

    const responses = new Map<string, Uint8Array>([
      ["https://cdn.example/library/image-string.manifest.json", root],
      [
        "https://cdn.example/library/assets.map.json",
        mapped.files.get("assets.map.json")!,
      ],
      ...Object.values(mapped.map.files).map(
        ({ path }) =>
          [
            `https://cdn.example/library/${path}`,
            mapped.files.get(path)!,
          ] as const,
      ),
    ]);
    const remote = await loadImageStringResourceFromUrl({
      manifestUrl: "https://cdn.example/library/image-string.manifest.json",
      fetchImpl: async (input) => {
        const bytes = responses.get(String(input));
        return bytes
          ? new Response(bytes.slice().buffer)
          : new Response(null, { status: 404 });
      },
      decodeImage: async (_blob, path) =>
        Object.values(manifest.glyphs).find((glyph) => glyph.path === path)!
          .size,
      loadTexture: async () => new Texture({ source: Texture.EMPTY.source }),
    });
    await remote.destroy();

    await expect(
      resolveImageStringPackageFiles({ manifest, files: new Map() }),
    ).rejects.toThrow(/assets\.map/);
    const withoutRoot = new Map(mapped.files);
    withoutRoot.delete("image-string.manifest.json");
    await expect(
      resolveImageStringPackageFiles({ manifest, files: withoutRoot }),
    ).rejects.toThrow(/image-string\.manifest/);
    await expect(
      resolveImageStringPackageFiles({
        manifest: imageStringManifestFixture,
        files: new Map([
          ...files(),
          ["assets.map.json", mapped.files.get("assets.map.json")!],
        ]),
      }),
    ).rejects.toThrow(/legacy/);

    const badMapResponses = new Map(responses);
    badMapResponses.set(
      "https://cdn.example/library/assets.map.json",
      encoder.encode("{"),
    );
    await expect(
      loadImageStringResourceFromUrl({
        manifestUrl: "https://cdn.example/library/image-string.manifest.json",
        fetchImpl: async (input) => {
          const bytes = badMapResponses.get(String(input));
          return bytes
            ? new Response(bytes.slice().buffer)
            : new Response(null, { status: 404 });
        },
      }),
    ).rejects.toThrow(/assets\.map/);

    const missingEntryMap = structuredClone(mapped.map);
    delete (missingEntryMap.files as Record<string, unknown>)[
      Object.keys(missingEntryMap.files)[0]!
    ];
    const missingEntryResponses = new Map(responses);
    missingEntryResponses.set(
      "https://cdn.example/library/assets.map.json",
      encoder.encode(JSON.stringify(missingEntryMap)),
    );
    await expect(
      loadImageStringResourceFromUrl({
        manifestUrl: "https://cdn.example/library/image-string.manifest.json",
        fetchImpl: async (input) => {
          const bytes = missingEntryResponses.get(String(input));
          return bytes
            ? new Response(bytes.slice().buffer)
            : new Response(null, { status: 404 });
        },
      }),
    ).rejects.toThrow(/未声明/);
  });

  it("fails a size mismatch before exposing a resource", async () => {
    await expect(
      createImageStringResourceFromFiles({
        files: files(),
        decodeImage: async () => ({ width: 1, height: 1 }),
        loadTexture: async () => new Texture({ source: Texture.EMPTY.source }),
      }),
    ).rejects.toThrow("尺寸不匹配");
  });

  it("renders atomically, reuses sprites, and supports independent renderer lifetime", async () => {
    const texture = Texture.EMPTY;
    const imageModules = Object.fromEntries(
      Object.values(imageStringManifestFixture.glyphs).map((glyph) => [
        glyph.path,
        texture,
      ]),
    );
    const resource = await createImageStringResource({
      manifest: imageStringManifestFixture,
      imageModules,
    });
    const renderer = createRenderImageString({ resource, text: "01" });
    const firstChildren = [...renderer.container.children];
    expect(renderer.container.pivot.x).toBe(8);
    renderer.setText("10");
    expect(renderer.container.children).toEqual(firstChildren);
    expect(renderer.container.pivot.x).toBe(10);
    renderer.setText("010");
    expect(renderer.container.pivot.x).toBe(14);
    const beforeFailure = renderer.getSnapshot();
    expect(() => renderer.setText("2")).toThrow("缺少 glyph");
    expect(renderer.getSnapshot()).toBe(beforeFailure);
    renderer.setText("");
    expect(renderer.container.children).toHaveLength(0);
    renderer.setText("0");
    expect(firstChildren).toContain(renderer.container.children[0]);
    const alternate = await createImageStringResource({
      manifest: {
        ...imageStringManifestFixture,
        id: "alternate-glyphs",
        metrics: { lineHeight: 20, letterSpacing: 4 },
      },
      imageModules,
    });
    const stableContainer = renderer.container;
    renderer.setResource(alternate, "10");
    expect(renderer.container).toBe(stableContainer);
    expect(renderer.container.children).toEqual(firstChildren);
    expect(renderer.getSnapshot()).toMatchObject({
      text: "10",
      logicalBounds: { width: 20, height: 20 },
    });
    renderer.destroy();
    renderer.destroy();
    expect(() => renderer.setText("0")).toThrow("已销毁");
    await alternate.destroy();
    await resource.destroy();
  });

  it("loads the manifest and exact glyph closure from a contained http URL", async () => {
    const responses = new Map<string, Response>([
      [
        "https://cdn.example/library/image-string.manifest.json",
        new Response(JSON.stringify(imageStringManifestFixture)),
      ],
      ...Object.values(imageStringManifestFixture.glyphs).map(
        (glyph) =>
          [
            `https://cdn.example/library/${glyph.path}`,
            new Response(new Uint8Array([1, 2, 3])),
          ] as const,
      ),
    ]);
    const resource = await loadImageStringResourceFromUrl({
      manifestUrl: "https://cdn.example/library/image-string.manifest.json",
      fetchImpl: async (input) =>
        responses.get(String(input)) ?? new Response(null, { status: 404 }),
      decodeImage: async (_blob, path) =>
        Object.values(imageStringManifestFixture.glyphs).find(
          (glyph) => glyph.path === path,
        )!.size,
      loadTexture: async () => new Texture({ source: Texture.EMPTY.source }),
    });
    expect(resource.manifest.id).toBe("neutral-glyphs");
    await resource.destroy();
  });

  it("reports invalid URLs, fetch failures, bad JSON and exact module mismatch", async () => {
    await expect(
      loadImageStringResourceFromUrl({ manifestUrl: "file:///tmp/x.json" }),
    ).rejects.toThrow("http");
    await expect(
      loadImageStringResourceFromUrl({
        manifestUrl: "https://cdn.example/image-string.manifest.json",
        fetchImpl: async () => new Response(null, { status: 503 }),
      }),
    ).rejects.toThrow("503");
    await expect(
      loadImageStringResourceFromUrl({
        manifestUrl: "https://cdn.example/image-string.manifest.json",
        fetchImpl: async () => new Response("{"),
      }),
    ).rejects.toThrow("JSON");
    await expect(
      createImageStringResource({
        manifest: imageStringManifestFixture,
        imageModules: { "assets/orphan.png": Texture.EMPTY },
      }),
    ).rejects.toThrow("精确匹配");
  });

  it("releases already loaded owned textures when preparation fails", async () => {
    const loaded = new Texture({ source: Texture.EMPTY.source });
    const destroy = vi.spyOn(loaded, "destroy");
    await expect(
      createImageStringResource({
        manifest: imageStringManifestFixture,
        imageModules: Object.fromEntries(
          Object.values(imageStringManifestFixture.glyphs).map((glyph) => [
            glyph.path,
            `https://cdn.example/${glyph.path}`,
          ]),
        ),
        loadTexture: async (_url, path) => {
          if (path.endsWith("u0031.webp")) throw new Error("load failed");
          return loaded;
        },
      }),
    ).rejects.toThrow("load failed");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("loads and unloads extensionless blob URLs through Pixi Assets", async () => {
    const texture = new Texture({ source: Texture.EMPTY.source });
    const destroy = vi.spyOn(texture, "destroy");
    const load = vi
      .spyOn(
        Assets as unknown as {
          load(input: unknown): Promise<Texture>;
        },
        "load",
      )
      .mockResolvedValue(texture);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue();
    const imageModules = Object.fromEntries(
      Object.values(imageStringManifestFixture.glyphs).map((glyph, index) => [
        glyph.path,
        `blob:https://editor.example/${index}`,
      ]),
    );
    const resource = await createImageStringResource({
      manifest: imageStringManifestFixture,
      imageModules,
    });
    expect(load).toHaveBeenCalledTimes(4);
    expect(load).toHaveBeenCalledWith({
      src: "blob:https://editor.example/0",
      parser: "loadTextures",
    });
    await resource.destroy();
    expect(unload).toHaveBeenCalledOnce();
    expect(unload).toHaveBeenCalledWith(Object.values(imageModules));
    expect(destroy).not.toHaveBeenCalled();
    load.mockRestore();
    unload.mockRestore();
  });
});
