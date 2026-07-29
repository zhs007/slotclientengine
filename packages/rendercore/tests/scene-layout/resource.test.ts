import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  loadSceneLayoutResourceFromUrl,
} from "../../src/scene-layout/index.js";
import { transitionResourceKey } from "../../src/scene-layout/resource.js";
import { game002LayoutFixture } from "./fixtures.js";

const vniProject = {
  schemaVersion: "VNI_0.020",
  editor: { name: "VNI", version: "VNI_0.020" },
  engineTarget: { name: "cocos_creator", version: "3.8.6" },
  name: "scene-fx",
  exportProfile: { id: "runtime", purpose: "runtime", assetScale: 1 },
  stage: {
    width: 100,
    height: 200,
    coordinate: "center",
    duration: 1,
    backgroundColor: "#000000",
  },
  assets: [
    {
      id: "spark",
      type: "image",
      path: "assets/spark.png",
      originalName: "spark.png",
      width: 1,
      height: 1,
      fileWidth: 1,
      fileHeight: 1,
      fileScale: 1,
    },
  ],
  layerGroups: [],
  layers: [],
  particles: [],
};

describe("scene layout resources", () => {
  it("validates the exact VNI project and asset URL closure", () => {
    const manifest = {
      ...game002LayoutFixture,
      nodes: [
        game002LayoutFixture.nodes[0],
        {
          id: "vni-fx",
          order: 1,
          resource: {
            kind: "vni" as const,
            project: "effects/runtime.json",
            loop: false,
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
        {
          id: "vni-fx-copy",
          order: 2,
          resource: {
            kind: "vni" as const,
            project: "effects/runtime.json",
            loop: false,
          },
          placements: { default: { x: 20, y: 30, scale: 0.5 } },
        },
      ],
    };
    const options = {
      manifest,
      imageModules: { "assets/bg.png": "memory:bg" },
      vniResources: {
        "effects/runtime.json": {
          project: vniProject as never,
          assetUrls: { "assets/spark.png": "memory:spark" },
        },
      },
    };
    const resource = createSceneLayoutResource(options);
    expect(
      resource.vniResources["effects/runtime.json"]?.assetUrls[
        "assets/spark.png"
      ],
    ).toBe("memory:spark");
    resource.destroy();

    expect(() =>
      createSceneLayoutResource({
        manifest,
        imageModules: options.imageModules,
      }),
    ).toThrow(/VNI resource is missing/);
    expect(() =>
      createSceneLayoutResource({
        ...options,
        vniResources: {
          ...options.vniResources,
          "effects/extra.json": options.vniResources["effects/runtime.json"],
        },
      }),
    ).toThrow(/exactly match/);
    expect(() =>
      createSceneLayoutResource({
        ...options,
        vniResources: {
          "effects/runtime.json": {
            project: {
              ...vniProject,
              exportProfile: {
                ...vniProject.exportProfile,
                purpose: "preview",
              },
            } as never,
            assetUrls: { "assets/spark.png": "memory:spark" },
          },
        },
      }),
    ).toThrow(/runtime exportProfile/);
    expect(() =>
      createSceneLayoutResource({
        ...options,
        vniResources: {
          "effects/runtime.json": {
            project: vniProject as never,
            assetUrls: {},
          },
        },
      }),
    ).toThrow(/assets\/spark\.png/);
  });

  it("loads a VNI project and its exact assets from the CDN", async () => {
    const manifest = {
      ...game002LayoutFixture,
      nodes: [
        game002LayoutFixture.nodes[0],
        {
          id: "vni-fx",
          order: 1,
          resource: {
            kind: "vni" as const,
            project: "effects/runtime.json",
            loop: true,
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
        {
          id: "vni-fx-copy",
          order: 2,
          resource: {
            kind: "vni" as const,
            project: "effects/runtime.json",
            loop: false,
          },
          placements: { default: { x: 20, y: 30, scale: 0.5 } },
        },
      ],
    };
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requested.push(url.pathname);
      if (url.pathname.endsWith("layout.manifest.json"))
        return new Response(JSON.stringify(manifest));
      if (url.pathname.endsWith("effects/runtime.json"))
        return new Response(JSON.stringify(vniProject));
      return new Response(new Blob([new Uint8Array([1])]));
    });
    const resource = await loadSceneLayoutResourceFromUrl({
      manifestUrl: "https://cdn.example/layout/layout.manifest.json",
      fetchImpl,
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    expect(requested).toEqual([
      "/layout/layout.manifest.json",
      "/layout/effects/runtime.json",
      "/layout/effects/assets/spark.png",
      "/layout/assets/bg.png",
    ]);
    expect(
      resource.vniResources["effects/runtime.json"]?.assetUrls[
        "assets/spark.png"
      ],
    ).toMatch(/^blob:/u);
    resource.destroy();

    await expect(
      loadSceneLayoutResourceFromUrl({
        manifestUrl: "https://cdn.example/layout/layout.manifest.json",
        fetchImpl: async (input) =>
          String(input).endsWith("layout.manifest.json")
            ? new Response(JSON.stringify(manifest))
            : new Response("{"),
      }),
    ).rejects.toThrow(/VNI project.*invalid JSON/);
  });

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

  it("requires the transition switch event exactly once in its animation timeline", () => {
    const root = resolve(__dirname, "../../../../");
    const baseSkeleton = JSON.parse(
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
            kind: "spine" as const,
            skeleton: "assets/bg/bg.json",
            atlas: "assets/bg/bg.atlas",
            textures,
            defaultAnimation: "BG",
            loop: true as const,
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            backgroundNodes: { default: "bg" },
            nodeStates: {},
          },
          {
            id: "FreeGame",
            backgroundNodes: { default: "bg" },
            nodeStates: {},
          },
        ],
        transitions: [
          {
            from: "BaseGame",
            to: "FreeGame",
            overlay: {
              resource: {
                kind: "spine" as const,
                skeleton: "assets/bg/bg.json",
                atlas: "assets/bg/bg.atlas",
                textures,
              },
              animation: "BG_FG",
              switchEvent: "SwitchScene",
              placements: { default: { x: 0, y: 0, scale: 1 } },
            },
          },
        ],
      },
    };
    const makeSkeleton = (
      events: readonly { time: number; name: string }[],
    ) => ({
      ...structuredClone(baseSkeleton),
      events: { ...structuredClone(baseSkeleton.events), SwitchScene: {} },
      animations: {
        ...structuredClone(baseSkeleton.animations),
        BG_FG: { events },
      },
    });
    const create = (events: readonly { time: number; name: string }[]) =>
      createSceneLayoutResource({
        manifest,
        skeletonModules: { "assets/bg/bg.json": makeSkeleton(events) },
        atlasModules: { "assets/bg/bg.atlas": atlasText },
        textureModules: Object.fromEntries(
          pages.map((page) => [`assets/bg/${page}`, `memory:${page}`]),
        ),
      });

    expect(() => create([])).toThrow(/exactly once.*found 0/);
    expect(() =>
      create([
        { time: 0.2, name: "SwitchScene" },
        { time: 0.8, name: "SwitchScene" },
      ]),
    ).toThrow(/exactly once.*found 2/);
    const resource = create([{ time: 0, name: "SwitchScene" }]);
    expect(
      resource.spineResources[transitionResourceKey("BaseGame", "FreeGame")],
    ).toBeDefined();
    resource.destroy();
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
    vi.stubGlobal("fetch", undefined);
    await expect(
      loadSceneLayoutResourceFromUrl({
        manifestUrl: "https://cdn.example.com/layout.manifest.json",
      }),
    ).rejects.toThrow(/fetchImpl is required/);
    vi.unstubAllGlobals();
  });
});
