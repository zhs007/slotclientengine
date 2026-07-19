import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ObjectUrlRegistry,
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
  });

  it("uses complete SHA-256 content paths", async () => {
    const digest = await sha256Hex(new TextEncoder().encode("abc"));
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(allocateContentAddressedPath({ digest, extension: ".PNG" })).toBe(
      `assets/${digest}.png`,
    );
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
  });
});
