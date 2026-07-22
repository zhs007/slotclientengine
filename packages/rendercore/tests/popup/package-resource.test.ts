import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMappedPackageFiles } from "../editor-assets-map-fixture.js";

const destroyImageString = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/image-string/index.js", async (original) => {
  const actual =
    await original<typeof import("../../src/image-string/index.js")>();
  return {
    ...actual,
    createImageStringResourceFromFiles: vi.fn(
      async (options: { files: ReadonlyMap<string, Uint8Array> }) => ({
        manifest: actual.parseImageStringManifest(
          JSON.parse(
            new TextDecoder().decode(
              options.files.get("image-string.manifest.json"),
            ),
          ),
        ),
        textures: {},
        destroyed: false,
        assertUsable() {},
        destroy: destroyImageString,
      }),
    ),
  };
});

describe("popup package resource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:${Math.random()}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("validates exact transitive image-string/VNI/Spine/image closure, prepares all kinds and destroys owners", async () => {
    const { collectPopupPackagePaths, createPopupPackageResource } =
      await import("../../src/popup/package-resource.js");
    const { manifest, files } = fixture();
    expect(collectPopupPackagePaths({ manifest, files })).toHaveLength(
      files.size - 1,
    );
    const texture = { width: 1, height: 1, destroy: vi.fn() };
    const resource = await createPopupPackageResource({
      manifest,
      files,
      loadTexture: vi.fn(async () => texture as never),
    });
    expect(Object.keys(resource.resources).sort()).toEqual([
      "amount",
      "image",
      "image-jpg",
      "image-other",
      "image-webp",
      "spine",
      "vni",
    ]);
    await resource.destroy();
    await resource.destroy();
    expect(destroyImageString).toHaveBeenCalledOnce();
    expect(texture.destroy).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("loads the same exact closure from contained CDN URLs", async () => {
    const { loadPopupPackageFromUrl } =
      await import("../../src/popup/package-resource.js");
    const { files } = fixture();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const path = url.pathname.split("/pkg/")[1]!;
      const bytes = files.get(path);
      return bytes
        ? new Response(bytes.slice().buffer, { status: 200 })
        : new Response("missing", { status: 404 });
    });
    const resource = await loadPopupPackageFromUrl({
      manifestUrl: "https://cdn.example/pkg/popup.manifest.json",
      fetchImpl: fetchImpl as typeof fetch,
      loadTexture: vi.fn(
        async () => ({ width: 1, height: 1, destroy() {} }) as never,
      ),
    });
    expect(fetchImpl).toHaveBeenCalled();
    await resource.destroy();
  });

  it("flattens legacy structured resources and resolves one mapped file closure", async () => {
    const {
      collectMappedPopupAssetKeys,
      createPopupPackageResource,
      flattenPopupPackageFiles,
      resolvePopupPackageFiles,
    } = await import("../../src/popup/package-resource.js");
    const { source, flattened, mapped } = await mappedFixture();
    expect(
      collectMappedPopupAssetKeys(flattened).every((key) => !key.includes("/")),
    ).toBe(true);
    expect(flattenPopupPackageFiles(flattened)).toEqual(flattened);
    const resolved = await resolvePopupPackageFiles({
      manifest: flattened.manifest,
      files: mapped.files,
    });
    expect(resolved.has("assets.map.json")).toBe(false);
    const texture = { width: 1, height: 1, destroy: vi.fn() };
    const resource = await createPopupPackageResource({
      manifest: flattened.manifest,
      files: mapped.files,
      decodeImage: async () => ({ width: 1, height: 1 }),
      loadTexture: vi.fn(async () => texture as never),
    });
    await resource.destroy();

    await expect(
      resolvePopupPackageFiles({
        manifest: flattened.manifest,
        files: flattened.files,
      }),
    ).rejects.toThrow(/assets\.map/);
    await expect(
      resolvePopupPackageFiles({
        manifest: source.manifest,
        files: new Map([
          ...source.files,
          ["assets.map.json", mapped.files.get("assets.map.json")!],
        ]),
      }),
    ).rejects.toThrow(/legacy/);
  });

  it("loads the mapped popup closure from content-addressed CDN URLs", async () => {
    const { loadPopupPackageFromUrl } =
      await import("../../src/popup/package-resource.js");
    const { flattened, mapped } = await mappedFixture();
    const responses = new Map<string, Uint8Array>([
      ["popup.manifest.json", flattened.files.get("popup.manifest.json")!],
      ...mapped.files,
    ]);
    const texture = { width: 1, height: 1, destroy: vi.fn() };
    const remote = await loadPopupPackageFromUrl({
      manifestUrl: "https://cdn.example/pkg/popup.manifest.json",
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname.split("/pkg/")[1]!;
        const body = responses.get(path);
        return body
          ? new Response(body.slice().buffer)
          : new Response("missing", { status: 404 });
      }) as typeof fetch,
      decodeImage: async () => ({ width: 1, height: 1 }),
      loadTexture: vi.fn(async () => texture as never),
    });
    await remote.destroy();

    const firstPayload = Object.values(mapped.map.files)[0]!.path;
    const loadCorrupt = async (payload: Uint8Array) => {
      const corrupt = new Map(responses);
      corrupt.set(firstPayload, payload);
      return loadPopupPackageFromUrl({
        manifestUrl: "https://cdn.example/pkg/popup.manifest.json",
        fetchImpl: (async (input: string | URL | Request) => {
          const path = new URL(String(input)).pathname.split("/pkg/")[1]!;
          const body = corrupt.get(path);
          return body
            ? new Response(body.slice().buffer)
            : new Response("missing", { status: 404 });
        }) as typeof fetch,
      });
    };
    await expect(loadCorrupt(new Uint8Array())).rejects.toThrow(/byteLength/);
    const sameLength = responses.get(firstPayload)!.slice();
    sameLength[0] = (sameLength[0] ?? 0) ^ 0xff;
    await expect(loadCorrupt(sameLength)).rejects.toThrow(/SHA-256/);
  });

  it("rejects missing/orphan/nested-id/URL/status failures and rolls back", async () => {
    const {
      collectPopupPackagePaths,
      createPopupPackageResource,
      loadPopupPackageFromUrl,
    } = await import("../../src/popup/package-resource.js");
    const { manifest, files } = fixture();
    const missing = new Map(files);
    missing.delete(
      [...missing.keys()].find(
        (path) => path.endsWith(".png") && path.startsWith("assets/"),
      )!,
    );
    expect(() =>
      collectPopupPackagePaths({ manifest, files: missing }),
    ).toThrow(/exactly match/);
    const orphan = new Map(files);
    orphan.set("orphan.bin", new Uint8Array([1]));
    expect(() => collectPopupPackagePaths({ manifest, files: orphan })).toThrow(
      /exactly match/,
    );
    const mismatch = new Map(files);
    const nestedPath =
      "dependencies/image-strings/amount/image-string.manifest.json";
    const nested = JSON.parse(
      new TextDecoder().decode(mismatch.get(nestedPath)),
    );
    nested.id = "wrong";
    mismatch.set(nestedPath, new TextEncoder().encode(JSON.stringify(nested)));
    expect(() =>
      collectPopupPackagePaths({ manifest, files: mismatch }),
    ).toThrow(/id mismatch/);
    const badSize = structuredClone(manifest);
    (badSize.resources.image as any).size.width = 2;
    await expect(
      createPopupPackageResource({
        manifest: badSize,
        files,
        loadTexture: async () =>
          ({ width: 1, height: 1, destroy() {} }) as never,
      }),
    ).rejects.toThrow(/size mismatch/);
    await expect(
      loadPopupPackageFromUrl({ manifestUrl: "file:///x" }),
    ).rejects.toThrow(/http/);
    await expect(
      loadPopupPackageFromUrl({
        manifestUrl: "https://cdn.example/pkg/popup.manifest.json",
        fetchImpl: vi.fn(
          async () => new Response("no", { status: 500 }),
        ) as typeof fetch,
      }),
    ).rejects.toThrow(/fetch failed/);

    const excessiveLoop = structuredClone(manifest);
    excessiveLoop.awardCelebration.base.layers.find(
      (layer: any) => layer.kind === "vni",
    ).playback.loopEndTime = 999;
    await expect(
      createPopupPackageResource({
        manifest: excessiveLoop,
        files,
        loadTexture: async () =>
          ({ width: 1, height: 1, destroy() {} }) as never,
      }),
    ).rejects.toThrow(/exceeds project duration/);

    const missingAnimation = structuredClone(manifest);
    missingAnimation.awardCelebration.base.layers.find(
      (layer: any) => layer.kind === "spine",
    ).playback.endAnimation = "Missing";
    await expect(
      createPopupPackageResource({
        manifest: missingAnimation,
        files,
        loadTexture: async () =>
          ({ width: 1, height: 1, destroy() {} }) as never,
      }),
    ).rejects.toThrow(/Missing/);
  });

  it("uses the package root manifest and rejects absent/invalid root input", async () => {
    const { createPopupPackageResource, loadPopupPackageFromUrl } =
      await import("../../src/popup/package-resource.js");
    const { files } = fixture();
    const resource = await createPopupPackageResource({
      files,
      loadTexture: async () => ({ width: 1, height: 1, destroy() {} }) as never,
    });
    await resource.destroy();
    await expect(
      createPopupPackageResource({ files: new Map() }),
    ).rejects.toThrow(/missing popup.manifest.json/);
    await expect(
      createPopupPackageResource({
        files: new Map([
          ["popup.manifest.json", new TextEncoder().encode("{")],
        ]),
      }),
    ).rejects.toThrow(/invalid JSON/);
    await expect(
      createPopupPackageResource({
        files: new Map([["popup.manifest.json", new Uint8Array([0xff, 0xff])]]),
      }),
    ).rejects.toThrow(/invalid UTF-8/);
    vi.stubGlobal("fetch", undefined);
    await expect(
      loadPopupPackageFromUrl({ manifestUrl: "https://cdn.example/pkg/" }),
    ).rejects.toThrow(/fetchImpl is required/);
    vi.unstubAllGlobals();
  });
});

function fixture() {
  const hex = (value: number) => value.toString(16).padStart(64, "0");
  const project = JSON.parse(
    new TextDecoder().decode(bytes("game003-s1/win-amount/bigwin.json")),
  );
  const files = new Map<string, Uint8Array>();
  project.assets.forEach((asset: { path: string }, index: number) => {
    const original = asset.path;
    asset.path = `${hex(index + 10)}.png`;
    files.set(
      `assets/${asset.path}`,
      bytes(`game003-s1/win-amount/${original}`),
    );
  });
  const projectPath = `assets/${hex(1)}.json`;
  files.set(projectPath, new TextEncoder().encode(JSON.stringify(project)));
  const skeletonPath = `assets/${hex(2)}.json`;
  const atlasPath = `assets/${hex(3)}.atlas`;
  const texturePath = `assets/${hex(4)}.png`;
  files.set(skeletonPath, bytes("game003-s1/WL.json"));
  files.set(atlasPath, bytes("game003-s1/Symbol.atlas"));
  files.set(texturePath, bytes("game003-s1/Symbol.png"));
  const imagePath = `assets/${hex(5)}.png`;
  files.set(imagePath, new Uint8Array([1]));
  const webpPath = `assets/${hex(6)}.webp`;
  const jpgPath = `assets/${hex(7)}.jpg`;
  const otherImagePath = `assets/${hex(8)}.json`;
  files.set(webpPath, new Uint8Array([2]));
  files.set(jpgPath, new Uint8Array([3]));
  files.set(otherImagePath, new Uint8Array([4]));
  const chars = [..."$,.0123456789"];
  const glyphs = Object.fromEntries(
    chars.map((character, index) => [
      character,
      {
        path: `assets/g${index}.png`,
        size: { width: 1, height: 1 },
        offset: { x: 0, y: 0 },
      },
    ]),
  );
  const nested = {
    version: 1,
    kind: "image-string",
    id: "amount",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs,
    fixedAdvanceGroups: [],
  };
  const nestedPath =
    "dependencies/image-strings/amount/image-string.manifest.json";
  files.set(nestedPath, new TextEncoder().encode(JSON.stringify(nested)));
  chars.forEach((_, index) =>
    files.set(
      `dependencies/image-strings/amount/assets/g${index}.png`,
      new Uint8Array([index]),
    ),
  );
  const amount = {
    id: "amount",
    kind: "image-string",
    order: 10,
    resource: "amount",
    binding: "win-amount",
    anchor: { x: 0.5, y: 0.5 },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const tier = (
    id: "bigwin" | "superwin" | "megawin",
    thresholdMultiplier: number,
  ) => ({ id, thresholdMultiplier, countDurationSeconds: 1, layers: [amount] });
  const manifest: any = {
    version: 1,
    kind: "popup",
    id: "package-fixture",
    type: "award-celebration",
    designViewport: { width: 100, height: 100 },
    amountFormat: {
      rawScale: 100,
      fractionDigits: 2,
      useGrouping: true,
      groupSeparator: ",",
      decimalSeparator: ".",
      prefix: "$",
      suffix: "",
      rounding: "floor",
    },
    resources: {
      amount: { kind: "image-string", manifest: nestedPath },
      image: { kind: "image", path: imagePath, size: { width: 1, height: 1 } },
      "image-webp": {
        kind: "image",
        path: webpPath,
        size: { width: 1, height: 1 },
      },
      "image-jpg": {
        kind: "image",
        path: jpgPath,
        size: { width: 1, height: 1 },
      },
      "image-other": {
        kind: "image",
        path: otherImagePath,
        size: { width: 1, height: 1 },
      },
      vni: { kind: "vni", project: projectPath },
      spine: {
        kind: "spine",
        skeleton: skeletonPath,
        atlas: atlasPath,
        textures: { "Symbol.png": texturePath },
      },
    },
    awardCelebration: {
      base: {
        countDurationSeconds: 1,
        layers: [
          amount,
          {
            id: "image",
            kind: "image",
            order: 0,
            resource: "image",
            anchor: { x: 0.5, y: 0.5 },
            visibleSegments: ["start"],
            transform: { x: 0, y: 0, scale: 1 },
          },
          {
            id: "vni",
            kind: "vni",
            order: 1,
            resource: "vni",
            transform: { x: 0, y: 0, scale: 1 },
            playback: {
              mode: "segmented",
              loopStartTime: 1,
              loopEndTime: 2.5,
              keepParticlesAlive: true,
            },
          },
          ...[
            ["image-webp", "image-webp"],
            ["image-jpg", "image-jpg"],
            ["image-other", "image-other"],
          ].map(([id, resource], index) => ({
            id,
            kind: "image",
            order: 3 + index,
            resource,
            anchor: { x: 0.5, y: 0.5 },
            visibleSegments: ["loop"],
            transform: { x: 0, y: 0, scale: 1 },
          })),
          {
            id: "spine",
            kind: "spine",
            order: 6,
            resource: "spine",
            transform: { x: 0, y: 0, scale: 1 },
            playback: {
              mode: "segmented-animations",
              startAnimation: "start",
              loopAnimation: "Loop",
              endAnimation: "Win",
            },
          },
        ],
      },
      standard: { countDurationSeconds: 1, layers: [amount] },
      celebrationTiers: [
        tier("bigwin", 15),
        tier("superwin", 30),
        tier("megawin", 50),
      ],
    },
  };
  files.set(
    "popup.manifest.json",
    new TextEncoder().encode(JSON.stringify(manifest)),
  );
  return { manifest, files };
}

let mappedFixturePromise:
  | Promise<{
      source: ReturnType<typeof fixture>;
      flattened: ReturnType<
        typeof import("../../src/popup/package-resource.js").flattenPopupPackageFiles
      >;
      mapped: Awaited<ReturnType<typeof createMappedPackageFiles>>;
    }>
  | undefined;

function mappedFixture() {
  return (mappedFixturePromise ??= (async () => {
    const { flattenPopupPackageFiles } =
      await import("../../src/popup/package-resource.js");
    const source = mappedSourceFixture();
    const flattened = flattenPopupPackageFiles(source);
    const root = flattened.files.get("popup.manifest.json")!;
    const mapped = await createMappedPackageFiles({
      controls: new Map([["popup.manifest.json", root]]),
      assets: new Map(
        [...flattened.files].filter(([path]) => path !== "popup.manifest.json"),
      ),
    });
    return { source, flattened, mapped };
  })());
}

function mappedSourceFixture(): ReturnType<typeof fixture> {
  const source = fixture();
  source.manifest.resources = {
    amount: source.manifest.resources.amount,
    image: source.manifest.resources.image,
  };
  source.manifest.awardCelebration.base.layers =
    source.manifest.awardCelebration.base.layers.filter(
      (layer: { resource: string }) =>
        layer.resource === "amount" || layer.resource === "image",
    );
  source.files.set(
    "popup.manifest.json",
    new TextEncoder().encode(JSON.stringify(source.manifest)),
  );
  return source;
}

function bytes(path: string) {
  return new Uint8Array(
    readFileSync(resolve(process.cwd(), "../../assets", path)),
  );
}
