import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  assertUniqueEditorAssetKeys,
  canonicalExtensionOfEditorAssetKey,
} from "@slotclientengine/editorresource";
import {
  collectPackageAudioAssetRoles,
  type PackageAudioAssetRole,
} from "./audio-assets.js";
import type {
  AssetOptimizationResult,
  AudioOptimizationOptions,
  AudioOptimizationResult,
  AudioProbeResult,
  AudioToolRunner,
  OptimizedLogicalAsset,
  ValidatedLayoutPackage,
} from "./types.js";

const execFileAsync = promisify(execFile);

export const nodeAudioToolRunner: AudioToolRunner = Object.freeze({
  ffmpegVersion(executable: string) {
    return readToolVersion(executable, "ffmpeg");
  },
  ffprobeVersion(executable: string) {
    return readToolVersion(executable, "ffprobe");
  },
  async probe(options: Parameters<AudioToolRunner["probe"]>[0]) {
    try {
      const result = await execFileAsync(
        options.executable,
        [
          "-v",
          "error",
          "-show_entries",
          "format=format_name,bit_rate:stream=index,codec_type,codec_name,profile,channels,sample_rate,bit_rate",
          "-of",
          "json",
          options.inputPath,
        ],
        {
          encoding: "utf8",
          timeout: 60_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      return parseAudioProbeJson(result.stdout, options.label);
    } catch (error) {
      throw new Error(
        `ffprobe 检查失败 ${options.label}：${formatError(error)}`,
      );
    }
  },
  async encode(options: Parameters<AudioToolRunner["encode"]>[0]) {
    try {
      await execFileAsync(
        options.executable,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          options.inputPath,
          "-map",
          "0:a:0",
          "-vn",
          "-sn",
          "-dn",
          "-map_metadata",
          "-1",
          "-c:a",
          "aac",
          "-profile:a",
          "aac_low",
          "-b:a",
          `${options.bitrateKbps}k`,
          "-movflags",
          "+faststart",
          "-f",
          "ipod",
          options.outputPath,
        ],
        { timeout: 600_000, maxBuffer: 8 * 1024 * 1024 },
      );
    } catch (error) {
      throw new Error(
        `FFmpeg AAC 编码失败 ${basename(options.inputPath)}：${formatError(error)}`,
      );
    }
  },
});

export async function optimizeLayoutAudio(options: {
  readonly source: ValidatedLayoutPackage;
  readonly optimization: AssetOptimizationResult;
  readonly audio: AudioOptimizationOptions;
  readonly runner?: AudioToolRunner;
}): Promise<AudioOptimizationResult> {
  const roles = collectPackageAudioAssetRoles(
    options.source.manifest,
    options.source.files,
  );
  if (roles.size === 0)
    return Object.freeze({
      keyMapping: new Map(options.optimization.keyMapping),
      assets: new Map(options.optimization.assets),
      ffmpegVersion: null,
      ffprobeVersion: null,
      convertedAudioCount: 0,
      inputAudioBytes: 0,
      outputAudioBytes: 0,
    });

  const runner = options.runner ?? nodeAudioToolRunner;
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    runner.ffmpegVersion(options.audio.ffmpegExecutable),
    runner.ffprobeVersion(options.audio.ffprobeExecutable),
  ]);
  const targetKeys = [...options.optimization.assets.values()].map((asset) =>
    roles.has(asset.sourceKey) ? replaceWithM4aExtension(asset.key) : asset.key,
  );
  assertUniqueEditorAssetKeys(targetKeys);

  const keyMapping = new Map(options.optimization.keyMapping);
  const assets = new Map<string, OptimizedLogicalAsset>();
  const probeCache = new Map<string, AudioProbeResult>();
  const encodeCache = new Map<
    string,
    { readonly bytes: Uint8Array; readonly probe: AudioProbeResult }
  >();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gamelayoutpkg-aac-"));
  let convertedAudioCount = 0;
  let inputAudioBytes = 0;
  let outputAudioBytes = 0;
  let fileIndex = 0;
  try {
    for (const asset of options.optimization.assets.values()) {
      const descriptor = roles.get(asset.sourceKey);
      if (!descriptor) {
        assets.set(asset.key, asset);
        continue;
      }
      const sourceEntry = options.source.sourceEntries.get(asset.sourceKey);
      if (!sourceEntry)
        throw new Error(`音频 assets map entry 缺失：${asset.sourceKey}`);
      if (sourceEntry.mediaType !== descriptor.mediaType)
        throw new Error(
          `音频 manifest/assets map mediaType 不一致：${asset.sourceKey} (${descriptor.mediaType} / ${sourceEntry.mediaType})`,
        );
      inputAudioBytes += asset.bytes.byteLength;
      const extension = canonicalExtensionOfEditorAssetKey(asset.sourceKey);
      const inputPath = join(temporaryRoot, `input-${fileIndex}.${extension}`);
      fileIndex += 1;
      await writeFile(inputPath, asset.bytes);
      let sourceProbe = probeCache.get(sourceEntry.sha256);
      if (!sourceProbe) {
        sourceProbe = await runner.probe({
          executable: options.audio.ffprobeExecutable,
          inputPath,
          label: asset.sourceKey,
        });
        probeCache.set(sourceEntry.sha256, sourceProbe);
      }
      const bitrateKbps = targetBitrateKbps(
        descriptor.role,
        sourceProbe.channels,
        options.audio,
      );
      const targetKey = replaceWithM4aExtension(asset.key);
      keyMapping.set(asset.sourceKey, targetKey);

      if (
        isCompliantM4a({
          asset,
          sourceProbe,
          bitrateKbps,
        })
      ) {
        outputAudioBytes += asset.bytes.byteLength;
        assets.set(asset.key, asset);
        continue;
      }

      const cacheKey = `${sourceEntry.sha256}:${bitrateKbps}`;
      let encoded = encodeCache.get(cacheKey);
      if (!encoded) {
        const outputPath = join(temporaryRoot, `output-${fileIndex}.m4a`);
        fileIndex += 1;
        await runner.encode({
          executable: options.audio.ffmpegExecutable,
          inputPath,
          outputPath,
          bitrateKbps,
        });
        const bytes = new Uint8Array(await readFile(outputPath));
        assertM4a(bytes, asset.sourceKey);
        const probe = await runner.probe({
          executable: options.audio.ffprobeExecutable,
          inputPath: outputPath,
          label: targetKey,
        });
        assertEncodedProbe(sourceProbe, probe, targetKey);
        encoded = Object.freeze({ bytes, probe });
        encodeCache.set(cacheKey, encoded);
      }
      convertedAudioCount += 1;
      outputAudioBytes += encoded.bytes.byteLength;
      assets.set(
        targetKey,
        Object.freeze({
          ...asset,
          key: targetKey,
          bytes: encoded.bytes.slice(),
          converted: true,
          mediaType: "audio/mp4",
        }),
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  return Object.freeze({
    keyMapping: new Map(keyMapping),
    assets: new Map(assets),
    ffmpegVersion,
    ffprobeVersion,
    convertedAudioCount,
    inputAudioBytes,
    outputAudioBytes,
  });
}

export function parseAudioProbeJson(
  value: string,
  label: string,
): AudioProbeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`ffprobe JSON 无效 ${label}：${formatError(error)}`);
  }
  const root = record(parsed, `ffprobe ${label}`);
  if (!Array.isArray(root.streams))
    throw new Error(`${label} 必须恰好包含一条音频 stream。`);
  const audioStreams = root.streams
    .map((stream, index) =>
      record(stream, `ffprobe ${label}.streams[${index}]`),
    )
    .filter((stream) => stream.codec_type === "audio");
  if (audioStreams.length !== 1)
    throw new Error(`${label} 必须恰好包含一条音频 stream。`);
  const stream = audioStreams[0]!;
  const codecName = nonEmptyString(stream.codec_name, `${label}.codec_name`);
  const channels = positiveInteger(stream.channels, `${label}.channels`);
  const sampleRate = positiveIntegerString(
    stream.sample_rate,
    `${label}.sample_rate`,
  );
  const format = record(root.format ?? {}, `ffprobe ${label}.format`);
  const bitRate = optionalPositiveIntegerString(
    stream.bit_rate ?? format.bit_rate,
    `${label}.bit_rate`,
  );
  return Object.freeze({
    codecName,
    profile: typeof stream.profile === "string" ? stream.profile : null,
    channels,
    sampleRate,
    bitRate,
  });
}

function isCompliantM4a(options: {
  readonly asset: OptimizedLogicalAsset;
  readonly sourceProbe: AudioProbeResult;
  readonly bitrateKbps: number;
}): boolean {
  return (
    canonicalExtensionOfEditorAssetKey(options.asset.key) === "m4a" &&
    options.asset.mediaType === "audio/mp4" &&
    isAacLc(options.sourceProbe) &&
    options.sourceProbe.bitRate !== null &&
    options.sourceProbe.bitRate <= options.bitrateKbps * 1000 * 1.05
  );
}

function assertEncodedProbe(
  source: AudioProbeResult,
  output: AudioProbeResult,
  key: string,
): void {
  if (!isAacLc(output)) throw new Error(`FFmpeg 输出不是 AAC-LC：${key}`);
  if (output.channels !== source.channels)
    throw new Error(
      `FFmpeg 改变了声道数：${key} (${source.channels} -> ${output.channels})`,
    );
  if (output.sampleRate !== source.sampleRate)
    throw new Error(
      `FFmpeg 改变了采样率：${key} (${source.sampleRate} -> ${output.sampleRate})`,
    );
}

function isAacLc(probe: AudioProbeResult): boolean {
  const profile = probe.profile?.trim().toLowerCase();
  return probe.codecName.toLowerCase() === "aac" && profile === "lc";
}

function targetBitrateKbps(
  role: PackageAudioAssetRole,
  channels: number,
  options: AudioOptimizationOptions,
): number {
  if (role === "music") return options.bgmBitrateKbps;
  return channels === 1
    ? options.effectMonoBitrateKbps
    : options.effectStereoBitrateKbps;
}

function replaceWithM4aExtension(key: string): string {
  return `${key.slice(0, key.lastIndexOf("."))}.m4a`;
}

function assertM4a(bytes: Uint8Array, sourceKey: string): void {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.slice(from, to));
  if (bytes.byteLength < 12 || ascii(4, 8) !== "ftyp")
    throw new Error(`FFmpeg 输出不是合法 M4A/MP4：${sourceKey}`);
}

async function readToolVersion(
  executable: string,
  tool: "ffmpeg" | "ffprobe",
): Promise<string> {
  try {
    const result = await execFileAsync(executable, ["-version"], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    const version = `${result.stdout}${result.stderr}`.trim();
    if (!version) throw new Error("没有返回版本信息。");
    return version.replace(/\r\n?/gu, "\n");
  } catch (error) {
    throw new Error(`${tool} 不可用（${executable}）：${formatError(error)}`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} 必须是 object。`);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} 必须是非空字符串。`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${label} 必须是正安全整数。`);
  return value;
}

function positiveIntegerString(value: unknown, label: string): number {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value))
    throw new Error(`${label} 必须是正整数字符串。`);
  return positiveInteger(Number(value), label);
}

function optionalPositiveIntegerString(
  value: unknown,
  label: string,
): number | null {
  if (value === undefined || value === null || value === "") return null;
  return positiveIntegerString(value, label);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
