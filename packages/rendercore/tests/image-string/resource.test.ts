import { Assets, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createImageStringResource,
  createImageStringResourceFromFiles,
  createRenderImageString,
  loadImageStringResourceFromUrl,
  validateImageStringPackageContents,
} from "../../src/image-string/index.js";
import { imageStringManifestFixture } from "./fixtures.js";

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
    expect(renderer.container.pivot.x).toBe(9);
    renderer.setText("10");
    expect(renderer.container.children).toEqual(firstChildren);
    const beforeFailure = renderer.getSnapshot();
    expect(() => renderer.setText("2")).toThrow("缺少 glyph");
    expect(renderer.getSnapshot()).toBe(beforeFailure);
    renderer.setText("");
    expect(renderer.container.children).toHaveLength(0);
    renderer.setText("0");
    expect(firstChildren).toContain(renderer.container.children[0]);
    renderer.destroy();
    renderer.destroy();
    expect(() => renderer.setText("0")).toThrow("已销毁");
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
