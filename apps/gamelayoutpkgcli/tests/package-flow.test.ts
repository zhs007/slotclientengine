import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import { upgradeSceneLayoutManifestToLatest } from "@slotclientengine/rendercore/scene-layout/data";
import { afterEach, describe, expect, it, vi } from "vitest";
import { optimizeLayoutPackageFile, resolveCliOptions } from "../src/cli.js";
import { parseSceneLayoutAssetGroups } from "../src/asset-groups.js";
import { validateLayoutPackageBytes } from "../src/package-reader.js";
import type { AudioToolRunner, CwebpRunner } from "../src/types.js";
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
  it("transcodes typed root audio to AAC-LC M4A and emits v2 metadata", async () => {
    const root = await makeRoot();
    const input = join(root, "layout-audio.zip");
    const latest = upgradeSceneLayoutManifestToLatest(layoutFixture());
    const manifest = {
      ...latest,
      audio: {
        version: 1 as const,
        music: [
          {
            name: "base",
            asset: {
              sources: [{ path: "base.wav", mediaType: "audio/wav" as const }],
            },
            loop: true as const,
            fadeOutSeconds: 1,
            fadeInSeconds: 1,
          },
        ],
        effects: [
          {
            name: "click",
            asset: {
              sources: [{ path: "click.wav", mediaType: "audio/wav" as const }],
            },
            playback: "once" as const,
            offsetSeconds: 0,
            voices: { maxConcurrent: 1, overflow: "restart-oldest" as const },
            bgm: { kind: "keep" as const },
          },
        ],
        programmaticEffects: ["click"],
      },
      eventAudio: {
        version: 1 as const,
        ignoreLegacyAudio: false,
        bindings: [
          {
            event: "gamelayout:/mode/Alpha/state/stable/entered" as const,
            audio: {
              name: "event-alert",
              asset: {
                sources: [
                  { path: "alert.wav", mediaType: "audio/wav" as const },
                ],
              },
              category: "effect" as const,
              playback: "once" as const,
              voices: { maxConcurrent: 1, overflow: "restart-oldest" as const },
              focus: { bgm: { targetGain: 0.5 } },
            },
          },
        ],
      },
      gameModes: {
        ...latest.gameModes,
        modes: latest.gameModes!.modes.map((mode) =>
          mode.id === latest.gameModes!.initialMode
            ? { ...mode, bgm: "base" }
            : mode,
        ),
      },
    };
    await writeFile(
      input,
      await createMappedLayoutZip({
        manifest,
        logicalFiles: new Map([
          ...logicalFixtureFiles(),
          ["base.wav", new Uint8Array([1, 2, 3])],
          ["click.wav", new Uint8Array([4, 5])],
          ["alert.wav", new Uint8Array([6, 7])],
        ]),
      }),
    );
    const options = resolveCliOptions({
      inputPath: input,
      quality: 80,
      cwebpExecutable: "cwebp",
    });
    const result = await optimizeLayoutPackageFile(
      options,
      fakeRunner(),
      fakeAudioRunner(),
    );
    expect(result.convertedAudioCount).toBe(3);
    const validated = await validateLayoutPackageBytes(
      new Uint8Array(await readFile(result.outputPath)),
    );
    expect(validated.files.has("base.m4a")).toBe(true);
    expect(validated.files.has("click.m4a")).toBe(true);
    expect(validated.files.has("base.wav")).toBe(false);
    if (validated.manifest.version !== 5)
      throw new Error("Expected Scene Layout v5.");
    expect(validated.manifest.audio.music[0]?.asset.sources).toEqual([
      { path: "base.m4a", mediaType: "audio/mp4" },
    ]);
    expect(validated.manifest.audio.effects[0]?.asset.sources).toEqual([
      { path: "click.m4a", mediaType: "audio/mp4" },
    ]);
    expect(
      validated.manifest.eventAudio.bindings[0]?.audio.asset.sources,
    ).toEqual([{ path: "alert.m4a", mediaType: "audio/mp4" }]);
    const groups = parseSceneLayoutAssetGroups(
      JSON.parse(await readFile(result.assetsJsonPath, "utf8")),
    );
    expect(groups.version).toBe(2);
    if (groups.version !== 2) throw new Error("Expected asset groups v2.");
    expect(groups.optimization).toMatchObject({
      audioCodec: "aac-lc",
      audioContainer: "m4a",
      convertedAudioCount: 3,
      bgmBitrateKbps: 128,
      effectMonoBitrateKbps: 64,
      effectStereoBitrateKbps: 96,
    });
    expect(
      groups.groups.find((group) => group.id === "audio:scene-layout"),
    ).toMatchObject({
      requiredAssets: ["alert.m4a", "base.m4a", "click.m4a"],
      incrementalAssets: ["alert.m4a", "base.m4a", "click.m4a"],
    });
    expect(groups.initialAssets).not.toContain("base.m4a");
  });

  it("writes a verified WebP package and external initial/delta groups", async () => {
    const root = await makeRoot();
    const input = join(root, "layout.zip");
    const baseManifest = layoutFixture();
    const spinConfigBytes = new TextEncoder().encode(
      '{"kind":"popup","path":"nearwin.png","reels":[["A","B"]]}\n',
    );
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
            "spin.config": {
              kind: "json",
              path: "spin-config.json",
            },
          },
        },
        logicalFiles: new Map([
          ...logicalFixtureFiles(),
          ["nearwin.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])],
          ["spin-config.json", spinConfigBytes],
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
    expect(validated.files.get("spin-config.json")).toStrictEqual(
      spinConfigBytes,
    );
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
      groups.groups.find(
        (group) => group.id === "runtime-resource:spin.config",
      ),
    ).toMatchObject({
      kind: "runtime-resource",
      resourceKey: "spin.config",
      resourceKind: "json",
      requiredAssets: ["spin-config.json"],
      incrementalAssets: ["spin-config.json"],
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

function fakeAudioRunner(): AudioToolRunner {
  return {
    ffmpegVersion: vi.fn(async () => "fixture-ffmpeg 1"),
    ffprobeVersion: vi.fn(async () => "fixture-ffprobe 1"),
    probe: vi.fn(async ({ label }) => ({
      codecName: label.endsWith(".m4a") ? "aac" : "pcm_s16le",
      profile: label.endsWith(".m4a") ? "LC" : null,
      channels: label.startsWith("click") ? 1 : 2,
      sampleRate: 48_000,
      bitRate: label.endsWith(".m4a") ? 96_000 : 768_000,
    })),
    encode: vi.fn(async ({ outputPath, bitrateKbps }) => {
      await writeFile(
        outputPath,
        new Uint8Array([
          0,
          0,
          0,
          16,
          0x66,
          0x74,
          0x79,
          0x70,
          bitrateKbps,
          0,
          0,
          0,
        ]),
      );
    }),
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "gamelayoutpkg-test-"));
  roots.push(root);
  return root;
}
