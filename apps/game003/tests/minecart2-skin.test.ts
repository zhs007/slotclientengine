import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Assets, Texture, TextureSource } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { createGame003SceneLayoutPresentation } from "../src/scene-layout-presentation.js";
import { prepareGame003SkinConfig } from "../src/skin-config.js";

const PACKAGE_ROOT = resolve(process.cwd(), "../../assets/minecart2");

describe("game003 minecart2 skin", () => {
  it("prepares the exact package without legacy presentation capabilities", async () => {
    const blobs = new Map<string, Blob>();
    let blobId = 0;
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        if (!(blob instanceof Blob)) {
          throw new Error("minecart2 test expected a Blob object URL.");
        }
        const url = `blob:minecart2-test:${blobId++}`;
        blobs.set(url, blob);
        return url;
      });
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation((url) => {
        blobs.delete(url);
      });
    const load = vi.spyOn(Assets, "load").mockImplementation(async (input) => {
      const rawInput: unknown = input;
      const url =
        typeof rawInput === "string"
          ? rawInput
          : rawInput !== null &&
              typeof rawInput === "object" &&
              "src" in rawInput &&
              typeof rawInput.src === "string"
            ? rawInput.src
            : null;
      if (!url) {
        throw new Error("minecart2 test expected a string asset URL.");
      }
      const blob = blobs.get(url);
      if (!blob) throw new Error(`minecart2 test has no blob for ${url}.`);
      const size = readWebpSize(new Uint8Array(await blob.arrayBuffer()));
      return new Texture({
        source: new TextureSource({
          resource: size as never,
          width: size.width,
          height: size.height,
        }),
      }) as never;
    });
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const result = await prepareGame003SkinConfig("2", {
      minecart2Files: readPackageFiles(),
      decodeImage: async (blob) =>
        readWebpSize(new Uint8Array(await blob.arrayBuffer())),
    });
    let presentation:
      | Awaited<ReturnType<typeof createGame003SceneLayoutPresentation>>
      | undefined;
    try {
      if (result.skin.id !== "2") {
        throw new Error("minecart2 prepare returned the wrong skin.");
      }
      const skin = result.skin;
      expect(skin).toMatchObject({
        id: "2",
        label: "minecart2",
        reelsName: "bg-reel01",
        initialMode: "BaseGame",
        awardCelebrationPopup: "award-celebration",
        presentation: { kind: "scene-layout" },
      });
      expect(skin.resource.manifest.reels.main).toMatchObject({
        columns: 5,
        rows: 5,
        cellSize: { width: 172, height: 130 },
        gap: { x: 6, y: 0 },
      });
      expect(skin).not.toHaveProperty("bgBar");
      expect(skin).not.toHaveProperty("minecartInteraction");
      expect(
        skin.resource.popupPackages["award-celebration"].manifest,
      ).toMatchObject({
        amountFormat: { rawScale: 1, fractionDigits: 0 },
      });
      presentation = await createGame003SceneLayoutPresentation(skin);
      presentation.applyViewport({ width: 1174, height: 2000 });
      const initialScene = presentation.reelRuntime.getCurrentScene();
      expect(initialScene).toHaveLength(5);
      expect(presentation.reelRuntime.getVisualSnapshot()).toMatchObject({
        visible: true,
        spinning: false,
        reelCount: 5,
      });
      expect(
        presentation.reelRuntime.getVisibleSymbolGeometrySnapshots([
          { x: 0, y: 0 },
        ]),
      ).toMatchObject([{ x: 0, y: 0 }]);
      expect(presentation.winAmountPlayer.update(0)).toMatchObject({
        completed: false,
        phase: "idle",
        displayedAmountRaw: 0,
      });
    } finally {
      presentation?.destroy();
      await result.resourceOwner.destroy();
      load.mockRestore();
      unload.mockRestore();
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
    }
  });
});

function readPackageFiles(): ReadonlyMap<string, Uint8Array> {
  return new Map(
    readdirSync(PACKAGE_ROOT, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const absolutePath = join(entry.parentPath, entry.name);
        const path = relative(PACKAGE_ROOT, absolutePath).replaceAll("\\", "/");
        return [path, new Uint8Array(readFileSync(absolutePath))] as const;
      }),
  );
}

function readWebpSize(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") {
    throw new Error("minecart2 test decoder expected WebP.");
  }
  const chunk = ascii(12, 4);
  if (chunk === "VP8X") {
    return {
      width: 1 + readUint24Le(bytes, 24),
      height: 1 + readUint24Le(bytes, 27),
    };
  }
  if (chunk === "VP8L") {
    const bits =
      (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>>
      0;
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8 ") {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  throw new Error(`minecart2 test decoder cannot read ${chunk}.`);
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
