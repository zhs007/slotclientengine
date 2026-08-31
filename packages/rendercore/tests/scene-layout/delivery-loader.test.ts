import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  packageOptions: null as any,
}));

vi.mock("@slotclientengine/browserartifactio", () => ({
  assertCanonicalPackagePath: vi.fn(),
  extractBoundedZip: (bytes: Uint8Array) => {
    if (bytes[0] === 1)
      return new Map([
        ["layout.manifest.json", new Uint8Array([11])],
        ["assets.map.json", new Uint8Array([12])],
      ]);
    if (bytes[0] === 2) return new Map([["free.json", new Uint8Array([22])]]);
    if (bytes[0] === 3) return new Map([["bonus.json", new Uint8Array([33])]]);
    throw new Error("unexpected archive");
  },
}));

vi.mock("@slotclientengine/editorresource", () => ({
  decodeEditorAssetsMap: vi.fn(() => ({
    version: 1,
    kind: "editor-assets",
    files: {
      "intro.mp4": {
        path: `assets/${"d".repeat(64)}.mp4`,
        sha256: "d".repeat(64),
        byteLength: 1,
        mediaType: "video/mp4",
      },
    },
  })),
}));

vi.mock("../../src/scene-layout/package-resource.js", () => ({
  createSceneLayoutPackageResource: vi.fn(async (options) => {
    state.packageOptions = options;
    return {
      manifest: { nodes: [], reels: {} },
      runtimeManifest: {
        id: "streaming-layout",
        gameModes: { initialMode: "BaseGame" },
      },
      layout: {},
      symbolPackage: null,
      symbolPackages: {},
      popupPackages: {},
      destroy: vi.fn(),
    };
  }),
}));

import { loadSceneLayoutDeliveryFromUrl } from "../../src/scene-layout/delivery-loader.js";

describe("Scene Layout delivery loader", () => {
  beforeEach(() => {
    state.packageOptions = null;
  });

  it("loads mode metadata catalogs before create, then prioritizes media and lets an active mode preempt payload readiness", async () => {
    const media = deferred<Response>();
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("initial.zip")) return response([1]);
      if (url.endsWith("intro.mp4")) return media.promise;
      if (url.endsWith("free.zip")) return response([2]);
      if (url.endsWith("bonus.zip")) return response([3]);
      throw new Error(`unexpected URL: ${url}`);
    }) as unknown as typeof fetch;

    const resource = await loadSceneLayoutDeliveryFromUrl({
      urlPrefix: "https://cdn.example/game/",
      manifestBytes: new TextEncoder().encode(JSON.stringify(manifest())),
      fetchImpl,
    });

    expect(requested).toEqual([
      "https://cdn.example/game/initial.zip",
      "https://cdn.example/game/free.zip",
      "https://cdn.example/game/bonus.zip",
      "https://cdn.example/game/intro.mp4",
    ]);
    expect(state.packageOptions.lazyRuntimeResources).toBe(true);
    expect(state.packageOptions.lazyPopupResources).toBe(true);
    expect([...state.packageOptions.files.keys()]).toEqual([
      "layout.manifest.json",
      "assets.map.json",
      "free.json",
      "bonus.json",
      `assets/${"d".repeat(64)}.mp4`,
    ]);
    expect(resource.delivery?.isGameModeReady("BaseGame")).toBe(true);
    expect(resource.delivery?.isGameModeReady("FreeGame")).toBe(false);

    const activeMode = resource.delivery!.loadGameMode("FreeGame");
    await activeMode;
    expect(resource.delivery?.isGameModeReady("FreeGame")).toBe(true);

    media.resolve(response([9]));
    await vi.waitFor(() =>
      expect(resource.delivery?.isGameModeReady("BonusGame")).toBe(true),
    );
    await expect(
      state.packageOptions.loadRuntimeResourceBytes("free.json"),
    ).resolves.toEqual(new Uint8Array([22]));

    await resource.delivery!.loadGameMode("BonusGame");
    await resource.destroy();
  });

  it("loads the project manifest and v2 payload from independent URLs", async () => {
    const requested: string[] = [];
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest(2)));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url === "https://game.example/releases/delivery.manifest.json")
        return new Response(manifestBytes, { status: 200 });
      if (url.endsWith(`${"a".repeat(64)}.zip`)) return response([1]);
      if (url.endsWith(`${"b".repeat(64)}.zip`)) return response([2]);
      if (url.endsWith(`${"c".repeat(64)}.zip`)) return response([3]);
      if (url.endsWith(`${"d".repeat(64)}.mp4`)) return response([9]);
      throw new Error(`unexpected URL: ${url}`);
    }) as unknown as typeof fetch;
    const resource = await loadSceneLayoutDeliveryFromUrl({
      manifestUrl: "https://game.example/releases/delivery.manifest.json",
      urlPrefix: "https://assets.example/cdn/layouts/",
      fetchImpl,
    });

    expect(requested.slice(0, 4)).toEqual([
      "https://game.example/releases/delivery.manifest.json",
      `https://assets.example/cdn/layouts/${"a".repeat(64)}.zip`,
      `https://assets.example/cdn/layouts/${"b".repeat(64)}.zip`,
      `https://assets.example/cdn/layouts/${"c".repeat(64)}.zip`,
    ]);
    await resource.destroy();

    await expect(
      loadSceneLayoutDeliveryFromUrl({
        manifestUrl: "file:///delivery.manifest.json",
        urlPrefix: "https://assets.example/cdn/layouts/",
        manifestBytes,
        fetchImpl,
      }),
    ).rejects.toThrow(/manifest URL must use http or https/);
    await expect(
      loadSceneLayoutDeliveryFromUrl({
        urlPrefix: "https://assets.example/cdn/layouts/",
        fetchImpl,
      }),
    ).rejects.toThrow(/manifestUrl or manifestBytes/);
    await expect(
      loadSceneLayoutDeliveryFromUrl({
        manifestUrl: "https://game.example/releases/delivery.manifest.json",
        urlPrefix: "https://assets.example/cdn/layouts",
        manifestBytes,
        fetchImpl,
      }),
    ).rejects.toThrow(/directory URL/);
  });
});

function manifest(version: 1 | 2 = 1) {
  const metadata = (path: string, sha256: string) => ({
    path,
    sha256,
    byteLength: 1,
    mediaType: "application/zip",
  });
  return {
    version,
    kind: "scene-layout-delivery",
    layoutId: "streaming-layout",
    initialMode: "BaseGame",
    initialChunk: "initial",
    chunks: [
      {
        id: "initial",
        owner: "initial",
        dependencies: [],
        metadata: metadata(
          version === 1 ? "initial.zip" : `${"a".repeat(64)}.zip`,
          "a".repeat(64),
        ),
        atlases: [],
        externalAssets: [],
      },
      {
        id: "media",
        owner: "media",
        dependencies: [],
        metadata: null,
        atlases: [],
        externalAssets: ["intro.mp4"],
      },
      {
        id: "mode:FreeGame",
        owner: "mode:FreeGame",
        dependencies: ["initial"],
        metadata: metadata(
          version === 1 ? "free.zip" : `${"b".repeat(64)}.zip`,
          "b".repeat(64),
        ),
        atlases: [],
        externalAssets: [],
      },
      {
        id: "mode:BonusGame",
        owner: "mode:BonusGame",
        dependencies: ["initial"],
        metadata: metadata(
          version === 1 ? "bonus.zip" : `${"c".repeat(64)}.zip`,
          "c".repeat(64),
        ),
        atlases: [],
        externalAssets: [],
      },
    ],
    atlases: [],
    assets: {
      "intro.mp4": {
        kind: "external",
        owner: "media",
        path: version === 1 ? "intro.mp4" : `${"d".repeat(64)}.mp4`,
        sha256: "d".repeat(64),
        byteLength: 1,
        sourceByteLength: 1,
        mediaType: "video/mp4",
      },
      "free.json": {
        kind: "metadata",
        owner: "mode:FreeGame",
        chunk: "mode:FreeGame",
        entry: "free.json",
        sha256: "f".repeat(64),
        byteLength: 1,
        mediaType: "application/json",
      },
      "bonus.json": {
        kind: "metadata",
        owner: "mode:BonusGame",
        chunk: "mode:BonusGame",
        entry: "bonus.json",
        sha256: "f".repeat(64),
        byteLength: 1,
        mediaType: "application/json",
      },
    },
  };
}

function response(bytes: readonly number[]): Response {
  return new Response(new Uint8Array(bytes), { status: 200 });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
