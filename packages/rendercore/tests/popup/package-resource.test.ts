import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMappedPackageFiles } from "../editor-assets-map-fixture.js";
import {
  getMinecart2SymbolResourcePath,
  readMinecart2LogicalBytes,
  readMinecart2LogicalJson,
  readMinecart2SymbolBytes,
} from "../../../../test-utils/minecart2-fixtures.js";

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

  it("prepares and flattens a standalone Spine popup closure", async () => {
    const {
      collectPopupPackagePaths,
      createPopupPackageResource,
      flattenPopupPackageFiles,
    } = await import("../../src/popup/package-resource.js");
    const award = fixture();
    const spineSpec = award.manifest.resources.spine;
    const promptPath = `assets/${"d".repeat(64)}.woff2`;
    const manifest = {
      version: 1,
      kind: "popup",
      id: "free-game",
      type: "spine",
      designViewport: { width: 100, height: 100 },
      resources: {
        spine: spineSpec,
        prompt: { kind: "font", path: promptPath },
      },
      spine: {
        resource: "spine",
        transform: { x: 0, y: 0, scale: 1 },
        playback: {
          mode: "segmented-animations",
          startAnimation: "start",
          loopAnimation: "Loop",
          endAnimation: "Win",
        },
        prompt: {
          font: "prompt",
          defaultText: "Continue",
          fill: "#ffffff",
          order: 1,
          area: { x: 0, y: 20, width: 80, height: 10 },
        },
      },
    } as const;
    if (spineSpec.kind !== "spine") throw new Error("Expected spine fixture.");
    const files = new Map<string, Uint8Array>([
      [
        "popup.manifest.json",
        new TextEncoder().encode(JSON.stringify(manifest)),
      ],
      ...[
        spineSpec.skeleton,
        spineSpec.atlas,
        ...Object.values(spineSpec.textures),
      ].map((path) => [path, award.files.get(path)!] as const),
      [promptPath, new Uint8Array([0x77, 0x4f, 0x46, 0x32])],
    ]);
    expect(collectPopupPackagePaths({ manifest, files })).toHaveLength(4);
    const flattened = flattenPopupPackageFiles({ manifest, files });
    expect(flattened.manifest.type).toBe("spine");
    const flattenedSpine = Object.values(flattened.manifest.resources).find(
      (resource) => resource.kind === "spine",
    );
    if (!flattenedSpine || flattenedSpine.kind !== "spine")
      throw new Error("Expected flattened Spine resource.");
    expect(flattened.files.get(flattenedSpine.atlas)).toEqual(
      files.get(spineSpec.atlas),
    );
    const resource = await createPopupPackageResource({
      manifest,
      files,
      loadFont: vi.fn(async () => vi.fn()),
    });
    expect(resource.resources.spine.kind).toBe("spine");
    expect(resource.resources.prompt.kind).toBe("font");
    await resource.destroy();

    const systemManifest = structuredClone(manifest) as any;
    delete systemManifest.spine.prompt.font;
    delete systemManifest.resources.prompt;
    const systemFiles = new Map(files);
    systemFiles.delete(promptPath);
    systemFiles.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(systemManifest)),
    );
    expect(
      collectPopupPackagePaths({
        manifest: systemManifest,
        files: systemFiles,
      }),
    ).toHaveLength(3);
    const flattenedSystem = flattenPopupPackageFiles({
      manifest: systemManifest,
      files: systemFiles,
    });
    expect(flattenedSystem.manifest.type).toBe("spine");
    if (flattenedSystem.manifest.type !== "spine")
      throw new Error("Expected Spine popup.");
    expect(flattenedSystem.manifest.spine.prompt).not.toHaveProperty("font");
    const systemResource = await createPopupPackageResource({
      manifest: systemManifest,
      files: systemFiles,
    });
    expect(systemResource.resources).not.toHaveProperty("prompt");
    await systemResource.destroy();
  });

  it("namespaces physical Spine keys without changing logical atlas pages", async () => {
    const {
      createPopupPackageResourceFromResolvedFiles,
      namespaceMappedPopupPackageFiles,
      rewritePopupManifestFilenameKeys,
    } = await import("../../src/popup/package-resource.js");
    const source = multiPageSpinePopupFixture();
    const namespaced = namespaceMappedPopupPackageFiles({
      ...source,
      keyPrefix: "pkg-2-fg",
    });
    const spine = namespaced.manifest.resources["pkg-2-fg-FG.json"];
    expect(spine).toMatchObject({
      kind: "spine",
      skeleton: "pkg-2-fg-FG.json",
      atlas: "pkg-2-fg-BG.atlas",
      textures: {
        "BG.png": "pkg-2-fg-BG.png",
        "BG_2.png": "pkg-2-fg-BG_2.png",
      },
    });
    const atlasText = new TextDecoder().decode(
      namespaced.files.get("pkg-2-fg-BG.atlas"),
    );
    expect(readAtlasPageNames(atlasText)).toEqual(["BG.png", "BG_2.png"]);

    const lowercase = rewritePopupManifestFilenameKeys({
      manifest: namespaced.manifest,
      rewrite: (key) => key.toLowerCase(),
    });
    expect(lowercase.resources["pkg-2-fg-fg.json"]).toMatchObject({
      kind: "spine",
      skeleton: "pkg-2-fg-fg.json",
      atlas: "pkg-2-fg-bg.atlas",
      textures: {
        "BG.png": "pkg-2-fg-bg.png",
        "BG_2.png": "pkg-2-fg-bg_2.png",
      },
    });
    if (lowercase.type !== "spine")
      throw new Error("Expected rewritten Spine popup.");
    expect(lowercase.spine.resource).toBe("pkg-2-fg-fg.json");

    const files = popupFilesWithCanonicalRoot(namespaced);
    const resource = await createPopupPackageResourceFromResolvedFiles({
      manifest: namespaced.manifest,
      files,
    });
    await resource.destroy();

    const invalidFiles = new Map(files);
    invalidFiles.set(
      "pkg-2-fg-BG.atlas",
      new TextEncoder().encode(
        atlasText.replace(/^BG\.png$/mu, "pkg-2-fg-BG.png"),
      ),
    );
    await expect(
      createPopupPackageResourceFromResolvedFiles({
        manifest: namespaced.manifest,
        files: invalidFiles,
      }),
    ).rejects.toThrow(/pages must exactly match texture pages/);
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

  it("requires an exact text layer for an attached ImgNumber", async () => {
    const { createPopupPackageResource } =
      await import("../../src/popup/package-resource.js");
    const { manifest, files } = fixture();
    const projectPath = (manifest.resources.vni as { project: string }).project;
    const project = JSON.parse(
      new TextDecoder().decode(files.get(projectPath)),
    );
    project.layers.push({
      ...project.layers[0],
      id: "amount-text",
      name: "Amount text",
      type: "text",
      assetId: null,
      text: "Amount",
    });
    files.set(projectPath, new TextEncoder().encode(JSON.stringify(project)));
    manifest.awardCelebration.base.layers =
      manifest.awardCelebration.base.layers.map((layer: any) =>
        layer.kind === "image-string"
          ? {
              ...layer,
              parent: {
                kind: "vni-text-layer",
                vniLayerId: "vni",
                textLayerId: "amount-text",
              },
            }
          : layer,
      );
    const resource = await createPopupPackageResource({
      manifest,
      files,
      loadTexture: async () => ({ width: 1, height: 1, destroy() {} }) as never,
    });
    await resource.destroy();
    (
      manifest.awardCelebration.base.layers.find(
        (layer: any) => layer.kind === "image-string",
      ) as any
    ).parent.textLayerId = "missing";
    await expect(
      createPopupPackageResource({
        manifest,
        files,
        loadTexture: async () =>
          ({ width: 1, height: 1, destroy() {} }) as never,
      }),
    ).rejects.toThrow(/missing VNI text layer/);
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

    const imagePayload = Object.entries(mapped.map.files).find(([key]) =>
      key.endsWith(".png"),
    )![1].path;
    const changed = new Map(responses);
    changed.set(imagePayload, new Uint8Array([9]));
    const changedResource = await loadPopupPackageFromUrl({
      manifestUrl: "https://cdn.example/pkg/popup.manifest.json",
      fetchImpl: (async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname.split("/pkg/")[1]!;
        const body = changed.get(path);
        return body
          ? new Response(body.slice().buffer)
          : new Response("missing", { status: 404 });
      }) as typeof fetch,
      decodeImage: async () => ({ width: 1, height: 1 }),
      loadTexture: vi.fn(async () => texture as never),
    });
    await changedResource.destroy();
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

    const once = structuredClone(manifest);
    once.awardCelebration.base.layers.find(
      (layer: any) => layer.kind === "vni",
    ).playback = { mode: "once" };
    const onceResource = await createPopupPackageResource({
      manifest: once,
      files,
      loadTexture: async () => ({ width: 1, height: 1, destroy() {} }) as never,
    });
    await onceResource.destroy();

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
  const project = structuredClone(
    readMinecart2LogicalJson("big_win0721.json"),
  ) as { assets: Array<{ path: string }> };
  const files = new Map<string, Uint8Array>();
  project.assets.forEach((asset: { path: string }, index: number) => {
    const original = asset.path;
    asset.path = `${hex(index + 10)}.png`;
    files.set(`assets/${asset.path}`, readMinecart2LogicalBytes(original));
  });
  const projectPath = `assets/${hex(1)}.json`;
  files.set(projectPath, new TextEncoder().encode(JSON.stringify(project)));
  const skeletonPath = `assets/${hex(2)}.json`;
  const atlasPath = `assets/${hex(3)}.atlas`;
  const texturePath = `assets/${hex(4)}.png`;
  const texturePage = getMinecart2SymbolResourcePath("WL", "texture");
  files.set(skeletonPath, readMinecart2SymbolBytes("WL", "skeleton"));
  files.set(atlasPath, readMinecart2SymbolBytes("WL", "atlas"));
  files.set(texturePath, readMinecart2SymbolBytes("WL", "texture"));
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
    parent: { kind: "popup-root" },
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
        textures: { [texturePage]: texturePath },
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

function multiPageSpinePopupFixture() {
  const sourcePage = getMinecart2SymbolResourcePath("WL", "texture");
  const logicalPages = ["BG.png", "BG_2.png"];
  const skeleton = "FG.json";
  const atlas = "BG.atlas";
  const textures = Object.fromEntries(logicalPages.map((page) => [page, page]));
  const atlasText = new TextDecoder()
    .decode(readMinecart2SymbolBytes("WL", "atlas"))
    .replace(sourcePage, logicalPages[0]!);
  const manifest = {
    version: 1,
    kind: "popup",
    id: "fg",
    type: "spine",
    designViewport: { width: 100, height: 100 },
    resources: {
      [skeleton]: {
        kind: "spine",
        skeleton,
        atlas,
        textures,
      },
    },
    spine: {
      resource: skeleton,
      transform: { x: 0, y: 0, scale: 1 },
      playback: {
        mode: "segmented-animations",
        startAnimation: "start",
        loopAnimation: "Loop",
        endAnimation: "Win",
      },
    },
  } as const;
  const files = new Map<string, Uint8Array>([
    ["popup.manifest.json", new TextEncoder().encode(JSON.stringify(manifest))],
    [skeleton, readMinecart2SymbolBytes("WL", "skeleton")],
    [
      atlas,
      new TextEncoder().encode(
        `${atlasText.replace(/\n+$/u, "")}\n\n${logicalPages[1]}\nsize: 1,1\nfilter: Linear,Linear\n`,
      ),
    ],
    [textures[logicalPages[0]!]!, readMinecart2SymbolBytes("WL", "texture")],
    [textures[logicalPages[1]!]!, new Uint8Array([1])],
  ]);
  return { manifest, files };
}

function popupFilesWithCanonicalRoot(options: {
  readonly rootKey: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): ReadonlyMap<string, Uint8Array> {
  const files = new Map(options.files);
  files.set("popup.manifest.json", files.get(options.rootKey)!);
  files.delete(options.rootKey);
  return files;
}

function readAtlasPageNames(atlasText: string): readonly string[] {
  const lines = atlasText.replace(/\r\n?/gu, "\n").split("\n");
  return lines.filter((line, index) => {
    if (!line || /^\s/u.test(line) || line.includes(":")) return false;
    return lines
      .slice(index + 1)
      .find((candidate) => candidate.length > 0)
      ?.startsWith("size:");
  });
}
