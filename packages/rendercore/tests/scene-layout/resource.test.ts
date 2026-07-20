import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  loadSceneLayoutResourceFromUrl,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout resources", () => {
  it("requires an exact image module closure", () => {
    expect(() =>
      createSceneLayoutResource({ manifest: game002LayoutFixture }),
    ).toThrow(/missing/);
    expect(() =>
      createSceneLayoutResource({
        manifest: game002LayoutFixture,
        imageModules: {
          "assets/bg.png": "memory:bg",
          "assets/extra.png": "memory:extra",
        },
      }),
    ).toThrow(/exactly match/);
    expect(() =>
      createSceneLayoutResource({
        manifest: game002LayoutFixture,
        imageModules: { "assets/bg.png": "" },
      }),
    ).toThrow(/non-empty string/);
  });

  it("validates the real game002 official Spine 4.3 BG loop", () => {
    const root = resolve(__dirname, "../../../../");
    const skeleton = JSON.parse(
      readFileSync(resolve(root, "assets/game002-s3/BG.json"), "utf8"),
    );
    const atlasText = readFileSync(
      resolve(root, "assets/game002-s3/BG.atlas"),
      "utf8",
    );
    const pages = [
      "BG.png",
      "BG_2.png",
      "BG_3.png",
      "BG_4.png",
      "BG_5.png",
      "BG_6.png",
      "BG_7.png",
      "BG_8.png",
    ];
    const textures = Object.fromEntries(
      pages.map((page) => [page, `assets/bg/${page}`]),
    );
    const manifest = {
      ...game002LayoutFixture,
      nodes: [
        {
          id: "bg",
          order: 0,
          resource: {
            kind: "spine",
            skeleton: "assets/bg/bg.json",
            atlas: "assets/bg/bg.atlas",
            textures,
            defaultAnimation: "BG",
            loop: true,
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
    } as const;
    const resource = createSceneLayoutResource({
      manifest,
      skeletonModules: { "assets/bg/bg.json": skeleton },
      atlasModules: { "assets/bg/bg.atlas": atlasText },
      textureModules: Object.fromEntries(
        pages.map((page) => [
          `assets/bg/${page}`,
          `memory:${page.toLowerCase()}`,
        ]),
      ),
    });
    expect(resource.spineResources.bg).toBeDefined();
    resource.destroy();
    resource.destroy();
    const sharedTexturePath = "assets/bg/shared.webp";
    const deduplicatedTextures = {
      ...textures,
      "BG.png": sharedTexturePath,
      "BG_2.png": sharedTexturePath,
    };
    const deduplicatedManifest = {
      ...manifest,
      nodes: [
        {
          ...manifest.nodes[0],
          resource: {
            ...manifest.nodes[0].resource,
            textures: deduplicatedTextures,
          },
        },
      ],
    } as const;
    const deduplicated = createSceneLayoutResource({
      manifest: deduplicatedManifest,
      skeletonModules: { "assets/bg/bg.json": skeleton },
      atlasModules: { "assets/bg/bg.atlas": atlasText },
      textureModules: Object.fromEntries(
        [...new Set(Object.values(deduplicatedTextures))].map((path) => [
          path,
          `memory:${path}`,
        ]),
      ),
    });
    expect(deduplicated.spineResources.bg?.textureUrls["BG.png"]).toBe(
      deduplicated.spineResources.bg?.textureUrls["BG_2.png"],
    );
    deduplicated.destroy();
    expect(() =>
      createSceneLayoutResource({
        manifest: {
          ...manifest,
          nodes: [
            {
              ...manifest.nodes[0],
              resource: {
                ...manifest.nodes[0].resource,
                defaultAnimation: "bg",
              },
            },
          ],
        },
        skeletonModules: { "assets/bg/bg.json": skeleton },
        atlasModules: { "assets/bg/bg.atlas": atlasText },
        textureModules: Object.fromEntries(
          pages.map((page) => [`assets/bg/${page}`, `memory:${page}`]),
        ),
      }),
    ).toThrow(/animation "bg" was not found/);
  });

  it("loads the exact CDN closure and rejects network/protocol/JSON failures", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("layout.manifest.json")) {
        return new Response(JSON.stringify(game002LayoutFixture));
      }
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        headers: { "content-type": "image/png" },
      });
    });
    const resource = await loadSceneLayoutResourceFromUrl({
      manifestUrl: "https://cdn.example.com/game/layout.manifest.json",
      fetchImpl,
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    resource.destroy();
    await expect(
      loadSceneLayoutResourceFromUrl({
        manifestUrl: "https://cdn.example.com/game/layout.manifest.json",
        fetchImpl,
        decodeImage: async () => ({ width: 2, height: 1 }),
      }),
    ).rejects.toThrow(/size mismatch/);
    await expect(
      loadSceneLayoutResourceFromUrl({
        manifestUrl: "file:///layout.manifest.json",
        fetchImpl,
      }),
    ).rejects.toThrow(/http or https/);
    await expect(
      loadSceneLayoutResourceFromUrl({
        manifestUrl: "https://cdn.example.com/layout.manifest.json",
        fetchImpl: async () => new Response("bad", { status: 500 }),
      }),
    ).rejects.toThrow(/HTTP 500/);
    await expect(
      loadSceneLayoutResourceFromUrl({
        manifestUrl: "https://cdn.example.com/layout.manifest.json",
        fetchImpl: async () => new Response("{"),
      }),
    ).rejects.toThrow(/JSON is invalid/);
    await expect(
      loadSceneLayoutResourceFromUrl({
        manifestUrl: "https://cdn.example.com/layout.manifest.json",
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow(/offline/);
  });
});
