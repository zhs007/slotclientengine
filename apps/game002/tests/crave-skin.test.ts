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
  getGame002SkinConfig,
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
      const size = isPng(bytes)
        ? readPngBytesSize(bytes)
        : { width: 1, height: 1 };
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
    expect(packageResources).toHaveLength(121);
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
    expect(readGame002CravePackageFiles(loaded).size).toBe(121);
    loaded.delete(`${GAME002_CRAVE_RESOURCE_ID_PREFIX}assets.map.json`);
    expect(() => readGame002CravePackageFiles(loaded)).toThrow(
      /assets\.map\.json.*was not loaded/,
    );
  });

  it("prepares manifest-owned geometry, symbol registry and CN coin ImgNumber", async () => {
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

      const skin1 = getGame002SkinConfig("1");
      expect(skin.reelManifest).toEqual(skin1.reelManifest);
      expect(skin.cascadeWinPresentations).toEqual(
        skin1.cascadeWinPresentations,
      );
      expect(skin.landingAppearSymbols).toEqual(skin1.landingAppearSymbols);
      expect(skin.rawGameConfig).toEqual(skin1.rawGameConfig);
    } finally {
      await prepared.valuePresentationResourceBundle.destroy();
    }
  });

  it("rejects incomplete game002-specific Crave bindings", async () => {
    await expect(prepareGame002SkinConfig("2")).rejects.toThrow(
      /requires loaded Crave package files/,
    );
    expect(() => getGame002SkinConfig("2")).toThrow(
      /prepared from its loaded scene-layout package/,
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
      const size = readPngBytesSize(new Uint8Array(await blob.arrayBuffer()));
      return {
        ...size,
        close: vi.fn(),
      };
    });
    const prepared = await prepareGame002SkinConfig("2", {
      craveFiles: await readCravePackageFiles(),
    });
    expect(prepared.skin.id).toBe("2");
    await prepared.valuePresentationResourceBundle.destroy();
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
  if (!isPng(bytes)) {
    throw new Error(`expected PNG glyph "${path}"`);
  }
  return readPngBytesSize(bytes);
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
