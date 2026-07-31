import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Assets, Texture } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGame002LoadingResources,
  GAME002_CRAVE_RESOURCE_ID_PREFIX,
  readGame002CravePackageFiles,
} from "../src/loading-resources.js";
import {
  GAME002_REEL_PRESENTATION_EXTENSION,
  prepareGame002SkinConfig,
} from "../src/skin-config.js";

interface AssetsMapFixture {
  readonly files: Readonly<Record<string, Readonly<{ readonly path: string }>>>;
}

interface MutableCraveLayoutManifest {
  gameModes?: {
    modes: Array<{
      symbolPackage?: string;
      awardCelebrationPopup?: string;
    }>;
  };
  reels: {
    main: {
      columns: number;
    };
  };
}

const CRAVE_ROOT = resolve(process.cwd(), "../../assets/crave");
let objectUrlCounter = 0;
let objectUrlBlobs = new Map<string, Blob>();

describe("game002 Crave skin", () => {
  beforeEach(() => {
    objectUrlCounter = 0;
    objectUrlBlobs = new Map();
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (!(blob instanceof Blob)) {
        throw new Error("Crave test object URL requires a Blob.");
      }
      const url = `blob:game002-crave-test/${objectUrlCounter++}`;
      objectUrlBlobs.set(url, blob);
      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      objectUrlBlobs.delete(url);
    });
    vi.spyOn(Assets, "load").mockImplementation((async (input: unknown) => {
      if (
        typeof input !== "string" &&
        (typeof input !== "object" ||
          input === null ||
          !("src" in input) ||
          typeof input.src !== "string")
      ) {
        throw new Error("unexpected Crave test texture input");
      }
      const src =
        typeof input === "string"
          ? input
          : (input as { readonly src: string }).src;
      const blob = objectUrlBlobs.get(src);
      if (!blob) throw new Error(`unknown test object URL "${src}"`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const size = readImageBytesSize(bytes);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      return Texture.from(canvas) as never;
    }) as never);
    vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads only the exact mapped physical package for skin=2", async () => {
    const resources = createGame002LoadingResources("2");
    const packageResources = resources.filter((resource) =>
      resource.id.startsWith(GAME002_CRAVE_RESOURCE_ID_PREFIX),
    );
    expect(packageResources.length).toBeGreaterThan(120);
    expect(
      packageResources.every((resource) => resource.kind === "binary"),
    ).toBe(true);
    const extensions = resources.filter(
      (resource) =>
        !resource.id.startsWith(GAME002_CRAVE_RESOURCE_ID_PREFIX) &&
        resource.id !== "game002-runtime-module",
    );
    expect(extensions.map((resource) => resource.id).sort()).toEqual([
      "game002-reel-effect-spine-skeletons:Nearwin1.json",
      "game002-reel-effect-spine-skeletons:Nearwin2.json",
      "game002-symbol-spine-atlas",
      "game002-symbol-spine-texture",
    ]);

    const loaded = new Map<string, unknown>(
      await Promise.all(
        packageResources.map(async (resource) => {
          const bytes = await readFile(resourceUrlToCravePath(resource.url!));
          return [
            resource.id,
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
          ] as const;
        }),
      ),
    );
    expect(readGame002CravePackageFiles(loaded).size).toBe(
      packageResources.length,
    );
    loaded.delete(`${GAME002_CRAVE_RESOURCE_ID_PREFIX}assets.map.json`);
    expect(() => readGame002CravePackageFiles(loaded)).toThrow(
      /assets\.map\.json.*was not loaded/,
    );
  });

  it("prepares skin=2 geometry, CM multiplier states and CN coin states", async () => {
    const files = await readCravePackageFiles();
    const prepared = await prepareGame002SkinConfig("2", {
      craveFiles: files,
      decodeImage: readPngSize,
    });
    try {
      const { skin } = prepared;
      expect(skin.id).toBe("2");
      expect(skin.label).toBe("crave");
      expect(skin.gridLayout).toEqual({
        boardFrame: { x: 640, y: 337, width: 720, height: 1080 },
        cellWidth: 120,
        cellHeight: 120,
        columnGap: 0,
        rowGap: 0,
      });
      expect(skin.focusRegion).toEqual({
        x: 580,
        y: 277,
        width: 840,
        height: 1200,
      });
      expect(skin.presentation.kind).toBe("scene-layout");
      if (skin.presentation.kind !== "scene-layout") {
        throw new Error("expected scene-layout presentation");
      }
      expect(skin.presentation.initialMode).toBe("BaseGame");
      expect(skin.presentation.awardCelebrationPopup).toBe("bigwin2");
      expect(skin.reelsName).toBe("reels-001");
      expect(
        skin.presentation.symbolRegistry.getEntryBySymbol("CN"),
      ).toMatchObject({ symbol: "CN", kind: "textured" });

      const cn = skin.symbolValuePresentationResources.CN;
      expect(cn?.text.type).toBe("image-string");
      expect(
        cn?.imageStringTierBindings?.map((binding) => binding.slot),
      ).toEqual(["coin", "coin", "coin", "coin"]);
      expect(cn?.textImageUrls).toEqual({});
      expect(cn?.tiers.map((tier) => tier.maxExclusive)).toEqual([
        10,
        100,
        1000,
        undefined,
      ]);
      expect(
        Object.keys(
          cn?.imageStringTierBindings?.[0]?.resource.manifest.glyphs ?? {},
        ),
      ).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

      expect(skin.reelManifest).toEqual(
        GAME002_REEL_PRESENTATION_EXTENSION.reelManifest,
      );
      expect(skin.displaySymbols).toContain("WM");
      expect(skin.displaySymbols).toContain("WL");
      expect(skin.displaySymbols).toContain("CM");
      expect(skin.symbolAnimationCapabilities.CM).toEqual(
        expect.arrayContaining(["appear", "feature1", "change"]),
      );
      expect(skin.symbolAnimationCapabilities.CN).toContain("featureChange");
      expect(skin.symbolAnimationCapabilities.AF).toEqual(
        expect.arrayContaining(["feature", "change"]),
      );
      const symbolManifest =
        skin.presentation.symbolPackage.symbolManifest.symbols;
      expect(symbolManifest.AF?.animations.feature).toMatchObject({
        kind: "spine",
        playback: {
          animationName: "Feature",
          loop: false,
        },
      });
      expect(symbolManifest.AF?.animations.change).toMatchObject({
        kind: "spine",
        playback: {
          animationName: "Change",
          loop: false,
        },
      });
      expect(symbolManifest.AF?.imageStringNodes).toMatchObject([
        {
          name: "free-spins",
          initialText: "0",
          targets: [
            { state: "normal", slot: "Mult" },
            { state: "appear", slot: "Mult" },
            { state: "feature", slot: "Mult" },
            { state: "change", slot: "Mult" },
          ],
        },
      ]);
      expect(symbolManifest.CM?.animations.feature1).toMatchObject({
        kind: "spine",
        playback: {
          animationName: "Feature1",
          loop: false,
        },
      });
      expect(symbolManifest.CM?.animations.change).toMatchObject({
        kind: "spine",
        playback: {
          animationName: "Change",
          loop: false,
        },
      });
      expect(symbolManifest.CN?.animations.featureChange).toMatchObject({
        kind: "activeSpine",
        playback: {
          animationName: "Feature_Change",
          loop: false,
        },
      });
      expect(symbolManifest.CM?.imageStringNodes).toMatchObject([
        {
          name: "multiplier",
          targets: [
            { state: "normal", slot: "Mult" },
            { state: "dropdown", slot: "Mult" },
            { state: "appear", slot: "Mult" },
            { state: "feature1", slot: "Mult" },
            { state: "change", slot: "Mult" },
          ],
        },
      ]);
    } finally {
      await prepared.resourceOwner.destroy();
    }
  });

  it("rejects incomplete game002-specific Crave bindings", async () => {
    await expect(prepareGame002SkinConfig("2")).rejects.toThrow(
      /requires loaded Crave package files/,
    );
    await expectInvalidCraveManifest((manifest) => {
      delete manifest.gameModes;
    }, /requires gameModes/);
    await expectInvalidCraveManifest((manifest) => {
      delete manifest.gameModes!.modes[0].symbolPackage;
    }, /must declare a symbol package/);
    await expectInvalidCraveManifest((manifest) => {
      delete manifest.gameModes!.modes[0].awardCelebrationPopup;
    }, /must declare an award celebration popup/);
    await expectInvalidCraveManifest((manifest) => {
      manifest.reels.main.columns = 5;
    }, /reel count 6 does not match layout columns 5/);
  });

  it("uses the shared browser image decoder when no decoder is injected", async () => {
    vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
      const size = readImageBytesSize(new Uint8Array(await blob.arrayBuffer()));
      return {
        ...size,
        close: vi.fn(),
      };
    });
    const prepared = await prepareGame002SkinConfig("2", {
      craveFiles: await readCravePackageFiles(),
    });
    expect(prepared.skin.id).toBe("2");
    await prepared.resourceOwner.destroy();
  });
});

async function expectInvalidCraveManifest(
  mutate: (manifest: MutableCraveLayoutManifest) => void,
  expected: RegExp,
): Promise<void> {
  const files = new Map(await readCravePackageFiles());
  const manifest = JSON.parse(
    new TextDecoder().decode(files.get("layout.manifest.json")),
  ) as MutableCraveLayoutManifest;
  mutate(manifest);
  files.set(
    "layout.manifest.json",
    new TextEncoder().encode(JSON.stringify(manifest)),
  );
  await expect(
    prepareGame002SkinConfig("2", {
      craveFiles: files,
      decodeImage: readPngSize,
    }),
  ).rejects.toThrow(expected);
}

async function readCravePackageFiles(): Promise<
  ReadonlyMap<string, Uint8Array>
> {
  const mapBytes = await readFile(join(CRAVE_ROOT, "assets.map.json"));
  const map = JSON.parse(mapBytes.toString("utf8")) as AssetsMapFixture;
  const paths = [
    "layout.manifest.json",
    "assets.map.json",
    ...new Set(Object.values(map.files).map((asset) => asset.path)),
  ];
  return new Map(
    await Promise.all(
      paths.map(
        async (path) =>
          [
            path,
            new Uint8Array(await readFile(join(CRAVE_ROOT, path))),
          ] as const,
      ),
    ),
  );
}

async function readPngSize(
  blob: Blob,
  path: string,
): Promise<{ readonly width: number; readonly height: number }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    return readImageBytesSize(bytes);
  } catch {
    throw new Error(`expected supported image glyph "${path}"`);
  }
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function readPngBytesSize(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function readImageBytesSize(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} {
  if (isPng(bytes)) return readPngBytesSize(bytes);
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  )
    throw new Error("unsupported image payload");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = String.fromCharCode(...bytes.slice(12, 16));
  if (kind === "VP8X")
    return {
      width: 1 + readUint24(bytes, 24),
      height: 1 + readUint24(bytes, 27),
    };
  if (kind === "VP8 ")
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  if (kind === "VP8L") {
    const bits = view.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  throw new Error(`unsupported WebP chunk ${kind}`);
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

function resourceUrlToCravePath(url: string): string {
  const fileName = url.split("/").at(-1)?.split("?")[0];
  if (!fileName) throw new Error(`invalid generated Crave URL "${url}"`);
  if (url.includes("layout.manifest")) {
    return join(CRAVE_ROOT, "layout.manifest.json");
  }
  if (url.includes("assets.map")) {
    return join(CRAVE_ROOT, "assets.map.json");
  }
  return join(CRAVE_ROOT, "assets", fileName);
}
