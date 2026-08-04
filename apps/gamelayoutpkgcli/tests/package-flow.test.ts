import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { optimizeLayoutPackageFile, resolveCliOptions } from "../src/cli.js";
import { parseSceneLayoutAssetGroups } from "../src/asset-groups.js";
import { validateLayoutPackageBytes } from "../src/package-reader.js";
import type { CwebpRunner } from "../src/types.js";
import {
  createMappedLayoutZip,
  fakeWebp,
  layoutFixture,
  logicalFixtureFiles,
} from "./fixtures.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("optimized package flow", () => {
  it("writes a verified WebP package and external initial/delta groups", async () => {
    const root = await makeRoot();
    const input = join(root, "layout.zip");
    const baseManifest = layoutFixture();
    await writeFile(
      input,
      await createMappedLayoutZip({
        manifest: {
          ...baseManifest,
          nodes: baseManifest.nodes.map((node, index) =>
            index === 0
              ? {
                  ...node,
                  placements: {
                    default: {
                      x: 0,
                      y: 0,
                      scale: 1,
                      rotation: -90,
                      center: { x: 0.25, y: 0.75 },
                    },
                  },
                }
              : node,
          ),
          runtimeResources: {
            "nearwin.image": {
              kind: "image",
              path: "nearwin.png",
              size: { width: 1, height: 1 },
            },
          },
        },
        logicalFiles: new Map([
          ...logicalFixtureFiles(),
          ["nearwin.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])],
        ]),
      }),
    );
    const fake = fakeRunner();
    const options = resolveCliOptions({
      inputPath: input,
      quality: 80,
      cwebpExecutable: "/tool path/cwebp",
    });
    const result = await optimizeLayoutPackageFile(options, fake);
    expect(result.convertedImageCount).toBe(3);
    const outputBytes = new Uint8Array(await readFile(result.outputPath));
    const validated = await validateLayoutPackageBytes(outputBytes);
    expect(validated.manifest.nodes[0]?.placements.default).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotation: -90,
      center: { x: 0.25, y: 0.75 },
    });
    expect(validated.files.has("alpha.webp")).toBe(true);
    expect(validated.files.has("beta.webp")).toBe(true);
    expect(validated.files.has("alpha.png")).toBe(false);
    const groups = parseSceneLayoutAssetGroups(
      JSON.parse(await readFile(result.assetsJsonPath, "utf8")),
    );
    expect(groups.initialMode).toBe("Alpha");
    expect(groups.initialAssets).toEqual([
      "alpha-to-beta.mp4",
      "alpha.webp",
      "shared.webp",
    ]);
    expect(
      groups.groups.find((group) => group.id === "shared")?.requiredAssets,
    ).toEqual(["shared.webp"]);
    expect(
      groups.groups.find(
        (group) => group.id === "runtime-resource:nearwin.image",
      ),
    ).toMatchObject({
      kind: "runtime-resource",
      resourceKey: "nearwin.image",
      resourceKind: "image",
      requiredAssets: ["nearwin.webp"],
      incrementalAssets: ["nearwin.webp"],
    });
    expect(
      groups.groups.find((group) => group.id === "mode:Beta")
        ?.incrementalAssets,
    ).toEqual(["beta.webp"]);
    expect(
      groups.groups.find((group) => group.id === "transition:Beta->Alpha")
        ?.incrementalAssets,
    ).toEqual(["beta-to-alpha.mp4"]);
    expect(fake.encode).toHaveBeenCalledTimes(3);
    const entries = extractBoundedZip(outputBytes, {
      limits: {
        maxEntries: 32,
        maxCompressedBytes: 1024 * 1024,
        maxFileBytes: 1024 * 1024,
        maxTotalBytes: 1024 * 1024,
      },
    });
    expect([...entries.keys()].some((path) => path.endsWith(".png"))).toBe(
      false,
    );
    expect([...entries.keys()].some((path) => path.includes("groups"))).toBe(
      false,
    );
  });

  it("is deterministic and refuses to overwrite either output", async () => {
    const root = await makeRoot();
    const input = join(root, "layout.zip");
    const zip = await createMappedLayoutZip();
    await writeFile(input, zip);
    const first = resolveCliOptions({
      inputPath: input,
      outputPath: join(root, "one.zip"),
      assetsJsonPath: join(root, "one.json"),
      quality: 80,
      cwebpExecutable: "cwebp",
    });
    const second = resolveCliOptions({
      inputPath: input,
      outputPath: join(root, "two.zip"),
      assetsJsonPath: join(root, "two.json"),
      quality: 80,
      cwebpExecutable: "cwebp",
    });
    await optimizeLayoutPackageFile(first, fakeRunner());
    await optimizeLayoutPackageFile(second, fakeRunner());
    expect(await readFile(first.outputPath)).toEqual(
      await readFile(second.outputPath),
    );
    expect(await readFile(first.assetsJsonPath)).toEqual(
      await readFile(second.assetsJsonPath),
    );
    await expect(
      optimizeLayoutPackageFile(first, fakeRunner()),
    ).rejects.toThrow(/拒绝覆盖/);
  });

  it("rejects a tampered assets map before optimization", async () => {
    const zip = await createMappedLayoutZip({
      mutateMap: (map) => ({
        ...map,
        files: {
          ...map.files,
          "alpha.png": {
            ...map.files["alpha.png"]!,
            byteLength: 999,
          },
        },
      }),
    });
    await expect(validateLayoutPackageBytes(zip)).rejects.toThrow(/byteLength/);
  });
});

function fakeRunner(): CwebpRunner & {
  readonly encode: ReturnType<typeof vi.fn>;
} {
  let seed = 1;
  return {
    version: vi.fn(async () => "fixture-cwebp 1"),
    encode: vi.fn(async ({ outputPath }: { outputPath: string }) => {
      await writeFile(outputPath, fakeWebp(seed));
      seed += 1;
    }),
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "gamelayoutpkg-test-"));
  roots.push(root);
  return root;
}
