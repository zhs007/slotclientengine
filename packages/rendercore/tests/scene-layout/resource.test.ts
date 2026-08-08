import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  loadSceneLayoutResourceFromUrl,
  requireSceneLayoutRuntimeResource,
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
  it("prepares program-owned resources and requires their declared kind", () => {
    const resource = createSceneLayoutResource({
      manifest: {
        ...game002LayoutFixture,
        runtimeResources: {
          "nearwin.image": {
            kind: "image",
            path: "assets/nearwin.png",
            size: { width: 1, height: 1 },
          },
          "nearwin.spine": {
            kind: "spine",
            skeleton: "assets/nearwin.json",
            atlas: "assets/nearwin.atlas",
            textures: { "nearwin.png": "assets/nearwin-spine.png" },
          },
          "spark.vni": {
            kind: "vni",
            project: "effects/runtime.json",
          },
          "win.amount": {
            kind: "image-string",
            manifest:
              "dependencies/image-strings/win-amount/image-string.manifest.json",
          },
          "intro.video": {
            kind: "video",
            path: "intro.mp4",
            mimeType: "video/mp4",
          },
        },
      },
      imageModules: {
        "assets/bg.png": "memory:bg",
        "assets/nearwin.png": "memory:nearwin",
      },
      skeletonModules: {
        "assets/nearwin.json": {
          skeleton: { spine: "4.3.23" },
          animations: {},
        },
      },
      atlasModules: {
        "assets/nearwin.atlas": "nearwin.png\nsize: 1,1\n",
      },
      textureModules: {
        "assets/nearwin-spine.png": "memory:nearwin-spine",
      },
      vniResources: {
        "effects/runtime.json": {
          project: vniProject as never,
          assetUrls: { "assets/spark.png": "memory:spark" },
        },
      },
      imageStringResources: {
        "dependencies/image-strings/win-amount/image-string.manifest.json": {
          manifest: {
            version: 1,
            kind: "image-string",
            id: "win-amount",
            metrics: { lineHeight: 1, letterSpacing: 0 },
            glyphs: {},
            fixedAdvanceGroups: [],
          },
          textures: {},
          destroyed: false,
          assertUsable() {},
          async destroy() {},
        },
      },
      videoModules: { "intro.mp4": "memory:intro" },
    });
    expect(
      requireSceneLayoutRuntimeResource(resource, "nearwin.image", "image"),
    ).toMatchObject({ kind: "image", url: "memory:nearwin" });
    expect(
      requireSceneLayoutRuntimeResource(resource, "nearwin.spine", "spine"),
    ).toMatchObject({
      kind: "spine",
      textureUrls: { "nearwin.png": "memory:nearwin-spine" },
    });
    expect(
      requireSceneLayoutRuntimeResource(resource, "spark.vni", "vni"),
    ).toMatchObject({ kind: "vni", project: vniProject });
    expect(
      requireSceneLayoutRuntimeResource(resource, "intro.video", "video"),
    ).toMatchObject({ kind: "video", url: "memory:intro" });
    expect(
      requireSceneLayoutRuntimeResource(resource, "win.amount", "image-string"),
    ).toMatchObject({ kind: "image-string" });
    expect(() =>
      requireSceneLayoutRuntimeResource(resource, "nearwin.image", "video"),
    ).toThrow(/must be video/);
    expect(() =>
      requireSceneLayoutRuntimeResource(resource, "missing", "image"),
    ).toThrow(/missing/);
    resource.destroy();
  });

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

  it("requires the transition switch event exactly once in its animation timeline", () => {
    const baseSkeleton = {
      skeleton: { spine: "4.3.23" },
      events: {},
      animations: { BG: {}, BG_FG: {} },
    };
    const atlasText =
      "BG.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n";
    const pages = ["BG.png"];
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
