import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { upgradeSceneLayoutManifestToLatest } from "@slotclientengine/rendercore/scene-layout/data";
import {
  optimizeLayoutAudio,
  parseAudioProbeJson,
} from "../src/audio-optimizer.js";
import type {
  AssetOptimizationResult,
  AudioProbeResult,
  AudioToolRunner,
  ValidatedLayoutPackage,
} from "../src/types.js";
import { layoutFixture } from "./fixtures.js";

const stereoPcm: AudioProbeResult = {
  codecName: "pcm_s16le",
  profile: null,
  channels: 2,
  sampleRate: 48_000,
  bitRate: 1_536_000,
};
const monoPcm: AudioProbeResult = {
  ...stereoPcm,
  channels: 1,
  bitRate: 768_000,
};

describe("AAC audio optimizer", () => {
  it("uses BGM/effect bitrates, preserves channels and rewrites to M4A", async () => {
    const manifest = audioManifest([
      { key: "base.wav", role: "music" },
      { key: "coin.wav", role: "effect" },
    ]);
    const source = sourcePackage(manifest, {
      "base.wav": { bytes: new Uint8Array([1]), mediaType: "audio/wav" },
      "coin.wav": { bytes: new Uint8Array([2]), mediaType: "audio/wav" },
    });
    const fake = runner((label) =>
      label.endsWith("base.m4a")
        ? aac(stereoPcm)
        : label.endsWith("coin.m4a")
          ? aac(monoPcm)
          : label.includes("base")
            ? stereoPcm
            : monoPcm,
    );
    const result = await optimizeLayoutAudio({
      source,
      optimization: optimization(source),
      audio: options(),
      runner: fake,
    });

    expect(result.keyMapping.get("base.wav")).toBe("base.m4a");
    expect(result.keyMapping.get("coin.wav")).toBe("coin.m4a");
    expect(result.assets.get("base.m4a")?.mediaType).toBe("audio/mp4");
    expect(result.assets.get("coin.m4a")?.mediaType).toBe("audio/mp4");
    expect(result.convertedAudioCount).toBe(2);
    expect(fake.encode.mock.calls.map(([call]) => call.bitrateKbps)).toEqual([
      128, 64,
    ]);
  });

  it("optimizes a program-only audio runtime resource as an effect", async () => {
    const base = audioManifest([]);
    const manifest = {
      ...base,
      runtimeResources: {
        jingle: {
          kind: "audio" as const,
          path: "jingle.wav",
          mediaType: "audio/wav" as const,
        },
      },
    };
    const source = sourcePackage(manifest, {
      "jingle.wav": { bytes: new Uint8Array([1]), mediaType: "audio/wav" },
    });
    const fake = runner((label) =>
      label.endsWith("jingle.m4a") ? aac(monoPcm) : monoPcm,
    );
    const result = await optimizeLayoutAudio({
      source,
      optimization: optimization(source),
      audio: options(),
      runner: fake,
    });

    expect(result.keyMapping.get("jingle.wav")).toBe("jingle.m4a");
    expect(result.convertedAudioCount).toBe(1);
    expect(fake.encode).toHaveBeenCalledWith(
      expect.objectContaining({ bitrateKbps: 64 }),
    );
  });

  it("keeps compliant low-bitrate AAC-LC M4A without re-encoding", async () => {
    const manifest = audioManifest([{ key: "base.m4a", role: "music" }]);
    const source = sourcePackage(manifest, {
      "base.m4a": { bytes: fakeM4a(7), mediaType: "audio/mp4" },
    });
    const fake = runner(() => ({
      ...aac(stereoPcm),
      bitRate: 134_000,
    }));
    const result = await optimizeLayoutAudio({
      source,
      optimization: optimization(source),
      audio: options(),
      runner: fake,
    });

    expect(result.assets.get("base.m4a")?.converted).toBe(false);
    expect(result.convertedAudioCount).toBe(0);
    expect(fake.encode).not.toHaveBeenCalled();
  });

  it("rejects target collisions and changed output channels", async () => {
    const manifest = audioManifest([
      { key: "coin.wav", role: "effect" },
      { key: "coin.mp3", role: "effect" },
    ]);
    const source = sourcePackage(manifest, {
      "coin.wav": { bytes: new Uint8Array([1]), mediaType: "audio/wav" },
      "coin.mp3": { bytes: new Uint8Array([2]), mediaType: "audio/mpeg" },
    });
    await expect(
      optimizeLayoutAudio({
        source,
        optimization: optimization(source),
        audio: options(),
        runner: runner(() => monoPcm),
      }),
    ).rejects.toThrow(/collision/);

    const one = sourcePackage(
      audioManifest([{ key: "coin.wav", role: "effect" }]),
      { "coin.wav": { bytes: new Uint8Array([1]), mediaType: "audio/wav" } },
    );
    let probes = 0;
    await expect(
      optimizeLayoutAudio({
        source: one,
        optimization: optimization(one),
        audio: options(),
        runner: runner(() => {
          probes += 1;
          return probes === 1 ? monoPcm : aac(stereoPcm);
        }),
      }),
    ).rejects.toThrow(/声道数/);
  });

  it("rejects multi-source fallback bindings that cannot remain unique AAC", async () => {
    const base = audioManifest([{ key: "base.wav", role: "music" }]);
    const manifest = {
      ...base,
      audio: {
        ...base.audio,
        music: [
          {
            ...base.audio.music[0]!,
            asset: {
              sources: [
                { path: "base.wav", mediaType: "audio/wav" as const },
                { path: "base.ogg", mediaType: "audio/ogg" as const },
              ],
            },
          },
        ],
      },
    };
    const source = sourcePackage(manifest, {
      "base.wav": { bytes: new Uint8Array([1]), mediaType: "audio/wav" },
      "base.ogg": { bytes: new Uint8Array([2]), mediaType: "audio/ogg" },
    });
    await expect(
      optimizeLayoutAudio({
        source,
        optimization: optimization(source),
        audio: options(),
        runner: runner(() => stereoPcm),
      }),
    ).rejects.toThrow(/恰好一个 source/);
  });

  it("parses exactly one audio stream while allowing an attached cover", () => {
    expect(
      parseAudioProbeJson(
        JSON.stringify({
          streams: [
            {
              codec_type: "audio",
              codec_name: "aac",
              profile: "LC",
              channels: 2,
              sample_rate: "48000",
            },
            {
              codec_type: "video",
              codec_name: "mjpeg",
              disposition: { attached_pic: 1 },
            },
          ],
          format: { format_name: "mov,mp4,m4a", bit_rate: "96000" },
        }),
        "base.m4a",
      ),
    ).toMatchObject({ codecName: "aac", channels: 2, bitRate: 96_000 });
    expect(() =>
      parseAudioProbeJson(
        JSON.stringify({
          streams: [
            {
              codec_type: "audio",
              codec_name: "aac",
              profile: "LC",
              channels: 2,
              sample_rate: "48000",
            },
            {
              codec_type: "audio",
              codec_name: "aac",
              profile: "LC",
              channels: 2,
              sample_rate: "48000",
            },
          ],
          format: {},
        }),
        "bad.mp4",
      ),
    ).toThrow(/恰好/);
    expect(() =>
      parseAudioProbeJson(
        JSON.stringify({
          streams: [{ codec_type: "video", codec_name: "mjpeg" }],
          format: {},
        }),
        "silent.mp4",
      ),
    ).toThrow(/恰好/);
  });
});

function audioManifest(
  entries: readonly {
    readonly key: string;
    readonly role: "music" | "effect";
  }[],
) {
  const latest = upgradeSceneLayoutManifestToLatest(layoutFixture());
  return {
    ...latest,
    audio: {
      version: 1 as const,
      music: entries
        .filter(({ role }) => role === "music")
        .map(({ key }, index) => ({
          name: `music-${index}`,
          asset: { sources: [{ path: key, mediaType: mediaType(key) }] },
          loop: true as const,
          fadeOutSeconds: 1,
          fadeInSeconds: 1,
        })),
      effects: entries
        .filter(({ role }) => role === "effect")
        .map(({ key }, index) => ({
          name: `effect-${index}`,
          asset: { sources: [{ path: key, mediaType: mediaType(key) }] },
          playback: "once" as const,
          offsetSeconds: 0,
          voices: { maxConcurrent: 1, overflow: "restart-oldest" as const },
          bgm: { kind: "keep" as const },
        })),
      programmaticEffects: entries
        .filter(({ role }) => role === "effect")
        .map((_, index) => `effect-${index}`),
    },
  };
}

function sourcePackage(
  manifest: ReturnType<typeof audioManifest>,
  entries: Readonly<
    Record<string, { readonly bytes: Uint8Array; readonly mediaType: string }>
  >,
): ValidatedLayoutPackage {
  const sourceEntries = new Map(
    Object.entries(entries).map(([key, entry]) => [
      key,
      {
        path: `assets/${key}`,
        sha256: key,
        byteLength: entry.bytes.byteLength,
        mediaType: entry.mediaType,
        bytes: entry.bytes,
      },
    ]),
  );
  return {
    zipBytes: new Uint8Array(),
    manifest,
    assetsMap: { version: 1, kind: "editor-assets", files: {} },
    files: new Map(
      [...sourceEntries].map(([key, entry]) => [key, entry.bytes]),
    ),
    sourceEntries,
  };
}

function optimization(source: ValidatedLayoutPackage): AssetOptimizationResult {
  return {
    keyMapping: new Map(
      [...source.sourceEntries.keys()].map((key) => [key, key]),
    ),
    assets: new Map(
      [...source.sourceEntries].map(([key, entry]) => [
        key,
        {
          key,
          sourceKey: key,
          bytes: entry.bytes,
          sourceByteLength: entry.byteLength,
          converted: false,
          mediaType: entry.mediaType,
        },
      ]),
    ),
  };
}

function runner(probe: (label: string) => AudioProbeResult): AudioToolRunner & {
  readonly encode: ReturnType<typeof vi.fn>;
} {
  return {
    ffmpegVersion: vi.fn(async () => "fixture-ffmpeg 1"),
    ffprobeVersion: vi.fn(async () => "fixture-ffprobe 1"),
    probe: vi.fn(async ({ label }) => probe(label)),
    encode: vi.fn(async ({ outputPath, bitrateKbps }) => {
      await writeFile(outputPath, fakeM4a(bitrateKbps));
    }),
  };
}

function options() {
  return {
    ffmpegExecutable: "ffmpeg",
    ffprobeExecutable: "ffprobe",
    bgmBitrateKbps: 128,
    effectMonoBitrateKbps: 64,
    effectStereoBitrateKbps: 96,
  } as const;
}

function aac(source: AudioProbeResult): AudioProbeResult {
  return { ...source, codecName: "aac", profile: "LC", bitRate: 96_000 };
}

function fakeM4a(seed: number): Uint8Array {
  return new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, seed, 0, 0, 0]);
}

function mediaType(key: string) {
  if (key.endsWith(".wav")) return "audio/wav" as const;
  if (key.endsWith(".mp3")) return "audio/mpeg" as const;
  if (key.endsWith(".ogg")) return "audio/ogg" as const;
  return "audio/mp4" as const;
}
