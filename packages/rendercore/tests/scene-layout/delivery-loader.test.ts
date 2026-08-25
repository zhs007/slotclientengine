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

const hash = "a".repeat(64);

describe("Scene Layout delivery loader", () => {
  beforeEach(() => {
    state.packageOptions = null;
  });

  it("returns after initial, prioritizes media background work, and lets an active mode preempt it", async () => {
    const media = deferred<Response>();
    const free = deferred<Response>();
    const bonus = deferred<Response>();
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("initial.zip")) return response([1]);
      if (url.endsWith("intro.mp4")) return media.promise;
      if (url.endsWith("free.zip")) return free.promise;
      if (url.endsWith("bonus.zip")) return bonus.promise;
      throw new Error(`unexpected URL: ${url}`);
    }) as unknown as typeof fetch;

    const resource = await loadSceneLayoutDeliveryFromUrl({
      manifestUrl: "https://cdn.example/game/delivery.manifest.json",
      manifestBytes: new TextEncoder().encode(JSON.stringify(manifest())),
      fetchImpl,
    });

    expect(requested).toEqual([
      "https://cdn.example/game/initial.zip",
      "https://cdn.example/game/intro.mp4",
    ]);
    expect(state.packageOptions.lazyRuntimeResources).toBe(true);
    expect([...state.packageOptions.files.keys()]).toEqual([
      "layout.manifest.json",
      "assets.map.json",
      "intro.mp4",
    ]);
    expect(resource.delivery?.isGameModeReady("BaseGame")).toBe(true);
    expect(resource.delivery?.isGameModeReady("FreeGame")).toBe(false);

    const activeMode = resource.delivery!.loadGameMode("FreeGame");
    await vi.waitFor(() =>
      expect(requested).toContain("https://cdn.example/game/free.zip"),
    );
    expect(requested).not.toContain("https://cdn.example/game/bonus.zip");

    media.resolve(response([9]));
    await Promise.resolve();
    expect(requested).not.toContain("https://cdn.example/game/bonus.zip");
    free.resolve(response([2]));
    await activeMode;
    await vi.waitFor(() =>
      expect(requested).toContain("https://cdn.example/game/bonus.zip"),
    );
    expect(resource.delivery?.isGameModeReady("FreeGame")).toBe(true);
    await expect(
      state.packageOptions.loadRuntimeResourceBytes("free.json"),
    ).resolves.toEqual(new Uint8Array([22]));

    bonus.resolve(response([3]));
    await resource.delivery!.loadGameMode("BonusGame");
    await resource.destroy();
  });
});

function manifest() {
  const metadata = (path: string) => ({
    path,
    sha256: hash,
    byteLength: 1,
    mediaType: "application/zip",
  });
  return {
    version: 1,
    kind: "scene-layout-delivery",
    layoutId: "streaming-layout",
    initialMode: "BaseGame",
    initialChunk: "initial",
    chunks: [
      {
        id: "initial",
        owner: "initial",
        dependencies: [],
        metadata: metadata("initial.zip"),
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
        metadata: metadata("free.zip"),
        atlases: [],
        externalAssets: [],
      },
      {
        id: "mode:BonusGame",
        owner: "mode:BonusGame",
        dependencies: ["initial"],
        metadata: metadata("bonus.zip"),
        atlases: [],
        externalAssets: [],
      },
    ],
    atlases: [],
    assets: {
      "intro.mp4": {
        kind: "external",
        owner: "media",
        path: "intro.mp4",
        sha256: hash,
        byteLength: 1,
        sourceByteLength: 1,
        mediaType: "video/mp4",
      },
      "free.json": {
        kind: "metadata",
        owner: "mode:FreeGame",
        chunk: "mode:FreeGame",
        entry: "free.json",
        sha256: hash,
        byteLength: 1,
        mediaType: "application/json",
      },
      "bonus.json": {
        kind: "metadata",
        owner: "mode:BonusGame",
        chunk: "mode:BonusGame",
        entry: "bonus.json",
        sha256: hash,
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
