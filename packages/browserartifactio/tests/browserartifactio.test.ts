import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ObjectUrlRegistry,
  assertNoPackagePathAliases,
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
  canonicalizeManifestPackagePath,
  createDeterministicZip,
  extractBoundedZip,
  resolvePackagePath,
  allocateContentAddressedPath,
  createBoundedSourceIndex,
  resolveSourcePath,
  sha256Hex,
  suggestLogicalResourceId,
  createEditorAssetBlob,
  detectRasterAssetType,
  loadBoundedSourceFiles,
  putEditorAssetBlob,
  assertLogicalResourceId,
  ephemeralContentFingerprint,
} from "../src/index.js";

const limits = {
  maxEntries: 3,
  maxCompressedBytes: 1024,
  maxFileBytes: 16,
  maxTotalBytes: 24,
};

afterEach(() => vi.restoreAllMocks());

describe("package paths", () => {
  it("keeps legal case and canonicalizes one manifest ./ prefix", () => {
    expect(assertCanonicalPackagePath("assets/Symbol.png")).toBe(
      "assets/Symbol.png",
    );
    expect(canonicalizeManifestPackagePath("./WL.png")).toBe("WL.png");
    expect(resolvePackagePath("nested/project.json", "../shared/a.png")).toBe(
      "shared/a.png",
    );
  });

  it.each([
    "/a",
    "C:/a",
    "a\\b",
    "a//b",
    "a/../b",
    "https://x",
    "a?x",
    "a%2fb",
  ])("rejects unsafe path %s", (path) =>
    expect(() => assertCanonicalPackagePath(path)).toThrow(),
  );

  it("rejects case-fold collisions", () => {
    expect(() => assertNoPackagePathCollisions(["A.png", "a.png"])).toThrow(
      /case-fold/,
    );
  });

  it("allows exact content-path reuse but rejects canonical aliases", () => {
    expect(() =>
      assertNoPackagePathAliases(["assets/a.png", "assets/a.png"]),
    ).not.toThrow();
    expect(() =>
      assertNoPackagePathAliases(["assets/A.png", "assets/a.png"]),
    ).toThrow(/alias/);
  });

  it("enforces NFC, lowercase policies and package-root resolution", () => {
    expect(() => assertCanonicalPackagePath("e\u0301.png")).toThrow(/NFC/);
    expect(() =>
      assertCanonicalPackagePath("Upper.png", { requireLowercase: true }),
    ).toThrow(/小写/);
    expect(() => resolvePackagePath("project.json", "../escape.png")).toThrow(
      /逃出 package 根目录/,
    );
  });
});

describe("bounded zip", () => {
  it("extracts files and enforces limits", () => {
    const bytes = zipSync({ "a.txt": strToU8("a") });
    expect(
      new TextDecoder().decode(
        extractBoundedZip(bytes, { limits }).get("a.txt"),
      ),
    ).toBe("a");
    expect(() => extractBoundedZip(new Uint8Array(1025), { limits })).toThrow(
      /压缩文件/,
    );
    expect(() =>
      extractBoundedZip(zipSync({ "a.bin": new Uint8Array(17) }), { limits }),
    ).toThrow(/单文件/);
    expect(() =>
      extractBoundedZip(
        zipSync({ "a.bin": new Uint8Array(13), "b.bin": new Uint8Array(13) }),
        { limits },
      ),
    ).toThrow(/总解压尺寸/);
    expect(() =>
      extractBoundedZip(
        zipSync({
          "a.txt": strToU8("a"),
          "b.txt": strToU8("b"),
          "c.txt": strToU8("c"),
          "d.txt": strToU8("d"),
        }),
        { limits },
      ),
    ).toThrow(/entry 数/);
    expect(() =>
      extractBoundedZip(zipSync({ "dir/": new Uint8Array() }), { limits }),
    ).not.toThrow();
  });

  it("creates byte-stable archives", () => {
    const entries = new Map([
      ["b.txt", strToU8("b")],
      ["a.txt", strToU8("a")],
    ]);
    expect(createDeterministicZip(entries)).toEqual(
      createDeterministicZip(entries),
    );
  });
});

describe("ObjectUrlRegistry", () => {
  it("revokes once and destroy is idempotent", () => {
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:a");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const registry = new ObjectUrlRegistry();
    expect(registry.create(new Blob())).toBe("blob:a");
    registry.destroy();
    registry.destroy();
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    expect(() => registry.create(new Blob())).toThrow(/已销毁/);
  });

  it("can revoke an owned URL before final cleanup", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:b");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const registry = new ObjectUrlRegistry();
    const url = registry.create(new Blob());
    expect(registry.size).toBe(1);
    registry.revoke(url);
    registry.revoke(url);
    expect(registry.size).toBe(0);
    registry.destroy();
    expect(revoke).toHaveBeenCalledOnce();
  });
});

describe("resource identity", () => {
  it("suggests stable ASCII logical ids", () => {
    expect(suggestLogicalResourceId("BG_2.PNG")).toBe("bg-2");
    expect(suggestLogicalResourceId("Mini.BK.PNG")).toBe("mini-bk");
    expect(suggestLogicalResourceId("中奖.png")).toBeNull();
    expect(suggestLogicalResourceId("A中奖.png")).toBeNull();
    expect(suggestLogicalResourceId(" free  game.webp ")).toBe("free-game");
    expect(suggestLogicalResourceId("folder/A___B--C.json")).toBe("a-b-c");
    expect(suggestLogicalResourceId("---.png")).toBeNull();
    expect(suggestLogicalResourceId("")).toBeNull();
    expect(suggestLogicalResourceId(null as unknown as string)).toBeNull();
    expect(assertLogicalResourceId("valid-id-2")).toBe("valid-id-2");
    expect(() => assertLogicalResourceId("Bad_ID")).toThrow(/无效/);
  });

  it("detects raster bytes and deduplicates immutable content blobs", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(detectRasterAssetType(png)).toEqual({
      extension: "png",
      mediaType: "image/png",
    });
    const blob = await createEditorAssetBlob({
      bytes: png,
      extension: "png",
      mediaType: "image/png",
    });
    const store = new Map();
    const path = putEditorAssetBlob(store, blob);
    expect(path).toMatch(/^assets\/[a-f0-9]{64}\.png$/u);
    putEditorAssetBlob(store, blob);
    expect(store.size).toBe(1);
    png[0] = 0;
    expect(store.values().next().value?.bytes[0]).toBe(137);
    expect(
      detectRasterAssetType(
        new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
      ),
    ).toEqual({ extension: "webp", mediaType: "image/webp" });
    expect(detectRasterAssetType(new Uint8Array([255, 216, 255]))).toEqual({
      extension: "jpg",
      mediaType: "image/jpeg",
    });
    expect(() => detectRasterAssetType(new Uint8Array([1, 2, 3]))).toThrow(
      /不是受支持/,
    );
    expect(() => detectRasterAssetType([] as unknown as Uint8Array)).toThrow(
      /Uint8Array/,
    );
    expect(ephemeralContentFingerprint(new Uint8Array([1, 2]))).toMatch(
      /^2:[a-f0-9]{8}$/u,
    );
    const collision = { ...blob, bytes: new Uint8Array([1]) };
    expect(() => putEditorAssetBlob(store, collision)).toThrow(/collision/);
  });

  it("uses complete SHA-256 content paths", async () => {
    const digest = await sha256Hex(new TextEncoder().encode("abc"));
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(allocateContentAddressedPath({ digest, extension: ".PNG" })).toBe(
      `assets/${digest}.png`,
    );
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex(new Uint8Array([0, 255]))).toBe(
      "06eb7d6a69ee19e5fbdf749018d3d2abfa04bcbd1365db312eb86dc7169389b8",
    );
    await expect(sha256Hex([] as unknown as Uint8Array)).rejects.toThrow(
      /Uint8Array/,
    );
    expect(() =>
      allocateContentAddressedPath({ digest: "abc", extension: "png" }),
    ).toThrow(/64/);
    expect(() =>
      allocateContentAddressedPath({ digest, extension: "../png" }),
    ).toThrow(/extension/);
  });

  it("bounds and resolves source files by exact then unique case-fold", () => {
    const file = (name: string) => ({
      name,
      size: 1,
      async arrayBuffer() {
        return new Uint8Array([1]).buffer;
      },
    });
    const index = createBoundedSourceIndex([file("Art.PNG")], {
      maxEntries: 2,
      maxFileBytes: 2,
      maxTotalBytes: 2,
    });
    expect(resolveSourcePath(index, "Art.PNG").path).toBe("Art.PNG");
    expect(resolveSourcePath(index, "art.png").path).toBe("Art.PNG");
    expect(() =>
      createBoundedSourceIndex([file("A"), file("a")], {
        maxEntries: 2,
        maxFileBytes: 2,
        maxTotalBytes: 2,
      }),
    ).toThrow(/case-fold/);
    expect(() => resolveSourcePath(index, "missing.png")).toThrow(/缺失/);
    expect(() =>
      resolveSourcePath(
        [
          { path: "A.png", file: file("A.png") },
          { path: "a.png", file: file("a.png") },
        ],
        "a.PnG",
      ),
    ).toThrow(/歧义/);
    expect(() =>
      createBoundedSourceIndex([file("a"), file("b"), file("c")], {
        maxEntries: 2,
        maxFileBytes: 2,
        maxTotalBytes: 4,
      }),
    ).toThrow(/entry/);
    expect(() =>
      createBoundedSourceIndex([{ ...file("bad"), size: -1 }], {
        maxEntries: 1,
        maxFileBytes: 2,
        maxTotalBytes: 2,
      }),
    ).toThrow(/size/);
    expect(() =>
      createBoundedSourceIndex([file("a"), file("b")], {
        maxEntries: 2,
        maxFileBytes: 2,
        maxTotalBytes: 1,
      }),
    ).toThrow(/总尺寸/);
    expect(() =>
      createBoundedSourceIndex([file("a")], {
        maxEntries: 0,
        maxFileBytes: 2,
        maxTotalBytes: 2,
      }),
    ).toThrow(/正安全整数/);
  });

  it("checks every source limit before reading and clones loaded bytes", async () => {
    const arrayBuffer = vi.fn(async () => new Uint8Array([7]).buffer);
    const loaded = await loadBoundedSourceFiles(
      [{ name: "a.bin", size: 1, arrayBuffer }],
      { maxEntries: 1, maxFileBytes: 1, maxTotalBytes: 1 },
    );
    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(loaded[0]?.bytes).toEqual(new Uint8Array([7]));
    const unread = vi.fn(async () => new Uint8Array(2).buffer);
    await expect(
      loadBoundedSourceFiles(
        [{ name: "too-large.bin", size: 2, arrayBuffer: unread }],
        { maxEntries: 1, maxFileBytes: 1, maxTotalBytes: 1 },
      ),
    ).rejects.toThrow(/单文件/);
    expect(unread).not.toHaveBeenCalled();
    await expect(
      loadBoundedSourceFiles(
        [
          {
            name: "drift.bin",
            size: 1,
            async arrayBuffer() {
              return new Uint8Array([1, 2]).buffer;
            },
          },
        ],
        { maxEntries: 1, maxFileBytes: 2, maxTotalBytes: 2 },
      ),
    ).rejects.toThrow(/预检不一致/);
  });
});
